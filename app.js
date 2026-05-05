const express = require('express');
const promClient = require('prom-client');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'appdb',
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'apppassword',
});

promClient.collectDefaultMetrics();

const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

app.use(express.json());

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path || req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestCounter.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${durationSeconds.toFixed(3)}s`);
  });

  next();
});

app.get('/health', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT 1 AS ok');
    res.status(200).json({ status: 'ok', db: result.rows[0].ok === 1 ? 'up' : 'down' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/data', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name, value FROM sample_data ORDER BY id');
    res.json({ count: result.rowCount, data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/data/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT id, name, value FROM sample_data WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Data not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

app.use((error, req, res, next) => {
  console.error(`Error on ${req.method} ${req.originalUrl}:`, error.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('Connected to PostgreSQL');
    app.listen(port, () => {
      console.log(`API listening on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to connect to PostgreSQL on startup:', error.message);
    process.exit(1);
  }
}

start();
