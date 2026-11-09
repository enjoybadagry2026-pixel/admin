// Server-paged applications. Generations isolate detail, mutation and login sessions.
var daListSeq = 0, daStatsSeq = 0, daDetailSeq = 0, daSession = 0;
var daCurrent = null, daBusy = false, daMutation = 0, daKey = 'driverApplications';
var daDrafts = Object.create(null), daReturnFocus = null, daConfirmFocus = null, daConfirmation = null, daBodyOverflow = '';
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
  daSaveDraft(); ++daDetailSeq; ++daMutation; daBusy = false;
  if (!daEl('da-confirm').hidden) daCancelConfirm();
  daCurrent = null; daEl('da-modal').hidden = true; daEl('da-detail').innerHTML = '';
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
function daSection(title, fields, a) {
  return '<section class="order-detail-section"><h4 class="order-detail-label">' + title + '</h4><div class="order-detail-grid">' + fields.map(function(k) {
    var value = k === 'createdAt' || k === 'updatedAt' ? daDate(a[k]) : daValue(a[k]);
    return '<div class="order-detail-field"><div class="order-detail-field-label">' + esc(daLabel(k)) + '</div><div class="order-detail-field-value">' + esc(value) + '</div></div>';
  }).join('') + '</div></section>';
}
function daHistory(items, notes) {
  if (!Array.isArray(items) || !items.length) return '<p class="order-detail-notes">None recorded.</p>';
  return '<ol class="da-history">' + items.map(function(item) {
    if (!item || typeof item !== 'object') return '';
    var actor = item.actor ? daValue(item.actor) : item.action === 'application_submitted' ? 'Applicant' : 'Unknown administrator';
    var text = notes ? item.text : [item.previousStatus && 'From ' + daLabel(item.previousStatus), item.status && 'To ' + daLabel(item.status), item.reason, item.previousAdminId != null && 'Previous reviewer: ' + item.previousAdminId, item.adminId != null && 'Reviewer: ' + item.adminId, item.noteId != null && 'Note: ' + item.noteId].filter(Boolean).join('\n');
    return '<li><strong>' + esc(notes ? actor : daLabel(item.action || 'Update')) + '</strong><small>' + esc((notes ? '' : actor + ' · ') + daDate(item.createdAt)) + '</small><p>' + esc(text || '') + '</p></li>';
  }).join('') + '</ol>';
}
function daRenderDetail(notice) {
  var a = daCurrent, el = daEl('da-detail');
  daEl('da-title').textContent = a.fullName || 'Application details';
  var html = notice ? '<div class="da-notice" role="status">' + esc(notice) + '</div>' : '';
  html += '<div class="da-actions">' + daBadge(a.status) + '</div>';
  html += daSection('Application & review', ['applicationId', 'createdAt', 'updatedAt', 'assignedAdminId', 'reviewer'], a);
  html += daSection('Contact & location', ['fullName', 'email', 'phone', 'alternativePhone', 'address', 'city'], a);
  html += daSection('Driving & qualifications', ['licenceStatus', 'experience', 'professionalExperience', 'qualifications'], a);
  html += daSection('Vehicle', ['vehicleOwnership', 'vehicleType', 'vehicleMakeModel', 'vehicleRegistration'], a);
  html += daSection('Availability & additional information', ['operatingArea', 'availability', 'additionalInfo', 'consent'], a);
  html += '<section class="order-detail-section"><h4 class="order-detail-label">Documents</h4><p class="order-detail-notes">Document uploads and previews are not supported for these applications.</p></section>';
  if (a.status === 'approved') html += '<div class="drv-banner drv-banner-warning"><div><div class="drv-banner-title">Manual onboarding required</div><p class="drv-banner-desc">Register this driver on the Drivers page. Approval does not create an account, complete verification or send a notification.</p><div class="da-actions"><button type="button" class="btn btn-accent btn-sm" id="da-drivers">Go to Drivers</button></div></div></div>';
  if (hasPerm('drivers.manage')) {
    html += '<section class="order-detail-section"><h4 class="order-detail-label">Review actions</h4><div class="da-actions"><button type="button" class="btn btn-ghost btn-sm" id="da-assign">Assign to me</button><button type="button" class="btn btn-ghost btn-sm" id="da-unassign">Clear assignment</button></div>';
    var actions = [];
    if (['pending', 'needs_information', 'rejected'].indexOf(a.status) >= 0) actions.push(['under_review', a.status === 'rejected' ? 'Reopen for review' : 'Start review']);
    if (['pending', 'under_review', 'needs_information'].indexOf(a.status) >= 0) {
      if (a.status !== 'needs_information') actions.push(['needs_information', 'Request information']);
      actions.push(['approved', 'Approve'], ['rejected', 'Reject']);
    }
    html += '<div class="da-actions">' + actions.map(function(action) { return '<button type="button" class="btn btn-' + (action[0] === 'approved' ? 'green' : action[0] === 'rejected' ? 'red' : 'ghost') + ' btn-sm" data-status="' + action[0] + '">' + action[1] + '</button>'; }).join('') + '</div><p id="da-action-error" class="da-error" role="alert"></p></section>';
  }
  html += '<section class="order-detail-section"><h4 class="order-detail-label">Internal notes</h4>' + daHistory(a.notes, true);
  if (hasPerm('drivers.manage')) html += '<form id="da-note-form"><div class="fg"><label for="da-note">Add internal note</label><textarea id="da-note" required maxlength="4000" rows="4" aria-describedby="da-note-help"></textarea><small id="da-note-help">Maximum 4,000 characters. Draft retained until you sign out.</small></div><p id="da-note-error" class="da-error" role="alert"></p><button class="btn btn-accent btn-sm" type="submit" id="da-note-submit">Add note</button></form>';
  html += '</section><section class="order-detail-section"><h4 class="order-detail-label">Activity</h4>' + daHistory(a.activity, false) + '</section>';
  el.innerHTML = html;
  var drivers = daEl('da-drivers'); if (drivers) drivers.onclick = function() { daClose(); switchTab('drivers'); };
  var assign = daEl('da-assign'); if (assign) assign.onclick = function() { var user; try { user = JSON.parse(localStorage.getItem('admin_user') || '{}'); } catch (_) { user = {}; } var id = Number(user.id); if (!Number.isSafeInteger(id) || id < 1) { daEl('da-action-error').textContent = 'Your administrator ID is unavailable. Sign in again.'; return; } daAssign(id); };
  var unassign = daEl('da-unassign'); if (unassign) unassign.onclick = function() { daAssign(null); };
  el.querySelectorAll('[data-status]').forEach(function(btn) { btn.onclick = function() { daChangeStatus(btn.dataset.status); }; });
  var form = daEl('da-note-form');
  if (form) { daEl('da-note').value = daDrafts[String(daId(a))] || ''; daEl('da-note').oninput = daSaveDraft; form.onsubmit = function(e) { e.preventDefault(); daAddNote(); }; }
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
  action.label = action.kind === 'assign' ? (action.body.adminId == null ? 'Clear assignment' : 'Assign to me') : ({approved:'Approve application', rejected:'Reject application', needs_information:'Request information', under_review: daCurrent.status === 'rejected' ? 'Reopen application' : 'Start review'})[action.body.status];
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
  if (status === 'approved') {
    var required = ['fullName', 'email', 'phone', 'address', 'city', 'licenceStatus', 'experience', 'vehicleOwnership', 'operatingArea', 'availability'];
    if (required.some(function(k) { return typeof daCurrent[k] !== 'string' || !daCurrent[k].trim(); })) { daEl('da-action-error').textContent = 'Required information is missing. Request the missing details before approval.'; return; }
  }
  daAsk(daLabel(status) + '?', status === 'approved' ? 'Approval does not create a driver account or complete verification. You must register the driver manually.' : 'Update the application status. This action does not send a notification.', { kind: 'status', body: { status: status, expectedStatus: daCurrent.status, expectedUpdatedAt: daCurrent.updatedAt } }, status === 'needs_information' || status === 'rejected');
}
async function daMutate(kind, body, errorId) {
  if (daBusy || !daCurrent || !hasPerm('drivers.manage')) return;
  var id = daId(daCurrent), seq = daDetailSeq, session = daSession, mutation = ++daMutation;
  if (id == null) return;
  daSaveDraft(); var submittedDraft = daDrafts[String(id)]; daSetBusy(true); daEl(errorId).textContent = '';
  if (kind === 'notes') daEl('da-note-submit').textContent = 'Saving note…';
  try {
    await api(kind === 'notes' ? 'POST' : 'PATCH', '/driver-applications/' + encodeURIComponent(id) + '/' + kind, body);
    if (session !== daSession) return;
    if (kind === 'notes' && daDrafts[String(id)] === submittedDraft) delete daDrafts[String(id)];
    daLoadList(); if (kind === 'status') daLoadStats();
    if (seq === daDetailSeq) {
      if (kind === 'notes') { daEl('da-note').value = ''; delete daDrafts[String(id)]; }
      daOpen(id, kind === 'notes' ? 'Note added.' : kind === 'assign' ? 'Reviewer assignment updated.' : 'Status updated. No notification was sent.');
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
(function() {
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
  // Capture prevents global shortcuts and underlying dialogs from consuming Escape.
  document.addEventListener('keydown', function(e) {
    if (daEl('da-modal').hidden) return;
    var layer = daEl('da-confirm').hidden ? daEl('da-modal') : daEl('da-confirm');
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (layer.id === 'da-confirm') daCancelConfirm(); else daClose(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key !== 'Tab') return;
    var focusable = Array.from(layer.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')).filter(function(el) { return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length; });
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { e.preventDefault(); layer.querySelector('[role="dialog"]').focus(); }
    else if (e.shiftKey && (document.activeElement === first || !layer.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !layer.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }, true);
  document.addEventListener('focusin', function(e) {
    if (daEl('da-modal').hidden) return;
    var layer = daEl('da-confirm').hidden ? daEl('da-modal') : daEl('da-confirm');
    if (!layer.contains(e.target)) layer.querySelector('.order-modal-close').focus();
  });
})();
