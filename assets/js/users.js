// ═══════════════ USER MANAGEMENT ═══════════════

var umState = { page: 1, limit: 20, q: '', status: '', loaded: false, loading: false };
var umListData = [];
var umPagination = null;
var umStats = null;
var umSearchTimer = null;

var umActiveUserId = null;
var umActiveUser = null;
var umActiveTab = 'profile';
var umTabData = { wallet: null, activity: null, orders: null };
var umTabPager = { wallet: 1, activity: 1, orders: 1 };

var uaState = { mode: null, userId: null, userName: '', resetMode: 'temp', resultShown: false };

function umSetText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function umInitials(name) {
  if (typeof getInitials === 'function') return getInitials(name);
  var parts = String(name || '').trim().split(/\s+/);
  if (!parts[0]) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function umUserStatusBadge(status) {
  var s = (status || 'active').toLowerCase();
  var cls = 'user-badge-active';
  if (s === 'suspended') cls = 'user-badge-suspended';
  else if (s === 'disabled') cls = 'user-badge-disabled';
  return '<span class="user-badge ' + cls + '">' + esc(status || 'active') + '</span>';
}

function umTxStatusTag(status) {
  var s = (status || '').toLowerCase();
  var cls = 'tag-pending';
  if (s === 'completed' || s === 'success' || s === 'credited') cls = 'tag-confirmed';
  else if (s === 'failed' || s === 'expired' || s === 'cancelled' || s === 'failed') cls = 'tag-cancelled';
  return '<span class="tag ' + cls + '">' + esc(status || '—') + '</span>';
}

function umOrderStatusTag(status) {
  if (typeof orderStatusBadge === 'function') return orderStatusBadge(status);
  return '<span class="tag tag-pending">' + esc(status || '—') + '</span>';
}

function umActivityLabel(kind) {
  if (kind === 'food_order') return 'Food Order';
  if (kind === 'ride') return 'Ride Booking';
  if (kind === 'transaction') return 'Wallet Transaction';
  if (kind === 'review') return 'Review';
  return kind;
}

function umActivityIcon(kind) {
  if (kind === 'food_order') return '🍽️';
  if (kind === 'ride') return '🚗';
  if (kind === 'transaction') return '💳';
  if (kind === 'review') return '⭐';
  return '📌';
}

// ─── List ──────────────────────────────────────

function umUsersPath() {
  var p = '/users?page=' + umState.page + '&limit=' + umState.limit;
  if (umState.q) p += '&q=' + encodeURIComponent(umState.q);
  if (umState.status) p += '&status=' + encodeURIComponent(umState.status);
  return p;
}

function umShowListState(state, message) {
  var loading = document.getElementById('um-loading');
  var error = document.getElementById('um-error');
  var list = document.getElementById('um-list');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') umSetText('um-error-text', message || 'Something went wrong');
  }
  if (list) list.style.display = state === 'loading' || state === 'error' ? 'none' : '';
}

function loadUsers(force) {
  if (umState.loading) return;
  if (!force && umState.loaded) return;
  umState.loading = true;
  umShowListState('loading');
  umSetText('um-hint', '');

  api('GET', umUsersPath()).then(function(res) {
    umListData = (res.data && res.data.users) || [];
    umStats = (res.data && res.data.stats) || null;
    umPagination = res.pagination || null;
    umState.loaded = true;
    umShowListState('ready');
    umRenderStats();
    renderUsers();
  }).catch(function(e) {
    umShowListState('error', e.message);
    toast('Error: ' + e.message, false);
  }).finally(function() {
    umState.loading = false;
  });
}

function umRenderStats() {
  if (!umStats) return;
  umSetText('um-s-total', Number(umStats.total || 0).toLocaleString());
  umSetText('um-s-active', Number(umStats.active || 0).toLocaleString());
  umSetText('um-s-suspended', Number(umStats.suspended || 0).toLocaleString());
  umSetText('um-s-new', Number(umStats.newThisWeek || 0).toLocaleString());
}

function renderUsers() {
  var el = document.getElementById('um-list');
  if (!el) return;
  var html = '';

  (umListData || []).forEach(function(u) {
    var id = u.id || '';
    var bits = [];
    if (u.registeredAt) bits.push('Joined ' + fmtDate(u.registeredAt));
    if (typeof u.walletBalance === 'number') bits.push(fmtNaira(u.walletBalance) + ' wallet');
    if (u.counts && typeof u.counts.foodOrders === 'number') bits.push(u.counts.foodOrders + ' order' + (u.counts.foodOrders === 1 ? '' : 's'));

    html += '<div class="user-card" onclick="openUserModal(\'' + esc(id) + '\')">' +
      '<div class="user-card-top">' +
        '<div class="user-card-avatar">' + esc(umInitials(u.fullName || u.email || u.phone)) + '</div>' +
        '<div class="user-card-top-info">' +
          '<div class="user-card-name">' + esc(u.fullName || 'Unnamed user') + '</div>' +
          '<div class="user-card-contact">' + esc(u.email || u.phone || '—') + '</div>' +
        '</div>' +
        umUserStatusBadge(u.status) +
      '</div>' +
      '<div class="user-card-meta">' +
        bits.map(function(b) { return '<span>' + esc(b) + '</span>'; }).join('') +
      '</div>' +
      '<div class="user-card-acts">' +
        '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openUserModal(\'' + esc(id) + '\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
          'View Details' +
        '</button>' +
      '</div>' +
    '</div>';
  });

  if (!html) {
    var hasFilters = umState.q || umState.status;
    html = '<div class="user-empty">' +
      '<div class="user-empty-icon">' + (hasFilters ? '🔍' : '👥') + '</div>' +
      '<div class="user-empty-title">' + (hasFilters ? 'No users match your search' : 'No users yet') + '</div>' +
      '<div class="user-empty-text">' + (hasFilters ? 'Try a different search term or clear the status filter.' : 'Registered app users will appear here.') + '</div>' +
    '</div>';
  }
  el.innerHTML = html;

  var total = umPagination ? umPagination.total : (umListData || []).length;
  umSetText('um-count', total + ' user' + (total === 1 ? '' : 's'));
  umRenderPagination();
}

function umRenderPagination() {
  var el = document.getElementById('um-pagination');
  if (!el) return;
  var pg = umPagination;
  if (!pg || !pg.totalPages || pg.totalPages <= 1) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  el.innerHTML =
    '<button class="btn btn-ghost btn-sm" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="umGoPage(' + (pg.page - 1) + ')">Prev</button>' +
    '<span class="um-page-info">Page ' + pg.page + ' of ' + pg.totalPages + '</span>' +
    '<button class="btn btn-ghost btn-sm" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="umGoPage(' + (pg.page + 1) + ')">Next</button>';
}

function umGoPage(page) {
  umState.page = page;
  loadUsers(true);
}

function onUserSearch(v) {
  if (umSearchTimer) clearTimeout(umSearchTimer);
  umSearchTimer = setTimeout(function() {
    umState.q = String(v || '').trim();
    umState.page = 1;
    loadUsers(true);
  }, 300);
}

function filterUsers() {
  var sel = document.getElementById('um-status-filter');
  umState.status = sel ? sel.value : '';
  umState.page = 1;
  loadUsers(true);
}

// ─── User Details modal ────────────────────────

function openUserModal(id) {
  umActiveUserId = id;
  if (!umActiveTab) umActiveTab = 'profile';
  var modal = document.getElementById('userModal');
  var body = document.getElementById('userModalBody');
  if (!modal || !body) return;
  umSetText('userModalTitle', 'User Details');
  umSetText('userModalRef', '');
  body.innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading user details...</div></div>';
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';

  api('GET', '/users/' + encodeURIComponent(id)).then(function(res) {
    if (umActiveUserId !== id) return;
    umActiveUser = res.data && res.data.user;
    umTabData = { wallet: null, activity: null, orders: null };
    umTabPager = { wallet: 1, activity: 1, orders: 1 };
    renderUserModal();
  }).catch(function(e) {
    if (umActiveUserId !== id) return;
    body.innerHTML = '<div class="drv-error">' +
      '<div class="drv-error-icon">⚠️</div>' +
      '<div class="drv-error-title">Failed to load user details</div>' +
      '<div class="drv-error-text">' + esc(e.message) + '</div>' +
      '<button class="btn btn-accent btn-sm" onclick="openUserModal(\'' + esc(id) + '\')">Retry</button>' +
    '</div>';
    toast('Error: ' + e.message, false);
  });
}

function closeUserModal() {
  var modal = document.getElementById('userModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  umActiveUserId = null;
  umActiveUser = null;
}

function umActionButtons(u) {
  var id = esc(u.id || '');
  var suspended = (u.status || '').toLowerCase() === 'suspended' || (u.status || '').toLowerCase() === 'disabled';
  var html = '<div class="user-acts">';
  if (suspended) {
    html += '<button class="btn btn-green" onclick="unsuspendUser(\'' + id + '\')">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>Unsuspend</button>';
  } else {
    html += '<button class="btn btn-red" onclick="suspendUser(\'' + id + '\')">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Suspend</button>';
  }
  html += '<button class="btn btn-accent" onclick="resetUserPassword(\'' + id + '\')">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Reset Password</button>';
  html += '<button class="btn btn-ghost" onclick="umSwitchToTab(\'wallet\')">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>Wallet</button>';
  html += '<button class="btn btn-ghost" onclick="umSwitchToTab(\'activity\')">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Activity</button>';
  html += '</div>';
  return html;
}

function renderUserModal() {
  var u = umActiveUser;
  if (!u) return;
  umSetText('userModalTitle', u.fullName || 'User Details');
  umSetText('userModalRef', u.email || u.phone || u.id || '');

  var suspendedNotice = '';
  if ((u.status || '').toLowerCase() === 'suspended' && u.suspendReason) {
    suspendedNotice = '<div class="user-suspend-notice">' +
      '<div class="user-suspend-notice-title">Suspended' + (u.suspendedBy ? ' by ' + esc(u.suspendedBy) : '') + (u.suspendedAt ? ' · ' + esc(fmtDate(u.suspendedAt)) : '') + '</div>' +
      '<div class="user-suspend-notice-text">' + esc(u.suspendReason) + '</div>' +
    '</div>';
  }

  var head =
    '<div class="user-head">' +
      '<div class="user-head-avatar">' + esc(umInitials(u.fullName || u.email || u.phone)) + '</div>' +
      '<div class="user-head-info">' +
        '<div class="user-head-name">' + esc(u.fullName || 'Unnamed user') + '</div>' +
        '<div class="user-head-contact">' + esc(u.email || 'No email') + (u.phone ? ' · ' + esc(u.phone) : '') + '</div>' +
        '<div class="user-head-badges">' +
          umUserStatusBadge(u.status) +
          '<span class="user-badge user-badge-muted">' + esc(u.role || 'user') + '</span>' +
          (u.authProvider ? '<span class="user-badge user-badge-muted">' + esc(u.authProvider) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    suspendedNotice +
    umActionButtons(u);

  var tabs =
    '<div class="drv-tabs user-tabs">' +
      '<button class="drv-tab ' + (umActiveTab === 'profile' ? 'on' : '') + '" onclick="switchUserTab(\'profile\', this)">Profile</button>' +
      '<button class="drv-tab ' + (umActiveTab === 'wallet' ? 'on' : '') + '" onclick="switchUserTab(\'wallet\', this)">Wallet</button>' +
      '<button class="drv-tab ' + (umActiveTab === 'activity' ? 'on' : '') + '" onclick="switchUserTab(\'activity\', this)">Activity</button>' +
      '<button class="drv-tab ' + (umActiveTab === 'orders' ? 'on' : '') + '" onclick="switchUserTab(\'orders\', this)">Orders &amp; Bookings</button>' +
    '</div>' +
    '<div id="um-tab-panel" class="um-tab-panel"></div>';

  document.getElementById('userModalBody').innerHTML = head + tabs;
  renderUserTab();
}

function umSwitchToTab(tab) {
  umActiveTab = tab;
  renderUserModal();
  var body = document.getElementById('userModalBody');
  if (body) body.scrollTop = 0;
}

function switchUserTab(tab, btn) {
  umActiveTab = tab;
  var wrap = btn && btn.parentElement;
  if (wrap) {
    wrap.querySelectorAll('.drv-tab').forEach(function(b) { b.classList.remove('on'); });
    btn.classList.add('on');
  }
  renderUserTab();
}

function umTabShell(inner) {
  return '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading...</div></div>';
}

function umTabError(message, retryFn) {
  return '<div class="drv-error">' +
    '<div class="drv-error-icon">⚠️</div>' +
    '<div class="drv-error-title">Failed to load</div>' +
    '<div class="drv-error-text">' + esc(message) + '</div>' +
    '<button class="btn btn-accent btn-sm" onclick="' + retryFn + '">Retry</button>' +
  '</div>';
}

function umField(label, value, wide) {
  if (value === null || value === undefined || value === '') return '';
  return '<div class="order-detail-field' + (wide ? ' order-detail-field-wide' : '') + '">' +
    '<div class="order-detail-field-label">' + esc(label) + '</div>' +
    '<div class="order-detail-field-value">' + esc(String(value)) + '</div>' +
  '</div>';
}

function renderUserTab() {
  var panel = document.getElementById('um-tab-panel');
  if (!panel) return;
  var u = umActiveUser;
  if (!u) return;

  if (umActiveTab === 'profile') {
    var c = u.counts || {};
    panel.innerHTML =
      '<div class="order-detail-section">' +
        '<div class="order-detail-label">Profile</div>' +
        '<div class="order-detail-grid">' +
          umField('Full Name', u.fullName) +
          umField('Email', u.email) +
          umField('Phone', u.phone) +
          umField('Account Status', u.status) +
          umField('Role', u.role) +
          umField('Sign-in Method', u.authProvider) +
          umField('Country', u.country) +
          umField('Profile Photo', u.profilePhoto ? 'Yes' : 'Not set') +
          umField('Registered', u.registeredAt ? fmtDate(u.registeredAt) : '') +
          umField('Last Login', u.lastLoginAt ? fmtDate(u.lastLoginAt) : '') +
          umField('Last Activity', u.lastActivityAt ? fmtDate(u.lastActivityAt) : '') +
          umField('Onboarding', u.onboardingCompleted ? 'Completed' : 'Not completed') +
          umField('User ID', u.id, true) +
          (u.passwordResetAt ? umField('Last Password Reset', fmtDate(u.passwordResetAt) + (u.passwordResetMode ? ' (' + u.passwordResetMode + ')' : ''), true) : '') +
        '</div>' +
      '</div>' +
      '<div class="order-detail-section">' +
        '<div class="order-detail-label">Account Summary</div>' +
        '<div class="order-detail-grid">' +
          umField('Wallet Balance', typeof u.walletBalance === 'number' ? fmtNaira(u.walletBalance) : '') +
          umField('Food Orders', c.foodOrders != null ? c.foodOrders : '') +
          umField('Ride Bookings', c.rides != null ? c.rides : '') +
          umField('Transactions', c.transactions != null ? c.transactions : '') +
          umField('Reviews', c.reviews != null ? c.reviews : '') +
        '</div>' +
      '</div>';
    return;
  }

  if (umTabData[umActiveTab]) {
    panel.innerHTML = umTabData[umActiveTab];
    return;
  }

  panel.innerHTML = umTabShell();
  if (umActiveTab === 'wallet') loadUserWalletTab();
  else if (umActiveTab === 'activity') loadUserActivityTab();
  else if (umActiveTab === 'orders') loadUserOrdersTab();
}

// ─── Wallet tab ────────────────────────────────

function loadUserWalletTab() {
  var id = umActiveUserId;
  if (!id) return;
  Promise.all([
    api('GET', '/users/' + encodeURIComponent(id) + '/wallet'),
    api('GET', '/users/' + encodeURIComponent(id) + '/transactions?page=1&limit=10')
  ]).then(function(results) {
    if (umActiveUserId !== id || umActiveTab !== 'wallet') return;
    var wallet = results[0].data && results[0].data.wallet;
    var txs = (results[1].data && results[1].data.transactions) || [];
    umTabData.wallet = umWalletTabHtml(wallet, results[1].pagination, txs);
    umTabPager.wallet = 1;
    renderUserTab();
  }).catch(function(e) {
    if (umActiveUserId !== id || umActiveTab !== 'wallet') return;
    umTabData.wallet = null;
    document.getElementById('um-tab-panel').innerHTML =
      umTabError(e.message, 'umTabData.wallet=null;loadUserWalletTab()');
    toast('Error: ' + e.message, false);
  });
}

function umTxRows(txs) {
  if (!txs.length) {
    return '<div class="oi-empty"><div class="oi-empty-icon">💳</div><div class="oi-empty-text">No wallet transactions yet</div></div>';
  }
  return txs.map(function(t) {
    var amt = (t.amount >= 0 ? '+' : '') + fmtNaira(t.amount);
    return '<div class="um-row">' +
      '<div class="um-row-main">' +
        '<div class="um-row-title">' + esc(t.description || t.type || t.transactionId) + '</div>' +
        '<div class="um-row-sub">' + esc(t.type || '') + (t.reference ? ' · ' + esc(t.reference) : '') + '</div>' +
      '</div>' +
      '<div class="um-row-side">' +
        '<div class="um-row-amount ' + (t.amount >= 0 ? 'um-amount-in' : 'um-amount-out') + '">' + esc(amt) + '</div>' +
        '<div class="um-row-meta">' + esc(fmtDate(t.createdAt)) + ' ' + umTxStatusTag(t.status) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function umWalletTabHtml(wallet, pagination, txs) {
  wallet = wallet || {};
  var more = pagination && pagination.totalPages > 1
    ? '<button class="btn btn-ghost btn-sm um-more" onclick="loadMoreUserTransactions()">Load more</button>'
    : '';
  return '<div class="order-detail-section">' +
      '<div class="order-detail-label">Wallet</div>' +
      '<div class="um-wallet-card">' +
        '<div class="um-wallet-balance">' + esc(fmtNaira(wallet.balance || 0)) + '</div>' +
        '<div class="um-wallet-currency">' + esc(wallet.currency || 'NGN') + ' balance</div>' +
        '<div class="um-wallet-stats">' +
          '<span>' + (pagination ? pagination.total : (txs ? txs.length : 0)) + ' transactions</span>' +
          '<span>Credits: ' + esc(fmtNaira(wallet.totalCredits || 0)) + '</span>' +
          '<span>Debits: ' + esc(fmtNaira(Math.abs(wallet.totalDebits || 0))) + '</span>' +
        '</div>' +
        (wallet.updatedAt ? '<div class="um-wallet-updated">Updated ' + esc(fmtDate(wallet.updatedAt)) + '</div>' : '') +
      '</div>' +
    '</div>' +
    '<div class="order-detail-section">' +
      '<div class="order-detail-label">Transaction History</div>' +
      '<div class="um-rows" id="um-tx-rows">' + umTxRows(txs || []) + '</div>' +
      '<div id="um-tx-more">' + more + '</div>' +
    '</div>';
}

function loadMoreUserTransactions() {
  var id = umActiveUserId;
  if (!id) return;
  var next = (umTabPager.wallet || 1) + 1;
  var btn = document.querySelector('#um-tx-more .um-more');
  if (btn) btn.disabled = true;
  api('GET', '/users/' + encodeURIComponent(id) + '/transactions?page=' + next + '&limit=10').then(function(res) {
    if (umActiveUserId !== id) return;
    var txs = (res.data && res.data.transactions) || [];
    var rows = document.getElementById('um-tx-rows');
    if (rows) rows.insertAdjacentHTML('beforeend', umTxRows(txs));
    umTabPager.wallet = next;
    var moreWrap = document.getElementById('um-tx-more');
    if (moreWrap) {
      moreWrap.innerHTML = res.pagination && res.pagination.totalPages > next
        ? '<button class="btn btn-ghost btn-sm um-more" onclick="loadMoreUserTransactions()">Load more</button>'
        : '<div class="um-more-end">' + (res.pagination ? res.pagination.total : 0) + ' transactions total</div>';
    }
  }).catch(function(e) {
    if (btn) btn.disabled = false;
    toast('Error: ' + e.message, false);
  });
}

// ─── Activity tab ──────────────────────────────

function loadUserActivityTab() {
  var id = umActiveUserId;
  if (!id) return;
  api('GET', '/users/' + encodeURIComponent(id) + '/activity?limit=40').then(function(res) {
    if (umActiveUserId !== id || umActiveTab !== 'activity') return;
    var items = (res.data && res.data.activity) || [];
    var meta = (res.data && res.data.meta) || {};
    umTabData.activity = umActivityTabHtml(items, meta);
    renderUserTab();
  }).catch(function(e) {
    if (umActiveUserId !== id || umActiveTab !== 'activity') return;
    document.getElementById('um-tab-panel').innerHTML =
      umTabError(e.message, 'umTabData.activity=null;loadUserActivityTab()');
    toast('Error: ' + e.message, false);
  });
}

function umActivityTabHtml(items, meta) {
  var head = '<div class="order-detail-section">' +
    '<div class="order-detail-label">Account Timeline</div>' +
    '<div class="order-detail-grid">' +
      umField('Registered', meta.registeredAt ? fmtDate(meta.registeredAt) : '') +
      umField('Last Login', meta.lastLoginAt ? fmtDate(meta.lastLoginAt) : '') +
      umField('Last Activity', meta.lastActivityAt ? fmtDate(meta.lastActivityAt) : '') +
    '</div>' +
  '</div>';

  var body = '<div class="order-detail-section">' +
    '<div class="order-detail-label">Recent Activity</div>';
  if (!items.length) {
    body += '<div class="oi-empty"><div class="oi-empty-icon">📡</div><div class="oi-empty-text">No activity recorded yet</div></div>';
  } else {
    body += '<div class="um-rows">' + items.map(function(a) {
      return '<div class="um-row">' +
        '<div class="um-row-icon">' + umActivityIcon(a.kind) + '</div>' +
        '<div class="um-row-main">' +
          '<div class="um-row-title">' + esc(a.title || umActivityLabel(a.kind)) + '</div>' +
          '<div class="um-row-sub">' + esc(umActivityLabel(a.kind)) + (a.reference ? ' · ' + esc(a.reference) : '') + '</div>' +
        '</div>' +
        '<div class="um-row-side">' +
          (a.status ? '<div class="um-row-meta">' + umOrderStatusTag(a.status) + '</div>' : '') +
          '<div class="um-row-meta">' + esc(fmtDate(a.createdAt)) + '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }
  body += '</div>';
  return head + body;
}

// ─── Orders tab ────────────────────────────────

function loadUserOrdersTab() {
  var id = umActiveUserId;
  if (!id) return;
  api('GET', '/users/' + encodeURIComponent(id) + '/orders?type=all&page=1&limit=10').then(function(res) {
    if (umActiveUserId !== id || umActiveTab !== 'orders') return;
    var orders = (res.data && res.data.orders) || [];
    umTabData.orders = umOrdersTabHtml(orders, res.pagination);
    umTabPager.orders = 1;
    renderUserTab();
  }).catch(function(e) {
    if (umActiveUserId !== id || umActiveTab !== 'orders') return;
    document.getElementById('um-tab-panel').innerHTML =
      umTabError(e.message, 'umTabData.orders=null;loadUserOrdersTab()');
    toast('Error: ' + e.message, false);
  });
}

function umOrderRow(o) {
  var isFood = o.kind === 'food';
  var amount = o.grandTotal != null ? o.grandTotal : o.amount;
  var ref = o.orderReference || o.reference || o.id || '—';
  var sub = o.subtitle || o.restaurantName || '';
  return '<div class="um-row">' +
    '<div class="um-row-icon">' + (isFood ? '🍽️' : '🚗') + '</div>' +
    '<div class="um-row-main">' +
      '<div class="um-row-title">' + esc(ref) + '</div>' +
      '<div class="um-row-sub">' + (isFood ? 'Food Order' : 'Ride Booking') + (sub ? ' · ' + esc(sub) : '') + '</div>' +
    '</div>' +
    '<div class="um-row-side">' +
      (amount != null ? '<div class="um-row-amount">' + esc(fmtNaira(amount)) + '</div>' : '') +
      '<div class="um-row-meta">' + umOrderStatusTag(o.status) + ' ' + esc(fmtDate(o.createdAt)) + '</div>' +
    '</div>' +
  '</div>';
}

function umOrdersTabHtml(orders, pagination) {
  var html = '<div class="order-detail-section">' +
    '<div class="order-detail-label">Orders &amp; Bookings</div>';
  if (!orders.length) {
    html += '<div class="oi-empty"><div class="oi-empty-icon">📦</div><div class="oi-empty-text">No orders or bookings yet</div></div>';
  } else {
    html += '<div class="um-rows" id="um-order-rows">' + orders.map(umOrderRow).join('') + '</div>' +
      '<div id="um-order-more">' + (pagination && pagination.totalPages > 1
        ? '<button class="btn btn-ghost btn-sm um-more" onclick="loadMoreUserOrders()">Load more</button>'
        : '<div class="um-more-end">' + (pagination ? pagination.total : orders.length) + ' total</div>') + '</div>';
  }
  html += '</div>';
  return html;
}

function loadMoreUserOrders() {
  var id = umActiveUserId;
  if (!id) return;
  var next = (umTabPager.orders || 1) + 1;
  var btn = document.querySelector('#um-order-more .um-more');
  if (btn) btn.disabled = true;
  api('GET', '/users/' + encodeURIComponent(id) + '/orders?type=all&page=' + next + '&limit=10').then(function(res) {
    if (umActiveUserId !== id) return;
    var orders = (res.data && res.data.orders) || [];
    var rows = document.getElementById('um-order-rows');
    if (rows) rows.insertAdjacentHTML('beforeend', orders.map(umOrderRow).join(''));
    umTabPager.orders = next;
    var moreWrap = document.getElementById('um-order-more');
    if (moreWrap) {
      moreWrap.innerHTML = res.pagination && res.pagination.totalPages > next
        ? '<button class="btn btn-ghost btn-sm um-more" onclick="loadMoreUserOrders()">Load more</button>'
        : '<div class="um-more-end">' + (res.pagination ? res.pagination.total : 0) + ' total</div>';
    }
  }).catch(function(e) {
    if (btn) btn.disabled = false;
    toast('Error: ' + e.message, false);
  });
}

// ─── Action modal (suspend / unsuspend / reset) ─

function umShowUserActionModal() {
  document.getElementById('userActionModal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeUserActionModal() {
  document.getElementById('userActionModal').classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  uaState = { mode: null, userId: null, userName: '', resetMode: 'temp', resultShown: false };
  var reason = document.getElementById('ua-reason');
  if (reason) reason.value = '';
  var err = document.getElementById('ua-err');
  if (err) err.textContent = '';
}

function umSetActionError(msg) {
  var el = document.getElementById('ua-err');
  if (el) el.textContent = msg || '';
}

function umSetActionBusy(busy) {
  var btn = document.getElementById('ua-confirm');
  if (!btn) return;
  btn.disabled = busy;
  if (busy) {
    btn.dataset.prev = btn.textContent;
    btn.textContent = 'Working...';
  } else if (btn.dataset.prev) {
    btn.textContent = btn.dataset.prev;
    delete btn.dataset.prev;
  }
}

function umActionModalReset() {
  document.getElementById('ua-reason-fg').style.display = 'none';
  document.getElementById('ua-reset-fg').style.display = 'none';
  document.getElementById('ua-result').style.display = 'none';
  document.getElementById('ua-reason').value = '';
  umSetActionError('');
  var cancel = document.getElementById('ua-cancel');
  cancel.textContent = 'Cancel';
  cancel.style.display = '';
  document.getElementById('ua-confirm').style.display = '';
}

function suspendUser(id) {
  var u = umActiveUser && umActiveUser.id === id ? umActiveUser : null;
  uaState = { mode: 'suspend', userId: id, userName: u ? (u.fullName || u.email || '') : '', resetMode: 'temp', resultShown: false };
  umActionModalReset();
  umSetText('ua-title', 'Suspend User');
  umSetText('ua-desc', 'Suspend ' + (uaState.userName ? '"' + uaState.userName + '"' : 'this user') + '? They will be signed out and blocked from using the app until restored. A reason is required.');
  document.getElementById('ua-reason-fg').style.display = '';
  var confirm = document.getElementById('ua-confirm');
  confirm.className = 'btn btn-red';
  confirm.textContent = 'Suspend User';
  umShowUserActionModal();
}

function unsuspendUser(id) {
  var u = umActiveUser && umActiveUser.id === id ? umActiveUser : null;
  uaState = { mode: 'unsuspend', userId: id, userName: u ? (u.fullName || u.email || '') : '', resetMode: 'temp', resultShown: false };
  umActionModalReset();
  umSetText('ua-title', 'Unsuspend User');
  umSetText('ua-desc', 'Restore ' + (uaState.userName ? '"' + uaState.userName + '"' : 'this user') + '? They will be able to sign in and use the app again.');
  var confirm = document.getElementById('ua-confirm');
  confirm.className = 'btn btn-green';
  confirm.textContent = 'Restore User';
  umShowUserActionModal();
}

function resetUserPassword(id) {
  var u = umActiveUser && umActiveUser.id === id ? umActiveUser : null;
  uaState = { mode: 'reset', userId: id, userName: u ? (u.fullName || u.email || '') : '', resetMode: 'temp', resultShown: false };
  umActionModalReset();
  umSetText('ua-title', 'Reset Password');
  umSetText('ua-desc', 'Choose how to reset the password for ' + (uaState.userName ? '"' + uaState.userName + '"' : 'this user') + '.');
  document.getElementById('ua-reset-fg').style.display = '';
  var confirm = document.getElementById('ua-confirm');
  confirm.className = 'btn btn-accent';
  confirm.textContent = 'Generate';
  onResetModeChange();
  umShowUserActionModal();
}

function onResetModeChange() {
  var selected = document.querySelector('input[name="ua-reset-mode"]:checked');
  uaState.resetMode = selected ? selected.value : 'temp';
  var hint = document.getElementById('ua-reset-hint');
  var linkRadio = document.querySelector('input[name="ua-reset-mode"][value="link"]');
  var u = umActiveUser;
  if (uaState.resetMode === 'link') {
    hint.textContent = 'A password-reset link will be generated for the user\'s email address.';
  } else {
    hint.textContent = 'A one-time temporary password will be generated and shown here once. Share it with the user securely.';
  }
  if (linkRadio) {
    if (u && !u.email) {
      linkRadio.disabled = true;
      hint.textContent = 'This user has no email address on file — use a temporary password.';
      if (uaState.resetMode === 'link') {
        var tempRadio = document.querySelector('input[name="ua-reset-mode"][value="temp"]');
        if (tempRadio) { tempRadio.checked = true; uaState.resetMode = 'temp'; hint.textContent = 'A one-time temporary password will be generated and shown here once.'; }
      }
    } else {
      linkRadio.disabled = false;
    }
  }
}

function copyUserActionResult() {
  var el = document.getElementById('ua-result-value');
  if (!el) return;
  var text = el.textContent;
  function done() { toast('Copied to clipboard'); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function() { umFallbackCopy(text, done); });
  } else {
    umFallbackCopy(text, done);
  }
}

function umFallbackCopy(text, done) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed', false); }
  ta.remove();
}

function confirmUserAction() {
  if (uaState.resultShown) { closeUserActionModal(); return; }
  var id = uaState.userId;
  if (!id) return;
  umSetActionError('');

  if (uaState.mode === 'suspend') {
    var reason = document.getElementById('ua-reason').value.trim();
    if (!reason) { umSetActionError('A reason is required to suspend a user.'); return; }
    if (reason.length < 3) { umSetActionError('The reason must be at least 3 characters.'); return; }
    umSetActionBusy(true);
    load(true);
    api('POST', '/users/' + encodeURIComponent(id) + '/suspend', { reason: reason }).then(function(res) {
      toast(res.message || 'User suspended');
      closeUserActionModal();
      return umAfterAction(id);
    }).catch(function(e) {
      umSetActionError(e.message);
      toast('Error: ' + e.message, false);
    }).finally(function() {
      umSetActionBusy(false);
      load(false);
    });
    return;
  }

  if (uaState.mode === 'unsuspend') {
    umSetActionBusy(true);
    load(true);
    api('POST', '/users/' + encodeURIComponent(id) + '/unsuspend', {}).then(function(res) {
      toast(res.message || 'User account restored');
      closeUserActionModal();
      return umAfterAction(id);
    }).catch(function(e) {
      umSetActionError(e.message);
      toast('Error: ' + e.message, false);
    }).finally(function() {
      umSetActionBusy(false);
      load(false);
    });
    return;
  }

  if (uaState.mode === 'reset') {
    umSetActionBusy(true);
    load(true);
    api('POST', '/users/' + encodeURIComponent(id) + '/reset-password', { mode: uaState.resetMode }).then(function(res) {
      var d = res.data || {};
      uaState.resultShown = true;
      document.getElementById('ua-reason-fg').style.display = 'none';
      document.getElementById('ua-reset-fg').style.display = 'none';
      document.getElementById('ua-result').style.display = '';
      if (d.mode === 'link') {
        umSetText('ua-result-label', 'Password reset link');
        umSetText('ua-result-value', d.resetLink || '');
        umSetText('ua-result-note', 'Share this link with the user. It expires in about ' + (d.expiresInMinutes || 60) + ' minutes.');
      } else {
        umSetText('ua-result-label', 'Temporary password (shown once)');
        umSetText('ua-result-value', d.tempPassword || '');
        umSetText('ua-result-note', 'This password will not be shown again. Give it to the user securely — they should change it after signing in.');
      }
      umSetText('ua-title', 'Password Reset Ready');
      umSetText('ua-desc', 'The reset was generated successfully. Copy it now — it is shown only once.');
      document.getElementById('ua-cancel').textContent = 'Close';
      var confirm = document.getElementById('ua-confirm');
      confirm.className = 'btn btn-ghost';
      confirm.textContent = 'Done';
      delete confirm.dataset.prev;
      toast(res.message || 'Password reset generated');
      loadUsers(true);
    }).catch(function(e) {
      umSetActionError(e.message);
      toast('Error: ' + e.message, false);
    }).finally(function() {
      umSetActionBusy(false);
      load(false);
    });
  }
}

function umAfterAction(id) {
  loadUsers(true);
  if (umActiveUserId === id) {
    return api('GET', '/users/' + encodeURIComponent(id)).then(function(res) {
      if (umActiveUserId !== id) return;
      umActiveUser = res.data && res.data.user;
      renderUserModal();
    }).catch(function() { /* list refresh already succeeded */ });
  }
  return null;
}

// ─── Backdrop / ESC closing ────────────────────

document.addEventListener('click', function(e) {
  var action = document.getElementById('userActionModal');
  if (action && e.target === action) closeUserActionModal();
  var details = document.getElementById('userModal');
  if (details && e.target === details) closeUserModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var action = document.getElementById('userActionModal');
  if (action && action.classList.contains('on')) { closeUserActionModal(); return; }
  var details = document.getElementById('userModal');
  if (details && details.classList.contains('on')) closeUserModal();
});
