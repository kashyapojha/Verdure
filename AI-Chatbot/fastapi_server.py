from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import BertTokenizer, BertForSequenceClassification
import torch
import pickle
import uvicorn
import os


class PredictRequest(BaseModel):
    message: str


app = FastAPI()


def load_artifacts(model_dir="bert_model", tokenizer_dir="bert_tokenizer", le_path="label_encoder.pkl"):
    # paths are relative to this file's directory
    base = os.path.dirname(__file__)
    model_path = os.path.join(base, model_dir)
    tokenizer_path = os.path.join(base, tokenizer_dir)
    le_file = os.path.join(base, le_path)

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = BertForSequenceClassification.from_pretrained(model_path)
    model.to(device)
    model.eval()

    tokenizer = BertTokenizer.from_pretrained(tokenizer_path)

    with open(le_file, 'rb') as f:
        label_encoder = pickle.load(f)

    return model, tokenizer, label_encoder, device


model, tokenizer, label_encoder, device = load_artifacts()


@app.post("/predict")
def predict(req: PredictRequest):
    text = req.message
    try:
        encoding = tokenizer(
            text,
            add_special_tokens=True,
            max_length=128,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )

        input_ids = encoding['input_ids'].to(device)
        attention_mask = encoding['attention_mask'].to(device)

        with torch.no_grad():
            output = model(input_ids=input_ids, attention_mask=attention_mask)
            _, prediction = torch.max(output.logits, dim=1)

        pred_id = int(prediction.item())
        original_label = label_encoder.inverse_transform([pred_id])[0]

        return {"numeric_id": pred_id, "label": str(original_label)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=3011)
