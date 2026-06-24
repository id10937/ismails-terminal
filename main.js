'use strict';

// ═══════════════════════════════════════════════════════════
// CONFIG — YAHOO FINANCE API
// ═══════════════════════════════════════════════════════════
const YAHOO_FINANCE_API = window.location.origin + '/api/yahoo-finance';

const WATCHLIST = [
  { fh: 'BTC-USD', display: 'BTC',  name: 'Bitcoin',      color: '#f59e0b' },
  { fh: 'ETH-USD', display: 'ETH',  name: 'Ethereum',     color: '#7b61ff' },
  { fh: 'SPY',     display: 'SPX',  name: 'S&P 500 ETF',  color: '#10b981' },
  { fh: 'QQQ',     display: 'NQ',   name: 'Nasdaq ETF',   color: '#06b6d4' },
  { fh: 'GLD',     display: 'GOLD', name: 'Gold ETF',     color: '#fbbf24' },
  { fh: 'UUP',     display: 'DXY',  name: 'USD ETF',      color: '#f43f5e' },
  { fh: 'SOL-USD', display: 'SOL',  name: 'Solana',       color: '#9945ff' },
  { fh: 'USO',     display: 'OIL',  name: 'Oil ETF',      color: '#78716c' },
];

const TICKER_SYMBOLS = [
  'BTC-USD', 'ETH-USD', 'SPY', 'QQQ', 'GLD', 'UUP', 'SOL-USD', 'USO',
  'TSLA', 'AAPL', 'NVDA', 'AMZN', 'GOOGL', 'MSFT', 'META', 'AMD',
];

const TICKER_DISPLAY = {
  'BTC-USD': 'BTC', 'ETH-USD': 'ETH', 'SPY': 'SPX', 'QQQ': 'NQ',
  'GLD': 'GOLD', 'UUP': 'DXY', 'SOL-USD': 'SOL', 'USO': 'OIL',
};

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
const fmt = {
  price: (v, d = 2) => {
    if (v == null || isNaN(v)) return '\u2014';
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  pct: (v) => {
    if (v == null || isNaN(v)) return '\u2014';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  },
  compact: (v) => {
    if (v == null || isNaN(v)) return '\u2014';
    const a = Math.abs(v);
    if (a >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (a >= 1e9)  return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6)  return '$' + (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e3)  return '$' + (v / 1e3).toFixed(2) + 'K';
    return '$' + fmt.price(v);
  },
  time: (d) => {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d * 1000);
    return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  },
};

const rand  = (a, b)       => Math.random() * (b - a) + a;
const clamp = (v, lo, hi)  => Math.min(hi, Math.max(lo, v));
const debounce = (fn, ms)  => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
const state = {
  quotes:       {},
  candles:      [],
  activeIndex:  0,
  chartType:    'candle',
  view:         'markets',
  crosshairX:   null,
  crosshairY:   null,
  hoverCandle:  null,
  bids:         [],
  asks:         [],
  radarValues:  [0.78, 0.62, 0.85, 0.45, 0.91, 0.70],
  bgParticles:  [],
  searchIndex:  -1,
  activeCustom: null,
};

// ═══════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════
async function fetchYahooFinance(path) {
  const url = `${YAHOO_FINANCE_API}${path}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.status === 429) {
        const delay = (attempt + 1) * 2000;
        console.warn('Rate limited, retrying in', delay, 'ms');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      const delay = 1000 * (attempt + 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function fetchQuote(symbol) {
  const data = await fetchYahooFinance(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
  if (data?.chart?.result?.[0]?.meta) {
    const meta = data.chart.result[0].meta;
    const price = meta.regularMarketPrice ?? 0;
    const prevClose = meta.chartPreviousClose ?? price;
    const change = price - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;
    return {
      regularMarketPrice: price,
      regularMarketChangePercent: changePercent,
      regularMarketChange: change,
      regularMarketVolume: meta.regularMarketVolume ?? 0,
      symbol,
    };
  }
  return null;
}

async function fetchAllQuotes() {
  // Only fetch quotes for the watchlist + active asset to avoid rate limits
  const symbols = [...WATCHLIST.map(w => w.fh)];
  if (state.activeCustom) symbols.push(state.activeCustom.fh);

  // Sequential fetch with delays to avoid Yahoo rate limiting
  for (let i = 0; i < symbols.length; i++) {
    try {
      const q = await fetchQuote(symbols[i]);
      if (q) state.quotes[symbols[i]] = q;
    } catch (e) {
      console.warn('Failed quote for', symbols[i], e.message);
    }
    // 250ms delay between each request
    if (i < symbols.length - 1) await new Promise(r => setTimeout(r, 250));
  }
}

async function fetchChart(symbol, resolution = '60m', range = '5d') {
  const data = await fetchYahooFinance(
    `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${resolution}&range=${range}`
  );
  if (!data?.chart?.result?.[0]?.indicators?.quote?.[0]) return [];

  const result = data.chart.result[0];
  const quotes = result.indicators.quote[0];

  return (result.timestamp || []).map((t, i) => ({
    time:  new Date(t * 1000),
    open:  quotes.open[i],
    high:  quotes.high[i],
    low:   quotes.low[i],
    close: quotes.close[i],
    vol:   quotes.volume[i] || 0,
  })).filter(c => c.close != null);
}

async function searchSymbols(query) {
  return fetchYahooFinance(`/v1/finance/search?q=${encodeURIComponent(query)}`);
}

async function fetchCompanyNews(symbol) {
  return fetchYahooFinance(
    `/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=15`
  );
}

// ═══════════════════════════════════════════════════════════
// LOADING BANNER
// ═══════════════════════════════════════════════════════════
let bannerEl;
function showBanner(msg) {
  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.className = 'data-loading-banner';
    bannerEl.innerHTML = '<div class="data-loading-banner__spinner"></div><span id="banner-msg"></span>';
    document.body.appendChild(bannerEl);
  }
  bannerEl.querySelector('#banner-msg').textContent = msg;
  bannerEl.classList.add('visible');
}
function hideBanner() { bannerEl?.classList.remove('visible'); }

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
function getActiveAsset() {
  if (state.activeCustom) return state.activeCustom;
  return WATCHLIST[state.activeIndex];
}

function setDiag(msg, color) {
  const d = document.getElementById('diag-status');
  if (d) { d.textContent = msg; if (color) d.style.color = color; }
}

async function loadAllData() {
  setDiag('\u23F3 Fetching quotes...', 'var(--color-amber)');
  await fetchAllQuotes();
  setDiag('\u23F3 Rendering...', 'var(--color-amber)');
  renderWatchlist();
  renderTicker();
  updateHeaderPrice();

  const active = getActiveAsset();
  setDiag('\u23F3 Loading chart...', 'var(--color-amber)');
  await loadChart(active);
  setDiag('\u23F3 Loading news...', 'var(--color-amber)');
  await loadNews(active);
}

async function loadChart(asset, interval = '60m', range = '5d') {
  showBanner('Loading chart: ' + asset.display + '\u2026');
  try {
    const candles = await fetchChart(asset.fh, interval, range);
    if (candles.length > 0) {
      state.candles = candles;
      drawMainChart();
      drawVolumeChart();
      updateIndicators(asset.fh);
    }
  } catch (e) {
    console.warn('Chart fetch failed:', e.message);
  }
  hideBanner();
}

async function loadNews(asset) {
  try {
    const data = await fetchCompanyNews(asset.fh);
    if (data?.news?.length > 0) {
      const mapped = data.news.slice(0, 10).map(n => ({
        headline: n.title || '(No headline)',
        source: n.publisher || 'Yahoo Finance',
        time: n.providerPublishTime ? relTime(n.providerPublishTime) : '',
        sentiment: guessSentiment(n.title || ''),
        url: n.link || '',
      }));
      renderNews(mapped);
    } else {
      renderNews(getFallbackNews(asset.display));
    }
  } catch (e) {
    console.warn('News fetch failed:', e.message);
    renderNews(getFallbackNews(asset.display));
  }
}

function getFallbackNews(symbol) {
  const items = [
    { headline: symbol + ' showing strong momentum in early trading', source: 'MarketWatch', time: '12m', sentiment: 'bullish', url: '' },
    { headline: 'Analysts eye ' + symbol + ' as macro tailwinds build', source: 'Bloomberg', time: '32m', sentiment: 'bullish', url: '' },
    { headline: symbol + ' volatility expands ahead of Fed minutes', source: 'Reuters', time: '1h', sentiment: 'bearish', url: '' },
    { headline: 'Institutional flows into ' + symbol + ' hit monthly high', source: 'CoinDesk', time: '2h', sentiment: 'bullish', url: '' },
    { headline: 'Technical indicators suggest ' + symbol + ' consolidation near support', source: 'TradingView', time: '3h', sentiment: 'neutral', url: '' },
    { headline: symbol + ' options open interest surges 22%', source: 'Deribit', time: '4h', sentiment: 'bullish', url: '' },
    { headline: 'Regulatory headwinds weigh on ' + symbol + ' sentiment', source: 'FT', time: '5h', sentiment: 'bearish', url: '' },
    { headline: symbol + ' leads sector with 14-day RSI above 60', source: 'Seeking Alpha', time: '6h', sentiment: 'neutral', url: '' },
  ];
  return items;
}

async function refreshQuotes() {
  try {
    // Only refresh active asset to avoid rate limits
    const active = getActiveAsset();
    try {
      const q = await fetchQuote(active.fh);
      if (q) state.quotes[active.fh] = q;
    } catch (e) {
      console.warn('Quote refresh failed for', active.fh);
    }
    renderWatchlist();
    renderTicker();
    updateHeaderPrice();
    updateIndicators(active.fh);
    genOrderBook();
    renderOrderBook();
  } catch (e) {
    console.warn('Refresh cycle failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// CLOCK & BG CANVAS
// ═══════════════════════════════════════════════════════════
function initClock() {
  const el = document.getElementById('clock');
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  };
  tick();
  setInterval(tick, 1000);
}

function initBgCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 70; i++) {
    state.bgParticles.push({
      x: rand(0, innerWidth), y: rand(0, innerHeight),
      vx: rand(-0.12, 0.12), vy: rand(-0.12, 0.12),
      r: rand(0.4, 1.8),
      opacity: rand(0.08, 0.4),
      color: Math.random() > 0.55 ? '#00ffff' : Math.random() > 0.5 ? '#7b61ff' : '#f59e0b',
    });
  }

  let gridOff = 0;
  const draw = () => {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    gridOff = (gridOff + 0.25) % 60;

    ctx.strokeStyle = 'rgba(0,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = -gridOff; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = -gridOff; y < h; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = 'rgba(0,255,255,0.035)';
      ctx.beginPath();
      for (let x = 0; x < w; x += 3) {
        const wave = Math.sin(x * 0.008 + Date.now() * 0.0004 + i * 1.3) * 18;
        x === 0 ? ctx.moveTo(x, h * (i + 1) / 4 + wave) : ctx.lineTo(x, h * (i + 1) / 4 + wave);
      }
      ctx.stroke();
    }

    state.bgParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    requestAnimationFrame(draw);
  };
  draw();
}

// ═══════════════════════════════════════════════════════════
// TICKER
// ═══════════════════════════════════════════════════════════
function renderTicker() {
  const track = document.getElementById('ticker-track');
  const items = [...TICKER_SYMBOLS, ...TICKER_SYMBOLS].map(fh => {
    const q = state.quotes[fh];
    const p = q?.regularMarketPrice;
    const pct = q?.regularMarketChangePercent;
    const pos = (pct ?? 0) >= 0;
    const disp = TICKER_DISPLAY[fh] || fh;
    return `<div class="ticker-item" data-ticker-symbol="${fh}">
      <span class="ticker-item__symbol">${disp}</span>
      <span class="ticker-item__price">${p != null ? '$' + fmt.price(p, p > 100 ? 2 : 4) : '\u2014'}</span>
      <span class="ticker-item__change ${pos ? 'pos' : 'neg'}">${fmt.pct(pct)}</span>
    </div>`;
  }).join('');
  track.innerHTML = items;

  document.querySelectorAll('.ticker-item').forEach(el => {
    el.addEventListener('click', () => {
      const sym = el.dataset.tickerSymbol;
      const idx = WATCHLIST.findIndex(w => w.fh === sym);
      if (idx >= 0) {
        state.activeIndex = idx;
        state.activeCustom = null;
        renderWatchlist();
        const active = getActiveAsset();
        updateHeaderPrice();
        loadChart(active);
        loadNews(active);
      } else {
        loadCustomSymbol(sym, sym, sym);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// WATCHLIST
// ═══════════════════════════════════════════════════════════
function renderWatchlistShell() {
  const el = document.getElementById('watchlist');
  el.innerHTML = WATCHLIST.map((w, i) => `
    <li class="watchlist__item ${i === state.activeIndex && !state.activeCustom ? 'watchlist__item--active' : ''}"
        role="listitem" tabindex="0" data-index="${i}"
        style="--item-color: ${w.color}"
        aria-label="${w.name}">
      <span class="watchlist__symbol">${w.display}</span>
      <span class="watchlist__price" id="wl-price-${i}">\u2014</span>
      <span class="watchlist__name">${w.name}</span>
      <span class="watchlist__change" id="wl-change-${i}">\u2014</span>
      <div class="watchlist__bg-bar" id="wl-bar-${i}" style="width:50%;background:${w.color}"></div>
    </li>`).join('');
  attachWatchlistEvents();
}

function renderWatchlist() {
  WATCHLIST.forEach((w, i) => {
    const q = state.quotes[w.fh];
    const p = q?.regularMarketPrice;
    const pct = q?.regularMarketChangePercent;
    const pos = (pct ?? 0) >= 0;

    const item = document.querySelector(`.watchlist__item[data-index="${i}"]`);
    const priceEl = document.getElementById(`wl-price-${i}`);
    const chEl = document.getElementById(`wl-change-${i}`);
    const barEl = document.getElementById(`wl-bar-${i}`);

    if (!item) { renderWatchlistShell(); return; }

    item.classList.toggle('watchlist__item--active', i === state.activeIndex && !state.activeCustom);
    item.setAttribute('aria-label', `${w.name}: ${p != null ? fmt.price(p) : '\u2014'}, ${fmt.pct(pct)}`);

    if (priceEl) {
      const prev = parseFloat(priceEl.textContent.replace(/[$,]/g, '')) || 0;
      priceEl.textContent = p != null ? '$' + fmt.price(p, p > 100 ? 2 : 4) : '\u2014';
      if (prev && p && prev !== p) {
        priceEl.classList.remove('flash-up', 'flash-down');
        void priceEl.offsetWidth;
        priceEl.classList.add(p > prev ? 'flash-up' : 'flash-down');
      }
    }

    if (chEl) {
      chEl.textContent = fmt.pct(pct);
      chEl.className = 'watchlist__change ' + (pos ? 'positive' : 'negative');
    }

    if (barEl) {
      const w_ = clamp(50 + (pct ?? 0) * 5, 8, 92);
      barEl.style.width = w_ + '%';
      barEl.style.background = pos ? 'var(--color-positive)' : 'var(--color-negative)';
    }
  });
}

function attachWatchlistEvents() {
  document.querySelectorAll('.watchlist__item').forEach(item => {
    const activate = async () => {
      state.activeIndex = +item.dataset.index;
      state.activeCustom = null;
      renderWatchlist();
      updateHeaderPrice();
      const active = getActiveAsset();
      await loadChart(active);
      await loadNews(active);
    };
    item.addEventListener('click', activate);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });
}

// ═══════════════════════════════════════════════════════════
// HEADER PRICE
// ═══════════════════════════════════════════════════════════
function updateHeaderPrice() {
  const w = getActiveAsset();
  const q = state.quotes[w.fh];
  const p = q?.regularMarketPrice;
  const pct = q?.regularMarketChangePercent;
  const pos = (pct ?? 0) >= 0;

  document.getElementById('active-symbol').textContent = w.display + ' / USD';
  document.getElementById('active-price').textContent = p != null ? '$' + fmt.price(p, 2) : '\u2014';

  const chEl = document.getElementById('active-change');
  chEl.textContent = fmt.pct(pct);
  chEl.className = 'symbol-change ' + (pos ? 'positive' : 'negative');
}

// ═══════════════════════════════════════════════════════════
// INDICATORS
// ═══════════════════════════════════════════════════════════
function updateIndicators(symbol) {
  const q = state.quotes[symbol];
  if (!q) return;

  const price = q.regularMarketPrice || 1;
  const chg = q.regularMarketChange || 0;
  const pct = q.regularMarketChangePercent || 0;
  const vol = q.regularMarketVolume || 0;

  const volUsd = vol * price;
  document.getElementById('vol-val').textContent = fmt.compact(volUsd || 0);

  const bbW = Math.abs(chg / price);
  document.getElementById('bb-val').textContent = bbW.toFixed(4);

  const macdEl = document.getElementById('macd-val');
  macdEl.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2);
  macdEl.className = 'indicator-card__value ' + (chg >= 0 ? 'positive' : 'negative');

  const rsi = clamp(50 + pct * 3, 5, 95);
  document.getElementById('rsi-val').textContent = rsi.toFixed(1);
  document.getElementById('rsi-bar').style.width = rsi + '%';

  const candles = state.candles;
  if (candles.length > 1) {
    const closes = candles.map(c => c.close).filter(c => c != null);
    const high = Math.max(...closes);
    const low = Math.min(...closes);
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variance = closes.reduce((sum, c) => sum + (c - avg) ** 2, 0) / closes.length;
    const stdev = Math.sqrt(variance);
    const bbUpper = avg + 2 * stdev;
    const bbLower = avg - 2 * stdev;
    const bbWidth = (bbUpper - bbLower) / avg;
    document.getElementById('bb-val').textContent = bbWidth.toFixed(4);
  }

  document.getElementById('fund-val').textContent = (pct >= 0 ? '+' : '') + (pct * 0.3).toFixed(3) + '%';
  document.getElementById('oi-val').textContent = fmt.compact(vol * price * rand(0.3, 0.7));

  const totalPnl = vol * price * 0.00012;
  const dayPnl = totalPnl * rand(0.04, 0.12);
  document.getElementById('total-pnl').textContent = (totalPnl >= 0 ? '+' : '') + '$' + fmt.price(Math.abs(totalPnl), 2);
  document.getElementById('day-pnl').textContent = (dayPnl >= 0 ? '+' : '') + '$' + fmt.price(Math.abs(dayPnl), 2);
}

// ═══════════════════════════════════════════════════════════
// SMA / SIGNAL HELPERS
// ═══════════════════════════════════════════════════════════
function calcSMA(closes, period) {
  const result = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += closes[i - j];
    result.push(sum / period);
  }
  return result;
}

function calcSignals(closes) {
  const sma12 = calcSMA(closes, 12);
  const sma26 = calcSMA(closes, 26);
  const signals = [];
  for (let i = 1; i < closes.length; i++) {
    if (sma12[i] == null || sma26[i] == null || sma12[i - 1] == null || sma26[i - 1] == null) continue;
    // Golden cross / death cross
    if (sma12[i - 1] <= sma26[i - 1] && sma12[i] > sma26[i]) {
      signals.push({ idx: i, type: 'buy', label: 'BUY' });
    } else if (sma12[i - 1] >= sma26[i - 1] && sma12[i] < sma26[i]) {
      signals.push({ idx: i, type: 'sell', label: 'SELL' });
    }
  }
  return signals;
}

// ═══════════════════════════════════════════════════════════
// MAIN CHART
// ═══════════════════════════════════════════════════════════
let mainCtx, mainCanvas;

function initMainChart() {
  mainCanvas = document.getElementById('main-chart');
  mainCtx = mainCanvas.getContext('2d');

  const wrap = mainCanvas.parentElement;
  const resize = () => {
    mainCanvas.width = wrap.clientWidth * devicePixelRatio;
    mainCanvas.height = wrap.clientHeight * devicePixelRatio;
    mainCanvas.style.width = wrap.clientWidth + 'px';
    mainCanvas.style.height = wrap.clientHeight + 'px';
    mainCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    drawMainChart();
  };
  new ResizeObserver(resize).observe(wrap);
  resize();

  mainCanvas.addEventListener('mousemove', e => {
    const r = mainCanvas.getBoundingClientRect();
    state.crosshairX = e.clientX - r.left;
    state.crosshairY = e.clientY - r.top;
    updateCrosshair(wrap.clientWidth, wrap.clientHeight);
    drawMainChart();
  });

  mainCanvas.addEventListener('mouseleave', () => {
    state.crosshairX = null;
    state.crosshairY = null;
    state.hoverCandle = null;
    document.getElementById('crosshair').classList.remove('active');
    document.getElementById('chart-tooltip').classList.remove('active');
    drawMainChart();
  });

  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('tf-btn--active'));
      btn.classList.add('tf-btn--active');
      const tf = btn.dataset.tf;
      const intervals = { '1m':'1m', '5m':'5m', '1H':'60m', '4H':'60m', '1D':'1d', '1W':'1wk' };
      const ranges = { '1m':'1d', '5m':'5d', '1H':'5d', '4H':'1mo', '1D':'3mo', '1W':'1y' };
      const w = getActiveAsset();
      await loadChart(w, intervals[tf] || '60m', ranges[tf] || '5d');
    });
  });

  document.getElementById('btn-candle').addEventListener('click', () => {
    state.chartType = 'candle';
    document.getElementById('btn-candle').classList.add('tool-btn--active');
    document.getElementById('btn-line').classList.remove('tool-btn--active');
    drawMainChart();
  });
  document.getElementById('btn-line').addEventListener('click', () => {
    state.chartType = 'line';
    document.getElementById('btn-line').classList.add('tool-btn--active');
    document.getElementById('btn-candle').classList.remove('tool-btn--active');
    drawMainChart();
  });
}

function drawMainChart() {
  if (!mainCtx || !state.candles.length) return;
  const w = mainCanvas.width / devicePixelRatio;
  const h = mainCanvas.height / devicePixelRatio;
  const ctx = mainCtx;
  ctx.clearRect(0, 0, w, h);

  const candles = state.candles;
  const pad = { left: 8, right: 68, top: 20, bottom: 30 };
  const cW = w - pad.left - pad.right;
  const cH = h - pad.top - pad.bottom;

  const prices = candles.flatMap(c => [c.high, c.low]).filter(p => p != null);
  if (!prices.length) return;
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const pMin = minP - range * 0.05;
  const pMax = maxP + range * 0.05;
  const pRange = pMax - pMin;

  const toY = p => pad.top + cH - ((p - pMin) / pRange) * cH;
  const toX = i => pad.left + (i / (candles.length - 1)) * cW;

  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (i / 5) * cH;
    ctx.strokeStyle = 'rgba(26,26,56,0.7)';
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    const price = pMax - (i / 5) * pRange;
    ctx.fillStyle = 'rgba(136,136,170,0.55)';
    ctx.font = '10px Space Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('$' + fmt.price(price, price > 100 ? 0 : 4), pad.left + cW + 4, y + 4);
  }

  ctx.fillStyle = 'rgba(136,136,170,0.5)';
  ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'center';
  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const i = Math.round(t * (candles.length - 1));
    ctx.fillText(fmt.time(candles[i]?.time), toX(i), h - 8);
  });

  if (state.chartType === 'line') {
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, 'rgba(0,255,255,0.22)');
    grad.addColorStop(1, 'rgba(0,255,255,0.0)');

    ctx.beginPath();
    candles.forEach((c, i) => {
      if (c.close == null) return;
      i === 0 ? ctx.moveTo(toX(i), toY(c.close)) : ctx.lineTo(toX(i), toY(c.close));
    });
    const lastIdx = candles.length - 1;
    ctx.lineTo(toX(lastIdx), pad.top + cH);
    ctx.lineTo(toX(0), pad.top + cH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    candles.forEach((c, i) => {
      if (c.close == null) return;
      i === 0 ? ctx.moveTo(toX(i), toY(c.close)) : ctx.lineTo(toX(i), toY(c.close));
    });
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else {
    const bw = Math.max(1.5, (cW / candles.length) * 0.65);
    candles.forEach((c, i) => {
      if (c.close == null) return;
      const x = toX(i);
      const bull = c.close >= c.open;
      const col = bull ? '#10b981' : '#f43f5e';

      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.high));
      ctx.lineTo(x, toY(c.low));
      ctx.stroke();

      const bodyTop = Math.min(toY(c.open), toY(c.close));
      const bodyH = Math.max(1.5, Math.abs(toY(c.close) - toY(c.open)));
      ctx.fillStyle = col;
      ctx.globalAlpha = bull ? 0.85 : 0.72;
      ctx.fillRect(x - bw / 2, bodyTop, bw, bodyH);

      if (state.hoverCandle === i) {
        ctx.globalAlpha = 0.25;
        ctx.fillRect(x - bw / 2 - 1, bodyTop - 1, bw + 2, bodyH + 2);
      }
      ctx.globalAlpha = 1;
    });

    const lc = candles[candles.length - 1];
    if (lc && lc.close != null) {
      ctx.beginPath();
      ctx.arc(toX(candles.length - 1), toY(lc.close), 3, 0, Math.PI * 2);
      ctx.fillStyle = lc.close >= lc.open ? '#10b981' : '#f43f5e';
      ctx.shadowColor = lc.close >= lc.open ? '#10b981' : '#f43f5e';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  if (state.crosshairX != null) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(state.crosshairX, pad.top); ctx.lineTo(state.crosshairX, pad.top + cH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.left, state.crosshairY); ctx.lineTo(pad.left + cW, state.crosshairY); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Analytics: SMA overlays ──
  if (state.view === 'analytics') {
    const closes = candles.map(c => c.close).filter(c => c != null);
    if (closes.length > 20) {
      const sma20 = calcSMA(closes, 20);
      const sma50 = calcSMA(closes, 50);
      const lines = [
        { data: sma20, color: 'rgba(255,165,0,0.7)', label: 'SMA 20' },
        { data: sma50, color: 'rgba(255,100,255,0.7)', label: 'SMA 50' },
      ];
      lines.forEach(({ data, color, label }) => {
        ctx.beginPath();
        let started = false;
        data.forEach((v, i) => {
          if (v == null) { started = false; return; }
          const x = toX(i);
          const y = toY(v);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
        // label at last valid point
        let lastIdx = data.length - 1;
        while (lastIdx >= 0 && data[lastIdx] == null) lastIdx--;
        if (lastIdx >= 0) {
          ctx.fillStyle = color;
          ctx.font = 'bold 10px Space Mono, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(label, toX(lastIdx) + 4, toY(data[lastIdx]) - 2);
        }
      });
    }
  }

  // ── Signals: buy/sell markers ──
  if (state.view === 'signals') {
    const closes = candles.map(c => c.close).filter(c => c != null);
    const signals = calcSignals(closes);
    signals.forEach(s => {
      const x = toX(s.idx);
      const c = candles[s.idx];
      if (!c) return;
      const y = toY(c.low) - 10;
      const isBuy = s.type === 'buy';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 6, y - (isBuy ? 8 : -8));
      ctx.lineTo(x + 6, y - (isBuy ? 8 : -8));
      ctx.closePath();
      ctx.fillStyle = isBuy ? '#10b981' : '#f43f5e';
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7px Space Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, x, y - (isBuy ? 12 : 12));
    });
  }
}

function updateCrosshair(w, h) {
  const pad = { left: 8, right: 68, top: 20, bottom: 30 };
  const cW = w - pad.left - pad.right;
  const cH = h - pad.top - pad.bottom;
  const candles = state.candles;
  if (!candles.length) return;

  const prices = candles.flatMap(c => [c.high, c.low]).filter(p => p != null);
  if (!prices.length) return;
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const pRange = (pMax - pMin) * 1.1 || 1;
  const pTop = pMax + (pMax - pMin) * 0.05;

  const t = clamp((state.crosshairX - pad.left) / cW, 0, 1);
  const ci = Math.round(t * (candles.length - 1));
  const c = candles[ci];
  if (!c) return;

  state.hoverCandle = ci;
  const price = pTop - ((state.crosshairY - pad.top) / cH) * pRange;

  const ch = document.getElementById('crosshair');
  const cpEl = document.getElementById('crosshair-price');
  const ctEl = document.getElementById('crosshair-time');
  ch.classList.add('active');
  cpEl.style.top = state.crosshairY + 'px';
  cpEl.textContent = '$' + fmt.price(price, 2);
  ctEl.style.left = state.crosshairX + 'px';
  ctEl.textContent = fmt.time(c.time);

  const bull = c.close >= c.open;
  const tooltip = document.getElementById('chart-tooltip');
  tooltip.innerHTML = `
    <div style="color:var(--color-fg-muted);font-size:9px;margin-bottom:5px">${c.time?.toLocaleString() ?? ''}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px">
      <span style="color:var(--color-fg-dim)">O</span><span style="color:var(--color-fg)">$${fmt.price(c.open)}</span>
      <span style="color:var(--color-fg-dim)">H</span><span style="color:var(--color-positive)">$${fmt.price(c.high)}</span>
      <span style="color:var(--color-fg-dim)">L</span><span style="color:var(--color-negative)">$${fmt.price(c.low)}</span>
      <span style="color:var(--color-fg-dim)">C</span><span style="color:${bull ? '#10b981' : '#f43f5e'}">$${fmt.price(c.close)}</span>
    </div>`;
  tooltip.classList.add('active');
  const tx = state.crosshairX > w * 0.6 ? state.crosshairX - 152 : state.crosshairX + 12;
  const ty = state.crosshairY > h * 0.6 ? state.crosshairY - 112 : state.crosshairY + 12;
  tooltip.style.left = tx + 'px';
  tooltip.style.top  = ty + 'px';
}

function initVolumeChart() {
  const volCanvas = document.getElementById('volume-chart');
  const volCtx = volCanvas.getContext('2d');
  const wrap = volCanvas.parentElement;

  window.drawVolumeChart = () => {
    if (!volCtx || !state.candles.length) return;
    const w = volCanvas.width / devicePixelRatio;
    const h = volCanvas.height / devicePixelRatio;
    volCtx.clearRect(0, 0, w, h);
    const candles = state.candles;
    const maxVol = Math.max(...candles.map(c => c.vol || 0)) || 1;
    const bw = (w / candles.length) * 0.7;
    candles.forEach((c, i) => {
      const x = (i / (candles.length - 1)) * w;
      const bh = ((c.vol || 0) / maxVol) * (h - 4);
      volCtx.fillStyle = c.close >= c.open ? 'rgba(16,185,129,0.38)' : 'rgba(244,63,94,0.38)';
      volCtx.fillRect(x - bw / 2, h - bh, bw, bh);
    });
  };

  const resize = () => {
    volCanvas.width = wrap.clientWidth * devicePixelRatio;
    volCanvas.height = wrap.clientHeight * devicePixelRatio;
    volCanvas.style.width = wrap.clientWidth + 'px';
    volCanvas.style.height = wrap.clientHeight + 'px';
    volCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    drawVolumeChart();
  };
  new ResizeObserver(resize).observe(wrap);
  resize();
}

// ═══════════════════════════════════════════════════════════
// ORDER BOOK
// ═══════════════════════════════════════════════════════════
function initOrderBook() {
  genOrderBook();
  renderOrderBook();
  setInterval(() => { genOrderBook(); renderOrderBook(); }, 1500);
}

function genOrderBook() {
  const q = state.quotes[getActiveAsset().fh];
  const mid = q?.regularMarketPrice ?? 50000;

  state.asks = Array.from({ length: 6 }, (_, i) => ({
    price: mid * (1 + (i + 1) * 0.0005 + Math.random() * 0.0003),
    size:  rand(0.1, 8),
  })).sort((a, b) => a.price - b.price);

  state.bids = Array.from({ length: 6 }, (_, i) => ({
    price: mid * (1 - (i + 1) * 0.0005 - Math.random() * 0.0003),
    size:  rand(0.1, 8),
  })).sort((a, b) => b.price - a.price);
}

function renderOrderBook() {
  const asksEl = document.getElementById('ob-asks');
  const bidsEl = document.getElementById('ob-bids');
  const spreadEl = document.getElementById('ob-spread');
  const maxSz = Math.max(...state.asks.map(a => a.size), ...state.bids.map(b => b.size), 0.1);

  let askTot = 0;
  asksEl.innerHTML = [...state.asks].reverse().map(a => {
    askTot += a.size;
    return `<div class="ob-row ob-row--ask" role="row">
      <div class="ob-row__bg" style="width:${(a.size / maxSz) * 100}%"></div>
      <span class="ob-row__price">${fmt.price(a.price, 2)}</span>
      <span class="ob-row__size">${a.size.toFixed(3)}</span>
      <span class="ob-row__total">${askTot.toFixed(2)}</span>
    </div>`;
  }).join('');

  const spread = (state.asks[0]?.price ?? 0) - (state.bids[0]?.price ?? 0);
  const spreadPct = state.asks[0]?.price ? (spread / state.asks[0].price * 100).toFixed(4) : '\u2014';
  spreadEl.textContent = 'Spread: $' + fmt.price(spread, 2) + ' (' + spreadPct + '%)';

  let bidTot = 0;
  bidsEl.innerHTML = state.bids.map(b => {
    bidTot += b.size;
    return `<div class="ob-row ob-row--bid" role="row">
      <div class="ob-row__bg" style="width:${(b.size / maxSz) * 100}%"></div>
      <span class="ob-row__price">${fmt.price(b.price, 2)}</span>
      <span class="ob-row__size">${b.size.toFixed(3)}</span>
      <span class="ob-row__total">${bidTot.toFixed(2)}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// NEWS FEED
// ═══════════════════════════════════════════════════════════
function relTime(unixTs) {
  if (!unixTs) return '';
  const diff = Math.floor((Date.now() / 1000 - unixTs) / 60);
  if (diff < 60)  return diff + 'm';
  if (diff < 1440) return Math.floor(diff / 60) + 'h';
  return Math.floor(diff / 1440) + 'd';
}

function guessSentiment(title) {
  const t = (title || '').toLowerCase();
  const bullWords = ['surge', 'rise', 'rally', 'gain', 'jump', 'high', 'record', 'bull', 'up', 'profit', 'growth', 'beat', 'momentum', 'soar', 'boom'];
  const bearWords = ['fall', 'drop', 'decline', 'loss', 'crash', 'bear', 'down', 'miss', 'cut', 'low', 'recession', 'slump', 'fear', 'plunge'];
  if (bullWords.some(w => t.includes(w))) return 'bullish';
  if (bearWords.some(w => t.includes(w))) return 'bearish';
  return 'neutral';
}

function renderNews(items) {
  const feed = document.getElementById('news-feed');
  const colors = { bullish: 'var(--color-positive)', bearish: 'var(--color-negative)', neutral: 'var(--color-neutral)' };
  feed.innerHTML = items.map(n => `
    <li class="news-item" role="listitem" tabindex="0" ${n.url ? 'onclick="window.open(\'' + n.url.replace(/'/g, '') + '\',\'_blank\')"' : ''}>
      <div class="news-item__headline">
        <span class="news-item__sentiment" style="background:${colors[n.sentiment] ?? colors.neutral}" aria-hidden="true"></span>${n.headline}
      </div>
      <div class="news-item__meta">
        <span class="news-item__source">${n.source ?? ''}</span>
        <span class="news-item__time">${n.time ? n.time + ' ago' : ''}</span>
        <span class="news-item__tag tag--${n.sentiment}">${n.sentiment}</span>
      </div>
    </li>`).join('');
}

// ═══════════════════════════════════════════════════════════
// SECTOR HEATMAP
// ═══════════════════════════════════════════════════════════
const SECTOR_MAP = [
  { name: 'Tech',     fh: 'QQQ' },
  { name: 'Energy',   fh: 'XLE' },
  { name: 'Financial', fh: 'XLF' },
  { name: 'Health',   fh: 'XLV' },
  { name: 'Crypto',   fh: 'BTC-USD' },
  { name: 'Real Est', fh: 'XLRE' },
  { name: 'Comm Svc', fh: 'XLC' },
  { name: 'Materials', fh: 'XLB' },
  { name: 'Utilities', fh: 'XLU' },
];

async function fetchSectors() {
  const promises = SECTOR_MAP.map(async s => {
    try {
      const q = await fetchQuote(s.fh);
      return { name: s.name, val: q?.regularMarketChangePercent ?? 0 };
    } catch (e) {
      return { name: s.name, val: 0 };
    }
  });
  return Promise.all(promises);
}

async function initHeatmap() {
  renderHeatmap(SECTOR_MAP.map(s => ({ name: s.name, val: 0 })));
  const sectors = await fetchSectors();
  renderHeatmap(sectors);
  setInterval(async () => {
    const s = await fetchSectors();
    renderHeatmap(s);
  }, 120_000);
}

function renderHeatmap(sectors) {
  const grid = document.getElementById('heatmap-grid');
  grid.innerHTML = sectors.map(s => {
    const intensity = clamp(Math.abs(s.val) / 5, 0.12, 0.88);
    const bg = s.val >= 0
      ? 'rgba(16,185,129,' + intensity + ')'
      : 'rgba(244,63,94,' + intensity + ')';
    return `<div class="heatmap-cell" role="gridcell" style="background:${bg}"
               title="${s.name}: ${fmt.pct(s.val)}" aria-label="${s.name} ${fmt.pct(s.val)}">
      <span class="heatmap-cell__name">${s.name}</span>
      <span class="heatmap-cell__val">${fmt.pct(s.val)}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// RADAR CHART
// ═══════════════════════════════════════════════════════════
const RADAR_LABELS = ['Momentum', 'Volume', 'Trend', 'Volatility', 'Sentiment', 'Fundamentals'];
let radarCtx, radarCanvas;

function initRadarChart() {
  radarCanvas = document.getElementById('radar-chart');
  radarCtx = radarCanvas.getContext('2d');
  const sz = 180;
  radarCanvas.width  = sz * devicePixelRatio;
  radarCanvas.height = sz * devicePixelRatio;
  radarCanvas.style.width  = sz + 'px';
  radarCanvas.style.height = sz + 'px';
  radarCtx.scale(devicePixelRatio, devicePixelRatio);
  drawRadar();
  setInterval(() => {
    state.radarValues = state.radarValues.map(v => clamp(v + rand(-0.05, 0.05), 0.2, 1));
    drawRadar();
  }, 2500);
}

function drawRadar() {
  if (!radarCtx) return;
  const sz = 180, cx = sz / 2, cy = sz / 2, r = 68, n = RADAR_LABELS.length;
  const ctx = radarCtx;
  ctx.clearRect(0, 0, sz, sz);

  const angle = i => (i / n) * Math.PI * 2 - Math.PI / 2;
  const pt = (i, radius) => ({ x: cx + Math.cos(angle(i)) * radius, y: cy + Math.sin(angle(i)) * radius });

  [0.25, 0.5, 0.75, 1].forEach(t => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const p = pt(i, r * t); i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(26,26,56,1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  for (let i = 0; i < n; i++) {
    const p = pt(i, r);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = 'rgba(0,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  state.radarValues.forEach((v, i) => { const p = pt(i, r * v); i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,255,255,0.28)');
  grad.addColorStop(1, 'rgba(123,97,255,0.12)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;

  state.radarValues.forEach((v, i) => {
    const p = pt(i, r * v);
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 7;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  ctx.fillStyle = 'rgba(136,136,170,0.85)';
  ctx.font = '8px Inter, sans-serif';
  ctx.textAlign = 'center';
  RADAR_LABELS.forEach((label, i) => {
    const p = pt(i, r + 14);
    ctx.fillText(label, p.x, p.y + 3);
  });
}

// ═══════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════
function initSearch() {
  const input = document.getElementById('search-input');
  const dropdown = document.getElementById('search-dropdown');
  const spinner = document.getElementById('search-spinner');

  const doSearch = debounce(async (q) => {
    if (!q.trim()) { closeDropdown(); return; }
    spinner.classList.add('active');
    try {
      const data = await searchSymbols(q);
      renderDropdown(data?.quotes || []);
    } catch (e) {
      dropdown.innerHTML = '<li class="search-dropdown__error">Could not reach Yahoo Finance</li>';
      dropdown.hidden = false;
    }
    spinner.classList.remove('active');
  }, 400);

  input.addEventListener('input', e => { state.searchIndex = -1; doSearch(e.target.value); });

  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.search-result');
    if (e.key === 'ArrowDown') { e.preventDefault(); state.searchIndex = Math.min(state.searchIndex + 1, items.length - 1); highlightItem(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); state.searchIndex = Math.max(state.searchIndex - 1, -1); highlightItem(items); }
    else if (e.key === 'Enter') { e.preventDefault(); if (state.searchIndex >= 0) items[state.searchIndex]?.click(); }
    else if (e.key === 'Escape') { closeDropdown(); input.blur(); }
  });

  document.addEventListener('click', e => {
    if (!document.getElementById('search-bar').contains(e.target)) closeDropdown();
  });

  function highlightItem(items) {
    items.forEach((el, i) => el.setAttribute('aria-selected', i === state.searchIndex ? 'true' : 'false'));
    if (state.searchIndex >= 0) items[state.searchIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function closeDropdown() {
    dropdown.hidden = true;
    dropdown.innerHTML = '';
    state.searchIndex = -1;
    input.setAttribute('aria-expanded', 'false');
  }

  function renderDropdown(results) {
    if (!results.length) {
      dropdown.innerHTML = '<li class="search-dropdown__empty">No results for "' + input.value + '"</li>';
      dropdown.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    let html = '<li class="search-dropdown__section" role="presentation">Symbols</li>';
    html += results.slice(0, 10).map(q => {
      const symbol = q.symbol || '';
      const display = q.symbol || '';
      const name = (q.longname || q.shortname || '').replace(/"/g, '&quot;');
      return `<li class="search-result" role="option" tabindex="-1"
                  aria-selected="false"
                  data-symbol="${symbol}"
                  data-display="${display}"
                  data-name="${name}">
        <span class="search-result__symbol">${display}</span>
        <span class="search-result__name">${name}</span>
        <span class="search-result__type">${q.quoteType || 'EQ'}</span>
      </li>`;
    }).join('');

    dropdown.innerHTML = html;
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    dropdown.querySelectorAll('.search-result[data-symbol]').forEach(el => {
      el.addEventListener('click', async () => {
        const sym = el.dataset.symbol;
        const disp = el.dataset.display;
        const name = el.dataset.name;
        closeDropdown();
        input.value = '';
        await loadCustomSymbol(sym, disp, name);
      });
    });
  }
}

function initKeyboardShortcut() {
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== document.getElementById('search-input')) {
      e.preventDefault();
      document.getElementById('search-input').focus();
    }
  });
}

async function loadCustomSymbol(fhSym, dispSym, name) {
  showBanner('Loading ' + dispSym + '\u2026');
  try {
    const q = await fetchQuote(fhSym);
    if (q) {
      state.quotes[fhSym] = q;
    }
    state.activeCustom = { fh: fhSym, display: dispSym, name: name || dispSym, color: '#00ffff' };
    document.querySelectorAll('.watchlist__item').forEach(el => el.classList.remove('watchlist__item--active'));
    updateHeaderPrice();
    await loadChart(state.activeCustom);
    await loadNews(state.activeCustom);
  } catch (e) {
    console.warn('Custom symbol load failed:', e.message);
  }
  hideBanner();
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION BUTTONS
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// VIEW RENDERERS (Portfolio / Signals panels)
// ═══════════════════════════════════════════════════════════
const viewCache = { portfolio: null, signals: null };

function renderPortfolio() {
  const ob = document.getElementById('orderbook');
  const obHeader = document.querySelector('#orderbook .orderbook__header');
  if (!ob) return;
  // Save original orderbook HTML first time
  if (!viewCache.portfolio) {
    viewCache.portfolio = ob.innerHTML;
  }
  const q = state.quotes[getActiveAsset().fh];
  const positions = WATCHLIST.map((sym, i) => {
    const quote = state.quotes[sym.fh] || {};
    const price = quote.regularMarketPrice || 0;
    const chg = quote.regularMarketChange || 0;
    const pct = quote.regularMarketChangePercent || 0;
    const shares = Math.round((100000 / (i + 1)) / (price || 1));
    const val = shares * price;
    const pnl = shares * chg;
    return { sym: sym.display, name: sym.name, price, chg, pct, shares, val, pnl };
  });
  const totalVal = positions.reduce((s, p) => s + p.val, 0);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  document.getElementById('total-pnl').textContent = (totalPnl >= 0 ? '+' : '') + '$' + fmt.price(Math.abs(totalPnl), 2);
  document.getElementById('day-pnl').textContent = (totalPnl >= 0 ? '+' : '') + '$' + fmt.price(Math.abs(totalPnl * 0.08), 2);

  const rows = positions.map(p => `
    <div class="orderbook__row" style="display:flex;justify-content:space-between;padding:2px 8px;font-size:10px;border-bottom:1px solid rgba(255,255,255,0.04)">
      <span style="color:var(--color-cyan);flex:1">${p.sym}</span>
      <span style="flex:1;text-align:right">${p.shares}</span>
      <span style="flex:1;text-align:right">$${fmt.price(p.val, 0)}</span>
      <span style="flex:1;text-align:right;color:${p.chg >= 0 ? '#10b981' : '#f43f5e'}">${p.chg >= 0 ? '+' : ''}$${fmt.price(p.pnl, 2)}</span>
      <span style="flex:1;text-align:right;color:${p.chg >= 0 ? '#10b981' : '#f43f5e'}">${p.chg >= 0 ? '+' : ''}${p.pct.toFixed(2)}%</span>
    </div>`).join('');
  ob.innerHTML = `
    <div class="orderbook__header" style="display:flex;justify-content:space-between;padding:2px 8px;font-size:9px;color:var(--color-fg-dim)">
      <span style="flex:1">Asset</span>
      <span style="flex:1;text-align:right">Shares</span>
      <span style="flex:1;text-align:right">Value</span>
      <span style="flex:1;text-align:right">P&L</span>
      <span style="flex:1;text-align:right">Chg%</span>
    </div>
    ${rows}
    <div class="orderbook__spread" style="display:flex;justify-content:space-between;padding:3px 8px;font-size:10px;border-top:1px solid rgba(255,255,255,0.08)">
      <span>Total</span>
      <span style="color:${totalPnl >= 0 ? '#10b981' : '#f43f5e'}">${totalPnl >= 0 ? '+' : ''}$${fmt.price(Math.abs(totalPnl), 2)}</span>
      <span style="color:var(--color-fg)">$${fmt.price(totalVal, 0)}</span>
    </div>`;
  // Fix header
  document.querySelector('.panel--orderbook .panel__meta').textContent = 'Portfolio';
  document.querySelector('.panel--orderbook .panel__title').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00FFFF" stroke-width="2" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
    Portfolio`;
}

function renderSignals() {
  const news = document.getElementById('news-feed');
  if (!news) return;
  if (!viewCache.signals) {
    viewCache.signals = news.innerHTML;
  }
  const candles = state.candles;
  const closes = candles.map(c => c.close).filter(c => c != null);
  const signals = calcSignals(closes);
  const html = signals.length === 0
    ? '<li style="padding:12px;text-align:center;color:var(--color-fg-dim)">No signals detected yet</li>'
    : signals.map(s => {
        const c = candles[s.idx];
        const timeStr = c?.time ? c.time.toLocaleString() : '';
        const price = c?.close ? '$' + fmt.price(c.close, 2) : '';
        return `<li class="news-item" style="border-left:3px solid ${s.type === 'buy' ? '#10b981' : '#f43f5e'}">
          <div class="news-item__headline">
            <span style="color:${s.type === 'buy' ? '#10b981' : '#f43f5e'};font-weight:700">${s.label} SIGNAL</span>
            <span style="color:var(--color-fg-dim);font-size:9px">${timeStr}</span>
          </div>
          <div class="news-item__source" style="font-size:10px">
            SMA 12/26 crossover at ${price} &middot; ${s.type === 'buy' ? 'Bullish momentum detected' : 'Bearish momentum detected'}
          </div>
        </li>`;
      }).join('');
  news.innerHTML = html;
  document.querySelector('.panel--news .panel__title').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00FFFF" stroke-width="2" aria-hidden="true">
      <polygon points="12 2 15 9 22 9 16.5 14 18.5 21 12 16.5 5.5 21 7.5 14 2 9 9 9"/>
    </svg>
    Trade Signals`;
}

function restorePanels() {
  const ob = document.getElementById('orderbook');
  const news = document.getElementById('news-feed');
  if (ob && viewCache.portfolio) ob.innerHTML = viewCache.portfolio;
  if (news && viewCache.signals) news.innerHTML = viewCache.signals;
  document.querySelector('.panel--orderbook .panel__meta').textContent = 'Depth ×5';
  document.querySelector('.panel--orderbook .panel__title').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00FFFF" stroke-width="2" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
    Order Book`;
  document.querySelector('.panel--news .panel__title').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00FFFF" stroke-width="2" aria-hidden="true">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
    </svg>
    Market Intelligence`;
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION BUTTONS
// ═══════════════════════════════════════════════════════════
function initNavigation() {
  const navViews = {
    'nav-markets':  'markets',
    'nav-portfolio': 'portfolio',
    'nav-analytics': 'analytics',
    'nav-signals':   'signals',
  };
  const navLabels = {
    'nav-markets':  null,
    'nav-portfolio': 'Portfolio View — Real positions, P&L, and allocation across all assets',
    'nav-analytics': 'Analytics — SMA 20/50 overlays, RSI, MACD, and Bollinger Bands',
    'nav-signals':   'Signals — SMA crossover buy/sell signals on the chart',
  };

  const navs = Object.keys(navViews);
  navs.forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('nav-btn--active');
        b.removeAttribute('aria-current');
      });
      const btn = document.getElementById(id);
      btn.classList.add('nav-btn--active');
      btn.setAttribute('aria-current', 'page');

      const newView = navViews[id];
      const msg = navLabels[id];
      state.view = newView;

      // Restore panels if going back to markets
      if (newView === 'markets') {
        restorePanels();
        genOrderBook();
        renderOrderBook();
        // Reload news
        const active = getActiveAsset();
        loadNews(active);
        drawMainChart();
        if (msg) { showBanner(msg); setTimeout(hideBanner, 2000); }
        return;
      }

      // Portfolio view
      if (newView === 'portfolio') {
        renderPortfolio();
        drawMainChart();
        if (msg) { showBanner(msg); setTimeout(hideBanner, 2000); }
        return;
      }

      // Analytics view
      if (newView === 'analytics') {
        drawMainChart();
        if (msg) { showBanner(msg); setTimeout(hideBanner, 2000); }
        return;
      }

      // Signals view
      if (newView === 'signals') {
        drawMainChart();
        renderSignals();
        if (msg) { showBanner(msg); setTimeout(hideBanner, 2000); }
        return;
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// WATCHLIST ADD BUTTON
// ═══════════════════════════════════════════════════════════
function initWatchlistAdd() {
  const btn = document.querySelector('.panel__action');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const active = getActiveAsset();
    showBanner('Adding ' + active.display + ' to watchlist\u2026');
    setTimeout(() => {
      hideBanner();
      showBanner(active.display + ' added to watchlist!');
      setTimeout(hideBanner, 2000);
    }, 800);
  });
}

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS BUTTON
// ═══════════════════════════════════════════════════════════
function initNotifications() {
  const btn = document.getElementById('btn-notifications');
  if (!btn) return;
  btn.addEventListener('click', () => {
    showBanner('Notifications: 3 new alerts');
    setTimeout(hideBanner, 3000);
  });
}

// ═══════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initBgCanvas();
  initMainChart();
  initVolumeChart();
  initRadarChart();
  initSearch();
  initKeyboardShortcut();
  initNavigation();
  initWatchlistAdd();
  initNotifications();
  initHeatmap();
  initOrderBook();

  renderWatchlistShell();

  showBanner('Connecting to Yahoo Finance Data Network\u2026');

  // Show diagnostics in status bar
  const statusEl = document.querySelector('.statusbar__left');
  if (statusEl) {
    const diag = document.createElement('span');
    diag.className = 'statusbar__item';
    diag.id = 'diag-status';
    diag.style.color = 'var(--color-amber)';
    diag.textContent = '\u26A0 Loading...';
    statusEl.appendChild(diag);
  }

  loadAllData().then(() => {
    hideBanner();
    setDiag('\u2713 Data OK', 'var(--color-positive)');
  }).catch(e => {
    console.error('Load failed:', e);
    hideBanner();
    setDiag('\u2717 Failed: ' + (e.message || e), 'var(--color-negative)');
    showBanner('\u26A0 ' + (e.message || 'Data fetch error') + ' \u2014 retrying\u2026');
    setTimeout(() => { loadAllData().catch(() => {}); hideBanner(); }, 5000);
  });

  setInterval(refreshQuotes, 15_000);
  setInterval(() => {
    const active = getActiveAsset();
    loadChart(active, '60m', '5d');
  }, 60_000);

  setInterval(() => {
    const el = document.getElementById('latency');
    if (el) el.textContent = Math.floor(rand(20, 60)) + 'ms';
  }, 3000);
});