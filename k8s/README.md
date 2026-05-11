# Verdure Kubernetes Deployment

This directory contains Kubernetes manifests for the Verdure application stack:

- `verdure-db` (MySQL)
- `verdure-backend`
- `verdure-ai-chatbot`
- `verdure-frontend`
- `verdure-ai-chatbot-hpa`

## Deploying locally

1. Build the Docker images:

```bash
cd e:\Engineering_Hub\Projects\verdure-repo\Verdure
docker build -t verdure-db ./DB
docker build -t verdure-backend ./Backend
docker build -t verdure-ai-chatbot ./AI-Chatbot
docker build -t verdure-frontend ./Frontend
```

> If you use `minikube` or `kind`, load the images into the cluster instead of pushing to a registry.

2. Apply the manifests:

```bash
kubectl apply -k k8s/
```

3. Verify the resources:

```bash
kubectl get all -n verdure
```

4. Access the frontend in a local cluster:

- If using `minikube`, run `minikube service verdure-frontend -n verdure --url`
- If using a bare `kubeadm` cluster, open port `30080` on your node and browse to `http://<node-ip>:30080`

The backend is also exposed on NodePort `30303`.

The frontend now uses the current page origin for `BASE_URL`, so the API can be reached through the same host if you use an ingress or route the backend service through the same domain.

## Notes

- The backend is configured to call the AI chatbot at `http://verdure-ai-chatbot:5000/chat`.
- The frontend is exposed on `NodePort 30080`.
- The MySQL data uses a `PersistentVolumeClaim` named `verdure-db-pvc`.
- `HorizontalPodAutoscaler` is enabled for the AI chatbot, but it requires metrics-server.

## Environment values

The manifests use a ConfigMap and a Secret:

- `verdure-config` for `DB_NAME`, `BACKEND_PORT`, and service ports
- `verdure-db-secret` for MySQL passwords

Change the values in `k8s/secret.yaml` and `k8s/configmap.yaml` before deploying if needed.
