// ═══════════════ NOTIFICATIONS (admin broadcasts) ═══════════════
//
// Two views in one panel:
//   Compose  title/message/image + audience segmentation + preview + send/schedule
//   History  stats, filters, paginated list, detail modal, cancel scheduled sends
//
// Audience options (segments + their values) come from the backend so the
// panel only ever offers columns that actually exist on users/drivers.

var ntfTab = 'compose';
var ntfType = 'user';
var ntfPanelLoaded = false;
var ntfAudienceOptions = { user: null, driver: null };
var ntfSelected = [];        // specific recipients: [{ id, name, sub }]
var ntfPickerItems = [];     // last search results (index-addressed in onclick)
var ntfEstimateData = null;  // { matched, reachable } of the last estimate
var ntfEstimateSeq = 0;      // sequence guard against stale estimate responses
var ntfEstimateTimer = null;
var ntfPickerTimer = null;
var ntfSending = false;
var ntfUploading = false;

var ntfHistState = { page: 1, limit: 12, q: '', status: '', type: '', loaded: false, loading: false, pending: false };
var ntfItems = [];
var ntfStats = null;
var ntfPagination = null;
var ntfSearchTimer = null;
var ntfLoadSeq = 0;         // full loads bump this; stale silent refreshes bail

var ntfPollTimer = null;
var ntfDetailId = null;
var ntfConfirmCb = null;
var ntfConfirmBusy = false; // blocks closing the confirm modal mid-request
var ntfPickerSeq = 0;       // invalidates in-flight picker searches

var NTF_STATUS_LABEL = { scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent', failed: 'Failed', cancelled: 'Cancelled' };
var NTF_STATUS_TAG = {
  scheduled: 'ntf-st-scheduled',
  sending: 'ntf-st-sending',
  sent: 'ntf-st-sent',
  failed: 'ntf-st-failed',
  cancelled: 'ntf-st-cancelled'
};
var NTF_VALUE_SEGMENTS = ['country', 'status', 'platform', 'state', 'online'];

// ─── Small helpers ────────────────────────────────────────────────

function ntfSetText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function ntfSetHtml(id, val) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = val;
}

// esc() does not escape quotes, so attribute values need this on top.
function ntfEscAttr(s) {
  return esc(String(s || '')).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function ntfCap(s) {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function ntfStatusTag(status) {
  var cls = NTF_STATUS_TAG[status] || 'ntf-st-scheduled';
  return '<span class="tag ntf-status ' + cls + '">' + esc(NTF_STATUS_LABEL[status] || ntfCap(status)) + '</span>';
}

function ntfTypeTag(type) {
  return '<span class="tag ntf-audience-tag ntf-audience-' + (type === 'driver' ? 'driver' : 'user') + '">' +
    (type === 'driver' ? 'Drivers' : 'Users') + '</span>';
}

function ntfSegmentLabel(n) {
  if (!n) return '';
  var seg = n.segment || 'all';
  if (seg === 'all') return n.recipientType === 'driver' ? 'All non-suspended drivers' : 'All active users';
  if (seg === 'specific') {
    var count = (n.recipientIds || []).length;
    return 'Specific ' + (n.recipientType === 'driver' ? 'drivers' : 'users') + (count ? ' (' + count + ')' : '');
  }
  var names = {
    country: 'Country',
    status: 'Status',
    platform: 'Platform',
    state: 'State of origin',
    online: 'Online'
  };
  return (names[seg] || ntfCap(seg)) + ': ' + (n.segmentValue || '—');
}

function ntfSegmentNeedsValue(seg) {
  // Prefer the backend's flag so payload building and the UI never disagree;
  // fall back to the static list only while options are still loading.
  var opts = ntfAudienceOptions[ntfType];
  if (opts && opts.segments) {
    var def = opts.segments.filter(function(s) { return s.key === seg; })[0];
    if (def) return !!def.requiresValue;
  }
  return NTF_VALUE_SEGMENTS.indexOf(seg) >= 0;
}

function ntfLocalInputValue(d) {
  function pad(v) { return v < 10 ? '0' + v : String(v); }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// ─── Panel entry / tabs ───────────────────────────────────────────

function loadNotificationsPanel() {
  if (!ntfPanelLoaded) {
    ntfPanelLoaded = true;
    var when = document.querySelector('input[name="ntf-when"]:checked');
    if (when && when.value === 'now') ntfOnWhenChange();
  }
  ntfEnsureOptions(ntfType);
  ntfRenderSegments();
  ntfRenderSelected();
  ntfOnComposeInput();
  ntfQueueEstimate();
  if (ntfTab === 'history') {
    loadNotificationHistory();
    ntfStartPolling();
  }
}

function ntfShowTab(tab) {
  ntfTab = tab === 'history' ? 'history' : 'compose';

  document.querySelectorAll('[data-ntf-tab]').forEach(function(btn) {
    btn.classList.toggle('on', btn.getAttribute('data-ntf-tab') === ntfTab);
  });

  var compose = document.getElementById('ntf-compose-pane');
  var history = document.getElementById('ntf-history-pane');
  if (compose) compose.style.display = ntfTab === 'compose' ? '' : 'none';
  if (history) history.style.display = ntfTab === 'history' ? '' : 'none';

  if (ntfTab === 'history') {
    loadNotificationHistory();
    ntfStartPolling();
  } else {
    stopNotificationsPolling();
  }
}

// ─── Audience options ─────────────────────────────────────────────

function ntfEnsureOptions(type) {
  if (ntfAudienceOptions[type]) return Promise.resolve(ntfAudienceOptions[type]);
  return api('GET', '/notifications/audience-options?type=' + type).then(function(res) {
    ntfAudienceOptions[type] = res.data;
    if (type === ntfType) ntfRenderSegments();
    return res.data;
  }).catch(function(e) {
    toast('Failed to load audience options: ' + e.message, false);
    // Don't cache the failure; show it and let the next panel visit retry.
    if (type === ntfType) {
      var sel = document.getElementById('ntf-segment');
      if (sel) sel.innerHTML = '<option value="">Could not load audience options</option>';
      ntfSetEstimate('—', '—');
    }
  });
}

function ntfSetType(type) {
  if (type !== 'user' && type !== 'driver') return;
  if (ntfType === type) return;
  ntfType = type;
  ntfSelected = [];
  ntfPickerItems = [];
  clearTimeout(ntfPickerTimer);
  ntfPickerSeq++; // any in-flight search for the previous type must not render

  document.querySelectorAll('[data-ntf-type]').forEach(function(btn) {
    btn.classList.toggle('on', btn.getAttribute('data-ntf-type') === ntfType);
  });

  ntfRenderSelected();
  var results = document.getElementById('ntf-picker-results');
  if (results) { results.style.display = 'none'; results.innerHTML = ''; }
  var search = document.getElementById('ntf-picker-search');
  if (search) search.value = '';

  ntfEnsureOptions(type);
  ntfRenderSegments();
  ntfQueueEstimate();
}

function ntfRenderSegments() {
  var sel = document.getElementById('ntf-segment');
  if (!sel) return;
  var opts = ntfAudienceOptions[ntfType];

  if (!opts) {
    sel.innerHTML = '<option value="">Loading audience options...</option>';
    return;
  }

  var previous = sel.value;
  sel.innerHTML = '';
  (opts.segments || []).forEach(function(s) {
    var o = document.createElement('option');
    o.value = s.key;
    o.textContent = s.label;
    sel.appendChild(o);
  });
  if (previous) sel.value = previous;
  if (!sel.value) sel.value = (opts.segments && opts.segments[0] && opts.segments[0].key) || 'all';

  ntfOnSegmentChange();
}

function ntfOnSegmentChange() {
  var segSel = document.getElementById('ntf-segment');
  var segment = segSel ? segSel.value : 'all';
  var opts = ntfAudienceOptions[ntfType] || {};
  var def = (opts.segments || []).filter(function(s) { return s.key === segment; })[0] || {};

  var valueFg = document.getElementById('ntf-value-fg');
  var pickerFg = document.getElementById('ntf-picker-fg');

  if (def.requiresValue) {
    if (valueFg) valueFg.style.display = '';
    if (pickerFg) pickerFg.style.display = 'none';

    var label = document.getElementById('ntf-value-label');
    if (label) label.textContent = def.label || 'Value';

    var valueSel = document.getElementById('ntf-segment-value');
    if (valueSel) {
      var previousValue = valueSel.value; // keep the admin's pick across re-renders
      valueSel.innerHTML = '';
      var values = (opts.values || {})[segment] || [];
      if (!values.length) {
        var empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'No values available yet';
        valueSel.appendChild(empty);
      } else {
        values.forEach(function(v) {
          var val = typeof v === 'object' && v !== null ? v.value : v;
          var lab = typeof v === 'object' && v !== null ? (v.label || v.value) : v;
          var o = document.createElement('option');
          o.value = val;
          o.textContent = lab;
          valueSel.appendChild(o);
        });
        if (previousValue) valueSel.value = previousValue;
        if (!valueSel.value) valueSel.selectedIndex = 0;
      }
    }
  } else if (def.requiresPicker) {
    if (valueFg) valueFg.style.display = 'none';
    if (pickerFg) pickerFg.style.display = '';
  } else {
    if (valueFg) valueFg.style.display = 'none';
    if (pickerFg) pickerFg.style.display = 'none';
  }

  ntfQueueEstimate();
}

// ─── Specific recipients picker ───────────────────────────────────

function ntfPickerSearch(v) {
  clearTimeout(ntfPickerTimer);
  ntfPickerSeq++;
  var q = String(v || '').trim();
  if (!q) {
    ntfRenderPickerResults([]);
    return;
  }
  ntfPickerTimer = setTimeout(function() {
    var seq = ntfPickerSeq;
    if (ntfType === 'user') {
      api('GET', '/users?q=' + encodeURIComponent(q) + '&limit=8').then(function(res) {
        if (seq !== ntfPickerSeq) return; // superseded by a newer search or type switch
        var users = (res.data && res.data.users) || [];
        ntfRenderPickerResults(users.map(function(u) {
          return {
            id: u.id,
            name: u.fullName || u.email || u.id,
            sub: [u.email, u.phone].filter(Boolean).join(' · '),
            status: u.status
          };
        }), true);
      }).catch(function(e) {
        if (seq !== ntfPickerSeq) return;
        toast('Search failed: ' + e.message, false);
      });
    } else {
      // The drivers endpoint returns everything, so filter client-side.
      var all = [];
      if (typeof cachedDrivers === 'object' && cachedDrivers) {
        Object.keys(cachedDrivers).forEach(function(k) { all.push(cachedDrivers[k]); });
      }
      var lq = q.toLowerCase();
      ntfRenderPickerResults(all.filter(function(d) {
        return (d.fullName || '').toLowerCase().indexOf(lq) >= 0 ||
          (d.email || '').toLowerCase().indexOf(lq) >= 0 ||
          (d.phoneNumber || '').toLowerCase().indexOf(lq) >= 0 ||
          (d.driverId || '').toLowerCase().indexOf(lq) >= 0;
      }).slice(0, 8).map(function(d) {
        return {
          id: d.id,
          name: d.fullName || d.email || d.driverId || d.id,
          sub: [d.driverId, d.email].filter(Boolean).join(' · '),
          status: d.status
        };
      }), true);
    }
  }, 300);
}

function ntfRenderPickerResults(items, searched) {
  var box = document.getElementById('ntf-picker-results');
  if (!box) return;
  ntfPickerItems = items || [];

  if (!ntfPickerItems.length) {
    box.innerHTML = searched
      ? '<div class="ntf-pick-empty">No matching ' + (ntfType === 'driver' ? 'drivers' : 'users') + ' found</div>'
      : '';
    box.style.display = searched ? '' : 'none';
    return;
  }

  var html = '';
  ntfPickerItems.forEach(function(r, i) {
    var added = ntfSelected.some(function(s) { return s.id === r.id; });
    html += '<div class="ntf-pick-row' + (added ? ' on' : '') + '" onclick="ntfAddRecipient(' + i + ')">' +
      '<div class="ntf-pick-main">' +
        '<span class="ntf-pick-name">' + esc(r.name) + '</span>' +
        (r.sub ? '<span class="ntf-pick-sub">' + esc(r.sub) + '</span>' : '') +
      '</div>' +
      '<span class="ntf-pick-action">' + (added ? 'Added' : 'Add') + '</span>' +
    '</div>';
  });
  box.innerHTML = html;
  box.style.display = '';
}

function ntfAddRecipient(i) {
  var r = ntfPickerItems[i];
  if (!r) return;
  if (ntfSelected.some(function(s) { return s.id === r.id; })) {
    toast('Already added');
    return;
  }
  ntfSelected.push({ id: r.id, name: r.name, sub: r.sub || '' });
  ntfRenderSelected();
  ntfRenderPickerResults(ntfPickerItems);
  ntfQueueEstimate();
}

function ntfRemoveRecipient(i) {
  ntfSelected.splice(i, 1);
  ntfRenderSelected();
  ntfRenderPickerResults(ntfPickerItems);
  ntfQueueEstimate();
}

function ntfRenderSelected() {
  var el = document.getElementById('ntf-selected');
  if (!el) return;
  if (!ntfSelected.length) {
    el.innerHTML = '<span class="ntf-selected-hint">No recipients picked yet.</span>';
    return;
  }
  var html = '<div class="ntf-chip-row">';
  ntfSelected.forEach(function(r, i) {
    html += '<span class="ntf-chip">' + esc(r.name) +
      '<button type="button" class="ntf-chip-x" onclick="ntfRemoveRecipient(' + i + ')" aria-label="Remove">&times;</button></span>';
  });
  html += '</div>';
  html += '<span class="ntf-selected-hint">' + ntfSelected.length + ' recipient' + (ntfSelected.length === 1 ? '' : 's') + ' selected</span>';
  el.innerHTML = html;
}

// ─── Audience estimate ────────────────────────────────────────────

function ntfAudienceBody() {
  var segSel = document.getElementById('ntf-segment');
  var valSel = document.getElementById('ntf-segment-value');
  var segment = segSel ? segSel.value : 'all';
  var body = {
    recipientType: ntfType,
    segment: segment,
    segmentValue: null,
    recipientIds: []
  };
  if (ntfSegmentNeedsValue(segment) && valSel) body.segmentValue = valSel.value;
  if (segment === 'specific') body.recipientIds = ntfSelected.map(function(r) { return r.id; });
  return body;
}

function ntfQueueEstimate() {
  clearTimeout(ntfEstimateTimer);
  ntfEstimateSeq++;            // invalidates any in-flight estimate
  ntfEstimateData = null;      // unknown until the new estimate lands
  ntfSetEstimate('…', '…');
  ntfEstimateTimer = setTimeout(ntfRunEstimate, 350);
}

function ntfRunEstimate() {
  var body = ntfAudienceBody();
  if (!body.segment) return; // options still loading — wait for ntfOnSegmentChange
  if (body.segment === 'specific' && !body.recipientIds.length) {
    ntfEstimateData = { matched: 0, reachable: 0 };
    ntfSetEstimate(0, 0);
    return;
  }
  var seq = ++ntfEstimateSeq;
  api('POST', '/notifications/audience/estimate', body).then(function(res) {
    if (seq !== ntfEstimateSeq) return; // a newer estimate replaced this one
    ntfEstimateData = { matched: res.data.matched, reachable: res.data.reachable };
    ntfSetEstimate(res.data.matched, res.data.reachable);
  }).catch(function() {
    if (seq !== ntfEstimateSeq) return;
    ntfEstimateData = null;
    ntfSetEstimate('—', '—');
  });
}

function ntfSetEstimate(matched, reachable) {
  ntfSetText('ntf-estimate-value', typeof matched === 'number' ? matched.toLocaleString() : String(matched));
  ntfSetText('ntf-estimate-devices', typeof reachable === 'number' ? reachable.toLocaleString() : String(reachable));
}

// ─── Compose: content + preview + image ───────────────────────────

function ntfOnComposeInput() {
  var title = (document.getElementById('ntf-title') || {}).value || '';
  var msg = (document.getElementById('ntf-message') || {}).value || '';
  ntfSetText('ntf-title-count', title.length + '/255');
  ntfSetText('ntf-msg-count', msg.length + '/1000');
  ntfUpdatePreview();
}

function ntfUpdatePreview() {
  var title = ((document.getElementById('ntf-title') || {}).value || '').trim();
  var msg = ((document.getElementById('ntf-message') || {}).value || '').trim();
  ntfSetText('ntf-preview-title', title || 'Notification title');
  ntfSetText('ntf-preview-text', msg || 'Your message will appear here...');

  var url = ((document.getElementById('ntf-image-url') || {}).value || '').trim();
  var img = document.getElementById('ntf-preview-img');
  if (img) {
    if (/^https?:\/\//i.test(url)) {
      img.onerror = function() { this.style.display = 'none'; };
      img.src = url;
      img.style.display = '';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
    }
  }
}

function ntfOnImageFile(input) {
  var file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('Image must be 5MB or smaller', false);
    return;
  }

  ntfUploading = true;
  ntfSetText('ntf-image-status', 'Uploading image...');

  var fd = new FormData();
  fd.append('image', file);
  fetch(API_BASE + '/notifications/upload/image', {
    method: 'POST',
    headers: authToken ? { Authorization: 'Bearer ' + authToken } : {},
    body: fd
  }).then(function(r) {
    if (r.status === 401) { doLogout(); throw new Error('Session expired'); }
    return r.json();
  }).then(function(json) {
    if (!json.success) throw new Error(json.message || 'Upload failed');
    var urlInput = document.getElementById('ntf-image-url');
    if (urlInput) urlInput.value = json.data.url;
    ntfSetText('ntf-image-status', 'Uploaded: ' + (json.data.filename || 'image'));
    ntfUpdatePreview();
    toast('Image uploaded');
  }).catch(function(e) {
    ntfSetText('ntf-image-status', 'Upload failed: ' + (e.message || 'try again'));
    toast('Upload failed: ' + (e.message || ''), false);
  }).finally(function() {
    ntfUploading = false;
  });
}

// ─── Compose: delivery timing ─────────────────────────────────────

function ntfOnWhenChange() {
  var checked = document.querySelector('input[name="ntf-when"]:checked');
  var mode = checked ? checked.value : 'now';
  var fg = document.getElementById('ntf-schedule-fg');
  if (fg) fg.style.display = mode === 'schedule' ? '' : 'none';

  if (mode === 'schedule') {
    var el = document.getElementById('ntf-schedule-at');
    if (el && !el.value) {
      var d = new Date(Date.now() + 60 * 60 * 1000);
      d.setSeconds(0, 0);
      el.value = ntfLocalInputValue(d);
    }
  }
}

// ─── Compose: review → confirm → send ─────────────────────────────

function ntfCollectForm() {
  var title = ((document.getElementById('ntf-title') || {}).value || '').trim();
  var message = ((document.getElementById('ntf-message') || {}).value || '').trim();
  var imageUrl = ((document.getElementById('ntf-image-url') || {}).value || '').trim();
  var segSel = document.getElementById('ntf-segment');
  var valSel = document.getElementById('ntf-segment-value');
  var segment = segSel ? segSel.value : 'all';
  var checked = document.querySelector('input[name="ntf-when"]:checked');
  var mode = checked ? checked.value : 'now';
  var scheduleInput = document.getElementById('ntf-schedule-at');

  return {
    title: title,
    message: message,
    imageUrl: imageUrl,
    recipientType: ntfType,
    segment: segment,
    segmentValue: ntfSegmentNeedsValue(segment) && valSel ? valSel.value : null,
    recipientIds: segment === 'specific' ? ntfSelected.map(function(r) { return r.id; }) : [],
    mode: mode,
    scheduleAt: mode === 'schedule' && scheduleInput ? scheduleInput.value : null
  };
}

function ntfFormErrors(form) {
  var errors = [];
  if (!form.title) errors.push('Title is required.');
  else if (form.title.length > 255) errors.push('Title must be 255 characters or fewer.');
  if (!form.message) errors.push('Message is required.');
  else if (form.message.length > 1000) errors.push('Message must be 1000 characters or fewer.');
  if (form.imageUrl && !/^https?:\/\/[^\s"']+$/i.test(form.imageUrl)) errors.push('Image must be a valid http(s) URL without quotes.');
  if (ntfUploading) errors.push('Wait for the image upload to finish.');

  if (ntfSegmentNeedsValue(form.segment) && !form.segmentValue) {
    errors.push('Choose a value for the selected segment.');
  }
  if (form.segment === 'specific' && !form.recipientIds.length) {
    errors.push('Pick at least one recipient.');
  }
  if (!form.segment) {
    errors.push('Audience options have not finished loading. Try again in a moment.');
  }
  if (form.mode === 'schedule') {
    if (!form.scheduleAt) {
      errors.push('Pick a date and time to schedule this notification.');
    } else {
      var when = new Date(form.scheduleAt);
      if (isNaN(when.getTime())) {
        errors.push('The schedule time is not a valid date.');
      } else if (when.getTime() <= Date.now() + 30000) {
        errors.push('The schedule time must be in the future.');
      }
    }
  }
  if (ntfEstimateData && ntfEstimateData.matched === 0) {
    errors.push('No recipients match this audience.');
  }
  return errors;
}

function ntfReviewSend() {
  if (ntfSending) return;
  var form = ntfCollectForm();
  var errors = ntfFormErrors(form);
  var errBox = document.getElementById('ntf-form-err');
  if (errors.length) {
    if (errBox) errBox.textContent = errors[0];
    return;
  }
  if (errBox) errBox.textContent = '';

  // Summary shown in the confirmation modal
  var rows = '';
  function row(label, value) {
    rows += '<div class="ntf-sum-row"><span class="ntf-sum-label">' + esc(label) + '</span>' +
      '<span class="ntf-sum-value">' + value + '</span></div>';
  }
  row('Title', esc(form.title));
  row('Message', esc(form.message.length > 180 ? form.message.slice(0, 177) + '...' : form.message));
  if (form.imageUrl) row('Image', '<span class="ntf-sum-ok">Attached</span>');
  row('Audience', esc(ntfType === 'driver' ? 'Drivers' : 'Users') + ' · ' + esc(ntfSegmentLabel({
    recipientType: form.recipientType,
    segment: form.segment,
    segmentValue: form.segmentValue,
    recipientIds: form.recipientIds
  })));
  if (ntfEstimateData) {
    row('Estimated reach', '<strong>' + ntfEstimateData.matched.toLocaleString() + '</strong> recipients · ' +
      ntfEstimateData.reachable.toLocaleString() + ' with devices');
  }
  row('Delivery', form.mode === 'schedule'
    ? 'Scheduled for <strong>' + esc(fmtDate(form.scheduleAt)) + '</strong>'
    : '<strong>Send now</strong>');

  ntfSetHtml('ntf-send-summary', rows);
  ntfSetText('ntf-send-err', '');

  var btn = document.getElementById('ntf-send-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Confirm & Send'; }

  var modal = document.getElementById('ntfSendModal');
  if (modal) {
    modal.classList.add('on');
    document.body.style.overflow = 'hidden';
  }
}

function ntfCloseSend() {
  ntfCloseModal('ntfSendModal');
}

function ntfSubmitSend() {
  if (ntfSending) return;
  var form = ntfCollectForm();
  var errors = ntfFormErrors(form);
  if (errors.length) {
    ntfCloseSend();
    ntfSetText('ntf-form-err', errors[0]);
    return;
  }

  ntfSending = true;
  var btn = document.getElementById('ntf-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }

  var body = {
    title: form.title,
    message: form.message,
    imageUrl: form.imageUrl || '',
    recipientType: form.recipientType,
    segment: form.segment,
    segmentValue: form.segmentValue,
    recipientIds: form.recipientIds
  };
  if (form.mode === 'schedule') body.scheduleAt = form.scheduleAt;

  api('POST', '/notifications', body).then(function(res) {
    ntfCloseSend();
    toast(res.message || 'Notification queued');
    ntfResetComposeContent();
    ntfHistState.page = 1;      // the new notification belongs on the first page
    ntfHistState.loaded = false; // force a fresh history load on the tab switch
    ntfShowTab('history');
  }).catch(function(e) {
    ntfSetText('ntf-send-err', e.message || 'Failed to create notification');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm & Send'; }
  }).finally(function() {
    ntfSending = false;
  });
}

// Clears the message side of the form, keeps the audience selection.
function ntfResetComposeContent() {
  var title = document.getElementById('ntf-title');
  var msg = document.getElementById('ntf-message');
  var img = document.getElementById('ntf-image-url');
  if (title) title.value = '';
  if (msg) msg.value = '';
  if (img) img.value = '';
  ntfSetText('ntf-image-status', 'Shown in the notification where the device supports it.');
  ntfOnComposeInput();
}

// ─── History: list + filters + stats ──────────────────────────────

function ntfListPath() {
  var p = '/notifications?page=' + ntfHistState.page + '&limit=' + ntfHistState.limit;
  if (ntfHistState.q) p += '&q=' + encodeURIComponent(ntfHistState.q);
  if (ntfHistState.status) p += '&status=' + encodeURIComponent(ntfHistState.status);
  if (ntfHistState.type) p += '&recipientType=' + encodeURIComponent(ntfHistState.type);
  return p;
}

function ntfHasFilters() {
  return !!(ntfHistState.q || ntfHistState.status || ntfHistState.type);
}

function ntfShowListState(state, message) {
  var loading = document.getElementById('ntf-loading');
  var error = document.getElementById('ntf-error');
  var list = document.getElementById('ntf-list');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') ntfSetText('ntf-error-text', message || 'Something went wrong');
  }
  if (list) list.style.display = state === 'loading' || state === 'error' ? 'none' : '';
}

function loadNotificationHistory(force) {
  ntfStartPolling();
  if (!force && ntfHistState.loaded) return; // polling keeps an open view fresh
  if (ntfHistState.loading) { ntfHistState.pending = true; return; }
  ntfHistState.loading = true;
  ntfHistState.pending = false;
  var seq = ++ntfLoadSeq;
  ntfShowListState('loading');
  ntfSetText('ntf-hint', '');

  api('GET', ntfListPath()).then(function(res) {
    if (seq !== ntfLoadSeq) return; // superseded by a newer full load
    ntfApplyListResponse(res);
    ntfHistState.loaded = true;
    ntfShowListState('ready');
    ntfRenderStats();
    ntfRenderList();
  }).catch(function(e) {
    if (seq !== ntfLoadSeq) return;
    ntfShowListState('error', e.message);
    toast('Error: ' + e.message, false);
  }).finally(function() {
    ntfHistState.loading = false;
    // A filter/page change that arrived mid-load runs now instead of being dropped.
    if (ntfHistState.pending) {
      ntfHistState.pending = false;
      loadNotificationHistory(true);
    }
  });
}

function ntfApplyListResponse(res) {
  ntfItems = (res.data && res.data.notifications) || [];
  ntfStats = (res.data && res.data.stats) || ntfStats;
  ntfPagination = res.pagination || null;
}

// Refreshes the list without touching the loading/error UI (polling, after
// create/cancel) so the view never flashes.
function ntfSilentRefresh() {
  if (ntfHistState.loading) return Promise.resolve();
  var seq = ntfLoadSeq;
  return api('GET', ntfListPath()).then(function(res) {
    if (seq !== ntfLoadSeq) return; // a full load started after this refresh
    ntfApplyListResponse(res);
    // A successful refresh also clears a previous error state.
    ntfShowListState('ready');
    ntfRenderStats();
    ntfRenderList();
  }).catch(function() { /* silent — the visible state stays as-is */ });
}

function ntfRenderStats() {
  if (!ntfStats) return;
  ntfSetText('ntf-h-total', Number(ntfStats.total || 0).toLocaleString());
  ntfSetText('ntf-h-scheduled', Number(ntfStats.scheduled || 0).toLocaleString());
  ntfSetText('ntf-h-sent', Number(ntfStats.sent || 0).toLocaleString());
  ntfSetText('ntf-h-failed', Number(ntfStats.failed || 0).toLocaleString());
  ntfSetText('ntf-h-devices', Number(ntfStats.devicesReached || 0).toLocaleString());

  var pending = (Number(ntfStats.scheduled) || 0) + (Number(ntfStats.sending) || 0);
  var badge = document.getElementById('ntf-hist-badge');
  if (badge) {
    badge.textContent = pending > 99 ? '99+' : String(pending);
    badge.style.display = pending > 0 ? '' : 'none';
  }
}

function ntfItemHtml(n) {
  var pending = n.status === 'scheduled' || n.status === 'sending';
  var whenLabel = '';
  if (n.status === 'scheduled') whenLabel = 'Scheduled for ' + fmtDate(n.scheduledAt);
  else if (n.status === 'sending') whenLabel = 'Sending…';
  else if (n.status === 'sent') whenLabel = 'Sent ' + fmtDate(n.sentAt || n.createdAt);
  else if (n.status === 'cancelled') whenLabel = 'Cancelled ' + fmtDate(n.cancelledAt || n.updatedAt);
  else whenLabel = 'Failed ' + fmtDate(n.updatedAt);

  var counts = '';
  if (n.status === 'sent' || n.status === 'sending') {
    counts = Number(n.totalRecipients || 0).toLocaleString() + ' recipient' +
      (Number(n.totalRecipients) === 1 ? '' : 's') +
      ' · ' + Number(n.sentCount || 0).toLocaleString() + ' pushed' +
      (Number(n.failedCount) ? ' · ' + Number(n.failedCount).toLocaleString() + ' failed' : '');
  } else if (pending) {
    counts = 'Not delivered yet';
  } else if (n.status === 'cancelled') {
    counts = 'Never delivered';
  } else {
    counts = n.error ? esc(n.error) : '—';
  }

  var imageUrl = n.imageUrl ? '<span class="ntf-item-media" title="Has image">🖼</span>' : '';

  return '<div class="card ntf-item ' + (NTF_STATUS_TAG[n.status] || '') + '" onclick="openNtfDetail(' + n.id + ')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openNtfDetail(' + n.id + ')}" role="button" tabindex="0">' +
    '<div class="ntf-item-top">' +
      '<span class="ntf-item-title">' + esc(n.title) + imageUrl + '</span>' +
      ntfStatusTag(n.status) +
    '</div>' +
    '<div class="ntf-item-msg">' + esc(n.message) + '</div>' +
    '<div class="ntf-item-meta">' +
      ntfTypeTag(n.recipientType) +
      '<span class="ntf-item-seg">' + esc(ntfSegmentLabel(n)) + '</span>' +
      '<span class="ntf-item-when">' + esc(whenLabel) + '</span>' +
    '</div>' +
    '<div class="ntf-item-bottom">' +
      '<span class="ntf-item-id">' + esc(n.notificationId) + '</span>' +
      '<span class="ntf-item-counts">' + counts + '</span>' +
    '</div>' +
  '</div>';
}

function ntfRenderList() {
  var el = document.getElementById('ntf-list');
  if (!el) return;
  var prevTop = el.scrollTop;
  var html = '';

  (ntfItems || []).forEach(function(n) { html += ntfItemHtml(n); });

  if (!html) {
    // Page fell off the end (total shrank under us) — snap back to page 1.
    var pg0 = ntfPagination || {};
    if ((pg0.total || 0) > 0 && ntfHistState.page > 1) {
      ntfHistState.page = 1;
      loadNotificationHistory(true);
      return;
    }
    var filtered = ntfHasFilters();
    html = '<div class="rd-empty">' +
      '<div class="rd-empty-icon">' + (filtered ? '🔍' : '🔔') + '</div>' +
      '<div class="rd-empty-title">' + (filtered ? 'No notifications match your search' : 'No notifications yet') + '</div>' +
      '<div class="rd-empty-text">' +
        (filtered
          ? 'Try a different search term or clear the filters above.'
          : 'Compose your first broadcast from the Compose tab. Scheduled and sent notifications appear here.') +
      '</div>' +
    '</div>';
  }
  el.innerHTML = html;
  el.scrollTop = prevTop;

  var total = ntfPagination ? ntfPagination.total : (ntfItems || []).length;
  ntfSetText('ntf-count', total + ' notification' + (total === 1 ? '' : 's'));

  if (total) {
    // Use the page the data actually came from (ntfHistState.page may have
    // been advanced by a rapid double-click before this response landed).
    var pg = ntfPagination || {};
    var shownPage = pg.page || ntfHistState.page;
    var start = (shownPage - 1) * ntfHistState.limit + 1;
    var end = Math.min(total, start + (ntfItems || []).length - 1);
    ntfSetText('ntf-hint', start === end ? String(total) : start + '–' + end + ' of ' + total);
  } else {
    ntfSetText('ntf-hint', '');
  }

  var clear = document.getElementById('ntf-clear');
  if (clear) clear.style.display = ntfHasFilters() ? '' : 'none';

  ntfRenderPagination();
}

function ntfRenderPagination() {
  var el = document.getElementById('ntf-pagination');
  if (!el) return;
  var pg = ntfPagination;
  if (!pg || !pg.totalPages || pg.totalPages <= 1) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  el.innerHTML =
    '<button class="btn btn-ghost btn-sm" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="ntfGoPage(' + (pg.page - 1) + ')">Prev</button>' +
    '<span class="um-page-info">Page ' + pg.page + ' of ' + pg.totalPages + '</span>' +
    '<button class="btn btn-ghost btn-sm" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="ntfGoPage(' + (pg.page + 1) + ')">Next</button>';
}

function ntfGoPage(page) {
  ntfHistState.page = page;
  loadNotificationHistory(true);
}

function onNtfSearch(v) {
  clearTimeout(ntfSearchTimer);
  ntfSearchTimer = setTimeout(function() {
    ntfHistState.q = String(v || '').trim();
    ntfHistState.page = 1;
    loadNotificationHistory(true);
  }, 300);
}

function ntfFilterHistory() {
  var status = document.getElementById('ntf-status-filter');
  var type = document.getElementById('ntf-type-filter');
  ntfHistState.status = status ? status.value : '';
  ntfHistState.type = type ? type.value : '';
  ntfHistState.page = 1;
  loadNotificationHistory(true);
}

function ntfClearHistoryFilters() {
  clearTimeout(ntfSearchTimer); // don't let a keystroke in flight re-apply the old query
  ['ntf-status-filter', 'ntf-type-filter'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var s = document.getElementById('ntf-search');
  if (s) s.value = '';
  ntfHistState.q = '';
  ntfFilterHistory();
}

// ─── Detail modal ─────────────────────────────────────────────────

function ntfOpenModal(id) {
  var modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('on');
    document.body.style.overflow = 'hidden';
  }
}

function ntfCloseModal(id) {
  var modal = document.getElementById(id);
  if (modal) modal.classList.remove('on');
  var anyOpen = ['ntfSendModal', 'ntfDetailModal', 'ntfConfirmModal'].some(function(mid) {
    var m = document.getElementById(mid);
    return m && m.classList.contains('on');
  });
  if (!anyOpen) document.body.style.overflow = '';
}

function openNtfDetail(id) {
  ntfDetailId = id;
  ntfSetHtml('ntf-detail-title', 'Notification');
  ntfSetText('ntf-detail-ref', '');
  ntfSetHtml('ntf-detail-body',
    '<div class="drv-loading"><div class="drv-loading-spinner"></div>' +
    '<div class="drv-loading-text">Loading notification...</div></div>');
  ntfOpenModal('ntfDetailModal');

  api('GET', '/notifications/' + id).then(function(res) {
    if (ntfDetailId !== id) return; // a newer detail replaced this one
    ntfRenderDetail(res.data.notification);
  }).catch(function(e) {
    if (ntfDetailId !== id) return;
    ntfSetHtml('ntf-detail-body',
      '<div class="drv-error"><div class="drv-error-icon">⚠️</div>' +
      '<div class="drv-error-title">Failed to load notification</div>' +
      '<div class="drv-error-text">' + esc(e.message) + '</div>' +
      '<button class="btn btn-accent btn-sm" onclick="openNtfDetail(' + id + ')">Retry</button></div>');
  });
}

function ntfDetailRow(label, value) {
  return '<div class="ntf-detail-row"><span class="ntf-detail-label">' + esc(label) + '</span>' +
    '<span class="ntf-detail-value">' + value + '</span></div>';
}

function ntfStatCell(label, value, cls) {
  return '<div class="ntf-stat-cell ' + (cls || '') + '">' +
    '<div class="ntf-stat-cell-value">' + esc(String(value)) + '</div>' +
    '<div class="ntf-stat-cell-label">' + esc(label) + '</div></div>';
}

function ntfRenderDetail(n) {
  ntfSetText('ntf-detail-title', n.title || 'Notification');
  ntfSetText('ntf-detail-ref', n.notificationId || '');

  var html = '<div class="ntf-detail-head">' + ntfStatusTag(n.status) + ntfTypeTag(n.recipientType) +
    '<span class="ntf-detail-seg">' + esc(ntfSegmentLabel(n)) + '</span></div>';

  html += '<div class="ntf-detail-content">' +
    '<div class="ntf-detail-content-title">' + esc(n.title) + '</div>' +
    '<div class="ntf-detail-content-msg">' + esc(n.message) + '</div>' +
    (n.imageUrl ? '<img class="ntf-detail-img" src="' + ntfEscAttr(n.imageUrl) + '" alt="" onerror="this.style.display=\'none\'">' : '') +
  '</div>';

  if (n.status === 'sent' || n.status === 'sending') {
    html += '<div class="ntf-stat-grid">' +
      ntfStatCell('Matched', Number(n.totalRecipients || 0).toLocaleString()) +
      ntfStatCell('With devices', Number(n.withDevices || 0).toLocaleString()) +
      ntfStatCell('Pushed', Number(n.sentCount || 0).toLocaleString(), 'ntf-stat-ok') +
      ntfStatCell('Failed', Number(n.failedCount || 0).toLocaleString(), Number(n.failedCount) ? 'ntf-stat-bad' : '') +
      ntfStatCell('No device', Number(n.skippedCount || 0).toLocaleString()) +
    '</div>';
  }

  if (n.error) {
    html += '<div class="ntf-detail-note">' + esc(n.error) + '</div>';
  }

  html += '<div class="ntf-detail-block">' +
    ntfDetailRow('Status', ntfStatusTag(n.status)) +
    ntfDetailRow('Audience', esc(ntfSegmentLabel(n))) +
    ntfDetailRow('Created', esc(fmtDate(n.createdAt))) +
    (n.scheduledAt ? ntfDetailRow('Scheduled for', esc(fmtDate(n.scheduledAt))) : '') +
    (n.sentAt ? ntfDetailRow('Sent', esc(fmtDate(n.sentAt))) : '') +
    (n.cancelledAt ? ntfDetailRow('Cancelled', esc(fmtDate(n.cancelledAt))) : '') +
    ntfDetailRow('Created by', esc(n.createdBy || '—')) +
    ntfDetailRow('ID', '<code class="ntf-detail-id">' + esc(n.notificationId) + '</code>') +
  '</div>';

  if (n.status === 'scheduled') {
    html += '<div class="ntf-detail-actions">' +
      '<button class="btn btn-red btn-sm" onclick="ntfAskCancel(' + n.id + ')">' +
      'Cancel scheduled send</button></div>';
  }

  ntfSetHtml('ntf-detail-body', html);
}

function ntfCloseDetail() {
  ntfCloseModal('ntfDetailModal');
  ntfDetailId = null;
}

// ─── Cancel a scheduled notification ──────────────────────────────

function ntfAskCancel(id) {
  ntfSetHtml('ntf-confirm-title', 'Cancel this scheduled notification?');
  ntfSetHtml('ntf-confirm-desc', 'It will not be delivered to anyone. This cannot be undone.');
  ntfSetHtml('ntf-confirm-err', '');
  var btn = document.getElementById('ntf-confirm-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Cancel Notification'; }

  ntfConfirmCb = function() {
    return api('POST', '/notifications/' + id + '/cancel').then(function(res) {
      ntfCloseConfirm();
      toast(res.message || 'Notification cancelled');
      if (ntfDetailId === id) openNtfDetail(id);
      ntfSilentRefresh();
    });
  };

  ntfOpenModal('ntfConfirmModal');
}

function ntfCloseConfirm() {
  ntfCloseModal('ntfConfirmModal');
  ntfConfirmCb = null;
}

function ntfApplyConfirm() {
  if (!ntfConfirmCb) return;
  var btn = document.getElementById('ntf-confirm-btn');
  var err = document.getElementById('ntf-confirm-err');
  if (err) err.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }

  ntfConfirmBusy = true;
  var cb = ntfConfirmCb;
  Promise.resolve().then(function() { return cb(); }).then(function() {
    // ntfCloseConfirm() already ran inside the callback
  }).catch(function(e) {
    if (err) err.textContent = e.message || 'Action failed';
    if (btn) { btn.disabled = false; btn.textContent = 'Cancel Notification'; }
  }).finally(function() {
    ntfConfirmBusy = false;
  });
}

// ─── Polling (keeps history fresh without a realtime system) ──────

function ntfStartPolling() {
  if (ntfPollTimer) return;
  ntfPollTimer = setInterval(ntfPollTick, 15000);
}

function stopNotificationsPolling() {
  if (ntfPollTimer) {
    clearInterval(ntfPollTimer);
    ntfPollTimer = null;
  }
}

function ntfPollTick() {
  var panel = document.getElementById('panel-notifications');
  if (!panel || !panel.classList.contains('on')) { stopNotificationsPolling(); return; }
  if (ntfTab !== 'history') return;
  if (ntfHistState.loading || ntfSending || ntfUploading) return;

  var modalOpen = ['ntfSendModal', 'ntfDetailModal', 'ntfConfirmModal'].some(function(id) {
    var m = document.getElementById(id);
    return m && m.classList.contains('on');
  });
  if (modalOpen) return;

  ntfSilentRefresh();
}

// ─── Keyboard / modal wiring ──────────────────────────────────────

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  if (ntfConfirmCb) { if (!ntfConfirmBusy) ntfCloseConfirm(); return; }
  var send = document.getElementById('ntfSendModal');
  if (send && send.classList.contains('on')) { if (!ntfSending) ntfCloseSend(); return; }
  var detail = document.getElementById('ntfDetailModal');
  if (detail && detail.classList.contains('on')) ntfCloseDetail();
});

document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'ntfSendModal' && !ntfSending) ntfCloseSend();
  if (e.target && e.target.id === 'ntfDetailModal') ntfCloseDetail();
  if (e.target && e.target.id === 'ntfConfirmModal' && ntfConfirmCb && !ntfConfirmBusy) ntfCloseConfirm();
});
