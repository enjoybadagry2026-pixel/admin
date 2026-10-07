// ═══════════════ RIDES (GLOBAL) ═══════════════
// Global list of every ride booking on the platform.
// Backed by GET /api/admin/rides (paginated, searchable, filterable).

var rdState = { q: '', status: '', payment: '', vehicle: '', from: '', to: '', loaded: false, loading: false };
var rdListData = [];
var rdPagination = null;
var rdStats = null;
var rdSearchTimer = null;
var rdActiveRideId = null;
var rdActiveRide = null;
var rdActiveRideExtra = null;

// Server sort keys accepted by GET /rides (see the backend parseSort map).
var RIDE_SORT_OPTIONS = [
  { value: 'created', label: 'Date' },
  { value: 'fare', label: 'Fare' },
  { value: 'status', label: 'Status' },
  { value: 'driver', label: 'Driver' },
  { value: 'user', label: 'Customer' },
  { value: 'reference', label: 'Booking number' }
];

function rdSetText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function rdAttr(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function rdCapitalize(s) {
  s = String(s || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ─── Status / payment badges (existing order-* design system) ───

function rdStatusClass(status) {
  var l = String(status || '').toLowerCase();
  if (l.indexOf('trip completed') >= 0 || l === 'completed') return 'order-status-completed';
  if (l.indexOf('cancel') >= 0) return 'order-status-cancelled';
  if (l.indexOf('passenger picked up') >= 0) return 'order-status-processing';
  if (l.indexOf('arrived at pickup') >= 0) return 'order-status-ontheway';
  if (l.indexOf('driver arriving') >= 0) return 'order-status-assigned';
  if (l.indexOf('pending') >= 0) return 'order-status-pending';
  return 'order-status-pending';
}

function rdStatusBadge(status, large) {
  return '<span class="order-card-status ' + rdStatusClass(status) + '"' +
    (large ? ' style="font-size:12px;padding:5px 14px"' : '') + '>' +
    esc(status || 'Unknown') + '</span>';
}

function rdPaymentClass(key) {
  var k = String(key || '').toLowerCase();
  if (k === 'completed') return 'order-status-delivered';
  if (k === 'refunded') return 'order-status-preparing';
  if (k === 'failed' || k === 'expired' || k === 'cancelled' || k === 'reversed') return 'order-status-cancelled';
  return 'order-status-pending';
}

function rdPaymentBadge(ride, large) {
  var label = (ride && ride.paymentStatus) || 'Pending';
  var key = (ride && ride.paymentStatusKey) || 'pending';
  return '<span class="order-card-status ' + rdPaymentClass(key) + '"' +
    (large ? ' style="font-size:12px;padding:5px 14px"' : '') + '>' +
    esc(label) + '</span>';
}

function rdTag(label, cls) {
  return '<span class="tag ' + (cls || 'tag-pending') + '">' + esc(label || '—') + '</span>';
}

function rdPaymentTag(ride) {
  var key = String((ride && ride.paymentStatusKey) || 'pending').toLowerCase();
  var cls = 'tag-pending';
  if (key === 'completed') cls = 'tag-confirmed';
  else if (key === 'refunded') cls = 'tag-preparing';
  else if (key === 'failed' || key === 'expired' || key === 'cancelled' || key === 'reversed') cls = 'tag-cancelled';
  return rdTag((ride && ride.paymentStatus) || 'Pending', cls);
}

// ─── List ──────────────────────────────────────

function rdListKit() {
  return kitList('rides', { limit: 20, sort: 'created', dir: 'desc' });
}

function rdRidePath() {
  var s = rdListKit();
  var p = '/rides?page=' + s.page + '&limit=' + s.limit +
    '&sort=' + encodeURIComponent(s.sort) + '&dir=' + encodeURIComponent(s.dir);
  if (rdState.q) p += '&q=' + encodeURIComponent(rdState.q);
  if (rdState.status) p += '&status=' + encodeURIComponent(rdState.status);
  if (rdState.payment) p += '&paymentStatus=' + encodeURIComponent(rdState.payment);
  if (rdState.vehicle) p += '&vehicleType=' + encodeURIComponent(rdState.vehicle);
  if (rdState.from) p += '&from=' + encodeURIComponent(rdState.from);
  if (rdState.to) p += '&to=' + encodeURIComponent(rdState.to);
  return p;
}

function rdShowListState(state, message) {
  var loading = document.getElementById('rd-loading');
  var error = document.getElementById('rd-error');
  var list = document.getElementById('rd-list');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') rdSetText('rd-error-text', message || 'Something went wrong');
  }
  if (list) list.style.display = state === 'loading' || state === 'error' ? 'none' : '';
}

function rdHasFilters() {
  return !!(rdState.q || rdState.status || rdState.payment || rdState.vehicle || rdState.from || rdState.to);
}

function loadRides(force) {
  if (rdState.loading) return;
  if (!force && rdState.loaded) return;
  rdState.loading = true;
  rdShowListState('loading');
  rdSetText('rd-hint', '');

  api('GET', rdRidePath()).then(function(res) {
    rdListData = (res.data && res.data.rides) || [];
    rdStats = (res.data && res.data.stats) || null;
    rdPagination = res.pagination || null;
    rdState.loaded = true;
    if (rdPagination && rdPagination.totalPages && rdListKit().page > rdPagination.totalPages) {
      kitSetPage('rides', rdPagination.totalPages);
      setTimeout(function() { loadRides(true); }, 0);
    }
    rdShowListState('ready');
    rdRenderStats();
    rdRenderVehicleTypes((res.data && res.data.vehicleTypes) || []);
    renderRides();
  }).catch(function(e) {
    rdShowListState('error', e.message);
    toast('Error: ' + e.message, false);
  }).finally(function() {
    rdState.loading = false;
  });
}

function rdRenderStats() {
  if (!rdStats) return;
  rdSetText('rd-s-total', Number(rdStats.total || 0).toLocaleString());
  rdSetText('rd-s-completed', Number(rdStats.completed || 0).toLocaleString());
  rdSetText('rd-s-progress', Number(rdStats.inProgress || 0).toLocaleString());
  rdSetText('rd-s-cancelled', Number(rdStats.cancelled || 0).toLocaleString());
}

function rdRenderVehicleTypes(types) {
  var sel = document.getElementById('rd-vehicle-filter');
  if (!sel || !types || !types.length) return;
  var current = rdState.vehicle ? String(rdState.vehicle).toLowerCase() : '';
  var found = false;
  var html = '<option value="">All Categories</option>';
  types.forEach(function(t) {
    var v = String(t || '');
    if (!v) return;
    if (v.toLowerCase() === current) found = true;
    html += '<option value="' + esc(v) + '"' + (v.toLowerCase() === current ? ' selected' : '') + '>' +
      esc(rdCapitalize(v)) + '</option>';
  });
  if (current && !found) {
    rdState.vehicle = '';
    html = '<option value="">All Categories</option>' +
      types.map(function(t) {
        var v = String(t || '');
        return v ? '<option value="' + esc(v) + '">' + esc(rdCapitalize(v)) + '</option>' : '';
      }).join('');
  }
  sel.innerHTML = html;
}

function rdMetaItem(icon, text) {
  return '<span class="order-card-meta-item">' + icon + esc(text) + '</span>';
}

function renderRides() {
  var el = document.getElementById('rd-list');
  if (!el) return;
  var html = '';

  (rdListData || []).forEach(function(r) {
    var bn = r.bookingNumber || (r.id !== null && r.id !== undefined ? String(r.id) : '');
    var pickupAddr = r.pickupAddress || 'Pickup not set';
    var destAddr = r.destinationAddress || 'Destination not set';
    var shortPickup = pickupAddr.length > 46 ? pickupAddr.substring(0, 46) + '...' : pickupAddr;
    var shortDest = destAddr.length > 46 ? destAddr.substring(0, 46) + '...' : destAddr;

    var icoCard = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';
    var icoUser = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    var icoCar = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2"/><circle cx="7" cy="15" r="2"/><circle cx="17" cy="15" r="2"/><path d="M9 15h6"/><path d="M3 11h18"/></svg>';
    var icoPin = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
    var icoClock = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

    html += '<div class="order-card" onclick="openRideModal(\'' + rdAttr(bn) + '\')">' +
      '<div class="order-card-header">' +
        '<span class="order-card-ref">' + esc(r.bookingNumber || ('Ride #' + r.id)) + '</span>' +
        rdStatusBadge(r.status) +
      '</div>' +
      '<div class="order-card-body">' +
        '<div class="order-card-restaurant">' + esc(r.customerName || 'Unknown customer') + '</div>' +
        '<div class="drv-ride-route">' +
          '<div><div class="drv-ride-route-dot pickup"></div><div class="drv-ride-route-line"></div><div class="drv-ride-route-dot dest"></div></div>' +
          '<div><div class="drv-ride-route-text">' + esc(shortPickup) + '</div>' +
          '<div class="drv-ride-route-text" style="margin-top:8px">' + esc(shortDest) + '</div></div>' +
        '</div>' +
        '<div class="order-card-meta">' +
          rdMetaItem(icoCard, r.paymentStatus || 'Pending') +
          (r.vehicleType ? rdMetaItem(icoCar, rdCapitalize(r.vehicleType)) : '') +
          (r.driverName ? rdMetaItem(icoUser, r.driverName) : '') +
          (r.distance > 0 ? rdMetaItem(icoPin, parseFloat(r.distance).toFixed(1) + ' km') : '') +
          (r.duration > 0 ? rdMetaItem(icoClock, r.duration + ' min') : '') +
        '</div>' +
      '</div>' +
      '<div class="order-card-footer">' +
        '<span class="order-card-total">' + (r.amount !== null && r.amount !== undefined ? fmtNaira(r.amount) : '—') + '</span>' +
        '<span class="order-card-date">' + fmtDate(r.completedAt || r.createdAt) + '</span>' +
      '</div>' +
    '</div>';
  });

  if (!html) {
    var hasFilters = rdHasFilters();
    html = '<div class="rd-empty">' +
      '<div class="rd-empty-icon">' + (hasFilters ? '🔍' : '🚗') + '</div>' +
      '<div class="rd-empty-title">' + (hasFilters ? 'No rides match your search' : 'No rides yet') + '</div>' +
      '<div class="rd-empty-text">' +
        (hasFilters
          ? 'Try a different search term or clear the filters below.'
          : 'Ride bookings from customers will appear here as soon as they are made.') +
      '</div>' +
    '</div><div id="rd-insights" style="margin-top:16px"></div>';
  }
  el.innerHTML = html;
  if (document.getElementById('rd-insights')) loadInsightsInto('rd-insights');

  var total = rdPagination ? rdPagination.total : (rdListData || []).length;
  rdSetText('rd-count', total + ' ride' + (total === 1 ? '' : 's'));

  if (total) {
    var s = rdListKit();
    var start = (s.page - 1) * s.limit + 1;
    var end = Math.min(total, start + (rdListData || []).length - 1);
    rdSetText('rd-hint', start === end ? String(total) : start + '–' + end + ' of ' + total);
  } else {
    rdSetText('rd-hint', '');
  }

  var clear = document.getElementById('rd-clear');
  if (clear) clear.style.display = rdHasFilters() ? '' : 'none';

  rdRenderPagination();
}

function rdRenderPagination() {
  kitRenderPager('rd-pagination', 'rides', rdPagination, function() { loadRides(true); });
  kitRenderSort('rd-sort', 'rides', RIDE_SORT_OPTIONS, function() { loadRides(true); });
}

function rdGoPage(page) {
  kitSetPage('rides', page);
  loadRides(true);
  var el = document.getElementById('rd-list');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function onRideSearch(v) {
  if (rdSearchTimer) clearTimeout(rdSearchTimer);
  rdSearchTimer = setTimeout(function() {
    rdState.q = String(v || '').trim();
    kitSetPage('rides', 1);
    loadRides(true);
  }, 300);
}

function filterRides() {
  var status = document.getElementById('rd-status-filter');
  var payment = document.getElementById('rd-payment-filter');
  var vehicle = document.getElementById('rd-vehicle-filter');
  var from = document.getElementById('rd-from');
  var to = document.getElementById('rd-to');
  rdState.status = status ? status.value : '';
  rdState.payment = payment ? payment.value : '';
  rdState.vehicle = vehicle ? vehicle.value : '';
  rdState.from = from && /^\d{4}-\d{2}-\d{2}$/.test(from.value) ? from.value : '';
  rdState.to = to && /^\d{4}-\d{2}-\d{2}$/.test(to.value) ? to.value : '';
  if (rdState.from && rdState.to && rdState.from > rdState.to) {
    toast('From date must be before the To date', false);
    return;
  }
  kitSetPage('rides', 1);
  loadRides(true);
}

function clearRideFilters() {
  rdState.q = '';
  rdState.status = '';
  rdState.payment = '';
  rdState.vehicle = '';
  rdState.from = '';
  rdState.to = '';
  kitSetPage('rides', 1);
  var search = document.getElementById('rd-search');
  if (search) search.value = '';
  ['rd-status-filter', 'rd-payment-filter', 'rd-vehicle-filter'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var from = document.getElementById('rd-from');
  var to = document.getElementById('rd-to');
  if (from) from.value = '';
  if (to) to.value = '';
  loadRides(true);
}

// ─── Ride Details modal ────────────────────────

function openRideModal(id) {
  rdActiveRideId = id;
  rdActiveRide = null;
  rdActiveRideExtra = null;
  var modal = document.getElementById('rideModal');
  var body = document.getElementById('rideModalBody');
  if (!modal || !body) return;
  rdSetText('rideModalTitle', 'Ride Details');
  rdSetText('rideModalRef', id);
  body.innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading ride details...</div></div>';
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';

  api('GET', '/rides/' + encodeURIComponent(id)).then(function(res) {
    if (rdActiveRideId !== id) return;
    rdActiveRide = res.data && res.data.ride;
    rdActiveRideExtra = {
      transactions: (res.data && res.data.transactions) || [],
      rating: (res.data && res.data.rating) || null
    };
    if (!rdActiveRide) throw new Error('Ride not found');
    renderRideModal();
  }).catch(function(e) {
    if (rdActiveRideId !== id) return;
    body.innerHTML = '<div class="drv-error">' +
      '<div class="drv-error-icon">⚠️</div>' +
      '<div class="drv-error-title">Failed to load ride details</div>' +
      '<div class="drv-error-text">' + esc(e.message) + '</div>' +
      '<button class="btn btn-accent btn-sm" onclick="openRideModal(\'' + rdAttr(id) + '\')">Retry</button>' +
    '</div>';
    toast('Error: ' + e.message, false);
  });
}

function closeRideModal() {
  var modal = document.getElementById('rideModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  rdActiveRideId = null;
  rdActiveRide = null;
  rdActiveRideExtra = null;
}

function rdField(label, value, wide) {
  if (value === null || value === undefined || value === '') return '';
  return '<div class="order-detail-field' + (wide ? ' order-detail-field-wide' : '') + '">' +
    '<div class="order-detail-field-label">' + esc(label) + '</div>' +
    '<div class="order-detail-field-value">' + esc(String(value)) + '</div>' +
  '</div>';
}

function rdSection(label, inner) {
  if (!inner) return '';
  return '<div class="order-detail-section">' +
    '<div class="order-detail-label">' + esc(label) + '</div>' +
    inner +
  '</div>';
}

function rdGrid(fields) {
  return '<div class="order-detail-grid">' + fields + '</div>';
}

function rdEmptyInline(text) {
  return '<div class="drv-empty-inline">' +
    '<div class="drv-empty-inline-icon">🛈</div>' +
    '<div class="drv-empty-inline-text">' + esc(text) + '</div>' +
  '</div>';
}

function rdChargeRow(label, value, cls) {
  return '<div class="order-detail-charge-row' + (cls ? ' ' + cls : '') + '">' +
    '<span class="order-detail-charge-label">' + esc(label) + '</span>' +
    '<span class="order-detail-charge-value">' + esc(value) + '</span>' +
  '</div>';
}

function rdCoordText(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return '';
  return Number(lat).toFixed(6) + ', ' + Number(lon).toFixed(6);
}

function rdStars(rating) {
  var html = '';
  var full = Math.round(Number(rating) || 0);
  for (var i = 1; i <= 5; i++) {
    html += '<span class="star' + (i <= full ? '' : ' empty') + '">★</span>';
  }
  return html;
}

function renderRideModal() {
  var body = document.getElementById('rideModalBody');
  var r = rdActiveRide;
  if (!body || !r) return;
  var extra = rdActiveRideExtra || {};
  var html = '';

  rdSetText('rideModalTitle', 'Ride Details');
  rdSetText('rideModalRef', r.bookingNumber || ('#' + r.id));

  // ── Status ──
  html += '<div class="order-detail-section"><div class="order-detail-status-row">' +
    rdStatusBadge(r.status, true) +
    rdPaymentBadge(r, true) +
    (r.vehicleType ? '<span class="tag tag-feat" style="font-size:11px;padding:5px 12px">' + esc(rdCapitalize(r.vehicleType)) + '</span>' : '') +
  '</div></div>';

  // ── Ride information ──
  html += rdSection('Ride Information', rdGrid(
    rdField('Ride ID', r.bookingNumber || '', true) +
    rdField('Ride Category', r.vehicleType ? rdCapitalize(r.vehicleType) : '') +
    rdField('Passengers', r.passengerCount) +
    rdField('Distance', r.distance > 0 ? parseFloat(r.distance).toFixed(2) + ' km' : '') +
    rdField('Duration', r.duration > 0 ? r.duration + ' min' : '') +
    rdField('Assignment Status', r.assignmentStatus ? rdCapitalize(r.assignmentStatus) : '') +
    rdField('Ride Reference', r.id !== null && r.id !== undefined ? r.id : '', true)
  ));

  // ── Customer ──
  if (r.customer && r.customer.id) {
    html += rdSection('Customer', rdGrid(
      rdField('Name', r.customer.name || r.customerName || '') +
      rdField('Phone', r.customer.phone || '') +
      rdField('Email', r.customer.email || '') +
      rdField('Account Status', r.customer.accountStatus ? rdCapitalize(r.customer.accountStatus) : '') +
      rdField('User ID', r.customer.id, true)
    ));
  } else {
    html += rdSection('Customer', rdEmptyInline('No customer record found for this ride.'));
  }

  // ── Driver ──
  if (r.driver) {
    html += rdSection('Driver', rdGrid(
      rdField('Name', r.driver.name || r.driverName || '') +
      rdField('Phone', r.driver.phone || '') +
      rdField('Email', r.driver.email || '') +
      rdField('Rating', r.driver.rating !== null && r.driver.rating !== undefined ? r.driver.rating + ' / 5' : '') +
      rdField('Total Trips', r.driver.totalTrips !== null && r.driver.totalTrips !== undefined ? r.driver.totalTrips : '') +
      rdField('Account Status', r.driver.accountStatus ? rdCapitalize(r.driver.accountStatus) : '') +
      rdField('Online Status', r.driver.onlineStatus ? rdCapitalize(r.driver.onlineStatus) : '') +
      rdField('DRT Number', r.driver.drtNumber || '') +
      rdField('Driver ID', r.driver.id || '', true) +
      rdField('Driver Profile ID', r.driver.profileId || '', true)
    ));
  } else {
    html += rdSection('Driver', rdEmptyInline('No driver has been assigned to this ride yet.'));
  }

  // ── Route ──
  var pCoord = rdCoordText(r.pickup && r.pickup.latitude, r.pickup && r.pickup.longitude);
  var dCoord = rdCoordText(r.destination && r.destination.latitude, r.destination && r.destination.longitude);
  var routeInner =
    '<div class="rd-route-box">' +
      '<div class="drv-ride-route" style="margin-bottom:0">' +
        '<div><div class="drv-ride-route-dot pickup"></div><div class="drv-ride-route-line"></div><div class="drv-ride-route-dot dest"></div></div>' +
        '<div><div class="drv-ride-route-text">' + esc(r.pickupAddress || 'Pickup not set') + '</div>' +
        '<div class="drv-ride-route-text" style="margin-top:8px">' + esc(r.destinationAddress || 'Destination not set') + '</div></div>' +
      '</div>' +
    '</div>' +
    rdGrid(
      rdField('Pickup', r.pickupAddress || '', true) +
      rdField('Pickup Coordinates', pCoord) +
      rdField('Destination', r.destinationAddress || '', true) +
      rdField('Destination Coordinates', dCoord) +
      rdField('Distance', r.distance > 0 ? parseFloat(r.distance).toFixed(2) + ' km' : '') +
      rdField('Estimated Duration', r.duration > 0 ? r.duration + ' min' : '')
    );
  html += rdSection('Route', routeInner);

  // ── Fare breakdown ──
  var fare = r.fare || {};
  var fareTotal = fare.totalFare !== null && fare.totalFare !== undefined
    ? fare.totalFare
    : (r.amount !== null && r.amount !== undefined ? r.amount : null);
  if (fare.hasBreakdown || fareTotal !== null) {
    var charges = '';
    if (fare.hasBreakdown) {
      if (fare.baseFare) charges += rdChargeRow('Base fare', fmtNaira(fare.baseFare));
      if (fare.distanceCharge) charges += rdChargeRow('Distance charge', fmtNaira(fare.distanceCharge));
      if (fare.passengerSurcharge) charges += rdChargeRow('Passenger surcharge', fmtNaira(fare.passengerSurcharge));
      if (fare.bookingFee) charges += rdChargeRow('Booking fee', fmtNaira(fare.bookingFee));
      if (fare.serviceFee) charges += rdChargeRow('Service fee', fmtNaira(fare.serviceFee));
    }
    if (charges && fareTotal !== null) charges += rdChargeRow('Total fare', fmtNaira(fareTotal), 'is-total');
    if (!charges && fareTotal !== null) charges = rdChargeRow('Total fare', fmtNaira(fareTotal), 'is-total');
    html += rdSection('Fare Breakdown', '<div class="order-detail-charges">' + charges + '</div>');
  }

  // ── Payment ──
  var p = r.payment || {};
  var pi = r.paymentInfo || {};
  var paymentHtml = '<div class="order-detail-status-row" style="margin-bottom:10px">' + rdPaymentBadge(r, true) + '</div>' +
    rdGrid(
      rdField('Payment Method', p.method || pi.method || '') +
      rdField('Amount Charged', pi.amount !== null && pi.amount !== undefined ? fmtNaira(pi.amount) : '') +
      rdField('Wallet Debited', p.walletDebited ? fmtNaira(p.walletDebited) : '') +
      rdField('Balance Before', p.balanceBefore ? fmtNaira(p.balanceBefore) : '') +
      rdField('Balance After', p.balanceAfter ? fmtNaira(p.balanceAfter) : '') +
      rdField('Transaction ID', pi.transactionId || '') +
      rdField('Currency', pi.currency || '') +
      rdField('Paid At', pi.paidAt ? fmtDate(pi.paidAt) : '') +
      (r.refund ? rdField('Refund Transaction', r.refund.transactionId) : '') +
      (r.refund ? rdField('Refund Amount', r.refund.amount !== null && r.refund.amount !== undefined ? fmtNaira(r.refund.amount) : '') : '') +
      (r.refund ? rdField('Refunded At', r.refund.refundedAt ? fmtDate(r.refund.refundedAt) : '') : '')
    );

  var txs = extra.transactions || [];
  if (txs.length) {
    paymentHtml += '<div class="um-rows" style="margin-top:10px">' + txs.map(function(t) {
      var txCls = 'tag-pending';
      var txKey = String(t.status || '').toLowerCase();
      if (txKey === 'completed' || txKey === 'success') txCls = 'tag-confirmed';
      else if (txKey === 'failed' || txKey === 'expired' || txKey === 'cancelled') txCls = 'tag-cancelled';
      else if (txKey === 'refunded' || t.type === 'ride_refund') txCls = 'tag-preparing';
      return '<div class="um-row">' +
        '<div class="um-row-main">' +
          '<div class="um-row-title">' + esc(t.description || t.type || t.transactionId) + '</div>' +
          '<div class="um-row-sub">' + esc(t.transactionId) + (t.createdAt ? ' · ' + fmtDate(t.createdAt) : '') + '</div>' +
        '</div>' +
        '<div class="um-row-side">' +
          '<div class="um-row-amount' + (t.type === 'ride_refund' ? '' : ' um-amount-in') + '">' + (t.amount >= 0 && t.type === 'ride_refund' ? '' : '') + fmtNaira(t.amount) + '</div>' +
          '<div class="um-row-meta">' + rdTag(t.status ? rdCapitalize(t.status) : '—', txCls) + '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }
  html += rdSection('Payment', paymentHtml);

  if (typeof refundActionsHtml === 'function') {
    html += refundActionsHtml('ride', r.bookingNumber || '', { paymentStatus: r.paymentStatus });
  }

  // ── Timestamps ──
  html += rdSection('Important Timestamps', rdGrid(
    rdField('Booked At', r.createdAt ? fmtDate(r.createdAt) : '') +
    rdField('Driver Accepted', r.acceptedAt ? fmtDate(r.acceptedAt) : '') +
    rdField('Trip Completed', r.completedAt ? fmtDate(r.completedAt) : '') +
    rdField('Cancelled At', r.cancelledAt ? fmtDate(r.cancelledAt) : '') +
    rdField('Cancelled By', r.cancellation && r.cancellation.cancelledBy ? rdCapitalize(r.cancellation.cancelledBy) : '') +
    rdField('Last Updated', r.updatedAt ? fmtDate(r.updatedAt) : '') +
    rdField('Cancellation Reason', r.cancellation && r.cancellation.reason ? r.cancellation.reason : '', true)
  ));

  // ── Rating ──
  var rating = extra.rating;
  if (rating && rating.rating !== null && rating.rating !== undefined) {
    html += rdSection('Ride Rating',
      '<div class="drv-review-card">' +
        '<div class="drv-review-header">' +
          '<span class="drv-review-user">' + esc(rating.userName || 'Customer') + '</span>' +
          '<span class="drv-review-stars">' + rdStars(rating.rating) + '</span>' +
        '</div>' +
        (rating.comment ? '<div class="drv-review-text">' + esc(rating.comment) + '</div>' : '') +
        '<div class="drv-review-date">' + esc(fmtDate(rating.createdAt)) + '</div>' +
      '</div>');
  }

  body.innerHTML = html || rdEmptyInline('No ride information available.');
  body.scrollTop = 0;
}

// ─── Backdrop / ESC closing ────────────────────

document.addEventListener('click', function(e) {
  var modal = document.getElementById('rideModal');
  if (modal && e.target === modal) closeRideModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var modal = document.getElementById('rideModal');
  if (modal && modal.classList.contains('on')) closeRideModal();
});
