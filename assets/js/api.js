// ═══════════════ CONFIG ═══════════════
var API_BASE = 'https://api.enjoybadagry.online/api/admin';
var authToken = localStorage.getItem('admin_token') || null;

// ═══════════════ API HELPER ═══════════════
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
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json;
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
async function loadAllData() {
  load(true);
  try {
    var results = await Promise.all([
      api('GET', '/destinations'),
      api('GET', '/foods'),
      api('GET', '/hotels'),
      api('GET', '/orders'),
      api('GET', '/drivers')
    ]);
    cachedPlacesArr = results[0].data.destinations || [];
    // Build lookup map by id
    cachedPlaces = {};
    cachedPlacesArr.forEach(function(p) { cachedPlaces[p.id] = p; });

    cachedFoods = {};
    var foodsArr = results[1].data.foods || [];
    foodsArr.forEach(function(f) { cachedFoods[f.id] = f; });

    cachedHotels = {};
    var hotelsArr = results[2].data.hotels || [];
    hotelsArr.forEach(function(h) { cachedHotels[h.id] = h; });

    cachedOrders = {};
    var ordersArr = results[3].data.orders || [];
    ordersArr.forEach(function(o) { cachedOrders[o.id] = o; });

    cachedDrivers = {};
    var driversArr = results[4].data.drivers || [];
    driversArr.forEach(function(d) { cachedDrivers[d.id] = d; });

    renderCached();
    updateDestDropdown();
    toast('Data loaded');
  } catch (e) {
    toast('Failed to load data: ' + e.message, false);
  } finally {
    load(false);
  }
}
