// ═══════════════ ORDERS ═══════════════

var orderFilterValue = '';

function orderStatusBadge(status) {
  var s = (status || '').toLowerCase();
  var cls = 'order-status-pending';
  var label = status || 'Unknown';
  if (s === 'pending') { cls = 'order-status-pending'; label = 'Pending'; }
  else if (s === 'confirmed') { cls = 'order-status-confirmed'; label = 'Confirmed'; }
  else if (s === 'preparing') { cls = 'order-status-preparing'; label = 'Preparing'; }
  else if (s === 'ready') { cls = 'order-status-ready'; label = 'Ready'; }
  else if (s === 'assigned') { cls = 'order-status-assigned'; label = 'Assigned'; }
  else if (s === 'ontheway' || s === 'on the way') { cls = 'order-status-ontheway'; label = 'On The Way'; }
  else if (s === 'delivered') { cls = 'order-status-delivered'; label = 'Delivered'; }
  else if (s === 'cancelled') { cls = 'order-status-cancelled'; label = 'Cancelled'; }
  return '<span class="order-card-status ' + cls + '">' + esc(label) + '</span>';
}

function orderStatusBadgeLarge(status) {
  var s = (status || '').toLowerCase();
  var cls = 'order-status-pending';
  var label = status || 'Unknown';
  if (s === 'pending') { cls = 'order-status-pending'; label = 'Pending'; }
  else if (s === 'confirmed') { cls = 'order-status-confirmed'; label = 'Confirmed'; }
  else if (s === 'preparing') { cls = 'order-status-preparing'; label = 'Preparing'; }
  else if (s === 'ready') { cls = 'order-status-ready'; label = 'Ready'; }
  else if (s === 'assigned') { cls = 'order-status-assigned'; label = 'Assigned'; }
  else if (s === 'ontheway' || s === 'on the way') { cls = 'order-status-ontheway'; label = 'On The Way'; }
  else if (s === 'delivered') { cls = 'order-status-delivered'; label = 'Delivered'; }
  else if (s === 'cancelled') { cls = 'order-status-cancelled'; label = 'Cancelled'; }
  return '<span class="order-card-status ' + cls + '" style="font-size:12px;padding:5px 14px">' + esc(label) + '</span>';
}

function renderOrders(orders) {
  orders = orders || {};
  var html = '';
  var n = 0;
  var sorted = Object.keys(orders).sort(function(a,b){
    var da = orders[a].createdAt || '';
    var db2 = orders[b].createdAt || '';
    return String(db2).localeCompare(String(da));
  });
  sorted.forEach(function(id) {
    var o = orders[id];
    if (search && (o.orderReference||'').toLowerCase().indexOf(search) < 0 && (o.restaurantName||'').toLowerCase().indexOf(search) < 0 && (o.status||'').toLowerCase().indexOf(search) < 0 && (o.customerName||'').toLowerCase().indexOf(search) < 0) return;
    if (orderFilterValue) {
      var os = (o.status || '').toLowerCase();
      var fv = orderFilterValue.toLowerCase();
      if (os !== fv && !(fv === 'ontheway' && (os === 'on the way' || os === 'ontheway'))) return;
    }
    n++;

    var itemsPreview = '';
    if (o.items && o.items.length) {
      var names = o.items.map(function(item){ return item.name || item.foodName || '' }).filter(Boolean);
      itemsPreview = names.slice(0, 3).join(', ');
      if (names.length > 3) itemsPreview += ' +' + (names.length - 3) + ' more';
    }

    html += '<div class="order-card" onclick="openOrderModal(\'' + id + '\')">' +
      '<div class="order-card-header">' +
        '<span class="order-card-ref">' + esc(o.orderReference || id) + '</span>' +
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
        '<span class="order-card-date">' + fmtDate(o.createdAt) + '</span>' +
      '</div>' +
    '</div>';
  });
  document.getElementById('o-list').innerHTML = html || '<div class="order-empty"><div class="order-empty-icon">📦</div><div class="order-empty-title">No orders yet</div><div class="order-empty-text">Orders from customers will appear here once they start placing them.</div></div>';
  document.getElementById('o-count').textContent = n + ' order' + (n !== 1 ? 's' : '');
}

function filterOrders() {
  orderFilterValue = document.getElementById('o-filter').value;
  renderOrders(cachedOrders);
}

function openOrderModal(id) {
  var o = cachedOrders[id];
  if (!o) return;

  document.getElementById('orderModalTitle').textContent = 'Order Details';
  document.getElementById('orderModalRef').textContent = o.orderReference || id;

  var body = '';

  // Status
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Status</div>';
  body += '<div class="order-detail-status-row">' + orderStatusBadgeLarge(o.status);
  if (o.paymentStatus) body += orderStatusBadgeLarge(o.paymentStatus);
  body += '</div></div>';

  // Customer Info
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Customer Information</div>';
  body += '<div class="order-detail-grid">';
  body += '<div class="order-detail-field"><div class="order-detail-field-label">Name</div><div class="order-detail-field-value">' + esc(o.customerName || 'N/A') + '</div></div>';
  body += '<div class="order-detail-field"><div class="order-detail-field-label">Phone</div><div class="order-detail-field-value">' + esc(o.customerPhone || 'N/A') + '</div></div>';
  if (o.customerEmail) body += '<div class="order-detail-field order-detail-field-wide"><div class="order-detail-field-label">Email</div><div class="order-detail-field-value">' + esc(o.customerEmail) + '</div></div>';
  body += '</div></div>';

  // Delivery Info
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Delivery Information</div>';
  body += '<div class="order-detail-grid">';
  body += '<div class="order-detail-field order-detail-field-wide"><div class="order-detail-field-label">Address</div><div class="order-detail-field-value">' + esc(o.deliveryAddress || 'N/A') + '</div></div>';
  if (o.driverName) body += '<div class="order-detail-field"><div class="order-detail-field-label">Assigned Driver</div><div class="order-detail-field-value">' + esc(o.driverName) + '</div></div>';
  if (o.deliveryFee != null) body += '<div class="order-detail-field"><div class="order-detail-field-label">Delivery Fee</div><div class="order-detail-field-value">' + fmtNaira(o.deliveryFee) + '</div></div>';
  body += '</div></div>';

  // Restaurant
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg> Restaurant</div>';
  body += '<div class="order-detail-grid">';
  body += '<div class="order-detail-field order-detail-field-wide"><div class="order-detail-field-label">Name</div><div class="order-detail-field-value">' + esc(o.restaurantName || 'N/A') + '</div></div>';
  body += '</div></div>';

  // Order Items
  if (o.items && o.items.length) {
    body += '<div class="order-detail-section">';
    body += '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> Order Items</div>';
    body += '<div class="order-detail-items">';
    o.items.forEach(function(item) {
      var itemName = item.name || item.foodName || 'Unknown Item';
      var itemQty = item.quantity || item.qty || 1;
      var itemPrice = item.price || item.unitPrice || 0;
      var itemImg = item.image || item.foodImage || '';
      var itemTotal = item.total || (itemPrice * itemQty);
      body += '<div class="order-detail-item">';
      if (itemImg) body += '<img class="order-detail-item-img" src="' + esc(itemImg) + '" onerror="this.style.display=\'none\'">';
      else body += '<div class="order-detail-item-img" style="display:flex;align-items:center;justify-content:center;font-size:18px;opacity:.4">🍽️</div>';
      body += '<div class="order-detail-item-info">';
      body += '<div class="order-detail-item-name">' + esc(itemName) + '</div>';
      body += '<div class="order-detail-item-meta">Qty: ' + itemQty + (itemPrice ? ' × ' + fmtNaira(itemPrice) : '') + '</div>';
      body += '</div>';
      body += '<div class="order-detail-item-price">' + fmtNaira(itemTotal) + '</div>';
      body += '</div>';
    });
    body += '</div></div>';
  }

  // Total
  body += '<div class="order-detail-section">';
  body += '<div class="order-detail-total-row">';
  body += '<span class="order-detail-total-label">Grand Total</span>';
  body += '<span class="order-detail-total-value">' + fmtNaira(o.grandTotal) + '</span>';
  body += '</div></div>';

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
  body += '<div class="order-detail-field"><div class="order-detail-field-label">Created</div><div class="order-detail-field-value">' + fmtDate(o.createdAt) + '</div></div>';
  if (o.updatedAt) body += '<div class="order-detail-field"><div class="order-detail-field-label">Last Updated</div><div class="order-detail-field-value">' + fmtDate(o.updatedAt) + '</div></div>';
  if (o.deliveredAt) body += '<div class="order-detail-field"><div class="order-detail-field-label">Delivered At</div><div class="order-detail-field-value">' + fmtDate(o.deliveredAt) + '</div></div>';
  body += '</div></div>';

  document.getElementById('orderModalBody').innerHTML = body;
  document.getElementById('orderModal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeOrderModal() {
  document.getElementById('orderModal').classList.remove('on');
  document.body.style.overflow = '';
}

document.addEventListener('click', function(e) {
  var bg = document.getElementById('orderModal');
  if (bg && e.target === bg) closeOrderModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var bg = document.getElementById('orderModal');
    if (bg && bg.classList.contains('on')) closeOrderModal();
  }
});
