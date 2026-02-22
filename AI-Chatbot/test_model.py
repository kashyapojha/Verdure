import argparse
import torch
from transformers import BertTokenizer, BertForSequenceClassification
import pickle


def load_artifacts(model_dir="bert_model", tokenizer_dir="bert_tokenizer", le_path="label_encoder.pkl"):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = BertForSequenceClassification.from_pretrained(model_dir)
    model.to(device)
    model.eval()

    tokenizer = BertTokenizer.from_pretrained(tokenizer_dir)

    with open(le_path, "rb") as f:
        label_encoder = pickle.load(f)

    return model, tokenizer, label_encoder, device


def predict(text, model, tokenizer, label_encoder, device, max_len=128):
    encoding = tokenizer(
        text,
        add_special_tokens=True,
        max_length=max_len,
        padding='max_length',
        truncation=True,
        return_tensors='pt'
    )

    input_ids = encoding['input_ids'].to(device)
    attention_mask = encoding['attention_mask'].to(device)

    with torch.no_grad():
        output = model(input_ids=input_ids, attention_mask=attention_mask)
        _, prediction = torch.max(output.logits, dim=1)

    pred_id = prediction.item()
    try:
        original_label = label_encoder.inverse_transform([pred_id])[0]
    except Exception:
        original_label = str(pred_id)

    return pred_id, original_label


def main():
    parser = argparse.ArgumentParser(description="Test saved BERT chatbot model")
    parser.add_argument("--text", "-t", required=True, help="Input text to classify")
    args = parser.parse_args()

    model, tokenizer, label_encoder, device = load_artifacts()

    pid, label = predict(args.text, model, tokenizer, label_encoder, device)
    print("Predicted numeric id:", pid)
    print("Predicted original label:", label)


if __name__ == "__main__":
    main()
