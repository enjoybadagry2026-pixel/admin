// ═══════════════ CONFIG ═══════════════
// The API is hosted separately from the admin UI. Local development still
// talks to the remote API, whose loopback profile must be explicitly enabled.
// A manual override remains available for staging or a local API instance.
var API_BASE = window.ADMIN_API_BASE || 'https://api.enjoybadagry.online/api/admin';
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
  json = json && typeof json === 'object' ? json : {};
  var msg = json.message || fallback;
  if (Array.isArray(json.errors) && json.errors.length) {
    var detail = json.errors
      .map(function(e) { return e && (e.message || e.field) ? (e.field ? e.field + ': ' + (e.message || '') : e.message) : String(e); })
      .filter(Boolean)
      .join('; ');
    if (detail) msg = msg + ' — ' + detail;
  }
  var error = new Error(msg);
  error.code = json.errorCode || null;
  error.details = json.errors || null;
  return error;
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
  if (options.headers) {
    Object.keys(options.headers).forEach(function(key) { opts.headers[key] = options.headers[key]; });
  }
  if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
  if (body) opts.body = JSON.stringify(body);
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var callerSignal = options.signal || null;
  var callerAbort = null;
  if (controller) {
    opts.signal = controller.signal;
    if (callerSignal) {
      callerAbort = function() { controller.abort(); };
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', callerAbort, { once: true });
    }
  } else if (callerSignal) opts.signal = callerSignal;
  var timeout = setTimeout(function() { if (controller) controller.abort(); }, options.timeout || 20000);
  try {
    var res = await fetch(API_BASE + path, opts);
    var raw = await res.text();
    var json = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch (parseError) {
      var contentError = new Error('The server returned an invalid response. Please try again.');
      contentError.status = res.status;
      throw contentError;
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) json = {};
    if (res.status === 401) {
      if (typeof doLogout === 'function') doLogout();
      var sessionError = new Error('Session expired. Please sign in again.');
      sessionError.status = 401;
      throw sessionError;
    }
    if (!res.ok || !json.success) {
      var error = apiError(json, res.status >= 500 ? 'The server is temporarily unavailable.' : 'Request failed');
      error.status = res.status;
      error.requestId = res.headers.get('X-Request-Id') || null;
      if (error.code === 'STEP_UP_INVALID') error.message = 'Security authorization expired or was already used. Please try the protected action again.';
      throw error;
    }
    return json;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request timed out. Check your connection and try again.');
    if (error.status === 428 && error.code === 'DATABASE_THREE_FACTOR_REQUIRED' && !options.databaseSecurityRetried && typeof window.requestDatabaseSecurity === 'function') {
      var databaseDetails = error.details || {};
      var databaseGrant = await window.requestDatabaseSecurity({ operation: databaseDetails.operation, targetHash: databaseDetails.targetHash, method: method, path: path, body: body, review: window.dbPendingReview || null });
      var databaseBody = body && typeof body === 'object' ? Object.assign({}, body, { reason: databaseGrant.reason }) : { reason: databaseGrant.reason };
      var databaseRetryOptions = Object.assign({}, options, {
        databaseSecurityRetried: true,
        headers: Object.assign({}, options.headers || {}, { 'X-Admin-Database-Grant': databaseGrant.grant })
      });
      return api(method, path, databaseBody, databaseRetryOptions);
    }
    if (error.status === 428 && error.code === 'STEP_UP_REQUIRED' && !options.skipStepUp && !options.stepUpRetried && typeof window.requestSuperSecurity === 'function') {
      var details = error.details || {};
      var grant = await window.requestSuperSecurity({ operation: details.operation, targetHash: details.targetHash });
      var retryOptions = Object.assign({}, options, {
        stepUpRetried: true,
        headers: Object.assign({}, options.headers || {}, { 'X-Admin-Step-Up': grant })
      });
      return api(method, path, body, retryOptions);
    }
    var retryable = method.toUpperCase() === 'GET' && (!error.status || error.status >= 500);
    if (retryable && !options.retried) {
      return api(method, path, body, Object.assign({}, options, {
        retried: true,
        headers: Object.assign({}, options.headers || {})
      }));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (callerSignal && callerAbort) callerSignal.removeEventListener('abort', callerAbort);
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
  if (!adminSessionReady) {
    await adminAuthReadyPromise;
    if (!adminSessionReady) throw new Error('Administrator session is not authenticated');
  }
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

var dataLoadPromise = null;
var dataLoadGeneration = 0;
var dataModulePromises = {};
var dataModuleState = {};
var DATA_MODULES = {
  dest: { host: 'd-list', permission: 'content.destinations.read', path: '/destinations' },
  food: { host: 'f-list', permission: 'content.food.read', path: '/foods' },
  hotel: { host: 'h-list', permission: 'content.hotels.read', path: '/hotels' },
  orders: { host: 'o-list', permission: 'orders.food.view', path: '/orders' },
  drivers: { host: 'dri-list', permission: 'drivers.view', path: '/drivers' }
};

function dataModuleStateEl(key) {
  var module = DATA_MODULES[key], host = module && document.getElementById(module.host);
  if (!host) return null;
  var id = 'data-load-state-' + key, el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'data-load-state';
    host.parentNode.insertBefore(el, host.nextSibling);
  }
  return el;
}

function setDataModuleState(key, status, message) {
  var state = dataModuleState[key] || (dataModuleState[key] = {});
  state.status = status;
  var el = dataModuleStateEl(key);
  if (!el) return;
  if (status === 'ready' || status === 'loading') {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.innerHTML = '<div class="data-load-state-message">' + esc(message || 'Could not load this section.') + '</div>' +
    (status === 'error' ? '<button type="button" class="btn btn-ghost btn-sm" onclick="retryDataModule(\'' + key + '\')">Retry</button>' : '');
}

function updateDataModuleCache(key, response) {
  var data = response && response.data || {};
  if (key === 'dest') {
    cachedPlacesArr = Array.isArray(data.destinations) ? data.destinations : [];
    cachedPlaces = {};
    cachedPlacesArr.forEach(function(p) { cachedPlaces[p.id] = p; });
    renderDest(cachedPlacesArr);
    updateDestDropdown();
  } else if (key === 'food') {
    cachedFoods = {};
    (Array.isArray(data.foods) ? data.foods : []).forEach(function(f) { cachedFoods[f.id] = f; });
    renderFood(cachedFoods, cachedPlaces);
  } else if (key === 'hotel') {
    cachedHotels = {};
    (Array.isArray(data.hotels) ? data.hotels : []).forEach(function(h) { cachedHotels[h.id] = h; });
    renderHotels(cachedHotels);
  } else if (key === 'orders') {
    cachedOrders = {};
    (Array.isArray(data.orders) ? data.orders : []).forEach(function(o) { cachedOrders[o.id] = o; });
    renderOrders(cachedOrders);
  } else if (key === 'drivers') {
    cachedDrivers = {};
    (Array.isArray(data.drivers) ? data.drivers : []).forEach(function(d) { cachedDrivers[d.id] = d; });
    renderDrivers(cachedDrivers);
  }
}

function loadDataModule(key, generation) {
  var module = DATA_MODULES[key];
  if (!module || !hasPerm(module.permission)) return Promise.resolve(null);
  if (dataModulePromises[key]) return dataModulePromises[key];
  var promiseMap = dataModulePromises;
  var state = dataModuleState[key] || (dataModuleState[key] = {});
  state.status = 'loading';
  setDataModuleState(key, 'loading');
  promiseMap[key] = api('GET', module.path).then(function(response) {
    if (generation !== dataLoadGeneration || !adminSessionReady) return response;
    updateDataModuleCache(key, response);
    state.hasData = true;
    setDataModuleState(key, 'ready');
    return response;
  }).catch(function(error) {
    if (generation === dataLoadGeneration && adminSessionReady) {
      var hadData = !!state.hasData;
      setDataModuleState(key, 'error', (hadData ? 'Showing previously loaded data. ' : '') + (error.message || 'Unable to load this section.'));
    }
    throw error;
  }).finally(function() { promiseMap[key] = null; });
  return promiseMap[key];
}

function retryDataModule(key) {
  return loadDataModule(key, dataLoadGeneration).catch(function() {
    toast('Retry failed for ' + (DATA_MODULES[key] ? DATA_MODULES[key].path.slice(1) : 'this section'), false);
  });
}

function invalidateDataLoadSession() {
  dataLoadGeneration++;
  dataLoadPromise = null;
  dataModulePromises = {};
  dataModuleState = {};
}

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
function loadAllData() {
  if (dataLoadPromise) return dataLoadPromise;
  var generation = ++dataLoadGeneration;
  load(true);
  var keys = Object.keys(DATA_MODULES).filter(function(key) { return hasPerm(DATA_MODULES[key].permission); });
  var currentPromise;
  currentPromise = Promise.allSettled(keys.map(function(key) { return loadDataModule(key, generation); })).then(function(results) {
    var failed = results.filter(function(result) { return result.status === 'rejected'; }).length;
    if (keys.length) toast(failed ? 'Some sections could not be loaded. Use Retry in the affected section.' : 'Data loaded', failed === 0);
  }).finally(function() {
    if (generation === dataLoadGeneration) load(false);
    if (dataLoadPromise === currentPromise) dataLoadPromise = null;
  });
  dataLoadPromise = currentPromise;
  return dataLoadPromise;
}
