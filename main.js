'use strict';

// ═══════════════════════════════════════════════════════════
// CONFIG — YAHOO FINANCE API
// ═══════════════════════════════════════════════════════════
const YAHOO_FINANCE_API = window.location.origin + '/api/yahoo-finance';

const WATCHLIST = [
  { fh: 'BTC-USD', display: 'BTC',  name: 'Bitcoin',      color: '#6b6b6b', group: 'crypto' },
  { fh: 'ETH-USD', display: 'ETH',  name: 'Ethereum',     color: '#3a3a3a', group: 'crypto' },
  { fh: 'SOL-USD', display: 'SOL',  name: 'Solana',       color: '#3a3a3a', group: 'crypto' },
  { fh: 'SPY',     display: 'SPX',  name: 'S&P 500 ETF',  color: '#0a0a0a', group: 'markets' },
  { fh: 'QQQ',     display: 'NQ',   name: 'Nasdaq ETF',   color: '#3a3a3a', group: 'markets' },
  { fh: 'GLD',     display: 'GOLD', name: 'Gold ETF',     color: '#6b6b6b', group: 'commodities' },
  { fh: 'UUP',     display: 'DXY',  name: 'USD ETF',      color: '#8b8b8b', group: 'commodities' },
  { fh: 'USO',     display: 'OIL',  name: 'Oil ETF',      color: '#6b6b6b', group: 'commodities' },
];

// ── Watchlist Groups ──────────────────────────────────────
let WATCHLIST_GROUPS = [
  { id: 'crypto',      name: 'Crypto' },
  { id: 'markets',     name: 'Markets' },
  { id: 'commodities', name: 'Commodities' },
];

function saveGroups() {
  localStorage.setItem('terminal_wl_groups', JSON.stringify(WATCHLIST_GROUPS));
  localStorage.setItem('terminal_wl_collapsed', JSON.stringify(state.groupCollapsed || {}));
}

function restoreGroups() {
  try {
    const g = localStorage.getItem('terminal_wl_groups');
    if (g) WATCHLIST_GROUPS = JSON.parse(g);
    const c = localStorage.getItem('terminal_wl_collapsed');
    if (c) state.groupCollapsed = JSON.parse(c);
  } catch {}
}

// ── Watchlist localStorage persistence ───────────────────
const DEFAULT_WATCHLIST_FHS = new Set(WATCHLIST.map(w => w.fh));
function saveWatchlistExtras() {
  const extras = WATCHLIST.filter(w => !DEFAULT_WATCHLIST_FHS.has(w.fh));
  localStorage.setItem('terminal_watchlist_extras', JSON.stringify(extras));
  const removedDefaults = [...DEFAULT_WATCHLIST_FHS].filter(fh => !WATCHLIST.find(w => w.fh === fh));
  // Never persist a state where all defaults are removed and no extras exist — that's corrupt
  if (removedDefaults.length === DEFAULT_WATCHLIST_FHS.size && extras.length === 0) return;
  localStorage.setItem('terminal_watchlist_removed', JSON.stringify(removedDefaults));
  // Save group assignments for all default items too
  const groupMap = {};
  WATCHLIST.forEach(w => { if (DEFAULT_WATCHLIST_FHS.has(w.fh)) groupMap[w.fh] = w.group || null; });
  localStorage.setItem('terminal_wl_group_map', JSON.stringify(groupMap));
}
function restoreGroupMap() {
  try {
    const map = JSON.parse(localStorage.getItem('terminal_wl_group_map') || '{}');
    WATCHLIST.forEach(w => { if (map[w.fh] !== undefined) w.group = map[w.fh]; });
  } catch {}
}
const INITIAL_WATCHLIST = WATCHLIST.map(w => ({ ...w }));
function restoreWatchlistExtras() {
  try {
    const removed = JSON.parse(localStorage.getItem('terminal_watchlist_removed') || '[]');
    removed.forEach(fh => {
      const idx = WATCHLIST.findIndex(w => w.fh === fh);
      if (idx !== -1) WATCHLIST.splice(idx, 1);
    });
    const extras = JSON.parse(localStorage.getItem('terminal_watchlist_extras') || '[]');
    extras.forEach(w => { if (!WATCHLIST.find(x => x.fh === w.fh)) WATCHLIST.push(w); });
    // Safety: if restore left watchlist empty, reset to defaults
    if (WATCHLIST.length === 0) {
      INITIAL_WATCHLIST.forEach(w => WATCHLIST.push({ ...w }));
      localStorage.removeItem('terminal_watchlist_removed');
    }
  } catch {}
}

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
  alerts:       [],
  alertUnread:  0,
  watchlistEdit: false,
  groupCollapsed: {},
};

const WATCHLIST_COLORS = ['#0a0a0a','#3a3a3a','#6b6b6b','#0a0a0a','#8b8b8b','#3a3a3a','#3a3a3a','#6b6b6b','#6b6b6b','#6b6b6b'];

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
  // Fetch watchlist + any extra ticker-bar symbols + active custom asset
  const watchlistFhs = new Set(WATCHLIST.map(w => w.fh));
  const tickerExtras = TICKER_SYMBOLS.filter(s => !watchlistFhs.has(s));
  const symbols = [...WATCHLIST.map(w => w.fh), ...tickerExtras];
  if (state.activeCustom && !watchlistFhs.has(state.activeCustom.fh)) symbols.push(state.activeCustom.fh);

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
    if (state.view === 'portfolio') {
      renderPortfolio();
    } else if (state.view === 'analytics') {
      renderAnalytics();
    }
    checkAlerts();
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

  const particleCount = window.innerWidth <= 768 ? 20 : 70;
  for (let i = 0; i < particleCount; i++) {
    state.bgParticles.push({
      x: rand(0, innerWidth), y: rand(0, innerHeight),
      vx: rand(-0.12, 0.12), vy: rand(-0.12, 0.12),
      r: rand(0.4, 1.8),
      opacity: rand(0.18, 0.55),
      color: '#0a0a0a',
    });
  }

  let gridOff = 0;
  const draw = () => {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    gridOff = (gridOff + 0.25) % 60;

    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    for (let x = -gridOff; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = -gridOff; y < h; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
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
      if (window.innerWidth <= 768 && typeof window.__showMobilePanel === 'function') {
        window.__showMobilePanel('chart');
      }
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
function renderWatchlistItem(w, i, editMode) {
  return `<li class="watchlist__item ${i === state.activeIndex && !state.activeCustom ? 'watchlist__item--active' : ''}${editMode ? ' watchlist__item--edit' : ''}"
      role="listitem" tabindex="0" data-index="${i}"
      style="--item-color: ${w.color}"
      aria-label="${w.name}">
    ${editMode ? `<button class="watchlist__remove-btn" data-index="${i}" aria-label="Remove ${w.display}" tabindex="0">✕</button>` : ''}
    <span class="watchlist__symbol">${w.display}</span>
    <span class="watchlist__price" id="wl-price-${i}">\u2014</span>
    <span class="watchlist__name">${w.name}</span>
    <span class="watchlist__change" id="wl-change-${i}">\u2014</span>
    <div class="watchlist__bg-bar" id="wl-bar-${i}" style="width:50%;background:${w.color}"></div>
  </li>`;
}

function renderWatchlistShell() {
  const el = document.getElementById('watchlist');
  const editMode = state.watchlistEdit;
  const collapsed = state.groupCollapsed;

  const byGroup = {};
  const ungrouped = [];
  WATCHLIST.forEach((w, i) => {
    if (w.group) {
      if (!byGroup[w.group]) byGroup[w.group] = [];
      byGroup[w.group].push({ w, i });
    } else {
      ungrouped.push({ w, i });
    }
  });

  let html = '';
  WATCHLIST_GROUPS.forEach(g => {
    const items = byGroup[g.id] || [];
    const isCollapsed = !!collapsed[g.id];
    html += `<li class="wl-group-header" data-group-id="${g.id}" role="group" aria-expanded="${!isCollapsed}">
      <span class="wl-group-header__arrow">${isCollapsed ? '▶' : '▼'}</span>
      ${editMode
        ? `<input class="wl-group-header__name-input" data-group-id="${g.id}" value="${g.name}" />`
        : `<span class="wl-group-header__name">${g.name}</span>`}
      <span class="wl-group-header__count">${items.length}</span>
      ${editMode ? `<button class="wl-group-delete-btn" data-group-id="${g.id}" aria-label="Delete folder">✕</button>` : ''}
    </li>`;
    if (!isCollapsed) {
      items.forEach(({ w, i }) => { html += renderWatchlistItem(w, i, editMode); });
    }
  });
  ungrouped.forEach(({ w, i }) => { html += renderWatchlistItem(w, i, editMode); });

  el.innerHTML = html;
  attachWatchlistEvents();
  attachGroupEvents();
  if (editMode) attachWatchlistRemoveEvents();
}

function attachGroupEvents() {
  document.querySelectorAll('.wl-group-header').forEach(header => {
    const gid = header.dataset.groupId;
    const toggle = () => {
      state.groupCollapsed[gid] = !state.groupCollapsed[gid];
      saveGroups();
      renderWatchlistShell();
      renderWatchlist();
    };
    header.querySelector('.wl-group-header__arrow')?.addEventListener('click', toggle);
    header.querySelector('.wl-group-header__name')?.addEventListener('click', toggle);
  });

  document.querySelectorAll('.wl-group-header__name-input').forEach(input => {
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('change', () => {
      const g = WATCHLIST_GROUPS.find(x => x.id === input.dataset.groupId);
      if (g) { g.name = input.value.trim() || g.name; saveGroups(); }
    });
  });

  document.querySelectorAll('.wl-group-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const gid = btn.dataset.groupId;
      WATCHLIST.forEach(w => { if (w.group === gid) w.group = null; });
      WATCHLIST_GROUPS = WATCHLIST_GROUPS.filter(g => g.id !== gid);
      saveGroups();
      saveWatchlistExtras();
      renderWatchlistShell();
      renderWatchlist();
    });
  });
}

function attachWatchlistRemoveEvents() {
  document.querySelectorAll('.watchlist__remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = +btn.dataset.index;
      WATCHLIST.splice(idx, 1);
      if (state.activeIndex >= WATCHLIST.length) state.activeIndex = Math.max(0, WATCHLIST.length - 1);
      saveWatchlistExtras();
      renderWatchlistShell();
      renderWatchlist();
    });
  });
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
      // On mobile, jump straight to the chart panel
      if (window.innerWidth <= 768 && typeof window.__showMobilePanel === 'function') {
        window.__showMobilePanel('chart');
      }
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

  // Crypto volume on Yahoo Finance is already in USD; equities are in shares
  const isCrypto = symbol.includes('-USD') || symbol === 'BTC' || symbol === 'ETH' || symbol === 'SOL';
  const volUsd = isCrypto ? vol : vol * price;
  document.getElementById('vol-val').textContent = fmt.compact(volUsd || 0);

  const emaFn = (arr, n) => {
    const k = 2 / (n + 1);
    return arr.reduce((acc, v, i) => { acc.push(i === 0 ? v : v * k + acc[i - 1] * (1 - k)); return acc; }, []);
  };

  const candles = state.candles;
  if (candles.length > 1) {
    const closes = candles.map(c => c.close).filter(c => c != null);
    const len = closes.length;

    // Real BB Width: 4*stdev / mean over last 20 bars (upper - lower = 4*stdev)
    const slice20 = closes.slice(-20);
    const mean20 = slice20.reduce((a, b) => a + b, 0) / slice20.length;
    const std20 = Math.sqrt(slice20.reduce((a, b) => a + (b - mean20) ** 2, 0) / slice20.length);
    document.getElementById('bb-val').textContent = ((std20 * 4) / mean20).toFixed(4);

    // Real MACD: EMA(12) - EMA(26)
    const ema12 = emaFn(closes, 12), ema26 = emaFn(closes, 26);
    const macd = ema12[len - 1] - ema26[len - 1];
    const macdEl = document.getElementById('macd-val');
    macdEl.textContent = (macd >= 0 ? '+' : '') + macd.toFixed(2);
    macdEl.className = 'indicator-card__value ' + (macd >= 0 ? 'positive' : 'negative');

    // Real RSI(14)
    let rsi = 50;
    if (len > 14) {
      let gains = 0, losses = 0;
      for (let i = len - 14; i < len; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) gains += d; else losses -= d;
      }
      const avgGain = gains / 14, avgLoss = losses / 14;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi = 100 - (100 / (1 + rs));
    }
    document.getElementById('rsi-val').textContent = rsi.toFixed(1);
    document.getElementById('rsi-bar').style.width = rsi + '%';
  } else {
    // Fallback: no candles yet
    const macdEl = document.getElementById('macd-val');
    macdEl.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2);
    macdEl.className = 'indicator-card__value ' + (chg >= 0 ? 'positive' : 'negative');
    document.getElementById('bb-val').textContent = '—';
    document.getElementById('rsi-val').textContent = '—';
    document.getElementById('rsi-bar').style.width = '50%';
  }

  document.getElementById('fund-val').textContent = '—';
  document.getElementById('oi-val').textContent = '—';

  // Portfolio PnL elements — hide if no real portfolio data
  const totalPnlEl = document.getElementById('total-pnl');
  const dayPnlEl = document.getElementById('day-pnl');
  if (totalPnlEl) totalPnlEl.textContent = '—';
  if (dayPnlEl) dayPnlEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';

  // SMA row
  updateSMARow(price);
}

function updateSMARow(currentPrice) {
  const closes = state.candles.map(c => c.close).filter(c => c != null);
  const p = currentPrice || 0;

  const sma20arr  = calcSMA(closes, 20);
  const sma50arr  = calcSMA(closes, 50);
  const sma200arr = calcSMA(closes, 200);
  const sma20  = sma20arr[sma20arr.length - 1];
  const sma50  = sma50arr[sma50arr.length - 1];
  const sma200 = sma200arr[sma200arr.length - 1];

  const set = (id, val, price) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (val == null) { el.textContent = '—'; el.style.color = ''; return; }
    el.textContent = '$' + fmt.price(val, 2);
    el.style.color = price > val ? 'var(--positive)' : 'var(--negative)';
  };

  set('sma20-val',  sma20,  p);
  set('sma50-val',  sma50,  p);
  set('sma200-val', sma200, p);

  const priceEl = document.getElementById('sma-price-val');
  if (priceEl) { priceEl.textContent = p ? '$' + fmt.price(p, 2) : '—'; priceEl.style.color = ''; }
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
      const intervals = { '1m':'1m', '1D':'5m', '1W':'60m', '1M':'1d', '3M':'1d', '6M':'1d', '1Y':'1d' };
      const ranges    = { '1m':'1d', '1D':'1d', '1W':'5d',  '1M':'1mo','3M':'3mo','6M':'6mo','1Y':'1y'  };
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
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    const price = pMax - (i / 5) * pRange;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '10px Space Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('$' + fmt.price(price, price > 100 ? 0 : 4), pad.left + cW + 4, y + 4);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'center';
  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const i = Math.round(t * (candles.length - 1));
    ctx.fillText(fmt.time(candles[i]?.time), toX(i), h - 8);
  });

  if (state.chartType === 'line') {
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0.0)');

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
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.stroke();
  } else {
    const bw = Math.max(1.5, (cW / candles.length) * 0.65);
    const UP = '#16a34a', DOWN = '#dc2626';
    candles.forEach((c, i) => {
      if (c.close == null) return;
      const x = toX(i);
      const bull = c.close >= c.open;
      const col = bull ? UP : DOWN;

      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.high));
      ctx.lineTo(x, toY(c.low));
      ctx.stroke();

      const bodyTop = Math.min(toY(c.open), toY(c.close));
      const bodyH = Math.max(1.5, Math.abs(toY(c.close) - toY(c.open)));
      ctx.fillStyle = col;
      ctx.globalAlpha = 1;
      ctx.fillRect(x - bw / 2, bodyTop, bw, bodyH);

      if (state.hoverCandle === i) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(x - bw / 2 - 1, bodyTop - 1, bw + 2, bodyH + 2);
      }
      ctx.globalAlpha = 1;
    });

    const lc = candles[candles.length - 1];
    if (lc && lc.close != null) {
      ctx.beginPath();
      ctx.arc(toX(candles.length - 1), toY(lc.close), 3, 0, Math.PI * 2);
      ctx.fillStyle = lc.close >= lc.open ? '#16a34a' : '#dc2626';
      ctx.shadowBlur = 0;
      ctx.fill();
    }
  }

  if (state.crosshairX != null) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(state.crosshairX, pad.top); ctx.lineTo(state.crosshairX, pad.top + cH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.left, state.crosshairY); ctx.lineTo(pad.left + cW, state.crosshairY); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Analytics: SMA overlays ──
  if (state.view === 'analytics') {
    const closes = candles.map(c => c.close).filter(c => c != null);
    if (closes.length > 20) {
      const sma20  = calcSMA(closes, 20);
      const sma50  = calcSMA(closes, 50);
      const sma200 = calcSMA(closes, 200);
      const lines = [
        { data: sma20,  color: '#2563eb', label: 'SMA 20'  },
        { data: sma50,  color: '#d97706', label: 'SMA 50'  },
        { data: sma200, color: '#dc2626', label: 'SMA 200' },
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
      ctx.fillStyle = isBuy ? '#16a34a' : '#dc2626';
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
      <span style="color:var(--color-fg-dim)">C</span><span style="color:${bull ? '#0a0a0a' : '#8b8b8b'}">$${fmt.price(c.close)}</span>
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
      volCtx.fillStyle = c.close >= c.open ? 'rgba(22,163,74,0.45)' : 'rgba(220,38,38,0.45)';
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
// AI CHAT
// ═══════════════════════════════════════════════════════════
const aiMessages = [];

function renderAIChat() {
  ['ai-chat-messages', 'ai-chat-messages-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (aiMessages.length === 0) {
      el.innerHTML = `<div class="ai-chat__empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><circle cx="18" cy="6" r="3" fill="#0a0a0a" opacity="0.4"/>
        </svg>
        <span>Type a ticker symbol<br/>to get AI analysis</span>
      </div>`;
    } else {
      el.innerHTML = aiMessages.map(m => `
        <div class="ai-msg ai-msg--${m.role}">
          <span class="ai-msg__label">${m.role === 'user' ? 'YOU' : '⬡ AI'}</span>
          <div class="ai-msg__bubble">${m.html}</div>
        </div>`).join('');
      el.scrollTop = el.scrollHeight;
    }
  });
}

function showAITyping() {
  ['ai-chat-messages', 'ai-chat-messages-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg--ai';
    div.id = 'ai-typing-' + id;
    div.innerHTML = `<span class="ai-msg__label">⬡ AI</span><div class="ai-typing"><div class="ai-typing__dot"></div><div class="ai-typing__dot"></div><div class="ai-typing__dot"></div></div>`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  });
}

function hideAITyping() {
  ['ai-chat-messages', 'ai-chat-messages-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const t = el.querySelector('[id^="ai-typing-"]'); if (t) t.remove(); }
  });
}

async function handleAIQuery(rawInput) {
  let query = rawInput.trim().toUpperCase().replace(/[^A-Z0-9-.]/g, '');
  if (!query) return;
  // Map watchlist display names to their full Yahoo Finance symbols
  const wlMatch = WATCHLIST.find(w => w.display?.toUpperCase() === query || w.fh?.toUpperCase() === query);
  if (wlMatch) query = wlMatch.fh;
  // Common crypto shorthands
  const cryptoMap = { BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', DOGE: 'DOGE-USD', XRP: 'XRP-USD', ADA: 'ADA-USD', AVAX: 'AVAX-USD', DOT: 'DOT-USD', MATIC: 'MATIC-USD', LINK: 'LINK-USD' };
  if (cryptoMap[query]) query = cryptoMap[query];

  aiMessages.push({ role: 'user', html: rawInput.trim().toUpperCase() });
  renderAIChat();
  showAITyping();

  ['ai-chat-input', 'ai-chat-input-mobile', 'ai-chat-send', 'ai-chat-send-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  try {
    const candles = await fetchChart(query, '60m', '5d');
    if (!candles.length) throw new Error('No data');

    let quoteData = state.quotes[query];
    if (!quoteData) {
      try { quoteData = await fetchQuote(query); } catch(e) {}
    }

    const closes = candles.map(c => c.close).filter(Boolean);
    const len = closes.length;
    const last = closes[len - 1];
    const smaFn = n => closes.slice(-Math.min(n, len)).reduce((a, b) => a + b, 0) / Math.min(n, len);
    const sma20 = smaFn(20), sma50 = smaFn(50), sma200 = smaFn(200);

    let gains = 0, losses = 0;
    const period = Math.min(14, len - 1);
    for (let i = len - period; i < len; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    const emaFn = (arr, n) => {
      const k = 2 / (n + 1);
      return arr.reduce((acc, v, i) => { acc.push(i === 0 ? v : v * k + acc[i - 1] * (1 - k)); return acc; }, []);
    };
    const ema12 = emaFn(closes, 12), ema26 = emaFn(closes, 26);
    const macd = ema12[len - 1] - ema26[len - 1];

    const slice20 = closes.slice(-20);
    const mean20 = slice20.reduce((a, b) => a + b, 0) / slice20.length;
    const std20 = Math.sqrt(slice20.reduce((a, b) => a + (b - mean20) ** 2, 0) / slice20.length);
    const bbWidth = (std20 * 4) / mean20;

    const trend = last > sma20 && sma20 > sma50 ? 'UPTREND' : last < sma20 && sma20 < sma50 ? 'DOWNTREND' : 'SIDEWAYS';
    const chg = quoteData?.regularMarketChangePercent;
    const chgStr = chg != null ? (chg >= 0 ? `<span class="pos">+${chg.toFixed(2)}%</span>` : `<span class="neg">${chg.toFixed(2)}%</span>`) : '';
    const vol = quoteData?.regularMarketVolume;

    let bull = 0, bear = 0;
    if (rsi > 50) bull++; else bear++;  // RSI > 50 = bullish momentum
    if (macd > 0) bull++; else bear++;
    if (last > sma50) bull++; else bear++;
    if (last > sma200) bull++; else bear++;
    if (trend === 'UPTREND') bull++; else if (trend === 'DOWNTREND') bear++;
    const total = bull + bear;
    const verdict = bull > bear ? 'BULLISH' : bear > bull ? 'BEARISH' : 'NEUTRAL';
    const conf = Math.round((Math.max(bull, bear) / total) * 100);
    const verdictClass = verdict === 'BULLISH' ? 'pos' : verdict === 'BEARISH' ? 'neg' : 'dim';

    const row = (label, val, cls) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,0.07)"><span class="dim">${label}</span><span class="${cls}">${val}</span></div>`;

    const html = `
      <div style="margin-bottom:8px">
        <strong>${query}</strong> &nbsp;<span class="dim" style="font-size:10px">$${fmt.price(last)}</span>&nbsp;${chgStr}
      </div>
      <div style="margin-bottom:8px;padding:8px;background:rgba(0,0,0,0.04);border-radius:6px;border:1px solid rgba(0,0,0,0.12)">
        <div style="font-size:13px;font-weight:700;letter-spacing:0.05em" class="${verdictClass}">${verdict}</div>
        <div class="dim" style="font-size:10px;margin-top:2px">${conf}% confidence &nbsp;&middot;&nbsp; ${bull} bull / ${bear} bear</div>
      </div>
      ${row('RSI (14)', rsi.toFixed(1), rsi > 70 ? 'neg' : rsi < 30 ? 'pos' : '')}
      ${row('MACD', macd >= 0 ? '+' + macd.toFixed(2) : macd.toFixed(2), macd > 0 ? 'pos' : 'neg')}
      ${row('Trend', trend, trend === 'UPTREND' ? 'pos' : trend === 'DOWNTREND' ? 'neg' : 'dim')}
      ${row('vs SMA 20', last > sma20 ? 'ABOVE' : 'BELOW', last > sma20 ? 'pos' : 'neg')}
      ${row('vs SMA 50', last > sma50 ? 'ABOVE' : 'BELOW', last > sma50 ? 'pos' : 'neg')}
      ${len >= 200 ? row('vs SMA 200', last > sma200 ? 'ABOVE' : 'BELOW', last > sma200 ? 'pos' : 'neg') : row('vs SMA 200', `Need 200 bars (have ${len})`, 'dim')}
      ${row('BB Width', bbWidth.toFixed(4), bbWidth < 0.05 ? 'dim' : '')}
      ${vol ? row('Volume', fmt.compact(vol).replace('$', ''), 'dim') : ''}
      <div class="dim" style="font-size:9px;margin-top:8px;letter-spacing:0.03em">Technical signals only · Not financial advice</div>`;

    hideAITyping();
    aiMessages.push({ role: 'ai', html });
  } catch(e) {
    hideAITyping();
    aiMessages.push({ role: 'ai', html: `<span class="neg">Could not load data for <strong>${query}</strong>. Try a valid symbol like AAPL, TSLA, BTC-USD.</span>` });
  }

  renderAIChat();

  ['ai-chat-input', 'ai-chat-input-mobile', 'ai-chat-send', 'ai-chat-send-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
  ['ai-chat-input', 'ai-chat-input-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function initAIChat() {
  ['', '-mobile'].forEach(suffix => {
    const input = document.getElementById('ai-chat-input' + suffix);
    const btn   = document.getElementById('ai-chat-send' + suffix);
    if (!input || !btn) return;
    btn.addEventListener('click', () => { if (input.value.trim()) handleAIQuery(input.value); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && input.value.trim()) handleAIQuery(input.value); });
  });
  renderAIChat();
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
  const colors = { bullish: 'var(--color-positive)', bearish: 'var(--color-negative)', neutral: 'var(--color-neutral)' };
  const html = items.map(n => `
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
  const feed = document.getElementById('news-feed');
  if (feed) feed.innerHTML = html;
  const mobileFeed = document.getElementById('mobile-news-feed');
  if (mobileFeed) mobileFeed.innerHTML = html;
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
    const intensity = clamp(Math.abs(s.val) / 5, 0.15, 0.90);
    const up = s.val >= 0;
    const bg = up
      ? `rgba(22,163,74,${intensity.toFixed(3)})`
      : `rgba(220,38,38,${intensity.toFixed(3)})`;
    const txt = intensity > 0.38 ? '#ffffff' : (up ? '#15803d' : '#991b1b');
    const arrow = up ? '▲' : '▼';
    return `<div class="heatmap-cell" role="gridcell" style="background:${bg};color:${txt}"
               title="${s.name}: ${fmt.pct(s.val)}" aria-label="${s.name} ${fmt.pct(s.val)}">
      <span class="heatmap-cell__name">${s.name}</span>
      <span class="heatmap-cell__val">${arrow} ${fmt.pct(s.val)}</span>
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
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  state.radarValues.forEach((v, i) => { const p = pt(i, r * v); i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(123,97,255,0.12)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#0a0a0a';
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;

  state.radarValues.forEach((v, i) => {
    const p = pt(i, r * v);
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0a';
    ctx.shadowColor = '#0a0a0a';
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
    state.activeCustom = { fh: fhSym, display: dispSym, name: name || dispSym, color: '#0a0a0a' };
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
const viewCache = { obOriginal: null, newsOriginal: null };

// ── Portfolio localStorage helpers ────────────────────────
function getPortfolioPositions() {
  try { return JSON.parse(localStorage.getItem('terminal_portfolio') || '{}'); }
  catch { return {}; }
}
function savePortfolioPositions(data) {
  localStorage.setItem('terminal_portfolio', JSON.stringify(data));
}

function renderPortfolio() {
  const stored = getPortfolioPositions();
  // Build full position list: watchlist + any custom positions saved
  const customKeys = Object.keys(stored).filter(fh => !WATCHLIST.find(w => w.fh === fh));
  const allSymbols = [
    ...WATCHLIST.map(w => ({ fh: w.fh, display: w.display, name: w.name, color: w.color })),
    ...customKeys.map(fh => ({ fh, display: stored[fh].display || fh, name: stored[fh].name || fh, color: stored[fh].color || '#0a0a0a' })),
  ];

  const all = allSymbols.map(sym => {
    const quote = state.quotes[sym.fh] || {};
    const price   = quote.regularMarketPrice || 0;
    const pos     = stored[sym.fh] || { shares: 0, avgCost: 0 };
    const shares  = parseFloat(pos.shares) || 0;
    const avgCost = parseFloat(pos.avgCost) || 0;
    const val     = shares * price;
    const pnl     = avgCost > 0 ? shares * (price - avgCost) : 0;
    const pnlPct  = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;
    return { sym: sym.display, name: sym.name, fh: sym.fh, color: sym.color, price, shares, avgCost, val, pnl, pnlPct };
  });
  const held = all.filter(p => p.shares > 0);
  const totalVal = held.reduce((s, p) => s + p.val, 0);
  const totalPnl = held.reduce((s, p) => s + p.pnl, 0);

  document.getElementById('total-pnl').textContent = (totalPnl >= 0 ? '+' : '') + '$' + fmt.price(Math.abs(totalPnl), 2);
  document.getElementById('day-pnl').textContent = '$' + fmt.price(totalVal, 0);

  const display = held.length ? held : all;
  const prow = (p) => {
    const empty = p.shares === 0;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 10px;font-size:10px;border-bottom:1px solid rgba(0,0,0,0.07);${empty ? 'opacity:0.3' : ''}">
      <span style="color:${p.color};flex:1.2;font-weight:600;font-family:var(--font-mono)">${p.sym}</span>
      <span style="flex:1;text-align:right;font-family:var(--font-mono)">${empty ? '—' : p.shares}</span>
      <span style="flex:1.2;text-align:right;font-family:var(--font-mono)">${empty ? '—' : '$' + fmt.price(p.val, 0)}</span>
      <span style="flex:1.4;text-align:right;color:${p.pnl >= 0 ? '#0a0a0a' : '#8b8b8b'};font-family:var(--font-mono)">${empty ? '—' : (p.pnl >= 0 ? '+' : '') + '$' + fmt.price(p.pnl, 2)}</span>
      <span style="flex:1;text-align:right;color:${p.pnlPct >= 0 ? '#0a0a0a' : '#8b8b8b'};font-family:var(--font-mono)">${empty ? '—' : (p.pnlPct >= 0 ? '+' : '') + p.pnlPct.toFixed(2) + '%'}</span>
    </div>`;
  };

  const html = `
    <div style="display:flex;justify-content:space-between;padding:3px 10px;font-size:9px;color:var(--color-fg-dim);border-bottom:1px solid rgba(0,0,0,0.10)">
      <span style="flex:1.2">Asset</span><span style="flex:1;text-align:right">Units</span>
      <span style="flex:1.2;text-align:right">Value</span><span style="flex:1.4;text-align:right">P&amp;L</span>
      <span style="flex:1;text-align:right">Ret%</span>
    </div>
    ${held.length === 0 ? '<div style="padding:14px 10px;text-align:center;font-size:10px;color:var(--color-fg-dim)">No holdings — click Edit to add positions</div>' : ''}
    ${display.map(prow).join('')}
    ${held.length ? `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 10px;font-size:10px;border-top:1px solid rgba(0,0,0,0.10)">
      <span style="color:var(--color-fg-dim)">Total</span>
      <span style="font-family:var(--font-mono)">$${fmt.price(totalVal, 0)}</span>
      <span style="color:${totalPnl >= 0 ? '#0a0a0a' : '#8b8b8b'};font-family:var(--font-mono)">${totalPnl >= 0 ? '+' : ''}$${fmt.price(Math.abs(totalPnl), 2)}</span>
    </div>` : ''}`;

  ['ai-chat-messages', 'ai-chat-messages-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });

  const meta = document.getElementById('ai-chat-meta');
  if (meta) meta.textContent = held.length ? held.length + ' positions' : 'No positions';
  const heading = document.getElementById('ai-chat-heading');
  if (heading) heading.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
    Portfolio
    <button id="portfolio-edit-btn" class="portfolio-edit-btn" title="Edit positions" aria-label="Edit portfolio">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      Edit
    </button>`;
  const editBtn = document.getElementById('portfolio-edit-btn');
  if (editBtn) editBtn.addEventListener('click', openPortfolioEdit);
}

// ── Portfolio Edit Panel ──────────────────────────────────
function initPortfolioEdit() {
  const panel = document.createElement('div');
  panel.id = 'portfolio-edit-panel';
  panel.className = 'portfolio-edit-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Edit portfolio positions');
  panel.innerHTML = `
    <div class="portfolio-edit__inner">
      <div class="portfolio-edit__header">
        <span class="portfolio-edit__title">Edit Portfolio</span>
        <button class="portfolio-edit__close" id="portfolio-edit-close" aria-label="Close">✕</button>
      </div>
      <p class="portfolio-edit__note">Enter holdings. P&amp;L calculated against your average cost.</p>
      <div class="portfolio-edit__list" id="portfolio-edit-list"></div>
      <div class="portfolio-edit__add-row">
        <input class="portfolio-edit__add-input" id="pe-add-ticker" type="text" placeholder="Add ticker (e.g. AAPL)" autocomplete="off" spellcheck="false"/>
        <button class="portfolio-edit__add-btn" id="pe-add-btn">+ Add</button>
      </div>
      <div class="portfolio-edit__footer">
        <button class="portfolio-edit__cancel" id="portfolio-edit-cancel">Cancel</button>
        <button class="portfolio-edit__save" id="portfolio-edit-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(panel);

  document.getElementById('portfolio-edit-close').addEventListener('click', closePortfolioEdit);
  document.getElementById('portfolio-edit-cancel').addEventListener('click', closePortfolioEdit);

  document.getElementById('pe-add-btn').addEventListener('click', () => {
    const tickerInput = document.getElementById('pe-add-ticker');
    const ticker = tickerInput.value.trim().toUpperCase();
    if (!ticker) return;
    addPortfolioRow(ticker, ticker, '#0a0a0a', {});
    tickerInput.value = '';
  });
  document.getElementById('pe-add-ticker').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('pe-add-btn').click();
  });

  document.getElementById('portfolio-edit-save').addEventListener('click', savePortfolioFromEdit);
}

function addPortfolioRow(fh, display, color, pos) {
  const list   = document.getElementById('portfolio-edit-list');
  const safeId = fh.replace(/[^a-z0-9]/gi, '_');
  if (document.getElementById('pe-shares-' + safeId)) return; // already exists
  const price  = state.quotes[fh]?.regularMarketPrice;
  const div = document.createElement('div');
  div.className = 'portfolio-edit__row';
  div.dataset.fh = fh;
  div.innerHTML = `
    <div class="portfolio-edit__row-info">
      <span class="portfolio-edit__row-sym" style="color:${color}">${display}</span>
      ${price ? '<span class="portfolio-edit__row-price">$' + fmt.price(price, 2) + '</span>' : ''}
    </div>
    <div class="portfolio-edit__row-inputs">
      <label class="portfolio-edit__field">
        <span class="portfolio-edit__field-label">Units</span>
        <input class="portfolio-edit__input" id="pe-shares-${safeId}" type="number" min="0" step="any" value="${pos.shares || ''}" placeholder="0"/>
      </label>
      <label class="portfolio-edit__field">
        <span class="portfolio-edit__field-label">Avg Cost</span>
        <input class="portfolio-edit__input" id="pe-cost-${safeId}" type="number" min="0" step="any" value="${pos.avgCost || ''}" placeholder="0.00"/>
      </label>
      <button class="portfolio-edit__remove" title="Remove" aria-label="Remove ${display}">✕</button>
    </div>`;
  div.querySelector('.portfolio-edit__remove').addEventListener('click', () => {
    div.classList.toggle('portfolio-edit__row--removed');
  });
  list.appendChild(div);
}

function savePortfolioFromEdit() {
  const list = document.getElementById('portfolio-edit-list');
  const rows = list.querySelectorAll('.portfolio-edit__row:not(.portfolio-edit__row--removed)');
  const data = {};
  rows.forEach(row => {
    const fh = row.dataset.fh;
    if (!fh) return;
    const safeId = fh.replace(/[^a-z0-9]/gi, '_');
    const sharesEl = document.getElementById('pe-shares-' + safeId);
    const costEl   = document.getElementById('pe-cost-'   + safeId);
    const shares   = parseFloat(sharesEl?.value || '0') || 0;
    const avgCost  = parseFloat(costEl?.value   || '0') || 0;
    const wl = WATCHLIST.find(w => w.fh === fh);
    data[fh] = {
      shares, avgCost,
      display: wl?.display || fh,
      name:    wl?.name    || fh,
      color:   wl?.color   || '#0a0a0a',
    };
  });
  savePortfolioPositions(data);
  closePortfolioEdit();
  if (state.view === 'portfolio') renderPortfolio();
  showBanner('Portfolio saved');
  setTimeout(hideBanner, 1800);
}

function openPortfolioEdit() {
  const panel = document.getElementById('portfolio-edit-panel');
  if (!panel) return;
  const stored = getPortfolioPositions();
  const list   = document.getElementById('portfolio-edit-list');
  list.innerHTML = '';

  // Show all watchlist symbols
  WATCHLIST.forEach(sym => {
    const pos = stored[sym.fh] || {};
    addPortfolioRow(sym.fh, sym.display, sym.color, pos);
    const row = list.lastElementChild;
    if (row) row.dataset.fh = sym.fh;
  });
  // Show any custom positions
  Object.keys(stored).filter(fh => !WATCHLIST.find(w => w.fh === fh)).forEach(fh => {
    const pos = stored[fh];
    addPortfolioRow(fh, pos.display || fh, pos.color || '#0a0a0a', pos);
    const row = list.lastElementChild;
    if (row) row.dataset.fh = fh;
  });

  panel.classList.add('portfolio-edit-panel--open');
  list.querySelector('input')?.focus();
}

function closePortfolioEdit() {
  const panel = document.getElementById('portfolio-edit-panel');
  if (panel) panel.classList.remove('portfolio-edit-panel--open');
}

function renderSignals() {
  const news = document.getElementById('news-feed');
  if (!news) return;
  const candles = state.candles;
  const closes = candles.map(c => c.close).filter(c => c != null);
  const signals = calcSignals(closes);
  const html = signals.length === 0
    ? '<li style="padding:12px;text-align:center;color:var(--color-fg-dim)">No signals detected yet</li>'
    : signals.map(s => {
        const c = candles[s.idx];
        const timeStr = c?.time ? c.time.toLocaleString() : '';
        const price = c?.close ? '$' + fmt.price(c.close, 2) : '';
        return `<li class="news-item" style="border-left:3px solid ${s.type === 'buy' ? '#0a0a0a' : '#8b8b8b'}">
          <div class="news-item__headline">
            <span style="color:${s.type === 'buy' ? '#0a0a0a' : '#8b8b8b'};font-weight:700">${s.label} SIGNAL</span>
            <span style="color:var(--color-fg-dim);font-size:9px">${timeStr}</span>
          </div>
          <div class="news-item__source" style="font-size:10px">
            SMA 12/26 crossover at ${price} &middot; ${s.type === 'buy' ? 'Bullish momentum detected' : 'Bearish momentum detected'}
          </div>
        </li>`;
      }).join('');
  news.innerHTML = html;
  document.querySelector('.panel--news .panel__title').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2" aria-hidden="true">
      <polygon points="12 2 15 9 22 9 16.5 14 18.5 21 12 16.5 5.5 21 7.5 14 2 9 9 9"/>
    </svg>
    Trade Signals`;
}

function renderAnalytics() {
  const ob = document.getElementById('ai-chat-messages');
  const obM = document.getElementById('ai-chat-messages-mobile');
  if (!ob) return;
  const active = getActiveAsset();
  const q = state.quotes[active.fh] || {};
  const candles = state.candles;
  const closes = candles.map(c => c.close).filter(Boolean);

  const price = q.regularMarketPrice || 0;
  const chg = q.regularMarketChange || 0;
  const pct = q.regularMarketChangePercent || 0;
  const high = q.regularMarketDayHigh || price;
  const low  = q.regularMarketDayLow  || price;
  const vol  = q.regularMarketVolume  || 0;
  const avgVol = q.averageDailyVolume3Month || vol || 1;
  const isCryptoA = active.fh.includes('-USD');
  const volUsdA = isCryptoA ? vol : vol * price;

  let rsi = 50;
  if (closes.length > 14) {
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    const avgGain = gains / 14, avgLoss = losses / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - (100 / (1 + rs));
  }
  const rsiLabel = rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral';
  const rsiColor = rsi > 70 ? 'var(--color-rose)' : rsi < 30 ? 'var(--color-emerald)' : 'var(--color-amber)';

  const emaFnA = (arr, n) => {
    const k = 2 / (n + 1);
    return arr.reduce((acc, v, i) => { acc.push(i === 0 ? v : v * k + acc[i - 1] * (1 - k)); return acc; }, []);
  };
  let macdVal = 0;
  if (closes.length > 26) {
    const ema12a = emaFnA(closes, 12), ema26a = emaFnA(closes, 26);
    macdVal = ema12a[closes.length - 1] - ema26a[closes.length - 1];
  }
  const macdLabel = macdVal >= 0 ? 'Bullish' : 'Bearish';
  const macdColor = macdVal >= 0 ? 'var(--color-positive)' : 'var(--color-negative)';

  const slice20a = closes.slice(-20);
  const mean20a = slice20a.length ? slice20a.reduce((a, b) => a + b, 0) / slice20a.length : price;
  const std20a = slice20a.length > 1 ? Math.sqrt(slice20a.reduce((a, b) => a + (b - mean20a) ** 2, 0) / slice20a.length) : 0;
  const bbW = mean20a ? (std20a * 4) / mean20a : 0;
  const bbLabel = bbW > 0.04 ? 'Volatile' : bbW > 0.01 ? 'Normal' : 'Compressed';

  const volRatio = vol / avgVol;
  const volLabel = volRatio > 1.5 ? 'High Activity' : volRatio > 0.8 ? 'Normal' : 'Low Activity';
  const volColor = volRatio > 1.5 ? 'var(--color-positive)' : volRatio > 0.8 ? 'var(--color-fg)' : 'var(--color-fg-muted)';

  const sma20arr  = calcSMA(closes, 20);
  const sma50arr  = calcSMA(closes, 50);
  const sma200arr = calcSMA(closes, 200);
  const sma20  = sma20arr[sma20arr.length - 1];
  const sma50  = sma50arr[sma50arr.length - 1];
  const sma200 = sma200arr[sma200arr.length - 1];
  const trend200 = sma200 ? (price > sma200 ? ' · Above SMA200' : ' · Below SMA200') : '';
  const trendLabel = (sma20 && sma50) ? (sma20 > sma50 ? 'Bullish — SMA20>50' : 'Bearish — SMA20<50') + trend200 : 'Insufficient data';
  const trendColor = (sma20 && sma50) ? (sma20 > sma50 ? 'var(--color-positive)' : 'var(--color-negative)') : 'var(--color-fg-muted)';

  const row = (label, value, color = 'var(--color-fg)') => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 10px;border-bottom:1px solid rgba(0,0,0,0.07);font-size:10px">
      <span style="color:var(--color-fg-muted)">${label}</span>
      <span style="color:${color};font-weight:600;font-family:var(--font-mono);font-size:9px">${value}</span>
    </div>`;
  const section = (label) => `
    <div style="padding:5px 10px;font-size:9px;color:var(--color-fg-dim);letter-spacing:0.08em;border-bottom:1px solid rgba(0,0,0,0.10);margin-top:2px">${label}</div>`;

  const analyticsHtml =
    section('TREND') +
    row('Direction', trendLabel, trendColor) +
    row('SMA 20',  sma20  ? '$' + fmt.price(sma20,  2) : '—') +
    row('SMA 50',  sma50  ? '$' + fmt.price(sma50,  2) : '—') +
    row('SMA 200', sma200 ? '$' + fmt.price(sma200, 2) : 'Need 200 bars', sma200 ? (price > sma200 ? 'var(--color-positive)' : 'var(--color-negative)') : 'var(--color-fg-dim)') +
    section('MOMENTUM') +
    row('RSI (14)', rsi.toFixed(1) + ' — ' + rsiLabel, rsiColor) +
    row('MACD Signal', macdLabel + ' (' + (macdVal >= 0 ? '+' : '') + macdVal.toFixed(2) + ')', macdColor) +
    row('BB Width', bbW.toFixed(4) + ' — ' + bbLabel) +
    section('PRICE') +
    row('Day Range', '$' + fmt.price(low, 2) + ' – $' + fmt.price(high, 2)) +
    row('Day Change', (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%', pct >= 0 ? 'var(--color-positive)' : 'var(--color-negative)') +
    section('VOLUME') +
    row('Vol 24H', fmt.compact(volUsdA)) +
    row('vs Avg Vol', (volRatio * 100).toFixed(0) + '% — ' + volLabel, volColor);

  ['ai-chat-messages', 'ai-chat-messages-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = analyticsHtml;
  });

  const meta = document.getElementById('ai-chat-meta');
  if (meta) meta.textContent = 'Technical';
  const heading = document.getElementById('ai-chat-heading');
  if (heading) heading.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
    Analytics`;
}

function restorePanels() {
  const news = document.getElementById('news-feed');
  if (news && viewCache.newsOriginal !== null) news.innerHTML = viewCache.newsOriginal;
  const meta = document.getElementById('ai-chat-meta');
  if (meta) meta.textContent = 'Ask about any ticker';
  renderAIChat();
  document.querySelector('.panel--news .panel__title').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2" aria-hidden="true">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
    </svg>
    Market Intelligence`;
}

// ═══════════════════════════════════════════════════════════
// NEWS BROADCAST
// ═══════════════════════════════════════════════════════════
const BROADCAST_TOPICS = [
  { fh: 'SPY',     label: 'Markets',     color: '#0a0a0a' },
  { fh: 'BTC-USD', label: 'Crypto',      color: '#6b6b6b' },
  { fh: 'AAPL',    label: 'Tech',        color: '#3a3a3a' },
  { fh: 'GLD',     label: 'Commodities', color: '#3a3a3a' },
  { fh: 'TSLA',    label: 'Equities',    color: '#8b8b8b' },
];

let broadcastCountdownTimer = null;
let broadcastCountdownVal   = 0;

function showBroadcastOverlay() {
  const el = document.getElementById('broadcast-overlay');
  if (el) el.classList.add('broadcast-overlay--visible');
}
function hideBroadcastOverlay() {
  const el = document.getElementById('broadcast-overlay');
  if (el) el.classList.remove('broadcast-overlay--visible');
  if (broadcastCountdownTimer) { clearInterval(broadcastCountdownTimer); broadcastCountdownTimer = null; }
}

function startBroadcastCountdown(seconds) {
  if (broadcastCountdownTimer) clearInterval(broadcastCountdownTimer);
  broadcastCountdownVal = seconds;
  const el = document.getElementById('broadcast-countdown');
  const tick = () => {
    if (!el) return;
    broadcastCountdownVal--;
    if (broadcastCountdownVal <= 0) {
      el.textContent = 'Refreshing…';
    } else {
      el.textContent = 'Refresh in ' + broadcastCountdownVal + 's';
    }
  };
  tick();
  broadcastCountdownTimer = setInterval(tick, 1000);
}

async function loadBroadcast() {
  const grid = document.getElementById('broadcast-grid');
  const meta = document.getElementById('broadcast-meta');
  if (!grid) return;

  grid.innerHTML = '<div class="broadcast-loading"><span class="broadcast-loading__dot"></span><span class="broadcast-loading__dot"></span><span class="broadcast-loading__dot"></span></div>';
  if (meta) meta.textContent = 'Fetching live feeds…';

  const allItems = [];
  const seenHeadlines = new Set();

  for (let i = 0; i < BROADCAST_TOPICS.length; i++) {
    const topic = BROADCAST_TOPICS[i];
    try {
      const data = await fetchCompanyNews(topic.fh);
      const news = data?.news || [];
      news.slice(0, 5).forEach(n => {
        const headline = n.title || '';
        if (!headline || seenHeadlines.has(headline)) return;
        seenHeadlines.add(headline);
        allItems.push({
          headline,
          source:    n.publisher || 'Yahoo Finance',
          time:      n.providerPublishTime ? relTime(n.providerPublishTime) : '',
          url:       n.link || '',
          sentiment: guessSentiment(headline),
          label:     topic.label,
          color:     topic.color,
          ts:        n.providerPublishTime || 0,
        });
      });
    } catch (e) {
      console.warn('Broadcast fetch failed for', topic.fh);
    }
    if (i < BROADCAST_TOPICS.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  allItems.sort((a, b) => b.ts - a.ts);

  if (meta) meta.textContent = allItems.length + ' stories · ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  renderBroadcastGrid(allItems);
  renderBroadcastTicker(allItems);
  startBroadcastCountdown(90);

  // Auto-refresh after 90s if still in news view
  setTimeout(() => {
    if (state.view === 'news') loadBroadcast();
  }, 90_000);
}

function renderBroadcastGrid(items) {
  const grid = document.getElementById('broadcast-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<div class="broadcast-empty">No stories available right now.</div>';
    return;
  }
  const sentColors = { bullish: '#0a0a0a', bearish: '#8b8b8b', neutral: '#9a9aa0' };
  grid.innerHTML = items.map((n, idx) => `
    <article class="bc-card ${idx === 0 ? 'bc-card--featured' : ''}" role="listitem"
      ${n.url ? 'tabindex="0" onclick="window.open(\'' + n.url.replace(/'/g,'') + '\',\'_blank\')" style="cursor:pointer"' : ''}>
      <div class="bc-card__top">
        <span class="bc-card__label" style="background:${n.color}20;color:${n.color};border-color:${n.color}40">${n.label}</span>
        <span class="bc-card__sentiment" style="background:${sentColors[n.sentiment] ?? sentColors.neutral}" title="${n.sentiment}"></span>
      </div>
      <p class="bc-card__headline">${n.headline}</p>
      <div class="bc-card__meta">
        <span class="bc-card__source">${n.source}</span>
        <span class="bc-card__time">${n.time ? n.time + ' ago' : ''}</span>
      </div>
    </article>`).join('');
}

function renderBroadcastTicker(items) {
  const bar = document.getElementById('broadcast-ticker-bar');
  if (!bar || !items.length) return;
  const sentColors = { bullish: '#0a0a0a', bearish: '#8b8b8b', neutral: '#888' };
  const text = items.map(n =>
    `<span class="bticker__item">
       <span class="bticker__dot" style="background:${sentColors[n.sentiment]}"></span>
       <span class="bticker__label" style="color:${n.color}">${n.label}</span>
       ${n.headline}
     </span>`
  ).join('<span class="bticker__sep">◆</span>');
  bar.innerHTML = `<div class="bticker__track">${text}${text}</div>`;
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
    'nav-news':      'news',
  };
  const navLabels = {
    'nav-markets':   null,
    'nav-portfolio': 'Portfolio View — Real positions, P&L, and allocation across all assets',
    'nav-analytics': 'Analytics — SMA 20/50 overlays, RSI, MACD, and Bollinger Bands',
    'nav-signals':   'Signals — SMA crossover buy/sell signals on the chart',
    'nav-news':      null,
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
        hideBroadcastOverlay();
        // Restore candles saved before analytics long-range load
        if (state._savedCandles?.length) {
          state.candles = state._savedCandles;
          state._savedCandles = null;
        }
        restorePanels();
        const active = getActiveAsset();
        loadNews(active);
        drawMainChart();
        if (msg) { showBanner(msg); setTimeout(hideBanner, 2000); }
        return;
      }

      // Portfolio view
      if (newView === 'portfolio') {
        hideBroadcastOverlay();
        if (state._savedCandles?.length) { state.candles = state._savedCandles; state._savedCandles = null; }
        renderPortfolio();
        drawMainChart();
        if (msg) { showBanner(msg); setTimeout(hideBanner, 2000); }
        return;
      }

      // Analytics view — auto-load 1D/2Y so SMA 200 has 200+ candles
      if (newView === 'analytics') {
        hideBroadcastOverlay();
        renderAnalytics();
        drawMainChart();
        const active = getActiveAsset();
        state._savedCandles = state.candles.slice();
        showBanner('Loading 2-year daily data for SMA 200…');
        loadChart(active, '1d', '2y').then(() => {
          hideBanner();
          if (state.view === 'analytics') { renderAnalytics(); drawMainChart(); }
        }).catch(() => hideBanner());
        if (msg) { showBanner(msg); setTimeout(hideBanner, 2000); }
        return;
      }

      // Signals view
      if (newView === 'signals') {
        hideBroadcastOverlay();
        if (state._savedCandles?.length) { state.candles = state._savedCandles; state._savedCandles = null; }
        drawMainChart();
        renderSignals();
        if (msg) { showBanner(msg); setTimeout(hideBanner, 2000); }
        return;
      }

      // News broadcast view
      if (newView === 'news') {
        showBroadcastOverlay();
        loadBroadcast();
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

  // Add Edit / Done toggle button
  const editBtn = document.createElement('button');
  editBtn.className = 'panel__action';
  editBtn.id = 'wl-edit-btn';
  editBtn.textContent = 'Edit';
  editBtn.setAttribute('aria-label', 'Edit watchlist');
  btn.parentElement.insertBefore(editBtn, btn);
  editBtn.addEventListener('click', () => {
    state.watchlistEdit = !state.watchlistEdit;
    editBtn.textContent = state.watchlistEdit ? 'Done' : 'Edit';
    editBtn.style.color = state.watchlistEdit ? 'var(--color-rose)' : '';
    renderWatchlistShell();
    renderWatchlist();
  });

  // Add Folder button
  const folderBtn = document.createElement('button');
  folderBtn.className = 'panel__action';
  folderBtn.id = 'wl-folder-btn';
  folderBtn.textContent = '⊕';
  folderBtn.title = 'Add folder';
  folderBtn.setAttribute('aria-label', 'Add folder');
  btn.parentElement.insertBefore(folderBtn, btn);
  folderBtn.addEventListener('click', () => {
    // Inline folder name input — no prompt()
    if (document.getElementById('wl-folder-input-row')) return;
    const row = document.createElement('div');
    row.id = 'wl-folder-input-row';
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--surface-2);border-bottom:1px solid var(--border);';
    const inp = document.createElement('input');
    inp.placeholder = 'Folder name…';
    inp.style.cssText = 'flex:1;font-family:var(--mono);font-size:11px;border:1px solid var(--border);border-radius:4px;padding:4px 8px;background:var(--surface);color:var(--text);outline:none;';
    const ok = document.createElement('button');
    ok.textContent = 'Create';
    ok.style.cssText = 'font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:0.06em;padding:4px 10px;border:none;border-radius:4px;background:var(--accent);color:#fff;cursor:pointer;';
    const cancel = document.createElement('button');
    cancel.textContent = '✕';
    cancel.style.cssText = 'font-family:var(--mono);font-size:11px;padding:4px 8px;border:none;border-radius:4px;background:transparent;color:var(--text-dim);cursor:pointer;';
    row.append(inp, ok, cancel);
    const wlList = document.querySelector('.watchlist__list, #watchlist-list, .watchlist');
    (wlList || document.getElementById('watchlist-panel'))?.prepend(row);
    inp.focus();
    const confirm = () => {
      const name = (inp.value || inp.getAttribute('value') || '').trim();
      if (name) {
        const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
        WATCHLIST_GROUPS.push({ id, name });
        saveGroups();
        renderWatchlistShell();
        renderWatchlist();
      }
      row.remove();
    };
    ok.addEventListener('click', confirm);
    cancel.addEventListener('click', () => row.remove());
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') row.remove(); });
  });

  // Create the add-symbol modal
  const modal = document.createElement('div');
  modal.className = 'wl-add-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Add symbol to watchlist');
  modal.innerHTML = `
    <div class="wl-add-modal__inner">
      <div class="wl-add-modal__header">
        <span>Add Symbol</span>
        <button class="wl-add-modal__close" aria-label="Close">✕</button>
      </div>
      <input class="wl-add-modal__input" type="text" placeholder="Search ticker or company…" autocomplete="off" spellcheck="false"/>
      <ul class="wl-add-modal__results" role="listbox"></ul>
    </div>`;
  document.body.appendChild(modal);

  const input   = modal.querySelector('.wl-add-modal__input');
  const results = modal.querySelector('.wl-add-modal__results');
  const closeBtn = modal.querySelector('.wl-add-modal__close');

  function openModal() {
    modal.classList.add('wl-add-modal--open');
    input.value = '';
    results.innerHTML = '';
    setTimeout(() => input.focus(), 50);
  }
  function closeModal() { modal.classList.remove('wl-add-modal--open'); }

  btn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 1) { results.innerHTML = ''; return; }
    results.innerHTML = '<li class="wl-add-modal__result wl-add-modal__result--loading">Searching…</li>';
    searchTimer = setTimeout(async () => {
      try {
        const data = await searchSymbols(q);
        const quotes = data?.quotes?.slice(0, 8) || [];
        if (!quotes.length) {
          results.innerHTML = '<li class="wl-add-modal__result wl-add-modal__result--loading">No results</li>';
          return;
        }
        results.innerHTML = quotes.map(r => {
          const sym  = r.symbol || '';
          const name = r.shortname || r.longname || sym;
          const type = r.quoteType || '';
          return `<li class="wl-add-modal__result" role="option" tabindex="0" data-sym="${sym}" data-name="${name}">
            <span class="wl-add-modal__result-sym">${sym}</span>
            <span class="wl-add-modal__result-name">${name}</span>
            <span class="wl-add-modal__result-type">${type}</span>
          </li>`;
        }).join('');

        results.querySelectorAll('.wl-add-modal__result[data-sym]').forEach(li => {
          const activate = () => {
            const sym  = li.dataset.sym;
            const name = li.dataset.name;
            if (!sym) return;
            const already = WATCHLIST.find(w => w.fh === sym);
            if (already) {
              closeModal();
              showBanner(sym + ' is already in your watchlist');
              setTimeout(hideBanner, 2000);
              return;
            }
            const color = WATCHLIST_COLORS[WATCHLIST.length % WATCHLIST_COLORS.length];
            if (WATCHLIST_GROUPS.length > 1) {
              // Show inline folder picker inside the modal
              results.innerHTML = `
                <li style="padding:10px 12px;font-size:11px;color:var(--text-muted);font-family:var(--mono);letter-spacing:0.06em">ADD ${sym} TO FOLDER:</li>
                ${WATCHLIST_GROUPS.map(g => `
                  <li class="wl-add-modal__result wl-folder-pick" data-group-id="${g.id}" role="option" tabindex="0">
                    <span style="font-size:16px">📁</span>
                    <span class="wl-add-modal__result-sym">${g.name}</span>
                  </li>`).join('')}
                <li class="wl-add-modal__result wl-folder-pick" data-group-id="" role="option" tabindex="0">
                  <span style="font-size:16px">·</span>
                  <span class="wl-add-modal__result-sym" style="color:var(--text-dim)">No folder</span>
                </li>`;
              results.querySelectorAll('.wl-folder-pick').forEach(row => {
                row.addEventListener('click', () => {
                  const chosenGroup = row.dataset.groupId || null;
                  WATCHLIST.push({ fh: sym, display: sym, name, color, group: chosenGroup });
                  saveWatchlistExtras();
                  renderWatchlistShell();
                  fetchQuote(sym).then(q => { if (q) state.quotes[sym] = q; renderWatchlist(); }).catch(() => {});
                  closeModal();
                  showBanner(sym + ' added!');
                  setTimeout(hideBanner, 2000);
                });
              });
            } else {
              const chosenGroup = WATCHLIST_GROUPS[0]?.id || null;
              WATCHLIST.push({ fh: sym, display: sym, name, color, group: chosenGroup });
              saveWatchlistExtras();
              renderWatchlistShell();
              fetchQuote(sym).then(q => { if (q) state.quotes[sym] = q; renderWatchlist(); }).catch(() => {});
              closeModal();
              showBanner(sym + ' added!');
              setTimeout(hideBanner, 2000);
            }
          };
          li.addEventListener('click', activate);
          li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
        });
      } catch {
        results.innerHTML = '<li class="wl-add-modal__result wl-add-modal__result--loading">Search failed</li>';
      }
    }, 320);
  });

  input.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

// ═══════════════════════════════════════════════════════════
// PRICE ALERTS
// ═══════════════════════════════════════════════════════════
function updateAlertBadge() {
  const badge = document.getElementById('alert-badge');
  if (!badge) return;
  if (state.alertUnread > 0) {
    badge.textContent = state.alertUnread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderAlertsList() {
  const list = document.getElementById('alerts-list');
  if (!list) return;
  if (!state.alerts.length) {
    list.innerHTML = '<li class="alerts-panel__empty">No alerts set. Add one below.</li>';
    return;
  }
  list.innerHTML = state.alerts.map((a, i) => `
    <li class="alerts-panel__item ${a.triggered ? 'alerts-panel__item--triggered' : ''}">
      <div class="alerts-panel__item-info">
        <span class="alerts-panel__item-sym">${a.display}</span>
        <span class="alerts-panel__item-cond">${a.direction === 'above' ? '▲ Above' : '▼ Below'} $${fmt.price(a.price, 2)}</span>
        ${a.triggered ? '<span class="alerts-panel__item-fired">FIRED ✓</span>' : ''}
      </div>
      <button class="alerts-panel__item-del" data-index="${i}" aria-label="Remove alert">✕</button>
    </li>`).join('');

  list.querySelectorAll('.alerts-panel__item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.index;
      state.alerts.splice(idx, 1);
      renderAlertsList();
    });
  });
}

function checkAlerts() {
  let fired = false;
  state.alerts.forEach(a => {
    if (a.triggered) return;
    const q = state.quotes[a.fh];
    if (!q) return;
    const price = q.regularMarketPrice;
    if (!price) return;
    const hit = (a.direction === 'above' && price >= a.price) ||
                (a.direction === 'below' && price <= a.price);
    if (hit) {
      a.triggered = true;
      state.alertUnread++;
      fired = true;
      showBanner(`🔔 Alert: ${a.display} is ${a.direction} $${fmt.price(a.price, 2)}!`);
      setTimeout(hideBanner, 4000);
    }
  });
  if (fired) {
    updateAlertBadge();
    renderAlertsList();
  }
}

function initAlerts() {
  const btn = document.getElementById('btn-notifications');
  if (!btn) return;

  // Inject badge
  btn.style.position = 'relative';
  const badge = document.createElement('span');
  badge.id = 'alert-badge';
  badge.className = 'alert-badge';
  badge.style.display = 'none';
  btn.appendChild(badge);

  // Create panel
  const panel = document.createElement('div');
  panel.id = 'alerts-panel';
  panel.className = 'alerts-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Price Alerts');
  panel.innerHTML = `
    <div class="alerts-panel__header">
      <span class="alerts-panel__title">Price Alerts</span>
      <button class="alerts-panel__close" aria-label="Close">✕</button>
    </div>
    <ul class="alerts-panel__list" id="alerts-list"></ul>
    <div class="alerts-panel__form">
      <select class="alerts-panel__select" id="alert-sym">
        ${WATCHLIST.map(w => `<option value="${w.fh}" data-display="${w.display}">${w.display} — ${w.name}</option>`).join('')}
      </select>
      <select class="alerts-panel__select" id="alert-dir">
        <option value="above">▲ Price above</option>
        <option value="below">▼ Price below</option>
      </select>
      <input class="alerts-panel__input" id="alert-price" type="number" placeholder="Target price…" min="0" step="any"/>
      <button class="alerts-panel__add-btn" id="alert-add-btn">+ Add Alert</button>
    </div>`;
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector('.alerts-panel__close');
  closeBtn.addEventListener('click', () => panel.classList.remove('alerts-panel--open'));

  document.getElementById('alert-add-btn').addEventListener('click', () => {
    const symEl   = document.getElementById('alert-sym');
    const dirEl   = document.getElementById('alert-dir');
    const priceEl = document.getElementById('alert-price');
    const fh      = symEl.value;
    const direction = dirEl.value;
    const price   = parseFloat(priceEl.value);
    if (!fh || !direction || isNaN(price) || price <= 0) {
      priceEl.style.borderColor = 'var(--color-rose)';
      setTimeout(() => { priceEl.style.borderColor = ''; }, 1200);
      return;
    }
    const w = WATCHLIST.find(x => x.fh === fh);
    state.alerts.push({ id: Date.now(), fh, display: w?.display || fh, direction, price, triggered: false });
    priceEl.value = '';
    renderAlertsList();
  });

  btn.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('alerts-panel--open');
    if (isOpen) {
      state.alertUnread = 0;
      updateAlertBadge();
      // Refresh symbol options in case watchlist changed
      const symEl = document.getElementById('alert-sym');
      if (symEl) symEl.innerHTML = WATCHLIST.map(w => `<option value="${w.fh}" data-display="${w.display}">${w.display} — ${w.name}</option>`).join('');
      renderAlertsList();
    }
  });

  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      panel.classList.remove('alerts-panel--open');
    }
  });

  renderAlertsList();
}

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
function initLogin() {
  const overlay = document.getElementById('login-overlay');
  if (!overlay) return;
  if (localStorage.getItem('terminal_auth') === 'tarek_ok') {
    overlay.style.display = 'none';
    return;
  }
  overlay.classList.add('login-overlay--visible');
  setTimeout(() => document.getElementById('login-user')?.focus(), 50);
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const user = document.getElementById('login-user').value.trim().toLowerCase();
    const pass = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');
    if (user === 'tarek' && pass === '1025') {
      localStorage.setItem('terminal_auth', 'tarek_ok');
      overlay.classList.add('login-overlay--exit');
      setTimeout(() => { overlay.classList.remove('login-overlay--visible', 'login-overlay--exit'); overlay.style.display = 'none'; }, 550);
    } else {
      errEl.textContent = 'Invalid username or password.';
      document.getElementById('login-pass').value = '';
      document.getElementById('login-pass').focus();
      const box = overlay.querySelector('.login-box');
      box.classList.remove('login-box--shake');
      void box.offsetWidth;
      box.classList.add('login-box--shake');
    }
  });
}

// ═══════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// MOBILE NAV — bottom tab panel switching
// ═══════════════════════════════════════════════════════════
// ── AI / Technical Analysis ──────────────────────────────
function renderAIAnalysis() {
  const panel = document.getElementById('ai-analysis-panel');
  const updated = document.getElementById('ai-updated');
  if (!panel) return;

  const candles = state.candles;
  if (!candles?.length) {
    panel.innerHTML = '<div class="ai-loading"><div class="ai-loading__dot"></div><div class="ai-loading__dot"></div><div class="ai-loading__dot"></div></div>';
    return;
  }

  const closes = candles.map(c => c.close);
  const last = closes[closes.length - 1];
  const len = closes.length;

  const sma = n => closes.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, len);
  const sma20 = sma(20), sma50 = sma(50), sma200 = sma(200);

  const rsiRaw = parseFloat(document.getElementById('rsi-val')?.textContent) || 50;
  const macdRaw = parseFloat((document.getElementById('macd-val')?.textContent || '0').replace('+', ''));
  const bbRaw = parseFloat(document.getElementById('bb-val')?.textContent) || 0;

  const rsiSignal = rsiRaw > 70 ? ['OVERBOUGHT', 'negative'] : rsiRaw < 30 ? ['OVERSOLD', 'positive'] : ['NEUTRAL', 'neutral'];
  const macdSignal = macdRaw > 0 ? ['BULLISH', 'positive'] : ['BEARISH', 'negative'];
  const trendSignal = last > sma20 && sma20 > sma50 ? ['UPTREND', 'positive'] : last < sma20 && sma20 < sma50 ? ['DOWNTREND', 'negative'] : ['SIDEWAYS', 'neutral'];
  const sma200Signal = last > sma200 ? ['ABOVE', 'positive'] : ['BELOW', 'negative'];
  const bbSignal = bbRaw < 0.05 ? ['SQUEEZE', 'neutral'] : bbRaw > 0.15 ? ['EXPANSION', 'neutral'] : ['NORMAL', 'neutral'];

  // Composite score
  let bull = 0, bear = 0;
  if (rsiRaw > 50) bull++; else if (rsiRaw < 50) bear++;
  if (macdRaw > 0) bull++; else bear++;
  if (last > sma50) bull++; else bear++;
  if (last > sma200) bull++; else bear++;
  if (trendSignal[0] === 'UPTREND') bull++; else if (trendSignal[0] === 'DOWNTREND') bear++;

  const total = bull + bear;
  const verdict = bull > bear ? 'BULLISH' : bear > bull ? 'BEARISH' : 'NEUTRAL';
  const verdictColor = verdict === 'BULLISH' ? 'positive' : verdict === 'BEARISH' ? 'negative' : '';
  const confidence = Math.round((Math.max(bull, bear) / total) * 100);
  const strength = confidence >= 80 ? 'STRONG' : confidence >= 60 ? 'MODERATE' : 'WEAK';
  const sym = document.getElementById('active-symbol')?.textContent?.split(' /')[0] || '';

  const row = (label, val, [sig, col]) => `
    <div class="ai-row">
      <span class="ai-row__label">${label}</span>
      <span class="ai-row__val">${val}</span>
      <span class="ai-row__tag ai-row__tag--${col}">${sig}</span>
    </div>`;

  panel.innerHTML = `
    <div class="ai-verdict">
      <div class="ai-verdict__inner">
        <div class="ai-verdict__signal ${verdictColor}">${verdict}</div>
        <div class="ai-verdict__sub">${strength} · ${confidence}% · ${sym}</div>
      </div>
      <div class="ai-verdict__bars">
        <div class="ai-verdict__bar ai-verdict__bar--bull" style="width:${Math.round(bull/total*100)}%"></div>
        <div class="ai-verdict__bar ai-verdict__bar--bear" style="width:${Math.round(bear/total*100)}%"></div>
      </div>
      <div class="ai-verdict__score">
        <span class="positive">${bull} bull</span> / <span class="negative">${bear} bear</span>
      </div>
    </div>
    <div class="ai-rows">
      ${row('RSI (14)', rsiRaw.toFixed(1), rsiSignal)}
      ${row('MACD', macdRaw >= 0 ? '+'+macdRaw.toFixed(2) : macdRaw.toFixed(2), macdSignal)}
      ${row('Trend', trendSignal[0], trendSignal)}
      ${row('vs SMA 20', fmt.price(sma20), [last > sma20 ? 'ABOVE' : 'BELOW', last > sma20 ? 'positive' : 'negative'])}
      ${row('vs SMA 50', fmt.price(sma50), [last > sma50 ? 'ABOVE' : 'BELOW', last > sma50 ? 'positive' : 'negative'])}
      ${row('vs SMA 200', fmt.price(sma200), sma200Signal)}
      ${row('BB Width', bbRaw.toFixed(4), bbSignal)}
    </div>
    <p class="ai-disclaimer">Technical signals only. Not financial advice.</p>`;

  if (updated) updated.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function initMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (!nav) return;

  // Build panel map from data-panel elements that are columns (not nav buttons)
  const colEls = document.querySelectorAll('.col-a, .col-b, .col-c, .col-d');
  const cols = {};
  colEls.forEach(el => { if (el.dataset.panel) cols[el.dataset.panel] = el; });

  function showPanel(panelKey) {
    Object.values(cols).forEach(c => c.classList.remove('mobile-active'));
    nav.querySelectorAll('.mobile-nav__btn').forEach(b => b.classList.remove('mobile-nav__btn--active'));
    if (cols[panelKey]) cols[panelKey].classList.add('mobile-active');
    nav.querySelectorAll(`.mobile-nav__btn[data-panel="${panelKey}"]`)
       .forEach(b => b.classList.add('mobile-nav__btn--active'));

    if (panelKey === 'chart' || panelKey === 'analytics') {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        if (typeof drawMainChart === 'function') drawMainChart();
      });
    }
    if (panelKey === 'ai') renderAIChat();
  }

  // Expose for other modules (e.g. watchlist click → show chart)
  window.__showMobilePanel = showPanel;

  if (window.innerWidth <= 768) showPanel('chart');

  // Direct per-button listeners — reliable across all mobile browsers
  nav.querySelectorAll('.mobile-nav__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      const view  = btn.dataset.mobileView;
      if (panel && cols[panel]) {
        showPanel(panel);
      } else if (view) {
        const desktopBtn = document.getElementById(`nav-${view}`);
        if (desktopBtn) desktopBtn.click();
        showPanel('chart');
        nav.querySelectorAll('.mobile-nav__btn').forEach(b => b.classList.remove('mobile-nav__btn--active'));
        btn.classList.add('mobile-nav__btn--active');
      }
    });
  });

  window.matchMedia('(max-width: 768px)').addEventListener('change', e => {
    if (!e.matches) Object.values(cols).forEach(c => c.classList.remove('mobile-active'));
    else showPanel('chart');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  restoreWatchlistExtras();
  restoreGroupMap();
  restoreGroups();
  initClock();
  initBgCanvas();
  initMobileNav();
  initMainChart();
  initVolumeChart();
  initRadarChart();
  initSearch();
  initKeyboardShortcut();
  initNavigation();
  initWatchlistAdd();
  initAlerts();
  initPortfolioEdit();
  initAIChat();
  initHeatmap();

  renderWatchlistShell();

  // Capture original panel HTML for clean restoration when switching views
  const newsEl = document.getElementById('news-feed');
  if (newsEl) viewCache.newsOriginal = newsEl.innerHTML;

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

  // Refresh ticker-bar extra symbols (TSLA, AAPL, etc.) every 3 minutes
  const tickerExtras = TICKER_SYMBOLS.filter(s => !new Set(WATCHLIST.map(w => w.fh)).has(s));
  setInterval(async () => {
    for (let i = 0; i < tickerExtras.length; i++) {
      try {
        const q = await fetchQuote(tickerExtras[i]);
        if (q) state.quotes[tickerExtras[i]] = q;
      } catch {}
      if (i < tickerExtras.length - 1) await new Promise(r => setTimeout(r, 300));
    }
    renderTicker();
  }, 180_000);

  setInterval(() => {
    const active = getActiveAsset();
    loadChart(active, '60m', '5d');
  }, 60_000);

  setInterval(() => {
    const el = document.getElementById('latency');
    if (el) el.textContent = Math.floor(rand(20, 60)) + 'ms';
  }, 3000);
});