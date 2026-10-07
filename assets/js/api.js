// ═══════════════ CONFIG ═══════════════
var API_BASE = 'https://api.enjoybadagry.online/api/admin';
var authToken = localStorage.getItem('admin_token') || null;

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

async function api(method, path, body) {
  var opts = {
    method: method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch(API_BASE + path, opts);
  var json = await res.json();
  if (res.status === 401) {
    doLogout();
    throw new Error('Session expired');
  }
  if (!json.success) throw apiError(json, 'Request failed');
  return json;
}

// Uploads a FormData payload (multipart, e.g. image files). api() always
// sends JSON, so file uploads need this helper instead.
async function apiUpload(path, formData) {
  var opts = { method: 'POST', headers: {}, body: formData };
  if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
  var res = await fetch(API_BASE + path, opts);
  var json = await res.json();
  if (res.status === 401) {
    doLogout();
    throw new Error('Session expired');
  }
  if (!json.success) throw apiError(json, 'Upload failed');
  return json;
}

// Downloads a binary file (csv/xls/pdf) from an admin endpoint.
// Returns { filename, rows, truncated }.
async function apiDownload(path, fallbackName) {
  var opts = { method: 'GET', headers: {} };
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

    var results = await Promise.all(jobs.map(function(j) { return j[1]; }));
    var byKey = {};
    jobs.forEach(function(j, i) { byKey[j[0]] = results[i]; });

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
    if (jobs.length) toast('Data loaded');
  } catch (e) {
    toast('Failed to load data: ' + e.message, false);
  } finally {
    load(false);
  }
}
