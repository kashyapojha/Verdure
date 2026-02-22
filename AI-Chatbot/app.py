from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import BertTokenizer, BertForSequenceClassification
import torch
import pickle
import mysql.connector

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Device setup
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# Load BERT chatbot model
model = BertForSequenceClassification.from_pretrained("bert_model")
model.to(device)
model.eval()

# Load tokenizer
tokenizer = BertTokenizer.from_pretrained("bert_tokenizer")

# Load label encoder
with open("label_encoder.pkl", "rb") as f:
    label_encoder = pickle.load(f)

# Predict plant ID from user query
def predict(query):
    try:
        encoding = tokenizer(
            query,
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

        predicted_id = prediction.item()
        original_label = label_encoder.inverse_transform([predicted_id])[0]
        return original_label
    except Exception as e:
        print("Prediction error:", e)
        return None

# Fetch plant data from MySQL
def get_plant_data(plant_id):
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="nbh05@",   # Update with your MySQL password
            database="project"
        )
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM plants WHERE plant_id = %s", (plant_id,))
        plant_data = cursor.fetchone()
        cursor.close()
        conn.close()
        return plant_data
    except Exception as e:
        print("Database connection error:", e)
        return None

# Chatbot route
@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        user_query = data.get("message", "").strip()

        if not user_query:
            return jsonify({"error": "No message provided"}), 400

        # Get predicted plant ID
        predicted_id = predict(user_query)
        if not predicted_id:
            return jsonify({"response": "Sorry, I could not understand your query."})

        # Fetch plant info
        plant_info = get_plant_data(predicted_id)
        if not plant_info:
            return jsonify({"response": "Sorry, plant data not found."})

        return jsonify({"response": plant_info})
    except Exception as e:
        print("Chat error:", e)
        return jsonify({"response": "An error occurred while processing your request."}), 500

# Health check
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "OK"}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)