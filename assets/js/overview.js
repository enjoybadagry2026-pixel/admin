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
    loadOvRevenue();
    loadOvLicenseAlert();
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
    var statusCls = 'ov-badge-pending';
    if (u.status === 'active') statusCls = 'ov-badge-active';
    else if (u.status === 'suspended') statusCls = 'ov-badge-suspended';
    else if (u.status === 'disabled') statusCls = 'ov-badge-offline';
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

// ═══════════════ EMPTY-STATE INSIGHTS ═══════════════
// Real aggregates from GET /api/admin/insights, rendered wherever a list is
// empty so a dead-end "nothing here" screen still tells the admin what the
// platform is doing.

var ovInsightsPromise = null;

function ovInsightCard(icon, label, name, meta) {
  return '<div class="insight-card">' +
    '<div class="ic-ico">' + icon + '</div>' +
    '<div class="ic-body">' +
      '<div class="ic-label">' + esc(label) + '</div>' +
      (name ? '<div class="ic-name" title="' + esc(name) + '">' + esc(name) + '</div>' +
        '<div class="ic-meta">' + esc(meta) + '</div>'
        : '<div class="ic-none">No activity yet</div>') +
    '</div>' +
  '</div>';
}

function ovInsightsHtml(d) {
  var cards = '';
  cards += ovInsightCard('📍', 'Most viewed destination',
    d.topDestination && d.topDestination.name,
    d.topDestination ? fmtNum(d.topDestination.views) + ' views · ' + fmtNum(d.topDestination.reviews) + ' reviews' : '');
  cards += ovInsightCard('🍽️', 'Most ordered food (30d)',
    d.topFood && d.topFood.name,
    d.topFood ? fmtNum(d.topFood.orders) + ' orders' : '');
  cards += ovInsightCard('🏨', 'Most booked hotel (30d)',
    d.topHotel && d.topHotel.name,
    d.topHotel ? fmtNum(d.topHotel.bookings) + ' bookings' : '');
  cards += ovInsightCard('🚗', 'Most active driver (30d)',
    d.topDriver && d.topDriver.name,
    d.topDriver ? fmtNum(d.topDriver.trips) + ' trips' : '');

  var trend = d.orderTrend || [];
  var trendHtml = '';
  if (trend.length) {
    var max = trend.reduce(function(m, t) { return Math.max(m, Number(t.orders) || 0); }, 0) || 1;
    var bars = trend.map(function(t) {
      var n = Number(t.orders) || 0;
      var pct = Math.round((n / max) * 100);
      return '<div class="trend-bar' + (n ? ' has' : '') + '" style="height:' + Math.max(3, pct) + '%" title="' +
        esc(t.day + ': ' + n + ' order' + (n === 1 ? '' : 's')) + '">' +
        '<span class="t-val">' + n + '</span></div>';
    }).join('');
    var axis = trend.map(function(t) {
      var parts = String(t.day || '').split('-');
      return '<span>' + esc(parts.length === 3 ? parts[2] + '/' + parts[1] : t.day) + '</span>';
    }).join('');
    trendHtml = '<div class="insight-trend">' +
      '<div class="ic-label">Order trend · last ' + trend.length + ' days</div>' +
      '<div class="trend-bars">' + bars + '</div>' +
      '<div class="trend-axis">' + axis + '</div>' +
    '</div>';
  } else {
    trendHtml = '<div class="insight-trend"><div class="trend-empty">No orders placed in the last 14 days.</div></div>';
  }

  return '<div class="insight">' +
    '<div class="insight-kicker">Platform insights · what is happening while this list is empty</div>' +
    '<div class="insight-grid">' + cards + '</div>' +
    trendHtml +
  '</div>';
}

// Loads /insights once and paints it into the given container. Safe to call
// on every empty render - the fetch happens at most once per session.
function loadInsightsInto(containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (ovInsightsPromise) {
    ovInsightsPromise.then(function(d) { if (d) el.innerHTML = ovInsightsHtml(d); }).catch(function() {});
    return;
  }
  ovInsightsPromise = api('GET', '/insights').then(function(res) {
    var d = res.data || null;
    var target = document.getElementById(containerId);
    if (target && d) target.innerHTML = ovInsightsHtml(d);
    return d;
  }).catch(function(e) {
    ovInsightsPromise = null;
    console.warn('[Insights] unavailable:', e.message);
    return null;
  });
}

function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Driver licence expiry alert strip on the Overview panel.
async function loadOvLicenseAlert() {
  var el = document.getElementById('ov-license-alert');
  if (!el) return;
  try {
    var res = await api('GET', '/drivers/license-alerts');
    var sum = res.data.summary || {};
    if (!sum.total) { el.style.display = 'none'; return; }
    el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
      '<span><strong>' + (sum.expired || 0) + '</strong> licences expired · <strong>' + (sum.expiring || 0) + '</strong> expiring within ' + (sum.windowDays || 30) + ' days</span>' +
      '<button class="btn btn-ghost btn-sm" onclick="openDriLicenseAlerts()">Review</button>';
    el.style.display = '';
  } catch (e) { /* non-critical */ }
}

// Revenue strip on the Overview panel (uses the reports API).
async function loadOvRevenue() {
  var sel = document.getElementById('ov-rev-range');
  var preset = sel ? sel.value : '30d';
  var note = document.getElementById('ov-rev-note');
  try {
    var res = await api('GET', '/reports/summary?preset=' + encodeURIComponent(preset));
    var d = res.data;
    setText('ov-c-rev', fmtNaira(d.revenue.total));
    setText('ov-c-gmv', fmtNaira(d.gmv.total));
    setText('ov-c-dep', fmtNaira(d.cash.deposits));
    setText('ov-c-refunds', d.cash.refunds && d.cash.refunds.count
      ? fmtNaira(d.cash.refunds.amount) + ' (' + fmtNum(d.cash.refunds.count) + ')'
      : fmtNaira(0));
    if (note) {
      note.textContent = d.range.from + ' → ' + d.range.to + ' · revenue = commission + platform fees on non-refunded orders';
      note.style.display = '';
    }
  } catch (e) {
    setText('ov-c-rev', '—');
    setText('ov-c-gmv', '—');
    setText('ov-c-dep', '—');
    setText('ov-c-refunds', '—');
    if (note) {
      note.textContent = 'Revenue unavailable: ' + e.message;
      note.style.display = '';
    }
  }
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
  if (hasPerm('overview.view') && document.getElementById('panel-overview') && document.getElementById('panel-overview').classList.contains('on')) {
    loadOverviewStats();
  }
});
