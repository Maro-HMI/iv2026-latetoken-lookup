// Late Token Tracker (Interactive Visualization 2026) — client-side lookup
// The student number is hashed in the browser; only the hashed record is fetched.

const DEFAULT_SALT = 'iv_2026_late_tokens_salt'; // must match build.py
const PAGE_TITLE = 'IV 2026 Token Lookup';

let appConfig = null;

// Canonical key, same as build.py: UT numbers lose the leading 's', VU numbers stay as they are
function normalizeStudentId(input) {
  if (!input) return '';
  return input.trim().toLowerCase().replace(/^s\s*(?=\d)/, '');
}

// What we show back to the student: trimmed and lowercase, as typed
function displayStudentId(input) {
  return input.trim().toLowerCase().replace(/\s+/g, '');
}

async function computeHash(salt, studentId) {
  const data = new TextEncoder().encode(`${salt}:${studentId}`.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadConfig() {
  try {
    const res = await fetch('data/config.json?v=' + Date.now());
    if (!res.ok) return;
    appConfig = await res.json();
    if (appConfig.last_updated) {
      const formatted = new Date(appConfig.last_updated)
        .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      document.getElementById('lastUpdated').textContent = `Updated ${formatted}`;
    }
  } catch (err) {
    // Fail silently; the lookup falls back to the default salt
  }
}

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alertBox');
  alertBox.className = type === 'error'
    ? 'mt-3 p-3.5 rounded-lg text-xs font-medium border bg-rose-50 border-rose-200 text-rose-800'
    : 'mt-3 p-3.5 rounded-lg text-xs font-medium border bg-blue-50 border-blue-200 text-blue-800';
  alertBox.textContent = message;
  alertBox.classList.remove('hidden');
}

function hideAlert() {
  document.getElementById('alertBox').classList.add('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createTransactionRow(tx) {
  const row = document.createElement('div');
  row.className = 'flex items-center justify-between py-1 px-2 rounded bg-slate-50/80 border border-slate-200/70 text-[11px]';

  const delta = Number(tx.delta ?? 0);
  const isBase = tx.type === 'BASE';
  const color = isBase ? 'text-slate-500' : (delta > 0 ? 'text-emerald-700' : 'text-rose-700');
  const sign = delta > 0 && !isBase ? '+' : '';
  const reason = escapeHtml(tx.reason || tx.type || '');

  row.innerHTML = `
    <div class="flex items-center space-x-2 truncate min-w-0 pr-1">
      <span class="text-[10px] text-slate-400 font-mono shrink-0">${escapeHtml(tx.date || '')}</span>
      <span class="text-slate-700 truncate font-normal" title="${reason}">${reason}</span>
    </div>
    <span class="font-bold shrink-0 ml-2 font-mono ${color}">${sign}${delta.toFixed(1)}</span>
  `;
  return row;
}

function renderRecord(data) {
  const earned = data.earned || 0;
  const spent = data.spent || 0;
  document.getElementById('balance').textContent = (data.balance || 0).toFixed(1);
  document.getElementById('base').textContent = (data.base ?? 1).toFixed(1);
  document.getElementById('earned').textContent = `+${earned.toFixed(1)}`;
  document.getElementById('spent').textContent = `-${spent.toFixed(1)}`;

  const ledger = document.getElementById('ledger');
  ledger.innerHTML = '';
  const transactions = (data.transactions || []).slice().reverse();
  if (transactions.length === 0) {
    ledger.innerHTML = '<div class="text-[11px] text-slate-500 py-1">No activity yet.</div>';
  } else {
    transactions.forEach(tx => ledger.appendChild(createTransactionRow(tx)));
  }
}

// Student number from the URL (#1234567, #/s1234567, ?id=1234567)
function getStudentIdFromUrl() {
  if (window.location.hash) {
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    if (hash) {
      const paramMatch = hash.match(/(?:id|student)=([a-z0-9]+)/i);
      if (paramMatch) return paramMatch[1];
      const cleanHash = hash.split(/[?&]/)[0].replace(/\/$/, '');
      if (cleanHash) return decodeURIComponent(cleanHash);
    }
  }
  if (window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || params.get('student');
    if (id) return id.trim();
  }
  return '';
}

async function performLookup(rawId, updateUrl = true) {
  hideAlert();

  const inputEl = document.getElementById('studentIdInput');
  const submitBtn = document.getElementById('submitBtn');
  const searchIcon = document.getElementById('searchIcon');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const resultsContainer = document.getElementById('resultsContainer');

  if (!rawId) {
    showAlert('Please enter your student number.');
    inputEl.focus();
    return;
  }

  const shownId = displayStudentId(rawId);
  inputEl.value = shownId;
  inputEl.blur();

  submitBtn.disabled = true;
  searchIcon.classList.add('hidden');
  loadingSpinner.classList.remove('hidden');

  try {
    const salt = appConfig?.salt || DEFAULT_SALT;
    const hash = await computeHash(salt, normalizeStudentId(rawId));
    const res = await fetch(`data/${hash}.json?t=${Date.now()}`);

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Student number "${shownId}" was not found in the course roster. Please double-check the number or contact your teacher.`);
      }
      throw new Error(`Error loading record (${res.status}). Please try again.`);
    }

    const data = await res.json();
    document.getElementById('displayStudentId').textContent = shownId;
    renderRecord(data);

    if (updateUrl) {
      history.replaceState(null, '', window.location.pathname + '#' + encodeURIComponent(shownId));
    }
    document.title = `IV 2026 Tokens — ${shownId}`;

    resultsContainer.classList.remove('hidden');
    if (window.innerWidth < 768) {
      setTimeout(() => resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  } catch (err) {
    resultsContainer.classList.add('hidden');
    document.title = PAGE_TITLE;
    const isNetworkError = err.name === 'TypeError' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
    showAlert(isNetworkError
      ? 'Unable to connect to the server. Please check your internet connection and try again.'
      : (err.message || 'An unexpected error occurred.'));
  } finally {
    submitBtn.disabled = false;
    searchIcon.classList.remove('hidden');
    loadingSpinner.classList.add('hidden');
  }
}

function handleFormSubmit(e) {
  e.preventDefault();
  performLookup(document.getElementById('studentIdInput').value.trim(), true);
}

function handleClearSearch() {
  document.getElementById('studentIdInput').value = '';
  document.getElementById('resultsContainer').classList.add('hidden');
  hideAlert();
  document.title = PAGE_TITLE;
  if (window.location.hash || window.location.search) {
    history.replaceState(null, '', window.location.pathname);
  }
  document.getElementById('studentIdInput').focus();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();

  document.getElementById('tokenForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('clearSearchBtn').addEventListener('click', handleClearSearch);

  window.addEventListener('hashchange', () => {
    const urlId = getStudentIdFromUrl();
    if (urlId) performLookup(urlId, false);
    else handleClearSearch();
  });

  const initialId = getStudentIdFromUrl();
  if (initialId) performLookup(initialId, true);
});
