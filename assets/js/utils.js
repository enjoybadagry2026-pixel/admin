// ═══════════════ UTILITIES ═══════════════

var search = '';
var delCb = null;

// Tab metadata: used for the active state, the header breadcrumb
// and for keeping the sidebar in sync with the visible panel.
var TAB_META = {
  overview: { label: 'Overview',     group: 'Dashboard' },
  rides:    { label: 'Rides',        group: 'Operations' },
  orders:   { label: 'Food Orders',  group: 'Operations' },
  users:    { label: 'Users',        group: 'Management' },
  drivers:  { label: 'Drivers',      group: 'Management' },
  dest:     { label: 'Destinations', group: 'Content' },
  hotel:    { label: 'Hotels',       group: 'Content' },
  food:     { label: 'Food Menu',    group: 'Content' },
  events:   { label: 'Events & Festivals', group: 'Content' },
  tours:    { label: 'Tour Packages', group: 'Content' },
  banners:  { label: 'Banners & Carousel', group: 'Content' },
  taxonomy: { label: 'Tags & Categories', group: 'Content' },
  reviews:  { label: 'Reviews & Ratings', group: 'Content' },
  wallets:  { label: 'Wallets & Payouts', group: 'Finance' },
  revenue:  { label: 'Revenue & Reporting', group: 'Finance' },
  support:  { label: 'Support Inbox', group: 'Support' },
  notifications: { label: 'Notifications', group: 'Engagement' },
  audit:    { label: 'Audit Log', group: 'Security' },
  staff:    { label: 'Admin Staff', group: 'Security' },
  profile:  { label: 'My Profile', group: 'Account' }
};

var PANEL_IDS = ['overview', 'users', 'dest', 'hotel', 'food', 'events', 'tours', 'banners', 'taxonomy', 'reviews', 'orders', 'rides', 'drivers', 'wallets', 'revenue', 'support', 'notifications', 'audit', 'staff', 'profile'];

// Permission required to see each tab. '' = every signed-in admin.
// Mirrors requirePermission(...) in routes/admin.js so the sidebar hides
// what the API would reject with a 403 anyway.
var TAB_PERMS = {
  overview: 'overview.view',
  rides: 'rides.view',
  orders: 'orders.food.view',
  support: 'support.view',
  notifications: 'notifications.view',
  users: 'users.view',
  drivers: 'drivers.view',
  wallets: 'wallets.view',
  revenue: 'reports.view',
  dest: 'content.destinations.read',
  hotel: 'content.hotels.read',
  food: 'content.food.read',
  events: 'content.events.read',
  tours: 'content.tours.read',
  banners: 'content.banners.read',
  taxonomy: 'content.taxonomy.read',
  reviews: 'reviews.read',
  audit: 'audit.view',
  staff: 'admins.manage',
  profile: ''
};

/** Permission codes of the signed-in admin (null when unavailable). */
function adminPermissions() {
  try {
    var u = JSON.parse(localStorage.getItem('admin_user') || 'null') || {};
    return Array.isArray(u.permissions) ? u.permissions : null;
  } catch (e) { return null; }
}

/**
 * True when the signed-in admin holds `code`.
 * No code = always allowed. Permissions unknown (session written before RBAC)
 * = allowed, so the UI never locks out — the server still enforces 403s.
 */
function hasPerm(code) {
  if (!code) return true;
  var perms = adminPermissions();
  if (perms === null) return true;
  return perms.indexOf('*') >= 0 || perms.indexOf(code) >= 0;
}

/** Hide sidebar entries the admin cannot use; drop now-empty groups. */
function applyNavPermissions() {
  var activeTab = null;
  document.querySelectorAll('.side-item[data-tab]').forEach(function(b) {
    var tab = b.getAttribute('data-tab');
    var visible = hasPerm(TAB_PERMS[tab]);
    if (b.classList.contains('on')) activeTab = tab;
    b.style.display = visible ? '' : 'none';
  });

  document.querySelectorAll('.side-nav .side-group').forEach(function(g) {
    var anyVisible = Array.prototype.some.call(
      g.querySelectorAll('.side-item'),
      function(i) { return i.style.display !== 'none'; }
    );
    g.style.display = anyVisible ? '' : 'none';
  });

  if (activeTab && !hasPerm(TAB_PERMS[activeTab])) {
    var first = null;
    document.querySelectorAll('.side-item[data-tab]').forEach(function(b) {
      if (!first && b.style.display !== 'none') first = b.getAttribute('data-tab');
    });
    switchTab(first || 'profile');
  }
}

function isNavDrawer() {
  var sb = document.getElementById('sidebar');
  return !!(sb && sb.classList.contains('open'));
}

function toggleMobileMenu() {
  var sb = document.getElementById('sidebar');
  var btn = document.getElementById('hamburgerBtn');
  var scrim = document.getElementById('navScrim');
  var open = !isNavDrawer();
  if (sb) sb.classList.toggle('open', open);
  if (btn) btn.classList.toggle('open', open);
  if (scrim) scrim.classList.toggle('on', open);
}

function closeMobileMenu() {
  var sb = document.getElementById('sidebar');
  var btn = document.getElementById('hamburgerBtn');
  var scrim = document.getElementById('navScrim');
  if (sb) sb.classList.remove('open');
  if (btn) btn.classList.remove('open');
  if (scrim) scrim.classList.remove('on');
}

document.addEventListener('click', function(e) {
  var sb = document.getElementById('sidebar');
  var btn = document.getElementById('hamburgerBtn');
  if (!sb || !btn) return;
  if (isNavDrawer() && !sb.contains(e.target) && !btn.contains(e.target)) {
    closeMobileMenu();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeMobileMenu();
});

// If the viewport grows back to desktop the drawer is always visible,
// so make sure no leftover open/scrim state is kept around.
window.addEventListener('resize', function() {
  if (window.innerWidth > 1024 && isNavDrawer()) closeMobileMenu();
});

function switchTab(t) {
  closeMobileMenu();

  // Never land on a tab the current role cannot use (deep links, stale UI).
  if (TAB_PERMS[t] && !hasPerm(TAB_PERMS[t])) {
    t = hasPerm('overview.view') ? 'overview' : 'profile';
  }

  document.querySelectorAll('.side-item').forEach(function(b) {
    var match = b.getAttribute('data-tab') === t;
    b.classList.toggle('on', match);
    if (match) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  PANEL_IDS.forEach(function(p) {
    var el = document.getElementById('panel-' + p);
    if (el) el.classList.toggle('on', p === t);
  });
  document.getElementById('panel-driver-details').classList.remove('on');

  var meta = TAB_META[t];
  if (meta) {
    var g = document.getElementById('hdrCrumbGroup');
    var pg = document.getElementById('hdrCrumbPage');
    if (g) g.textContent = meta.group;
    if (pg) pg.textContent = meta.label;
  }

  if (t === 'orders') {
    if (typeof loadOrders === 'function') loadOrders(true);
    if (typeof ordersPanelOpened === 'function') ordersPanelOpened();
  }
  if (t === 'overview' && typeof loadOverviewStats === 'function') loadOverviewStats();
  if (t === 'users' && typeof loadUsers === 'function') loadUsers();
  if (t === 'rides' && typeof loadRides === 'function') loadRides();
  if (t === 'wallets' && typeof loadWalletPanel === 'function') loadWalletPanel();
  if (t === 'revenue' && typeof loadRevenuePanel === 'function') loadRevenuePanel();
  if (t === 'reviews' && typeof loadReviews === 'function') loadReviews();
  if (t === 'support' && typeof loadSupportInbox === 'function') loadSupportInbox();
  if (t !== 'support' && typeof stopSupportPolling === 'function') stopSupportPolling();
  if (t === 'notifications' && typeof loadNotificationsPanel === 'function') loadNotificationsPanel();
  if (t !== 'notifications' && typeof stopNotificationsPolling === 'function') stopNotificationsPolling();
  if (t === 'events' && typeof loadEventsPanel === 'function') loadEventsPanel();
  if (t === 'tours' && typeof loadToursPanel === 'function') loadToursPanel();
  if (t === 'banners' && typeof loadBannersPanel === 'function') loadBannersPanel();
  if (t === 'taxonomy' && typeof loadTaxonomyPanel === 'function') loadTaxonomyPanel();
  if (t === 'audit' && typeof loadAuditPanel === 'function') loadAuditPanel();
  if (t === 'staff' && typeof loadStaffPanel === 'function') loadStaffPanel();
  if (t === 'profile' && typeof loadProfilePanel === 'function') loadProfilePanel();
}

// Signed-in admin shown at the bottom of the sidebar (real session data).
function renderAdminIdentity() {
  var name = 'Administrator';
  var role = 'Admin';
  try {
    var u = JSON.parse(localStorage.getItem('admin_user') || 'null') || {};
    if (u.fullName || u.name) name = u.fullName || u.name;
    else if (u.email) name = u.email;
    if (u.role) role = u.role;
  } catch (e) {}

  var initials = name.trim().split(/\s+/).slice(0, 2).map(function(w) {
    return w.charAt(0);
  }).join('').toUpperCase() || 'A';

  var av = document.getElementById('sideAdminAvatar');
  var nm = document.getElementById('sideAdminName');
  var rl = document.getElementById('sideAdminRole');
  if (av) av.textContent = initials;
  if (nm) nm.textContent = name;
  if (rl) rl.textContent = role;
}

function doSearch(v) {
  search = v.toLowerCase();
  // A new term starts the client-paged lists (orders, CMS) back at page 1.
  if (typeof kitSetPage === 'function') {
    ['orders', 'dest', 'food', 'hotel', 'drivers'].forEach(function(k) { kitSetPage(k, 1); });
  }
  renderCached();
}

// toast(message, ok?, opts?) - opts.undo runs a real inverse action and
// opts.duration overrides the 3s timeout. Undo toasts stay 8s and are the
// only place an action is reversed, so nothing can claim an undo it cannot do.
function toast(msg, ok, opts) {
  opts = opts || {};
  var d = document.createElement('div');
  d.className = 'toast ' + (opts.undo ? 'undo' : (ok !== false ? 'ok' : 'err'));

  var span = document.createElement('span');
  span.className = 'toast-msg';
  span.textContent = msg;
  d.appendChild(span);

  if (opts.undo) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-undo';
    btn.textContent = 'Undo';
    btn.onclick = function() {
      btn.disabled = true;
      btn.textContent = 'Undoing…';
      Promise.resolve(opts.undo()).then(function(res) {
        d.remove();
        toast(res === false ? 'Nothing to undo' : 'Undone', res !== false);
      }).catch(function(e) {
        btn.disabled = false;
        btn.textContent = 'Undo';
        toast('Undo failed: ' + (e && e.message ? e.message : e), false);
      });
    };
    d.appendChild(btn);
  }

  if (opts.undo || opts.dismissible) {
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'toast-close';
    x.setAttribute('aria-label', 'Dismiss');
    x.innerHTML = '&times;';
    x.onclick = function() { d.remove(); };
    d.appendChild(x);
  }

  document.getElementById('toast-box').appendChild(d);
  var ms = opts.duration || (opts.undo ? 8000 : 3000);
  setTimeout(function() { if (d.parentNode) d.remove(); }, ms);
  return d;
}

function load(on) {
  var el = document.getElementById('loading');
  if (on) { el.className = 'on'; }
  else { el.className = 'done'; setTimeout(function(){ el.className = ''; }, 400); }
}

function showDel(txt, cb) {
  document.getElementById('delTxt').textContent = txt;
  document.getElementById('delModal').classList.add('on');
  delCb = cb;
}
function closeDel() { document.getElementById('delModal').classList.remove('on'); delCb = null; }
function confirmDel() { var cb = delCb; closeDel(); if (cb) cb(); }

function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function fmtDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('en-NG', {day:'numeric',month:'short',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-NG', {hour:'2-digit',minute:'2-digit'});
}

function fmtNaira(n) { return '\u20A6' + Number(n||0).toLocaleString(); }

function orderStatusClass(s) {
  if (!s) return 'tag-pending';
  var l = s.toLowerCase();
  if (l.indexOf('trip completed') >= 0 || l === 'completed') return 'tag-confirmed';
  if (l.indexOf('passenger picked up') >= 0) return 'tag-out';
  if (l.indexOf('arrived at pickup') >= 0 || l.indexOf('driver arriving') >= 0) return 'tag-preparing';
  if (l.indexOf('pending') >= 0) return 'tag-pending';
  if (l.indexOf('confirmed') >= 0) return 'tag-confirmed';
  if (l.indexOf('prepar') >= 0) return 'tag-preparing';
  if (l.indexOf('out') >= 0 || l.indexOf('delivering') >= 0) return 'tag-out';
  if (l.indexOf('delivered') >= 0) return 'tag-delivered';
  if (l.indexOf('cancel') >= 0) return 'tag-cancelled';
  return 'tag-pending';
}

function addTag(e, prefix) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  var val = e.target.value.trim();
  if (!val) return;
  var hidden = document.getElementById(prefix);
  var arr = hidden.value ? hidden.value.split(',').filter(Boolean) : [];
  if (arr.indexOf(val) >= 0) { toast('Already added', false); return; }
  arr.push(val);
  hidden.value = arr.join(',');
  renderTagChips(prefix);
  e.target.value = '';
}

function renderTagChips(prefix) {
  var wrapId = prefix + '-wrap';
  var wrap = document.getElementById(wrapId);
  if (!wrap) return;
  var hidden = document.getElementById(prefix);
  var arr = hidden.value ? hidden.value.split(',').filter(Boolean) : [];
  var input = wrap.querySelector('input');
  wrap.innerHTML = '';
  arr.forEach(function(tag) {
    var span = document.createElement('span');
    span.className = 'tag-item';
    span.innerHTML = esc(tag) + ' <span class="tag-x" onclick="removeTag(\'' + prefix + '\',\'' + esc(tag) + '\')">&times;</span>';
    wrap.appendChild(span);
  });
  wrap.appendChild(input);
  input.value = '';
  input.focus();
}

function removeTag(prefix, tag) {
  var hidden = document.getElementById(prefix);
  var arr = hidden.value ? hidden.value.split(',').filter(Boolean) : [];
  arr = arr.filter(function(t) { return t !== tag; });
  hidden.value = arr.join(',');
  renderTagChips(prefix);
}

function addGalInput(listId) {
  var list = document.getElementById(listId);
  var count = list.querySelectorAll('.img-add-row').length + 1;
  var row = document.createElement('div');
  row.className = 'img-add-row';
  row.innerHTML = '<input placeholder="Image URL ' + count + '" class="gal-input"><button type="button" class="btn-icon" onclick="this.parentElement.remove()">&times;</button>';
  list.appendChild(row);
}

function getGalInputs(listId) {
  var list = document.getElementById(listId);
  var inputs = list.querySelectorAll('.gal-input');
  var urls = [];
  inputs.forEach(function(inp) {
    var v = inp.value.trim();
    if (v) urls.push(v);
  });
  return urls;
}

function setGalInputs(listId, urls) {
  var list = document.getElementById(listId);
  list.innerHTML = '';
  if (!urls || !urls.length) {
    addGalInput(listId);
    return;
  }
  urls.forEach(function(url) {
    var row = document.createElement('div');
    row.className = 'img-add-row';
    row.innerHTML = '<input placeholder="Image URL" class="gal-input" value="' + esc(url) + '"><button type="button" class="btn-icon" onclick="this.parentElement.remove()">&times;</button>';
    list.appendChild(row);
  });
}
