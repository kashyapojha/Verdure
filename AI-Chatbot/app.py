import os
import logging
import threading
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import BertForSequenceClassification, PreTrainedTokenizerFast
import torch
import pickle
import mysql.connector
from dotenv import load_dotenv

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
torch.set_num_threads(1)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

basedir = os.path.abspath(os.path.dirname(__file__))
MODEL_DIR = os.path.join(basedir, "bert_model")
TOKENIZER_DIR = os.path.join(basedir, "bert_tokenizer")
LABEL_ENCODER_PATH = os.path.join(basedir, "label_encoder.pkl")
MODEL_WEIGHTS_PATH = os.path.join(MODEL_DIR, "model.safetensors")
TOKENIZER_JSON_PATH = os.path.join(TOKENIZER_DIR, "tokenizer.json")

env_path = os.path.join(basedir, "..", ".env")
load_dotenv(env_path)
logger.info(f"Loading .env from: {env_path}")

app = Flask(__name__)
CORS(app)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
logger.info(f"Using device: {device}")

model = None
tokenizer = None
label_encoder = None
MODEL_LOADED = False
MODEL_LOADING = False
MODEL_LOAD_ERROR = None


def validate_artifacts():
    """Ensure model/tokenizer files exist before loading (avoids cryptic stat(None) errors)."""
    missing = [p for p in [MODEL_DIR, TOKENIZER_DIR, LABEL_ENCODER_PATH] if not os.path.exists(p)]
    if missing:
        raise FileNotFoundError(f"Missing artifact paths: {', '.join(missing)}")

    if not os.path.isfile(MODEL_WEIGHTS_PATH):
        raise FileNotFoundError(f"Missing model weights: {MODEL_WEIGHTS_PATH}")

    weights_size = os.path.getsize(MODEL_WEIGHTS_PATH)
    if weights_size < 100_000_000:
        raise ValueError(
            f"model.safetensors is only {weights_size} bytes — "
            "Git LFS file was likely not pulled in the Docker image"
        )

    if not os.path.isfile(TOKENIZER_JSON_PATH):
        raise FileNotFoundError(
            f"Missing {TOKENIZER_JSON_PATH} — bert_tokenizer needs tokenizer.json "
            "(vocab.txt alone is not shipped in this repo)"
        )


def load_model():
    global model, tokenizer, label_encoder, MODEL_LOADED, MODEL_LOADING, MODEL_LOAD_ERROR
    if MODEL_LOADING or MODEL_LOADED:
        return
    MODEL_LOADING = True
    MODEL_LOAD_ERROR = None
    try:
        validate_artifacts()
        logger.info("Loading BERT model from %s", MODEL_DIR)
        loaded_model = BertForSequenceClassification.from_pretrained(
            MODEL_DIR,
            local_files_only=True,
            low_cpu_mem_usage=True
        )
        loaded_model.to(device)
        loaded_model.eval()

        logger.info("Loading tokenizer from %s", TOKENIZER_DIR)
        loaded_tokenizer = PreTrainedTokenizerFast.from_pretrained(
            TOKENIZER_DIR,
            local_files_only=True
        )

        with open(LABEL_ENCODER_PATH, "rb") as f:
            loaded_label_encoder = pickle.load(f)

        model = loaded_model
        tokenizer = loaded_tokenizer
        label_encoder = loaded_label_encoder
        MODEL_LOADED = True
        logger.info("Model, tokenizer, and label encoder loaded successfully.")
    except Exception as e:
        MODEL_LOAD_ERROR = str(e)
        logger.error(f"Failed to load model components: {e}")
    finally:
        MODEL_LOADING = False


def start_model_loader():
    thread = threading.Thread(target=load_model, daemon=True, name="model-loader")
    thread.start()
    return thread


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


@app.route("/chat", methods=["POST"])
def chat():
    client_ip = request.remote_addr
    try:
        data = request.get_json()
        user_query = data.get("message", "").strip()
        logger.info(f"[POST /chat] Request from {client_ip} | Message: '{user_query}'")

        if not user_query:
            return jsonify({"error": "No message provided"}), 400

        if MODEL_LOADING:
            return jsonify({
                "error": "Model is still loading",
                "response": "AI service is starting up. Please try again in a minute."
            }), 503

        if not MODEL_LOADED and not MODEL_LOADING:
            load_model()

        prediction_result = predict(user_query)
        if not prediction_result:
            status = 503 if not MODEL_LOADED else 422
            return jsonify({
                "error": MODEL_LOAD_ERROR or ("Model not loaded" if not MODEL_LOADED else "Could not classify query"),
                "response": "Sorry, I could not understand your query."
            }), status

        return jsonify({
            "numeric_id": prediction_result["numeric_id"],
            "label": prediction_result["label"]
        })
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return jsonify({"error": str(e), "response": "An error occurred while processing your request."}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "OK",
        "model_loaded": MODEL_LOADED,
        "model_loading": MODEL_LOADING
    }), 200


@app.route("/ready", methods=["GET"])
def ready():
    if MODEL_LOADED:
        return jsonify({"status": "ready", "model_loaded": True}), 200
    return jsonify({
        "status": "not_ready",
        "model_loaded": False,
        "model_loading": MODEL_LOADING,
        "error": MODEL_LOAD_ERROR
    }), 503


if __name__ == "__main__":
    port = int(os.getenv("PREDICTOR_PORT", 5000))
    logger.info(f"Starting Flask server on port {port}")
    start_model_loader()
    app.run(host="0.0.0.0", port=port, debug=False)
