// ═══════════════ OVERVIEW / PLATFORM STATISTICS ═══════════════

var ovLoaded = false;
var ovLoading = false;

async function loadOverviewStats() {
  if (ovLoading) return;
  ovLoading = true;

  var skeleton = document.getElementById('ov-skeleton');
  var errorEl = document.getElementById('ov-error');
  var content = document.getElementById('ov-content');
  var countEl = document.getElementById('ov-count');

  skeleton.style.display = '';
  errorEl.style.display = 'none';
  content.style.display = 'none';
  countEl.textContent = 'Loading statistics...';

  try {
    var res = await api('GET', '/stats');
    var d = res.data;
    renderOverviewStats(d);
    skeleton.style.display = 'none';
    content.style.display = '';
    errorEl.style.display = 'none';
    countEl.textContent = 'Updated ' + new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
    ovLoaded = true;
  } catch (err) {
    console.error('[Overview] Failed to load stats:', err.message);
    skeleton.style.display = 'none';
    errorEl.style.display = '';
    content.style.display = 'none';
    countEl.textContent = 'Failed to load';
  } finally {
    ovLoading = false;
  }
}

function renderOverviewStats(d) {
  // Users
  setText('ov-u-total', fmtNum(d.users.total));
  setText('ov-u-active', fmtNum(d.users.active));
  setText('ov-u-onboarded', fmtNum(d.users.onboarded));
  setText('ov-u-today', fmtNum(d.users.today));

  // Drivers
  setText('ov-dr-total', fmtNum(d.drivers.total));
  setText('ov-dr-online', fmtNum(d.drivers.online));
  setText('ov-dr-onride', fmtNum(d.drivers.onRide));
  setText('ov-dr-suspended', fmtNum(d.drivers.suspended));

  // Rides
  setText('ov-r-total', fmtNum(d.rides.total));
  setText('ov-r-completed', fmtNum(d.rides.completed));
  setText('ov-r-pending', fmtNum(d.rides.pending));
  setText('ov-r-cancelled', fmtNum(d.rides.cancelled));

  // Financials
  setText('ov-f-fare', fmtNaira(d.rides.totalFare));
  setText('ov-f-wallet', fmtNaira(d.wallets.totalBalance));
  setText('ov-f-earnings', fmtNaira(d.revenue.totalDriverEarnings));
  setText('ov-f-rating', d.revenue.avgDriverRating ? Number(d.revenue.avgDriverRating).toFixed(1) + '/5' : '—');

  // Food Orders
  setText('ov-fo-total', fmtNum(d.foodOrders.total));
  setText('ov-fo-completed', fmtNum(d.foodOrders.completed));
  setText('ov-fo-pending', fmtNum(d.foodOrders.pending));
  setText('ov-fo-cancelled', fmtNum(d.foodOrders.cancelled));

  // Content
  setText('ov-c-dest', fmtNum(d.content.destinations));
  setText('ov-c-hotels', fmtNum(d.content.hotels));
  setText('ov-c-foods', fmtNum(d.content.foods));

  // Recent Users
  renderRecentUsers(d.recentUsers || []);

  // Recent Drivers
  renderRecentDrivers(d.recentDrivers || []);
}

function renderRecentUsers(users) {
  var el = document.getElementById('ov-recent-users');
  var countEl = document.getElementById('ov-ru-count');
  if (countEl) countEl.textContent = users.length ? users.length + ' new' : '';
  if (!users.length) {
    el.innerHTML = '<div class="ov-recent-empty">' +
      '<div class="ov-recent-empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>' +
      '<div class="ov-recent-empty-text">No users yet</div>' +
    '</div>';
    return;
  }
  el.innerHTML = users.map(function(u) {
    var initials = getInitials(u.name);
    var statusCls = u.status === 'active' ? 'ov-badge-active' : 'ov-badge-pending';
    var statusText = u.status || 'unknown';
    var phone = u.phone || '';
    var time = fmtDate(u.createdAt);
    return '<div class="ov-recent-item">' +
      '<div class="ov-recent-avatar">' + esc(initials) + '</div>' +
      '<div class="ov-recent-info">' +
        '<div class="ov-recent-name">' + esc(u.name || phone || 'Unknown') + '</div>' +
        '<div class="ov-recent-detail">' +
          '<span class="ov-recent-badge ' + statusCls + '">' + esc(statusText) + '</span>' +
          (phone ? '<span>' + esc(phone) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ov-recent-time">' + esc(time) + '</div>' +
    '</div>';
  }).join('');
}

function renderRecentDrivers(drivers) {
  var el = document.getElementById('ov-recent-drivers');
  var countEl = document.getElementById('ov-rd-count');
  if (countEl) countEl.textContent = drivers.length ? drivers.length + ' new' : '';
  if (!drivers.length) {
    el.innerHTML = '<div class="ov-recent-empty">' +
      '<div class="ov-recent-empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>' +
      '<div class="ov-recent-empty-text">No drivers yet</div>' +
    '</div>';
    return;
  }
  el.innerHTML = drivers.map(function(dr) {
    var initials = getInitials(dr.name);
    var onlineCls = dr.onlineStatus === 'online' ? 'ov-badge-online' : 'ov-badge-offline';
    var onlineText = dr.onlineStatus || 'offline';
    var regCls = dr.isRegistered ? 'ov-badge-registered' : 'ov-badge-unregistered';
    var regText = dr.isRegistered ? 'Registered' : 'Unregistered';
    var phone = dr.phone || '';
    var time = fmtDate(dr.createdAt);
    return '<div class="ov-recent-item">' +
      '<div class="ov-recent-avatar">' + esc(initials) + '</div>' +
      '<div class="ov-recent-info">' +
        '<div class="ov-recent-name">' + esc(dr.name || phone || 'Unknown') + '</div>' +
        '<div class="ov-recent-detail">' +
          '<span class="ov-recent-badge ' + onlineCls + '">' + esc(onlineText) + '</span>' +
          '<span class="ov-recent-badge ' + regCls + '">' + esc(regText) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="ov-recent-time">' + esc(time) + '</div>' +
    '</div>';
  }).join('');
}

function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtNum(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString();
}

function getInitials(name) {
  if (!name) return '?';
  var parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0);
  return parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
}

// Auto-load on first tab show
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('panel-overview') && document.getElementById('panel-overview').classList.contains('on')) {
    loadOverviewStats();
  }
});
