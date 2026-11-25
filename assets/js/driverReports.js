// Driver reports moderation. This manages allegations and their review trail;
// it deliberately does not suspend drivers or send moderation notifications.
var drState = { q: '', status: '', category: '', loaded: false, loading: false, reviewers: [] };
var drActive = null;
var drDetail = null;
var drSearchTimer = null;

function drEsc(value) { return esc(value == null ? '' : String(value)); }
function drStatusLabel(status) { return ({ pending: 'Pending', under_review: 'Under review', resolved: 'Resolved', dismissed: 'Dismissed' })[status] || status || 'Unknown'; }
function drStatusTag(status) { var cls = status === 'resolved' ? 'tag-confirmed' : status === 'dismissed' ? 'tag-cancelled' : status === 'under_review' ? 'tag-preparing' : 'tag-pending'; return '<span class="tag ' + cls + '">' + drEsc(drStatusLabel(status)) + '</span>'; }
function drHasFilters() { return !!(drState.q || drState.status || drState.category); }
function drPath() { var s = kitList('driver-reports', { limit: 20, sort: 'created', dir: 'desc' }), p = '/driver-reports?page=' + s.page + '&limit=' + s.limit + '&sort=' + s.sort + '&dir=' + s.dir; if (drState.q) p += '&q=' + encodeURIComponent(drState.q); if (drState.status) p += '&status=' + encodeURIComponent(drState.status); if (drState.category) p += '&category=' + encodeURIComponent(drState.category); return p; }

function loadDriverReports(force) {
  if (drState.loading) return;
  if (!force && drState.loaded) return;
  drState.loading = true;
  var body = document.getElementById('dr-list');
  if (body) body.innerHTML = '<tr><td colspan="7"><div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading driver reports...</div></div></td></tr>';
  Promise.all([api('GET', drPath()), drState.reviewers.length ? Promise.resolve(null) : api('GET', '/driver-reports/reviewers')]).then(function(results) {
    var res = results[0], data = res.data || {};
    if (results[1] && results[1].data) drState.reviewers = results[1].data.reviewers || [];
    drState.loaded = true;
    var stats = data.stats || {};
    ['pending', 'review', 'resolved', 'dismissed'].forEach(function(k) { var map = { review: 'under_review' }; var el = document.getElementById('dr-s-' + k); if (el) el.textContent = Number(stats[map[k] || k] || 0).toLocaleString(); });
    drRender(data.reports || []);
    kitRenderPager('dr-pagination', 'driver-reports', res.pagination || null, function() { loadDriverReports(true); });
  }).catch(function(e) { if (body) body.innerHTML = '<tr><td colspan="7"><div class="drv-error"><div class="drv-error-title">Failed to load driver reports</div><div class="drv-error-text">' + drEsc(e.message) + '</div><button class="btn btn-accent btn-sm" onclick="loadDriverReports(true)">Retry</button></div></td></tr>'; toast('Error: ' + e.message, false); }).finally(function() { drState.loading = false; });
}

function drRender(reports) {
  var body = document.getElementById('dr-list');
  if (!body) return;
  if (!reports.length) { body.innerHTML = '<tr><td colspan="7"><div class="drv-empty-inline"><div class="drv-empty-inline-icon">✓</div><div class="drv-empty-inline-text">No driver reports match these filters.</div></div></td></tr>'; return; }
  body.innerHTML = reports.map(function(r) {
    return '<tr class="dr-row" tabindex="0" onclick="drOpen(\'' + drEsc(r.reportId) + '\')" onkeydown="if(event.key===\'Enter\')drOpen(\'' + drEsc(r.reportId) + '\')">' +
      '<td><strong>' + drEsc(r.reportId) + '</strong><small>' + drEsc(r.bookingNumber || 'No ride') + '</small></td>' +
      '<td>' + drEsc(r.passenger && r.passenger.name) + '<small>' + drEsc(r.passenger && r.passenger.email) + '</small></td>' +
      '<td>' + drEsc(r.driver && r.driver.name) + '<small>' + drEsc(r.driver && r.driver.id) + '</small></td>' +
      '<td>' + drEsc(r.reason) + '</td><td>' + drStatusTag(r.status) + '</td><td>' + drEsc(fmtDate(r.createdAt)) + '</td>' +
      '<td><button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation();drOpen(\'' + drEsc(r.reportId) + '\')">Review</button></td></tr>';
  }).join('');
}

function drSearch(value) { clearTimeout(drSearchTimer); drSearchTimer = setTimeout(function() { drState.q = String(value || '').trim(); kitSetPage('driver-reports', 1); drApplyFilters(); }, 250); }
function drApplyFilters() { var s = document.getElementById('dr-status'), c = document.getElementById('dr-category'), clear = document.getElementById('dr-clear'); drState.status = s ? s.value : ''; drState.category = c ? c.value.trim() : ''; if (clear) clear.style.display = drHasFilters() ? '' : 'none'; kitSetPage('driver-reports', 1); drState.loaded = false; loadDriverReports(true); }
function drClearFilters() { drState.q = drState.status = drState.category = ''; ['dr-search', 'dr-category'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; }); var s = document.getElementById('dr-status'); if (s) s.value = ''; drApplyFilters(); }

function drOpen(id) {
  drActive = id; drDetail = null;
  var modal = document.getElementById('drModal'), body = document.getElementById('dr-modal-body');
  if (!modal || !body) return;
  rvSetText('dr-modal-title', 'Driver report'); rvSetText('dr-modal-ref', id); body.innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading report details...</div></div>';
  modal.classList.add('on'); document.body.style.overflow = 'hidden';
  api('GET', '/driver-reports/' + encodeURIComponent(id)).then(function(res) { if (drActive !== id) return; drDetail = res.data || null; drRenderModal(); }).catch(function(e) { body.innerHTML = '<div class="drv-error"><div class="drv-error-title">Unable to load report</div><div class="drv-error-text">' + drEsc(e.message) + '</div></div>'; });
}
function drCloseModal() { var modal = document.getElementById('drModal'); if (modal) modal.classList.remove('on'); if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = ''; drActive = null; drDetail = null; }
function drField(label, value, wide) { if (value == null || value === '') return ''; return '<div class="order-detail-field' + (wide ? ' order-detail-field-wide' : '') + '"><div class="order-detail-field-label">' + drEsc(label) + '</div><div class="order-detail-field-value">' + drEsc(value) + '</div></div>'; }
function drSection(label, inner) { return inner ? '<div class="order-detail-section dr-detail-section"><div class="order-detail-label">' + drEsc(label) + '</div>' + inner + '</div>' : ''; }
function drReviewers(selected) { return '<select id="dr-assignee" onchange="drAssign(this.value)"><option value="">Unassigned</option>' + drState.reviewers.map(function(a) { return '<option value="' + drEsc(a.id) + '"' + (String(a.id) === String(selected || '') ? ' selected' : '') + '>' + drEsc(a.name) + '</option>'; }).join('') + '</select>'; }
function drActivity(items) { if (!items || !items.length) return '<div class="drv-empty-inline"><div class="drv-empty-inline-text">No activity recorded.</div></div>'; return '<ol class="dr-activity">' + items.map(function(a) { var title = a.action === 'submitted' ? 'Report submitted' : a.action === 'note_added' ? 'Investigation note added' : a.action === 'assigned' ? 'Reviewer assigned' : 'Status updated'; return '<li><span class="dr-activity-dot">' + (a.action === 'status_changed' ? '↻' : '•') + '</span><div><strong>' + drEsc(title) + '</strong><small>' + drEsc(a.actor) + ' · ' + drEsc(fmtDate(a.createdAt)) + '</small>' + (a.fromStatus || a.toStatus ? '<p>' + drEsc(a.fromStatus ? drStatusLabel(a.fromStatus) + ' → ' + drStatusLabel(a.toStatus) : drStatusLabel(a.toStatus)) + '</p>' : '') + (a.note ? '<p>' + drEsc(a.note) + '</p>' : '') + '</div></li>'; }).join('') + '</ol>'; }

function drRenderModal() {
  var d = drDetail, r = d && d.report, body = document.getElementById('dr-modal-body'); if (!r || !body) return;
  rvSetText('dr-modal-ref', r.reportId + ' · ' + drStatusLabel(r.status));
  var p = r.passenger || {}, driver = r.driver || {}, ride = r.ride || {};
  var html = '<div class="dr-detail-status">' + drStatusTag(r.status) + '<span>Submitted ' + drEsc(fmtDate(r.createdAt)) + '</span></div>';
  html += drSection('Report', '<div class="order-detail-grid">' + drField('Report ID', r.reportId) + drField('Category / reason', r.reason) + drField('Submitted', fmtDate(r.createdAt)) + drField('Ride', r.bookingNumber) + '</div><div class="order-detail-notes dr-description">' + drEsc(r.description || 'No description provided.') + '</div>');
  html += drSection('People involved', '<div class="order-detail-grid"><div class="dr-person"><strong>Reporting passenger</strong>' + drField('Name', p.name) + drField('Email', p.email) + drField('Phone', p.phone) + '</div><div class="dr-person"><strong>Reported driver</strong>' + drField('Name', driver.name) + drField('Driver ID', driver.id) + drField('Phone', driver.phone) + '</div></div>');
  html += drSection('Associated ride', '<div class="order-detail-grid">' + drField('Booking number', ride.bookingNumber) + drField('Ride status', ride.status) + drField('Pickup', ride.pickup, true) + drField('Destination', ride.destination, true) + '</div>');
  html += '<div class="dr-review-controls"><div class="dr-control"><label for="dr-assignee">Assigned reviewer</label>' + drReviewers(r.assignedReviewer && r.assignedReviewer.id) + '</div><div class="dr-control"><label for="dr-new-status">Update status</label><select id="dr-new-status"><option value="pending">Pending</option><option value="under_review">Under review</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div><div class="dr-control dr-control-wide"><label for="dr-resolution">Resolution / status reason</label><textarea id="dr-resolution" maxlength="5000" placeholder="Required when resolving or dismissing..."></textarea></div><div class="dr-controls-actions"><button type="button" class="btn btn-accent" onclick="drSaveStatus()">Save review decision</button></div></div>';
  html += drSection('Internal investigation notes', '<form class="dr-note-form" onsubmit="drAddNote(event)"><textarea id="dr-note" maxlength="5000" placeholder="Private note for administrators only..."></textarea><button type="submit" class="btn btn-ghost btn-sm">Add internal note</button></form>');
  html += drSection('Resolution', r.resolutionNote ? '<div class="order-detail-notes">' + drEsc(r.resolutionNote) + (r.resolvedBy ? '<br><small>By ' + drEsc(r.resolvedBy.name) + ' · ' + drEsc(fmtDate(r.resolvedAt)) + '</small>' : '') + '</div>' : '<div class="drv-empty-inline"><div class="drv-empty-inline-text">No resolution recorded.</div></div>');
  html += drSection('Activity history', drActivity(d.activity));
  body.innerHTML = html; var status = document.getElementById('dr-new-status'); if (status) status.value = r.status;
}

function drAssign(value) { if (!hasPerm('drivers.manage')) { toast('You do not have permission to manage driver reports.', false); return; } if (!drActive) return; var current = drDetail.report.status, payload = { status: current, assignedAdminId: value || null }; if (current === 'resolved' || current === 'dismissed') payload.resolutionReason = drDetail.report.resolutionNote || 'Existing decision retained'; api('PATCH', '/driver-reports/' + encodeURIComponent(drActive), payload).then(function(res) { drDetail.report = res.data.report; drRenderModal(); toast('Reviewer assignment saved', true); loadDriverReports(true); }).catch(function(e) { toast('Error: ' + e.message, false); }); }
function drSaveStatus() { if (!hasPerm('drivers.manage')) { toast('You do not have permission to manage driver reports.', false); return; } if (!drActive) return; var status = document.getElementById('dr-new-status').value, reason = (document.getElementById('dr-resolution').value || '').trim(); if ((status === 'resolved' || status === 'dismissed') && reason.length < 3) { toast('A resolution or dismissal reason is required', false); return; } api('PATCH', '/driver-reports/' + encodeURIComponent(drActive), { status: status, resolutionReason: reason }).then(function(res) { drDetail.report = res.data.report; drRenderModal(); var ntf = res.data.notification; toast('Report status saved' + (ntf && ntf.created ? ' · Notification queued' : ntf && ntf.error ? ' · Notification could not be queued' : ''), true); loadDriverReports(true); }).catch(function(e) { toast('Error: ' + e.message, false); }); }
function drAddNote(event) { event.preventDefault(); if (!hasPerm('drivers.manage')) { toast('You do not have permission to manage driver reports.', false); return; } if (!drActive) return; var ta = document.getElementById('dr-note'), note = (ta.value || '').trim(); if (note.length < 3) { toast('Investigation note must be at least 3 characters', false); return; } api('POST', '/driver-reports/' + encodeURIComponent(drActive) + '/notes', { note: note }).then(function() { ta.value = ''; return api('GET', '/driver-reports/' + encodeURIComponent(drActive)); }).then(function(res) { drDetail = res.data; drRenderModal(); toast('Internal note saved', true); }).catch(function(e) { toast('Error: ' + e.message, false); }); }

document.addEventListener('click', function(e) { var modal = document.getElementById('drModal'); if (modal && e.target === modal) drCloseModal(); });
document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && document.getElementById('drModal') && document.getElementById('drModal').classList.contains('on')) drCloseModal(); });

