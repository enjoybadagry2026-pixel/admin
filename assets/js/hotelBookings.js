// ═══════════════ HOTEL BOOKINGS (Hotels panel → Bookings tab) ═══════════════
// Stay reservations made by app users (wallet paid).
// Backed by GET  /api/admin/hotel-bookings            (paginated, searchable, filterable)
//          GET  /api/admin/hotel-bookings/:ref        (details + wallet transactions)
//          POST /api/admin/hotel-bookings/:ref/<action>  (confirm | checkin | complete | decline | cancel)

var hbState = { page: 1, limit: 20, q: '', status: '', payment: '', hotelId: '', from: '', to: '', loaded: false, loading: false };
var hbListData = [];
var hbPagination = null;
var hbStats = null;
var hbSearchTimer = null;
var hbActiveTab = 'properties';
var hbActiveRef = null;
var hbActiveBooking = null;
var hbActiveExtra = null;
var hbPendingAction = null;
var hbActionBusy = false;
var hbBookingCountText = '0 bookings';

function hbSetText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function hbAttr(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hbCapitalize(s) {
  s = String(s || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ─── Tabs (Properties | Bookings) ──────────────

function hotelSwitchTab(tab) {
  hbActiveTab = tab === 'bookings' ? 'bookings' : 'properties';

  document.querySelectorAll('[data-hotel-tab]').forEach(function(b) {
    b.classList.toggle('on', b.getAttribute('data-hotel-tab') === hbActiveTab);
  });

  var panes = {
    properties: document.getElementById('hotel-pane-properties'),
    bookings: document.getElementById('hotel-pane-bookings')
  };
  var actions = {
    properties: document.getElementById('htl-actions-properties'),
    bookings: document.getElementById('htl-actions-bookings')
  };
  Object.keys(panes).forEach(function(k) {
    if (panes[k]) panes[k].style.display = k === hbActiveTab ? '' : 'none';
    if (actions[k]) actions[k].style.display = k === hbActiveTab ? '' : 'none';
  });

  applyHotelHeaderCount();
  if (hbActiveTab === 'bookings') loadHotelBookings();
}

// Keeps the panel header (title + count) in sync with the visible tab.
// renderHotels() in hotels.js updates hotelCountText and calls this too.
function applyHotelHeaderCount() {
  var titleEl = document.getElementById('hotel-tab-title');
  var countEl = document.getElementById('h-count');
  if (hbActiveTab === 'bookings') {
    if (titleEl) titleEl.textContent = 'Hotel Bookings';
    if (countEl) countEl.textContent = hbBookingCountText;
  } else {
    if (titleEl) titleEl.textContent = 'Hotels';
    if (countEl) countEl.textContent = (typeof hotelCountText !== 'undefined' && hotelCountText) ? hotelCountText : '0 hotels';
  }
}

// ─── Status / payment badges (existing order-* design system) ───

function hbStatusClass(status) {
  var l = String(status || '').toLowerCase();
  if (l.indexOf('pending') >= 0) return 'order-status-pending';
  if (l.indexOf('confirm') >= 0) return 'order-status-confirmed';
  if (l.indexOf('check') >= 0) return 'order-status-ontheway';
  if (l.indexOf('complete') >= 0) return 'order-status-completed';
  if (l.indexOf('declin') >= 0) return 'order-status-declined';
  if (l.indexOf('cancel') >= 0) return 'order-status-cancelled';
  if (l.indexOf('refund') >= 0) return 'order-status-preparing';
  return 'order-status-pending';
}

function hbStatusBadge(bk, large) {
  return '<span class="order-card-status ' + hbStatusClass(bk && bk.status) + '"' +
    (large ? ' style="font-size:12px;padding:5px 14px"' : '') + '>' +
    esc((bk && bk.status) || 'Pending Confirmation') + '</span>';
}

function hbPaymentClass(key) {
  var k = String(key || '').toLowerCase();
  if (k === 'completed' || k === 'success' || k === 'successful') return 'order-status-delivered';
  if (k === 'refunded') return 'order-status-preparing';
  if (k === 'failed' || k === 'expired' || k === 'cancelled' || k === 'reversed') return 'order-status-cancelled';
  return 'order-status-pending';
}

function hbPaymentBadge(bk, large) {
  var label = (bk && bk.paymentStatus) || 'Pending';
  var key = (bk && bk.paymentStatusKey) || 'pending';
  return '<span class="order-card-status ' + hbPaymentClass(key) + '"' +
    (large ? ' style="font-size:12px;padding:5px 14px"' : '') + '>' +
    esc(label) + '</span>';
}

function hbTag(label, cls) {
  return '<span class="tag ' + (cls || 'tag-pending') + '">' + esc(label || '—') + '</span>';
}

// ─── List ──────────────────────────────────────

function hbListPath() {
  var p = '/hotel-bookings?page=' + hbState.page + '&limit=' + hbState.limit;
  if (hbState.q) p += '&q=' + encodeURIComponent(hbState.q);
  if (hbState.status) p += '&status=' + encodeURIComponent(hbState.status);
  if (hbState.payment) p += '&paymentStatus=' + encodeURIComponent(hbState.payment);
  if (hbState.hotelId) p += '&hotelId=' + encodeURIComponent(hbState.hotelId);
  if (hbState.from) p += '&from=' + encodeURIComponent(hbState.from);
  if (hbState.to) p += '&to=' + encodeURIComponent(hbState.to);
  return p;
}

function hbShowListState(state, message) {
  var loading = document.getElementById('hb-loading');
  var error = document.getElementById('hb-error');
  var list = document.getElementById('hb-list');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') hbSetText('hb-error-text', message || 'Something went wrong');
  }
  if (list) list.style.display = state === 'loading' || state === 'error' ? 'none' : '';
}

function hbHasFilters() {
  return !!(hbState.q || hbState.status || hbState.payment || hbState.hotelId || hbState.from || hbState.to);
}

function loadHotelBookings(force) {
  if (hbState.loading) return;
  if (!force && hbState.loaded) return;
  hbState.loading = true;
  hbShowListState('loading');
  hbSetText('hb-hint', '');

  api('GET', hbListPath()).then(function(res) {
    hbListData = (res.data && res.data.bookings) || [];
    hbStats = (res.data && res.data.stats) || null;
    hbPagination = res.pagination || null;
    hbState.loaded = true;
    hbShowListState('ready');
    hbRenderStats();
    hbRenderHotelFilter((res.data && res.data.hotels) || []);
    renderHotelBookings();
  }).catch(function(e) {
    hbShowListState('error', e.message);
    toast('Error: ' + e.message, false);
  }).finally(function() {
    hbState.loading = false;
  });
}

function hbRenderStats() {
  if (!hbStats) return;
  hbSetText('hb-s-total', Number(hbStats.total || 0).toLocaleString());
  hbSetText('hb-s-pending', Number(hbStats.pending || 0).toLocaleString());
  hbSetText('hb-s-active', Number(hbStats.active || 0).toLocaleString());
  hbSetText('hb-s-revenue', fmtNaira(hbStats.paidRevenue || 0));

  var badge = document.getElementById('hb-pending-badge');
  if (badge) {
    var pending = Number(hbStats.pending || 0);
    badge.style.display = pending > 0 ? '' : 'none';
    badge.textContent = pending > 99 ? '99+' : String(pending);
  }
}

function hbRenderHotelFilter(hotels) {
  var sel = document.getElementById('hb-hotel-filter');
  if (!sel || !hotels || !hotels.length) return;
  var current = hbState.hotelId ? String(hbState.hotelId) : '';
  var found = false;
  var html = '<option value="">All Hotels</option>';
  hotels.forEach(function(h) {
    var id = String(h.id || '');
    if (!id) return;
    if (id === current) found = true;
    html += '<option value="' + esc(id) + '"' + (id === current ? ' selected' : '') + '>' +
      esc(h.name || id) + '</option>';
  });
  if (current && !found) {
    hbState.hotelId = '';
    html = '<option value="">All Hotels</option>' + hotels.map(function(h) {
      var id = String(h.id || '');
      return id ? '<option value="' + esc(id) + '">' + esc(h.name || id) + '</option>' : '';
    }).join('');
  }
  sel.innerHTML = html;
}

function hbMetaItem(icon, text) {
  return '<span class="order-card-meta-item">' + icon + esc(text) + '</span>';
}

function renderHotelBookings() {
  var el = document.getElementById('hb-list');
  if (!el) return;
  var html = '';

  (hbListData || []).forEach(function(bk) {
    var ref = bk.bookingReference || bk.reference || ('#' + bk.id);
    var guestName = (bk.guest && bk.guest.name) || (bk.customer && bk.customer.name) || 'Guest';
    var dates = (bk.checkIn || '') + (bk.checkOut ? ' → ' + bk.checkOut : '');
    var stayBits = [];
    if (bk.rooms) stayBits.push(bk.rooms + ' room' + (bk.rooms === 1 ? '' : 's'));
    if (bk.guests) stayBits.push(bk.guests + ' guest' + (bk.guests === 1 ? '' : 's'));

    var icoCard = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';
    var icoUser = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    var icoCal = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    var icoBed = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>';
    var icoClock = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

    html += '<div class="order-card" onclick="openHotelBookingModal(\'' + hbAttr(ref) + '\')">' +
      '<div class="order-card-header">' +
        '<span class="order-card-ref">' + esc(ref) + '</span>' +
        hbStatusBadge(bk) +
      '</div>' +
      '<div class="order-card-body">' +
        '<div class="order-card-restaurant">' + esc(bk.hotelName || 'Hotel') + '</div>' +
        '<div class="order-card-meta">' +
          hbMetaItem(icoUser, guestName) +
          (dates !== '→' && dates !== '' ? hbMetaItem(icoCal, dates) : '') +
          (bk.nights ? hbMetaItem(icoClock, bk.nights + ' night' + (bk.nights === 1 ? '' : 's')) : '') +
          (stayBits.length ? hbMetaItem(icoBed, stayBits.join(' · ')) : '') +
          hbMetaItem(icoCard, bk.paymentStatus || 'Pending') +
        '</div>' +
        (bk.roomType ? '<div class="hotel-card-tags"><span class="tag tag-feat">' + esc(bk.roomType) + '</span></div>' : '') +
      '</div>' +
      '<div class="order-card-footer">' +
        '<span class="order-card-total">' + (bk.totalAmount !== null && bk.totalAmount !== undefined ? fmtNaira(bk.totalAmount) : '—') + '</span>' +
        '<span class="order-card-date">' + fmtDate(bk.createdAt) + '</span>' +
      '</div>' +
    '</div>';
  });

  if (!html) {
    var hasFilters = hbHasFilters();
    html = '<div class="rd-empty">' +
      '<div class="rd-empty-icon">' + (hasFilters ? '🔍' : '🏨') + '</div>' +
      '<div class="rd-empty-title">' + (hasFilters ? 'No bookings match your search' : 'No bookings yet') + '</div>' +
      '<div class="rd-empty-text">' +
        (hasFilters
          ? 'Try a different search term or clear the filters below.'
          : 'Hotel bookings from guests will appear here as soon as they are made.') +
      '</div>' +
    '</div>';
  }
  el.innerHTML = html;

  var total = hbPagination ? hbPagination.total : (hbListData || []).length;
  hbBookingCountText = total + ' booking' + (total === 1 ? '' : 's');
  if (hbActiveTab === 'bookings') hbSetText('h-count', hbBookingCountText);

  if (total) {
    var start = (hbState.page - 1) * hbState.limit + 1;
    var end = Math.min(total, start + (hbListData || []).length - 1);
    hbSetText('hb-hint', start === end ? String(total) : start + '–' + end + ' of ' + total);
  } else {
    hbSetText('hb-hint', '');
  }

  var clear = document.getElementById('hb-clear');
  if (clear) clear.style.display = hbHasFilters() ? '' : 'none';

  hbRenderPagination();
}

function hbRenderPagination() {
  var el = document.getElementById('hb-pagination');
  if (!el) return;
  var pg = hbPagination;
  if (!pg || !pg.totalPages || pg.totalPages <= 1) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  el.innerHTML =
    '<button class="btn btn-ghost btn-sm" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="hbGoPage(' + (pg.page - 1) + ')">Prev</button>' +
    '<span class="um-page-info">Page ' + pg.page + ' of ' + pg.totalPages + '</span>' +
    '<button class="btn btn-ghost btn-sm" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="hbGoPage(' + (pg.page + 1) + ')">Next</button>';
}

function hbGoPage(page) {
  hbState.page = page;
  loadHotelBookings(true);
  var el = document.getElementById('hb-list');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// ─── Search / filters ─────────────────────────

function onHotelBookingSearch(v) {
  if (hbSearchTimer) clearTimeout(hbSearchTimer);
  hbSearchTimer = setTimeout(function() {
    hbState.q = String(v || '').trim();
    hbState.page = 1;
    loadHotelBookings(true);
  }, 300);
}

function filterHotelBookings() {
  var status = document.getElementById('hb-status-filter');
  var payment = document.getElementById('hb-payment-filter');
  var hotel = document.getElementById('hb-hotel-filter');
  var from = document.getElementById('hb-from');
  var to = document.getElementById('hb-to');
  hbState.status = status ? status.value : '';
  hbState.payment = payment ? payment.value : '';
  hbState.hotelId = hotel ? hotel.value : '';
  hbState.from = from && /^\d{4}-\d{2}-\d{2}$/.test(from.value) ? from.value : '';
  hbState.to = to && /^\d{4}-\d{2}-\d{2}$/.test(to.value) ? to.value : '';
  if (hbState.from && hbState.to && hbState.from > hbState.to) {
    toast('From date must be before the To date', false);
    return;
  }
  hbState.page = 1;
  loadHotelBookings(true);
}

function clearHotelBookingFilters() {
  hbState.q = '';
  hbState.status = '';
  hbState.payment = '';
  hbState.hotelId = '';
  hbState.from = '';
  hbState.to = '';
  hbState.page = 1;
  var search = document.getElementById('hb-search');
  if (search) search.value = '';
  ['hb-status-filter', 'hb-payment-filter', 'hb-hotel-filter'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var from = document.getElementById('hb-from');
  var to = document.getElementById('hb-to');
  if (from) from.value = '';
  if (to) to.value = '';
  loadHotelBookings(true);
}

// ─── Modal helpers ────────────────────────────

function hbField(label, value, wide) {
  if (value === null || value === undefined || value === '') return '';
  return '<div class="order-detail-field' + (wide ? ' order-detail-field-wide' : '') + '">' +
    '<div class="order-detail-field-label">' + esc(label) + '</div>' +
    '<div class="order-detail-field-value">' + esc(String(value)) + '</div>' +
  '</div>';
}

function hbSection(label, inner) {
  if (!inner) return '';
  return '<div class="order-detail-section">' +
    '<div class="order-detail-label">' + esc(label) + '</div>' +
    inner +
  '</div>';
}

function hbGrid(fields) {
  return '<div class="order-detail-grid">' + fields + '</div>';
}

function hbEmptyInline(text) {
  return '<div class="drv-empty-inline">' +
    '<div class="drv-empty-inline-icon">🛈</div>' +
    '<div class="drv-empty-inline-text">' + esc(text) + '</div>' +
  '</div>';
}

function hbChargeRow(label, value, cls) {
  return '<div class="order-detail-charge-row' + (cls ? ' ' + cls : '') + '">' +
    '<span class="order-detail-charge-label">' + esc(label) + '</span>' +
    '<span class="order-detail-charge-value">' + esc(value) + '</span>' +
  '</div>';
}

// ─── Booking Details modal ────────────────────

function openHotelBookingModal(ref) {
  hbActiveRef = ref;
  hbActiveBooking = null;
  hbActiveExtra = null;
  var modal = document.getElementById('hbModal');
  var body = document.getElementById('hbModalBody');
  if (!modal || !body) return;
  hbSetText('hbModalTitle', 'Booking Details');
  hbSetText('hbModalRef', ref);
  body.innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading booking details...</div></div>';
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';

  api('GET', '/hotel-bookings/' + encodeURIComponent(ref)).then(function(res) {
    if (hbActiveRef !== ref) return;
    hbActiveBooking = res.data && res.data.booking;
    hbActiveExtra = { transactions: (res.data && res.data.transactions) || [] };
    if (!hbActiveBooking) throw new Error('Booking not found');
    renderHotelBookingModal();
  }).catch(function(e) {
    if (hbActiveRef !== ref) return;
    body.innerHTML = '<div class="drv-error">' +
      '<div class="drv-error-icon">⚠️</div>' +
      '<div class="drv-error-title">Failed to load booking details</div>' +
      '<div class="drv-error-text">' + esc(e.message) + '</div>' +
      '<button class="btn btn-accent btn-sm" onclick="reloadHotelBookingDetails()">Retry</button>' +
    '</div>';
    toast('Error: ' + e.message, false);
  });
}

function reloadHotelBookingDetails() {
  if (hbActiveRef) openHotelBookingModal(hbActiveRef);
}

function closeHotelBookingModal() {
  var modal = document.getElementById('hbModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  hbActiveRef = null;
  hbActiveBooking = null;
  hbActiveExtra = null;
}

function hbActionButtons(bk) {
  var btns = '';
  var hint = '';
  var k = bk.statusKey || 'pending';

  var icoCheck = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var icoX = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var icoKey = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
  var icoCheckCircle = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

  if (k === 'pending') {
    btns += '<button type="button" class="btn btn-green" onclick="runHotelBookingAction(\'confirm\', this)">' + icoCheck + 'Confirm Booking</button>';
    btns += '<button type="button" class="btn btn-red" onclick="promptHotelBookingAction(\'decline\')">' + icoX + 'Decline</button>';
    btns += '<button type="button" class="btn btn-ghost" onclick="promptHotelBookingAction(\'cancel\')">Cancel</button>';
    hint = 'Confirm to secure the stay, or decline / cancel with a reason — any payment is refunded to the guest\'s wallet automatically.';
  } else if (k === 'confirmed') {
    btns += '<button type="button" class="btn btn-accent" onclick="runHotelBookingAction(\'checkin\', this)">' + icoKey + 'Check In Guest</button>';
    btns += '<button type="button" class="btn btn-ghost" onclick="promptHotelBookingAction(\'cancel\')">Cancel Booking</button>';
    hint = 'Check the guest in on arrival, or cancel with a reason (payment is refunded automatically).';
  } else if (k === 'checkedin') {
    btns += '<button type="button" class="btn btn-green" onclick="runHotelBookingAction(\'complete\', this)">' + icoCheckCircle + 'Complete Stay</button>';
    hint = 'Mark the stay complete once the guest checks out.';
  } else if (k === 'declined' || k === 'cancelled') {
    hint = 'This booking was ' + (k === 'declined' ? 'declined' : 'cancelled') +
      (bk.refund ? '. The payment was refunded to the guest\'s wallet.' : '. The reason is shown above.');
  } else if (k === 'completed') {
    hint = 'This stay has been completed.';
  }

  if (!btns && !hint) return '';
  return '<div class="order-actions">' + btns +
    (hint ? '<div class="order-actions-hint">' + esc(hint) + '</div>' : '') +
  '</div>';
}

function renderHotelBookingModal() {
  var body = document.getElementById('hbModalBody');
  var bk = hbActiveBooking;
  if (!body || !bk) return;
  var extra = hbActiveExtra || {};
  var html = '';

  hbSetText('hbModalRef', bk.bookingReference || bk.reference || ('#' + bk.id));

  var tl = bk.timeline || {};

  // ── Status ──
  html += '<div class="order-detail-section"><div class="order-detail-status-row">' +
    hbStatusBadge(bk, true) +
    hbPaymentBadge(bk, true) +
    (bk.roomType ? hbTag(bk.roomType, 'tag-feat') : '') +
    (bk.nights ? hbTag(bk.nights + ' night' + (bk.nights === 1 ? '' : 's'), 'tag-pending') : '') +
    (bk.rooms ? hbTag(bk.rooms + ' room' + (bk.rooms === 1 ? '' : 's'), 'tag-pending') : '') +
  '</div></div>';

  // ── Guest ──
  var guest = bk.guest || {};
  var customer = bk.customer || {};
  html += hbSection('Guest', hbGrid(
    hbField('Guest Name', guest.name || customer.name || '') +
    hbField('Phone', guest.phone || customer.phone || '') +
    hbField('Email', guest.email || customer.email || '') +
    hbField('Account Status', customer.accountStatus ? hbCapitalize(customer.accountStatus) : '') +
    hbField('User ID', bk.userId || customer.id || '', true)
  ) || hbEmptyInline('No guest record found for this booking.'));

  // ── Stay ──
  var hotel = bk.hotel || {};
  html += hbSection('Stay', hbGrid(
    hbField('Hotel', bk.hotelName || hotel.name || '') +
    hbField('Category', hotel.category || '') +
    hbField('Room Type', bk.roomType || guest.roomType || '') +
    hbField('Check-in', bk.checkIn || '') +
    hbField('Check-out', bk.checkOut || '') +
    hbField('Nights', bk.nights !== null && bk.nights !== undefined ? bk.nights : '') +
    hbField('Rooms', bk.rooms !== null && bk.rooms !== undefined ? bk.rooms : '') +
    hbField('Guests', bk.guests !== null && bk.guests !== undefined ? bk.guests : '') +
    hbField('Hotel Check-in Time', hotel.checkInTime || '') +
    hbField('Hotel Check-out Time', hotel.checkOutTime || '') +
    hbField('Address', hotel.address || '', true) +
    hbField('Special Requests', guest.specialRequests || bk.notes || '', true)
  ));

  // ── Payment ──
  var charges = '<div class="order-detail-charges">' +
    hbChargeRow('Rate per night', fmtNaira(bk.ratePerNight)) +
    hbChargeRow('Nights × ' + (bk.nights || 1), fmtNaira(bk.subtotal)) +
    (bk.serviceFee ? hbChargeRow('Service fee', fmtNaira(bk.serviceFee)) : '') +
    hbChargeRow('Total paid', fmtNaira(bk.totalAmount), 'is-total') +
  '</div>';

  var p = bk.payment || {};
  charges += '<div class="order-detail-status-row" style="margin:10px 0">' + hbPaymentBadge(bk, true) + '</div>';
  charges += hbGrid(
    hbField('Payment Method', p.method || bk.paymentMethod || 'wallet') +
    hbField('Currency', p.currency || 'NGN') +
    hbField('Transaction ID', p.transactionId || bk.walletTransactionId || '') +
    hbField('Paid At', p.paidAt ? fmtDate(p.paidAt) : '') +
    hbField('Balance Before', bk.balanceBefore !== null && bk.balanceBefore !== undefined ? fmtNaira(bk.balanceBefore) : '') +
    hbField('Balance After', bk.balanceAfter !== null && bk.balanceAfter !== undefined ? fmtNaira(bk.balanceAfter) : '') +
    hbField('Reference', bk.bookingReference || bk.reference || '', true)
  );

  if (bk.refund) {
    charges += hbGrid(
      hbField('Refund Transaction', bk.refund.transactionId || '') +
      hbField('Refund Amount', bk.refund.amount !== null && bk.refund.amount !== undefined ? fmtNaira(bk.refund.amount) : '') +
      hbField('Refunded At', bk.refund.refundedAt ? fmtDate(bk.refund.refundedAt) : '')
    );
  }

  var txs = extra.transactions || [];
  if (txs.length) {
    charges += '<div class="um-rows" style="margin-top:10px">' + txs.map(function(t) {
      var txCls = 'tag-pending';
      var txKey = String(t.status || '').toLowerCase();
      if (txKey === 'completed' || txKey === 'success') txCls = 'tag-confirmed';
      else if (txKey === 'failed' || txKey === 'expired' || txKey === 'cancelled') txCls = 'tag-cancelled';
      else if (txKey === 'refunded' || t.type === 'hotel_booking_refund') txCls = 'tag-preparing';
      return '<div class="um-row">' +
        '<div class="um-row-main">' +
          '<div class="um-row-title">' + esc(t.description || t.type || t.transactionId) + '</div>' +
          '<div class="um-row-sub">' + esc(t.transactionId) + (t.createdAt ? ' · ' + fmtDate(t.createdAt) : '') + '</div>' +
        '</div>' +
        '<div class="um-row-side">' +
          '<div class="um-row-amount' + (t.type === 'hotel_booking_refund' ? '' : ' um-amount-in') + '">' + fmtNaira(t.amount) + '</div>' +
          '<div class="um-row-meta">' + hbTag(t.status ? hbCapitalize(t.status) : '—', txCls) + '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }
  html += hbSection('Payment', charges);

  // ── Reasons ──
  if (bk.declineReason) {
    html += hbSection('Declined',
      '<div class="order-detail-notes">' + esc(bk.declineReason) + '</div>');
  }
  if (bk.cancelReason) {
    html += hbSection('Cancelled',
      '<div class="order-detail-notes">' + esc(bk.cancelReason) + '</div>');
  }

  // ── Activity timeline ──
  var history = bk.statusHistory || [];
  if (history.length) {
    html += hbSection('Activity', '<div class="um-rows">' + history.map(function(h) {
      return '<div class="um-row">' +
        '<div class="um-row-main">' +
          '<div class="um-row-title">' + esc(h.status) + '</div>' +
          '<div class="um-row-sub">' + (h.timestamp ? fmtDate(h.timestamp) : '—') + '</div>' +
        '</div>' +
        '<div class="um-row-side">' +
          '<div class="um-row-meta">' + (h.active
            ? hbTag('Current', 'tag-confirmed')
            : (h.completed ? hbTag('Done', 'tag-feat') : hbTag('Waiting', 'tag-pending'))) + '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>');
  }

  // ── Timestamps ──
  html += hbSection('Important Timestamps', hbGrid(
    hbField('Booked At', bk.createdAt ? fmtDate(bk.createdAt) : '') +
    hbField('Confirmed At', tl.confirmedAt ? fmtDate(tl.confirmedAt) : '') +
    hbField('Checked In At', tl.checkedInAt ? fmtDate(tl.checkedInAt) : '') +
    hbField('Completed At', tl.completedAt ? fmtDate(tl.completedAt) : '') +
    hbField('Declined At', tl.declinedAt ? fmtDate(tl.declinedAt) : '') +
    hbField('Cancelled At', tl.cancelledAt ? fmtDate(tl.cancelledAt) : '') +
    hbField('Last Updated', bk.updatedAt ? fmtDate(bk.updatedAt) : '')
  ));

  // ── Actions ──
  html += hbActionButtons(bk);

  body.innerHTML = html || hbEmptyInline('No booking information available.');
  body.scrollTop = 0;
}

// ─── Status actions ───────────────────────────

async function runHotelBookingAction(action, btn) {
  if (hbActionBusy || !hbActiveRef) return;
  hbActionBusy = true;
  if (btn) btn.disabled = true;
  try {
    var res = await api('POST', '/hotel-bookings/' + encodeURIComponent(hbActiveRef) + '/' + action);
    toast(res.message || 'Booking updated', true);
    await reloadHotelBookingDetails();
    loadHotelBookings(true);
  } catch (e) {
    toast('Error: ' + e.message, false);
    if (btn) btn.disabled = false;
  } finally {
    hbActionBusy = false;
  }
}

function promptHotelBookingAction(action) {
  if (!hbActiveBooking) return;
  hbPendingAction = action;
  var isDecline = action === 'decline';
  var title = document.getElementById('hb-reason-title');
  var desc = document.getElementById('hb-reason-desc');
  var label = document.getElementById('hb-reason-confirm-label');
  var ta = document.getElementById('hb-reason');
  var err = document.getElementById('hb-reason-err');
  if (title) title.textContent = isDecline ? 'Decline Booking' : 'Cancel Booking';
  if (desc) desc.textContent = isDecline
    ? 'Explain why this booking cannot go ahead. The guest is notified with this reason and any payment is refunded to their wallet.'
    : 'Explain why this booking is being cancelled. The guest is notified with this reason and any payment is refunded to their wallet.';
  if (label) label.textContent = isDecline ? 'Decline Booking' : 'Cancel Booking';
  if (ta) ta.value = '';
  if (err) err.textContent = '';
  var modal = document.getElementById('hbReasonModal');
  if (modal) modal.classList.add('on');
  setTimeout(function() { if (ta) ta.focus(); }, 200);
}

function closeHotelBookingReason() {
  var modal = document.getElementById('hbReasonModal');
  if (modal) modal.classList.remove('on');
  hbPendingAction = null;
}

async function submitHotelBookingReason() {
  if (hbActionBusy || !hbPendingAction || !hbActiveRef) return;
  var ta = document.getElementById('hb-reason');
  var err = document.getElementById('hb-reason-err');
  var btn = document.getElementById('hb-reason-confirm');
  var reason = ta ? String(ta.value || '').trim() : '';
  if (reason.length < 3) {
    if (err) err.textContent = 'Please give a reason (at least 3 characters).';
    return;
  }
  hbActionBusy = true;
  if (btn) btn.disabled = true;
  try {
    var res = await api('POST',
      '/hotel-bookings/' + encodeURIComponent(hbActiveRef) + '/' + hbPendingAction,
      { reason: reason });
    closeHotelBookingReason();
    toast(res.message || 'Booking updated', true);
    await reloadHotelBookingDetails();
    loadHotelBookings(true);
  } catch (e) {
    if (err) err.textContent = e.message;
    toast('Error: ' + e.message, false);
  } finally {
    hbActionBusy = false;
    if (btn) btn.disabled = false;
  }
}

// ─── Backdrop / ESC closing ───────────────────

document.addEventListener('click', function(e) {
  var reason = document.getElementById('hbReasonModal');
  if (reason && e.target === reason) { closeHotelBookingReason(); return; }
  var modal = document.getElementById('hbModal');
  if (modal && e.target === modal) closeHotelBookingModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var reason = document.getElementById('hbReasonModal');
  if (reason && reason.classList.contains('on')) { closeHotelBookingReason(); return; }
  var modal = document.getElementById('hbModal');
  if (modal && modal.classList.contains('on')) closeHotelBookingModal();
});
