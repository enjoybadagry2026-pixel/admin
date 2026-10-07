// ═══════════════ SUPPORT INBOX ═══════════════
// Central support desk for tickets raised by app users and drivers.
// Conversations and messages are real backend records — nothing here is
// mocked or stored locally; every read/write goes through the admin API.
//
// Backed by GET    /api/admin/support/conversations          (list + stats + filters)
//          GET    /api/admin/support/conversations/:id       (thread; clears admin unread)
//          POST   /api/admin/support/conversations/:id/messages  (reply / internal note)
//          PATCH  /api/admin/support/conversations/:id       (status, priority, reason)
//          POST   /api/admin/support/upload/image            (attachment, multipart)
//
// Unread state lives on the conversation (unread_for_admin) and is cleared by
// the backend when the thread is opened. The admin panel has no WebSocket of
// its own, so the inbox polls the existing endpoints while the tab is visible.

var supState = { page: 1, limit: 20, q: '', type: '', status: '', unread: '', priority: '', from: '', to: '', loaded: false, loading: false };
var supListData = [];
var supPagination = null;
var supStats = null;
var supSearchTimer = null;

var supActiveId = null;
var supActive = null;
var supMessages = [];
var supDetailState = 'empty';   // empty | loading | ready | error
var supDetailError = '';

var supSending = false;
var supUploading = false;
var supNoteMode = false;
var supAttach = null;
var supDrafts = {};
var supConfirmCb = null;
var supPollTimer = null;

var SUP_STATUS_LABEL = { open: 'Open', pending: 'Pending', resolved: 'Resolved', closed: 'Closed' };
var SUP_STATUS_TAG = { open: 'sup-st-open', pending: 'sup-st-pending', resolved: 'sup-st-resolved', closed: 'sup-st-closed' };
var SUP_CATEGORY_LABEL = {
  general: 'General', account: 'Account', payment: 'Payment', ride: 'Ride', food: 'Food',
  hotel: 'Hotel', destination: 'Destination', driver: 'Driver', technical: 'Technical', other: 'Other'
};

function supSetText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function supSetHtml(id, val) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = val;
}

function supAttr(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function supCap(s) {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function supAdminName() {
  try {
    var u = JSON.parse(localStorage.getItem('admin_user') || 'null') || {};
    return u.fullName || u.name || u.email || 'Support';
  } catch (e) { return 'Support'; }
}

// ─── Presentational helpers ────────────────────────────────────────

function supInitials(name) {
  var n = String(name || '').trim();
  if (!n) return '?';
  return n.split(/\s+/).slice(0, 2).map(function(w) { return w.charAt(0); }).join('').toUpperCase();
}

function supAvatar(conv, cls) {
  var url = (conv && conv.requesterAvatar) || '';
  if (url) {
    return '<span class="' + cls + ' sup-av"><img src="' + supAttr(url) + '" alt="" onerror="this.remove()"></span>';
  }
  return '<span class="' + cls + ' sup-av sup-av-initials">' + esc(supInitials(conv && conv.requesterName)) + '</span>';
}

function supTypeTag(t) {
  return t === 'driver'
    ? '<span class="tag sup-type-driver">Driver</span>'
    : '<span class="tag sup-type-user">User</span>';
}

function supTypeLabel(t) { return t === 'driver' ? 'Driver' : 'User'; }

function supStatusTag(status) {
  var s = SUP_STATUS_LABEL[status] ? status : 'open';
  return '<span class="tag ' + SUP_STATUS_TAG[s] + '">' + SUP_STATUS_LABEL[s] + '</span>';
}

function supPrioTag(priority, always) {
  var p = String(priority || 'normal');
  if (p === 'normal' && !always) return '';
  var cls = { low: 'sup-pr-low', normal: 'sup-pr-normal', high: 'sup-pr-high', urgent: 'sup-pr-urgent' }[p] || 'sup-pr-normal';
  return '<span class="tag ' + cls + '">' + supCap(p) + '</span>';
}

function supCategoryLabel(c) { return SUP_CATEGORY_LABEL[c] || supCap(c || 'general'); }

function supWhen(iso) {
  if (!iso) return '';
  var diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return fmtDate(iso);
  if (diff < 0) return fmtDate(iso);
  var m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  var d = Math.floor(h / 24);
  if (d < 7) return d + 'd ago';
  return fmtDate(iso);
}

function supMsgTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var time = d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) + ', ' + time;
}

// ─── Inbox list ────────────────────────────────────────────────────

function supListPath() {
  var p = '/support/conversations?page=' + supState.page + '&limit=' + supState.limit;
  if (supState.q) p += '&q=' + encodeURIComponent(supState.q);
  if (supState.type) p += '&type=' + encodeURIComponent(supState.type);
  if (supState.status) p += '&status=' + encodeURIComponent(supState.status);
  if (supState.unread) p += '&unread=' + encodeURIComponent(supState.unread);
  if (supState.priority) p += '&priority=' + encodeURIComponent(supState.priority);
  if (supState.from) p += '&from=' + encodeURIComponent(supState.from);
  if (supState.to) p += '&to=' + encodeURIComponent(supState.to + 'T23:59:59');
  return p;
}

function supHasFilters() {
  return !!(supState.q || supState.type || supState.status || supState.unread ||
    supState.priority || supState.from || supState.to);
}

function supShowListState(state, message) {
  var loading = document.getElementById('sup-loading');
  var error = document.getElementById('sup-error');
  var list = document.getElementById('sup-list');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') supSetText('sup-error-text', message || 'Something went wrong');
  }
  if (list) list.style.display = state === 'loading' || state === 'error' ? 'none' : '';
}

function loadSupportInbox(force) {
  supStartPolling();
  if (supState.loading) return;
  if (!force && supState.loaded) { supSilentRefresh(); return; }
  supState.loading = true;
  supShowListState('loading');
  supSetText('sup-hint', '');

  api('GET', supListPath()).then(function(res) {
    supApplyListResponse(res);
    supState.loaded = true;
    supShowListState('ready');
    supRenderStats();
    renderSupportList();
  }).catch(function(e) {
    supShowListState('error', e.message);
    toast('Error: ' + e.message, false);
  }).finally(function() {
    supState.loading = false;
  });
}

function supApplyListResponse(res) {
  supListData = (res.data && res.data.conversations) || [];
  supStats = (res.data && res.data.stats) || supStats;
  supPagination = res.pagination || null;
}

// Refreshes the list without touching the loading/error UI (polling, after
// sending a message, after a status change) so the view never flashes.
function supSilentRefresh() {
  if (supState.loading) return;
  return api('GET', supListPath()).then(function(res) {
    supApplyListResponse(res);
    supRenderStats();
    renderSupportList();
  }).catch(function() { /* silent — the visible state stays as-is */ });
}

function supRenderStats() {
  if (!supStats) return;
  supSetText('sup-s-unread', Number(supStats.unread || 0).toLocaleString());
  supSetText('sup-s-open', Number(supStats.open || 0).toLocaleString());
  supSetText('sup-s-pending', Number(supStats.pending || 0).toLocaleString());
  supSetText('sup-s-resolved', Number(supStats.resolved || 0).toLocaleString());
  supSetText('sup-s-urgent', Number(supStats.urgent || 0).toLocaleString());
  supUpdateSideBadge();
}

function supUpdateSideBadge() {
  var badge = document.getElementById('sup-side-badge');
  if (!badge) return;
  var unread = supStats ? (Number(supStats.unread) || 0) : 0;
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.style.display = unread > 0 ? '' : 'none';
}

function supItemHtml(c) {
  var unread = Number(c.unreadForAdmin) || 0;
  var isSelected = supActiveId === c.id;
  var cls = 'sup-item' + (isSelected ? ' on' : '') + (unread ? ' unread' : '');

  var preview = c.lastMessage || (c.lastMessageType === 'image' ? 'Image' : 'No messages yet');
  if (c.lastSenderType === 'admin') preview = 'You: ' + preview;

  var tags = supStatusTag(c.status) + supPrioTag(c.priority, false) +
    '<span class="tag sup-tag-cat">' + esc(supCategoryLabel(c.category)) + '</span>';

  return '<div class="' + cls + '" onclick="openSupportConversation(' + c.id + ')" role="button" tabindex="0">' +
    supAvatar(c, 'sup-item-avatar') +
    '<div class="sup-item-main">' +
      '<div class="sup-item-row">' +
        '<span class="sup-item-name">' + esc(c.requesterName || 'Unknown') + '</span>' +
        '<span class="sup-item-time">' + esc(supWhen(c.lastMessageAt || c.createdAt)) + '</span>' +
      '</div>' +
      '<div class="sup-item-row sup-item-row2">' +
        supTypeTag(c.requesterType) +
        '<span class="sup-item-subject">' + esc(c.subject || 'Untitled ticket') + '</span>' +
      '</div>' +
      '<div class="sup-item-preview">' + esc(preview) + '</div>' +
      '<div class="sup-item-tags">' +
        '<span class="sup-item-ticket">' + esc(c.ticketId) + '</span>' + tags +
      '</div>' +
    '</div>' +
    (unread ? '<span class="sup-unread-dot" title="' + unread + ' unread message' + (unread === 1 ? '' : 's') + '">' + (unread > 9 ? '9+' : unread) + '</span>' : '') +
  '</div>';
}

function renderSupportList() {
  var el = document.getElementById('sup-list');
  if (!el) return;
  var scrollEl = el.closest('.sup-list-pane') || el;
  var prevTop = scrollEl.scrollTop;
  var html = '';

  (supListData || []).forEach(function(c) { html += supItemHtml(c); });

  if (!html) {
    var none = supHasFilters();
    html = '<div class="rd-empty">' +
      '<div class="rd-empty-icon">' + (none ? '🔍' : '📥') + '</div>' +
      '<div class="rd-empty-title">' + (none ? 'No conversations match your search' : 'No support tickets yet') + '</div>' +
      '<div class="rd-empty-text">' +
        (none
          ? 'Try a different search term or clear the filters above.'
          : 'Support tickets raised by users and drivers will appear here in real time.') +
      '</div>' +
    '</div>';
  }
  el.innerHTML = html;
  scrollEl.scrollTop = prevTop;

  var total = supPagination ? supPagination.total : (supListData || []).length;
  supSetText('sup-count', total + ' conversation' + (total === 1 ? '' : 's'));

  if (total) {
    var start = (supState.page - 1) * supState.limit + 1;
    var end = Math.min(total, start + (supListData || []).length - 1);
    supSetText('sup-hint', start === end ? String(total) : start + '–' + end + ' of ' + total);
  } else {
    supSetText('sup-hint', '');
  }

  var clear = document.getElementById('sup-clear');
  if (clear) clear.style.display = supHasFilters() ? '' : 'none';

  supRenderPagination();
}

function supRenderPagination() {
  var el = document.getElementById('sup-pagination');
  if (!el) return;
  var pg = supPagination;
  if (!pg || !pg.totalPages || pg.totalPages <= 1) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  el.innerHTML =
    '<button class="btn btn-ghost btn-sm" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="supGoPage(' + (pg.page - 1) + ')">Prev</button>' +
    '<span class="um-page-info">Page ' + pg.page + ' of ' + pg.totalPages + '</span>' +
    '<button class="btn btn-ghost btn-sm" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="supGoPage(' + (pg.page + 1) + ')">Next</button>';
}

function supGoPage(page) {
  supState.page = page;
  loadSupportInbox(true);
}

function onSupportSearch(v) {
  clearTimeout(supSearchTimer);
  supSearchTimer = setTimeout(function() {
    supState.q = String(v || '').trim();
    supState.page = 1;
    loadSupportInbox(true);
  }, 300);
}

function filterSupport() {
  var type = document.getElementById('sup-type-filter');
  var status = document.getElementById('sup-status-filter');
  var unread = document.getElementById('sup-unread-filter');
  var priority = document.getElementById('sup-priority-filter');
  var from = document.getElementById('sup-from');
  var to = document.getElementById('sup-to');
  supState.type = type ? type.value : '';
  supState.status = status ? status.value : '';
  supState.unread = unread ? unread.value : '';
  supState.priority = priority ? priority.value : '';
  supState.from = from ? from.value : '';
  supState.to = to ? to.value : '';
  supState.page = 1;
  loadSupportInbox(true);
}

function clearSupportFilters() {
  ['sup-type-filter', 'sup-status-filter', 'sup-unread-filter', 'sup-priority-filter', 'sup-from', 'sup-to'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var s = document.getElementById('sup-search');
  if (s) s.value = '';
  supState.q = '';
  filterSupport();
}

// ─── Conversation thread ───────────────────────────────────────────

function supSetLayoutThread(open) {
  var layout = document.querySelector('.sup-layout');
  if (layout) layout.classList.toggle('thread-open', !!open);
}

function openSupportConversation(id) {
  id = parseInt(id, 10);
  if (!id) return;
  if (supActiveId === id && supDetailState === 'ready') { supSetLayoutThread(true); return; }

  // Preserve the draft of the conversation we are leaving.
  var leavingInput = document.getElementById('sup-composer-input');
  if (leavingInput && supActiveId) supDrafts[supActiveId] = leavingInput.value;

  supActiveId = id;
  supActive = null;
  supMessages = [];
  supNoteMode = false;
  supAttach = null;
  supSetLayoutThread(true);
  supDetailState = 'loading';
  supDetailError = '';
  supRenderThread();

  var pane = document.getElementById('sup-thread-pane');
  if (pane && window.innerWidth <= 1024) pane.scrollIntoView({ block: 'start', behavior: 'smooth' });

  api('GET', '/support/conversations/' + id).then(function(res) {
    if (supActiveId !== id) return;
    supActive = res.data.conversation;
    supMessages = res.data.messages || [];
    supDetailState = 'ready';
    supRenderThread();
    supScrollMessages(true);
    supMarkListRead(id);
  }).catch(function(e) {
    if (supActiveId !== id) return;
    supDetailState = 'error';
    supDetailError = e.message;
    supRenderThread();
  });
}

// Silently re-fetches the open thread (polling / after sending) so new
// requester messages and status events show up without a UI flash.
function supLoadDetailSilent() {
  if (!supActiveId || supDetailState !== 'ready' || supSending) return Promise.resolve();
  var id = supActiveId;
  return api('GET', '/support/conversations/' + id).then(function(res) {
    if (supActiveId !== id || supSending) return;
    supActive = res.data.conversation;
    var pending = (supMessages || []).filter(function(m) { return m._pending || m._failed; });
    supMessages = (res.data.messages || []).concat(pending);
    supRenderHeader();
    supRenderMessages();
  }).catch(function() { /* keep the current view */ });
}

function supMarkListRead(id) {
  var changed = false;
  (supListData || []).forEach(function(c) {
    if (c.id === id && c.unreadForAdmin > 0) {
      c.unreadForAdmin = 0;
      changed = true;
      if (supStats && supStats.unread > 0) supStats.unread -= 1;
    }
  });
  if (changed) {
    supRenderStats();
    renderSupportList();
  }
}

function supBackToList() {
  supSetLayoutThread(false);
}

function supStatusActions(status) {
  if (status === 'open') return [['pending', 'Set Pending', 'btn-ghost'], ['resolved', 'Mark Resolved', 'btn-green'], ['closed', 'Close Ticket', 'btn-red']];
  if (status === 'pending') return [['open', 'Mark Open', 'btn-ghost'], ['resolved', 'Mark Resolved', 'btn-green'], ['closed', 'Close Ticket', 'btn-red']];
  if (status === 'resolved') return [['open', 'Reopen Ticket', 'btn-ghost'], ['closed', 'Close Ticket', 'btn-red']];
  if (status === 'closed') return [['open', 'Reopen Ticket', 'btn-ghost']];
  return [];
}

function supRenderHeader() {
  var el = document.getElementById('sup-thread-header');
  if (!el || !supActive) return;
  var c = supActive;

  var actions = supStatusActions(c.status).map(function(a) {
    return '<button class="btn btn-sm ' + a[2] + '" onclick="supAskStatus(\'' + a[0] + '\')">' + a[1] + '</button>';
  }).join('');

  var prioSel = '<div class="order-filter-wrap sup-prio-select">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>' +
    '<select onchange="supSetPriority(this.value)" title="Set priority">' +
      ['low', 'normal', 'high', 'urgent'].map(function(p) {
        return '<option value="' + p + '"' + ((c.priority || 'normal') === p ? ' selected' : '') + '>' + supCap(p) + ' priority</option>';
      }).join('') +
    '</select></div>';

  el.innerHTML =
    '<div class="sup-thread-head-top">' +
      '<button class="sup-back" onclick="supBackToList()" title="Back to conversations" aria-label="Back">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
      '</button>' +
      supAvatar(c, 'sup-thread-avatar') +
      '<div class="sup-thread-id">' +
        '<div class="sup-thread-name">' +
          esc(c.requesterName || 'Unknown') + ' ' + supTypeTag(c.requesterType) +
        '</div>' +
        '<div class="sup-thread-subject">' + esc(c.subject || 'Untitled ticket') + '</div>' +
        '<div class="sup-thread-contact">' +
          esc(c.requesterEmail || 'No email') +
          (c.requesterPhone ? ' · ' + esc(c.requesterPhone) : '') +
          (c.requesterDriverId ? ' · ID ' + esc(c.requesterDriverId) : '') +
        '</div>' +
      '</div>' +
      '<div class="sup-thread-badges">' + supStatusTag(c.status) + supPrioTag(c.priority, true) +
        '<span class="tag sup-tag-cat">' + esc(supCategoryLabel(c.category)) + '</span>' +
        '<span class="sup-ticket-id">' + esc(c.ticketId) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="sup-thread-actions">' +
      '<span class="sup-actions-label">Status</span>' + actions + prioSel +
    '</div>' +
    '<div class="sup-thread-meta">' +
      '<span>' + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Opened ' + esc(fmtDate(c.createdAt)) + '</span>' +
      '<span>Last activity ' + esc(supWhen(c.lastMessageAt || c.createdAt)) + '</span>' +
      (c.assignedTo ? '<span>Assigned to ' + esc(c.assignedTo) + '</span>' : '') +
      (c.statusReason && (c.status === 'closed' || c.status === 'resolved') ? '<span>Reason: ' + esc(c.statusReason) + '</span>' : '') +
    '</div>';
}

function supRenderMessages() {
  var el = document.getElementById('sup-messages');
  if (!el) return;

  var prevTop = el.scrollTop;
  var wasAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 60;
  var html = '';

  (supMessages || []).forEach(function(m) {
    html += supMessageHtml(m);
  });

  if (!html) {
    html = '<div class="sup-msg-empty">No messages in this conversation yet.</div>';
  }
  el.innerHTML = html;

  if (wasAtBottom) {
    el.scrollTop = el.scrollHeight;
  } else {
    el.scrollTop = prevTop;
  }
}

function supMessageHtml(m) {
  if (m.senderType === 'system') {
    return '<div class="sup-msg-system' + (m.internalNote ? ' is-note' : '') + '">' +
      '<span class="sup-system-chip">' + esc(m.message || '') + (m.internalNote ? ' · internal' : '') + '</span>' +
      '<span class="sup-system-time">' + esc(supMsgTime(m.createdAt)) + '</span>' +
    '</div>';
  }

  var isAdmin = m.senderType === 'admin';
  var cls = 'sup-msg ' + (isAdmin ? 'sup-msg-admin' : 'sup-msg-requester');
  if (m.internalNote) cls += ' sup-msg-note';
  if (m._pending) cls += ' sup-msg-pending';
  if (m._failed) cls += ' sup-msg-failed';

  var senderName = m.senderName || (isAdmin ? 'Support' : 'Someone');
  var typeBadge = isAdmin ? '<span class="tag sup-type-admin">Admin</span>' : supTypeTag(m.senderType);

  var body = '';
  if (m.imageUrl) {
    body += '<a class="sup-msg-image" href="' + supAttr(m.imageUrl) + '" target="_blank" rel="noopener">' +
      '<img src="' + supAttr(m.imageUrl) + '" alt="Attachment" loading="lazy">' +
    '</a>';
  }
  if (m.message) {
    body += '<div class="sup-msg-text">' + esc(m.message).replace(/\n/g, '<br>') + '</div>';
  }

  var foot = '';
  if (m.internalNote) {
    var audience = supActive ? supTypeLabel(supActive.requesterType).toLowerCase() : 'requester';
    foot += '<span class="sup-msg-flag">Internal note · not visible to the ' + esc(audience) + '</span>';
  }
  if (isAdmin && !m.internalNote && !m._pending && !m._failed) {
    foot += '<span class="sup-msg-read">' + (m.read
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Seen'
      : 'Sent') + '</span>';
  }
  if (m._pending) foot += '<span class="sup-msg-sending"><span class="sup-mini-spin"></span> Sending…</span>';
  if (m._failed) {
    foot += '<span class="sup-msg-error">' + esc(m._error || 'Failed to send') + '</span>' +
      '<span class="sup-msg-retry">' +
        '<button class="btn btn-ghost btn-xs" onclick="supRetrySend(\'' + supAttr(m.id) + '\')">Retry</button>' +
        '<button class="btn btn-ghost btn-xs" onclick="supDiscardSend(\'' + supAttr(m.id) + '\')">Discard</button>' +
      '</span>';
  }

  var avatar = isAdmin
    ? '<span class="sup-msg-avatar sup-msg-avatar-admin">' + esc(supInitials(supAdminName())) + '</span>'
    : supAvatar({ requesterName: senderName, requesterAvatar: supActive ? supActive.requesterAvatar : '' }, 'sup-msg-avatar');

  return '<div class="' + cls + '">' +
    avatar +
    '<div class="sup-msg-bubble">' +
      '<div class="sup-msg-head">' +
        '<span class="sup-msg-sender">' + esc(senderName) + '</span>' + typeBadge +
        '<span class="sup-msg-time">' + esc(supMsgTime(m.createdAt)) + '</span>' +
      '</div>' +
      (body || '<div class="sup-msg-text">&nbsp;</div>') +
      (foot ? '<div class="sup-msg-foot">' + foot + '</div>' : '') +
    '</div>' +
  '</div>';
}

function supScrollMessages(force) {
  var el = document.getElementById('sup-messages');
  if (!el) return;
  if (force) el.scrollTop = el.scrollHeight;
}

function supRenderComposer() {
  var el = document.getElementById('sup-composer');
  if (!el || !supActive) return;
  var name = supActive.requesterName || 'the requester';

  el.className = 'sup-composer' + (supNoteMode ? ' is-note' : '');
  el.innerHTML =
    '<div class="sup-attach-preview" id="sup-attach-preview" style="display:none"></div>' +
    '<div class="sup-composer-row">' +
      '<button type="button" class="sup-icon-btn" title="Attach image" onclick="supPickFile()" ' + (supUploading ? 'disabled' : '') + '>' +
        (supUploading
          ? '<span class="sup-mini-spin"></span>'
          : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>') +
      '</button>' +
      '<input type="file" id="sup-file" accept="image/*" style="display:none" onchange="supOnPickFile(event)">' +
      '<textarea id="sup-composer-input" rows="1" placeholder="' + (supNoteMode
        ? 'Internal note — only admins see this…'
        : 'Reply to ' + supAttr(name) + '…') + '" oninput="supComposerInput(event)" onkeydown="supComposerKey(event)"></textarea>' +
      '<button type="button" class="sup-icon-btn sup-note-btn' + (supNoteMode ? ' on' : '') + '" title="Toggle internal note" onclick="supToggleNote()">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' +
      '</button>' +
      '<button type="button" class="btn btn-accent sup-send-btn" id="sup-send-btn" onclick="supSendReply()">' +
        (supNoteMode ? 'Add Note' : 'Send') +
      '</button>' +
    '</div>' +
    '<div class="sup-composer-hint">' +
      (supNoteMode
        ? '<span class="sup-note-hint">Internal note — never shown to the requester</span>'
        : '<span>Enter to send · Shift + Enter for a new line</span>') +
      '<span id="sup-upload-state"></span>' +
    '</div>';

  supRenderAttachPreview();
  var input = document.getElementById('sup-composer-input');
  if (input) {
    input.value = supDrafts[supActiveId] || '';
    supAutoGrow(input);
    supUpdateSendState();
  }
}

function supRenderThread() {
  var el = document.getElementById('sup-thread-pane');
  if (!el) return;

  if (supDetailState === 'loading') {
    el.innerHTML = '<div class="sup-thread-state"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading conversation…</div></div>';
    return;
  }
  if (supDetailState === 'error') {
    el.innerHTML = '<div class="sup-thread-state">' +
      '<div class="drv-error-icon">⚠️</div>' +
      '<div class="drv-error-title">Failed to load this conversation</div>' +
      '<div class="drv-error-text">' + esc(supDetailError) + '</div>' +
      '<button class="btn btn-accent btn-sm" onclick="openSupportConversation(' + supActiveId + ')">Retry</button>' +
    '</div>';
    return;
  }
  if (supDetailState === 'empty' || !supActive) {
    el.innerHTML = '<div class="sup-thread-state sup-thread-empty">' +
      '<div class="sup-empty-ico">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>' +
      '</div>' +
      '<div class="sup-empty-title">Select a conversation</div>' +
      '<div class="sup-empty-text">Choose a ticket from the list to read the full history and reply to the user or driver.</div>' +
    '</div>';
    return;
  }

  el.innerHTML =
    '<div class="sup-thread">' +
      '<div class="sup-thread-header" id="sup-thread-header"></div>' +
      '<div class="sup-messages" id="sup-messages"></div>' +
      '<div class="sup-composer" id="sup-composer"></div>' +
    '</div>';

  supRenderHeader();
  supRenderMessages();
  supRenderComposer();
}

// ─── Reply / attachments ───────────────────────────────────────────

function supComposerInput(e) {
  var input = e.target;
  supDrafts[supActiveId] = input.value;
  supAutoGrow(input);
}

function supComposerKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    supSendReply();
  }
}

function supAutoGrow(input) {
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 130) + 'px';
}

function supUpdateSendState() {
  var btn = document.getElementById('sup-send-btn');
  if (!btn) return;
  if (supSending) {
    btn.disabled = true;
    btn.innerHTML = '<span class="sup-mini-spin"></span> Sending…';
  } else {
    btn.disabled = false;
    btn.textContent = supNoteMode ? 'Add Note' : 'Send';
  }
}

function supToggleNote() {
  supNoteMode = !supNoteMode;
  var input = document.getElementById('sup-composer-input');
  if (input) supDrafts[supActiveId] = input.value;
  supRenderComposer();
  var again = document.getElementById('sup-composer-input');
  if (again) { again.focus(); again.selectionStart = again.value.length; }
}

function supPickFile() {
  var f = document.getElementById('sup-file');
  if (f) f.click();
}

function supOnPickFile(e) {
  var file = e.target && e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Only image attachments are supported', false); return; }
  if (file.size > 5 * 1024 * 1024) { toast('Image must be 5MB or smaller', false); return; }
  supUploadAttachment(file);
}

function supUploadAttachment(file) {
  supUploading = true;
  supRenderComposer();
  supSetUploadState('Uploading ' + file.name + '…');

  var fd = new FormData();
  fd.append('image', file);

  fetch(API_BASE + '/support/upload/image', {
    method: 'POST',
    headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {},
    body: fd
  }).then(function(res) {
    if (res.status === 401) { doLogout(); throw new Error('Session expired'); }
    return res.json();
  }).then(function(json) {
    if (!json.success) throw new Error(json.message || 'Upload failed');
    supAttach = { url: json.data.url, name: json.data.filename || file.name };
    supSetUploadState('');
    toast('Attachment added');
  }).catch(function(e) {
    supSetUploadState('');
    toast('Upload failed: ' + e.message, false);
  }).finally(function() {
    supUploading = false;
    supRenderComposer();
  });
}

function supSetUploadState(text) {
  supSetText('sup-upload-state', text || '');
}

function supRenderAttachPreview() {
  var el = document.getElementById('sup-attach-preview');
  if (!el) return;
  if (!supAttach) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML =
    '<span class="sup-attach-chip">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
      esc(supAttach.name || 'image') +
      '<button type="button" class="sup-attach-x" onclick="supClearAttach()" title="Remove attachment">&times;</button>' +
    '</span>';
}

function supClearAttach() {
  supAttach = null;
  supRenderAttachPreview();
}

function supSendReply() {
  if (!supActive || supSending) return;
  var input = document.getElementById('sup-composer-input');
  var text = input ? input.value.trim() : '';
  if (!text && !supAttach) {
    toast(supNoteMode ? 'Write a note first' : 'Type a message or attach an image', false);
    return;
  }

  var payload = {
    message: text,
    imageUrl: supAttach ? supAttach.url : '',
    internalNote: supNoteMode
  };

  var pending = {
    id: 'local-' + Date.now(),
    messageId: '',
    conversationId: supActiveId,
    senderType: 'admin',
    senderId: '',
    senderName: supAdminName(),
    message: text,
    messageType: supAttach ? 'image' : 'text',
    imageUrl: supAttach ? supAttach.url : '',
    internalNote: supNoteMode,
    read: false,
    createdAt: new Date().toISOString(),
    _pending: true,
    _payload: payload
  };

  supMessages.push(pending);
  supRenderMessages();
  supScrollMessages(true);
  supExecuteSend(pending);
}

function supExecuteSend(pending) {
  supSending = true;
  supUpdateSendState();
  var delivered = false;

  api('POST', '/support/conversations/' + supActiveId + '/messages', pending._payload).then(function(res) {
    delivered = true;
    var saved = res.data.message;
    var idx = -1;
    supMessages.forEach(function(m, i) { if (m.id === pending.id) idx = i; });
    if (idx >= 0) supMessages.splice(idx, 1, saved);
    else supMessages.push(saved);

    var isNote = pending._payload.internalNote;
    if (!isNote && supActive) {
      supActive.lastMessage = (pending._payload.message || 'Image').slice(0, 180);
      supActive.lastMessageAt = saved.createdAt;
      supActive.lastSenderType = 'admin';
      if (supActive.status === 'resolved' || supActive.status === 'closed') {
        supActive.status = 'open';
        supActive.resolvedAt = null;
        supActive.closedAt = null;
        supRenderHeader();
      }
    }

    var input = document.getElementById('sup-composer-input');
    if (input) { input.value = ''; supAutoGrow(input); }
    delete supDrafts[supActiveId];
    supAttach = null;

    supRenderMessages();
    supRenderAttachPreview();
    supScrollMessages(true);
    toast(isNote ? 'Internal note added' : 'Reply sent');
  }).catch(function(e) {
    pending._pending = false;
    pending._failed = true;
    pending._error = e.message || 'Failed to send';
    supRenderMessages();
    toast('Failed to send: ' + pending._error, false);
  }).finally(function() {
    supSending = false;
    supUpdateSendState();
    var input = document.getElementById('sup-composer-input');
    if (input && !input.value) supRenderComposer();
    if (delivered) {
      supSilentRefresh();
      supLoadDetailSilent();
    }
  });
}

function supRetrySend(localId) {
  var target = null;
  supMessages.forEach(function(m) { if (String(m.id) === String(localId)) target = m; });
  if (!target || !target._payload) return;
  target._failed = false;
  target._pending = true;
  target._error = '';
  supRenderMessages();
  supExecuteSend(target);
}

function supDiscardSend(localId) {
  supMessages = supMessages.filter(function(m) { return String(m.id) !== String(localId); });
  supRenderMessages();
}

// ─── Ticket management (status / priority) ─────────────────────────

function supAskStatus(status) {
  if (!supActive || supSending) return;
  if (status === supActive.status) return;

  var descs = {
    open: 'The ticket will be reopened and counted as active again.',
    pending: 'The ticket will be marked as waiting on further information.',
    resolved: 'The ticket will be marked as resolved. The requester can still reply to reopen it.',
    closed: 'The ticket will be closed. The requester can still reply to reopen it.'
  };
  var titles = {
    open: 'Reopen this ticket?',
    pending: 'Set ticket to pending?',
    resolved: 'Mark ticket as resolved?',
    closed: 'Close this ticket?'
  };

  supSetHtml('sup-confirm-title', titles[status] || 'Update ticket');
  supSetHtml('sup-confirm-desc', descs[status] || '');
  var reason = document.getElementById('sup-reason');
  if (reason) reason.value = '';
  var err = document.getElementById('sup-confirm-err');
  if (err) err.textContent = '';
  var btn = document.getElementById('sup-confirm-btn');
  if (btn) { btn.disabled = false; btn.textContent = status === 'closed' ? 'Close Ticket' : 'Confirm'; }

  supConfirmCb = function() {
    var r = document.getElementById('sup-reason');
    return supApplyStatus(status, r ? r.value.trim() : '');
  };

  var modal = document.getElementById('supConfirmModal');
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeSupportConfirm() {
  var modal = document.getElementById('supConfirmModal');
  if (modal) modal.classList.remove('on');
  document.body.style.overflow = '';
  supConfirmCb = null;
}

function applySupportConfirm() {
  if (!supConfirmCb) return;
  var btn = document.getElementById('sup-confirm-btn');
  var err = document.getElementById('sup-confirm-err');
  if (err) err.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }

  supConfirmCb().then(function() {
    closeSupportConfirm();
  }).catch(function(e) {
    if (err) err.textContent = e.message || 'Update failed';
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm'; }
  });
}

function supApplyStatus(status, reason) {
  var body = { status: status };
  if (reason) body.reason = reason;
  return api('PATCH', '/support/conversations/' + supActiveId, body).then(function(res) {
    supActive = Object.assign({}, supActive, res.data);
    supRenderHeader();
    toast('Ticket marked as ' + SUP_STATUS_LABEL[status].toLowerCase());
    supSilentRefresh();
    supLoadDetailSilent();
  });
}

function supSetPriority(priority) {
  if (!supActive) return;
  if ((supActive.priority || 'normal') === priority) return;
  api('PATCH', '/support/conversations/' + supActiveId, { priority: priority }).then(function(res) {
    supActive = Object.assign({}, supActive, res.data);
    supRenderHeader();
    toast('Priority set to ' + supCap(priority));
    supSilentRefresh();
  }).catch(function(e) {
    toast('Failed to update priority: ' + e.message, false);
    supRenderHeader();
  });
}

// ─── Polling (keeps the inbox fresh without a second realtime system) ─

function supStartPolling() {
  if (supPollTimer) return;
  supPollTimer = setInterval(supPollTick, 30000);
}

function stopSupportPolling() {
  if (supPollTimer) {
    clearInterval(supPollTimer);
    supPollTimer = null;
  }
}

function supPollTick() {
  var panel = document.getElementById('panel-support');
  if (!panel || !panel.classList.contains('on')) { stopSupportPolling(); return; }
  var confirmModal = document.getElementById('supConfirmModal');
  if (supState.loading || supSending || supUploading) return;
  if (confirmModal && confirmModal.classList.contains('on')) return;
  supSilentRefresh();
  supLoadDetailSilent();
}

// ─── Sidebar unread badge (kept fresh even before the tab is opened) ─

var supBadgeTimer = null;

function supRefreshBadge() {
  if (!authToken) return Promise.resolve();
  return api('GET', '/support/conversations?page=1&limit=1').then(function(res) {
    supStats = (res.data && res.data.stats) || supStats;
    supRenderStats();
  }).catch(function() { /* badge simply stays as-is */ });
}

// Called once at login: shows the unread count immediately and keeps it
// fresh with a light poll while the inbox tab itself is not open.
  function loadSupportUnreadBadge() {
    if (!authToken || !hasPerm('support.view')) return;
  supRefreshBadge();
  if (supBadgeTimer) return;
  supBadgeTimer = setInterval(function() {
    if (!authToken) { stopSupportBadgePolling(); return; }
    var panel = document.getElementById('panel-support');
    if (panel && panel.classList.contains('on')) return; // inbox poll already covers it
    supRefreshBadge();
  }, 60000);
}

function stopSupportBadgePolling() {
  if (supBadgeTimer) {
    clearInterval(supBadgeTimer);
    supBadgeTimer = null;
  }
}

// ─── Keyboard / modal wiring ───────────────────────────────────────

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var modal = document.getElementById('supConfirmModal');
  if (modal && modal.classList.contains('on')) closeSupportConfirm();
});

document.addEventListener('click', function(e) {
  var modal = document.getElementById('supConfirmModal');
  if (!modal || !modal.classList.contains('on')) return;
  if (e.target === modal) closeSupportConfirm();
});
