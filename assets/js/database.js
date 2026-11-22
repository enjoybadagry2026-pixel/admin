// ═══════════════ READ-ONLY DATABASE EXPLORER ═══════════════
(function () {
  'use strict';

  var state = {
    loaded: false,
    loading: false,
    tables: [],
    schemas: [],
    selected: null,
    metadata: null,
    rows: [],
    page: 1,
    limit: 25,
    total: 0,
    selectedRows: [],
    request: 0,
    searchTimer: null,
    searchRequest: 0,
    sort: '',
    direction: 'asc',
    columnVisibility: {},
    navCollapsed: localStorage.getItem('eb_db_nav_collapsed') === '1',
    detailsWidth: Number(localStorage.getItem('eb_db_details_width') || 320),
    navWidth: Number(localStorage.getItem('eb_db_nav_width') || 220),
    resizing: null
  };

  function byId(id) { return document.getElementById(id); }
  function escValue(value) {
    if (typeof esc === 'function') return esc(value == null ? '' : String(value));
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function query(params) {
    return Object.keys(params).filter(function (key) { return params[key] !== undefined && params[key] !== ''; })
      .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); }).join('&');
  }
  function setDisplay(id, visible) { var el = byId(id); if (el) el.style.display = visible ? '' : 'none'; }
  function workspace() { return byId('db-workspace'); }
  function applyPanelState() {
    var area = workspace(); if (!area) return;
    area.style.setProperty('--db-nav-w', Math.max(180, Math.min(360, state.navWidth)) + 'px');
    area.style.setProperty('--db-detail-w', Math.max(260, Math.min(460, state.detailsWidth)) + 'px');
    area.classList.toggle('nav-collapsed', state.navCollapsed);
    area.classList.toggle('details-collapsed', !byId('db-details') || byId('db-details').classList.contains('db-details-collapsed'));
    var reopen = byId('db-reopen-structure'); if (reopen) reopen.style.display = state.navCollapsed ? '' : 'none';
  }
  window.dbToggleStructure = function () { state.navCollapsed = !state.navCollapsed; localStorage.setItem('eb_db_nav_collapsed', state.navCollapsed ? '1' : '0'); applyPanelState(); };
  function beginResize(which, event) {
    if (window.innerWidth <= 1160) return;
    event.preventDefault(); state.resizing = { which: which, start: event.clientX, value: which === 'nav' ? state.navWidth : state.detailsWidth };
    document.body.classList.add('db-resizing');
  }
  function resizeMove(event) {
    if (!state.resizing) return;
    var delta = event.clientX - state.resizing.start;
    if (state.resizing.which === 'nav') state.navWidth = Math.max(180, Math.min(360, state.resizing.value + delta));
    else state.detailsWidth = Math.max(260, Math.min(460, state.resizing.value - delta));
    applyPanelState();
  }
  function endResize() { if (!state.resizing) return; localStorage.setItem('eb_db_nav_width', state.navWidth); localStorage.setItem('eb_db_details_width', state.detailsWidth); state.resizing = null; document.body.classList.remove('db-resizing'); }
  function setupSplitters() {
    var nav = byId('db-nav-splitter'); var details = byId('db-details-splitter');
    if (nav) { nav.addEventListener('mousedown', function (event) { beginResize('nav', event); }); nav.addEventListener('keydown', function (event) { if (event.key === 'ArrowLeft') { state.navWidth -= 10; applyPanelState(); } if (event.key === 'ArrowRight') { state.navWidth += 10; applyPanelState(); } if (event.key === 'Home') { state.navWidth = 180; applyPanelState(); } if (event.key === 'End') { state.navWidth = 360; applyPanelState(); } }); }
    if (details) { details.addEventListener('mousedown', function (event) { beginResize('details', event); }); details.addEventListener('keydown', function (event) { if (event.key === 'ArrowLeft') { state.detailsWidth += 10; applyPanelState(); } if (event.key === 'ArrowRight') { state.detailsWidth -= 10; applyPanelState(); } if (event.key === 'Home') { state.detailsWidth = 260; applyPanelState(); } if (event.key === 'End') { state.detailsWidth = 460; applyPanelState(); } }); }
    document.addEventListener('mousemove', resizeMove); document.addEventListener('mouseup', endResize); applyPanelState();
  }
  function valueText(value) {
    if (value === null || value === undefined) return '<span class="db-null">null</span>';
    if (typeof value === 'object') return '<code class="db-inline-json">' + escValue(JSON.stringify(value)) + '</code>';
    if (typeof value === 'boolean') return '<span class="db-bool">' + (value ? 'true' : 'false') + '</span>';
    return escValue(String(value));
  }
  function prettyValue(value) {
    if (value === null || value === undefined) return '<span class="db-null">null</span>';
    if (typeof value !== 'object') return '<div class="db-detail-value">' + valueText(value) + '</div>';
    return '<details class="db-json-tree" open><summary>JSON value</summary><pre>' + escValue(JSON.stringify(value, null, 2)) + '</pre></details>';
  }
  function showError(id, message) {
    var el = byId(id); if (el) el.textContent = message || 'Please try again.';
  }

  function renderTree() {
    var tree = byId('db-tree');
    if (!tree) return;
    if (!state.tables.length) {
      tree.innerHTML = '<div class="db-tree-empty">No permitted tables found.</div>';
      return;
    }
    tree.innerHTML = state.schemas.map(function (schema) {
      return '<div class="db-schema"><div class="db-schema-title"><span class="db-tree-chevron">⌄</span><span class="db-schema-icon">◉</span> ' + escValue(schema.name) + ' <span class="db-muted">' + schema.tables.length + '</span></div>' +
      schema.tables.map(function (table) {
        var selected = state.selected && state.selected.schema === table.table_schema && state.selected.table === table.table_name;
        return '<button type="button" class="db-table-item' + (selected ? ' on' : '') + '" data-db-schema="' + escValue(table.table_schema) + '" data-db-table="' + escValue(table.table_name) + '" title="Open ' + escValue(table.table_name) + '">' +
          '<span class="db-table-icon">▦</span><span class="db-table-name">' + escValue(table.table_name) + '</span><span class="db-table-count">' + formatEstimate(table.row_estimate) + '</span></button>';
      }).join('') + '</div>';
    }).join('');
    tree.querySelectorAll('.db-table-item').forEach(function (button) {
      button.addEventListener('click', function () { dbSelectTable(button.getAttribute('data-db-schema'), button.getAttribute('data-db-table')); });
    });
    var count = byId('db-table-count'); if (count) count.textContent = state.tables.length + ' tables';
  }

  function formatEstimate(value) {
    var n = Number(value || 0);
    if (!Number.isFinite(n) || n < 1) return '—';
    return n >= 1000 ? Math.round(n / 100) / 10 + 'k' : String(n);
  }

  async function loadTables() {
    state.loading = true;
    setDisplay('db-loading', true); setDisplay('db-error', false); setDisplay('db-workspace', false);
    try {
      var response = await api('GET', '/database/tables');
      state.schemas = response.data && response.data.schemas ? response.data.schemas : [];
      state.tables = state.schemas.reduce(function (all, schema) { return all.concat(schema.tables || []); }, []);
      state.loaded = true;
      renderTree();
      setDisplay('db-workspace', true);
      var resetButton = byId('dbEnvironmentResetBtn'); if (resetButton) resetButton.style.display = typeof hasPerm === 'function' && hasPerm('environment.reset') ? '' : 'none';
      var count = byId('db-count'); if (count) count.textContent = state.tables.length + ' tables · Read-only';
    } catch (error) {
      showError('db-error-text', error.message); setDisplay('db-error', true);
    } finally { state.loading = false; setDisplay('db-loading', false); }
  }

  window.loadDatabasePanel = function (force) {
    if (state.loading) return;
    if (force) { state.loaded = false; state.selected = null; state.metadata = null; }
    if (!state.loaded) loadTables();
  };

  window.dbSearchTables = function (value) {
    clearTimeout(state.searchTimer);
    var searchRequest = ++state.searchRequest;
    state.searchTimer = setTimeout(async function () {
      try {
        var response = await api('GET', '/database/tables?' + query({ search: value }));
        if (searchRequest !== state.searchRequest) return;
        state.schemas = response.data && response.data.schemas ? response.data.schemas : [];
        state.tables = state.schemas.reduce(function (all, schema) { return all.concat(schema.tables || []); }, []);
        if (state.selected && !state.tables.some(function (item) { return item.table_schema === state.selected.schema && item.table_name === state.selected.table; })) { state.selected = null; state.metadata = null; renderRecordsHeader(); }
        renderTree();
      } catch (error) { toast('Unable to search tables: ' + error.message, false); }
    }, 250);
  };

  window.dbSelectTable = async function (schema, table) {
    state.selected = { schema: schema, table: table }; state.metadata = null; state.page = 1; state.rows = []; state.selectedRows = []; state.columnVisibility = {}; state.sort = ''; state.direction = 'asc';
    renderTree(); renderRecordsHeader(); setDisplay('db-records-loading', true); setDisplay('db-records-error', false); setDisplay('db-records-empty', false);
    var request = ++state.request;
    try {
      var metaResponse = await api('GET', '/database/metadata?' + query({ schema: schema, table: table }));
      if (request !== state.request) return;
      state.metadata = metaResponse.data;
      renderMetadata();
      await dbLoadSelected(request);
    } catch (error) {
      if (request === state.request) { showError('db-records-error-text', error.message); setDisplay('db-records-error', true); }
    } finally { if (request === state.request) setDisplay('db-records-loading', false); }
  };

  window.dbLoadSelected = async function (request) {
    if (!state.selected) return;
    request = request || ++state.request;
    setDisplay('db-records-loading', true); setDisplay('db-records-error', false);
    try {
      var response = await api('GET', '/database/records?' + query({ schema: state.selected.schema, table: state.selected.table, page: state.page, limit: state.limit, sort: state.sort, direction: state.direction, filterColumn: byId('db-filter-column') && byId('db-filter-column').value, filterOperator: byId('db-filter-operator') && byId('db-filter-operator').value, filterValue: byId('db-filter-value') && byId('db-filter-value').value }));
      if (request !== state.request) return;
      state.rows = response.data && response.data.rows ? response.data.rows : [];
      state.total = response.pagination ? Number(response.pagination.total || 0) : 0;
      renderRecords(response.data && response.data.columns ? response.data.columns : (state.metadata ? state.metadata.columns.filter(function (c) { return c.visible; }) : []));
    } catch (error) {
      if (request === state.request) { showError('db-records-error-text', error.message); setDisplay('db-records-error', true); }
    } finally { if (request === state.request) setDisplay('db-records-loading', false); }
  };

  function renderRecordsHeader() {
    var title = byId('db-selected-title'); var subtitle = byId('db-selected-subtitle');
    if (title) title.textContent = state.selected ? state.selected.table : 'Select a table';
    if (subtitle) subtitle.textContent = state.selected ? state.selected.schema + ' schema · read-only records' : 'Choose a table from the structure panel.';
    var actions = byId('db-records-actions');
    if (!actions) return;
    if (!state.selected) { actions.innerHTML = ''; return; }
    var eligible = ['content_categories', 'content_tags'].indexOf(state.selected.table) >= 0;
    var canWrite = eligible && typeof hasPerm === 'function' && hasPerm('database.insert');
    var canExport = eligible && typeof hasPerm === 'function' && hasPerm('database.export');
    var canImport = eligible && typeof hasPerm === 'function' && hasPerm('database.import');
    var visibleColumns = state.metadata && state.metadata.columns ? state.metadata.columns.filter(function (column) { return column.visible; }) : [];
    var filterOptions = visibleColumns.map(function (column) { return '<option value="' + escValue(column.column_name) + '">' + escValue(column.column_name) + '</option>'; }).join('');
    var columnOptions = visibleColumns.map(function (column) { return '<label class="db-column-option"><input type="checkbox" ' + (state.columnVisibility[column.column_name] !== false ? 'checked' : '') + ' onchange="dbToggleColumn(\'' + escValue(column.column_name) + '\',this.checked)"> ' + escValue(column.column_name) + '</label>'; }).join('');
    var bulk = eligible && typeof hasPerm === 'function' && hasPerm('database.bulk_manage') && state.selectedRows.length ? '<button class="btn btn-ghost btn-sm" type="button" onclick="dbOpenEditor(\'bulk\')">Bulk edit (' + state.selectedRows.length + ')</button><button class="btn btn-red btn-sm" type="button" onclick="dbRunBulkDelete()">Bulk delete</button>' : '';
    actions.innerHTML = '<div class="db-action-row">' + bulk + (canWrite ? '<button class="btn btn-accent btn-sm" type="button" onclick="dbOpenEditor(\'create\')">Add record</button>' : '') + (canImport ? '<button class="btn btn-ghost btn-sm" type="button" onclick="dbOpenImport()">Import</button>' : '') + (canExport ? '<button class="btn btn-ghost btn-sm" type="button" onclick="dbExport(\'csv\')">Export CSV</button><button class="btn btn-ghost btn-sm" type="button" onclick="dbExport(\'json\')">JSON</button>' : '') + '<select class="db-sort-select" aria-label="Sort records" onchange="dbSetSort(this.value)"><option value="">Sort by...</option>' + visibleColumns.map(function (column) { return '<option value="' + escValue(column.column_name) + '"' + (state.sort === column.column_name ? ' selected' : '') + '>' + escValue(column.column_name) + '</option>'; }).join('') + '</select><select class="db-sort-direction" aria-label="Sort direction" onchange="dbSetDirection(this.value)"><option value="asc"' + (state.direction === 'asc' ? ' selected' : '') + '>Ascending</option><option value="desc"' + (state.direction === 'desc' ? ' selected' : '') + '>Descending</option></select><details class="db-columns-menu"><summary>Columns</summary><div>' + columnOptions + '</div></details></div><div class="db-filter-row"><select id="db-filter-column" aria-label="Filter column"><option value="">Filter column</option>' + filterOptions + '</select><select id="db-filter-operator" aria-label="Filter operator"><option value="contains">contains</option><option value="eq">equals</option><option value="neq">not equal</option><option value="gte">at least</option><option value="lte">at most</option></select><label class="sr-only" for="db-filter-value">Filter records</label><input id="db-filter-value" placeholder="Filter records..." onkeydown="if(event.key===\'Enter\')dbApplyFilter()"><button class="btn btn-ghost btn-sm" type="button" onclick="dbApplyFilter()">Apply</button></div>';
  }

  window.dbApplyFilter = function () { state.page = 1; dbLoadSelected(); };
  window.dbSetSort = function (value) { state.sort = value; state.page = 1; dbLoadSelected(); };
  window.dbSetDirection = function (value) { state.direction = value === 'desc' ? 'desc' : 'asc'; state.page = 1; dbLoadSelected(); };
  window.dbToggleColumn = function (name, checked) { var column = state.metadata && state.metadata.columns.find(function (item) { return item.column_name === name; }); if (column && column.is_primary_key && !checked) return; state.columnVisibility[name] = checked; renderRecords(state.metadata ? state.metadata.columns.filter(function (item) { return item.visible; }) : []); };

  function renderMetadata() {
    var tabs = byId('db-meta-tabs');
    if (!tabs || !state.metadata) return;
    tabs.innerHTML = '<span class="db-meta-heading">Columns</span> ' + state.metadata.columns.length +
      ' <span class="db-meta-divider">·</span> ' + state.metadata.indexes.length + ' indexes';
    renderRecordsHeader();
    var detail = byId('db-schema-detail-body');
    if (!detail) return;
    detail.innerHTML = '<div class="db-column-grid"><div class="db-column-head"><span>Column</span><span>Type</span><span>Nullable</span><span>Default</span><span>Key / reference</span></div>' +
      state.metadata.columns.map(function (column) {
        var relation = column.is_primary_key ? 'Primary key' : (column.foreign_table_name ? '→ ' + column.foreign_table_name + '.' + column.foreign_column_name : '');
        return '<div class="db-column-row"><span>' + escValue(column.column_name) + '</span><span>' + escValue(column.data_type || column.udt_name || '') + '</span><span>' + escValue(column.is_nullable || '') + '</span><span>' + escValue(column.column_default || '—') + '</span><span>' + escValue(relation) + '</span></div>';
      }).join('') + '</div>' + (state.metadata.indexes.length ? '<div class="db-index-list"><strong>Indexes</strong>' + state.metadata.indexes.map(function (index) { return '<div><span>' + escValue(index.indexname) + '</span><code>' + escValue(index.indexdef) + '</code></div>'; }).join('') + '</div>' : '<div class="db-muted db-no-indexes">No index metadata available.</div>');
  }

  function renderRecords(columns) {
    var head = byId('db-columns'); var body = byId('db-rows');
    if (!head || !body) return;
    columns = columns.filter(function (column) { return state.columnVisibility[column.column_name] !== false || column.is_primary_key; });
    var caption = byId('db-table-caption'); if (caption) caption.textContent = (state.selected ? state.selected.table : 'Database') + ' records';
    if (!columns.length || !state.rows.length) {
      head.innerHTML = ''; body.innerHTML = ''; setDisplay('db-records-empty', true); setDisplay('db-records-wrap', false); setDisplay('db-pagination', false); return;
    }
    setDisplay('db-records-empty', false); setDisplay('db-records-wrap', true);
    head.innerHTML = '<tr><th scope="col" class="db-select-col"><input type="checkbox" aria-label="Select all visible rows" onchange="dbToggleAll(this.checked)"></th>' + columns.map(function (column) { return '<th scope="col" data-column-name="' + escValue(column.column_name) + '">' + escValue(column.column_name) + (column.is_primary_key ? ' <span class="db-key">PK</span>' : '') + '<span class="db-col-resizer" aria-hidden="true"></span></th>'; }).join('') + '<th scope="col" class="db-actions-col">Actions</th></tr>';
    body.innerHTML = state.rows.map(function (row, index) {
      return '<tr class="db-row" onclick="if(!event.target.closest(\'button,input\'))dbOpenRecord(' + index + ')" onkeydown="if((event.key===\'Enter\' || event.key===\' \') && !event.target.closest(\'button,input\')){event.preventDefault();dbOpenRecord(' + index + ')}" tabindex="0">' +
        '<td class="db-select-col"><input type="checkbox" aria-label="Select row ' + index + '" ' + (state.selectedRows.indexOf(index) >= 0 ? 'checked' : '') + ' onclick="event.stopPropagation()" onchange="dbToggleRow(' + index + ',this.checked)"></td>' + columns.map(function (column) { var raw = row[column.column_name]; return '<td title="' + escValue(raw == null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)) + '">' + valueText(raw) + '</td>'; }).join('') + '<td><button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation();dbOpenRecord(' + index + ')">View</button></td></tr>';
    }).join('');
    head.querySelectorAll('th[data-column-name]').forEach(function (header) { var handle = header.querySelector('.db-col-resizer'); if (handle) handle.addEventListener('mousedown', function (event) { event.preventDefault(); var start = event.clientX; var width = header.getBoundingClientRect().width; function move(e) { header.style.width = Math.max(70, Math.min(360, width + e.clientX - start)) + 'px'; } function stop() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); } document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop); }); });
    renderPager();
  }

  function renderPager() {
    var pager = byId('db-pagination');
    if (!pager || !state.rows.length) { setDisplay('db-pagination', false); return; }
    var pages = Math.max(1, Math.ceil(state.total / state.limit));
    setDisplay('db-pagination', true);
    pager.innerHTML = '<button class="btn btn-ghost btn-sm" type="button" ' + (state.page <= 1 ? 'disabled' : '') + ' onclick="dbChangePage(' + (state.page - 1) + ')">Previous</button><span class="db-page-label">Page ' + state.page + ' of ' + pages + (state.total ? ' · ~' + state.total + ' rows' : '') + '</span><button class="btn btn-ghost btn-sm" type="button" ' + (state.page >= pages ? 'disabled' : '') + ' onclick="dbChangePage(' + (state.page + 1) + ')">Next</button>';
  }
  window.dbChangePage = function (page) { if (page < 1) return; state.page = page; state.selectedRows = []; dbLoadSelected(); };
  window.dbToggleRow = function (index, checked) { state.selectedRows = checked ? state.selectedRows.concat([index]) : state.selectedRows.filter(function (item) { return item !== index; }); renderRecordsHeader(); };
  window.dbToggleAll = function (checked) { state.selectedRows = checked ? state.rows.map(function (_, index) { return index; }) : []; renderRecords((state.metadata ? state.metadata.columns.filter(function (c) { return c.visible; }) : [])); renderRecordsHeader(); };
  window.dbRunBulkDelete = function () {
    var key = state.metadata && state.metadata.columns.find(function (column) { return column.is_primary_key; });
    if (!key || !state.selectedRows.length) return;
    showDel('Delete ' + state.selectedRows.length + ' selected records from ' + state.selected.table + '? This cannot be undone.', async function () { try { await api('DELETE', '/database/bulk/delete', { schema: state.selected.schema, table: state.selected.table, rows: state.selectedRows.map(function (index) { return { keyValue: state.rows[index][key.column_name], expectedUpdatedAt: state.rows[index].updated_at }; }), confirm: true }); toast('Bulk delete completed', true); state.selectedRows = []; dbLoadSelected(); } catch (error) { toast(error.message, false); } });
  };

  window.dbOpenRecord = async function (index) {
    var row = state.rows[index]; if (!row || !state.selected) return;
    var details = byId('db-details'); if (!details) return;
    details.classList.remove('db-details-collapsed');
    applyPanelState();
    details.innerHTML = '<div class="db-details-head"><div><span class="db-muted">Record details</span><h3>' + escValue(state.selected.table) + '</h3></div><button type="button" class="icon-btn" onclick="dbCloseRecord()" aria-label="Close record details">×</button></div><div class="db-detail-loading">Loading permitted fields...</div>';
    var primary = state.metadata && state.metadata.columns.find(function (column) { return column.is_primary_key && row[column.column_name] != null; });
    var record = row;
    if (primary) {
      try {
        var response = await api('GET', '/database/record?' + query({ schema: state.selected.schema, table: state.selected.table, keyColumn: primary.column_name, keyValue: row[primary.column_name] }));
        record = response.data || row;
      } catch (_) { record = row; }
    }
    var columns = state.metadata ? state.metadata.columns.filter(function (column) { return column.visible; }) : Object.keys(record).map(function (name) { return { column_name: name }; });
    var eligible = ['content_categories', 'content_tags'].indexOf(state.selected.table) >= 0;
    var editable = eligible && typeof hasPerm === 'function' && hasPerm('database.update');
    var removable = eligible && typeof hasPerm === 'function' && hasPerm('database.delete');
    details.innerHTML = '<div class="db-details-head"><div><span class="db-muted">Record details</span><h3>' + escValue(state.selected.table) + '</h3></div><button type="button" class="icon-btn" onclick="dbCloseRecord()" aria-label="Close record details">×</button></div><div class="db-detail-list">' + columns.map(function (column) { return '<div class="db-detail-row"><div class="db-detail-label">' + escValue(column.column_name) + (column.is_primary_key ? ' <span class="db-key">PK</span>' : '') + '</div>' + prettyValue(record[column.column_name]) + '</div>'; }).join('') + '</div><div class="db-detail-actions">' + (editable ? '<button class="btn btn-ghost btn-sm" onclick="dbOpenEditor(\'edit\', window.dbCurrentRecord)">Edit</button><button class="btn btn-ghost btn-sm" onclick="dbOpenEditor(\'duplicate\', window.dbCurrentRecord)">Duplicate</button>' : '') + (removable ? '<button class="btn btn-red btn-sm" onclick="dbDeleteCurrent()">Delete</button>' : '') + '</div>';
    window.dbCurrentRecord = record;
  };
  window.dbCloseRecord = function () { var details = byId('db-details'); if (details) { details.classList.add('db-details-collapsed'); details.innerHTML = '<div class="db-details-empty">Select a record to inspect its permitted fields.</div>'; applyPanelState(); } };

  window.dbOpenEditor = function (mode, row) {
    if (!state.metadata) return;
    var fields = byId('dbEditorFields'); var title = byId('dbEditorTitle');
    var primary = state.metadata.columns.find(function (column) { return column.is_primary_key; });
    var writable = state.metadata.columns.filter(function (column) { return column.visible && !column.is_primary_key && !/^(created_at|updated_at)$/.test(column.column_name) && ['name', 'active', 'sort_order'].indexOf(column.column_name) >= 0; });
    window.dbEditorMode = mode; window.dbEditorRow = row || {};
    if (title) title.textContent = mode === 'edit' ? 'Edit record' : mode === 'duplicate' ? 'Duplicate record' : mode === 'bulk' ? 'Bulk edit records' : 'Add record';
    fields.innerHTML = writable.map(function (column) {
      var value = mode === 'duplicate' && column.column_name === 'name' && row ? String(row[column.column_name] || '') + ' copy' : (row && row[column.column_name] != null ? row[column.column_name] : '');
      var control = column.data_type === 'boolean' ? '<select id="db-field-' + column.column_name + '"><option value="true" ' + (value === true ? 'selected' : '') + '>true</option><option value="false" ' + (value === false ? 'selected' : '') + '>false</option></select>' : '<input id="db-field-' + column.column_name + '" value="' + escValue(typeof value === 'object' ? JSON.stringify(value) : value) + '"' + (column.data_type === 'integer' ? ' type="number"' : '') + ' maxlength="255">';
      return '<div class="fg"><label for="db-field-' + column.column_name + '">' + escValue(column.column_name) + '</label>' + control + '</div>';
    }).join('');
    var submit = byId('dbEditorSubmit'); if (submit) submit.textContent = mode === 'edit' ? 'Save changes' : 'Create record';
    var modal = byId('dbEditorModal'); if (modal) modal.classList.add('on');
  };
  window.dbCloseEditor = function () { var modal = byId('dbEditorModal'); if (modal) modal.classList.remove('on'); };
  window.dbSubmitEditor = async function () {
    var values = {}; (state.metadata.columns || []).filter(function (column) { return column.visible && !column.is_primary_key && !/^(created_at|updated_at)$/.test(column.column_name) && ['name', 'active', 'sort_order'].indexOf(column.column_name) >= 0; }).forEach(function (column) { var el = byId('db-field-' + column.column_name); if (el) values[column.column_name] = el.value; });
    var body = { schema: state.selected.schema, table: state.selected.table, values: values };
    var mode = window.dbEditorMode;
    if (mode === 'edit') {
      var key = state.metadata.columns.find(function (column) { return column.is_primary_key; });
      body.keyValue = window.dbEditorRow[key.column_name]; body.expectedUpdatedAt = window.dbEditorRow.updated_at;
    }
    var button = byId('dbEditorSubmit'); if (button) { button.disabled = true; button.textContent = 'Saving...'; }
    try { if (mode === 'bulk') { await api('PATCH', '/database/bulk/update', { schema: state.selected.schema, table: state.selected.table, rows: state.selectedRows.map(function (index) { return { keyValue: state.rows[index][state.metadata.columns.find(function (column) { return column.is_primary_key; }).column_name], expectedUpdatedAt: state.rows[index].updated_at, values: values }; }), confirm: true }); } else { await api(mode === 'edit' ? 'PATCH' : 'POST', '/database/rows', body); } dbCloseEditor(); state.selectedRows = []; toast(mode === 'edit' ? 'Record updated' : mode === 'bulk' ? 'Bulk update completed' : 'Record created', true); dbLoadSelected(); } catch (error) { showError('dbEditorError', error.message); } finally { if (button) { button.disabled = false; button.textContent = mode === 'edit' ? 'Save changes' : 'Create record'; } }
  };
  window.dbDeleteCurrent = function () {
    var row = window.dbCurrentRecord; var key = state.metadata.columns.find(function (column) { return column.is_primary_key; });
    if (!row || !key || typeof showDel !== 'function') return;
    showDel('Delete this record from ' + state.selected.table + '? This cannot be undone.', async function () { try { await api('DELETE', '/database/rows', { schema: state.selected.schema, table: state.selected.table, keyValue: row[key.column_name], expectedUpdatedAt: row.updated_at, confirm: true }); dbCloseRecord(); toast('Record deleted', true); dbLoadSelected(); } catch (error) { toast(error.message, false); } });
  };
  window.dbExport = async function (format) { try { await apiDownload('/database/export?' + query({ schema: state.selected.schema, table: state.selected.table, format: format }), state.selected.table + '-export.' + format); toast('Export downloaded', true); } catch (error) { toast(error.message, false); } };
  window.dbOpenImport = function () { var modal = byId('dbImportModal'); if (modal) modal.classList.add('on'); };
  window.dbCloseImport = function () { var modal = byId('dbImportModal'); if (modal) modal.classList.remove('on'); };
  window.dbPreviewImport = async function () { try { var rows = JSON.parse(byId('dbImportText').value); var result = await api('POST', '/database/import/preview', { schema: state.selected.schema, table: state.selected.table, rows: rows }); window.dbImportRows = rows; byId('dbImportPreview').textContent = result.data.rowCount + ' valid rows ready to import.'; byId('dbImportSubmit').disabled = false; } catch (error) { showError('dbImportError', error.message); } };
  window.dbSubmitImport = async function () { try { await api('POST', '/database/import/commit', { schema: state.selected.schema, table: state.selected.table, rows: window.dbImportRows, confirm: true }); dbCloseImport(); toast('Import completed', true); dbLoadSelected(); } catch (error) { showError('dbImportError', error.message); } };
  window.dbOpenEnvironmentReset = async function () {
    if (typeof hasPerm === 'function' && !hasPerm('environment.reset')) { toast('You do not have permission to reset this environment.', false); return; }
    var modal = byId('dbEnvironmentResetModal'); if (!modal) return;
    var error = byId('dbEnvironmentResetError'); var status = byId('dbEnvironmentResetStatus'); var submit = byId('dbEnvironmentResetSubmit');
    if (error) error.textContent = ''; if (status) status.textContent = 'Loading verified environment inventory…'; if (submit) submit.disabled = true;
    modal.classList.add('on'); modal.setAttribute('aria-hidden', 'false');
    try {
      var result = await api('GET', '/environment-reset/preview'); var data = result.data || {};
      byId('dbEnvironmentName').textContent = data.environment && data.environment.name || 'Unidentified';
      byId('dbEnvironmentFirebase').textContent = data.firebase ? data.firebase.projectId + ' · ' + data.firebase.userCount + ' Auth users' : 'Unavailable';
      byId('dbEnvironmentStorage').textContent = data.storage ? data.storage.bucket + ' · ' + data.storage.objectCount + ' objects' : 'Unavailable';
      byId('dbEnvironmentDatabase').textContent = data.database ? data.database.totalRows + ' application rows across ' + data.database.tables.length + ' tables' : 'Unavailable';
      byId('dbEnvironmentPhrase').textContent = data.confirmationPhrase || 'Unavailable';
      modal.dataset.confirmationPhrase = data.confirmationPhrase || '';
      if (status) status.textContent = 'Preview ready. No data has been changed.';
      if (submit) submit.disabled = false;
      var input = byId('dbEnvironmentResetConfirmation'); if (input) { input.value = ''; input.focus(); }
    } catch (err) { if (status) status.textContent = ''; if (error) error.textContent = err.message; }
  };
  window.dbCloseEnvironmentReset = function () { var modal = byId('dbEnvironmentResetModal'); if (modal) { modal.classList.remove('on'); modal.setAttribute('aria-hidden', 'true'); } };
  window.dbSubmitEnvironmentReset = async function () {
    var modal = byId('dbEnvironmentResetModal'); var confirmation = byId('dbEnvironmentResetConfirmation').value.trim(); var phrase = modal && modal.dataset.confirmationPhrase;
    var error = byId('dbEnvironmentResetError'); if (error) error.textContent = '';
    if (!phrase || confirmation !== phrase) { if (error) error.textContent = 'Type the exact environment-specific confirmation phrase shown above.'; return; }
    var button = byId('dbEnvironmentResetSubmit'); if (button) { button.disabled = true; button.textContent = 'Resetting environment…'; }
    try {
      var result = await api('POST', '/environment-reset', { confirmation: confirmation, environmentName: byId('dbEnvironmentName').textContent });
      dbCloseEnvironmentReset(); var report = result.data || {}; toast('Environment reset completed: ' + ((report.database && report.database.totalRows) || 0) + ' database rows removed', true); state.loaded = false; state.selected = null; loadDatabasePanel(true);
    } catch (err) { if (error) error.textContent = err.message; } finally { if (button) { button.disabled = false; button.textContent = 'Reset Environment Data'; } }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupSplitters);
  else setupSplitters();
})();
