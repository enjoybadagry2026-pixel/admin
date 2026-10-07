// ═══════════════ ORDERS ═══════════════

var orderFilterValue = '';
var orderModalActiveId = null;

// Orders still open after this many hours are flagged as aging
var ORDER_AGING_HOURS = 24;
// Orders ticked for bulk status actions: { orderId: true }
var orderBulkSelected = {};
// Delivery map + live refresh state
var orderMapInstance = null;
var orderMapPollTimer = null;

function orderStatusKey(status) {
  var s = (status || '').toLowerCase().replace(/_/g, ' ').trim();
  if (!s) return 'pending';
  if (s.indexOf('declin') >= 0) return 'declined';
  if (s.indexOf('pending') >= 0) return 'pending';
  if (s === 'accepted' || s.indexOf('confirm') >= 0) return 'confirmed';
  if (s.indexOf('process') >= 0 || s.indexOf('prepar') >= 0) return 'processing';
  if (s.indexOf('ready') >= 0) return 'ready';
  if (s.indexOf('assign') >= 0) return 'assigned';
  if (s.indexOf('arriving') >= 0 || s.indexOf('out for') >= 0 ||
      s.indexOf('way') >= 0 || s.indexOf('transit') >= 0 ||
      s.indexOf('delivery') >= 0) return 'ondelivery';
  if (s.indexOf('refund') >= 0) return 'refunded';
  if (s.indexOf('deliver') >= 0) return 'delivered';
  if (s.indexOf('complete') >= 0) return 'completed';
  if (s.indexOf('cancel') >= 0) return 'cancelled';
  return 'pending';
}

// Workflow stage of a food order — drives which actions are available
function foodOrderStage(status) {
  var s = (status || '').toLowerCase().replace(/_/g, ' ').trim();
  if (!s || s === 'pending' || s.indexOf('pending') >= 0) return 'pending';
  if (s.indexOf('declin') >= 0) return 'declined';
  if (s.indexOf('process') >= 0 || s.indexOf('prepar') >= 0) return 'processing';
  if (s.indexOf('accept') >= 0 || s.indexOf('confirm') >= 0) return 'accepted';
  if (s.indexOf('complete') >= 0) return 'completed';
  if (s.indexOf('arriving') >= 0 || s.indexOf('out for') >= 0 ||
      s.indexOf('delivery') >= 0 || s.indexOf('way') >= 0 || s.indexOf('transit') >= 0) return 'delivery';
  if (s.indexOf('deliver') >= 0) return 'delivered';
  if (s.indexOf('ready') >= 0 || s.indexOf('assign') >= 0) return 'processing';
  if (s.indexOf('cancel') >= 0) return 'cancelled';
  if (s.indexOf('refund') >= 0) return 'refunded';
  return 'unknown';
}

function orderStatusBadge(status) {
  var key = orderStatusKey(status);
  var cls = key === 'refunded' ? 'order-status-cancelled' : 'order-status-' + key;
  var label = status || 'Unknown';
  return '<span class="order-card-status ' + cls + '">' + esc(label) + '</span>';
}

function orderStatusBadgeLarge(status) {
  var key = orderStatusKey(status);
  var cls = key === 'refunded' ? 'order-status-cancelled' : 'order-status-' + key;
  var label = status || 'Unknown';
  return '<span class="order-card-status ' + cls + '" style="font-size:12px;padding:5px 14px">' + esc(label) + '</span>';
}

function paymentStatusBadge(status) {
  var s = (status || '').toLowerCase();
  var cls = 'order-status-pending';
  var label = status || '';
  if (s === 'completed' || s === 'paid' || s === 'success') { cls = 'order-status-delivered'; label = 'Paid'; }
  else if (s === 'pending' || s === 'processing') { cls = 'order-status-pending'; label = 'Pending'; }
  else if (s === 'failed' || s === 'cancelled') { cls = 'order-status-cancelled'; label = 'Failed'; }
  else if (s === 'refunded') { cls = 'order-status-cancelled'; label = 'Refunded'; }
  return '<span class="order-card-status ' + cls + '" style="font-size:12px;padding:5px 14px">' + esc(label) + '</span>';
}

// Short display form of an order reference: EB-FOOD-<timestamp>-<code> → #<code>
function shortOrderRef(ref) {
  ref = String(ref || '');
  var m = ref.match(/^EB-FOOD-\d+-(\w+)$/);
  if (m) return '#' + m[1];
  if (ref.length <= 14) return ref;
  return ref.slice(0, 6) + '…' + ref.slice(-4);
}

function orderSearchText(o) {
  var parts = [
    o.orderReference || '',
    o.orderNumber || '',
    shortOrderRef(o.orderReference || o.orderNumber || ''),
    o.restaurantName || '',
    o.status || '',
    o.declineReason || '',
    o.customerName || '',
    o.customerPhone || '',
    o.customerEmail || '',
    o.deliveryAddress || '',
    o.driverName || '',
    o.paymentStatus || ''
  ];
  if (o.items && o.items.length) {
    o.items.forEach(function(item) {
      parts.push(item.name || item.foodName || '');
    });
  }
  return parts.join(' ').toLowerCase();
}

// Sort options mirror the keys GET /orders understands server-side
// (created, updated, amount, status, reference, customer) so the same
// vocabulary works whether the list is paged locally or remotely.
var ORDER_SORT_OPTIONS = [
  { value: 'created', label: 'Order date' },
  { value: 'amount', label: 'Total amount' },
  { value: 'customer', label: 'Customer name' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'status', label: 'Status' },
  { value: 'reference', label: 'Order reference' }
];

function orderSortValue(row, key) {
  var o = row.o;
  if (key === 'amount') return Number(o.grandTotal) || 0;
  if (key === 'status') return orderStatusKey(o.status);
  if (key === 'reference') return String(o.orderReference || o.orderNumber || '');
  if (key === 'customer') return String(o.customerName || '').toLowerCase();
  if (key === 'restaurant') return String(o.restaurantName || '').toLowerCase();
  if (key === 'updated') return String(o.updatedAt || o.createdAt || '');
  return String(o.createdAt || '');
}

function renderOrdersControls() {
  kitRenderSort('o-sort', 'orders', ORDER_SORT_OPTIONS, function() { renderOrders(cachedOrders); });
}

// ─── Panel refresh + local search ─────────────────────────────────
// The orders panel has its own search box and refresh controls; the header
// search (doSearch) stays global across every cached list.

var orderSearchValue = '';
var orderSearchTimer = null;

// Re-fetches orders from the server and repaints the panel. Called by the
// refresh button, the "N new" pill and the new-orders poll. Pass `quiet` to
// skip the confirmation toast (used when simply opening the panel).
async function loadOrders(quiet) {
  if (typeof hasPerm === 'function' && !hasPerm('orders.food.view')) return;
  load(true);
  try {
    var res = await api('GET', '/orders');
    cachedOrders = {};
    ((res.data && res.data.orders) || []).forEach(function(o) { cachedOrders[o.id] = o; });
    renderOrders(cachedOrders);
    var pill = document.getElementById('o-new-orders');
    if (pill) pill.style.display = 'none';
    if (!quiet) toast('Orders updated');
  } catch (e) {
    toast('Failed to load orders: ' + e.message, false);
  } finally {
    load(false);
  }
}

// "N new · Refresh" pill: pull the fresh orders in and clear the pill.
function ordersShowNew() {
  loadOrders();
}

function onOrderSearch(v) {
  if (orderSearchTimer) clearTimeout(orderSearchTimer);
  orderSearchTimer = setTimeout(function() {
    orderSearchValue = String(v || '').trim().toLowerCase();
    kitSetPage('orders', 1);
    renderOrders(cachedOrders);
  }, 250);
}

function renderOrders(orders) {
  orders = orders || {};
  kitList('orders', { sort: 'created', dir: 'desc', limit: 24 });
  var rows = [];
  Object.keys(orders).forEach(function(id) {
    var o = orders[id];
    if (search && orderSearchText(o).indexOf(search) < 0) return;
    if (orderSearchValue && orderSearchText(o).indexOf(orderSearchValue) < 0) return;
    if (orderFilterValue && orderStatusKey(o.status) !== orderFilterValue) return;
    rows.push({ id: id, o: o });
  });
  rows = kitSortRows(rows, orderSortValue, 'orders');
  var page = kitSlice(rows, 'orders');

  var html = '';
  page.rows.forEach(function(row) {
    var id = row.id;
    var o = row.o;

    var itemsPreview = '';
    if (o.items && o.items.length) {
      var names = o.items.map(function(item){ return item.name || item.foodName || '' }).filter(Boolean);
      itemsPreview = names.slice(0, 3).join(', ');
      if (names.length > 3) itemsPreview += ' +' + (names.length - 3) + ' more';
    }

    var cardStage = foodOrderStage(o.status);
    var bulkEligible = cardStage === 'pending' || cardStage === 'accepted' || cardStage === 'processing' || cardStage === 'completed';

    html += '<div class="order-card' + (orderBulkSelected[id] ? ' is-selected' : '') + '" onclick="openOrderModal(\'' + id + '\')">' +
      '<div class="order-card-header">' +
        (bulkEligible ? '<label class="order-card-select" title="Select for bulk actions" onclick="event.stopPropagation()"><input type="checkbox"' + (orderBulkSelected[id] ? ' checked' : '') + ' onchange="toggleBulkOrder(\'' + id + '\', this.checked)"></label>' : '') +
        '<span class="order-card-ref" title="' + esc(o.orderReference || String(id)) + '">' + esc(shortOrderRef(o.orderReference || id)) + '</span>' +
        orderStatusBadge(o.status) +
      '</div>' +
      '<div class="order-card-body">' +
        '<div class="order-card-restaurant">' + esc(o.restaurantName || 'Unknown Restaurant') + '</div>' +
        (o.customerName ? '<div class="order-card-customer">' + esc(o.customerName) + '</div>' : '') +
        (itemsPreview ? '<div class="order-card-items-preview">' + esc(itemsPreview) + '</div>' : '') +
        '<div class="order-card-meta">' +
          (o.paymentStatus ? '<span class="order-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' + esc(o.paymentStatus) + '</span>' : '') +
          (o.driverName ? '<span class="order-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' + esc(o.driverName) + '</span>' : '') +
          (o.deliveryAddress ? '<span class="order-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + esc(o.deliveryAddress.length > 30 ? o.deliveryAddress.substring(0, 30) + '...' : o.deliveryAddress) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="order-card-footer">' +
        '<span class="order-card-total">' + fmtNaira(o.grandTotal) + '</span>' +
        '<span class="order-card-footer-right">' +
          orderAgingBadge(o) +
          (o.createdAt ? '<span class="order-card-date"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + esc(fmtDate(o.createdAt)) + '</span>' : '') +
        '</span>' +
      '</div>' +
    '</div>';
  });
  if (!html) {
    var filtered = !!(search || orderFilterValue || orderSearchValue);
    html = '<div class="order-empty"><div class="order-empty-icon">' + (filtered ? '🔍' : '📦') + '</div>' +
      '<div class="order-empty-title">' + (filtered ? 'No orders match your search' : 'No orders yet') + '</div>' +
      '<div class="order-empty-text">' +
        (filtered
          ? 'Try a different search term or clear the status filter.'
          : 'Orders from customers will appear here once they start placing them.') +
      '</div></div>' +
      '<div id="o-insights" style="margin-top:16px"></div>';
  }
  document.getElementById('o-list').innerHTML = html;
  document.getElementById('o-count').textContent = page.total + ' order' + (page.total !== 1 ? 's' : '');
  kitRenderPager('o-pager', 'orders', page.total ? page : null, function() { renderOrders(cachedOrders); });
  renderOrdersControls();
  kitRenderSavedBar('o-saved', {
    key: 'orders',
    current: {
      name: kitList('orders').preset,
      params: { sort: kitList('orders').sort, dir: kitList('orders').dir, status: orderFilterValue }
    },
    onApply: function(params, name) {
      kitApplyParams('orders', params);
      orderFilterValue = params.status || '';
      var sel = document.getElementById('o-filter');
      if (sel) sel.value = orderFilterValue;
      kitList('orders').preset = name;
      renderOrders(cachedOrders);
    },
    onSaved: function() { renderOrders(cachedOrders); }
  });
  if (document.getElementById('o-insights')) loadInsightsInto('o-insights');
}

function filterOrders() {
  orderFilterValue = document.getElementById('o-filter').value;
  kitList('orders').preset = '';
  kitSetPage('orders', 1);
  renderOrders(cachedOrders);
}

function detailField(label, value, wide) {
  if (value === null || value === undefined || value === '') return '';
  return '<div class="order-detail-field' + (wide ? ' order-detail-field-wide' : '') + '">' +
    '<div class="order-detail-field-label">' + esc(label) + '</div>' +
    '<div class="order-detail-field-value">' + esc(String(value)) + '</div>' +
  '</div>';
}

// Available workflow actions for the order's current status
function orderActionButtons(id, o) {
  var stage = foodOrderStage(o.status);
  var btns = '';
  var hint = '';

  var icoCheck = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var icoX = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var icoClock = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  var icoCheckCircle = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  var icoTruck = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';

  if (stage === 'pending') {
    btns += '<button type="button" class="btn btn-green" onclick="runOrderAction(\'' + id + '\', \'accept\', null, this)">' + icoCheck + 'Accept Order</button>';
    btns += '<button type="button" class="btn btn-red" onclick="openDeclineModal(\'' + id + '\')">' + icoX + 'Decline Order</button>';
    hint = 'Accept to begin preparation, or decline with a reason.';
  } else if (stage === 'accepted') {
    btns += '<button type="button" class="btn btn-accent" onclick="runOrderAction(\'' + id + '\', \'processing\', null, this)">' + icoClock + 'Start Food Processing</button>';
    hint = 'Move this order into food processing.';
  } else if (stage === 'processing') {
    btns += '<button type="button" class="btn btn-green" onclick="runOrderAction(\'' + id + '\', \'complete\', null, this)">' + icoCheckCircle + 'Mark Completed</button>';
    hint = 'Mark as completed once the food is ready.';
  } else if (stage === 'completed') {
    btns += '<button type="button" class="btn btn-accent" onclick="runOrderAction(\'' + id + '\', \'delivery\', null, this)">' + icoTruck + 'Out for Delivery</button>';
    hint = 'Send this order out for delivery / arriving to the customer.';
  } else if (stage === 'delivery') {
    hint = 'This order is out for delivery and arriving to the customer.';
  } else if (stage === 'declined') {
    hint = 'This order was declined. The reason is shown above.';
  } else if (stage === 'delivered') {
    hint = 'This order has been delivered.';
  }

  if (!btns && !hint) return '';
  return '<div class="order-actions">' + btns +
    (hint ? '<div class="order-actions-hint">' + esc(hint) + '</div>' : '') +
  '</div>';
}

function chargeRow(label, value, cls) {
  return '<div class="order-detail-charge-row' + (cls ? ' ' + cls : '') + '">' +
    '<span class="order-detail-charge-label">' + esc(label) + '</span>' +
    '<span class="order-detail-charge-value">' + fmtNaira(value) + '</span>' +
  '</div>';
}

function orderChargeRows(o) {
  var charges = o.charges || {};
  var html = '';
  var foodTotal = charges.foodTotal != null ? charges.foodTotal : (o.subtotal != null ? o.subtotal : null);
  var extrasTotal = charges.extrasTotal != null ? charges.extrasTotal : null;
  var packagingFee = charges.packagingFee != null ? charges.packagingFee : null;
  var platformFee = charges.platformFee != null ? charges.platformFee : null;
  var serviceFee = charges.serviceFee != null ? charges.serviceFee : null;
  var discount = charges.discount != null ? charges.discount : null;
  if (foodTotal != null) html += chargeRow('Food Subtotal', foodTotal);
  if (extrasTotal != null) html += chargeRow('Extras Total', extrasTotal);
  if (o.deliveryFee != null) html += chargeRow('Delivery Fee', o.deliveryFee);
  if (packagingFee != null) html += chargeRow('Packaging Fee', packagingFee);
  if (platformFee != null) html += chargeRow('Platform Fee', platformFee);
  if (serviceFee != null) html += chargeRow('Service Fee', serviceFee);
  if (discount) html += chargeRow('Discount', -Math.abs(Number(discount)), 'is-discount');
  html += chargeRow('Grand Total', o.grandTotal != null ? o.grandTotal : (charges.grandTotal || 0), 'is-total');
  return html;
}

function getOrderItems(o) {
  if (!o) return [];
  if (o.items && o.items.length) return o.items;
  if (o.orderItems && o.orderItems.length) return o.orderItems;
  if (o.foodItems && o.foodItems.length) return o.foodItems;
  if (o.food && typeof o.food === 'object' && !Array.isArray(o.food) &&
      (o.food.name || o.food.unitPrice != null || (o.food.extras && o.food.extras.length))) {
    return [o.food];
  }
  return [];
}

function findOrderItemFood(item) {
  if (!item) return null;
  if (item.foodId != null && cachedFoods[item.foodId]) return cachedFoods[item.foodId];
  var name = item.name || item.foodName || '';
  if (!name) return null;
  name = String(name).toLowerCase();
  var ids = Object.keys(cachedFoods);
  for (var i = 0; i < ids.length; i++) {
    var f = cachedFoods[ids[i]];
    if ((f.name || '').toLowerCase() === name) return f;
  }
  return null;
}

function openOrderModal(id) {
  var o = cachedOrders[id];
  if (!o) return;

  document.getElementById('orderModalTitle').textContent = 'Order Details';
  document.getElementById('orderModalRef').textContent = o.orderReference || id;

  var body = '';
  var payment = o.payment || {};
  var paymentInfo = o.paymentInfo || {};
  var tracking = o.tracking || {};
  var delivery = o.delivery || {};
  var restaurant = o.restaurant || {};
  var timeline = o.timeline || {};

  // Status
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Status</div>';
  body += '<div class="order-detail-status-row">' + orderStatusBadgeLarge(o.status);
  body += orderAgingBadge(o);
  if (o.paymentStatus) body += paymentStatusBadge(o.paymentStatus);
  body += '</div>';

  // Decline reason — saved with the order when an admin declines it
  if (o.declineReason) {
    body += '<div class="order-decline-box" style="margin-top:12px">' +
      '<div class="order-decline-label">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        'Decline Reason' +
      '</div>' +
      '<div class="order-decline-reason">' + esc(o.declineReason) + '</div>' +
    '</div>';
  }

  // Workflow actions — Accept / Decline / Food Processing / Completed / Delivery
  body += orderActionButtons(id, o);
  body += '</div>';

  // Order Information
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> Order Information</div>';
  body += '<div class="order-detail-grid">';
  body += detailField('Order Reference', o.orderReference || '');
  body += detailField('Order ID', o.id != null ? o.id : '');
  body += detailField('Customer User ID', o.userId || '');
  body += detailField('Food Item ID', o.foodId || '');
  body += detailField('Items Ordered', o.itemsCount != null ? o.itemsCount : (o.items ? o.items.length : ''));
  body += detailField('Quantity', o.quantity != null ? o.quantity : '');
  body += '</div></div>';

  // Customer Info
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Customer Information</div>';
  body += '<div class="order-detail-grid">';
  body += detailField('Name', o.customerName || (o.customer && o.customer.name) || 'N/A');
  body += detailField('Phone', o.customerPhone || (o.customer && o.customer.phone) || 'N/A');
  body += detailField('Email', o.customerEmail || (o.customer && o.customer.email) || '');
  body += '</div></div>';

  // Delivery Info
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Delivery Information</div>';
  body += '<div class="order-detail-grid">';
  body += detailField('Address', o.deliveryAddress || delivery.fullAddress || 'N/A', true);
  body += detailField('Recipient Name', delivery.recipientName || '');
  body += detailField('Recipient Phone', delivery.recipientPhone || '');
  body += detailField('Landmark', delivery.landmark || '');
  body += detailField('Delivery Instructions', delivery.deliveryInstructions || '', true);
  if (o.deliveryFee != null) body += detailField('Delivery Fee', fmtNaira(o.deliveryFee));
  body += '</div></div>';

  // Driver & Tracking (with assignment picker while the order is still pre-delivery)
  var hasTracking = o.driverName || o.driverPhone || o.driverId || tracking.eta || tracking.expectedDeliveryTime || tracking.riderLatitude != null || tracking.riderLongitude != null;
  var modalStage = foodOrderStage(o.status);
  var canAssignDriver = modalStage === 'pending' || modalStage === 'accepted' || modalStage === 'processing' || modalStage === 'completed';
  if (hasTracking || canAssignDriver) {
    body += '<div class="order-detail-section">';
    body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Driver &amp; Tracking</div>';
    body += '<div class="order-detail-grid">';
    body += detailField('Assigned Driver', o.driverName || tracking.riderName || '');
    body += detailField('Driver Phone', o.driverPhone || tracking.riderPhone || '');
    body += detailField('Driver ID', o.driverId || '');
    body += detailField('ETA', tracking.eta || '');
    body += detailField('Expected Delivery', tracking.expectedDeliveryTime ? fmtDate(tracking.expectedDeliveryTime) : '');
    body += detailField('Estimated Minutes', tracking.estimatedMinutes != null ? tracking.estimatedMinutes + ' min' : '');
    body += detailField('Rider Latitude', tracking.riderLatitude != null ? tracking.riderLatitude : '');
    body += detailField('Rider Longitude', tracking.riderLongitude != null ? tracking.riderLongitude : '');
    body += detailField('Tracking Last Updated', tracking.lastUpdated ? fmtDate(tracking.lastUpdated) : '');
    body += '</div>';
    if (canAssignDriver) {
      body += '<div class="order-driver-assign">' +
        '<select id="order-driver-select" class="order-driver-select">' + driverOptionsHtml(o.driverId || tracking.riderId || '') + '</select>' +
        '<button type="button" class="btn btn-accent btn-sm" onclick="assignOrderDriver(\'' + id + '\', this)">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="16" y1="11" x2="22" y2="11"/></svg>' +
          (o.driverId || tracking.riderId ? 'Update Driver' : 'Assign Driver') +
        '</button>' +
      '</div>';
    }
    body += '</div>';
  }

  // Delivery Map — pickup/destination coordinates recorded on the order
  body += orderMapSectionHtml(o);

  // Restaurant
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg> Restaurant</div>';
  body += '<div class="order-detail-grid">';
  body += detailField('Name', o.restaurantName || restaurant.name || 'N/A', true);
  body += detailField('Address', restaurant.address || '');
  body += detailField('Rating', restaurant.rating != null && restaurant.rating !== '' ? Number(restaurant.rating).toFixed(1) + '/5' : '');
  body += detailField('Restaurant Latitude', restaurant.latitude != null ? restaurant.latitude : '');
  body += detailField('Restaurant Longitude', restaurant.longitude != null ? restaurant.longitude : '');
  body += '</div></div>';

  // Order Items
  var orderItems = getOrderItems(o);
  if (orderItems.length) {
    body += '<div class="order-detail-section">';
    body += '<button type="button" class="order-detail-label order-items-trigger" onclick="openOrderItemsModal(\'' + id + '\')">' +
      '<span class="order-items-trigger-main">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
        'Order Items' +
      '</span>' +
      '<span class="order-items-trigger-cta">View ' + orderItems.length + ' item' + (orderItems.length !== 1 ? 's' : '') +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</span>' +
    '</button>';
    body += '<div class="order-detail-items is-clickable" onclick="openOrderItemsModal(\'' + id + '\')">';
    orderItems.forEach(function(item) {
      var itemName = item.name || item.foodName || 'Unknown Item';
      var itemQty = item.quantity || item.qty || 1;
      var itemPrice = item.price || item.unitPrice || 0;
      var itemImg = item.image || item.foodImage || '';
      var itemTotal = item.total || item.itemTotal || (itemPrice * itemQty);
      var itemDesc = item.description || '';
      body += '<div class="order-detail-item">';
      if (itemImg) body += '<img class="order-detail-item-img" src="' + esc(itemImg) + '" onerror="this.style.display=\'none\'">';
      else body += '<div class="order-detail-item-img" style="display:flex;align-items:center;justify-content:center;font-size:18px;opacity:.4">🍽️</div>';
      body += '<div class="order-detail-item-info">';
      body += '<div class="order-detail-item-name">' + esc(itemName) + '</div>';
      body += '<div class="order-detail-item-meta">Qty: ' + itemQty + (itemPrice ? ' × ' + fmtNaira(itemPrice) : '') + '</div>';
      if (itemDesc) body += '<div class="order-detail-item-desc">' + esc(itemDesc) + '</div>';
      if (item.extras && item.extras.length) {
        var extrasTxt = item.extras.map(function(ex) {
          var t = ex.name || 'Extra';
          if (ex.quantity && ex.quantity > 1) t += ' ×' + ex.quantity;
          t += ' (' + fmtNaira(ex.total != null ? ex.total : (ex.price || 0)) + ')';
          return t;
        }).join(', ');
        body += '<div class="order-detail-item-extras">Extras: ' + esc(extrasTxt) + '</div>';
      }
      if (item.extrasPrice) body += '<div class="order-detail-item-meta">Extras Total: ' + fmtNaira(item.extrasPrice) + '</div>';
      body += '</div>';
      body += '<div class="order-detail-item-price">' + fmtNaira(itemTotal) + '</div>';
      body += '</div>';
    });
    body += '</div></div>';
  }

  // Price Breakdown
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Price Breakdown</div>';
  body += '<div class="order-detail-charges">';
  body += orderChargeRows(o);
  body += '</div></div>';

  // Payment Information
  if (o.paymentStatus || payment.paymentMethod || paymentInfo.transactionId || payment.walletDebited) {
    body += '<div class="order-detail-section">';
    body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Payment Information</div>';
    body += '<div class="order-detail-grid">';
    body += detailField('Payment Method', payment.paymentMethod || paymentInfo.paymentMethod || '');
    body += detailField('Payment Status', o.paymentStatus || paymentInfo.status || '');
    body += detailField('Transaction ID', paymentInfo.transactionId || '');
    body += detailField('Amount Debited', payment.walletDebited ? fmtNaira(payment.walletDebited) : '');
    body += detailField('Balance Before', payment.balanceBefore != null ? fmtNaira(payment.balanceBefore) : '');
    body += detailField('Balance After', payment.balanceAfter != null ? fmtNaira(payment.balanceAfter) : '');
    body += detailField('Paid At', paymentInfo.paidAt ? fmtDate(paymentInfo.paidAt) : '');
    body += detailField('Currency', paymentInfo.currency || '');
    body += '</div></div>';
  }

  if (typeof refundActionsHtml === 'function' && o.orderReference) {
    body += refundActionsHtml('food', o.orderReference, { paymentStatus: o.paymentStatus });
  }

  // Notes
  if (o.notes || o.specialInstructions) {
    body += '<div class="order-detail-section">';
    body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Notes</div>';
    body += '<div class="order-detail-notes">' + esc(o.notes || o.specialInstructions) + '</div></div>';
  }

  // Timeline
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Timeline</div>';
  body += '<div class="order-detail-grid">';
  body += detailField('Created', o.createdAt ? fmtDate(o.createdAt) : '');
  body += detailField('Last Updated', o.updatedAt ? fmtDate(o.updatedAt) : '');
  body += detailField('Placed', timeline.placedAt ? fmtDate(timeline.placedAt) : '');
  body += detailField('Accepted', timeline.acceptedAt ? fmtDate(timeline.acceptedAt) : '');
  body += detailField('Declined', timeline.declinedAt ? fmtDate(timeline.declinedAt) : '');
  body += detailField('Food Processing', timeline.processingAt ? fmtDate(timeline.processingAt) : (timeline.preparingAt ? fmtDate(timeline.preparingAt) : ''));
  body += detailField('Completed', timeline.completedAt ? fmtDate(timeline.completedAt) : '');
  body += detailField('Out for Delivery', timeline.deliveryAt ? fmtDate(timeline.deliveryAt) : '');
  body += detailField('Preparing', timeline.preparingAt ? fmtDate(timeline.preparingAt) : '');
  body += detailField('Ready for Pickup', timeline.readyAt ? fmtDate(timeline.readyAt) : '');
  body += detailField('Rider Assigned', timeline.riderAssignedAt ? fmtDate(timeline.riderAssignedAt) : '');
  body += detailField('Picked Up', timeline.pickedUpAt ? fmtDate(timeline.pickedUpAt) : '');
  body += detailField('Delivered', (timeline.deliveredAt || o.deliveredAt) ? fmtDate(timeline.deliveredAt || o.deliveredAt) : '');
  body += detailField('Cancelled', timeline.cancelledAt ? fmtDate(timeline.cancelledAt) : '');
  body += detailField('Refunded', timeline.refundedAt ? fmtDate(timeline.refundedAt) : '');
  body += '</div></div>';

  document.getElementById('orderModalBody').innerHTML = body;
  document.getElementById('orderModal').classList.add('on');
  document.body.style.overflow = 'hidden';
  orderModalActiveId = id;
  initOrderMap(o);
  startOrderModalPoll();
}

function closeOrderModal() {
  oiActiveId = null;
  orderModalActiveId = null;
  stopOrderModalPoll();
  destroyOrderMap();
  var itemsModal = document.getElementById('orderItemsModal');
  if (itemsModal) itemsModal.classList.remove('on');
  document.getElementById('orderModal').classList.remove('on');
  document.body.style.overflow = '';
}

// ═══════════════ ORDER STATUS ACTIONS ═══════════════
// Pending → Accept / Decline → Food Processing → Completed → Food Delivery

function runOrderAction(id, action, body, btn) {
  var o = cachedOrders[id];
  if (!o) return;
  var ref = o.orderReference || id;

  if (btn) btn.disabled = true;
  load(true);

  api('POST', '/orders/' + encodeURIComponent(ref) + '/' + action, body || undefined).then(function(res) {
    var order = res.data && res.data.order;
    if (order && order.id != null) cachedOrders[order.id] = order;
    toast(res.message || 'Order status updated');
    return loadAllData().then(function() {
      renderOrders(cachedOrders);
      if (orderModalActiveId != null && cachedOrders[orderModalActiveId]) {
        openOrderModal(orderModalActiveId);
      }
    });
  }).catch(function(e) {
    toast('Error: ' + e.message, false);
  }).finally(function() {
    load(false);
    if (btn) btn.disabled = false;
  });
}

// ─── Decline modal (requires a problem/reason) ───

var declineOrderId = null;
var declineBulkMode = false;

function setDeclineModalTexts(bulk) {
  var titleEl = document.getElementById('decline-title');
  var descEl = document.getElementById('decline-desc');
  if (titleEl) titleEl.textContent = bulk ? 'Decline Selected Orders' : 'Decline Order';
  if (descEl) {
    descEl.textContent = bulk
      ? 'Explain the problem with these orders. The reason will be saved with each selected order and shown in Order Details.'
      : 'Explain the problem with this order. The reason will be saved with the order and shown in Order Details.';
  }
}

function showDeclineModal() {
  var reasonEl = document.getElementById('decline-reason');
  var errEl = document.getElementById('decline-err');
  if (reasonEl) reasonEl.value = '';
  if (errEl) errEl.textContent = '';
  document.getElementById('declineModal').classList.add('on');
  setTimeout(function() { if (reasonEl) reasonEl.focus(); }, 120);
}

function openDeclineModal(id) {
  if (!cachedOrders[id]) return;
  declineBulkMode = false;
  declineOrderId = id;
  setDeclineModalTexts(false);
  showDeclineModal();
}

function openBulkDeclineModal() {
  var pendingSelected = bulkSelectedIds().filter(function(id) {
    var o = cachedOrders[id];
    return o && foodOrderStage(o.status) === 'pending';
  });
  if (!pendingSelected.length) {
    toast('None of the selected orders are pending confirmation', false);
    return;
  }
  declineBulkMode = true;
  declineOrderId = null;
  setDeclineModalTexts(true);
  showDeclineModal();
}

function closeDeclineModal() {
  document.getElementById('declineModal').classList.remove('on');
  declineOrderId = null;
  declineBulkMode = false;
}

function confirmDeclineOrder() {
  var reasonEl = document.getElementById('decline-reason');
  var errEl = document.getElementById('decline-err');
  var reason = reasonEl ? reasonEl.value.trim() : '';
  if (reason.length < 3) {
    if (errEl) errEl.textContent = 'Please enter a problem/reason (at least 3 characters).';
    if (reasonEl) reasonEl.focus();
    return;
  }
  var id = declineOrderId;
  var bulk = declineBulkMode;
  closeDeclineModal();
  if (bulk) runBulkOrderAction('decline', reason);
  else runOrderAction(id, 'decline', { reason: reason });
}

// ═══════════════ ORDER AGING ═══════════════

function orderAgeInfo(o) {
  if (!o || !o.createdAt) return null;
  var stage = foodOrderStage(o.status);
  if (stage === 'declined' || stage === 'cancelled' || stage === 'refunded' || stage === 'delivered') return null;
  var created = new Date(o.createdAt).getTime();
  if (isNaN(created)) return null;
  var hours = (Date.now() - created) / 36e5;
  if (hours < ORDER_AGING_HOURS) return null;
  var days = Math.floor(hours / 24);
  return {
    hours: hours,
    label: days >= 1 ? days + 'd' : Math.floor(hours) + 'h'
  };
}

function orderAgingBadge(o) {
  var age = orderAgeInfo(o);
  if (!age) return '';
  return '<span class="order-aging-badge" title="Still open after ' + ORDER_AGING_HOURS + '+ hours">⏱ ' + age.label + '</span>';
}

// ═══════════════ BULK STATUS ACTIONS ═══════════════

var BULK_ACTION_STAGES = {
  accept: 'pending',
  decline: 'pending',
  processing: 'accepted',
  complete: 'processing',
  delivery: 'completed'
};

function bulkSelectedIds() {
  return Object.keys(orderBulkSelected).filter(function(id) { return !!cachedOrders[id]; });
}

function toggleBulkOrder(id, checked) {
  if (checked) orderBulkSelected[id] = true;
  else delete orderBulkSelected[id];
  renderBulkBar();
  renderOrders(cachedOrders);
}

function clearBulkSelection() {
  orderBulkSelected = {};
  renderBulkBar();
  renderOrders(cachedOrders);
}

function renderBulkBar() {
  var bar = document.getElementById('o-bulk-bar');
  if (!bar) return;
  var ids = bulkSelectedIds();
  if (!ids.length) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  var stages = {};
  ids.forEach(function(id) {
    var st = foodOrderStage(cachedOrders[id].status);
    stages[st] = (stages[st] || 0) + 1;
  });
  function bulkBtn(action, label, cls) {
    var n = stages[BULK_ACTION_STAGES[action]] || 0;
    return '<button type="button" class="btn btn-sm ' + cls + '"' + (n ? '' : ' disabled') +
      ' onclick="runBulkOrderAction(\'' + action + '\')">' + label + (n ? ' (' + n + ')' : '') + '</button>';
  }
  bar.style.display = 'flex';
  bar.innerHTML =
    '<span class="order-bulk-count"><strong>' + ids.length + '</strong> selected</span>' +
    '<div class="order-bulk-actions">' +
      bulkBtn('accept', 'Accept', 'btn-green') +
      bulkBtn('decline', 'Decline', 'btn-red') +
      bulkBtn('processing', 'Start Processing', 'btn-accent') +
      bulkBtn('complete', 'Mark Completed', 'btn-green') +
      bulkBtn('delivery', 'Out for Delivery', 'btn-accent') +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="clearBulkSelection()">Clear</button>' +
    '</div>';
}

function runBulkOrderAction(action, reason) {
  var neededStage = BULK_ACTION_STAGES[action];
  var ids = bulkSelectedIds().filter(function(id) {
    var o = cachedOrders[id];
    return o && foodOrderStage(o.status) === neededStage;
  });
  var total = bulkSelectedIds().length;
  if (!ids.length) {
    toast('No selected orders are ready for this action', false);
    return;
  }
  var skipped = total - ids.length;
  var refs = ids.map(function(id) {
    var o = cachedOrders[id];
    return o.orderReference || id;
  });

  var body = { action: action, orderIds: refs };
  if (action === 'decline' && reason) body.reason = reason;

  load(true);
  api('POST', '/orders/bulk', body).then(function(res) {
    var d = res.data || {};
    var failedRows = (d.results || []).filter(function(r) { return !r.ok; });
    var parts = [];
    parts.push((d.succeeded || 0) + ' of ' + refs.length + ' updated');
    if (skipped) parts.push(skipped + ' skipped (status mismatch)');
    if (failedRows.length) parts.push(failedRows.length + ' failed: ' + (failedRows[0].error || 'unknown error'));
    toast(parts.join(' · '), !failedRows.length);
    clearBulkSelection();
    return loadAllData().then(function() {
      renderOrders(cachedOrders);
      if (orderModalActiveId != null && cachedOrders[orderModalActiveId]) {
        openOrderModal(orderModalActiveId);
      }
    });
  }).catch(function(e) {
    toast('Error: ' + e.message, false);
  }).finally(function() {
    load(false);
  });
}

// ═══════════════ DRIVER ASSIGNMENT ═══════════════

function assignableDriverList() {
  var list = [];
  Object.keys(cachedDrivers).forEach(function(key) {
    var d = cachedDrivers[key];
    var status = (d.status || '').toLowerCase();
    if (status && status !== 'active') return;
    list.push(d);
  });
  list.sort(function(a, b) {
    var aOnline = (a.onlineStatus || '').toLowerCase() === 'online' ? 0 : 1;
    var bOnline = (b.onlineStatus || '').toLowerCase() === 'online' ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;
    return (Number(b.rating) || 0) - (Number(a.rating) || 0);
  });
  return list;
}

function driverOptionsHtml(currentId) {
  var list = assignableDriverList();
  if (!list.length) {
    return '<option value="">No eligible drivers (active accounts)</option>';
  }
  var html = '<option value="">Select a driver…</option>';
  list.forEach(function(d) {
    var online = (d.onlineStatus || '').toLowerCase() === 'online';
    var label = (d.fullName || d.driverId || d.id || 'Driver');
    label += ' — ' + (online ? 'Online' : 'Offline');
    if (d.rating != null && d.rating !== '') label += ' · ★' + Number(d.rating).toFixed(1);
    if (d.totalTrips) label += ' · ' + d.totalTrips + ' trips';
    html += '<option value="' + esc(d.id) + '"' + (d.id === currentId ? ' selected' : '') + '>' + esc(label) + '</option>';
  });
  return html;
}

function assignOrderDriver(id, btn) {
  var o = cachedOrders[id];
  if (!o) return;
  var sel = document.getElementById('order-driver-select');
  var driverId = sel ? sel.value : '';
  if (!driverId) {
    toast('Select a driver first', false);
    if (sel) sel.focus();
    return;
  }
  var ref = o.orderReference || id;
  if (btn) btn.disabled = true;
  load(true);

  api('POST', '/orders/' + encodeURIComponent(ref) + '/assign', { driverId: driverId }).then(function(res) {
    var order = res.data && res.data.order;
    if (order && order.id != null) cachedOrders[order.id] = order;
    toast(res.message || 'Driver assigned');
    return loadAllData().then(function() {
      renderOrders(cachedOrders);
      if (orderModalActiveId != null && cachedOrders[orderModalActiveId]) {
        openOrderModal(orderModalActiveId);
      }
    });
  }).catch(function(e) {
    toast('Error: ' + e.message, false);
  }).finally(function() {
    load(false);
    if (btn) btn.disabled = false;
  });
}

// ═══════════════ DELIVERY MAP ═══════════════

function orderMapCoords(o) {
  var t = o.tracking || {};
  var r = o.restaurant || {};
  var d = o.delivery || {};
  function coord(lat, lng) {
    if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null;
    var la = Number(lat);
    var lo = Number(lng);
    if (!isFinite(la) || !isFinite(lo) || (la === 0 && lo === 0)) return null;
    return { lat: la, lng: lo };
  }
  return {
    pickup: coord(t.restaurantLatitude, t.restaurantLongitude) || coord(r.latitude, r.longitude),
    destination: coord(t.deliveryLatitude, t.deliveryLongitude) || coord(d.latitude, d.longitude),
    rider: coord(t.riderLatitude, t.riderLongitude),
    lastUpdated: t.lastUpdated || null
  };
}

function orderMapSectionHtml(o) {
  var coords = orderMapCoords(o);
  var hasAny = coords.pickup || coords.destination || coords.rider;
  var html = '<div class="order-detail-section">';
  html += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg> Delivery Map</div>';
  if (!hasAny) {
    html += '<div class="order-map-empty">No location data has been recorded for this order yet. The pickup, drop-off and rider position appear here as soon as coordinates are captured.</div>';
  } else {
    html += '<div class="order-map" id="orderMap"></div>';
    html += '<div class="order-map-legend">';
    if (coords.pickup) html += '<span class="order-map-legend-item"><i class="is-pickup"></i>Pickup</span>';
    if (coords.destination) html += '<span class="order-map-legend-item"><i class="is-destination"></i>Destination</span>';
    if (coords.rider) html += '<span class="order-map-legend-item"><i class="is-rider"></i>Rider</span>';
    html += '</div>';
    if (coords.lastUpdated) html += '<div class="order-map-updated">Tracking last updated ' + fmtDate(coords.lastUpdated) + '</div>';
  }
  html += '</div>';
  return html;
}

function destroyOrderMap() {
  if (orderMapInstance) {
    try { orderMapInstance.remove(); } catch (_) {}
    orderMapInstance = null;
  }
}

function initOrderMap(o) {
  destroyOrderMap();
  var el = document.getElementById('orderMap');
  if (!el) return;
  var coords = orderMapCoords(o);
  if (typeof L === 'undefined') {
    el.classList.add('order-map-failed');
    el.innerHTML = '<div class="order-map-empty">The live map could not load. Check your internet connection — the coordinates are listed in the sections above.</div>';
    return;
  }
  var map = L.map(el, { scrollWheelZoom: false });
  orderMapInstance = map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  var points = [];
  function pin(pt, color, label) {
    if (!pt) return;
    var latlng = [pt.lat, pt.lng];
    points.push(latlng);
    L.circleMarker(latlng, { radius: 8, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1 })
      .addTo(map)
      .bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -8] });
  }
  pin(coords.pickup, '#22c55e', 'Pickup');
  pin(coords.destination, '#ef4444', 'Destination');
  pin(coords.rider, '#3b82f6', 'Rider');
  if (coords.pickup && coords.destination) {
    L.polyline(
      [[coords.pickup.lat, coords.pickup.lng], [coords.destination.lat, coords.destination.lng]],
      { color: '#3b82f6', weight: 3, opacity: 0.7, dashArray: '8 8' }
    ).addTo(map);
  }
  if (points.length > 1) map.fitBounds(points, { padding: [35, 35] });
  else map.setView(points[0], 14);
  setTimeout(function() { map.invalidateSize(); }, 150);
}

function stopOrderModalPoll() {
  if (orderMapPollTimer) {
    clearTimeout(orderMapPollTimer);
    orderMapPollTimer = null;
  }
}

function startOrderModalPoll() {
  stopOrderModalPoll();
  orderMapPollTimer = setTimeout(refreshActiveOrder, 30000);
}

// Refreshes the open order from the server so the map and timeline stay current
function refreshActiveOrder() {
  var id = orderModalActiveId;
  if (id == null) return;
  var o = cachedOrders[id];
  if (!o) { startOrderModalPoll(); return; }
  var ref = o.orderReference || id;

  api('GET', '/orders/' + encodeURIComponent(ref)).then(function(res) {
    var fresh = res.data;
    if (!fresh || fresh.id == null || orderModalActiveId == null) return;
    cachedOrders[fresh.id] = fresh;
    var bodyEl = document.getElementById('orderModalBody');
    var scrollPos = bodyEl ? bodyEl.scrollTop : 0;
    openOrderModal(fresh.id);
    var newBody = document.getElementById('orderModalBody');
    if (newBody) newBody.scrollTop = scrollPos;
    renderOrders(cachedOrders);
  }).catch(function() {
    // transient fetch errors are ignored; polling resumes
  }).finally(function() {
    if (orderModalActiveId != null) startOrderModalPoll();
  });
}

// ═══════════════ ORDER ITEMS MODAL ═══════════════

var oiActiveId = null;

function oiChip(icon, label, value) {
  if (value === null || value === undefined || value === '') return '';
  return '<span class="oi-chip">' + icon + (label ? esc(label) : '') + '<strong>' + esc(String(value)) + '</strong></span>';
}

function oiToList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter(function(v) { return v !== null && v !== undefined && v !== ''; }).map(String);
  }
  if (typeof value === 'string') {
    var t = value.trim();
    if (!t) return [];
    if (t.charAt(0) === '[' || t.charAt(0) === '"') {
      try {
        var p = JSON.parse(t);
        if (Array.isArray(p)) return oiToList(p);
        if (p !== null && p !== undefined && p !== '') return [String(p)];
      } catch (_) {}
    }
    return t.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  }
  return [];
}

function oiOptionBadge(op) {
  if (op === null || op === undefined || op === '') return '';
  if (typeof op === 'string' || typeof op === 'number') return '<span class="oi-badge">' + esc(String(op)) + '</span>';
  if (typeof op !== 'object') return '';
  var name = op.name || op.label || op.title || op.optionName || '';
  if (!name) return '';
  var qty = op.quantity != null ? op.quantity : op.qty;
  var price = op.price != null ? op.price : (op.unitPrice != null ? op.unitPrice : (op.extraPrice != null ? op.extraPrice : op.additionalPrice));
  var total = op.total != null ? op.total : null;
  var txt = String(name);
  if (qty != null && Number(qty) > 1) txt += ' ×' + qty;
  if (price != null && Number(price) !== 0) txt += ' +' + fmtNaira(price);
  else if (total != null && Number(total) !== 0) txt += ' +' + fmtNaira(total);
  return '<span class="oi-badge">' + esc(txt) + '</span>';
}

function oiOptionBadges(item) {
  var badges = '';
  var sources = [item.options, item.addOns, item.addons, item.modifiers, item.customizations, item.selectedOptions];
  sources.forEach(function(src) {
    if (src === null || src === undefined || src === '') return;
    if (Array.isArray(src)) {
      src.forEach(function(op) { badges += oiOptionBadge(op); });
    } else if (typeof src === 'string') {
      badges += '<span class="oi-badge">' + esc(src) + '</span>';
    } else if (typeof src === 'object') {
      Object.keys(src).forEach(function(k) {
        var v = src[k];
        if (v === false || v === null || v === undefined || v === '') return;
        if (v === true) badges += '<span class="oi-badge">' + esc(k) + '</span>';
        else if (typeof v === 'number') badges += '<span class="oi-badge">' + esc(k) + ' +' + fmtNaira(v) + '</span>';
        else badges += '<span class="oi-badge">' + esc(k + ': ' + v) + '</span>';
      });
    }
  });
  if (item.size) badges += '<span class="oi-badge">Size: ' + esc(String(item.size)) + '</span>';
  if (item.portion) badges += '<span class="oi-badge">Portion: ' + esc(String(item.portion)) + '</span>';
  if (item.flavor) badges += '<span class="oi-badge">Flavor: ' + esc(String(item.flavor)) + '</span>';
  if (item.variant) badges += '<span class="oi-badge">Variant: ' + esc(String(item.variant)) + '</span>';
  return badges;
}

function renderOrderItemCard(item, index, order) {
  item = item || {};
  order = order || {};
  var food = findOrderItemFood(item);
  var catalog = order.foodCatalog || null;

  // raw food document saved on the order (real persisted data) — fills fields the mapped item may lack
  var savedFood = null;
  if (order.food && typeof order.food === 'object' && !Array.isArray(order.food)) {
    if (item === order.food || (order.items && order.items[0] === item)) savedFood = order.food;
  }
  var src = item;
  if (savedFood && savedFood !== item) {
    src = {};
    Object.keys(savedFood).forEach(function(k) { src[k] = savedFood[k]; });
    Object.keys(item).forEach(function(k) { src[k] = item[k]; });
  }

  var name = src.name || src.foodName || (food && food.name) || 'Unknown Item';
  var rawQty = src.quantity != null ? src.quantity : (src.qty != null ? src.qty : 1);
  var qty = Number(rawQty) || 1;
  var price = src.price != null ? src.price :
    (src.unitPrice != null ? src.unitPrice :
    (src.rate != null ? src.rate :
    (food && food.price != null ? food.price : 0)));
  var img = src.image || src.foodImage || (food && food.image) || '';
  var desc = src.description || src.desc || (food && food.description) || '';
  var note = src.notes || src.specialInstructions || src.instructions || src.comment || '';
  var lineTotal = src.total != null ? src.total :
    (src.itemTotal != null ? src.itemTotal :
    (src.lineTotal != null ? src.lineTotal : Number(price) * qty));

  // Type / variant / portion / flavor — real saved or catalog fields only
  var category = src.category || (catalog && catalog.category) || (food && food.category) || '';
  var prepTime = src.prepTime || (catalog && catalog.prepTime) || (food && food.prepTime) || '';
  var servingSize = src.servingSize || (catalog && catalog.servingSize) || (food && food.servingSize) || '';
  var spicyLevel = src.spicyLevel || (catalog && catalog.spicyLevel) || (food && food.spicyLevel) || '';

  var ingredients = oiToList(src.ingredients);
  if (!ingredients.length && catalog) ingredients = oiToList(catalog.ingredients);
  if (!ingredients.length && food) ingredients = oiToList(food.ingredients);

  var foodId = (src.foodId != null && src.foodId !== '') ? src.foodId :
    ((order.foodId != null && order.foodId !== '') ? order.foodId :
    ((catalog && catalog.id != null) ? catalog.id :
    ((food && food.id != null) ? food.id : null)));

  var metaBadges = '';
  if (category) metaBadges += '<span class="oi-badge oi-badge-muted">' + esc(String(category).replace(/,/g, ', ')) + '</span>';
  if (prepTime) metaBadges += '<span class="oi-badge oi-badge-muted">Prep: ' + esc(prepTime) + '</span>';
  if (servingSize) metaBadges += '<span class="oi-badge oi-badge-muted">Serving: ' + esc(String(servingSize)) + '</span>';
  if (spicyLevel) metaBadges += '<span class="oi-badge oi-badge-muted">Spicy: ' + esc(String(spicyLevel)) + '</span>';
  if (foodId !== null && foodId !== '') metaBadges += '<span class="oi-badge oi-badge-muted">Food ID: ' + esc(String(foodId)) + '</span>';

  // Options / add-ons / customizations / size / variant if present on the saved item
  var optionBadges = oiOptionBadges(src);

  // Customer selections (toppings, add-ons, options, extras) — every selection the customer made
  var extras = (src.extras && src.extras.length) ? src.extras : [];
  var selHtml = '';
  if (extras.length) {
    var extrasTotal = src.extrasPrice != null ? src.extrasPrice : null;
    if (extrasTotal == null) {
      extrasTotal = extras.reduce(function(s, ex) {
        if (ex == null) return s;
        if (typeof ex !== 'object') return s;
        var t = ex.total != null ? Number(ex.total) : (Number(ex.price) || 0) * (Number(ex.quantity != null ? ex.quantity : ex.qty) || 1);
        return s + (Number(t) || 0);
      }, 0);
    }
    selHtml = '<div class="oi-sel">';
    selHtml += '<div class="oi-sel-head"><span class="oi-sel-title">Customer Selections</span><span class="oi-sel-count">' + extras.length + ' selected</span></div>';
    extras.forEach(function(ex) {
      if (ex === null || ex === undefined) return;
      if (typeof ex === 'string' || typeof ex === 'number') {
        selHtml += '<div class="oi-sel-row"><span class="oi-sel-name">' + esc(String(ex)) + '</span><span class="oi-sel-unit"></span><span class="oi-sel-total"></span></div>';
        return;
      }
      var en = ex.name || ex.label || ex.title || ex.optionName || 'Selection';
      var eqRaw = ex.quantity != null ? ex.quantity : ex.qty;
      var eq = Number(eqRaw);
      if (!eq || eq < 1) eq = 1;
      var epRaw = ex.price != null ? ex.price : (ex.unitPrice != null ? ex.unitPrice : (ex.extraPrice != null ? ex.extraPrice : null));
      var ep = epRaw != null ? Number(epRaw) : 0;
      if (!Number.isFinite(ep)) ep = 0;
      var et = ex.total != null ? Number(ex.total) : ep * eq;
      if (!Number.isFinite(et)) et = 0;
      selHtml += '<div class="oi-sel-row">' +
        '<span class="oi-sel-name">' + esc(String(en)) + (eq > 1 ? ' <span class="oi-sel-qty">&times;' + eq + '</span>' : '') + '</span>' +
        '<span class="oi-sel-unit">' + (eq > 1 && ep ? fmtNaira(ep) + ' each' : '') + '</span>' +
        '<span class="oi-sel-total">' + fmtNaira(et) + '</span>' +
      '</div>';
    });
    selHtml += '<div class="oi-sel-foot"><span>Selections Total</span><span>' + fmtNaira(extrasTotal) + '</span></div>';
    selHtml += '</div>';
  }

  // Ingredients of the ordered food (catalog data)
  var ingHtml = '';
  if (ingredients.length) {
    ingHtml = '<div class="oi-sub">';
    ingHtml += '<div class="oi-sub-label">Ingredients</div>';
    ingHtml += '<div class="oi-ing-list">';
    ingredients.forEach(function(x) { ingHtml += '<span class="oi-badge oi-badge-muted">' + esc(String(x)) + '</span>'; });
    ingHtml += '</div></div>';
  }

  var html = '<div class="oi-item">';
  html += '<div class="oi-item-img-wrap">';
  if (img) html += '<img class="oi-item-img" src="' + esc(img) + '" alt="' + esc(name) + '" onerror="this.outerHTML=\'<div class=oi-item-img-fallback>🍽️</div>\'">';
  else html += '<div class="oi-item-img-fallback">🍽️</div>';
  html += '<span class="oi-item-index">' + (index + 1) + '</span>';
  html += '</div>';
  html += '<div class="oi-item-main">';
  html += '<div class="oi-item-head">' +
    '<div class="oi-item-name">' + esc(name) + '</div>' +
    '<div class="oi-item-total">' + fmtNaira(lineTotal) + '</div>' +
  '</div>';
  html += '<div class="oi-item-price-line"><b>Qty ' + qty + '</b> &times; ' + fmtNaira(price) + ' per item</div>';
  if (desc) html += '<div class="oi-item-desc">' + esc(desc) + '</div>';
  if (metaBadges) html += '<div class="oi-badges">' + metaBadges + '</div>';
  if (optionBadges) html += '<div class="oi-badges">' + optionBadges + '</div>';
  if (ingHtml) html += ingHtml;
  if (selHtml) html += selHtml;
  if (note) {
    html += '<div class="oi-item-note">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
      '<span>' + esc(note) + '</span>' +
    '</div>';
  }
  html += '</div></div>';
  return html;
}

function renderOrderItemsModal(o) {
  if (!o) return;

  var items = getOrderItems(o);
  var delivery = o.delivery || {};
  var restaurant = o.restaurant || {};

  document.getElementById('orderItemsModalRef').textContent = o.orderReference || o.id || '';

  var icoPin = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  var icoUser = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  var icoBag = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
  var icoClock = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  var body = '';

  body += '<div class="oi-refresh" id="oiRefresh">Loading full order…</div>';

  // Summary strip
  body += '<div class="oi-summary">';
  body += oiChip(icoPin, 'Restaurant', o.restaurantName || restaurant.name || 'N/A');
  body += oiChip(icoUser, 'Customer', o.customerName || (o.customer && o.customer.name) || 'N/A');
  body += oiChip(icoBag, '', items.length + ' item' + (items.length !== 1 ? 's' : ''));
  if (o.itemsCount != null) body += oiChip(icoBag, 'Total Qty', o.itemsCount);
  body += oiChip(icoClock, '', o.createdAt ? fmtDate(o.createdAt) : '');
  body += orderStatusBadgeLarge(o.status);
  if (o.paymentStatus) body += paymentStatusBadge(o.paymentStatus);
  body += '</div>';

  // Ordered items — each food separately with its full customer configuration
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label">' + icoBag + ' Ordered Items</div>';
  if (items.length) {
    body += '<div class="oi-list">';
    items.forEach(function(item, i) { body += renderOrderItemCard(item, i, o); });
    body += '</div>';
  } else {
    body += '<div class="oi-empty">' +
      '<div class="oi-empty-icon">🍽️</div>' +
      '<div class="oi-empty-title">No items found</div>' +
      '<div class="oi-empty-text">This order does not contain any food items.</div>' +
    '</div>';
  }
  body += '</div>';

  // Special instructions — order notes and delivery instructions (real saved text only)
  var orderNotes = o.notes || o.specialInstructions || '';
  var deliveryInstr = delivery.deliveryInstructions || '';
  var notesHtml = '';
  if (orderNotes) notesHtml += '<div class="order-detail-notes">' + esc(orderNotes) + '</div>';
  if (deliveryInstr && deliveryInstr !== orderNotes) {
    notesHtml += '<div class="order-detail-notes' + (orderNotes ? ' oi-notes-gap' : '') + '">' + esc(deliveryInstr) + '</div>';
  }
  if (notesHtml) {
    body += '<div class="order-detail-section">';
    body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Special Instructions</div>';
    body += notesHtml;
    body += '</div>';
  }

  // Totals
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Price Breakdown</div>';
  body += '<div class="order-detail-charges">';
  body += orderChargeRows(o);
  body += '</div></div>';

  var bodyEl = document.getElementById('orderItemsModalBody');
  bodyEl.innerHTML = body;
  bodyEl.scrollTop = 0;
}

function openOrderItemsModal(id) {
  var o = cachedOrders[id];
  if (!o) return;

  oiActiveId = id;
  renderOrderItemsModal(o);
  document.getElementById('orderItemsModal').classList.add('on');
  document.body.style.overflow = 'hidden';

  // Load the complete original customer order (every selection saved for it)
  var ref = o.orderReference || id;
  var ind = document.getElementById('oiRefresh');
  if (ind) ind.style.display = 'flex';
  api('GET', '/orders/' + encodeURIComponent(ref)).then(function(res) {
    var fresh = res && res.data;
    if (!fresh || fresh.id == null) return;
    cachedOrders[fresh.id] = fresh;
    if (oiActiveId !== id) return;
    var modal = document.getElementById('orderItemsModal');
    if (!modal || !modal.classList.contains('on')) return;
    renderOrderItemsModal(fresh);
  }).catch(function() {
    // keep the already-rendered cached order if the detail fetch fails
  }).then(function() {
    if (oiActiveId !== id) return;
    var el = document.getElementById('oiRefresh');
    if (el) el.style.display = 'none';
  });
}

function closeOrderItemsModal() {
  oiActiveId = null;
  var m = document.getElementById('orderItemsModal');
  if (m) m.classList.remove('on');
  var om = document.getElementById('orderModal');
  if (!om || !om.classList.contains('on')) document.body.style.overflow = '';
}

document.addEventListener('click', function(e) {
  var declineBg = document.getElementById('declineModal');
  if (declineBg && e.target === declineBg) { closeDeclineModal(); return; }
  var itemsBg = document.getElementById('orderItemsModal');
  if (itemsBg && e.target === itemsBg) { closeOrderItemsModal(); return; }
  var bg = document.getElementById('orderModal');
  if (bg && e.target === bg) closeOrderModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var declineBg = document.getElementById('declineModal');
  if (declineBg && declineBg.classList.contains('on')) { closeDeclineModal(); return; }
  var itemsBg = document.getElementById('orderItemsModal');
  if (itemsBg && itemsBg.classList.contains('on')) { closeOrderItemsModal(); return; }
  var bg = document.getElementById('orderModal');
  if (bg && bg.classList.contains('on')) closeOrderModal();
});

