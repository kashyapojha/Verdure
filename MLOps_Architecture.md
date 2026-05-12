# Verdure Chatbot MLOps Architecture

This document describes the recommended future architecture for the Verdure AI chatbot using a clean separation of responsibilities.

## Stage responsibilities

| Stage | Responsibility | Current implementation | Future direction |
|---|---|---|---|
| CI/CD | App deployment, build and deploy services | `.github/workflows/ci-cd.yml` builds frontend/backend/AI-chatbot Docker images and deploys to Kubernetes | Keep CI/CD focused on packaging and deployment, while receiving model artifacts from the ML pipeline or model registry |
| ML pipeline | Training and evaluation | `AI-Chatbot/train_and_evaluate.py`, `mlops-train` GitHub Actions job | Separate into a dedicated training pipeline, ideally with reusable pipeline steps and experiment tracking |
| Model registry | Model storage and versioning | `model-registry` workflow job uploads trained artifacts as a registered model package | Replace the temporary artifact store with an actual registry (S3, MLflow model registry, or a dedicated artifact service) |
| Inference service | Serving predictions | `AI-Chatbot/app.py` or `AI-Chatbot/fastapi_server.py` running inside Docker/Kubernetes | Serve the stable, registered model from the inference service and use model metadata for versioning and rollout |

## Current workflow split

The repository now contains three logical CI jobs:

1. `build-and-test`
   - builds app dependencies
   - validates backend, frontend, and chatbot dependencies
2. `mlops-train`
   - trains the chatbot model
   - evaluates the model on a holdout set
   - uploads model artifacts and metrics
3. `model-registry`
   - downloads trained artifacts
   - stores them as a registered package
   - uploads the packaged model for later consumption by deployment
4. `docker-build`
   - downloads the registered model
   - builds Docker images including the chatbot model
   - optionally pushes images to Docker Hub
5. `k8s-deploy`
   - deploys the updated Docker images to Kubernetes

## How the split works

- The **ML pipeline** is responsible for model training and evaluation only.
- The **model registry** acts as a gatekeeper and storage layer for production-ready models.
- The **CI/CD pipeline** consumes the registered model artifact and builds the app container.
- The **inference service** is the runtime endpoint that loads the latest registered model and responds to queries.

## Recommended future architecture

### 1. CI/CD (`.github/workflows/ci-cd.yml`)
- Keep building and deploying app containers.
- Do not train or validate models inside the deployment-only path.
- Consume model artifacts from the registry.

### 2. ML pipeline
- Move from `train_and_evaluate.py` to a proper pipeline runner.
- Add:
  - data validation
  - experiment logging
  - reproducibility with explicit dataset and hyperparameters
  - automated evaluation metrics

### 3. Model registry
- Use a real registry instead of temporary workflow artifacts.
- Candidate options:
  - MLflow Model Registry
  - S3 / MinIO with versioned model paths
  - Docker image tags for model-backed containers
  - GitHub Packages or a dedicated artifact store

### 4. Inference service
- Keep serving via Flask/FastAPI inside Docker/Kubernetes.
- Load the model artifact from the registry package or container image.
- Add health endpoints, logging, and metrics for production monitoring.

## Practical next steps

1. Add a dedicated `mlops/` directory for training pipeline definitions.
2. Introduce experiment tracking (MLflow, WandB, or TensorBoard).
3. Replace `actions/upload-artifact` with a persistent model registry or S3 bucket.
4. Add a model version selector to the inference service.
5. Add drift monitoring and prediction logging in the inference container.
