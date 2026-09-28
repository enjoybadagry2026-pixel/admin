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
  reviews:  { label: 'Reviews & Ratings', group: 'Content' },
  wallets:  { label: 'Wallets & Payouts', group: 'Finance' }
};

var PANEL_IDS = ['overview', 'users', 'dest', 'hotel', 'food', 'reviews', 'orders', 'rides', 'drivers', 'wallets'];

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

  if (t === 'overview' && typeof loadOverviewStats === 'function') loadOverviewStats();
  if (t === 'users' && typeof loadUsers === 'function') loadUsers();
  if (t === 'rides' && typeof loadRides === 'function') loadRides();
  if (t === 'wallets' && typeof loadWalletPanel === 'function') loadWalletPanel();
  if (t === 'reviews' && typeof loadReviews === 'function') loadReviews();
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

function doSearch(v) { search = v.toLowerCase(); renderCached(); }

function toast(msg, ok) {
  var d = document.createElement('div');
  d.className = 'toast ' + (ok !== false ? 'ok' : 'err');
  d.textContent = msg;
  document.getElementById('toast-box').appendChild(d);
  setTimeout(function(){ d.remove(); }, 3000);
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
