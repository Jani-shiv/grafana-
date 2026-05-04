# Prometheus + Grafana observability stack

This project builds a production-shaped monitoring stack around a sample Node.js service.

The stack includes:

- Node.js app with `/`, `/metrics`, `/slow`, `/error`, `/burn`, and `/alerts`
- Prometheus for metrics scraping and alert evaluation
- Grafana for dashboards
- Node Exporter for host-level system metrics
- Alertmanager for alert routing
- Docker Compose for local and Azure VM deployment

## Why this architecture

Prometheus uses a pull model because the monitoring system decides what to scrape and when. That matters in real environments because:

- You avoid pushing from every app to every monitoring backend.
- Service discovery is simpler when Prometheus owns targets.
- Failures are easier to reason about because missing scrapes show up as missing data instead of silently lost pushes.

The tradeoff is that your targets must be reachable from Prometheus, so network design matters. That is why the Docker Compose network and Azure VM firewall rules are part of the system design, not an afterthought.

## Project structure

- `app.js` - Node.js app and metrics endpoints
- `package.json` - app dependencies and scripts
- `Dockerfile` - container image for the app
- `docker-compose.yml` - full stack orchestration
- `prometheus/prometheus.yml` - scrape and alert configuration
- `prometheus/alert_rules.yml` - production-style alert rules
- `alertmanager/alertmanager.yml` - alert routing
- `grafana/provisioning/datasources/datasource.yml` - Prometheus datasource provisioning
- `grafana/provisioning/dashboards/dashboards.yml` - dashboard provisioning
- `grafana/dashboards/monitoring-dashboard.json` - example dashboard
- `data/orders.json` - tiny file-based order store

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the stack:

```bash
docker compose up -d --build
```

3. Verify the app:

```bash
curl http://localhost:3001/
curl http://localhost:3001/metrics
```

4. Open the tools:

- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093

## What each service does

- Node app: emits business and runtime metrics, plus synthetic failure endpoints for practice.
- Prometheus: scrapes targets and evaluates alert rules.
- Grafana: visualizes metrics with pre-provisioned datasource and dashboard.
- Node Exporter: exposes machine-level metrics like CPU, memory, filesystem, and load.
- Alertmanager: groups and forwards alerts.

## Node.js app design

The app uses `prom-client` to expose:

- `http_requests_total`
- `http_request_duration_seconds`
- `http_errors_total`
- default Node.js process metrics

It also includes a tiny in-memory ecommerce flow so you can see a real user journey instead of only a health endpoint.

Main ecommerce routes:

- `/` - storefront page
- `/products` - JSON list of products
- `/products/:productId` - product detail and view metric
- `/cart` - current cart state
- `/cart/add` - add an item to the cart
- `/checkout` - complete the order and clear the cart
- `/orders` - list completed orders

The app persists completed orders to `data/orders.json` and the Docker Compose stack mounts that folder into the container, so orders survive a restart on the same machine.

Ecommerce metrics:

- `ecommerce_product_views_total` - how often a product page is viewed
- `ecommerce_cart_adds_total` - how often items are added to cart
- `ecommerce_checkouts_total` - checkout attempts, split by result
- `ecommerce_revenue_cents_total` - total successful order value
- `ecommerce_checkout_duration_seconds` - checkout latency for p95 tracking

Important design choice: the route label is the request path, not the full URL. That avoids query-string cardinality explosions. A common beginner mistake is to label metrics with raw IDs, emails, session tokens, or arbitrary URLs. That looks useful for one day and becomes an outage for your monitoring backend.

## Prometheus scrape config

Scrape interval is 15 seconds. That is a reasonable default for most infrastructure and application dashboards because it is frequent enough to see trends and coarse enough to keep sample volume under control.

Targets:

- `node-app:3000/metrics`
- `node-exporter:9100/metrics`
- Prometheus self-scrape for health checking

## Grafana panels

Suggested panel types:

- Timeseries for CPU, memory, request rate, error rate, and latency trends
- Stat for single-number summaries like current error rate or p95 latency
- Gauge when you care about threshold perception more than trend detail

This dashboard uses timeseries panels because the main goal is to show how a metric evolves while you simulate failures.

## PromQL queries

CPU usage:

```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

This calculates the percentage of time the CPU is not idle. Use it when you care about host saturation and want an intuitive percentage.

Request rate:

```promql
sum(rate(http_requests_total[5m]))
```

This gives requests per second averaged over 5 minutes. Use it to see traffic volume and demand shifts.

Error rate:

```promql
sum(rate(http_errors_total[5m])) / clamp_min(sum(rate(http_requests_total[5m])), 1)
```

This calculates the fraction of requests that failed. Use the ratio, not the raw error count, because 10 errors in 100 requests is very different from 10 errors in 10,000 requests.

Latency p95:

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

This estimates the 95th percentile request latency. Use p95 when average latency hides tail problems that customers actually feel.

Ecommerce conversion rate:

```promql
100 * sum(rate(ecommerce_checkouts_total{result="success"}[5m])) / clamp_min(sum(rate(ecommerce_product_views_total[5m])), 1)
```

This shows how many product views are turning into successful checkouts. Use it when you want a funnel-level signal rather than a raw traffic number.

Checkout latency p95:

```promql
histogram_quantile(0.95, sum(rate(ecommerce_checkout_duration_seconds_bucket[5m])) by (le))
```

This isolates the checkout path itself. Use it when the cart or payment step is the part you need to triage, rather than the whole request mix.

## Alerting rules

High CPU usage:

- Threshold: above 80 percent for 5 minutes
- Why: short spikes are normal; sustained saturation is a capacity problem

High error rate:

- Threshold: more than 5 percent of requests failing for 5 minutes
- Why: transient single failures are noise, but consistent failure ratios are incidents

High latency:

- Threshold: p95 above 500 ms for 5 minutes
- Why: tail latency often correlates with saturation, lock contention, or downstream dependence issues

Alertmanager routes alerts to the app's `/alerts` endpoint so you can see the webhook payload and verify end-to-end alert delivery.

## Failure simulation

High CPU load:

```bash
curl "http://localhost:3001/burn?ms=15000"
```

What changes:

- CPU panel rises sharply
- Latency increases because the event loop is busy
- If sustained, the CPU alert fires

Slow responses:

```bash
curl "http://localhost:3001/slow?ms=5000"
```

What changes:

- Latency p95 rises
- Request rate may stay flat while response times worsen
- If repeated, the latency alert fires

Application errors:

```bash
curl -i http://localhost:3001/error
```

What changes:

- Error rate rises
- Error count increases
- If the ratio crosses threshold, the error alert fires

How to interpret it:

- CPU spike with rising latency usually means saturation or inefficient code.
- Error spike with stable CPU usually means logic failure or dependency failure.
- Latency spike without errors often means degradation before outright failure, which is exactly when alerts should catch the issue.

## Ecommerce walkthrough

1. Open the homepage at `/` and look at the product cards.
2. Click a product, or call `/products/p1001` directly.
3. Add a product to the cart with the form or a POST request to `/cart/add`.
4. Check the cart at `/cart`.
5. Submit checkout at `/checkout`.
6. Inspect `/orders` to see the completed order.

What the metrics mean:

- Product views tell you what people inspect before buying.
- Cart adds tell you intent, which is usually more valuable than page views.
- Checkout success versus empty-cart failures shows funnel health.
- Revenue cents shows whether traffic is turning into actual value.
- Checkout latency shows whether the final purchase step is becoming slow before it becomes broken.

Use these to reason about common problems:

- High views but low cart adds usually means the product page is confusing or the price is wrong.
- High cart adds but low checkouts usually means friction in checkout or trust issues.
- Checkouts with low revenue usually means small baskets or failed upsell logic.

## Monitoring versus logging

Metrics answer: how much, how often, and how bad.

Logs answer: what happened, in what order, with which payload.

They are complementary, not competing tools. Metrics tell you there is a problem. Logs help you understand the request, stack trace, or dependency call that explains the problem.

If you want a log stack next, add Loki with Promtail or Grafana Alloy. That gives you correlation between metrics spikes and detailed event records.

## Azure VM deployment

If you want to provision the VM and boot the stack from your local machine using Azure CLI, run [azure/deploy-to-azure.ps1](azure/deploy-to-azure.ps1). It packages the repo, uploads it to Blob Storage, creates the VM, opens the ports, and starts Docker on first boot.

Example:

```powershell
pwsh .\azure\deploy-to-azure.ps1 `
  -SubscriptionId "<subscription-id>" `
  -ResourceGroupName "stellarmind-rg" `
  -Location "eastus" `
  -VmName "stellarmind-vm" `
  -AdminUsername "azureuser" `
  -SshPublicKeyPath "$env:USERPROFILE\.ssh\id_rsa.pub" `
  -StorageAccountName "stellarmindstore123"
```

The machine you run this from must already have Azure CLI installed and you must be signed in with `az login`.

1. Create a Linux VM, preferably Ubuntu 22.04 or 24.04.
2. Open these inbound ports in the NSG:

- `22` for SSH
- `3000` for Grafana
- `3001` for the sample app
- `9090` for Prometheus
- `9093` for Alertmanager
- `9100` for Node Exporter

3. SSH into the VM.
4. Install Docker and Compose plugin.

Ubuntu example:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

5. Copy the repository to the VM.
6. Run:

```bash
docker compose up -d --build
```

7. Verify with:

```bash
docker compose ps
docker compose logs -f prometheus
```

Important Azure note: Node Exporter is only meaningful if it can observe the VM host. On Linux VM deployment, the bind mount in Compose gives you that. On Docker Desktop for Windows, host metrics are not the same thing as a real Linux VM, so treat local testing as functional, not identical to production.

## Production mistakes to avoid

- High-cardinality labels. Do not label by user IDs, raw URLs with IDs, session tokens, or unbounded error text.
- Alerts without action. If nobody can respond or the alert is not tied to an SLO, it becomes noise.
- Dashboards with too many panels. A dashboard should help answer a question, not display every possible time series.
- Alerting on symptoms only. You want a mix of symptoms and causes so you can triage quickly.
- Using averages alone. Averages hide tail latency and bursty failures.

## Next steps

1. Add a log pipeline with Loki and Grafana Alloy.
2. Add TLS and basic auth before exposing anything beyond a lab network.
3. Split this into environments with separate scrape intervals and alert thresholds for dev, staging, and prod.