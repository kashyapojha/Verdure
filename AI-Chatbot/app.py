import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import BertTokenizer, BertForSequenceClassification
import torch
import pickle
import mysql.connector
from dotenv import load_dotenv

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
torch.set_num_threads(1)

# --- LOGGING CONFIGURATION ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# --- ENV CONFIGURATION ---
basedir = os.path.abspath(os.path.dirname(__file__))
env_path = os.path.join(basedir, "..", ".env")
load_dotenv(env_path)
logger.info(f"Loading .env from: {env_path}")

app = Flask(__name__)
CORS(app)

# Device setup
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
logger.info(f"Using device: {device}")

# Load BERT chatbot model
model = None
tokenizer = None
label_encoder = None
MODEL_LOADED = False

try:
    logger.info("Loading BERT model and tokenizer...")
    model = BertForSequenceClassification.from_pretrained(
        "bert_model",
        low_cpu_mem_usage=True
    )
    model.to(device)
    model.eval()
    tokenizer = BertTokenizer.from_pretrained("bert_tokenizer")

    with open("label_encoder.pkl", "rb") as f:
        label_encoder = pickle.load(f)
    MODEL_LOADED = True
    logger.info("Model, Tokenizer, and Label Encoder loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load model components: {e}")

# Predict plant ID from user query
def predict(query):
    if not MODEL_LOADED:
        logger.error("Prediction requested but model is not loaded.")
        return None
    try:
        logger.info(f"Predicting for query: '{query}'")
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
        
        logger.info(f"Prediction successful: ID={predicted_id}, Label={original_label}")
        return {"numeric_id": predicted_id, "label": original_label}
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return None

# Fetch plant data from MySQL
def get_plant_data(plant_id):
    try:
        logger.info(f"Connecting to DB to fetch data for: {plant_id}")
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME")
        )
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM plant WHERE plant_id = %s", (plant_id,))
        plant_data = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if plant_data:
            logger.info("Plant data retrieved successfully.")
        else:
            logger.warning(f"No plant data found in DB for ID: {plant_id}")
        return plant_data
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return None

# Chatbot route
@app.route("/chat", methods=["POST"])
def chat():
    client_ip = request.remote_addr
    try:
        data = request.get_json()
        user_query = data.get("message", "").strip()
        logger.info(f"[POST /chat] Request from {client_ip} | Message: '{user_query}'")

        if not user_query:
            logger.warning(f"Empty message received from {client_ip}")
            return jsonify({"error": "No message provided"}), 400

        prediction_result = predict(user_query)
        if not prediction_result:
            logger.error(f"Prediction failed for query: {user_query}")
            status = 503 if not MODEL_LOADED else 422
            return jsonify({
                "error": "Model not loaded" if not MODEL_LOADED else "Could not classify query",
                "response": "Sorry, I could not understand your query."
            }), status

        return jsonify({
            "numeric_id": prediction_result["numeric_id"],
            "label": prediction_result["label"]
        })
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return jsonify({"response": "An error occurred while processing your request."}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "OK" if MODEL_LOADED else "DEGRADED",
        "model_loaded": MODEL_LOADED
    }), 200 if MODEL_LOADED else 503

if __name__ == "__main__":
    port = int(os.getenv("PREDICTOR_PORT", 5000))
    logger.info(f"Starting Flask server on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)