// EcoSage frontend — ES module, no build step required
// Communicates with the Express API server for all data and AI features.

import { initializeApp }                                        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup,
         onAuthStateChanged, signOut as fbSignOut }             from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

function getAnonSessionId() {
  let id = sessionStorage.getItem('ecosage_session');
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('ecosage_session', id);
  }
  return id;
}

let SESSION_ID   = getAnonSessionId();
let firebaseAuth = null;

const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Emission factors fetched once from API
let emissionFactors = {};
let chartInstances  = {};
let chatHistory     = [];

// ── API helpers ──────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Tab routing ──────────────────────────────────────────
const tabBtns  = document.querySelectorAll('.tab-btn');
const panels   = document.querySelectorAll('.panel');
let   panelLoaded = {};

function activateTab(tabName) {
  tabBtns.forEach(btn => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.setAttribute('tabindex', active ? '0' : '-1');
  });
  panels.forEach(p => {
    const active = p.id === `panel-${tabName}`;
    p.classList.toggle('active', active);
    p.hidden = !active;
  });
  if (!panelLoaded[tabName]) {
    panelLoaded[tabName] = true;
    loadPanel(tabName);
  }
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  btn.addEventListener('keydown', e => {
    const tabs = [...tabBtns];
    const idx  = tabs.indexOf(e.currentTarget);
    if (e.key === 'ArrowRight') { tabs[(idx + 1) % tabs.length].focus(); e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { tabs[(idx - 1 + tabs.length) % tabs.length].focus(); e.preventDefault(); }
    if (e.key === 'Home') { tabs[0].focus(); e.preventDefault(); }
    if (e.key === 'End')  { tabs[tabs.length - 1].focus(); e.preventDefault(); }
  });
});

async function loadPanel(name) {
  if (name === 'dashboard') await loadDashboard();
  if (name === 'insights')  await loadInsights();
  if (name === 'actions')   await loadActions();
}

// ── Auth UI ───────────────────────────────────────────────
function updateAuthUI(user) {
  const signedIn  = document.getElementById('auth-signed-in');
  const signedOut = document.getElementById('auth-signed-out');
  if (!signedIn || !signedOut) return;
  if (user) {
    signedOut.hidden = true;
    signedIn.hidden  = false;
    document.getElementById('user-name').textContent = user.displayName ?? user.email ?? '';
    const avatar = document.getElementById('user-avatar');
    avatar.src    = user.photoURL ?? '';
    avatar.hidden = !user.photoURL;
  } else {
    signedOut.hidden = false;
    signedIn.hidden  = true;
  }
}

document.getElementById('sign-in-btn')?.addEventListener('click', async () => {
  if (!firebaseAuth) return;
  try {
    await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
  } catch (err) {
    console.error('[auth] sign-in failed:', err.message);
  }
});

document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
  if (!firebaseAuth) return;
  await fbSignOut(firebaseAuth);
});

// ── Init ─────────────────────────────────────────────────
async function init() {
  try {
    const [factorsData, cfg] = await Promise.all([
      apiFetch('/emission-factors'),
      apiFetch('/config'),
    ]);
    emissionFactors = factorsData.factors;

    if (cfg.demoMode) document.getElementById('demo-badge').hidden = false;

    initLogForm();
    initChatForm();

    if (cfg.firebaseApiKey) {
      const app = initializeApp({
        apiKey:            cfg.firebaseApiKey,
        authDomain:        cfg.firebaseAuthDomain,
        projectId:         cfg.firebaseProjectId,
        storageBucket:     cfg.firebaseStorageBucket,
        messagingSenderId: cfg.firebaseMessagingSenderId,
        appId:             cfg.firebaseAppId,
      });
      firebaseAuth = getAuth(app);

      onAuthStateChanged(firebaseAuth, async user => {
        SESSION_ID = user ? user.uid : getAnonSessionId();
        updateAuthUI(user);
        chatHistory = [];
        panelLoaded = {};
        await loadDashboard();
        panelLoaded.dashboard = true;
      });

      // Show sign-in button while Firebase resolves auth state
      document.getElementById('auth-signed-out').hidden = false;
    } else {
      // No Firebase config — load immediately with anonymous session
      await loadDashboard();
      panelLoaded.dashboard = true;
    }
  } catch (err) {
    console.error('[init]', err);
  }
}

// ── Dashboard ─────────────────────────────────────────────
async function loadDashboard() {
  await Promise.all([
    loadScoreGauge(),
    loadBreakdownChart(),
    loadRecentActivities(),
    loadTips(),
  ]);
}

async function loadScoreGauge() {
  try {
    const data = await apiFetch(`/compare?sessionId=${SESSION_ID}&days=30`);
    const monthly = data.monthlyEquivalent;
    const rating  = data.comparison.rating;

    document.getElementById('gauge-value').textContent = monthly.toFixed(1);

    const ratingEl = document.getElementById('score-rating');
    const labels = { excellent: 'Excellent 🌟', good: 'Good 👍', average: 'Average', high: 'High ⚠️' };
    ratingEl.textContent = labels[rating] || rating;
    ratingEl.className = `score-rating rating-${rating}`;

    drawGauge(monthly, data.averages);
  } catch (_) { /* silent — demo data still shows */ }
}

function drawGauge(value, averages) {
  const canvas = document.getElementById('gauge-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2, cy = canvas.height / 2, r = 85;
  const start = Math.PI * 0.75, end = Math.PI * 2.25;

  const max = averages.global_monthly;
  const pct = Math.min(value / max, 1);
  const angle = start + pct * (end - start);

  // Track color
  const color = value <= averages.india_monthly ? '#40916c'
    : value <= averages.paris_monthly           ? '#f59e0b'
    : '#ef4444';

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 18;
  ctx.lineCap = 'round';

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = '#e5e7eb';
  ctx.stroke();

  // Value arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, angle);
  ctx.strokeStyle = color;
  ctx.stroke();
}

async function loadBreakdownChart() {
  try {
    const data = await apiFetch(`/insights?sessionId=${SESSION_ID}&days=30`);
    const totals = data.totals;
    const labels = ['Transport', 'Energy', 'Food', 'Shopping', 'Waste'];
    const values = [totals.transport, totals.energy, totals.food, totals.shopping, totals.waste];
    const colors = ['#2d6a4f', '#40916c', '#74c69d', '#f59e0b', '#6b7280'];

    const canvas = document.getElementById('breakdown-chart');
    destroyChart('breakdown');
    chartInstances.breakdown = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)} kg` } },
        },
        animation: { duration: REDUCE_MOTION ? 0 : 600 },
      },
    });

    // Custom legend
    const legendEl = document.getElementById('breakdown-legend');
    legendEl.innerHTML = labels.map((l, i) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${l}: ${values[i].toFixed(1)} kg</span>`
    ).join('');
  } catch (_) { /* silent */ }
}

async function loadRecentActivities() {
  try {
    const data = await apiFetch(`/history?sessionId=${SESSION_ID}&limit=5`);
    const list = document.getElementById('recent-list');
    if (!data.activities.length) {
      list.innerHTML = '<li class="muted">No activities logged yet. Start tracking!</li>';
      return;
    }
    list.innerHTML = data.activities.map(a =>
      `<li><span>${a.label}</span><span class="recent-co2">${a.co2} kg</span></li>`
    ).join('');
  } catch (_) { /* silent */ }
}

async function loadTips() {
  try {
    const data = await apiFetch(`/tips?sessionId=${SESSION_ID}`);
    const list = document.getElementById('tips-list');
    list.innerHTML = data.tips.map(t => `<li>${escHtml(t)}</li>`).join('');
  } catch (_) {
    document.getElementById('tips-list').innerHTML = '<li class="muted">Tips unavailable right now.</li>';
  }
}

// ── Log Activity form ────────────────────────────────────
const TYPE_OPTIONS = {
  transport: [
    ['petrol_car', 'Petrol Car', 'km'],
    ['diesel_car', 'Diesel Car', 'km'],
    ['two_wheeler', 'Two-Wheeler (Petrol)', 'km'],
    ['auto_rickshaw', 'Auto-Rickshaw (CNG)', 'km'],
    ['bus', 'City Bus', 'km'],
    ['metro', 'Metro / Local Train', 'km'],
    ['domestic_flight', 'Domestic Flight', 'km'],
    ['ev_car', 'Electric Car', 'km'],
  ],
  energy: [
    ['electricity', 'Electricity', 'kWh'],
    ['lpg', 'LPG Cylinder', 'cylinders'],
    ['ac_hour', 'Air Conditioning', 'hours'],
  ],
  food: [
    ['veg_meal', 'Vegetarian Meal', 'meals'],
    ['egg_meal', 'Egg-based Meal', 'meals'],
    ['chicken_meal', 'Chicken Meal', 'meals'],
    ['mutton_meal', 'Mutton/Lamb Meal', 'meals'],
    ['milk_500ml', 'Dairy – 500 ml Milk', 'servings'],
  ],
  shopping: [
    ['clothing', 'Clothing Item', 'items'],
    ['smartphone', 'Smartphone', 'items'],
    ['laptop', 'Laptop', 'items'],
    ['appliance', 'Home Appliance', 'items'],
    ['online_order', 'Online Order (delivery)', 'items'],
  ],
  waste: [
    ['recycling', 'Monthly Recycling', 'months'],
    ['composting', 'Monthly Composting', 'months'],
    ['landfill_bag', 'Landfill Waste Bag', 'bags'],
  ],
};

function initLogForm() {
  const categoryEl  = document.getElementById('log-category');
  const typeEl      = document.getElementById('log-type');
  const quantityEl  = document.getElementById('log-quantity');
  const unitBadge   = document.getElementById('quantity-unit');
  const previewEl   = document.getElementById('co2-preview');
  const feedbackEl  = document.getElementById('log-feedback');
  const form        = document.getElementById('log-form');

  categoryEl.addEventListener('change', () => {
    const cat = categoryEl.value;
    typeEl.disabled = !cat;
    typeEl.innerHTML = cat
      ? TYPE_OPTIONS[cat].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')
      : '<option value="">— Select category first —</option>';
    updateUnitBadge();
    updatePreview();
  });

  typeEl.addEventListener('change', () => { updateUnitBadge(); updatePreview(); });
  quantityEl.addEventListener('input', updatePreview);

  function updateUnitBadge() {
    const cat  = categoryEl.value;
    const type = typeEl.value;
    if (!cat || !type) { unitBadge.textContent = ''; return; }
    const opt = TYPE_OPTIONS[cat]?.find(([v]) => v === type);
    unitBadge.textContent = opt ? opt[2] : '';
  }

  function updatePreview() {
    const cat      = categoryEl.value;
    const type     = typeEl.value;
    const quantity = parseFloat(quantityEl.value);
    if (!cat || !type || isNaN(quantity) || quantity < 0) {
      previewEl.hidden = true;
      return;
    }
    const factor = emissionFactors[cat]?.[type]?.factor;
    if (!factor) { previewEl.hidden = true; return; }
    const co2 = (factor * quantity).toFixed(3);
    previewEl.textContent = `≈ ${co2} kg CO₂e`;
    previewEl.hidden = false;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    feedbackEl.textContent = '';
    feedbackEl.className = 'log-feedback';

    const category = categoryEl.value;
    const type     = typeEl.value;
    const quantity = parseFloat(quantityEl.value);

    if (!category || !type || isNaN(quantity) || quantity < 0) {
      feedbackEl.textContent = 'Please fill in all fields with valid values.';
      feedbackEl.classList.add('feedback-error');
      return;
    }

    const submitBtn = document.getElementById('log-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging…';

    try {
      const result = await apiFetch('/log', {
        method: 'POST',
        body: JSON.stringify({ sessionId: SESSION_ID, category, type, quantity }),
      });
      feedbackEl.textContent = `✓ Logged: ${result.label} — ${result.co2} kg CO₂e`;
      feedbackEl.classList.add('feedback-success');
      form.reset();
      typeEl.disabled = true;
      typeEl.innerHTML = '<option value="">— Select category first —</option>';
      previewEl.hidden = true;
      unitBadge.textContent = '';

      // Refresh dashboard data
      panelLoaded['dashboard'] = false;
      if (document.getElementById('panel-dashboard').classList.contains('active')) {
        panelLoaded['dashboard'] = true;
        await loadDashboard();
      }
      // Bust insights cache
      panelLoaded['insights'] = false;
    } catch (err) {
      feedbackEl.textContent = `Error: ${err.message}`;
      feedbackEl.classList.add('feedback-error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log Activity';
    }
  });
}

// ── Insights ─────────────────────────────────────────────
async function loadInsights() {
  const days = document.getElementById('period-select')?.value || 30;
  await Promise.all([
    loadTrendChart(days),
    loadCompareChart(days),
    loadStats(days),
  ]);
}

async function loadTrendChart(days) {
  try {
    const data = await apiFetch(`/insights?sessionId=${SESSION_ID}&days=${days}`);
    const labels = data.daily.map(d => d.date.slice(5)); // MM-DD
    const values = data.daily.map(d => d.co2);

    const canvas = document.getElementById('trend-chart');
    destroyChart('trend');
    chartInstances.trend = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Daily CO₂e (kg)',
          data: values,
          borderColor: '#40916c',
          backgroundColor: 'rgba(64,145,108,.12)',
          fill: true,
          tension: 0.35,
          pointRadius: values.length > 30 ? 0 : 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => `${v} kg` } },
          x: { ticks: { maxTicksLimit: 8 } },
        },
        animation: { duration: REDUCE_MOTION ? 0 : 400 },
      },
    });
  } catch (_) { /* silent */ }
}

async function loadCompareChart(days) {
  try {
    const data = await apiFetch(`/compare?sessionId=${SESSION_ID}&days=${days}`);
    const yours = data.monthlyEquivalent;
    const avgs  = data.averages;

    const canvas = document.getElementById('compare-chart');
    destroyChart('compare');
    chartInstances.compare = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['You', 'Indian avg', '1.5°C target', 'Global avg'],
        datasets: [{
          data: [yours, avgs.india_monthly, avgs.paris_monthly, avgs.global_monthly],
          backgroundColor: ['#2d6a4f', '#74c69d', '#f59e0b', '#ef4444'],
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(1)} kg/month` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => `${v} kg` } } },
        animation: { duration: REDUCE_MOTION ? 0 : 400 },
      },
    });
  } catch (_) { /* silent */ }
}

async function loadStats(days) {
  try {
    const [ins, cmp] = await Promise.all([
      apiFetch(`/insights?sessionId=${SESSION_ID}&days=${days}`),
      apiFetch(`/compare?sessionId=${SESSION_ID}&days=${days}`),
    ]);
    document.getElementById('stat-total').textContent   = `${ins.grandTotal.toFixed(1)} kg CO₂e`;
    document.getElementById('stat-monthly').textContent = `${cmp.monthlyEquivalent.toFixed(1)} kg/month`;
    const diff = cmp.comparison.india_diff_pct;
    document.getElementById('stat-india').textContent   = `${diff >= 0 ? '+' : ''}${diff}% vs Indian avg`;
    document.getElementById('stat-top').textContent     = ins.topCategory;
    document.getElementById('stat-count').textContent   = ins.activityCount;
  } catch (_) { /* silent */ }
}

document.getElementById('period-select')?.addEventListener('change', () => {
  panelLoaded['insights'] = false;
  loadInsights();
});

// ── Chat ──────────────────────────────────────────────────
function initChatForm() {
  const form     = document.getElementById('chat-form');
  const input    = document.getElementById('chat-input');
  const messages = document.getElementById('chat-messages');
  const sendBtn  = document.getElementById('chat-send');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    appendMessage('user', escHtml(text));

    const typingEl = appendTyping();
    sendBtn.disabled = true;

    try {
      const res = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ sessionId: SESSION_ID, message: text, history: chatHistory }),
      });
      chatHistory.push(
        { role: 'user',  parts: [{ text }] },
        { role: 'model', parts: [{ text: res.reply }] }
      );
      if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
      typingEl.remove();
      appendMessage('bot', escHtml(res.reply));
    } catch (err) {
      typingEl.remove();
      appendMessage('bot', `Sorry, I encountered an error: ${escHtml(err.message)}`);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });

  function appendMessage(role, html) {
    const div = document.createElement('div');
    div.className = `message ${role === 'user' ? 'user-message' : 'bot-message'}`;
    div.innerHTML = `<div class="message-bubble">${html}</div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function appendTyping() {
    const div = document.createElement('div');
    div.className = 'message bot-message';
    div.innerHTML = '<div class="message-bubble chat-typing"><span></span><span></span><span></span></div>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }
}

// ── Actions ──────────────────────────────────────────────
async function loadActions() {
  const filter  = document.getElementById('action-filter')?.value || '';
  const url     = `/actions${filter ? `?category=${filter}` : ''}`;
  const list    = document.getElementById('actions-list');

  try {
    const data = await apiFetch(url);
    if (!data.actions.length) {
      list.innerHTML = '<li class="muted">No actions found for this category.</li>';
      return;
    }
    list.innerHTML = data.actions.map(a => `
      <li class="action-item">
        <div class="action-impact">
          <span class="impact-value">${a.impact_kg_month}</span>
          <span class="impact-label">kg CO₂/mo saved</span>
        </div>
        <div class="action-body">
          <div class="action-title">${escHtml(a.title)}</div>
          <div class="action-desc">${escHtml(a.description)}</div>
          <span class="difficulty-badge diff-${a.difficulty}">${capitalise(a.difficulty)}</span>
        </div>
      </li>`
    ).join('');
  } catch (err) {
    list.innerHTML = `<li class="muted">Error loading actions: ${escHtml(err.message)}</li>`;
  }
}

document.getElementById('action-filter')?.addEventListener('change', () => loadActions());

// ── Utilities ─────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    delete chartInstances[key];
  }
}

// Boot
init();
