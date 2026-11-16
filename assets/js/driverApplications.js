// Server-paged applications. Generations isolate detail, mutation and login sessions.
var daListSeq = 0, daStatsSeq = 0, daDetailSeq = 0, daSession = 0;
var daCurrent = null, daBusy = false, daMutation = 0, daKey = 'driverApplications';
var daDrafts = Object.create(null), daReturnFocus = null, daConfirmFocus = null, daConfirmation = null, daBodyOverflow = '';
var daWorkflowSeq = 0, daWorkflow = null, daWorkflowFocus = null, daSending = false;
var daPreview = null, daPreviewPayload = null, daEmailViewFocus = null;
var daGenerateHtml = {}, daSendLabel = { approve: 'Send Invitation & Approve', reject: 'Send Rejection & Confirm' };
function daEl(id) { return document.getElementById(id); }
function daLabel(value) { return String(value == null ? '' : value).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, function(c) { return c.toUpperCase(); }); }
function daValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(daValue).join(', ') || '—';
  if (typeof value === 'object') return value.name || value.id || '—';
  return String(value);
}
function daId(a) { return a && (a.applicationId || a.id); }
function daIdentity(a) {
  var name = a.fullName || 'Unnamed applicant';
  var initials = name.split(/\s+/).slice(0, 2).map(function(word) { return word.charAt(0); }).join('').toUpperCase();
  return '<div class="st-admin"><span class="st-avatar" aria-hidden="true">' + esc(initials) + '</span><span class="st-admin-info"><span class="st-name">' + esc(name) + '</span><span class="st-email">' + esc(a.email || 'No email provided') + '</span></span></div><small>' + esc([daId(a), a.phone].filter(Boolean).join(' · ')) + '</small>';
}
function daDate(value) { return value ? fmtDate(value) : '—'; }
function daBadge(status) {
  var known = ['pending', 'under_review', 'needs_information', 'approved', 'rejected'];
  return '<span class="da-badge da-badge-' + (known.indexOf(status) >= 0 ? status : 'unknown') + '">' + esc(daLabel(status || 'Unknown')) + '</span>';
}
function daState(el, message, retry, label) {
  el.innerHTML = '<div class="da-state"><p></p>' + (retry ? '<button type="button" class="btn btn-ghost btn-sm">' + esc(label || 'Try again') + '</button>' : '') + '</div>';
  el.querySelector('p').textContent = message;
  if (retry) el.querySelector('button').onclick = retry;
}
function daParams() {
  var state = kitList(daKey), params = { page: state.page, limit: state.limit };
  ['search', 'status', 'vehicleType', 'operatingArea', 'from', 'to', 'sort'].forEach(function(k) { params[k] = daEl('da-' + k).value.trim(); });
  return params;
}
function loadDriverApplications() { if (hasPerm('drivers.view')) { daLoadList(); daLoadStats(); } }
async function daLoadStats() {
  if (!hasPerm('drivers.view')) return;
  var seq = ++daStatsSeq, el = daEl('da-stats');
  var keys = ['total', 'pending', 'under_review', 'needs_information', 'approved', 'rejected', 'today'];
  function render(data) { el.innerHTML = keys.map(function(k) { return '<div class="um-stat-card"><div class="um-stat-body"><div class="um-stat-value">' + esc(data[k] == null ? '—' : data[k]) + '</div><div class="um-stat-label">' + esc(daLabel(k)) + '</div></div></div>'; }).join(''); }
  render({}); el.setAttribute('aria-busy', 'true');
  try { var res = await api('GET', '/driver-applications/stats'); if (seq === daStatsSeq) render(res.data || {}); }
  catch (e) { if (seq === daStatsSeq) daState(el, 'Statistics unavailable: ' + e.message, daLoadStats); }
  finally { if (seq === daStatsSeq) el.removeAttribute('aria-busy'); }
}
async function daLoadList() {
  if (!hasPerm('drivers.view')) return;
  var seq = ++daListSeq, el = daEl('da-list'), params = daParams();
  var invalid = params.from && params.to && params.from > params.to;
  daEl('da-filter-error').hidden = !invalid;
  daEl('da-filter-error').textContent = invalid ? 'The start date must be on or before the end date.' : '';
  daEl('da-to').setCustomValidity(invalid ? 'Choose an end date on or after the start date.' : '');
  daEl('da-pager').innerHTML = '';
  if (invalid) { el.removeAttribute('aria-busy'); daState(el, 'Update the date range to view applications.'); return; }
  daState(el, 'Loading applications…'); el.setAttribute('aria-busy', 'true');
  try {
    var res = await api('GET', '/driver-applications' + kitQuery(params));
    if (seq !== daListSeq) return;
    var data = res.data || {}, rows = Array.isArray(data.applications) ? data.applications : [];
    var total = Number(data.total), page = Number(data.page), limit = Number(data.limit);
    if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid pagination response');
    daEl('da-count').textContent = total.toLocaleString() + ' matching application' + (total === 1 ? '' : 's');
    var pages = Math.max(1, Math.ceil(total / limit));
    if (page > pages) { kitList(daKey).page = pages; daLoadList(); return; }
    kitList(daKey).page = page; kitList(daKey).limit = limit;
    if (!rows.length) daState(el, 'No applications match these filters.', daClearFilters, 'Clear filters');
    else {
      el.innerHTML = '<div class="wl-table-wrap" role="region" aria-label="Driver applications" tabindex="0"><table class="wl-table da-table"><thead><tr>' + ['Applicant', 'Status', 'Vehicle', 'Operating area', 'Reviewer', 'Submitted', 'Action'].map(function(t) { return '<th scope="col">' + t + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function(a, i) {
        return '<tr><td>' + daIdentity(a) + '</td><td>' + daBadge(a.status) + '</td><td>' + esc(daValue(a.vehicleType)) + '<small>' + esc(daValue(a.vehicleMakeModel)) + '</small></td><td>' + esc(daValue(a.operatingArea)) + '</td><td>' + esc(a.reviewer ? daValue(a.reviewer) : (a.assignedAdminId ? 'Admin ' + a.assignedAdminId : 'Unassigned')) + '</td><td>' + esc(daDate(a.createdAt)) + '</td><td><button type="button" class="btn btn-ghost btn-sm" data-index="' + i + '" aria-label="Review ' + esc(a.fullName || 'application') + '">Review</button></td></tr>';
      }).join('') + '</tbody></table></div>';
      el.querySelectorAll('[data-index]').forEach(function(btn) { btn.onclick = function() { var id = daId(rows[Number(btn.dataset.index)]); if (id != null) daOpen(id); else toast('Application ID unavailable', false); }; });
    }
    kitRenderPager('da-pager', daKey, { total: total, page: page, limit: limit, totalPages: pages }, daLoadList);
  } catch (e) { if (seq === daListSeq) daState(el, 'Could not load applications: ' + e.message, daLoadList); }
  finally { if (seq === daListSeq) el.removeAttribute('aria-busy'); }
}
function daSaveDraft() { var note = daEl('da-note'); if (note && daCurrent) daDrafts[String(daId(daCurrent))] = note.value; }
function daRestoreFocus(target) {
  if (target && target.isConnected && target.getClientRects().length && !target.disabled) target.focus();
  else if (!daEl('da-modal').hidden) daEl('da-modal').querySelector('.order-modal-close').focus();
  else if (daEl('da-search').getClientRects().length) daEl('da-search').focus();
}
function daCancelConfirm() {
  daEl('da-confirm').hidden = true; daEl('da-modal').inert = false; daConfirmation = null;
  daEl('da-reason').value = ''; daEl('da-confirm-error').textContent = '';
  daRestoreFocus(daConfirmFocus); daConfirmFocus = null;
}
function daClose() {
  var wasOpen = !daEl('da-modal').hidden;
  daSaveDraft(); ++daDetailSeq; ++daMutation; ++daWorkflowSeq; daBusy = false; daSending = false;
   if (!daEl('da-document-preview').hidden) daCloseDocumentPreview();
   if (!daEl('da-email-view').hidden) daCloseEmailView();
  if (!daEl('da-approve').hidden) daWorkflowCancel('approve');
  if (!daEl('da-reject').hidden) daWorkflowCancel('reject');
  if (!daEl('da-confirm').hidden) daCancelConfirm();
  daCurrent = null; daWorkflow = null; daPreview = null; daPreviewPayload = null;
  daEl('da-modal').hidden = true; daEl('da-detail').innerHTML = '';
  if (wasOpen) { document.body.style.overflow = daBodyOverflow; daRestoreFocus(daReturnFocus); }
  daReturnFocus = null;
}
function daReset() {
  ++daSession; ++daListSeq; ++daStatsSeq; daClose(); daDrafts = Object.create(null);
  ['da-list', 'da-stats', 'da-pager'].forEach(function(id) { daEl(id).innerHTML = ''; daEl(id).removeAttribute('aria-busy'); });
  ['search', 'status', 'vehicleType', 'operatingArea', 'from', 'to', 'sort'].forEach(function(k) { daEl('da-' + k).value = ''; });
  daEl('da-filter-error').hidden = true; daEl('da-to').setCustomValidity(''); kitList(daKey).page = 1;
}
async function daOpen(id, notice) {
  if (!hasPerm('drivers.view')) return;
  daSaveDraft();
  if (daEl('da-modal').hidden) { daReturnFocus = document.activeElement; daBodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  if (!daEl('da-confirm').hidden) daCancelConfirm();
  if (!daEl('da-approve').hidden) daWorkflowCancel('approve');
  if (!daEl('da-reject').hidden) daWorkflowCancel('reject');
  if (!daEl('da-email-view').hidden) daCloseEmailView();
  var seq = ++daDetailSeq; ++daMutation; daBusy = false; daCurrent = null;
  daEl('da-modal').hidden = false; daEl('da-title').textContent = 'Application details';
  daState(daEl('da-detail'), 'Loading application…'); daEl('da-modal').querySelector('.order-modal-close').focus();
  try {
    var res = await api('GET', '/driver-applications/' + encodeURIComponent(id));
    if (seq !== daDetailSeq) return;
    if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) throw new Error('Invalid application response');
    daCurrent = res.data; daRenderDetail(notice);
  } catch (e) { if (seq === daDetailSeq) daState(daEl('da-detail'), 'Could not load application: ' + e.message, function() { daOpen(id, notice); }); }
}
function daSection(title, fields, a, key) {
  return '<section class="order-detail-section da-info-section da-info-' + esc(key || 'default') + '"><h4 class="order-detail-label">' + title + '</h4><div class="order-detail-grid">' + fields.map(function(k) {
    var value = k === 'createdAt' || k === 'updatedAt' ? daDate(a[k]) : daValue(a[k]);
    return '<div class="order-detail-field"><div class="order-detail-field-label">' + esc(daLabel(k)) + '</div><div class="order-detail-field-value">' + esc(value) + '</div></div>';
  }).join('') + '</div></section>';
}
function daHistory(items, notes) {
  if (!Array.isArray(items) || !items.length) return '<p class="order-detail-notes">None recorded.</p>';
   return '<ol class="da-history ' + (notes ? 'da-notes-history' : 'da-activity-timeline') + '">' + items.map(function(item) {
    if (!item || typeof item !== 'object') return '';
    var actor = item.actor ? daValue(item.actor) : item.action === 'application_submitted' ? 'Applicant' : 'Unknown administrator';
    var text = notes ? item.text : [item.previousStatus && 'From ' + daLabel(item.previousStatus), item.status && 'To ' + daLabel(item.status), item.reason, item.emailType && daLabel(item.emailType), item.recipient && 'To ' + item.recipient, item.sendAccepted === true && 'Accepted by Resend', item.sendAccepted === false && 'Not accepted by Resend', item.previousAdminId != null && 'Previous reviewer: ' + item.previousAdminId, item.adminId != null && 'Reviewer: ' + item.adminId, item.noteId != null && 'Note: ' + item.noteId].filter(Boolean).join('\n');
     return '<li><span class="da-timeline-marker" aria-hidden="true">' + (notes ? '•' : '✓') + '</span><div class="da-history-content"><strong>' + esc(notes ? actor : daLabel(item.action || 'Update')) + '</strong><small>' + esc((notes ? '' : actor + ' · ') + daDate(item.createdAt)) + '</small>' + (text ? '<p>' + esc(text) + '</p>' : '') + '</div></li>';
  }).join('') + '</ol>';
}
function daRenderDetail(notice) {
  var a = daCurrent, el = daEl('da-detail');
   daEl('da-title').textContent = 'Driver application';
  var html = notice ? '<div class="da-notice" role="status">' + esc(notice) + '</div>' : '';
  html += '<div class="da-application-hero"><div class="da-hero-avatar" aria-hidden="true">' + esc(String(a.fullName || '?').split(/\s+/).slice(0, 2).map(function(x) { return x.charAt(0); }).join('').toUpperCase()) + '</div><div class="da-hero-copy"><div class="da-hero-kicker">Driver application</div><h2>' + esc(a.fullName || 'Unnamed applicant') + '</h2><div class="da-hero-meta"><span>' + esc(a.email || 'No email provided') + '</span><span>Submitted ' + esc(daDate(a.createdAt)) + '</span></div></div><div class="da-hero-status">' + daBadge(a.status) + '<small>Ref: ' + esc(daId(a) || '—') + '</small></div></div>';
  html += '<div class="da-detail-grid">';
  html += daSection('Application & review', ['applicationId', 'createdAt', 'updatedAt', 'assignedAdminId', 'reviewer'], a, 'review');
  html += daSection('Contact & location', ['fullName', 'email', 'phone', 'alternativePhone', 'address', 'city'], a, 'contact');
  html += daSection('Driving & qualifications', ['licenceStatus', 'experience', 'professionalExperience', 'qualifications'], a, 'driving');
  html += daSection('Vehicle information', ['vehicleOwnership', 'vehicleType', 'vehicleMakeModel', 'vehicleRegistration'], a, 'vehicle');
  html += daSection('Availability & additional information', ['operatingArea', 'availability', 'additionalInfo', 'consent'], a, 'availability');
  html += '</div>';
  html += daDocuments(a.documents);
  if (a.status === 'approved') html += '<div class="drv-banner drv-banner-warning"><div><div class="drv-banner-title">Manual onboarding required</div><p class="drv-banner-desc">Register this driver on the Drivers page. Approval sends the interview invitation email but does not create an account or complete verification.</p><div class="da-actions"><button type="button" class="btn btn-accent btn-sm" id="da-drivers">Go to Drivers</button></div></div></div>';
  if (hasPerm('drivers.manage')) {
     html += '<section class="order-detail-section da-review-actions"><h4 class="order-detail-label">Review actions</h4><div class="da-action-group"><span class="da-action-group-label">Reviewer management</span><div class="da-actions"><button type="button" class="btn btn-ghost btn-sm" id="da-assign">Assign to me</button><button type="button" class="btn btn-ghost btn-sm" id="da-unassign">Clear assignment</button></div></div>';
    var actions = [];
    if (['pending', 'needs_information', 'rejected'].indexOf(a.status) >= 0) actions.push(['under_review', a.status === 'rejected' ? 'Reopen for review' : 'Start review']);
    if (['pending', 'under_review', 'needs_information'].indexOf(a.status) >= 0) {
      if (a.status !== 'needs_information') actions.push(['needs_information', 'Request information']);
      actions.push(['approved', 'Approve'], ['rejected', 'Reject']);
    }
     html += '<div class="da-action-group"><span class="da-action-group-label">Application review</span><div class="da-actions">' + actions.map(function(action) { return '<button type="button" class="btn btn-' + (action[0] === 'approved' ? 'green' : action[0] === 'rejected' ? 'red' : 'ghost') + ' btn-sm" data-status="' + action[0] + '">' + action[1] + '</button>'; }).join('') + '</div></div><p id="da-action-error" class="da-error" role="alert"></p></section>';
  }
  html += '<section class="order-detail-section"><h4 class="order-detail-label">Internal notes</h4>' + daHistory(a.notes, true);
   if (hasPerm('drivers.manage')) html += '<form id="da-note-form"><div class="fg"><label for="da-note">Add internal note</label><textarea id="da-note" required maxlength="4000" rows="4" aria-describedby="da-note-help"></textarea><div class="da-note-footer"><small id="da-note-help">Maximum 4,000 characters. Draft retained until you sign out.</small><span id="da-note-count">0 / 4,000</span></div></div><p id="da-note-error" class="da-error" role="alert"></p><button class="btn btn-accent btn-sm" type="submit" id="da-note-submit">Add note</button></form>';
  html += '</section>' + daEmailHistory(a) + '<section class="order-detail-section"><h4 class="order-detail-label">Activity</h4>' + daHistory(a.activity, false) + '</section>';
  el.innerHTML = html;
  var drivers = daEl('da-drivers'); if (drivers) drivers.onclick = function() { try { sessionStorage.setItem('pending_driver_application_id', String(daId(a))); } catch (_) {} daClose(); switchTab('drivers'); };
  var assign = daEl('da-assign'); if (assign) assign.onclick = function() { var user; try { user = JSON.parse(localStorage.getItem('admin_user') || '{}'); } catch (_) { user = {}; } var id = Number(user.id); if (!Number.isSafeInteger(id) || id < 1) { daEl('da-action-error').textContent = 'Your administrator ID is unavailable. Sign in again.'; return; } daAssign(id); };
  var unassign = daEl('da-unassign'); if (unassign) unassign.onclick = function() { daAssign(null); };
  el.querySelectorAll('[data-status]').forEach(function(btn) { btn.onclick = function() { daChangeStatus(btn.dataset.status); }; });
  var form = daEl('da-note-form');
   if (form) { daEl('da-note').value = daDrafts[String(daId(a))] || ''; daEl('da-note').oninput = function() { daSaveDraft(); daEl('da-note-count').textContent = daEl('da-note').value.length.toLocaleString() + ' / 4,000'; }; daEl('da-note').dispatchEvent(new Event('input')); form.onsubmit = function(e) { e.preventDefault(); daAddNote(); }; }
  el.querySelectorAll('[data-email-view]').forEach(function(btn) { btn.onclick = function() { daViewEmail(Number(btn.dataset.emailView)); }; });
  el.querySelectorAll('[data-email-resend]').forEach(function(btn) { btn.onclick = function() { daResendEmail(Number(btn.dataset.emailResend)); }; });
  el.querySelectorAll('[data-doc-preview]').forEach(function(btn) { btn.onclick = function() { daPreviewDocument(btn.dataset.docPreview, btn.dataset.docName, btn.dataset.docMime); }; });
  el.querySelectorAll('[data-doc-download]').forEach(function(btn) { btn.onclick = function() { daDownloadDocument(btn.dataset.docDownload, btn.dataset.docName); }; });
  el.querySelectorAll('[data-doc-status]').forEach(function(btn) { btn.onclick = function() { daReviewDocument(btn.dataset.docStatus, btn.dataset.docAction); }; });
}

function daDocuments(documents) {
  documents = Array.isArray(documents) ? documents : [];
  var required = ['license', 'vehicle_registration'];
  var byType = {};
  documents.forEach(function(d) { if (d && !byType[d.documentType]) byType[d.documentType] = d; });
  var checklist = required.map(function(type) {
    var d = byType[type], state = d ? d.verificationStatus : 'missing';
    return '<li><span>' + esc(daLabel(type)) + '</span><strong class="da-doc-status da-doc-' + esc(state) + '">' + esc(daLabel(state)) + '</strong></li>';
  }).join('');
  var rows = documents.length ? documents.map(function(d) {
    var actions = hasPerm('drivers.manage') ? '<div class="da-doc-actions"><button type="button" class="btn btn-green btn-xs" data-doc-status="' + esc(d.id) + '" data-doc-action="verified">Verify</button><button type="button" class="btn btn-red btn-xs" data-doc-status="' + esc(d.id) + '" data-doc-action="resubmission_required">Request resubmission</button></div>' : '';
     return '<tr><td>' + esc(daLabel(d.documentType)) + '</td><td>' + esc(d.fileName || 'Document') + '</td><td>' + esc(daLabel(d.verificationStatus || 'pending')) + '</td><td>' + esc(daDate(d.createdAt)) + '</td><td><div class="da-doc-row-actions"><button type="button" class="btn btn-ghost btn-xs" data-doc-preview="' + esc(d.id) + '" data-doc-name="' + esc(d.fileName || 'document') + '" data-doc-mime="' + esc(d.mimeType || '') + '">Preview</button><button type="button" class="btn btn-ghost btn-xs" data-doc-download="' + esc(d.id) + '" data-doc-name="' + esc(d.fileName || 'document') + '">Download</button>' + actions + '</div></td></tr>';
  }).join('') : '<tr><td colspan="5">No documents uploaded yet.</td></tr>';
  return '<section class="order-detail-section da-documents-section"><div class="da-section-heading"><div><h4 class="order-detail-label">Required document checklist</h4><p class="da-section-help">Approval requires every required document to be verified.</p></div><span class="da-doc-progress">' + required.filter(function(type) { return byType[type] && byType[type].verificationStatus === 'verified'; }).length + ' / ' + required.length + ' verified</span></div><ul class="da-doc-checklist">' + checklist + '</ul><div class="da-section-heading da-subsection-heading"><h4 class="order-detail-label">Submitted documents</h4></div><div class="wl-table-wrap da-doc-table-wrap"><table class="wl-table da-doc-table"><thead><tr><th>Document type</th><th>File name</th><th>Status</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
}
async function daPreviewDocument(id, name, mime) {
  try {
    var response = await daDocumentRequest('/driver-applications/' + encodeURIComponent(daId(daCurrent)) + '/documents/' + encodeURIComponent(id) + '/file');
    if (!response.ok) throw new Error('Document could not be loaded');
    var url = URL.createObjectURL(await response.blob());
    var modal = daEl('da-document-preview'); modal.hidden = false; daEl('da-modal').inert = true; daEl('da-document-title').textContent = name || 'Document preview'; modal.querySelector('.order-modal-close').focus();
    var frame = daEl('da-document-frame'); frame.src = url; frame.type = mime || '';
    frame.onload = function() { URL.revokeObjectURL(url); };
  } catch (e) { toast(e.message, false); }
}
async function daDownloadDocument(id, name) {
  try {
    var response = await daDocumentRequest('/driver-applications/' + encodeURIComponent(daId(daCurrent)) + '/documents/' + encodeURIComponent(id) + '/file?download=1');
    if (!response.ok) throw new Error('Document could not be downloaded');
    var link = document.createElement('a'); link.href = URL.createObjectURL(await response.blob()); link.download = name || 'document'; link.style.display = 'none'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);
  } catch (e) { toast(e.message, false); }
}
async function daDocumentRequest(path) {
  var headers = authToken ? { Authorization: 'Bearer ' + authToken } : {};
  var response = await fetch(API_BASE + path, { headers: headers, credentials: 'include', cache: 'no-store' });
  if (response.status === 401) { if (typeof doLogout === 'function') doLogout(); throw new Error('Your session has expired. Please sign in again.'); }
  if (!response.ok) throw new Error(response.status === 403 ? 'You do not have permission to access this document.' : response.status === 404 ? 'Document not found.' : 'Document service is temporarily unavailable.');
  return response;
}
function daCloseDocumentPreview() { var modal = daEl('da-document-preview'); if (modal.hidden) return; var frame = daEl('da-document-frame'); frame.src = ''; modal.hidden = true; daEl('da-modal').inert = false; daRestoreFocus(daReturnFocus); }
async function daReviewDocument(id, status) {
  var reason = '';
  if (status !== 'verified') { reason = window.prompt('Enter the reason this document needs changes:') || ''; if (reason.trim().length < 3) return; }
  try { var res = await api('PATCH', '/driver-applications/' + encodeURIComponent(daId(daCurrent)) + '/documents/' + encodeURIComponent(id), { verificationStatus: status, rejectionReason: reason }); var token = res.data && res.data.resubmissionToken; if (token && navigator.clipboard) { navigator.clipboard.writeText(token); toast('Review updated. The one-time replacement token was copied for secure delivery.', true); } else toast('Document review updated', true); daOpen(daId(daCurrent)); } catch (e) { toast(e.message, false); }
}
function daSetBusy(busy) {
  daBusy = busy;
  daEl('da-detail').querySelectorAll('button, textarea').forEach(function(el) { el.disabled = busy; });
  daEl('da-confirm-submit').disabled = busy; daEl('da-reason').disabled = busy;
  daEl('da-confirm-submit').textContent = busy ? 'Saving…' : (daConfirmation && daConfirmation.label || 'Confirm');
}
function daAsk(title, description, action, reason) {
  if (daBusy || !daCurrent || !hasPerm('drivers.manage')) return;
  daConfirmFocus = document.activeElement; daConfirmation = action;
  action.label = action.kind === 'assign' ? (action.body.adminId == null ? 'Clear assignment' : 'Assign to me') : action.kind === 'resend_email' ? 'Resend email' : ({approved:'Approve application', rejected:'Reject application', needs_information:'Request information', under_review: daCurrent.status === 'rejected' ? 'Reopen application' : 'Start review'})[action.body.status];
  daEl('da-confirm-submit').className = 'btn btn-' + (action.kind === 'status' && action.body.status === 'rejected' ? 'red' : action.kind === 'status' && action.body.status === 'approved' ? 'green' : 'accent');
  daEl('da-confirm-title').textContent = title; daEl('da-confirm-description').textContent = description;
  daEl('da-reason-field').hidden = !reason; daEl('da-reason').required = !!reason; daEl('da-reason').value = '';
  daEl('da-confirm-error').textContent = ''; daSetBusy(false);
  daEl('da-confirm').hidden = false; daEl('da-modal').inert = true;
  (reason ? daEl('da-reason') : daEl('da-confirm-submit')).focus();
}
function daAssign(adminId) {
  daAsk(adminId == null ? 'Clear assignment?' : 'Assign to yourself?', 'Update the administrator responsible for reviewing this application.', { kind: 'assign', body: { adminId: adminId } });
}
function daChangeStatus(status) {
  if (daBusy || !daCurrent || !hasPerm('drivers.manage')) return;
  // Approval and rejection open their dedicated email workflows instead of
  // the plain status confirmation; other transitions keep the existing flow.
  if (status === 'approved') { daOpenApprove(); return; }
  if (status === 'rejected') { daOpenReject(); return; }
  daAsk(daLabel(status) + '?', 'Update the application status. This action does not send a notification.', { kind: 'status', body: { status: status, expectedStatus: daCurrent.status, expectedUpdatedAt: daCurrent.updatedAt } }, status === 'needs_information');
}
async function daMutate(kind, body, errorId) {
  if (daBusy || !daCurrent || !hasPerm('drivers.manage')) return;
  var id = daId(daCurrent), seq = daDetailSeq, session = daSession, mutation = ++daMutation;
  if (id == null) return;
  daSaveDraft(); var submittedDraft = daDrafts[String(id)]; daSetBusy(true); daEl(errorId).textContent = '';
  if (kind === 'notes') daEl('da-note-submit').textContent = 'Saving note…';
  try {
    var method, url, requestBody = body;
    if (kind === 'resend_email') {
      method = 'POST';
      url = '/driver-applications/' + encodeURIComponent(id) + '/emails/' + encodeURIComponent(body.emailId) + '/resend';
      requestBody = {};
    } else {
      method = kind === 'notes' ? 'POST' : 'PATCH';
      url = '/driver-applications/' + encodeURIComponent(id) + '/' + kind;
    }
    var res = await api(method, url, requestBody);
    if (session !== daSession) return;
    if (kind === 'notes' && daDrafts[String(id)] === submittedDraft) delete daDrafts[String(id)];
    if (kind !== 'resend_email') daLoadList();
    if (kind === 'status') daLoadStats();
    if (kind === 'resend_email') toast((res && res.message) || 'Email re-sent.', Boolean(res && res.sendAccepted));
    if (seq === daDetailSeq) {
      if (kind === 'notes') { daEl('da-note').value = ''; delete daDrafts[String(id)]; }
      daOpen(id, kind === 'notes' ? 'Note added.' : kind === 'assign' ? 'Reviewer assignment updated.' : kind === 'resend_email' ? (res && res.message) || 'Email re-sent.' : 'Status updated. No notification was sent.');
    }
  } catch (e) {
    if (session !== daSession) return;
    if (e.status === 409) {
      daLoadList(); daLoadStats();
      if (seq === daDetailSeq) daOpen(id, 'This application changed since it was opened. Review the latest information before trying again. Your note draft is retained.');
    } else if (seq === daDetailSeq) daEl(errorId).textContent = 'Could not save: ' + e.message;
  } finally {
    if (mutation === daMutation && seq === daDetailSeq && session === daSession) {
      daSetBusy(false); if (daEl('da-note-submit')) daEl('da-note-submit').textContent = 'Add note';
    }
  }
}
function daAddNote() {
  var note = daEl('da-note'), text = note.value.trim();
  if (!text || text.length > 4000) { daEl('da-note-error').textContent = 'Enter a note of 1–4,000 characters.'; note.focus(); return; }
  daMutate('notes', { text: text }, 'da-note-error');
}
function daClearFilters() {
  ['search', 'status', 'vehicleType', 'operatingArea', 'from', 'to', 'sort'].forEach(function(k) { daEl('da-' + k).value = ''; });
  kitList(daKey).page = 1; daLoadList();
}

// ── Decision email workflows ──────────────────────────────────────────────
function daTopLayer() {
  if (!daEl('da-document-preview').hidden) return daEl('da-document-preview');
  if (!daEl('da-email-view').hidden) return daEl('da-email-view');
  if (!daEl('da-approve').hidden) return daEl('da-approve');
  if (!daEl('da-reject').hidden) return daEl('da-reject');
  if (!daEl('da-confirm').hidden) return daEl('da-confirm');
  return daEl('da-modal').hidden ? null : daEl('da-modal');
}
function daSummaryRow(label, value) {
  var text = value == null || value === '' ? '—' : String(value);
  return '<div class="ntf-sum-row"><span class="ntf-sum-label">' + esc(label) + '</span><span class="ntf-sum-value">' + esc(text) + '</span></div>';
}
function daTodayIso() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daShowPane(kind, which) {
  var approve = kind === 'approve';
  daEl(approve ? 'da-approve-fields' : 'da-reject-fields').hidden = which !== 'fields';
  daEl(approve ? 'da-approve-preview' : 'da-reject-preview').hidden = which !== 'preview';
  daEl(approve ? 'da-approve-generate' : 'da-reject-generate').hidden = which !== 'fields';
  daEl(approve ? 'da-approve-back' : 'da-reject-back').hidden = which !== 'preview';
  daEl(approve ? 'da-approve-send' : 'da-reject-send').hidden = which !== 'preview';
  if (which === 'fields') {
    daPreview = null; daPreviewPayload = null;
    daEl(approve ? 'da-approve-frame' : 'da-reject-frame').removeAttribute('srcdoc');
    daEl(approve ? 'da-approve-error' : 'da-reject-error').textContent = '';
  }
}
function daWorkflowBusy(kind, busy) {
  var modal = daEl(kind === 'approve' ? 'da-approve' : 'da-reject');
  modal.querySelectorAll('input,select,textarea,button').forEach(function(el) { el.disabled = busy; });
  var send = daEl(kind === 'approve' ? 'da-approve-send' : 'da-reject-send').querySelector('span');
  if (busy) send.textContent = 'Sending…';
  else {
    daEl(kind === 'approve' ? 'da-approve-generate' : 'da-reject-generate').innerHTML = daGenerateHtml[kind];
    send.textContent = daSendLabel[kind];
  }
}
function daWorkflowReset(kind) {
  daWorkflowBusy(kind, false);
  daShowPane(kind, 'fields');
}
function daOpenWorkflow(kind) {
  if (daBusy || daSending || !daCurrent || !hasPerm('drivers.manage')) return false;
  daWorkflowFocus = document.activeElement;
  daWorkflow = kind; daPreview = null; daPreviewPayload = null; ++daWorkflowSeq;
  daWorkflowReset(kind);
  var modal = daEl(kind === 'approve' ? 'da-approve' : 'da-reject');
  modal.hidden = false; daEl('da-modal').inert = true;
  modal.querySelector('.order-modal-close').focus();
  return true;
}
function daWorkflowCancel(kind) {
  if (daSending) return;
  var modal = daEl(kind === 'approve' ? 'da-approve' : 'da-reject');
  if (modal.hidden) return;
  ++daWorkflowSeq;
  modal.hidden = true; daWorkflow = null; daPreview = null; daPreviewPayload = null;
  daEl('da-modal').inert = !daEl('da-confirm').hidden;
  daRestoreFocus(daWorkflowFocus); daWorkflowFocus = null;
}
function daWorkflowBack(kind) {
  if (daSending) return;
  ++daWorkflowSeq;
  daShowPane(kind, 'fields');
  var first = daEl(kind === 'approve' ? 'da-i-date' : 'da-r-reason');
  if (first) first.focus();
}
function daFormatToggle() {
  var online = daEl('da-i-format').value === 'online';
  daEl('da-i-address-field').hidden = online;
  daEl('da-i-link-field').hidden = !online;
}
function daOpenApprove() {
  var required = ['fullName', 'email', 'phone', 'address', 'city', 'licenceStatus', 'experience', 'vehicleOwnership', 'operatingArea', 'availability'];
  if (required.some(function(k) { return typeof daCurrent[k] !== 'string' || !daCurrent[k].trim(); })) { daEl('da-action-error').textContent = 'Required information is missing. Request the missing details before approval.'; return; }
  if (!daOpenWorkflow('approve')) return;
  daEl('da-approve-form').reset();
  daFormatToggle();
  daEl('da-approve-ref').textContent = [daId(daCurrent), daLabel(daCurrent.status)].filter(Boolean).join(' · ');
  daEl('da-approve-intro').textContent = 'Interview for ' + (daCurrent.fullName || 'the applicant') + ' (' + (daCurrent.email || 'no email provided') + '). All times use Africa/Lagos (WAT). Approval stores these details and emails the invitation through Resend — it does not create a driver account.';
  daEl('da-i-date').focus();
}
function daOpenReject() {
  if (!daOpenWorkflow('reject')) return;
  daEl('da-reject-form').reset();
  daEl('da-r-detail-field').hidden = true;
  daEl('da-reject-ref').textContent = [daId(daCurrent)].filter(Boolean).join(' · ');
  daEl('da-reject-applicant').innerHTML = daSummaryRow('Applicant', daCurrent.fullName || 'Unnamed applicant') + daSummaryRow('Email', daCurrent.email || 'No email provided') + daSummaryRow('Application', daId(daCurrent) || '—');
  daEl('da-r-reason').focus();
}
function daCollectInterview() {
  var date = daEl('da-i-date').value, start = daEl('da-i-start').value, end = daEl('da-i-end').value, duration = daEl('da-i-duration').value.trim();
  if (!date) throw new Error('Choose the interview date.');
  if (date < daTodayIso()) throw new Error('The interview date cannot be in the past.');
  if (!start) throw new Error('Choose the interview start time.');
  if (!end && !duration) throw new Error('Provide an end time or an estimated duration.');
  if (end && end <= start) throw new Error('The end time must be after the start time.');
  var durationMinutes = null;
  if (duration) {
    durationMinutes = Number(duration);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 600) throw new Error('Duration must be between 5 and 600 minutes.');
  }
  var format = daEl('da-i-format').value;
  if (format !== 'physical' && format !== 'online') throw new Error('Choose the interview format.');
  var address = daEl('da-i-address').value.trim(), link = daEl('da-i-link').value.trim();
  if (format === 'physical' && address.length < 5) throw new Error('Enter a valid interview address (at least 5 characters).');
  if (format === 'online') {
    var parsed;
    try { parsed = new URL(link); } catch (_) { throw new Error('Enter a valid meeting link starting with http:// or https://.'); }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('The meeting link must start with http:// or https://.');
  }
  var contactPhone = daEl('da-i-phone').value.trim();
  if (contactPhone && !/^\+?[0-9 ()-]{7,25}$/.test(contactPhone)) throw new Error('Enter a valid contact phone number.');
  return {
    date: date, startTime: start, endTime: end || null, durationMinutes: durationMinutes,
    format: format, address: format === 'physical' ? address : '', meetingLink: format === 'online' ? link : '',
    contactName: daEl('da-i-contact').value.trim(), contactPhone: contactPhone,
    instructions: daEl('da-i-instructions').value.trim(), documents: daEl('da-i-documents').value.trim(),
    notes: daEl('da-i-notes').value.trim(), timezone: 'Africa/Lagos'
  };
}
function daCollectRejection() {
  var reason = daEl('da-r-reason').value, detail = daEl('da-r-detail').value.trim();
  if (!reason) throw new Error('Select a rejection reason.');
  if (reason === 'other' && !detail) throw new Error('Describe the reason (internal use only).');
  return { reason: reason, reasonDetail: detail, explanation: daEl('da-r-explanation').value.trim(), internalNote: daEl('da-r-note').value.trim() };
}
function daClientRequestId() {
  try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (_) { /* fall through */ }
  var b = new Uint8Array(16);
  try { (window.crypto || window.msCrypto).getRandomValues(b); }
  catch (_) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var hex = [];
  for (var j = 0; j < 16; j++) { hex.push((b[j] >>> 4).toString(16), (b[j] & 15).toString(16)); }
  return hex.slice(0, 12).join('') + '-' + hex.slice(12, 16).join('') + '-' + hex.slice(16, 20).join('') + '-' + hex.slice(20, 24).join('') + '-' + hex.slice(24, 32).join('');
}
function daRenderPreview(kind, data, payload) {
  var approve = kind === 'approve';
  var rows = daSummaryRow('Recipient', data.recipient) + daSummaryRow('Subject', data.subject);
  if (approve && payload.interview) {
    var itv = payload.interview, when = itv.date;
    try { when = new Date(itv.date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (_) { /* keep ISO */ }
    rows += daSummaryRow('Date', when);
    rows += daSummaryRow('Time', itv.startTime + (itv.endTime ? ' – ' + itv.endTime : itv.durationMinutes ? ' (about ' + itv.durationMinutes + ' minutes)' : '') + ' WAT (Africa/Lagos)');
    rows += daSummaryRow('Format', itv.format === 'online' ? 'Online (video call)' : 'Physical (in person)');
    rows += daSummaryRow(itv.format === 'online' ? 'Meeting link' : 'Location', itv.format === 'online' ? itv.meetingLink : itv.address);
    if (itv.contactName || itv.contactPhone) rows += daSummaryRow('Contact', [itv.contactName, itv.contactPhone].filter(Boolean).join(' · '));
  } else if (!approve) {
    rows += daSummaryRow('Internal reason', daLabel(payload.reason) + (payload.reasonDetail ? ' — ' + payload.reasonDetail : ''));
    rows += daSummaryRow('Applicant explanation', payload.explanation || 'None');
  }
  daEl(approve ? 'da-approve-summary' : 'da-reject-summary').innerHTML = rows;
  daEl(approve ? 'da-approve-frame' : 'da-reject-frame').srcdoc = data.html;
}
async function daWorkflowGenerate(kind) {
  if (daSending || daBusy || !daCurrent || !hasPerm('drivers.manage')) return;
  var approve = kind === 'approve', id = daId(daCurrent), session = daSession, seq = ++daWorkflowSeq;
  var errorEl = daEl(approve ? 'da-approve-error' : 'da-reject-error');
  errorEl.textContent = '';
  var payload;
  try {
    payload = approve ? { emailType: 'interview_invitation', interview: daCollectInterview() } : Object.assign({ emailType: 'rejection' }, daCollectRejection());
  } catch (err) { errorEl.textContent = err.message; return; }
  var btn = daEl(approve ? 'da-approve-generate' : 'da-reject-generate');
  daSending = true; btn.disabled = true; btn.innerHTML = 'Generating…';
  try {
    var res = await api('POST', '/driver-applications/' + encodeURIComponent(id) + '/email-preview', payload);
    if (session !== daSession || seq !== daWorkflowSeq) return;
    var data = res.data || {};
    if (!data.html || !data.subject || !data.recipient) throw new Error('Invalid preview response');
    daPreview = data; daPreviewPayload = payload;
    daRenderPreview(kind, data, payload);
    daShowPane(kind, 'preview');
    daEl(approve ? 'da-approve-send' : 'da-reject-send').focus();
  } catch (e) {
    if (session !== daSession || seq !== daWorkflowSeq) return;
    if (e.status === 409) {
      daSending = false; daWorkflowCancel(kind); daLoadList(); daLoadStats();
      daOpen(id, 'This application changed since it was opened. Review the latest information before deciding again.');
      return;
    }
    errorEl.textContent = 'Could not generate the email: ' + e.message;
  } finally {
    if (seq === daWorkflowSeq) { daSending = false; btn.disabled = false; btn.innerHTML = daGenerateHtml[kind]; }
  }
}
async function daWorkflowSubmit(kind) {
  if (daSending || daBusy || !daCurrent || !hasPerm('drivers.manage')) return;
  var approve = kind === 'approve';
  var errorEl = daEl(approve ? 'da-approve-error' : 'da-reject-error');
  if (!daPreviewPayload || !daPreview) { errorEl.textContent = 'Generate the email preview first.'; return; }
  var id = daId(daCurrent), session = daSession, seq = ++daWorkflowSeq;
  errorEl.textContent = '';
  var payload = Object.assign({}, daPreviewPayload, {
    clientRequestId: daClientRequestId(),
    expectedStatus: daCurrent.status,
    expectedUpdatedAt: daCurrent.updatedAt
  });
  daSending = true;
  daWorkflowBusy(kind, true);
  try {
    var res = await api('POST', '/driver-applications/' + encodeURIComponent(id) + '/emails', payload);
    if (session !== daSession) return;
    var data = res.data || {}, accepted = Boolean(data.sendAccepted);
    var notice = res.message || (accepted ? 'Decision saved; email accepted by Resend.' : 'Decision saved, but the email was not accepted by Resend.');
    daSending = false;
    daWorkflowCancel(kind);
    daLoadList(); daLoadStats();
    toast(notice, accepted);
    daOpen(id, notice);
  } catch (e) {
    if (session !== daSession || seq !== daWorkflowSeq) return;
    if (e.status === 409) {
      daSending = false;
      daWorkflowCancel(kind);
      daLoadList(); daLoadStats();
      daOpen(id, 'This application changed since it was opened. Review the latest information before deciding again.');
      return;
    }
    errorEl.textContent = 'Could not save: ' + e.message;
  } finally {
    if (seq === daWorkflowSeq) { daSending = false; daWorkflowBusy(kind, false); }
  }
}

// ── Email & Communication History ─────────────────────────────────────────
function daEmailStatusBadge(mail) {
  var status = String(mail.status || ''), delivery = String(mail.deliveryStatus || ''), label, cls;
  if (status === 'sent') {
    if (delivery === 'delivered') { label = 'Delivered'; cls = 'da-delivery-ok'; }
    else if (delivery === 'delayed') { label = 'Delivery delayed'; cls = 'da-delivery-warn'; }
    else if (delivery === 'bounced' || delivery === 'failed' || delivery === 'complained') { label = 'Not delivered (' + daLabel(delivery) + ')'; cls = 'da-delivery-bad'; }
    else { label = 'Accepted — delivery unconfirmed'; cls = 'da-delivery-warn'; }
  } else if (status === 'failed') { label = 'Send failed'; cls = 'da-delivery-bad'; }
  else if (status === 'sending') { label = 'Sending…'; cls = 'da-delivery-warn'; }
  else { label = 'Queued'; cls = 'da-delivery-warn'; }
  return '<span class="da-delivery ' + cls + '">' + esc(label) + '</span>';
}
function daEmailHistory(a) {
  var section = '<section class="order-detail-section"><h4 class="order-detail-label">Email &amp; Communication History</h4>';
  var items = Array.isArray(a.emails) ? a.emails : [];
  if (!items.length) return section + '<p class="order-detail-notes">No invitation or rejection emails have been generated for this application.</p></section>';
  var manage = hasPerm('drivers.manage');
  var eye = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var again = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
  var cards = items.map(function(mail) {
    if (!mail || typeof mail !== 'object') return '';
    var resendable = ['queued', 'failed'].indexOf(mail.status) >= 0 || ['bounced', 'failed'].indexOf(mail.deliveryStatus) >= 0;
    var meta = ['To: ' + (mail.recipient || '—'), 'Sending administrator: ' + (mail.sentBy && mail.sentBy.name || 'Unknown'), 'Sent: ' + daDate(mail.sentAt || mail.createdAt), 'Attempts: ' + (mail.attempts == null ? '—' : mail.attempts)].join('<br>');
    if (mail.resendMessageId) meta += '<br>Resend message ID: <code>' + esc(mail.resendMessageId) + '</code>';
    return '<div class="da-email-card">' +
      '<div class="da-email-card-head"><span class="da-badge da-badge-' + (mail.emailType === 'rejection' ? 'rejected' : 'approved') + '">' + esc(daLabel(mail.emailType || 'email')) + '</span>' + daEmailStatusBadge(mail) + '<span class="da-date">' + esc(daDate(mail.sentAt || mail.createdAt)) + '</span></div>' +
      '<div class="da-email-subject">' + esc(mail.subject || '—') + '</div>' +
      '<div class="da-email-meta">' + meta + '</div>' +
      (mail.lastError ? '<div class="da-email-error">Last error: ' + esc(mail.lastError) + '</div>' : '') +
      '<div class="da-email-acts"><button type="button" class="btn btn-ghost btn-xs" data-email-view="' + Number(mail.id) + '" aria-label="View this email">' + eye + 'View email</button>' +
      (manage && resendable ? '<button type="button" class="btn btn-ghost btn-xs" data-email-resend="' + Number(mail.id) + '" aria-label="Resend this email">' + again + 'Resend Email</button>' : '') +
      '</div></div>';
  }).join('');
  return section + '<div class="da-email-list">' + cards + '</div></section>';
}
function daViewEmail(emailId) {
  if (!daCurrent) return;
  var mail = (Array.isArray(daCurrent.emails) ? daCurrent.emails : []).filter(function(m) { return m && Number(m.id) === emailId; })[0];
  if (!mail) return;
  daEmailViewFocus = document.activeElement;
  daEl('da-email-view-title').textContent = mail.emailType === 'rejection' ? 'Rejection email' : 'Interview invitation email';
  daEl('da-email-view-ref').textContent = mail.recipient || '';
  daEl('da-email-view-summary').innerHTML =
    daSummaryRow('Recipient', mail.recipient) +
    daSummaryRow('Subject', mail.subject) +
    daSummaryRow('Sending administrator', mail.sentBy && mail.sentBy.name || 'Unknown') +
    daSummaryRow('Date sent', daDate(mail.sentAt || mail.createdAt)) +
    daSummaryRow('Send status', (mail.status === 'sent' ? 'Accepted by Resend — ' + daLabel(mail.deliveryStatus) : daLabel(mail.status))) +
    daSummaryRow('Attempts', mail.attempts) +
    daSummaryRow('Resend message ID', mail.resendMessageId || '—') +
    (mail.lastError ? daSummaryRow('Last error', mail.lastError) : '');
  daEl('da-email-view-frame').srcdoc = mail.html || '';
  daEl('da-email-view').hidden = false; daEl('da-modal').inert = true;
  daEl('da-email-view').querySelector('.order-modal-close').focus();
}
function daCloseEmailView() {
  var modal = daEl('da-email-view');
  if (modal.hidden) return;
  modal.hidden = true;
  daEl('da-email-view-frame').removeAttribute('srcdoc');
  daEl('da-modal').inert = !daEl('da-confirm').hidden || !daEl('da-approve').hidden || !daEl('da-reject').hidden;
  daRestoreFocus(daEmailViewFocus); daEmailViewFocus = null;
}
function daResendEmail(emailId) {
  if (daBusy || daSending || !daCurrent || !hasPerm('drivers.manage')) return;
  var mail = (Array.isArray(daCurrent.emails) ? daCurrent.emails : []).filter(function(m) { return m && Number(m.id) === emailId; })[0];
  if (!mail) return;
  daAsk('Resend this email?',
    'Send the stored ' + (mail.emailType === 'rejection' ? 'rejection letter' : 'interview invitation') + ' to ' + (mail.recipient || 'the applicant') + ' again. Emails already accepted by Resend cannot be duplicated.',
    { kind: 'resend_email', body: { emailId: mail.id } }, false);
}
(function() {
  daGenerateHtml.approve = daEl('da-approve-generate').innerHTML;
  daGenerateHtml.reject = daEl('da-reject-generate').innerHTML;
  daEl('da-clear').onclick = daClearFilters;
  // Reuse native form groups while retaining explicit label associations.
  document.querySelectorAll('.da-filters > label').forEach(function(label) { var control = label.querySelector('input,select'); var group = document.createElement('div'); group.className = 'fg'; label.parentNode.insertBefore(group, label); group.appendChild(label); group.appendChild(control); label.htmlFor = control.id; });
  var search = kitDebounce(function(session) { if (session === daSession && authToken) { kitList(daKey).page = 1; daLoadList(); } }, 350);
  ['search', 'vehicleType', 'operatingArea'].forEach(function(k) { daEl('da-' + k).addEventListener('input', function() { ++daListSeq; daState(daEl('da-list'), 'Loading applications…'); daEl('da-pager').innerHTML = ''; search(daSession); }); });
  ['status', 'from', 'to', 'sort'].forEach(function(k) { daEl('da-' + k).addEventListener('change', function() { kitList(daKey).page = 1; daLoadList(); }); });
  daEl('da-confirm-form').onsubmit = function(e) {
    e.preventDefault(); if (!daConfirmation || daBusy) return;
    var body = Object.assign({}, daConfirmation.body), reason = daEl('da-reason').value.trim();
    if (daEl('da-reason').required) {
      if (!reason || reason.length > 2000) { daEl('da-confirm-error').textContent = 'Enter a reason of 1–2,000 characters.'; daEl('da-reason').focus(); return; }
      body.reason = reason;
    }
    daMutate(daConfirmation.kind, body, 'da-confirm-error');
  };
  daEl('da-i-format').onchange = daFormatToggle;
  daEl('da-r-reason').onchange = function() { daEl('da-r-detail-field').hidden = this.value !== 'other'; };
  daEl('da-approve-form').onsubmit = function(e) { e.preventDefault(); daWorkflowSubmit('approve'); };
  daEl('da-reject-form').onsubmit = function(e) { e.preventDefault(); daWorkflowSubmit('reject'); };
  // Capture prevents global shortcuts and underlying dialogs from consuming Escape.
  document.addEventListener('keydown', function(e) {
    var layer = daTopLayer();
    if (!layer) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
       if (layer.id === 'da-document-preview') daCloseDocumentPreview();
       else if (layer.id === 'da-email-view') daCloseEmailView();
      else if (layer.id === 'da-approve') daWorkflowCancel('approve');
      else if (layer.id === 'da-reject') daWorkflowCancel('reject');
      else if (layer.id === 'da-confirm') daCancelConfirm();
      else daClose();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key !== 'Tab') return;
    var focusable = Array.from(layer.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')).filter(function(el) { return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length; });
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { e.preventDefault(); layer.querySelector('[role="dialog"]').focus(); }
    else if (e.shiftKey && (document.activeElement === first || !layer.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !layer.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }, true);
  document.addEventListener('focusin', function(e) {
    var layer = daTopLayer();
    if (!layer) return;
    if (!layer.contains(e.target)) { var close = layer.querySelector('.order-modal-close'); if (close) close.focus(); }
  });
})();
