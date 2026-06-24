const path = require('path');
const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
let hostIndex = 0;

const CACHE_TTL = {
  quote: 20_000,
  chart: 60_000,
  search: 60_000,
};

const cache = new Map();
const queue = [];
let lastReqTime = 0;
let processing = false;

function getHost() {
  const host = YAHOO_HOSTS[hostIndex % YAHOO_HOSTS.length];
  hostIndex++;
  return host;
}

function processQueue() {
  if (processing || queue.length === 0) return;
  const elapsed = Date.now() - lastReqTime;
  if (elapsed < 1200) {
    setTimeout(processQueue, 1200 - elapsed);
    return;
  }
  processing = true;
  const { path, responders } = queue.shift();
  const host = getHost();
  const targetUrl = `https://${host}${path}`;

  const opts = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://finance.yahoo.com/',
    },
  };

  const proxyReq = https.request(targetUrl, opts, (proxyRes) => {
    let data = '';
    proxyRes.on('data', c => data += c);
    proxyRes.on('end', () => {
      lastReqTime = Date.now();
      processing = false;

      if (proxyRes.statusCode === 429 || data.trim().startsWith('<')) {
        responders.forEach(r => r.status(429).json({ error: 'Yahoo rate limit exceeded' }));
        processQueue();
        return;
      }

      try {
        const json = JSON.parse(data);
        const isChart = path.includes('/v8/finance/chart/');
        cache.set(path, { data: json, ts: Date.now(), ttl: isChart ? CACHE_TTL.chart : CACHE_TTL.quote });
        responders.forEach(r => r.json(json));
      } catch {
        responders.forEach(r => r.status(502).json({ error: 'Parse error' }));
      }
      processQueue();
    });
  });

  proxyReq.on('error', (err) => {
    lastReqTime = Date.now();
    processing = false;
    responders.forEach(r => r.status(502).json({ error: err.message }));
    processQueue();
  });

  proxyReq.end();
}

app.use('/api/yahoo-finance', (req, res) => {
  const path = req.url;
  const cached = cache.get(path);
  if (cached && Date.now() - cached.ts < cached.ttl) {
    return res.json(cached.data);
  }
  queue.push({ path, responders: [res] });
  processQueue();
});

// Cleanup stale cache entries
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.ts > v.ttl * 2) cache.delete(k);
}, 120_000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Yahoo Finance proxy running on http://localhost:${PORT}`);
});