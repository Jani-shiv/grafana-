const express = require('express');
const client = require('prom-client');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDirectory = path.join(__dirname, 'data');
const ordersStorePath = path.join(dataDirectory, 'orders.json');

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '1mb' }));

client.collectDefaultMetrics({
  prefix: 'nodejs_',
  timeout: 5000,
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled by the sample application.',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total HTTP 5xx responses returned by the sample application.',
  labelNames: ['method', 'route', 'status_code'],
});

const ecommerceCheckoutDurationSeconds = new client.Histogram({
  name: 'ecommerce_checkout_duration_seconds',
  help: 'Checkout request latency in seconds.',
  labelNames: ['result'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const ecommerceProductViewsTotal = new client.Counter({
  name: 'ecommerce_product_views_total',
  help: 'Total product detail views in the ecommerce demo.',
  labelNames: ['product_id'],
});

const ecommerceCartAddsTotal = new client.Counter({
  name: 'ecommerce_cart_adds_total',
  help: 'Total items added to cart in the ecommerce demo.',
  labelNames: ['product_id'],
});

const ecommerceCheckoutsTotal = new client.Counter({
  name: 'ecommerce_checkouts_total',
  help: 'Total completed checkout attempts in the ecommerce demo.',
  labelNames: ['result'],
});

const ecommerceRevenueCentsTotal = new client.Counter({
  name: 'ecommerce_revenue_cents_total',
  help: 'Total successful checkout value in cents.',
});

const products = [
  { id: 'p1001', name: 'Core Hoodie', priceCents: 4900, description: 'Warm, simple, and easy to explain in a demo.' },
  { id: 'p1002', name: 'Signal Mug', priceCents: 1800, description: 'A small product that makes metrics easy to understand.' },
  { id: 'p1003', name: 'Latency Notebook', priceCents: 2500, description: 'For writing down the things dashboards cannot tell you.' },
];

const cart = new Map();
function ensureOrdersStore() {
  fs.mkdirSync(dataDirectory, { recursive: true });

  if (!fs.existsSync(ordersStorePath)) {
    fs.writeFileSync(ordersStorePath, '[]\n');
  }
}

function loadOrdersFromDisk() {
  try {
    ensureOrdersStore();
    const rawContents = fs.readFileSync(ordersStorePath, 'utf8').trim();

    if (!rawContents) {
      return [];
    }

    const parsed = JSON.parse(rawContents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to load persisted orders:', error.message);
    return [];
  }
}

function saveOrdersToDisk() {
  ensureOrdersStore();
  fs.writeFileSync(ordersStorePath, `${JSON.stringify(orders, null, 2)}\n`);
}

const orders = loadOrdersFromDisk();

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getProduct(productId) {
  return products.find((product) => product.id === productId);
}

function getCartItems() {
  return Array.from(cart.values()).map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    priceCents: item.priceCents,
    lineTotalCents: item.priceCents * item.quantity,
  }));
}

function getCartSummary() {
  const items = getCartItems();
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotalCents = items.reduce((total, item) => total + item.lineTotalCents, 0);

  return {
    items,
    itemCount,
    subtotalCents,
    subtotal: money(subtotalCents),
  };
}

function renderStorefront() {
  const productSeed = JSON.stringify(products).replaceAll('<', '\\u003c');

  return `<!doctype html>
  <html>
    <head>
      <title>Stellarmind Mini Shop</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        :root {
          color-scheme: light;
          --bg: #f5efe6;
          --bg-alt: #f0f6ff;
          --panel: rgba(255, 255, 255, 0.82);
          --panel-strong: #ffffff;
          --text: #172033;
          --muted: #5b6477;
          --brand: #0f766e;
          --brand-strong: #115e59;
          --accent: #f97316;
          --border: rgba(23, 32, 51, 0.1);
          --shadow: 0 18px 50px rgba(15, 23, 42, 0.12);
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Trebuchet MS", "Segoe UI", sans-serif;
          color: var(--text);
          background:
            radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 24%),
            radial-gradient(circle at top right, rgba(249, 115, 22, 0.16), transparent 28%),
            linear-gradient(180deg, var(--bg), var(--bg-alt));
          min-height: 100vh;
        }
        header {
          padding: 40px clamp(20px, 5vw, 56px) 28px;
          color: white;
          background: linear-gradient(135deg, #0f172a 0%, #134e4a 55%, #155e75 100%);
          box-shadow: var(--shadow);
        }
        header h1 {
          margin: 0 0 8px;
          font-size: clamp(2rem, 5vw, 3.75rem);
          line-height: 1.02;
          letter-spacing: -0.04em;
        }
        header p {
          margin: 0;
          max-width: 62rem;
          color: rgba(255, 255, 255, 0.86);
          font-size: 1.05rem;
        }
        main {
          padding: 24px clamp(20px, 5vw, 56px) 40px;
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.95fr);
          gap: 24px;
          align-items: start;
        }
        .hero-strip {
          margin-top: -18px;
          padding: 18px 20px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid var(--border);
          backdrop-filter: blur(12px);
          box-shadow: var(--shadow);
        }
        .hero-strip strong { color: var(--brand-strong); }
        .stack { display: grid; gap: 20px; }
        .panel, .card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 22px;
          box-shadow: var(--shadow);
          backdrop-filter: blur(14px);
        }
        .panel { padding: 20px; }
        .panel h2, .card h3 { margin-top: 0; }
        .product-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }
        .card {
          padding: 18px;
          display: grid;
          gap: 12px;
          min-height: 220px;
        }
        .product-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: var(--muted);
          font-size: 0.94rem;
        }
        .price {
          font-size: 1.6rem;
          font-weight: 700;
          color: var(--brand-strong);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: auto;
        }
        .button, button, .ghost-link {
          border: 0;
          border-radius: 999px;
          padding: 11px 15px;
          font: inherit;
          cursor: pointer;
          text-decoration: none;
          transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
        }
        .button:hover, button:hover, .ghost-link:hover { transform: translateY(-1px); }
        .button, button {
          background: var(--accent);
          color: white;
          box-shadow: 0 8px 18px rgba(249, 115, 22, 0.26);
        }
        .ghost-link {
          background: rgba(15, 118, 110, 0.08);
          color: var(--brand-strong);
        }
        .subtle {
          color: var(--muted);
          font-size: 0.96rem;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .metric {
          padding: 14px;
          border-radius: 16px;
          background: var(--panel-strong);
          border: 1px solid var(--border);
        }
        .metric span {
          display: block;
          color: var(--muted);
          font-size: 0.84rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .metric strong {
          display: block;
          margin-top: 4px;
          font-size: 1.3rem;
        }
        .cart-list, .order-list, .details-list {
          display: grid;
          gap: 10px;
        }
        .line-item {
          padding: 12px;
          border-radius: 14px;
          background: var(--panel-strong);
          border: 1px solid var(--border);
        }
        .line-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: baseline;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 11px;
          border-radius: 999px;
          background: rgba(15, 118, 110, 0.09);
          color: var(--brand-strong);
          font-size: 0.88rem;
        }
        .status {
          min-height: 24px;
          color: var(--brand-strong);
          font-weight: 600;
        }
        .divider { height: 1px; background: var(--border); margin: 14px 0; }
        .empty {
          color: var(--muted);
          padding: 12px;
          border: 1px dashed rgba(23, 32, 51, 0.18);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.55);
        }
        .sidebar { position: sticky; top: 18px; display: grid; gap: 20px; }
        @media (max-width: 980px) {
          main { grid-template-columns: 1fr; }
          .sidebar { position: static; }
          .metric-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <header>
        <h1>Stellarmind Mini Shop</h1>
        <p>A tiny ecommerce app used to show what metrics change when users browse, add to cart, checkout, and come back after a restart.</p>
      </header>
      <main>
        <section class="stack">
          <div class="hero-strip">
            <div class="metric-grid">
              <div class="metric">
                <span>Browse</span>
                <strong>Product views</strong>
              </div>
              <div class="metric">
                <span>Intent</span>
                <strong>Cart adds</strong>
              </div>
              <div class="metric">
                <span>Outcome</span>
                <strong>Checkout + revenue</strong>
              </div>
            </div>
            <div class="divider"></div>
            <p class="subtle">Use the page, then open Prometheus or Grafana and match the story you see here with the metrics you graph.</p>
            <div class="actions">
              <a class="ghost-link" href="/metrics">View metrics</a>
              <a class="ghost-link" href="/products">View product JSON</a>
              <a class="ghost-link" href="/orders">View persisted orders</a>
            </div>
          </div>
          <section class="panel">
            <h2>Products</h2>
            <p class="subtle">Inspect products, then add one to the cart. The cards are live and update the cart without a page reload.</p>
            <div id="product-grid" class="product-grid"></div>
          </section>
        </section>

        <aside class="sidebar">
          <section class="panel">
            <h2>Cart</h2>
            <div id="cart-summary" class="subtle">Loading cart...</div>
            <div id="cart-list" class="cart-list"></div>
            <div class="divider"></div>
            <div class="actions">
              <button id="checkout-button" type="button">Checkout cart</button>
              <a class="ghost-link" href="/cart">Cart JSON</a>
            </div>
          </section>

          <section class="panel">
            <h2>Selected product</h2>
            <div id="product-details" class="details-list empty">Pick a product to inspect it.</div>
          </section>

          <section class="panel">
            <h2>Recent orders</h2>
            <div id="orders-list" class="order-list"></div>
          </section>

          <section class="panel">
            <h2>Activity</h2>
            <div id="status-message" class="status">Ready.</div>
          </section>
        </aside>
      </main>
      <script>
        const products = ${productSeed};

        const productGrid = document.getElementById('product-grid');
        const cartSummary = document.getElementById('cart-summary');
        const cartList = document.getElementById('cart-list');
        const ordersList = document.getElementById('orders-list');
        const detailsPanel = document.getElementById('product-details');
        const statusMessage = document.getElementById('status-message');
        const checkoutButton = document.getElementById('checkout-button');

        function money(cents) {
          return '$' + (cents / 100).toFixed(2);
        }

        function escapeHtml(value) {
          return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
        }

        function setStatus(message) {
          statusMessage.textContent = message;
        }

        async function requestJson(url, options = {}) {
          const response = await fetch(url, {
            headers: {
              'Content-Type': 'application/json',
              ...(options.headers || {}),
            },
            ...options,
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Request failed');
          }

          return data;
        }

        function renderProducts() {
          productGrid.innerHTML = products.map(function (product) {
            return '<article class="card">' +
              '<div class="product-meta">' +
                '<span class="pill">' + escapeHtml(product.id) + '</span>' +
                '<span>' + escapeHtml(product.description) + '</span>' +
              '</div>' +
              '<h3>' + escapeHtml(product.name) + '</h3>' +
              '<div class="price">' + money(product.priceCents) + '</div>' +
              '<p class="subtle">Tap inspect to load the live product payload. Tap add to send it to the cart.</p>' +
              '<div class="actions">' +
                '<button type="button" data-inspect="' + escapeHtml(product.id) + '">Inspect</button>' +
                '<button type="button" data-add="' + escapeHtml(product.id) + '">Add to cart</button>' +
              '</div>' +
            '</article>';
          }).join('');

          productGrid.querySelectorAll('[data-inspect]').forEach((button) => {
            button.addEventListener('click', () => inspectProduct(button.dataset.inspect));
          });

          productGrid.querySelectorAll('[data-add]').forEach((button) => {
            button.addEventListener('click', () => addToCart(button.dataset.add));
          });
        }

        function renderCart(cart) {
          cartSummary.innerHTML = 'Items: <strong>' + cart.itemCount + '</strong> | Subtotal: <strong>' + cart.subtotal + '</strong>';

          if (!cart.items.length) {
            cartList.innerHTML = '<div class="empty">Your cart is empty.</div>';
            checkoutButton.disabled = true;
            checkoutButton.style.opacity = '0.6';
            return;
          }

          checkoutButton.disabled = false;
          checkoutButton.style.opacity = '1';

          cartList.innerHTML = cart.items.map(function (item) {
            return '<div class="line-item">' +
              '<div class="line-top">' +
                '<strong>' + escapeHtml(item.name) + '</strong>' +
                '<span>' + money(item.lineTotalCents) + '</span>' +
              '</div>' +
              '<div class="subtle">Qty ' + item.quantity + ' · ' + money(item.priceCents) + ' each</div>' +
            '</div>';
          }).join('');
        }

        function renderOrders(orders) {
          if (!orders.length) {
            ordersList.innerHTML = '<div class="empty">No orders yet. Checkout once and your history will persist after restart.</div>';
            return;
          }

          ordersList.innerHTML = orders.slice(0, 5).map(function (order) {
            return '<div class="line-item">' +
              '<div class="line-top">' +
                '<strong>' + escapeHtml(order.id.slice(0, 8)) + '</strong>' +
                '<span>' + escapeHtml(order.total) + '</span>' +
              '</div>' +
              '<div class="subtle">' + escapeHtml(order.createdAt) + ' · ' + order.items.length + ' items</div>' +
            '</div>';
          }).join('');
        }

        async function loadCart() {
          const cart = await requestJson('/cart');
          renderCart(cart);
          return cart;
        }

        async function loadOrders() {
          const payload = await requestJson('/orders');
          renderOrders(payload.orders || []);
          return payload.orders || [];
        }

        async function inspectProduct(productId) {
          setStatus('Loading product details...');
          const payload = await requestJson('/products/' + encodeURIComponent(productId));
          const product = payload.product;

          detailsPanel.className = 'details-list';
          detailsPanel.innerHTML = '<div class="line-item">' +
            '<div class="line-top">' +
              '<strong>' + escapeHtml(product.name) + '</strong>' +
              '<span>' + escapeHtml(payload.price) + '</span>' +
            '</div>' +
            '<div class="subtle">ID: ' + escapeHtml(product.id) + '</div>' +
            '<div class="subtle">' + escapeHtml(product.description) + '</div>' +
          '</div>';
          setStatus('Viewed ' + product.name + '.');
        }

        async function addToCart(productId) {
          setStatus('Adding item to cart...');
          await requestJson('/cart/add', {
            method: 'POST',
            body: JSON.stringify({ productId, quantity: 1 }),
          });
          await loadCart();
          setStatus('Item added to cart.');
        }

        async function checkoutCart() {
          setStatus('Checking out...');

          try {
            const payload = await requestJson('/checkout', {
              method: 'POST',
              body: JSON.stringify({}),
            });

            setStatus('Checkout completed: ' + payload.order.total);
            await Promise.all([loadCart(), loadOrders()]);
          } catch (error) {
            setStatus(error.message);
          }
        }

        checkoutButton.addEventListener('click', checkoutCart);

        renderProducts();
        Promise.all([loadCart(), loadOrders()]).catch((error) => setStatus(error.message));
      </script>
    </body>
  </html>`;
}

app.use((req, res, next) => {
  const routeName = req.path;
  const startTimer = httpRequestDurationSeconds.startTimer({
    method: req.method,
    route: routeName,
  });

  res.on('finish', () => {
    const statusCode = String(res.statusCode);

    httpRequestsTotal.inc({
      method: req.method,
      route: routeName,
      status_code: statusCode,
    });

    if (res.statusCode >= 500) {
      httpErrorsTotal.inc({
        method: req.method,
        route: routeName,
        status_code: statusCode,
      });
    }

    startTimer({ status_code: statusCode });
  });

  next();
});

app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderStorefront());
});

app.get('/products', (req, res) => {
  res.json({ products });
});

app.get('/products/:productId', (req, res) => {
  const product = getProduct(req.params.productId);

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  ecommerceProductViewsTotal.inc({ product_id: product.id });

  res.json({
    product,
    price: money(product.priceCents),
  });
});

app.get('/cart', (req, res) => {
  res.json(getCartSummary());
});

app.post('/cart/add', (req, res) => {
  const productId = String(req.body.productId || req.query.productId || '');
  const quantity = Math.max(Number(req.body.quantity || req.query.quantity || 1), 1);
  const product = getProduct(productId);

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const existingItem = cart.get(product.id) || {
    productId: product.id,
    name: product.name,
    priceCents: product.priceCents,
    quantity: 0,
  };

  existingItem.quantity += quantity;
  cart.set(product.id, existingItem);
  ecommerceCartAddsTotal.inc({ product_id: product.id }, quantity);

  res.status(201).json({
    message: 'Item added to cart',
    cart: getCartSummary(),
  });
});

app.post('/checkout', (req, res) => {
  const stopCheckoutTimer = ecommerceCheckoutDurationSeconds.startTimer();
  const summary = getCartSummary();

  if (summary.itemCount === 0) {
    stopCheckoutTimer({ result: 'empty_cart' });
    ecommerceCheckoutsTotal.inc({ result: 'empty_cart' });
    res.status(400).json({ error: 'Cart is empty' });
    return;
  }

  try {
    const order = {
      id: randomUUID(),
      items: summary.items,
      totalCents: summary.subtotalCents,
      total: summary.subtotal,
      createdAt: new Date().toISOString(),
    };

    orders.unshift(order);
    saveOrdersToDisk();
    cart.clear();
    ecommerceCheckoutsTotal.inc({ result: 'success' });
    ecommerceRevenueCentsTotal.inc(summary.subtotalCents);
    stopCheckoutTimer({ result: 'success' });

    res.status(201).json({
      message: 'Checkout complete',
      order,
    });
  } catch (error) {
    console.error('Checkout failed:', error);
    stopCheckoutTimer({ result: 'error' });
    res.status(500).json({ error: 'Checkout failed' });
  }
});

app.get('/orders', (req, res) => {
  res.json({ orders });
});

app.get('/slow', async (req, res) => {
  const delayMs = Math.min(Number(req.query.ms || 1500), 15000);
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  res.status(200).json({
    message: 'Slow response completed.',
    delayMs,
  });
});

app.get('/error', (req, res) => {
  res.status(500).json({
    error: 'Synthetic application failure for alerting practice.',
  });
});

app.get('/burn', (req, res) => {
  const durationMs = Math.min(Number(req.query.ms || 5000), 30000);
  const end = Date.now() + durationMs;
  let accumulator = 0;

  while (Date.now() < end) {
    for (let i = 0; i < 250000; i += 1) {
      accumulator += Math.sqrt(i) % 7;
    }
  }

  res.status(200).json({
    message: 'CPU burn complete.',
    durationMs,
    checksum: Number(accumulator.toFixed(2)),
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});

app.post('/alerts', (req, res) => {
  console.log('Alertmanager webhook received:', JSON.stringify(req.body, null, 2));
  res.status(200).json({
    received: true,
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
  });
});

app.listen(port, () => {
  console.log(`Sample application listening on port ${port}`);
});