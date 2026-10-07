// ═══════════════ COMMAND PALETTE, SHORTCUTS, HEALTH ═══════════════
// Ctrl+K palette backed by the real /search endpoint, global keyboard
// shortcuts, a live connection status polled against the backend health
// endpoint, an offline banner and the new-orders polling badge.

var PAL_DEBOUNCE_MS = 220;
var HEALTH_INTERVAL_MS = 30000;
var ORDER_POLL_MS = 45000;

// Where a search result should land: the panel to open plus the search box
// to fill so the panel itself filters to the same query.
var PAL_TARGETS = {
  users:            { tab: 'users',      input: 'um-search' },
  rides:            { tab: 'rides',      input: 'rd-search' },
  hotel_bookings:   { tab: 'hotel',      input: 'hb-search', sub: 'bookings' },
  reviews:          { tab: 'reviews',    input: 'rv-search' },
  orders:           { tab: 'orders',     input: 'o-search' },
  drivers:          { tab: 'drivers',    input: 'dri-search' },
  destinations:     { tab: 'dest' },
  foods:            { tab: 'food' },
  hotels:           { tab: 'hotel' }
};

var palState = { open: false, results: [], index: 0, query: '' };
var palSearchTimer = null;

// ─── Palette ───

function openPalette() {
  var bg = document.getElementById('paletteBg');
  if (!bg) return;
  bg.classList.add('on');
  palState.open = true;
  palState.index = 0;
  var input = document.getElementById('palInput');
  if (input) { input.value = ''; input.focus(); }
  palRenderCommands('');
}

function closePalette() {
  var bg = document.getElementById('paletteBg');
  if (bg) bg.classList.remove('on');
  palState.open = false;
}

function palRenderCommands(q) {
  var query = (q || '').toLowerCase().trim();
  var items = [];

  Object.keys(TAB_META).forEach(function(tab) {
    if (TAB_PERMS[tab] && !hasPerm(TAB_PERMS[tab])) return;
    var meta = TAB_META[tab];
    if (!query || meta.label.toLowerCase().indexOf(query) >= 0 || tab.indexOf(query) >= 0) {
      items.push({ kind: 'page', tab: tab, title: meta.label, sub: meta.group, tag: 'Page' });
    }
  });

  var actions = [
    { title: 'New destination', fn: 'openDestModal', perm: 'content.destinations.write' },
    { title: 'New food item', fn: 'openFoodModal', perm: 'content.food.write' },
    { title: 'New hotel', fn: 'openHotelModal', perm: 'content.hotels.write' },
    { title: 'New driver', fn: 'openDriverModal', perm: 'drivers.manage' },
    { title: 'Toggle light / dark theme', fn: 'toggleTheme' },
    { title: 'Keyboard shortcuts', fn: 'openShortcuts' },
    { title: 'My profile', fn: "switchTab('profile')" }
  ];
  actions.forEach(function(a) {
    if (a.perm && !hasPerm(a.perm)) return;
    if (!query || a.title.toLowerCase().indexOf(query) >= 0) {
      items.push({ kind: 'action', fn: a.fn, title: a.title, sub: '', tag: 'Action' });
    }
  });

  palState.results = items.slice(0, 30);
  palState.index = 0;
  palPaint({ groups: [{ key: 'commands', label: query ? 'Matches' : 'Jump to', items: palState.results }] });
}

function palPaint(groups) {
  var box = document.getElementById('palResults');
  if (!box) return;
  if (!groups || !groups.length || !groups.some(function(g) { return g.items.length; })) {
    box.innerHTML = '<div class="pal-empty">No matches.<br>Search users, orders, rides, drivers, bookings and content - or type a page name.</div>';
    palState.results = [];
    return;
  }
  var html = '';
  var flat = [];
  groups.forEach(function(g) {
    if (!g.items.length) return;
    html += '<div class="pal-group">' + esc(g.label) + '</div>';
    g.items.forEach(function(it) {
      var i = flat.length;
      flat.push(it);
      html += '<button type="button" class="pal-item' + (i === palState.index ? ' on' : '') + '" data-i="' + i + '">' +
        '<span class="pal-ico">' + esc((it.letter || it.title || '?').charAt(0)) + '</span>' +
        '<span class="pal-body">' +
          '<span class="pal-title pal-act">' + esc(it.title) + '</span>' +
          (it.sub ? '<span class="pal-sub">' + esc(it.sub) + '</span>' : '') +
        '</span>' +
        (it.tag ? '<span class="pal-tag">' + esc(it.tag) + '</span>' : '') +
      '</button>';
    });
  });
  box.innerHTML = html;
  palState.results = flat;
  Array.prototype.forEach.call(box.querySelectorAll('[data-i]'), function(btn) {
    btn.onmousedown = function(e) { e.preventDefault(); };
    btn.onclick = function() { palPick(parseInt(btn.getAttribute('data-i'), 10)); };
  });
}

function palMove(delta) {
  if (!palState.results.length) return;
  palState.index = (palState.index + delta + palState.results.length) % palState.results.length;
  var box = document.getElementById('palResults');
  if (!box) return;
  Array.prototype.forEach.call(box.querySelectorAll('.pal-item'), function(el, i) {
    el.classList.toggle('on', i === palState.index);
    if (i === palState.index && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  });
}

function palPick(i) {
  var item = palState.results[i];
  if (!item) return;
  closePalette();
  if (item.kind === 'page') { switchTab(item.tab); return; }
  if (item.kind === 'result') { palOpenResult(item); return; }
  if (item.kind === 'action') {
    try {
      if (item.fn.indexOf('(') >= 0) { new Function(item.fn)(); }
      else if (typeof window[item.fn] === 'function') window[item.fn]();
    } catch (e) { toast('Action failed: ' + e.message, false); }
  }
}

// Jumps to the owning panel and seeds its search box so the panel itself
// shows the row - no duplicated detail view in the palette.
function palOpenResult(item) {
  var target = PAL_TARGETS[item.type] || {};
  var tab = target.tab || 'overview';
  switchTab(tab);
  if (target.sub === 'bookings' && typeof hotelSwitchTab === 'function') {
    var sub = document.querySelector('[data-hotel-tab="bookings"]');
    if (sub) hotelSwitchTab('bookings', sub);
  }
  if (target.input) {
    var el = document.getElementById(target.input);
    if (el) {
      el.value = palState.lastQuery || '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else {
    toast(item.title + (item.status ? ' - ' + item.status : ''));
  }
}

function palRunSearch(q) {
  palState.lastQuery = q;
  if (q.length < 2) { palRenderCommands(q); return; }
  api('GET', '/search' + kitQuery({ q: q })).then(function(res) {
    if (palState.lastQuery !== q) return;
    var results = (res.data && res.data.results) || [];
    var groups = [];
    var flat = [];
    results.forEach(function(g) {
      var items = g.rows.map(function(r) {
        return {
          kind: 'result',
          type: g.key,
          id: r.id,
          title: r.title || r.id,
          sub: [g.label, r.subtitle, r.status].filter(Boolean).join(' · '),
          tag: g.label,
          letter: (g.label || '?').charAt(0)
        };
      });
      flat = flat.concat(items);
      groups.push({ key: g.key, label: g.label, items: items });
    });
    if (!flat.length) {
      palPaint([]);
      return;
    }
    palState.index = 0;
    palPaint(groups);
  }).catch(function() {
    // Auth/network failures already surface through api(); keep the palette usable.
  });
}

// ─── Shortcuts help ───

function openShortcuts() {
  var m = document.getElementById('shortcutsModal');
  if (m) m.classList.add('on');
}

function closeShortcuts() {
  var m = document.getElementById('shortcutsModal');
  if (m) m.classList.remove('on');
}

// ─── Connection status (real health endpoint, no cosmetic "Connected") ───

var healthState = 'checking';
var healthTimer = null;
var healthBusy = false;

function healthUrl() {
  return API_BASE.replace(/\/api\/admin\/?$/, '') + '/health';
}

function setHealth(state) {
  healthState = state;
  var conn = document.querySelector('.conn');
  var txt = document.getElementById('connTxt');
  if (conn) {
    conn.classList.toggle('is-checking', state === 'checking');
    conn.classList.toggle('is-offline', state === 'offline');
  }
  if (txt) txt.textContent = state === 'online' ? 'Connected' : state === 'checking' ? 'Reconnecting…' : 'Offline';
  document.body.classList.toggle('is-offline', state === 'offline');
}

async function pingHealth() {
  if (healthBusy) return;
  healthBusy = true;
  if (healthState !== 'online') setHealth('checking');
  try {
    var res = await fetch(healthUrl(), { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    if (!json || (json.success === false && !json.data)) throw new Error('Bad payload');
    setHealth('online');
  } catch (e) {
    setHealth('offline');
  } finally {
    healthBusy = false;
  }
}

function startHealthPolling() {
  stopHealthPolling();
  pingHealth();
  healthTimer = setInterval(pingHealth, HEALTH_INTERVAL_MS);
}

function stopHealthPolling() {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
}

window.addEventListener('online', function() { pingHealth(); });
window.addEventListener('offline', function() { setHealth('offline'); });

// ─── New orders polling ───

var orderPollTimer = null;
var orderSeenAt = null;
var orderSeenIds = {};
var orderPendingNew = {};

function ordersBadgeEl() { return document.getElementById('ord-side-badge'); }

function updateOrdersBadge() {
  var el = ordersBadgeEl();
  if (!el) return;
  // While the admin is already on orders the "N new" pill carries the news;
  // the sidebar badge stays hidden so the same orders are not counted twice.
  var onOrders = document.getElementById('panel-orders') &&
    document.getElementById('panel-orders').classList.contains('on');
  var n = onOrders ? 0 : Object.keys(orderPendingNew).length;
  el.style.display = n ? '' : 'none';
  el.textContent = n > 99 ? '99+' : String(n);
}

function ordersPanelOpened() {
  orderPendingNew = {};
  updateOrdersBadge();
  var pill = document.getElementById('o-new-orders');
  if (pill) pill.style.display = 'none';
}

async function pollNewOrders(initial) {
  if (!hasPerm('orders.food.view')) return;
  try {
    var url;
    if (initial || !orderSeenAt) {
      // Baseline only: never badge orders that were already on screen.
      url = '/orders' + kitQuery({ page: 1, limit: 1, sort: 'created', dir: 'desc' });
    } else {
      url = '/orders' + kitQuery({ since: orderSeenAt, page: 1, limit: 20, sort: 'created', dir: 'asc' });
    }
    var res = await api('GET', url);
    var rows = (res.data && res.data.orders) || [];
    if (initial || !orderSeenAt) {
      if (rows.length && rows[0].createdAt) orderSeenAt = rows[0].createdAt;
      return;
    }
    var fresh = 0;
    rows.forEach(function(o) {
      if (o.id == null || orderSeenIds[String(o.id)]) return;
      orderSeenIds[String(o.id)] = true;
      orderPendingNew[String(o.id)] = true;
      fresh++;
      if (o.createdAt && (!orderSeenAt || o.createdAt > orderSeenAt)) orderSeenAt = o.createdAt;
    });
    if (!fresh) return;

    var onOrders = document.getElementById('panel-orders') &&
      document.getElementById('panel-orders').classList.contains('on');
    if (onOrders) {
      // The admin is already looking at orders: surface the "N new" pill so
      // they choose when to pull the list in (no surprise re-render). The
      // count is cumulative across polls until the panel is refreshed.
      var pill = document.getElementById('o-new-orders');
      var cnt = document.getElementById('o-new-count');
      var total = Object.keys(orderPendingNew).length;
      if (cnt) cnt.textContent = String(total > 99 ? '99+' : total);
      if (pill) pill.style.display = '';
    }
    updateOrdersBadge();
  } catch (e) {
    // Health polling already reports connectivity; stay quiet here.
  }
}

function startOrderPolling() {
  stopOrderPolling();
  orderSeenIds = {};
  orderPendingNew = {};
  updateOrdersBadge();
  pollNewOrders(true);
  orderPollTimer = setInterval(function() {
    if (healthState === 'offline') return;
    pollNewOrders(false);
  }, ORDER_POLL_MS);
}

function stopOrderPolling() {
  if (orderPollTimer) { clearInterval(orderPollTimer); orderPollTimer = null; }
}

// ─── Global keyboard shortcuts ───

function palTypingTarget(e) {
  var t = e.target;
  if (!t) return false;
  var tag = (t.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
}

var NEW_ACTION_BY_TAB = {
  dest: 'openDestModal',
  food: 'openFoodModal',
  hotel: 'openHotelModal',
  drivers: 'openDriverModal'
};

function runNewAction() {
  var active = document.querySelector('.side-item.on');
  var tab = active ? active.getAttribute('data-tab') : '';
  var fn = NEW_ACTION_BY_TAB[tab];
  if (!fn || typeof window[fn] !== 'function') {
    toast('Nothing new to create on this page', false);
    return;
  }
  try { window[fn](); } catch (e) { toast(e.message, false); }
}

document.addEventListener('keydown', function(e) {
  var mod = e.ctrlKey || e.metaKey;

  if (mod && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    palState.open ? closePalette() : openPalette();
    return;
  }

  if (palState.open) {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); palPick(palState.index); }
    return;
  }

  if (e.key === 'Escape') {
    closeShortcuts();
    return;
  }

  if (palTypingTarget(e) || mod) return;

  if (e.key === '/') { e.preventDefault(); openPalette(); }
  else if (e.key === '?') { e.preventDefault(); openShortcuts(); }
  else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); runNewAction(); }
});

// ─── Boot ───

document.addEventListener('DOMContentLoaded', function() {
  var trigger = document.getElementById('searchTrigger');
  if (trigger) trigger.addEventListener('click', openPalette);

  var bg = document.getElementById('paletteBg');
  if (bg) {
    bg.addEventListener('mousedown', function(e) { if (e.target === bg) closePalette(); });
    var input = document.getElementById('palInput');
    if (input) {
      input.addEventListener('input', function() {
        var q = input.value;
        if (palSearchTimer) clearTimeout(palSearchTimer);
        palSearchTimer = setTimeout(function() { palRunSearch(q.trim()); }, PAL_DEBOUNCE_MS);
      });
    }
  }

  var helpBtn = document.getElementById('shortcutsBtn');
  if (helpBtn) helpBtn.addEventListener('click', openShortcuts);

  startHealthPolling();
  startOrderPolling();
});
