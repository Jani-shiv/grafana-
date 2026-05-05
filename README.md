# Production-like DevOps Stack (Node.js + PostgreSQL + Prometheus + Grafana)

This project is a minimal production-like setup that includes:

- Node.js (Express) backend API
- PostgreSQL database
- Prometheus scraping backend metrics
- Grafana dashboards for request count and latency
- Docker Compose orchestration

## Project structure

```text
.
├── app.js
├── Dockerfile
├── docker-compose.yml
├── package.json
├── postgres/
│   └── init.sql
├── prometheus/
│   └── prometheus.yml
└── grafana/
    ├── dashboards/
    │   └── backend-monitoring.json
    └── provisioning/
        ├── dashboards/
        │   └── dashboards.yml
        └── datasources/
            └── datasource.yml
```

## API endpoints

- `GET /health` - app and DB health status
- `GET /metrics` - Prometheus metrics endpoint
- `GET /api/data` - list sample rows from PostgreSQL
- `GET /api/data/:id` - single row query endpoint

## Run locally

### 1) Install dependencies (optional for local non-Docker run)

```bash
npm install
```

### 2) Start everything

```bash
docker compose up -d --build
```

### 3) Verify services

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/data
curl http://localhost:3000/metrics
```

### 4) Open tools

- Backend: http://localhost:3000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)

## Configuration via environment variables

Backend uses:

- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

These are provided in `docker-compose.yml`.

## Monitoring setup

- Backend exposes metrics on `/metrics` using `prom-client`.
- Prometheus scrapes `backend:3000/metrics` every 15 seconds (`prometheus/prometheus.yml`).
- Grafana uses provisioned Prometheus datasource.
- Grafana dashboard includes:
  - **Request Count (RPS)** panel
  - **Response Time p95** panel

## Data flow: backend → Prometheus → Grafana

1. Backend handles requests and records metrics (`http_requests_total`, `http_request_duration_seconds`).
2. Prometheus pulls those metrics from `/metrics` at scrape intervals.
3. Grafana queries Prometheus with PromQL and visualizes trends in dashboards.

This pull model keeps monitoring decoupled from application business logic.

## Extend to Kubernetes later

A straightforward migration path:

1. Build and push backend image to a container registry.
2. Replace Docker Compose with Kubernetes resources:
   - `Deployment` + `Service` for backend
   - `StatefulSet` + `PersistentVolume` for PostgreSQL
3. Use `ConfigMap`/`Secret` for environment variables and credentials.
4. Deploy Prometheus and Grafana with Helm charts (`kube-prometheus-stack` is common).
5. Use `ServiceMonitor` (Prometheus Operator) to scrape backend metrics.
6. Move dashboard JSON into Grafana ConfigMaps or provisioning sidecar.
7. Add ingress, TLS, RBAC, network policies, and backup strategy for production.
