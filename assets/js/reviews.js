// ═══════════════ REVIEWS & RATINGS (moderation panel) ═══════════════
// Central moderation for every reviewable entity: destinations, hotels,
// food and drivers. Reviews already live in their own source tables — this
// file only reads and moderates them (Visible → Hidden → Restored, never a
// hard delete).
//
// Backed by GET  /api/admin/reviews                          (list + stats)
//          GET  /api/admin/reviews/:type/:id                 (details)
//          POST /api/admin/reviews/:type/:id/<action>        (hide|restore|report)
//          POST /api/admin/reviews/:type/:id/replies/:rid/<action>
//          POST /api/admin/reviews/reports/:reportId/resolve

var rvState = { page: 1, limit: 20, q: '', type: '', rating: '', status: '', targetId: '', reported: '', from: '', to: '', loaded: false, loading: false };
var rvListData = [];
var rvPagination = null;
var rvStats = null;
var rvSearchTimer = null;
var rvActive = null;
var rvDetail = null;
var rvPendingAction = null;
var rvActionBusy = false;
var rvCountText = '0 reviews';

var RV_TYPE_LABEL = { destination: 'Destination', hotel: 'Hotel', food: 'Food', driver: 'Driver' };
var RV_TYPE_TAG = { destination: 'tag-preparing', hotel: 'tag-out', food: 'tag-pending', driver: 'tag-confirmed' };

function rvSetText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function rvAttr(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function rvTypeLabel(t) {
  return RV_TYPE_LABEL[t] || String(t || 'Review');
}

// ─── Small presentational helpers ──────────────────────────────────

function rvStars(rating) {
  var full = Math.round(Number(rating) || 0);
  var html = '';
  for (var i = 1; i <= 5; i++) {
    html += '<span class="star' + (i <= full ? '' : ' empty') + '">★</span>';
  }
  return html;
}

function rvTag(label, cls) {
  return '<span class="tag ' + (cls || 'tag-pending') + '">' + esc(label || '—') + '</span>';
}

function rvTypeTag(type) {
  return rvTag(rvTypeLabel(type), RV_TYPE_TAG[type] || 'tag-pending');
}

function rvStatusBadge(review, large) {
  var hidden = review && String(review.status).toLowerCase() === 'hidden';
  return '<span class="order-card-status ' + (hidden ? 'order-status-cancelled' : 'order-status-completed') + '"' +
    (large ? ' style="font-size:12px;padding:5px 14px"' : '') + '>' +
    (hidden ? 'Hidden' : 'Visible') + '</span>';
}

function rvTagForStatus(status, large) {
  var hidden = String(status || '').toLowerCase() === 'hidden';
  return rvTag(hidden ? 'Hidden' : 'Visible', hidden ? 'tag-cancelled' : 'tag-confirmed');
}

function rvMetaItem(icon, text) {
  return '<span class="order-card-meta-item">' + icon + esc(text) + '</span>';
}

var RV_ICO_USER = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
var RV_ICO_CAL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
var RV_ICO_REPLY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>';
var RV_ICO_FLAG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
var RV_ICO_STAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

// ─── List state ────────────────────────────────────────────────────

function rvListPath() {
  var p = '/reviews?page=' + rvState.page + '&limit=' + rvState.limit;
  if (rvState.q) p += '&q=' + encodeURIComponent(rvState.q);
  if (rvState.type) p += '&type=' + encodeURIComponent(rvState.type);
  if (rvState.rating !== '') p += '&rating=' + encodeURIComponent(rvState.rating);
  if (rvState.status) p += '&status=' + encodeURIComponent(rvState.status);
  if (rvState.targetId) p += '&targetId=' + encodeURIComponent(rvState.targetId);
  if (rvState.reported) p += '&reported=' + encodeURIComponent(rvState.reported);
  if (rvState.from) p += '&from=' + encodeURIComponent(rvState.from);
  if (rvState.to) p += '&to=' + encodeURIComponent(rvState.to);
  return p;
}

function rvShowListState(state, message) {
  var loading = document.getElementById('rv-loading');
  var error = document.getElementById('rv-error');
  var list = document.getElementById('rv-list');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') rvSetText('rv-error-text', message || 'Something went wrong');
  }
  if (list) list.style.display = state === 'loading' || state === 'error' ? 'none' : '';
}

function rvHasFilters() {
  return !!(rvState.q || rvState.type || rvState.rating !== '' || rvState.status ||
    rvState.targetId || rvState.reported || rvState.from || rvState.to);
}

function loadReviews(force) {
  if (rvState.loading) return;
  if (!force && rvState.loaded) return;
  rvState.loading = true;
  rvShowListState('loading');
  rvSetText('rv-hint', '');

  api('GET', rvListPath()).then(function(res) {
    rvListData = (res.data && res.data.reviews) || [];
    rvStats = (res.data && res.data.stats) || null;
    rvPagination = res.pagination || null;
    rvState.loaded = true;
    rvShowListState('ready');
    rvRenderStats();
    rvRenderTargetFilter();
    renderReviews();
  }).catch(function(e) {
    rvShowListState('error', e.message);
    toast('Error: ' + e.message, false);
  }).finally(function() {
    rvState.loading = false;
  });
}

function rvRenderStats() {
  if (!rvStats) return;
  rvSetText('rv-s-total', Number(rvStats.total || 0).toLocaleString());
  rvSetText('rv-s-visible', Number(rvStats.visible || 0).toLocaleString());
  rvSetText('rv-s-hidden', Number(rvStats.hidden || 0).toLocaleString());
  rvSetText('rv-s-reported', Number(rvStats.reported || 0).toLocaleString());
}

function rvCacheValues(arr, map) {
  if (Array.isArray(arr) && arr.length) return arr;
  if (map && typeof map === 'object') return Object.keys(map).map(function(k) { return map[k]; });
  return Array.isArray(arr) ? arr : [];
}

// Rebuilds the "reviewed item" dropdown from the already cached catalogue.
function rvRenderTargetFilter() {
  var sel = document.getElementById('rv-target-filter');
  if (!sel) return;

  var groups = [];
  if (!rvState.type || rvState.type === 'destination') {
    groups.push({ label: 'Destinations', type: 'destination',
      items: rvCacheValues(cachedPlacesArr, cachedPlaces).map(function(p) { return { id: p.id, name: p.name }; }) });
  }
  if (!rvState.type || rvState.type === 'hotel') {
    groups.push({ label: 'Hotels', type: 'hotel',
      items: rvCacheValues(null, cachedHotels).map(function(h) { return { id: h.id, name: h.name }; }) });
  }
  if (!rvState.type || rvState.type === 'food') {
    groups.push({ label: 'Food', type: 'food',
      items: rvCacheValues(null, cachedFoods).map(function(f) { return { id: f.id, name: f.name }; }) });
  }
  if (!rvState.type || rvState.type === 'driver') {
    groups.push({ label: 'Drivers', type: 'driver',
      items: rvCacheValues(null, cachedDrivers).map(function(d) { return { id: d.driverId || d.id, name: d.fullName || d.name }; }) });
  }

  var current = rvState.targetId ? String(rvState.targetId) : '';
  var found = !current;
  var html = '<option value="">All Items</option>';

  groups.forEach(function(g) {
    var opts = (g.items || []).filter(function(it) { return it && it.id; });
    if (!opts.length) return;
    if (current) opts.forEach(function(it) { if (String(it.id) === current) found = true; });
    html += '<optgroup label="' + rvAttr(g.label) + '">';
    opts.forEach(function(it) {
      var id = String(it.id);
      html += '<option value="' + rvAttr(id) + '"' + (id === current ? ' selected' : '') + '>' +
        rvAttr(it.name || id) + '</option>';
    });
    html += '</optgroup>';
  });

  if (!found) {
    rvState.targetId = '';
    current = '';
    html = '<option value="">All Items</option>';
    groups.forEach(function(g) {
      var opts = (g.items || []).filter(function(it) { return it && it.id; });
      if (!opts.length) return;
      html += '<optgroup label="' + rvAttr(g.label) + '">';
      opts.forEach(function(it) {
        html += '<option value="' + rvAttr(String(it.id)) + '">' + rvAttr(it.name || it.id) + '</option>';
      });
      html += '</optgroup>';
    });
  }

  sel.innerHTML = html;
}

function renderReviews() {
  var el = document.getElementById('rv-list');
  if (!el) return;
  var html = '';

  (rvListData || []).forEach(function(r) {
    var meta = '';
    meta += rvMetaItem(RV_ICO_USER, r.userName || 'Anonymous');
    if (r.bookingNumber) meta += rvMetaItem(RV_ICO_USER, 'Booking ' + r.bookingNumber);
    if (r.replyCount) meta += rvMetaItem(RV_ICO_REPLY, r.replyCount + ' repl' + (r.replyCount === 1 ? 'y' : 'ies'));
    if (r.reportCount) meta += rvMetaItem(RV_ICO_FLAG, r.reportCount + ' report' + (r.reportCount === 1 ? '' : 's'));

    var tags = rvTypeTag(r.type);
    if (r.reportCount) tags += rvTag((r.openReportCount ? 'Reported' : 'Reported · resolved'), 'tag-cancelled');

    var isHidden = String(r.status).toLowerCase() === 'hidden';
    var cardCls = 'order-card' + (isHidden ? ' rv-hidden' : '') + (r.openReportCount ? ' rv-reported' : '');

    html += '<div class="' + cardCls + '" onclick="openReviewModal(\'' + rvAttr(r.type) + '\',\'' + rvAttr(r.id) + '\')">' +
      '<div class="order-card-header">' +
        '<span class="order-card-ref">Review #' + esc(r.id) + '</span>' +
        rvStatusBadge(r) +
      '</div>' +
      '<div class="order-card-body">' +
        '<div class="rv-rating-row">' +
          '<span class="drv-review-stars">' + rvStars(r.rating) + '</span>' +
          (r.rating ? '<span class="rv-rating-score">' + r.rating + '/5</span>' : '<span class="rv-rating-score">No rating</span>') +
          tags +
        '</div>' +
        '<div class="order-card-restaurant">' + esc(r.targetName || rvTypeLabel(r.type)) + '</div>' +
        '<div class="order-card-items-preview">' + esc(r.text || 'No review text') + '</div>' +
        '<div class="order-card-meta">' + meta + '</div>' +
      '</div>' +
      '<div class="order-card-footer">' +
        '<span class="order-card-total rv-card-footer-type">' + esc(rvTypeLabel(r.type)) + '</span>' +
        '<span class="order-card-date">' + fmtDate(r.createdAt) + '</span>' +
      '</div>' +
    '</div>';
  });

  if (!html) {
    var hasFilters = rvHasFilters();
    html = '<div class="rd-empty">' +
      '<div class="rd-empty-icon">' + (hasFilters ? '🔍' : '⭐') + '</div>' +
      '<div class="rd-empty-title">' + (hasFilters ? 'No reviews match your search' : 'No reviews yet') + '</div>' +
      '<div class="rd-empty-text">' +
        (hasFilters
          ? 'Try a different search term or clear the filters below.'
          : 'Reviews from the app for destinations, hotels, food and drivers will appear here.') +
      '</div>' +
    '</div>';
  }
  el.innerHTML = html;

  var total = rvPagination ? rvPagination.total : (rvListData || []).length;
  rvCountText = total + ' review' + (total === 1 ? '' : 's');
  rvSetText('rv-count', rvCountText);

  if (total) {
    var start = (rvState.page - 1) * rvState.limit + 1;
    var end = Math.min(total, start + (rvListData || []).length - 1);
    rvSetText('rv-hint', start === end ? String(total) : start + '–' + end + ' of ' + total);
  } else {
    rvSetText('rv-hint', '');
  }

  var clear = document.getElementById('rv-clear');
  if (clear) clear.style.display = rvHasFilters() ? '' : 'none';

  rvRenderPagination();
}

function rvRenderPagination() {
  var el = document.getElementById('rv-pagination');
  if (!el) return;
  var pg = rvPagination;
  if (!pg || !pg.totalPages || pg.totalPages <= 1) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  el.innerHTML =
    '<button class="btn btn-ghost btn-sm" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="rvGoPage(' + (pg.page - 1) + ')">Prev</button>' +
    '<span class="um-page-info">Page ' + pg.page + ' of ' + pg.totalPages + '</span>' +
    '<button class="btn btn-ghost btn-sm" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="rvGoPage(' + (pg.page + 1) + ')">Next</button>';
}

function rvGoPage(page) {
  rvState.page = page;
  loadReviews(true);
  var el = document.getElementById('rv-list');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// ─── Search / filters ──────────────────────────────────────────────

function onReviewSearch(v) {
  if (rvSearchTimer) clearTimeout(rvSearchTimer);
  rvSearchTimer = setTimeout(function() {
    rvState.q = String(v || '').trim();
    rvState.page = 1;
    loadReviews(true);
  }, 300);
}

function filterReviews() {
  var type = document.getElementById('rv-type-filter');
  var rating = document.getElementById('rv-rating-filter');
  var status = document.getElementById('rv-status-filter');
  var target = document.getElementById('rv-target-filter');
  var reported = document.getElementById('rv-reported-filter');
  var from = document.getElementById('rv-from');
  var to = document.getElementById('rv-to');

  var nextType = type ? type.value : '';
  rvState.type = nextType;
  rvState.rating = rating ? rating.value : '';
  rvState.status = status ? status.value : '';
  rvState.reported = reported ? reported.value : '';
  rvState.targetId = target ? target.value : '';
  rvState.from = from && /^\d{4}-\d{2}-\d{2}$/.test(from.value) ? from.value : '';
  rvState.to = to && /^\d{4}-\d{2}-\d{2}$/.test(to.value) ? to.value : '';

  if (rvState.from && rvState.to && rvState.from > rvState.to) {
    toast('From date must be before the To date', false);
    return;
  }

  rvState.page = 1;
  rvRenderTargetFilter();
  loadReviews(true);
}

function clearReviewFilters() {
  rvState.q = '';
  rvState.type = '';
  rvState.rating = '';
  rvState.status = '';
  rvState.targetId = '';
  rvState.reported = '';
  rvState.from = '';
  rvState.to = '';
  rvState.page = 1;

  var search = document.getElementById('rv-search');
  if (search) search.value = '';
  ['rv-type-filter', 'rv-rating-filter', 'rv-status-filter', 'rv-target-filter', 'rv-reported-filter'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var from = document.getElementById('rv-from');
  var to = document.getElementById('rv-to');
  if (from) from.value = '';
  if (to) to.value = '';

  rvRenderTargetFilter();
  loadReviews(true);
}

// ─── Modal helpers ─────────────────────────────────────────────────

function rvField(label, value, wide) {
  if (value === null || value === undefined || value === '') return '';
  return '<div class="order-detail-field' + (wide ? ' order-detail-field-wide' : '') + '">' +
    '<div class="order-detail-field-label">' + esc(label) + '</div>' +
    '<div class="order-detail-field-value">' + esc(String(value)) + '</div>' +
  '</div>';
}

function rvSection(label, inner) {
  if (!inner) return '';
  return '<div class="order-detail-section">' +
    '<div class="order-detail-label">' + esc(label) + '</div>' +
    inner +
  '</div>';
}

function rvGrid(fields) {
  return '<div class="order-detail-grid">' + fields + '</div>';
}

function rvEmptyInline(text) {
  return '<div class="drv-empty-inline">' +
    '<div class="drv-empty-inline-icon">🛈</div>' +
    '<div class="drv-empty-inline-text">' + esc(text) + '</div>' +
  '</div>';
}

// ─── Review Details modal ──────────────────────────────────────────

function openReviewModal(type, id) {
  rvActive = { type: type, id: String(id) };
  rvDetail = null;
  var modal = document.getElementById('rvModal');
  var body = document.getElementById('rvModalBody');
  if (!modal || !body) return;
  rvSetText('rvModalTitle', 'Review Details');
  rvSetText('rvModalRef', 'Review #' + id);
  body.innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading review details...</div></div>';
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
  loadReviewDetails();
}

function loadReviewDetails() {
  if (!rvActive) return Promise.resolve();
  var body = document.getElementById('rvModalBody');
  var key = rvActive.type + ':' + rvActive.id;

  return api('GET', '/reviews/' + encodeURIComponent(rvActive.type) + '/' + encodeURIComponent(rvActive.id)).then(function(res) {
    if (!rvActive || (rvActive.type + ':' + rvActive.id) !== key) return;
    rvDetail = res.data || null;
    if (!rvDetail || !rvDetail.review) throw new Error('Review not found');
    renderReviewModal();
  }).catch(function(e) {
    if (!rvActive || (rvActive.type + ':' + rvActive.id) !== key) return;
    if (body) {
      body.innerHTML = '<div class="drv-error">' +
        '<div class="drv-error-icon">⚠️</div>' +
        '<div class="drv-error-title">Failed to load review details</div>' +
        '<div class="drv-error-text">' + esc(e.message) + '</div>' +
        '<button class="btn btn-accent btn-sm" onclick="loadReviewDetails()">Retry</button>' +
      '</div>';
    }
    toast('Error: ' + e.message, false);
  });
}

function reloadReviewDetails() {
  return loadReviewDetails();
}

function closeReviewModal() {
  var modal = document.getElementById('rvModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  rvActive = null;
  rvDetail = null;
}

function rvReportBadge(count, openCount) {
  if (!count) return '';
  return rvTag((openCount ? openCount + ' open report' + (openCount === 1 ? '' : 's') : count + ' report' + (count === 1 ? '' : 's')), 'tag-cancelled');
}

function rvReviewActions(review) {
  var hidden = String(review.status).toLowerCase() === 'hidden';
  var btns = '';

  if (hidden) {
    btns += '<button type="button" class="btn btn-green" onclick="promptReviewAction(\'review\',\'restore\',null)">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Restore Review</button>';
  } else {
    btns += '<button type="button" class="btn btn-red" onclick="promptReviewAction(\'review\',\'hide\',null)">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>Hide Review</button>';
  }

  btns += '<button type="button" class="btn btn-ghost" onclick="promptReviewAction(\'review\',\'report\',null)">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>Report Review</button>';

  var hint = hidden
    ? 'This review is hidden — it is no longer shown in the app. Restoring makes it public again; the reason is kept in the history.'
    : 'Hiding removes the review from public view without deleting it. Every action is stored with your reason in the moderation history.';

  return '<div class="order-actions">' + btns +
    '<div class="order-actions-hint">' + esc(hint) + '</div></div>';
}

function rvReplyCard(reply, type, reviewId) {
  var hidden = String(reply.status).toLowerCase() === 'hidden';
  var btns = '';
  if (hidden) {
    btns += '<button type="button" class="btn btn-green btn-sm" onclick="promptReviewAction(\'reply\',\'restore\',\'' + rvAttr(reply.id) + '\')">Restore</button>';
  } else {
    btns += '<button type="button" class="btn btn-red btn-sm" onclick="promptReviewAction(\'reply\',\'hide\',\'' + rvAttr(reply.id) + '\')">Hide</button>';
  }
  btns += '<button type="button" class="btn btn-ghost btn-sm" onclick="promptReviewAction(\'reply\',\'report\',\'' + rvAttr(reply.id) + '\')">Report</button>';

  return '<div class="drv-review-card">' +
    '<div class="drv-review-header">' +
      '<span class="drv-review-user">' + esc(reply.userName || 'Anonymous') + '</span>' +
      '<span class="rv-reply-badges">' +
        rvTagForStatus(reply.status) +
        (reply.reportCount ? rvTag(reply.reportCount + ' report' + (reply.reportCount === 1 ? '' : 's'), 'tag-cancelled') : '') +
      '</span>' +
    '</div>' +
    '<div class="drv-review-text">' + esc(reply.text || 'No text') + '</div>' +
    '<div class="drv-review-date">' + fmtDate(reply.createdAt) + '</div>' +
    (reply.moderationReason
      ? '<div class="order-detail-notes" style="margin-top:8px">Reason: ' + esc(reply.moderationReason) + '</div>'
      : '') +
    '<div class="rv-card-acts">' + btns + '</div>' +
  '</div>';
}

function rvReportsSection(reports) {
  if (!reports || !reports.length) return '';
  var inner = '<div class="drv-reviews-list">' + reports.map(function(rp) {
    var open = String(rp.status).toLowerCase() === 'open';
    return '<div class="drv-review-card">' +
      '<div class="drv-review-header">' +
        '<span class="drv-review-user">' +
          (rp.reportedBy ? esc(rp.reportedBy) : 'System') +
          ' · ' + (rp.targetKind === 'reply' ? 'Reply' : 'Review') +
        '</span>' +
        rvTag(open ? 'Open' : 'Resolved', open ? 'tag-cancelled' : 'tag-confirmed') +
      '</div>' +
      '<div class="order-detail-notes" style="margin-top:6px">' + esc(rp.reason || 'No reason given') + '</div>' +
      (rp.description ? '<div class="drv-review-text" style="margin-top:6px">' + esc(rp.description) + '</div>' : '') +
      '<div class="drv-review-date">' + fmtDate(rp.createdAt) +
        (rp.resolvedBy ? ' · resolved by ' + esc(rp.resolvedBy) : '') + '</div>' +
      (rp.resolutionNote ? '<div class="order-detail-notes" style="margin-top:6px">' + esc(rp.resolutionNote) + '</div>' : '') +
      (open
        ? '<div class="rv-card-acts">' +
            '<button type="button" class="btn btn-green btn-sm" onclick="promptResolveReport(\'' + rvAttr(rp.reportId) + '\')">Mark Resolved</button>' +
          '</div>'
        : '') +
    '</div>';
  }).join('') + '</div>';
  return rvSection('Reports (' + reports.length + ')', inner);
}

function rvHistorySection(logs) {
  if (!logs || !logs.length) return '';
  var labels = { hide: 'Hidden', restore: 'Restored', report: 'Reported', resolve: 'Report resolved' };
  var inner = '<div class="um-rows">' + logs.map(function(h) {
    return '<div class="um-row">' +
      '<div class="um-row-main">' +
        '<div class="um-row-title">' + esc((labels[h.action] || h.action) + ' ' + (h.targetKind === 'reply' ? 'reply' : 'review')) + '</div>' +
        '<div class="um-row-sub">' + esc(h.reason || 'No reason recorded') + (h.actor ? ' · ' + esc(h.actor) : '') + '</div>' +
      '</div>' +
      '<div class="um-row-side">' +
        '<div class="um-row-meta">' + fmtDate(h.createdAt) + '</div>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
  return rvSection('Moderation History', inner);
}

function renderReviewModal() {
  var body = document.getElementById('rvModalBody');
  var d = rvDetail;
  if (!body || !d || !d.review) return;
  var r = d.review;
  var replies = d.replies || [];
  var reports = d.reports || [];
  var logs = d.logs || [];
  var html = '';

  rvSetText('rvModalRef', 'Review #' + r.id + ' · ' + rvTypeLabel(r.type));

  // ── Status row ──
  html += '<div class="order-detail-section"><div class="order-detail-status-row">' +
    rvStatusBadge(r, true) +
    rvTypeTag(r.type) +
    '<span class="drv-rating-stars">' + rvStars(r.rating) + '</span>' +
    rvReportBadge(r.reportCount, r.openReportCount) +
  '</div></div>';

  // ── Review ──
  html += rvSection('Review', rvGrid(
    rvField('User', r.userName) +
    rvField('User ID', r.userId, true) +
    rvField('Rating', r.rating ? r.rating + ' / 5' : 'No rating') +
    rvField('Review ID', r.id) +
    rvField('Type', rvTypeLabel(r.type)) +
    rvField('Reviewed Item', r.targetName || '') +
    rvField('Item ID', r.targetId) +
    rvField('Booking', r.bookingNumber || '') +
    rvField('Submitted', r.createdAt ? fmtDate(r.createdAt) : '') +
    rvField('Last Updated', r.updatedAt ? fmtDate(r.updatedAt) : '')
  ) + '<div class="order-detail-notes" style="margin-top:10px">' + esc(r.text || 'No review text') + '</div>');

  // ── Moderation state ──
  var hidden = String(r.status).toLowerCase() === 'hidden';
  html += rvSection('Moderation Status', rvGrid(
    rvField('Status', hidden ? 'Hidden' : 'Visible') +
    rvField('Hidden By', r.hiddenBy || '') +
    rvField('Hidden At', r.hiddenAt ? fmtDate(r.hiddenAt) : '') +
    rvField('Reason', r.moderationReason || '', true)
  ) || rvEmptyInline('This review has not been moderated yet.'));

  // ── Replies ──
  var repliesInner = replies.length
    ? '<div class="drv-reviews-list">' + replies.map(function(rep) { return rvReplyCard(rep, r.type, r.id); }).join('') + '</div>'
    : rvEmptyInline('No replies on this review yet.');
  html += rvSection('Replies (' + replies.length + ')', repliesInner);

  // ── Reports & history ──
  html += rvReportsSection(reports);
  html += rvHistorySection(logs);

  // ── Actions ──
  html += rvReviewActions(r);

  body.innerHTML = html;
  body.scrollTop = 0;
}

// ─── Moderation actions ────────────────────────────────────────────

function rvActionConfig(kind, action) {
  var subject = kind === 'reply' ? 'reply' : 'review';
  if (action === 'hide') {
    return {
      title: 'Hide ' + subject,
      desc: 'The ' + subject + ' will be removed from public view immediately. Nothing is deleted — it can be restored at any time, and your reason is stored in the moderation history.',
      label: 'Hide',
      requireReason: true,
      btnClass: 'btn btn-red'
    };
  }
  if (action === 'restore') {
    return {
      title: 'Restore ' + subject,
      desc: 'The ' + subject + ' will become publicly visible again. Add a note if you want to record why it is being restored.',
      label: 'Restore',
      requireReason: false,
      btnClass: 'btn btn-green'
    };
  }
  if (action === 'report') {
    return {
      title: 'Report ' + subject,
      desc: 'Raise a moderation report against this ' + subject + '. Reported content is flagged for review in this panel.',
      label: 'Report',
      requireReason: true,
      btnClass: 'btn btn-accent'
    };
  }
  if (action === 'resolve') {
    return {
      title: 'Resolve Report',
      desc: 'Close this report. Add a note describing how it was handled.',
      label: 'Resolve',
      requireReason: false,
      btnClass: 'btn btn-green'
    };
  }
  return null;
}

function promptReviewAction(kind, action, replyId) {
  if (!rvDetail || !rvActive) return;
  var cfg = rvActionConfig(kind, action);
  if (!cfg) return;
  rvPendingAction = { kind: kind, action: action, replyId: replyId || null, reportId: null };
  rvShowReasonModal(cfg);
}

function promptResolveReport(reportId) {
  if (!rvDetail || !rvActive) return;
  var cfg = rvActionConfig('report', 'resolve');
  if (!cfg) return;
  rvPendingAction = { kind: 'report', action: 'resolve', replyId: null, reportId: reportId };
  rvShowReasonModal(cfg);
}

function rvShowReasonModal(cfg) {
  var title = document.getElementById('rv-reason-title');
  var desc = document.getElementById('rv-reason-desc');
  var label = document.getElementById('rv-reason-label');
  var confirmLabel = document.getElementById('rv-reason-confirm-label');
  var btn = document.getElementById('rv-reason-confirm');
  var ta = document.getElementById('rv-reason');
  var err = document.getElementById('rv-reason-err');

  if (title) title.textContent = cfg.title;
  if (desc) desc.textContent = cfg.desc;
  if (label) label.textContent = cfg.requireReason ? 'Reason *' : 'Reason (optional)';
  if (confirmLabel) confirmLabel.textContent = cfg.label;
  if (btn) {
    btn.className = cfg.btnClass;
    btn.disabled = false;
  }
  if (ta) ta.value = '';
  if (err) err.textContent = '';

  var modal = document.getElementById('rvReasonModal');
  if (modal) modal.classList.add('on');
  setTimeout(function() { if (ta) ta.focus(); }, 200);
}

function closeReviewReason() {
  var modal = document.getElementById('rvReasonModal');
  if (modal) modal.classList.remove('on');
  rvPendingAction = null;
}

async function submitReviewReason() {
  if (rvActionBusy || !rvPendingAction || !rvActive) return;
  var cfg = rvActionConfig(rvPendingAction.kind, rvPendingAction.action);
  var ta = document.getElementById('rv-reason');
  var err = document.getElementById('rv-reason-err');
  var btn = document.getElementById('rv-reason-confirm');
  var reason = ta ? String(ta.value || '').trim() : '';

  if (cfg && cfg.requireReason && reason.length < 3) {
    if (err) err.textContent = 'Please give a reason (at least 3 characters).';
    return;
  }
  if (reason.length > 500) {
    if (err) err.textContent = 'Reason must be 500 characters or less.';
    return;
  }

  var path;
  if (rvPendingAction.kind === 'report') {
    path = '/reviews/reports/' + encodeURIComponent(rvPendingAction.reportId) + '/resolve';
  } else {
    var base = '/reviews/' + encodeURIComponent(rvActive.type) + '/' + encodeURIComponent(rvActive.id);
    path = rvPendingAction.kind === 'reply'
      ? base + '/replies/' + encodeURIComponent(rvPendingAction.replyId) + '/' + rvPendingAction.action
      : base + '/' + rvPendingAction.action;
  }

  rvActionBusy = true;
  if (btn) btn.disabled = true;
  try {
    var res = await api('POST', path, { reason: reason });
    closeReviewReason();
    toast(res.message || 'Moderation action saved', true);
    await reloadReviewDetails();
    loadReviews(true);
  } catch (e) {
    if (err) err.textContent = e.message;
    toast('Error: ' + e.message, false);
  } finally {
    rvActionBusy = false;
    if (btn) btn.disabled = false;
  }
}

// ─── Backdrop / ESC closing ────────────────────────────────────────

document.addEventListener('click', function(e) {
  var reason = document.getElementById('rvReasonModal');
  if (reason && e.target === reason) { closeReviewReason(); return; }
  var modal = document.getElementById('rvModal');
  if (modal && e.target === modal) closeReviewModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var reason = document.getElementById('rvReasonModal');
  if (reason && reason.classList.contains('on')) { closeReviewReason(); return; }
  var modal = document.getElementById('rvModal');
  if (modal && modal.classList.contains('on')) closeReviewModal();
});
