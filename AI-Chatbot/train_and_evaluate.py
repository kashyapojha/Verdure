import argparse
import json
import os
import pickle

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from torch.utils.data import DataLoader, Dataset
from transformers import BertForSequenceClassification, BertTokenizer


class QueryDataset(Dataset):
    def __init__(self, queries, labels, tokenizer, max_len):
        self.queries = queries
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.queries)

    def __getitem__(self, index):
        query = str(self.queries[index])
        label = self.labels[index]

        encoding = self.tokenizer(
            query,
            add_special_tokens=True,
            max_length=self.max_len,
            padding='max_length',
            truncation=True,
            return_attention_mask=True,
            return_tensors='pt',
        )

        return {
            'input_ids': encoding['input_ids'].flatten(),
            'attention_mask': encoding['attention_mask'].flatten(),
            'labels': torch.tensor(label, dtype=torch.long),
        }


def parse_args():
    parser = argparse.ArgumentParser(description='Train and evaluate the AI chatbot model')
    parser.add_argument('--data-path', default='final_data.csv', help='Path to training dataset')
    parser.add_argument('--model-dir', default='bert_model', help='Directory to save the trained model')
    parser.add_argument('--tokenizer-dir', default='bert_tokenizer', help='Directory to save the tokenizer')
    parser.add_argument('--label-encoder-path', default='label_encoder.pkl', help='Path to save the label encoder')
    parser.add_argument('--epochs', type=int, default=3, help='Number of training epochs')
    parser.add_argument('--batch-size', type=int, default=16, help='Training batch size')
    parser.add_argument('--max-len', type=int, default=128, help='Maximum token length for tokenization')
    parser.add_argument('--min-accuracy', type=float, default=0.0, help='Minimum test accuracy required for pipeline success')
    return parser.parse_args()


def load_dataset(data_path):
    if not os.path.exists(data_path):
        raise FileNotFoundError(f'Could not find dataset at {data_path}')

    data = pd.read_csv(data_path)
    if 'user_query' not in data.columns or 'id' not in data.columns:
        raise ValueError('Dataset must contain user_query and id columns')

    return data


def prepare_data(data, tokenizer, max_len, batch_size):
    data = data.copy()
    label_encoder = LabelEncoder()
    data['label_id'] = label_encoder.fit_transform(data['id'])

    label_counts = data['label_id'].value_counts()
    if label_counts.min() < 2:
        sparse_labels = label_counts[label_counts < 2].index.tolist()
        print(
            'Warning: Some classes have fewer than 2 samples and cannot be stratified.',
            'Falling back to an unstratified train/test split.',
            f'Classes with too few members: {sparse_labels}',
        )
        stratify = None
    else:
        stratify = data['label_id']

    train_data, test_data = train_test_split(
        data, test_size=0.2, random_state=42, stratify=stratify
    )

    train_dataset = QueryDataset(
        train_data['user_query'].values,
        train_data['label_id'].values,
        tokenizer,
        max_len,
    )
    test_dataset = QueryDataset(
        test_data['user_query'].values,
        test_data['label_id'].values,
        tokenizer,
        max_len,
    )

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=batch_size)

    return train_loader, test_loader, label_encoder


def build_model(num_labels):
    return BertForSequenceClassification.from_pretrained(
        'bert-base-uncased', num_labels=num_labels
    )


def get_device():
    return torch.device('cuda' if torch.cuda.is_available() else 'cpu')


def train_epoch(model, loader, optimizer, device):
    model.train()
    total_loss = 0.0
    correct = 0

    for batch in loader:
        input_ids = batch['input_ids'].to(device)
        attention_mask = batch['attention_mask'].to(device)
        labels = batch['labels'].to(device)

        outputs = model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            labels=labels,
        )

        loss = outputs.loss
        logits = outputs.logits

        _, preds = torch.max(logits, dim=1)
        correct += torch.sum(preds == labels)
        total_loss += loss.item()

        loss.backward()
        optimizer.step()
        optimizer.zero_grad()

    accuracy = correct.double() / len(loader.dataset)
    return accuracy.item(), total_loss / len(loader)


def evaluate(model, loader, device):
    model.eval()
    preds = []
    targets = []

    with torch.no_grad():
        for batch in loader:
            input_ids = batch['input_ids'].to(device)
            attention_mask = batch['attention_mask'].to(device)
            labels = batch['labels'].to(device)

            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            _, predictions = torch.max(outputs.logits, dim=1)

            preds.extend(predictions.cpu().numpy().tolist())
            targets.extend(labels.cpu().numpy().tolist())

    accuracy = accuracy_score(targets, preds)
    report = classification_report(targets, preds, output_dict=True, zero_division=0)
    return accuracy, report


def save_artifacts(model, tokenizer, label_encoder, args):
    os.makedirs(args.model_dir, exist_ok=True)
    os.makedirs(args.tokenizer_dir, exist_ok=True)

    model.save_pretrained(args.model_dir)
    tokenizer.save_pretrained(args.tokenizer_dir)

    with open(args.label_encoder_path, 'wb') as f:
        pickle.dump(label_encoder, f)


def save_metrics(metrics, output_path='metrics.json'):
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(metrics, f, indent=2)


if __name__ == '__main__':
    args = parse_args()
    data = load_dataset(args.data_path)

    tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
    train_loader, test_loader, label_encoder = prepare_data(
        data, tokenizer, args.max_len, args.batch_size
    )

    model = build_model(num_labels=len(label_encoder.classes_))
    device = get_device()
    model.to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5)

    print('Starting training...')
    for epoch in range(args.epochs):
        epoch_acc, epoch_loss = train_epoch(model, train_loader, optimizer, device)
        print(f'Epoch {epoch+1}/{args.epochs} - loss: {epoch_loss:.4f} - accuracy: {epoch_acc:.4f}')

    print('Evaluating model on test set...')
    test_accuracy, classification_report_dict = evaluate(model, test_loader, device)
    print(f'Test Accuracy: {test_accuracy:.4f}')

    metrics = {
        'train_epochs': args.epochs,
        'batch_size': args.batch_size,
        'max_len': args.max_len,
        'test_accuracy': test_accuracy,
        'num_labels': len(label_encoder.classes_),
        'classification_report': classification_report_dict,
    }

    save_metrics(metrics, output_path='metrics.json')
    save_artifacts(model, tokenizer, label_encoder, args)

    print('Saved model artifacts and metrics to disk.')

    if test_accuracy < args.min_accuracy:
        raise SystemExit(f'Model accuracy {test_accuracy:.4f} is below the threshold ({args.min_accuracy})')

    print('Training and evaluation completed successfully.')
