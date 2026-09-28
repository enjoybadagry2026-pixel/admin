// ═══════════════ WALLETS / PAYOUTS ═══════════════

var wlState = {
  tab: 'overview',
  loaded: false,
  loading: false,
  overview: null
};

var wlLists = {
  users: { page: 1, limit: 20, q: '', data: [], stats: null, pagination: null, loaded: false, loading: false },
  drivers: { page: 1, limit: 20, q: '', data: [], stats: null, pagination: null, loaded: false, loading: false },
  withdrawals: { page: 1, limit: 20, q: '', status: '', data: [], stats: null, pagination: null, loaded: false, loading: false }
};

var wlSearchTimers = { users: null, drivers: null, withdrawals: null };
var wlActiveAccount = null;     // { type, id, name, balance }
var wlAction = null;            // { mode: 'topup'|'deduct', type, id, name, balance }
var wlWithdrawAction = null;    // { mode: 'approve'|'reject', withdrawal }

var WL_PANES = ['overview', 'users', 'drivers', 'withdrawals'];

function wlSetText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function wlLoader(text) {
  return '<div class="drv-loading" style="display:block;padding:48px 24px">' +
    '<div class="drv-loading-spinner"></div>' +
    '<div class="drv-loading-text">' + esc(text || 'Loading...') + '</div>' +
  '</div>';
}

function wlErrorBox(message, retryFn) {
  return '<div class="drv-error" style="display:block">' +
    '<div class="drv-error-icon">⚠️</div>' +
    '<div class="drv-error-title">Something went wrong</div>' +
    '<div class="drv-error-text">' + esc(message || 'Request failed') + '</div>' +
    '<button class="btn btn-accent btn-sm" onclick="' + retryFn + '">Retry</button>' +
  '</div>';
}

function wlEmptyBox(icon, title, text) {
  return '<div class="user-empty">' +
    '<div class="user-empty-icon">' + icon + '</div>' +
    '<div class="user-empty-title">' + esc(title) + '</div>' +
    '<div class="user-empty-text">' + esc(text) + '</div>' +
  '</div>';
}

function wlInitials(name) {
  var parts = String(name || '').trim().split(/\s+/);
  if (!parts[0]) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function wlStatusTag(status) {
  var s = String(status || '').toLowerCase();
  var cls = 'tag-pending';
  var label = status || '—';
  if (s === 'pending') { cls = 'tag-pending'; label = 'Pending'; }
  else if (s === 'approved') { cls = 'tag-confirmed'; label = 'Completed'; }
  else if (s === 'rejected') { cls = 'tag-cancelled'; label = 'Rejected'; }
  return '<span class="tag ' + cls + '" title="' + esc(status || '') + '">' + esc(label) + '</span>';
}

function wlTxStatusTag(status) {
  var s = String(status || '').toLowerCase();
  var cls = 'tag-pending';
  if (s === 'completed' || s === 'success' || s === 'credited') cls = 'tag-confirmed';
  else if (s === 'failed' || s === 'expired' || s === 'cancelled' || s === 'reversed') cls = 'tag-cancelled';
  else if (s === 'processing' || s === 'verifying') cls = 'tag-preparing';
  return '<span class="tag ' + cls + '">' + esc(status || '—') + '</span>';
}

function wlAmountTag(tx) {
  var amount = Number(tx.amount) || 0;
  var out = tx.direction === 'debit';
  var sign = out ? '-' : '+';
  var cls = out ? 'um-amount-out' : 'um-amount-in';
  return '<div class="um-row-amount ' + cls + '">' + esc(sign + fmtNaira(amount)) + '</div>';
}

// ─── Panel entry / state ───────────────────────

function wlSetPanelState(state, message) {
  var loading = document.getElementById('wl-loading');
  var error = document.getElementById('wl-error');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') wlSetText('wl-error-text', message || 'Something went wrong');
  }
  WL_PANES.forEach(function(t) {
    var el = document.getElementById('wl-pane-' + t);
    if (!el) return;
    el.style.display = (state === 'ready' && t === wlState.tab) ? '' : 'none';
  });
}

function wlRetry() {
  wlState.loaded = false;
  wlState.overview = null;
  Object.keys(wlLists).forEach(function(k) {
    wlLists[k].loaded = false;
    wlLists[k].data = [];
  });
  loadWalletPanel(true);
}

function loadWalletPanel(force) {
  if (wlState.loading) return;
  loadWalletOverview(force, true);
}

function wlSwitchTab(tab, btn) {
  if (WL_PANES.indexOf(tab) < 0) return;
  wlState.tab = tab;
  var wrap = btn && btn.parentElement;
  if (wrap) {
    wrap.querySelectorAll('.drv-tab').forEach(function(b) { b.classList.remove('on'); });
    btn.classList.add('on');
  } else {
    var pane = document.querySelector('.wl-tabs');
    if (pane) {
      pane.querySelectorAll('.drv-tab').forEach(function(b) {
        b.classList.toggle('on', b.getAttribute('data-wl-tab') === tab);
      });
    }
  }
  wlSetPanelState('ready');
  if (tab === 'overview' && !wlState.overview) loadWalletOverview(true);
  if (tab === 'users' && !wlLists.users.loaded) wlLoadAccounts('users');
  if (tab === 'drivers' && !wlLists.drivers.loaded) wlLoadAccounts('drivers');
  if (tab === 'withdrawals' && !wlLists.withdrawals.loaded) wlLoadWithdrawals();
}

// ─── Overview ──────────────────────────────────

function loadWalletOverview(force, opening) {
  if (wlState.loading) return;
  if (!force && wlState.loaded && wlState.overview) {
    if (opening) wlSetPanelState('ready');
    return;
  }
  wlState.loading = true;
  if (opening || wlState.tab === 'overview') wlSetPanelState('loading');

  api('GET', '/wallets/overview').then(function(res) {
    wlState.overview = res.data || {};
    wlState.loaded = true;
    wlRenderOverview();
    wlSetPanelState('ready');
  }).catch(function(e) {
    if (opening || wlState.tab === 'overview') wlSetPanelState('error', e.message);
    toast('Error: ' + e.message, false);
  }).finally(function() {
    wlState.loading = false;
  });
}

function wlRenderOverview() {
  var d = wlState.overview;
  if (!d) return;
  var w = d.wallets || {};
  var uw = w.user || {};
  var dw = w.driver || {};
  var p = d.platform || {};
  var ws = d.withdrawals || {};

  wlSetText('wl-s-user', fmtNaira(uw.totalBalance || 0));
  wlSetText('wl-s-driver', fmtNaira(dw.totalBalance || 0));
  wlSetText('wl-s-platform', fmtNaira(p.net || 0));
  wlSetText('wl-s-pending', fmtNaira(ws.pendingAmount || 0));
  wlSetText('wl-count', (w.fundedTotal || 0) + ' funded wallet' + ((w.fundedTotal || 0) === 1 ? '' : 's') + ' · ' + fmtNaira(w.grandTotal || 0) + ' held');

  var badge = document.getElementById('wl-pending-badge');
  if (badge) {
    var pendingCount = ws.pendingCount || 0;
    badge.style.display = pendingCount ? '' : 'none';
    badge.textContent = pendingCount;
  }

  // Recent activity
  var recent = d.recentTransactions || [];
  wlSetText('wl-recent-count', String(recent.length));
  var recentList = document.getElementById('wl-recent-list');
  if (recentList) {
    if (!recent.length) {
      recentList.innerHTML = '<div class="ov-recent-empty">' +
        '<div class="ov-recent-empty-icon">💳</div>' +
        '<div class="ov-recent-empty-text">No wallet activity yet</div></div>';
    } else {
      recentList.innerHTML = recent.map(function(t) {
        var name = t.ownerName || t.userId || 'Unknown account';
        var kind = t.ownerType === 'driver' ? 'Driver wallet' : (t.ownerType === 'user' ? 'User wallet' : 'Wallet');
        return '<div class="ov-recent-item">' +
          '<div class="ov-recent-avatar">' + esc(wlInitials(name)) + '</div>' +
          '<div class="ov-recent-info">' +
            '<div class="ov-recent-name">' + esc(t.description || t.type || t.reference) + '</div>' +
            '<div class="ov-recent-detail"><span>' + esc(kind) + ' · ' + esc(name) + '</span>' +
              (t.reference ? '<span>' + esc(t.reference) + '</span>' : '') + '</div>' +
          '</div>' +
          '<div class="wl-recent-side">' +
            '<div class="wl-recent-amount ' + (t.direction === 'debit' ? 'um-amount-out' : 'um-amount-in') + '">' +
              esc((t.direction === 'debit' ? '-' : '+') + fmtNaira(t.amount)) + '</div>' +
            wlTxStatusTag(t.status) +
          '</div>' +
          '<div class="ov-recent-time">' + esc(fmtDate(t.createdAt)) + '</div>' +
        '</div>';
      }).join('');
    }
  }

  // Payout summary
  wlSetText('wl-payout-count', String(ws.total || 0) + ' request' + ((ws.total || 0) === 1 ? '' : 's'));
  var summary = document.getElementById('wl-payout-summary');
  if (summary) {
    summary.innerHTML =
      wlSummaryRow('Pending payouts', ws.pendingCount || 0, ws.pendingAmount || 0, 'pending') +
      wlSummaryRow('Completed payouts', ws.approvedCount || 0, ws.approvedAmount || 0, 'approved') +
      wlSummaryRow('Rejected requests', ws.rejectedCount || 0, ws.rejectedAmount || 0, 'rejected') +
      '<div class="wl-summary-note">' +
        '<div class="wl-summary-note-title">Top-ups awaiting verification</div>' +
        '<div class="wl-summary-note-text">' + ((d.pendingTopups && d.pendingTopups.total) || 0) +
          ' pending · ' + esc(fmtNaira((d.pendingTopups && d.pendingTopups.amount) || 0)) + '</div>' +
      '</div>';
  }

  // Breakdown
  var grid = document.getElementById('wl-breakdown-grid');
  if (grid) {
    grid.innerHTML =
      wlField('User wallet balances', fmtNaira(uw.totalBalance || 0) + ' across ' + (uw.total || 0) + ' wallets (' + (uw.funded || 0) + ' funded)') +
      wlField('Driver wallet balances', fmtNaira(dw.totalBalance || 0) + ' across ' + (dw.total || 0) + ' drivers (' + (dw.funded || 0) + ' funded)') +
      wlField('Other wallet rows', fmtNaira((w.other && w.other.totalBalance) || 0) + ' across ' + ((w.other && w.other.total) || 0) + ' rows') +
      wlField('Platform ride fees', fmtNaira(p.rideFees || 0)) +
      wlField('Platform food revenue', fmtNaira(p.foodRevenue || 0)) +
      wlField('Admin top-ups issued', fmtNaira(p.adminTopups || 0)) +
      wlField('Platform net', fmtNaira(p.net || 0), true) +
      (p.note ? wlField('How platform net is calculated', p.note, true) : '');
  }
}

function wlSummaryRow(label, count, amount, kind) {
  return '<div class="wl-summary-row wl-summary-' + esc(kind) + '">' +
    '<div class="wl-summary-main">' +
      '<div class="wl-summary-label">' + esc(label) + '</div>' +
      '<div class="wl-summary-count">' + count + ' request' + (count === 1 ? '' : 's') + '</div>' +
    '</div>' +
    '<div class="wl-summary-amount">' + esc(fmtNaira(amount)) + '</div>' +
  '</div>';
}

function wlField(label, value, wide) {
  return '<div class="order-detail-field' + (wide ? ' order-detail-field-wide' : '') + '">' +
    '<div class="order-detail-field-label">' + esc(label) + '</div>' +
    '<div class="order-detail-field-value">' + esc(String(value)) + '</div>' +
  '</div>';
}

// ─── Account lists ─────────────────────────────

function wlListPath(kind) {
  var l = wlLists[kind];
  var p = '/wallets/accounts?type=' + (kind === 'users' ? 'user' : 'driver') +
    '&page=' + l.page + '&limit=' + l.limit;
  if (l.q) p += '&q=' + encodeURIComponent(l.q);
  return p;
}

function wlOnSearch(kind, value) {
  if (wlSearchTimers[kind]) clearTimeout(wlSearchTimers[kind]);
  wlSearchTimers[kind] = setTimeout(function() {
    var q = String(value || '').trim();
    if (kind === 'withdrawals') {
      wlLists.withdrawals.q = q;
      wlLists.withdrawals.page = 1;
      wlLoadWithdrawals(true);
      return;
    }
    var l = wlLists[kind];
    if (!l) return;
    l.q = q;
    l.page = 1;
    wlLoadAccounts(kind, true);
  }, 300);
}

function wlLoadAccounts(kind, force) {
  var l = wlLists[kind];
  if (l.loading) return;
  if (!force && l.loaded) return;
  l.loading = true;

  var listEl = document.getElementById('wl-' + kind + '-list');
  var emptyEl = document.getElementById('wl-' + kind + '-empty');
  if (emptyEl) emptyEl.style.display = 'none';
  if (listEl) listEl.innerHTML = wlLoader(kind === 'users' ? 'Loading user wallets...' : 'Loading driver wallets...');

  api('GET', wlListPath(kind)).then(function(res) {
    l.data = (res.data && res.data.accounts) || [];
    l.stats = (res.data && res.data.stats) || null;
    l.pagination = res.pagination || null;
    l.loaded = true;
    wlRenderAccounts(kind);
  }).catch(function(e) {
    if (listEl) listEl.innerHTML = wlErrorBox(e.message, 'wlLoadAccounts(\'' + kind + '\', true)');
    toast('Error: ' + e.message, false);
  }).finally(function() {
    l.loading = false;
  });
}

function wlRenderAccounts(kind) {
  var l = wlLists[kind];
  var listEl = document.getElementById('wl-' + kind + '-list');
  var emptyEl = document.getElementById('wl-' + kind + '-empty');
  var hintEl = document.getElementById('wl-' + kind + '-hint');
  var pagerEl = document.getElementById('wl-' + kind + '-pagination');
  if (!listEl) return;

  if (!l.data.length) {
    listEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.style.display = '';
      emptyEl.innerHTML = l.q
        ? wlEmptyBox('🔍', 'No matches', 'No wallets match "' + l.q + '". Try a different search term.')
        : wlEmptyBox(kind === 'users' ? '👥' : '🚗',
            kind === 'users' ? 'No user wallets yet' : 'No driver wallets yet',
            kind === 'users' ? 'Registered app users with wallets will appear here.' : 'Registered drivers will appear here.');
    }
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
    listEl.innerHTML = l.data.map(function(a) { return wlAccountCard(kind, a); }).join('');
  }

  var stats = l.stats || {};
  if (hintEl) {
    hintEl.textContent = stats.total != null
      ? (stats.total + ' wallet' + (stats.total === 1 ? '' : 's') + ' · ' + fmtNaira(stats.totalBalance || 0))
      : '';
  }
  wlRenderPager(kind);
}

function wlAccountCard(kind, a) {
  var type = kind === 'users' ? 'user' : 'driver';
  var id = esc(a.id || '');
  var statusCls = 'user-badge-muted';
  var st = String(a.status || '').toLowerCase();
  if (st === 'active') statusCls = 'user-badge-active';
  else if (st === 'suspended' || st === 'disabled') statusCls = 'user-badge-suspended';
  else if (st === 'pending') statusCls = 'user-badge-disabled';

  var meta = [];
  if (kind === 'drivers') {
    if (a.driverCode) meta.push('Driver ID ' + a.driverCode);
    if (typeof a.totalTrips === 'number') meta.push(a.totalTrips + ' trips');
    if (typeof a.rating === 'number' && a.rating > 0) meta.push('★ ' + a.rating.toFixed(1));
    if (a.pendingWithdrawals) meta.push(a.pendingWithdrawals + ' pending payout');
  } else {
    if (typeof a.transactionCount === 'number') meta.push(a.transactionCount + ' transaction' + (a.transactionCount === 1 ? '' : 's'));
    if (a.registeredAt) meta.push('Joined ' + fmtDate(a.registeredAt));
  }
  if (a.walletUpdatedAt) meta.push('Updated ' + fmtDate(a.walletUpdatedAt));

  return '<div class="user-card wl-account-card" onclick="wlOpenWallet(\'' + type + '\',\'' + id + '\')">' +
    '<div class="user-card-top">' +
      '<div class="user-card-avatar">' + esc(wlInitials(a.name || a.email)) + '</div>' +
      '<div class="user-card-top-info">' +
        '<div class="user-card-name">' + esc(a.name || (type === 'user' ? 'Unnamed user' : 'Unnamed driver')) + '</div>' +
        '<div class="user-card-contact">' + esc(a.email || a.phone || a.id) + '</div>' +
      '</div>' +
      '<span class="user-badge ' + statusCls + '">' + esc(a.status || '—') + '</span>' +
    '</div>' +
    '<div class="wl-account-balance">' +
      '<span class="wl-balance-label">' + (type === 'driver' ? 'Available earnings' : 'Wallet balance') + '</span>' +
      '<span class="wl-balance-value">' + esc(fmtNaira(a.balance || 0)) + '</span>' +
    '</div>' +
    '<div class="user-card-meta">' + meta.map(function(m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div>' +
    '<div class="user-card-acts">' +
      '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();wlOpenWallet(\'' + type + '\',\'' + id + '\')">Open Wallet</button>' +
      '<button class="btn btn-accent btn-sm" onclick="event.stopPropagation();wlOpenAction(\'topup\',\'' + type + '\',\'' + id + '\')">Top Up</button>' +
    '</div>' +
  '</div>';
}

function wlRenderPager(kind) {
  var el = document.getElementById('wl-' + kind + '-pagination');
  if (!el) return;
  var pg = wlLists[kind].pagination;
  if (!pg || !pg.totalPages || pg.totalPages <= 1) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  el.innerHTML =
    '<button class="btn btn-ghost btn-sm" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="wlGoPage(\'' + kind + '\',' + (pg.page - 1) + ')">Prev</button>' +
    '<span class="um-page-info">Page ' + pg.page + ' of ' + pg.totalPages + '</span>' +
    '<button class="btn btn-ghost btn-sm" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="wlGoPage(\'' + kind + '\',' + (pg.page + 1) + ')">Next</button>';
}

function wlGoPage(kind, page) {
  wlLists[kind].page = page;
  if (kind === 'withdrawals') wlLoadWithdrawals(true);
  else wlLoadAccounts(kind, true);
}

// ─── Withdrawals ───────────────────────────────

function wlFilterWithdrawals() {
  var sel = document.getElementById('wl-withdrawals-filter');
  wlLists.withdrawals.status = sel ? sel.value : '';
  wlLists.withdrawals.page = 1;
  wlLoadWithdrawals(true);
}

function wlLoadWithdrawals(force) {
  var l = wlLists.withdrawals;
  if (l.loading) return;
  if (!force && l.loaded) return;
  l.loading = true;

  var body = document.getElementById('wl-withdrawals-body');
  if (body) {
    body.innerHTML = '<tr><td colspan="8">' + wlLoader('Loading withdrawal requests...') + '</td></tr>';
  }

  var p = '/wallets/withdrawals?page=' + l.page + '&limit=' + l.limit;
  if (l.q) p += '&q=' + encodeURIComponent(l.q);
  if (l.status) p += '&status=' + encodeURIComponent(l.status);

  api('GET', p).then(function(res) {
    l.data = (res.data && res.data.withdrawals) || [];
    l.stats = (res.data && res.data.stats) || null;
    l.pagination = res.pagination || null;
    l.loaded = true;
    wlRenderWithdrawals();
  }).catch(function(e) {
    if (body) body.innerHTML = '<tr><td colspan="8">' + wlErrorBox(e.message, 'wlLoadWithdrawals(true)') + '</td></tr>';
    toast('Error: ' + e.message, false);
  }).finally(function() {
    l.loading = false;
  });
}

function wlRenderWithdrawals() {
  var l = wlLists.withdrawals;
  var s = l.stats || {};
  wlSetText('wl-w-pending', String(s.pendingCount || 0));
  wlSetText('wl-w-approved', String(s.approvedCount || 0));
  wlSetText('wl-w-rejected', String(s.rejectedCount || 0));
  wlSetText('wl-w-total', fmtNaira(((s.pendingAmount || 0) + (s.approvedAmount || 0) + (s.rejectedAmount || 0))));

  var body = document.getElementById('wl-withdrawals-body');
  var emptyEl = document.getElementById('wl-withdrawals-empty');
  var tableWrap = document.querySelector('.wl-table-wrap');
  if (!body) return;

  if (!l.data.length) {
    body.innerHTML = '';
    if (tableWrap) tableWrap.style.display = 'none';
    if (emptyEl) {
      emptyEl.style.display = '';
      emptyEl.innerHTML = (l.q || l.status)
        ? wlEmptyBox('🔍', 'No matching requests', 'No withdrawal requests match the current filters.')
        : wlEmptyBox('💸', 'No withdrawal requests', 'Driver payout requests will appear here for approval.');
    }
  } else {
    if (tableWrap) tableWrap.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';
    body.innerHTML = l.data.map(wlWithdrawalRow).join('');
  }

  var pg = l.pagination;
  var pagerEl = document.getElementById('wl-withdrawals-pagination');
  if (pagerEl) {
    if (!pg || !pg.totalPages || pg.totalPages <= 1) {
      pagerEl.style.display = 'none';
      pagerEl.innerHTML = '';
    } else {
      pagerEl.style.display = '';
      pagerEl.innerHTML =
        '<button class="btn btn-ghost btn-sm" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="wlGoPage(\'withdrawals\',' + (pg.page - 1) + ')">Prev</button>' +
        '<span class="um-page-info">Page ' + pg.page + ' of ' + pg.totalPages + '</span>' +
        '<button class="btn btn-ghost btn-sm" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="wlGoPage(\'withdrawals\',' + (pg.page + 1) + ')">Next</button>';
    }
  }
}

function wlWithdrawalRow(w) {
  var pending = String(w.status).toLowerCase() === 'pending';
  var payoutBits = [];
  if (w.accountNumber) payoutBits.push(w.accountNumber);
  if (w.bankName) payoutBits.push(w.bankName);
  if (w.accountName) payoutBits.push(w.accountName);
  var payout = payoutBits.length ? payoutBits.join(' · ') : 'Not provided';

  var noteBits = [];
  if (w.note) noteBits.push('Note: ' + w.note);
  if (w.rejectionReason) noteBits.push('Rejected: ' + w.rejectionReason);

  var actions = '';
  if (pending) {
    actions =
      '<button class="btn btn-green btn-sm" onclick="wlApproveWithdrawal(\'' + esc(w.withdrawalId) + '\')">Approve</button>' +
      '<button class="btn btn-red btn-sm" onclick="wlRejectWithdrawal(\'' + esc(w.withdrawalId) + '\')">Reject</button>';
  } else {
    actions = '<span class="wl-row-hint">' + (String(w.status).toLowerCase() === 'approved' ? 'Paid ' + esc(fmtDate(w.approvedAt)) : 'Closed ' + esc(fmtDate(w.rejectedAt))) + '</span>';
  }

  return '<tr class="' + (pending ? 'wl-row-pending' : '') + '">' +
    '<td>' +
      '<div class="wl-cell-strong">' + esc(w.driverName || 'Unknown driver') + '</div>' +
      '<div class="wl-cell-sub">' + esc(w.driverPhone || w.driverCode || w.driverId) + '</div>' +
    '</td>' +
    '<td><span class="wl-ref">' + esc(w.withdrawalId) + '</span>' +
      (noteBits.length ? '<div class="wl-cell-sub">' + esc(noteBits.join(' · ')) + '</div>' : '') +
    '</td>' +
    '<td class="wl-num wl-cell-amount">' + esc(fmtNaira(w.amount)) + '</td>' +
    '<td class="wl-num">' + esc(fmtNaira(w.walletBalance)) +
      (w.balanceBefore != null ? '<div class="wl-cell-sub">at request: ' + esc(fmtNaira(w.balanceBefore)) + '</div>' : '') +
    '</td>' +
    '<td><div class="wl-cell-sub wl-payout-info">' + esc(payout) + '</div></td>' +
    '<td><div class="wl-cell-sub">' + esc(fmtDate(w.createdAt)) + '</div></td>' +
    '<td>' + wlStatusTag(w.status) +
      (w.rejectionReason ? '<div class="wl-cell-sub">' + esc(w.rejectionReason) + '</div>' : '') +
    '</td>' +
    '<td class="wl-actions-col">' +
      '<div class="wl-row-actions">' + actions + '</div>' +
    '</td>' +
  '</tr>';
}

// ─── Wallet detail modal ───────────────────────

function wlOpenWallet(type, id) {
  wlActiveAccount = { type: type, id: id };
  var modal = document.getElementById('walletModal');
  var body = document.getElementById('walletModalBody');
  if (!modal || !body) return;
  wlSetText('walletModalTitle', type === 'driver' ? 'Driver Wallet' : 'User Wallet');
  wlSetText('walletModalRef', id || '');
  body.innerHTML = wlLoader('Loading wallet...');
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';

  Promise.all([
    api('GET', '/wallets/account/' + type + '/' + encodeURIComponent(id)),
    api('GET', '/wallets/account/' + type + '/' + encodeURIComponent(id) + '/transactions?page=1&limit=10')
  ]).then(function(results) {
    if (!wlActiveAccount || wlActiveAccount.id !== id) return;
    var account = (results[0].data && results[0].data.account) || {};
    var withdrawals = results[0].data && results[0].data.withdrawals;
    var txs = (results[1].data && results[1].data.transactions) || [];
    wlActiveAccount = { type: type, id: id, account: account, withdrawals: withdrawals || null, page: 1, pagination: results[1].pagination || null };
    wlRenderWalletModal(txs);
  }).catch(function(e) {
    if (!wlActiveAccount || wlActiveAccount.id !== id) return;
    body.innerHTML = wlErrorBox(e.message, 'wlOpenWallet(\'' + type + '\',\'' + id + '\')');
    toast('Error: ' + e.message, false);
  });
}

function closeWalletModal() {
  var modal = document.getElementById('walletModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  wlActiveAccount = null;
}

function wlRenderWalletModal(txs) {
  var a = wlActiveAccount && wlActiveAccount.account;
  if (!a) return;
  var body = document.getElementById('walletModalBody');
  if (!body) return;

  wlSetText('walletModalTitle', a.name || (a.type === 'driver' ? 'Driver Wallet' : 'User Wallet'));
  wlSetText('walletModalRef', a.email || a.phone || a.id || '');

  var statusCls = 'user-badge-muted';
  var st = String(a.status || '').toLowerCase();
  if (st === 'active') statusCls = 'user-badge-active';
  else if (st === 'suspended' || st === 'disabled') statusCls = 'user-badge-suspended';
  else if (st === 'pending') statusCls = 'user-badge-disabled';

  var head = '<div class="user-head">' +
      '<div class="user-head-avatar">' + esc(wlInitials(a.name || a.email)) + '</div>' +
      '<div class="user-head-info">' +
        '<div class="user-head-name">' + esc(a.name || 'Unnamed account') + '</div>' +
        '<div class="user-head-contact">' + esc(a.email || 'No email') + (a.phone ? ' · ' + esc(a.phone) : '') + '</div>' +
        '<div class="user-head-badges">' +
          '<span class="user-badge ' + statusCls + '">' + esc(a.status || '—') + '</span>' +
          '<span class="user-badge user-badge-muted">' + esc(a.type === 'driver' ? 'Driver wallet' : 'User wallet') + '</span>' +
          (a.type === 'driver' && a.driverCode ? '<span class="user-badge user-badge-muted">' + esc(a.driverCode) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="wl-detail-acts">' +
      '<button class="btn btn-accent" onclick="wlOpenAction(\'topup\',\'' + esc(a.type) + '\',\'' + esc(a.id) + '\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Top Up</button>' +
      '<button class="btn btn-red" onclick="wlOpenAction(\'deduct\',\'' + esc(a.type) + '\',\'' + esc(a.id) + '\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>Deduct</button>' +
      '<button class="btn btn-ghost" onclick="wlOpenWallet(\'' + esc(a.type) + '\',\'' + esc(a.id) + '\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Refresh</button>' +
    '</div>';

  var walletCard = '<div class="order-detail-section">' +
      '<div class="order-detail-label">Balance</div>' +
      '<div class="um-wallet-card">' +
        '<div class="um-wallet-balance">' + esc(fmtNaira(a.balance || 0)) + '</div>' +
        '<div class="um-wallet-currency">' + esc(a.currency || 'NGN') + ' available balance</div>' +
        '<div class="um-wallet-stats">' +
          '<span>' + (wlActiveAccount.pagination ? wlActiveAccount.pagination.total : (txs ? txs.length : 0)) + ' transactions</span>' +
          '<span>Credits: ' + esc(fmtNaira(a.totalCredits || 0)) + '</span>' +
          '<span>Debits: ' + esc(fmtNaira(a.totalDebits || 0)) + '</span>' +
        '</div>' +
        (a.walletUpdatedAt ? '<div class="um-wallet-updated">Updated ' + esc(fmtDate(a.walletUpdatedAt)) + '</div>' : '') +
      '</div>' +
    '</div>';

  var earnings = '';
  if (a.type === 'driver') {
    var w = wlActiveAccount.withdrawals;
    earnings = '<div class="order-detail-section">' +
      '<div class="order-detail-label">Earnings &amp; Payouts</div>' +
      '<div class="order-detail-grid">' +
        wlField('Lifetime earnings', fmtNaira(a.totalEarnings || 0)) +
        wlField('Today', fmtNaira(a.todayEarnings || 0)) +
        wlField('Completed rides', a.totalTrips != null ? a.totalTrips : '') +
        wlField('Driver rating', a.rating ? a.rating.toFixed(1) + ' / 5' : '') +
        (w ? wlField('Pending payouts', (w.pendingCount || 0) + ' · ' + fmtNaira(w.pendingAmount || 0)) : '') +
        (w ? wlField('Completed payouts', (w.approvedCount || 0) + ' · ' + fmtNaira(w.approvedAmount || 0)) : '') +
        (w ? wlField('Rejected payouts', (w.rejectedCount || 0) + ' · ' + fmtNaira(w.rejectedAmount || 0)) : '') +
      '</div>' +
    '</div>';
  }

  var info = '<div class="order-detail-section">' +
      '<div class="order-detail-label">Account</div>' +
      '<div class="order-detail-grid">' +
        wlField('Account ID', a.id, true) +
        wlField('Email', a.email) +
        wlField('Phone', a.phone) +
        wlField('Status', a.status) +
        wlField('Wallet opened', a.walletCreatedAt ? fmtDate(a.walletCreatedAt) : '') +
      '</div>' +
    '</div>';

  var txSection = '<div class="order-detail-section">' +
      '<div class="order-detail-label">Transaction History</div>' +
      '<div class="um-rows" id="wl-tx-rows">' + wlTxRows(txs || []) + '</div>' +
      '<div id="wl-tx-more"></div>' +
    '</div>';

  body.innerHTML = head + walletCard + earnings + info + txSection;
  wlRenderTxMore();
}

function wlTxRows(txs) {
  if (!txs.length) {
    return '<div class="oi-empty"><div class="oi-empty-icon">💳</div><div class="oi-empty-text">No wallet transactions yet</div></div>';
  }
  return txs.map(function(t) {
    return '<div class="um-row">' +
      '<div class="um-row-main">' +
        '<div class="um-row-title">' + esc(t.description || t.type || t.transactionId) + '</div>' +
        '<div class="um-row-sub">' + esc(t.type || '') + (t.reference ? ' · ' + esc(t.reference) : '') +
          (t.orderReference ? ' · ' + esc(t.orderReference) : '') + '</div>' +
        (t.previousBalance != null && t.newBalance != null
          ? '<div class="um-row-sub">Balance ' + esc(fmtNaira(t.previousBalance)) + ' → ' + esc(fmtNaira(t.newBalance)) + '</div>'
          : '') +
      '</div>' +
      '<div class="um-row-side">' +
        wlAmountTag(t) +
        '<div class="um-row-meta">' + esc(fmtDate(t.createdAt)) + ' ' + wlTxStatusTag(t.status) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function wlRenderTxMore() {
  var host = document.getElementById('wl-tx-more');
  if (!host) return;
  var pg = wlActiveAccount && wlActiveAccount.pagination;
  if (!pg || !pg.totalPages || pg.page >= pg.totalPages) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = '<button class="btn btn-ghost btn-sm um-more" onclick="wlLoadMoreTransactions()">Load more</button>';
}

function wlLoadMoreTransactions() {
  var ctx = wlActiveAccount;
  if (!ctx || !ctx.account) return;
  var next = (ctx.page || 1) + 1;
  var btn = document.querySelector('#wl-tx-more .um-more');
  if (btn) btn.disabled = true;

  api('GET', '/wallets/account/' + ctx.type + '/' + encodeURIComponent(ctx.id) + '/transactions?page=' + next + '&limit=10')
    .then(function(res) {
      if (!wlActiveAccount || wlActiveAccount.id !== ctx.id) return;
      var txs = (res.data && res.data.transactions) || [];
      var rows = document.getElementById('wl-tx-rows');
      if (rows) {
        if (rows.querySelector('.oi-empty') && txs.length) rows.innerHTML = '';
        rows.insertAdjacentHTML('beforeend', wlTxRows(txs));
      }
      wlActiveAccount.page = next;
      wlActiveAccount.pagination = res.pagination || null;
      wlRenderTxMore();
    })
    .catch(function(e) {
      toast('Error: ' + e.message, false);
      wlRenderTxMore();
    });
}

// ─── Top-up / Deduct ───────────────────────────

function wlOpenAction(mode, type, id) {
  var account = null;
  if (wlActiveAccount && wlActiveAccount.account && wlActiveAccount.id === id) {
    account = wlActiveAccount.account;
  }
  if (!account) {
    var list = wlLists[type === 'driver' ? 'drivers' : 'users'].data || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { account = list[i]; break; }
    }
  }
  if (!account) account = { type: type, id: id, name: '', balance: 0 };

  wlAction = { mode: mode, type: type, id: id, name: account.name || '', balance: Number(account.balance) || 0 };

  var modal = document.getElementById('walletActionModal');
  if (!modal) return;
  var isTopup = mode === 'topup';

  wlSetText('wal-title', isTopup ? 'Top Up Wallet' : 'Deduct From Wallet');
  wlSetText('wal-desc', isTopup
    ? 'Add funds to ' + (account.name || 'this account') + '\u2019s wallet. The balance and transaction record update immediately.'
    : 'Remove funds from ' + (account.name || 'this account') + '\u2019s wallet. A permanent record of the reason is stored.');
  document.getElementById('wal-balance-line').innerHTML =
    '<span class="wl-balance-tag">' + esc(type === 'driver' ? 'Driver wallet' : 'User wallet') + '</span>' +
    '<span class="wl-balance-current">Current balance: ' + esc(fmtNaira(account.balance || 0)) + '</span>';

  document.getElementById('wal-reason-fg').style.display = isTopup ? 'none' : '';
  var amountEl = document.getElementById('wal-amount');
  var reasonEl = document.getElementById('wal-reason');
  if (amountEl) amountEl.value = '';
  if (reasonEl) reasonEl.value = '';
  document.getElementById('wal-preview').style.display = 'none';
  document.getElementById('wal-err').textContent = '';
  document.getElementById('wal-confirm').textContent = isTopup ? 'Top Up' : 'Deduct';
  document.getElementById('wal-confirm').className = 'btn ' + (isTopup ? 'btn-accent' : 'btn-red');
  document.getElementById('wal-confirm').disabled = true;

  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
  if (amountEl) amountEl.focus();
}

function closeWalletActionModal() {
  var modal = document.getElementById('walletActionModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  wlAction = null;
}

function walValidate() {
  if (!wlAction) return;
  var amountEl = document.getElementById('wal-amount');
  var reasonEl = document.getElementById('wal-reason');
  var confirmBtn = document.getElementById('wal-confirm');
  var preview = document.getElementById('wal-preview');
  var err = document.getElementById('wal-err');
  var amount = Number(amountEl && amountEl.value);
  var reason = reasonEl ? reasonEl.value.trim() : '';
  var ok = true;
  var msg = '';

  if (!amountEl || !amountEl.value) { ok = false; }
  else if (!isFinite(amount) || amount <= 0) { ok = false; msg = 'Enter a valid amount'; }
  else if (wlAction.mode === 'deduct' && amount > wlAction.balance) {
    ok = false;
    msg = 'Amount exceeds the current balance of ' + fmtNaira(wlAction.balance);
  }
  if (wlAction.mode === 'deduct' && !reason) ok = false;

  if (err) err.textContent = msg;
  if (confirmBtn) confirmBtn.disabled = !ok;

  if (preview) {
    if (amountEl && amountEl.value && isFinite(amount) && amount > 0) {
      var resulting = wlAction.mode === 'topup'
        ? wlAction.balance + amount
        : wlAction.balance - amount;
      preview.style.display = '';
      preview.innerHTML =
        '<div class="wl-preview-row"><span>' + (wlAction.mode === 'topup' ? 'Amount to add' : 'Amount to deduct') + '</span><strong>' + esc(fmtNaira(amount)) + '</strong></div>' +
        '<div class="wl-preview-row"><span>Balance after</span><strong>' + esc(fmtNaira(resulting)) + '</strong></div>';
    } else {
      preview.style.display = 'none';
      preview.innerHTML = '';
    }
  }
}

function confirmWalletAction() {
  if (!wlAction) return;
  var mode = wlAction.mode;
  var type = wlAction.type;
  var id = wlAction.id;
  var amountEl = document.getElementById('wal-amount');
  var reasonEl = document.getElementById('wal-reason');
  var amount = Number(amountEl && amountEl.value);
  var reason = reasonEl ? reasonEl.value.trim() : '';
  var confirmBtn = document.getElementById('wal-confirm');
  var err = document.getElementById('wal-err');

  if (!amountEl || !amountEl.value || !isFinite(amount) || amount <= 0) {
    if (err) err.textContent = 'Enter a valid amount';
    return;
  }
  if (mode === 'deduct' && !reason) {
    if (err) err.textContent = 'A reason is required for every deduction';
    return;
  }

  var body = { amount: amount };
  if (mode === 'topup') body.note = reason;
  else body.reason = reason;

  var originalText = confirmBtn.textContent;
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Processing...';

  api('POST', '/wallets/account/' + type + '/' + encodeURIComponent(id) + '/' + (mode === 'topup' ? 'topup' : 'deduct'), body)
    .then(function(res) {
      var d = res.data || {};
      toast(res.message || (mode === 'topup' ? 'Wallet topped up' : 'Wallet deducted'), true);
      closeWalletActionModal();

      if (wlActiveAccount && wlActiveAccount.account && wlActiveAccount.id === id) {
        wlOpenWallet(type, id);
      }
      wlRefreshLists();
      loadWalletOverview(true);
    })
    .catch(function(e) {
      if (err) err.textContent = e.message;
      toast('Error: ' + e.message, false);
    })
    .finally(function() {
      if (document.getElementById('wal-confirm')) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
      }
    });
}

function wlRefreshLists() {
  ['users', 'drivers'].forEach(function(k) {
    if (wlLists[k].loaded) wlLoadAccounts(k, true);
  });
  if (wlLists.withdrawals.loaded) wlLoadWithdrawals(true);
}

// ─── Withdrawal approve / reject ───────────────

function wlFindWithdrawal(id) {
  var list = wlLists.withdrawals.data || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].withdrawalId === id) return list[i];
  }
  return null;
}

function wlApproveWithdrawal(id) {
  var w = wlFindWithdrawal(id);
  if (!w) return;
  wlWithdrawAction = { mode: 'approve', withdrawal: w };

  var modal = document.getElementById('withdrawModal');
  if (!modal) return;
  wlSetText('wdl-title', 'Approve Withdrawal');
  wlSetText('wdl-desc', 'This marks the request as approved, debits the driver wallet and writes a permanent payout transaction. It cannot be paid twice.');
  document.getElementById('wdl-reason-fg').style.display = 'none';
  document.getElementById('wdl-summary').innerHTML =
    wlSummaryField('Driver', w.driverName || w.driverId) +
    wlSummaryField('Amount', fmtNaira(w.amount)) +
    wlSummaryField('Wallet balance now', fmtNaira(w.walletBalance)) +
    wlSummaryField('Balance after payout', fmtNaira(Math.max(0, (Number(w.walletBalance) || 0) - (Number(w.amount) || 0)))) +
    wlSummaryField('Reference', w.withdrawalId) +
    (w.accountNumber ? wlSummaryField('Payout account', [w.accountNumber, w.bankName, w.accountName].filter(Boolean).join(' · ')) : '');
  document.getElementById('wdl-err').textContent = '';
  var confirmBtn = document.getElementById('wdl-confirm');
  confirmBtn.innerHTML = 'Approve &amp; Pay';
  confirmBtn.className = 'btn btn-green';
  confirmBtn.disabled = false;

  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
}

function wlRejectWithdrawal(id) {
  var w = wlFindWithdrawal(id);
  if (!w) return;
  wlWithdrawAction = { mode: 'reject', withdrawal: w };

  var modal = document.getElementById('withdrawModal');
  if (!modal) return;
  wlSetText('wdl-title', 'Reject Withdrawal');
  wlSetText('wdl-desc', 'The request will be closed and the reason saved with it. The driver wallet is not changed.');
  document.getElementById('wdl-reason-fg').style.display = '';
  document.getElementById('wdl-reason').value = '';
  document.getElementById('wdl-summary').innerHTML =
    wlSummaryField('Driver', w.driverName || w.driverId) +
    wlSummaryField('Amount', fmtNaira(w.amount)) +
    wlSummaryField('Reference', w.withdrawalId);
  document.getElementById('wdl-err').textContent = '';
  var confirmBtn = document.getElementById('wdl-confirm');
  confirmBtn.textContent = 'Reject Request';
  confirmBtn.className = 'btn btn-red';
  confirmBtn.disabled = false;

  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
  var reasonEl = document.getElementById('wdl-reason');
  if (reasonEl) reasonEl.focus();
}

function wlSummaryField(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return '<div class="wl-summary-field">' +
    '<div class="wl-summary-field-label">' + esc(label) + '</div>' +
    '<div class="wl-summary-field-value">' + esc(String(value)) + '</div>' +
  '</div>';
}

function closeWithdrawModal() {
  var modal = document.getElementById('withdrawModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  wlWithdrawAction = null;
}

function confirmWithdrawAction() {
  if (!wlWithdrawAction) return;
  var mode = wlWithdrawAction.mode;
  var id = wlWithdrawAction.withdrawal.withdrawalId;
  var errEl = document.getElementById('wdl-err');
  var confirmBtn = document.getElementById('wdl-confirm');

  var body = {};
  if (mode === 'reject') {
    var reason = document.getElementById('wdl-reason').value.trim();
    if (!reason) {
      if (errEl) errEl.textContent = 'A rejection reason is required';
      return;
    }
    body.reason = reason;
  }

  var original = confirmBtn.innerHTML;
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = 'Processing...';

  api('POST', '/wallets/withdrawals/' + encodeURIComponent(id) + '/' + (mode === 'approve' ? 'approve' : 'reject'), body)
    .then(function(res) {
      toast(res.message || 'Withdrawal updated', true);
      closeWithdrawModal();
      wlLoadWithdrawals(true);
      wlRefreshLists();
      loadWalletOverview(true);
      if (wlActiveAccount && wlActiveAccount.account && wlActiveAccount.type === 'driver') {
        wlOpenWallet('driver', wlActiveAccount.id);
      }
    })
    .catch(function(e) {
      if (errEl) errEl.textContent = e.message;
      toast('Error: ' + e.message, false);
    })
    .finally(function() {
      var btn = document.getElementById('wdl-confirm');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
}
