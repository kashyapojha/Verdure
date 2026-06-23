FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=1
ENV TOKENIZERS_PARALLELISM=false

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CPU-only PyTorch uses far less RAM than the default CUDA build
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && grep -v '^torch' requirements.txt | grep -v '^$' > requirements-no-torch.txt \
    && pip install --no-cache-dir -r requirements-no-torch.txt

COPY . .

EXPOSE 5000
CMD ["python", "app.py"]
