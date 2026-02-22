import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from transformers import BertTokenizer, BertForSequenceClassification
from torch.utils.data import DataLoader, Dataset
import torch
import numpy as np
import pickle

# ==============================
# 1️⃣ Load Dataset
# ==============================

data = pd.read_csv('final_data.csv')

label_encoder = LabelEncoder()
data['id'] = label_encoder.fit_transform(data['id'])

train_data, test_data = train_test_split(
    data, test_size=0.2, random_state=42
)

# ==============================
# 2️⃣ Tokenizer
# ==============================

tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')

# ==============================
# 3️⃣ Dataset Class
# ==============================

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
            'labels': torch.tensor(label, dtype=torch.long)
        }

# ==============================
# 4️⃣ DataLoader
# ==============================

train_dataset = QueryDataset(
    train_data['user_query'].values,
    train_data['id'].values,
    tokenizer,
    128
)

test_dataset = QueryDataset(
    test_data['user_query'].values,
    test_data['id'].values,
    tokenizer,
    128
)

train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
test_loader = DataLoader(test_dataset, batch_size=16)

# ==============================
# 5️⃣ Model
# ==============================

model = BertForSequenceClassification.from_pretrained(
    'bert-base-uncased',
    num_labels=len(data['id'].unique())
)

device = torch.device('cuda') if torch.cuda.is_available() else torch.device('cpu')
model.to(device)

optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5)

# ==============================
# 6️⃣ Training Function
# ==============================

def train_epoch(model, loader):
    model.train()
    total_loss = 0
    correct = 0

    for batch in loader:
        input_ids = batch['input_ids'].to(device)
        attention_mask = batch['attention_mask'].to(device)
        labels = batch['labels'].to(device)

        outputs = model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            labels=labels
        )

        loss = outputs.loss
        logits = outputs.logits

        _, preds = torch.max(logits, dim=1)

        correct += torch.sum(preds == labels)
        total_loss += loss.item()

        loss.backward()
        optimizer.step()
        optimizer.zero_grad()

    return correct.double() / len(loader.dataset), total_loss / len(loader)

# ==============================
# 7️⃣ Train Model
# ==============================

EPOCHS = 3

for epoch in range(EPOCHS):
    acc, loss = train_epoch(model, train_loader)
    print(f"Epoch {epoch+1}/{EPOCHS}")
    print(f"Loss: {loss}")
    print(f"Accuracy: {acc}")

# ==============================
# 8️⃣ Save Model
# ==============================

model.save_pretrained("bert_model")
tokenizer.save_pretrained("bert_tokenizer")

with open("label_encoder.pkl", "wb") as f:
    pickle.dump(label_encoder, f)

print("Model Saved Successfully ✅")