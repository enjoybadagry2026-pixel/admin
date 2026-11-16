// ═══════════════ AUDIT LOG ═══════════════

var auState = { loading: false, loaded: false };
var auFilters = { admin: '', action: '', category: '', from: '', to: '' };
var auData = [];
var auPagination = null;

// Server sort keys accepted by GET /audit (backend parseSort map).
var AUDIT_SORT_OPTIONS = [
  { value: 'created', label: 'Timestamp' },
  { value: 'admin', label: 'Admin' },
  { value: 'action', label: 'Action' },
  { value: 'category', label: 'Category' }
];

function auListKit() {
  return kitList('audit', { limit: 25, sort: 'created', dir: 'desc' });
}

function auShowState(state, message) {
  var loading = document.getElementById('audit-loading');
  var error = document.getElementById('audit-error');
  var wrap = document.getElementById('audit-table-wrap');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') {
      var t = document.getElementById('audit-error-text');
      if (t) t.textContent = message || 'Something went wrong';
    }
  }
  if (wrap) wrap.style.display = state === 'loading' || state === 'error' ? 'none' : '';
}

function auPath() {
  var s = auListKit();
  var p = '/audit?page=' + s.page + '&limit=' + s.limit +
    '&sort=' + encodeURIComponent(s.sort) + '&dir=' + encodeURIComponent(s.dir);
  if (auFilters.admin) p += '&admin=' + encodeURIComponent(auFilters.admin);
  if (auFilters.action) p += '&action=' + encodeURIComponent(auFilters.action);
  if (auFilters.category) p += '&category=' + encodeURIComponent(auFilters.category);
  if (auFilters.from) p += '&from=' + encodeURIComponent(auFilters.from + 'T00:00:00');
  if (auFilters.to) p += '&to=' + encodeURIComponent(auFilters.to + 'T23:59:59');
  return p;
}

function loadAuditPanel(force) {
  if (auState.loading) return;
  if (!force && auState.loaded) return;
  auState.loading = true;
  auShowState('loading');

  api('GET', auPath()).then(function(res) {
    auData = (res.data && res.data.entries) || [];
    auPagination = res.pagination || null;
    auState.loaded = true;
    if (auPagination && auPagination.totalPages && auListKit().page > auPagination.totalPages) {
      kitSetPage('audit', auPagination.totalPages);
      setTimeout(function() { loadAuditPanel(true); }, 0);
    }
    auShowState('ready');
    renderAudit();
  }).catch(function(e) {
    auShowState('error', e.message);
    toast('Error: ' + e.message, false);
  }).finally(function() {
    auState.loading = false;
  });
}

function auCategoryTag(cat) {
  var map = {
    auth: 'tag-pending', users: 'tag-confirmed', drivers: 'tag-out',
    orders: 'tag-preparing', content: 'tag-delivered', finance: 'tag-confirmed',
    support: 'tag-pending', notifications: 'tag-out', security: 'tag-cancelled',
    general: 'tag-pending'
  };
  return '<span class="tag ' + (map[cat] || 'tag-pending') + '">' + esc(cat || 'general') + '</span>';
}

function renderAudit() {
  var body = document.getElementById('audit-list');
  if (!body) return;
  var html = '';

  auData.forEach(function(e) {
    var target = e.targetType
      ? esc(e.targetType) + (e.targetId ? ' <span class="au-target-id">#' + esc(String(e.targetId).slice(0, 24)) + '</span>' : '')
      : '<span class="au-muted">—</span>';
    html += '<tr>' +
      '<td class="au-time">' + esc(fmtDate(e.createdAt)) + '</td>' +
      '<td><div class="au-admin">' + esc(e.adminEmail || '—') + '</div>' +
        '<div class="au-role">' + esc(e.adminRole || '') + '</div></td>' +
      '<td><code class="au-action">' + esc(e.action || '') + '</code></td>' +
      '<td>' + auCategoryTag(e.category) + '</td>' +
      '<td class="au-summary">' + esc(e.summary || '') + '</td>' +
      '<td class="au-target">' + target + '</td>' +
      '<td class="au-muted">' + esc(e.ip || '—') + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="openAuditModal(\'' + esc(String(e.id)) + '\')">View</button></td>' +
    '</tr>';
  });

  if (!html) {
    var filtered = auFilters.admin || auFilters.action || auFilters.category || auFilters.from || auFilters.to;
    html = '<tr><td colspan="8"><div class="user-empty">' +
      '<div class="user-empty-icon">' + (filtered ? '\uD83D\uDD0D' : '\uD83D\uDCCB') + '</div>' +
      '<div class="user-empty-title">' + (filtered ? 'No entries match these filters' : 'No audit entries yet') + '</div>' +
      '<div class="user-empty-text">' + (filtered ? 'Try a wider date range or clear the filters.' : 'Every admin action is recorded here as it happens.') + '</div>' +
      '</div></td></tr>';
  }
  body.innerHTML = html;

  var total = auPagination ? auPagination.total : auData.length;
  var countEl = document.getElementById('audit-count');
  if (countEl) countEl.textContent = total + ' entr' + (total === 1 ? 'y' : 'ies');
  renderAuPagination();
}

function renderAuPagination() {
  kitRenderPager('audit-pagination', 'audit', auPagination, function() { loadAuditPanel(true); });
  kitRenderSort('audit-sort', 'audit', AUDIT_SORT_OPTIONS, function() { loadAuditPanel(true); });
}

function auGoPage(page) {
  kitSetPage('audit', page);
  loadAuditPanel(true);
}

function auditApplyFilters() {
  var a = document.getElementById('audit-admin');
  var act = document.getElementById('audit-action');
  var cat = document.getElementById('audit-category');
  var from = document.getElementById('audit-from');
  var to = document.getElementById('audit-to');
  auFilters.admin = a ? a.value.trim() : '';
  auFilters.action = act ? act.value.trim() : '';
  auFilters.category = cat ? cat.value : '';
  auFilters.from = from ? from.value : '';
  auFilters.to = to ? to.value : '';
  kitSetPage('audit', 1);
  var any = auFilters.admin || auFilters.action || auFilters.category || auFilters.from || auFilters.to;
  var clear = document.getElementById('audit-clear');
  if (clear) clear.style.display = any ? '' : 'none';
  loadAuditPanel(true);
}

function auditClearFilters() {
  ['audit-admin', 'audit-action', 'audit-category', 'audit-from', 'audit-to'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  auditApplyFilters();
}

function auPretty(obj) {
  if (obj === null || obj === undefined) return null;
  try {
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return String(obj);
  }
}

function openAuditModal(id) {
  var entry = null;
  auData.forEach(function(e) { if (String(e.id) === String(id)) entry = e; });
  if (!entry) return;

  var modal = document.getElementById('auditModal');
  var body = document.getElementById('auditModalBody');
  if (!modal || !body) return;

  document.getElementById('auditModalTitle').textContent = entry.action || 'Audit Entry';
  document.getElementById('auditModalRef').textContent = fmtDate(entry.createdAt);

  var rows = [
    ['Admin', (entry.adminEmail || '—') + (entry.adminRole ? ' · ' + entry.adminRole : '')],
    ['Action', entry.action || '—'],
    ['Category', entry.category || '—'],
    ['Target', entry.targetType ? entry.targetType + (entry.targetId ? ' #' + entry.targetId : '') : '—'],
    ['IP address', entry.ip || '—'],
    ['Recorded', fmtDate(entry.createdAt)]
  ];

  var html = '<div class="au-detail-summary">' + esc(entry.summary || '') + '</div>';
  html += '<div class="um-rows">';
  rows.forEach(function(r) {
    html += '<div class="um-row"><div class="um-row-main">' +
      '<div class="um-row-sub">' + esc(r[0]) + '</div>' +
      '<div class="um-row-title">' + esc(r[1]) + '</div>' +
      '</div></div>';
  });
  html += '</div>';

  var before = auPretty(entry.before);
  var after = auPretty(entry.after);
  if (before || after) {
    html += '<div class="au-json-grid">';
    if (before) html += '<div class="au-json-col"><div class="au-json-label">Before</div><pre class="au-json">' + esc(before) + '</pre></div>';
    if (after) html += '<div class="au-json-col"><div class="au-json-label">After</div><pre class="au-json">' + esc(after) + '</pre></div>';
    html += '</div>';
  }
  html += '<p class="pf-note">Audit entries are append-only — they cannot be edited or deleted, not even by a Super Admin.</p>';

  body.innerHTML = html;
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeAuditModal() {
  var modal = document.getElementById('auditModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
}
