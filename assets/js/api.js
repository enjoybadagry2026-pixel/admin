// ═══════════════ CONFIG ═══════════════
var API_BASE = 'https://api.enjoybadagry.online/api/admin';
// Admin authentication is cookie-backed. Remove the legacy browser-readable
// token during migration; the server still accepts bearer tokens for clients
// that have not migrated yet.
var authToken = null;
var adminSessionReady = false;
var adminAuthReadyPromise;
var adminAuthReadyResolve;
function resetAdminAuthGate() {
  adminAuthReadyPromise = new Promise(function(resolve) { adminAuthReadyResolve = resolve; });
}
function resolveAdminAuthGate(ready) {
  adminSessionReady = !!ready;
  if (adminAuthReadyResolve) { adminAuthReadyResolve(!!ready); adminAuthReadyResolve = null; }
}
resetAdminAuthGate();
try { localStorage.removeItem('admin_token'); } catch (_) {}

// ═══════════════ API HELPER ═══════════════
// Builds an Error message, appending per-field validation details when the
// backend returns `errors: [{ field, message }]`.
function apiError(json, fallback) {
  var msg = json.message || fallback;
  if (Array.isArray(json.errors) && json.errors.length) {
    var detail = json.errors
      .map(function(e) { return e && (e.message || e.field) ? (e.field ? e.field + ': ' + (e.message || '') : e.message) : String(e); })
      .filter(Boolean)
      .join('; ');
    if (detail) msg = msg + ' — ' + detail;
  }
  return new Error(msg);
}

async function api(method, path, body, options) {
  options = options || {};
  if (!options.skipAuthWait && !adminSessionReady) {
    await adminAuthReadyPromise;
    if (!adminSessionReady) {
      var notAuthenticated = new Error('Administrator session is not authenticated');
      notAuthenticated.status = 401;
      throw notAuthenticated;
    }
  }
  var opts = {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  };
  if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
  if (body) opts.body = JSON.stringify(body);
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timeout = setTimeout(function() { if (controller) controller.abort(); }, options.timeout || 20000);
  if (controller) opts.signal = controller.signal;
  try {
    var res = await fetch(API_BASE + path, opts);
    var raw = await res.text();
    var json = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch (parseError) {
      var contentError = new Error('The server returned an invalid response. Please try again.');
      contentError.status = res.status;
      throw contentError;
    }
    if (res.status === 401) {
      if (typeof doLogout === 'function') doLogout();
      var sessionError = new Error('Session expired. Please sign in again.');
      sessionError.status = 401;
      throw sessionError;
    }
    if (!res.ok || !json.success) {
      var error = apiError(json, res.status >= 500 ? 'The server is temporarily unavailable.' : 'Request failed');
      error.status = res.status;
      throw error;
    }
    return json;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request timed out. Check your connection and try again.');
    var retryable = method.toUpperCase() === 'GET' && (!error.status || error.status >= 500);
    if (retryable && !options.retried) {
      return api(method, path, body, { timeout: options.timeout, retried: true });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Uploads a FormData payload (multipart, e.g. image files). api() always
// sends JSON, so file uploads need this helper instead.
async function apiUpload(path, formData) {
  var opts = { method: 'POST', headers: {}, body: formData, credentials: 'include' };
  if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
  var res = await fetch(API_BASE + path, opts);
  var raw = await res.text();
  var json = {};
  try { json = raw ? JSON.parse(raw) : {}; } catch (e) { throw new Error('The server returned an invalid upload response.'); }
  if (res.status === 401) {
    doLogout();
    throw new Error('Session expired');
  }
  if (!res.ok || !json.success) throw apiError(json, res.status >= 500 ? 'Upload service is temporarily unavailable.' : 'Upload failed');
  return json;
}

// Downloads a binary file (csv/xls/pdf) from an admin endpoint.
// Returns { filename, rows, truncated }.
async function apiDownload(path, fallbackName) {
  var opts = { method: 'GET', headers: {}, credentials: 'include' };
  if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
  var res = await fetch(API_BASE + path, opts);
  if (res.status === 401) {
    doLogout();
    throw new Error('Session expired');
  }
  if (!res.ok) {
    var msg = 'Download failed';
    try {
      var errJson = await res.json();
      msg = errJson.message || msg;
    } catch (e) { /* non-JSON error body */ }
    throw new Error(msg);
  }
  var filename = fallbackName || 'export';
  var cd = res.headers.get('Content-Disposition') || '';
  var m = cd.match(/filename="?([^";]+)"?/i);
  if (m && m[1]) filename = m[1];
  var blob = await res.blob();
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
  return {
    filename: filename,
    rows: res.headers.get('X-Export-Rows'),
    truncated: res.headers.get('X-Export-Truncated') === 'true'
  };
}

// ═══════════════ GLOBAL DRAG & DROP GUARD ═══════════════
// Dropping a file anywhere outside the gallery/banner widgets made the browser
// navigate to it, wiping the page and every unsaved form. Bubble phase only:
// never stopPropagation, so the gallery/banner tile handlers (which live on
// their own elements) still run first — and when they already called
// preventDefault we simply do nothing.

function isFileDrag(e) {
  var dt = e.dataTransfer;
  if (!dt || !dt.types) return false;
  for (var i = 0; i < dt.types.length; i++) {
    if (dt.types[i] === 'Files') return true;
  }
  return false;
}

document.addEventListener('dragover', function(e) {
  if (e.defaultPrevented || !isFileDrag(e)) return;
  e.preventDefault();
});

document.addEventListener('drop', function(e) {
  if (e.defaultPrevented || !isFileDrag(e)) return;
  // Dropping onto a file input (e.g. the CSV import) must keep filling it.
  var t = e.target;
  if (t && t.closest && t.closest('input[type=file]')) return;
  e.preventDefault();
});

// ═══════════════ CACHED DATA ═══════════════
var cachedPlaces = {};
var cachedFoods = {};
var cachedHotels = {};
var cachedOrders = {};
var cachedDrivers = {};
var cachedPlacesArr = [];

function renderCached() {
  renderDest(cachedPlacesArr);
  renderFood(cachedFoods, cachedPlaces);
  renderHotels(cachedHotels);
  renderOrders(cachedOrders);
  renderDrivers(cachedDrivers);
}

// ═══════════════ LOAD ALL DATA ═══════════════
// Only requests the current role is allowed to make are fired, so a limited
// admin never gets a wall of 403 toasts on sign-in.
async function loadAllData() {
  load(true);
  try {
    var jobs = [];
    if (hasPerm('content.destinations.read')) jobs.push(['dest', api('GET', '/destinations')]);
    if (hasPerm('content.food.read')) jobs.push(['food', api('GET', '/foods')]);
    if (hasPerm('content.hotels.read')) jobs.push(['hotel', api('GET', '/hotels')]);
    if (hasPerm('orders.food.view')) jobs.push(['orders', api('GET', '/orders')]);
    if (hasPerm('drivers.view')) jobs.push(['drivers', api('GET', '/drivers')]);

    var settled = await Promise.allSettled(jobs.map(function(j) { return j[1]; }));
    var byKey = {};
    var failed = [];
    jobs.forEach(function(j, i) {
      if (settled[i].status === 'fulfilled') byKey[j[0]] = settled[i].value;
      else failed.push(j[0]);
    });

    cachedPlacesArr = byKey.dest ? (byKey.dest.data.destinations || []) : [];
    cachedPlaces = {};
    cachedPlacesArr.forEach(function(p) { cachedPlaces[p.id] = p; });

    cachedFoods = {};
    (byKey.food ? (byKey.food.data.foods || []) : []).forEach(function(f) { cachedFoods[f.id] = f; });

    cachedHotels = {};
    (byKey.hotel ? (byKey.hotel.data.hotels || []) : []).forEach(function(h) { cachedHotels[h.id] = h; });

    cachedOrders = {};
    (byKey.orders ? (byKey.orders.data.orders || []) : []).forEach(function(o) { cachedOrders[o.id] = o; });

    cachedDrivers = {};
    (byKey.drivers ? (byKey.drivers.data.drivers || []) : []).forEach(function(d) { cachedDrivers[d.id] = d; });

    renderCached();
    updateDestDropdown();
    if (jobs.length) toast(failed.length ? 'Some data could not be loaded. Open the affected section to retry.' : 'Data loaded', failed.length === 0);
  } catch (e) {
    toast('Failed to load data: ' + e.message, false);
  } finally {
    load(false);
  }
}
