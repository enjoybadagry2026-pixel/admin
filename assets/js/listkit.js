// ═══════════════ LIST KIT ═══════════════
// Reusable building blocks shared by every list panel:
//   server sort + pagination controls, saved filter presets, draft autosave
//   and the undo toast. Nothing here talks to the API directly - panels hand
//   in their state and get their controls rendered, so there is exactly one
//   implementation of each behaviour in the app.

function kitDebounce(fn, ms) {
  var t = null;
  return function() {
    var args = arguments, self = this;
    if (t) clearTimeout(t);
    t = setTimeout(function() { fn.apply(self, args); }, ms);
  };
}

// Serialises a params object into a query string (skips empty values).
function kitQuery(params) {
  var parts = [];
  Object.keys(params || {}).forEach(function(k) {
    var v = params[k];
    if (v === undefined || v === null || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

var listKit = {
  lists: {},
  sortHandlers: {},
  pageHandlers: {},
  sizeHandlers: {}
};

// Creates (or returns) the state used by a list: page, page size and the
// server sort key/direction. Defaults keep the backend's natural ordering.
function kitList(key, defaults) {
  if (!listKit.lists[key]) {
    var d = defaults || {};
    listKit.lists[key] = {
      page: d.page || 1,
      limit: d.limit || 20,
      sort: d.sort || '',
      dir: d.dir || 'desc',
      preset: '',
      pagination: null
    };
  }
  return listKit.lists[key];
}

function kitSetSort(key, sort, dir) {
  var s = kitList(key);
  s.sort = sort;
  if (dir) s.dir = dir;
  s.page = 1;
  // Manually changing the sort invalidates the highlighted preset.
  s.preset = '';
}

function kitSetPage(key, page) {
  var s = kitList(key);
  s.page = Math.max(1, page || 1);
}

// Applies saved-preset params (sort/dir and any panel filters) to the list
// state. The caller re-renders and marks the preset active via s.preset.
function kitApplyParams(key, params) {
  var s = kitList(key);
  if (params) {
    if (params.sort) s.sort = params.sort;
    if (params.dir) s.dir = params.dir;
  }
  s.page = 1;
  s.preset = '';
  return params || {};
}

// Params for api() - always sends page/limit so the backend paginates.
function kitParams(key, extra) {
  var s = kitList(key);
  var out = {};
  Object.keys(extra || {}).forEach(function(k) { out[k] = extra[k]; });
  if (out.page === undefined) out.page = s.page;
  if (out.limit === undefined) out.limit = s.limit;
  if (s.sort) out.sort = s.sort;
  if (s.dir) out.dir = s.dir;
  return out;
}

// ─── Sort control ───
// options: [{ value, label }]; onChange(value, dir)
// Renders once per container, then updates the select value and direction
// icon in place so repeated renders never steal focus from other controls.
function kitDirIcon(dir) {
  return dir === 'asc'
    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>'
    : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
}

function kitRenderSort(container, key, options, onChange) {
  var el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) return;
  var s = kitList(key);
  var opts = options || [];
  var sig = key + '|' + opts.map(function(o) { return o.value; }).join(',');
  el._kitChange = onChange;

  if (el.getAttribute('data-kit-sig') === sig) {
    var sel = el.querySelector('[data-kit-sort]');
    if (sel && sel.value !== s.sort) sel.value = s.sort;
    var dirBtn = el.querySelector('[data-kit-dir]');
    if (dirBtn) {
      dirBtn.innerHTML = kitDirIcon(s.dir);
      dirBtn.title = s.dir === 'asc' ? 'Sorted ascending - click for descending' : 'Sorted descending - click for ascending';
    }
    return;
  }
  el.setAttribute('data-kit-sig', sig);

  var html = opts.map(function(o) {
    return '<option value="' + esc(o.value) + '"' + (o.value === s.sort ? ' selected' : '') + '>' + esc(o.label) + '</option>';
  }).join('');
  el.innerHTML =
    '<span class="sort-ctl"><span>Sort by</span>' +
    '<select data-kit-sort aria-label="Sort by">' + html + '</select>' +
    '<button type="button" class="dir-btn" data-kit-dir title="Toggle direction" aria-label="Toggle sort direction">' +
      kitDirIcon(s.dir) +
    '</button></span>';
  el.querySelector('[data-kit-sort]').onchange = function() {
    kitSetSort(key, this.value, null);
    if (el._kitChange) el._kitChange();
  };
  el.querySelector('[data-kit-dir]').onclick = function() {
    var st = kitList(key);
    kitSetSort(key, st.sort, st.dir === 'asc' ? 'desc' : 'asc');
    kitRenderSort(el, key, opts, el._kitChange);
    if (el._kitChange) el._kitChange();
  };
}

// ─── Pagination ───
// pagination: { page, limit, total, totalPages, hasMore }
function kitRenderPager(container, key, pagination, onChange, opts) {
  var el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) return;
  if (!pagination || !pagination.totalPages || pagination.totalPages <= 1) {
    if (pagination && pagination.total != null) {
      el.style.display = '';
      el.innerHTML = '<span class="pager-info">' + pagination.total + ' record' + (pagination.total === 1 ? '' : 's') + '</span>';
    } else {
      el.innerHTML = '';
      el.style.display = 'none';
    }
    return;
  }
  var page = pagination.page;
  var total = pagination.totalPages;
  var pages = [];
  var push = function(p) { if (pages.indexOf(p) < 0) pages.push(p); };
  push(1);
  for (var i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) push(i);
  push(total);
  pages.sort(function(a, b) { return a - b; });

  var btns = '';
  var last = 0;
  pages.forEach(function(p) {
    if (last && p - last > 1) btns += '<span class="pg-gap">&hellip;</span>';
    last = p;
    btns += '<button type="button" class="pg-btn' + (p === page ? ' on' : '') + '" data-page="' + p + '"' +
      (p === page ? ' aria-current="page"' : '') + '>' + p + '</button>';
  });

  var sizeOpts = (opts && opts.sizes) || [20, 50, 100];
  var currentSize = (pagination.limit || kitList(key).limit);

  el.style.display = '';
  el.innerHTML =
    '<span class="pager-info">Page ' + page + ' of ' + total + ' &middot; ' + pagination.total + ' record' + (pagination.total === 1 ? '' : 's') + '</span>' +
    '<label class="pager-size">Per page <select data-kit-size aria-label="Rows per page">' +
      sizeOpts.map(function(n) {
        return '<option value="' + n + '"' + (n === currentSize ? ' selected' : '') + '>' + n + '</option>';
      }).join('') +
    '</select></label>' +
    '<span class="pager-btns">' +
      '<button type="button" class="pg-btn" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>&lsaquo; Prev</button>' +
      btns +
      '<button type="button" class="pg-btn" data-page="' + (page + 1) + '"' + (page >= total ? ' disabled' : '') + '>Next &rsaquo;</button>' +
    '</span>';

  Array.prototype.forEach.call(el.querySelectorAll('[data-page]'), function(btn) {
    btn.onclick = function() {
      var p = parseInt(btn.getAttribute('data-page'), 10);
      if (!p || p < 1 || p > total || p === page) return;
      kitSetPage(key, p);
      onChange();
    };
  });
  var sizeSel = el.querySelector('[data-kit-size]');
  if (sizeSel) {
    sizeSel.onchange = function() {
      kitList(key).limit = parseInt(this.value, 10) || 20;
      kitList(key).page = 1;
      onChange();
    };
  }
}

// ═══════════════ CLIENT-SIDE LIST HELPERS ═══════════════
// Panels that keep the full dataset in memory (destinations, food, hotels,
// drivers, orders) sort and page locally with these three helpers.

function kitCompare(a, b, dir) {
  var r;
  if (typeof a === 'number' && typeof b === 'number') {
    r = a - b;
  } else {
    r = String(a === null || a === undefined ? '' : a)
      .localeCompare(String(b === null || b === undefined ? '' : b), undefined, { numeric: true, sensitivity: 'base' });
  }
  return dir === 'asc' ? r : -r;
}

// Sorts a copy of `rows` using the list's current sort key/direction.
// valueOf(item, sortKey) maps an item to the value being compared.
function kitSortRows(rows, valueOf, key) {
  var s = kitList(key);
  var arr = (rows || []).slice();
  arr.sort(function(a, b) { return kitCompare(valueOf(a, s.sort), valueOf(b, s.sort), s.dir); });
  return arr;
}

// Clamps the current page to the data and returns the visible slice plus the
// pagination object kitRenderPager expects.
function kitSlice(rows, key) {
  var s = kitList(key);
  var total = (rows || []).length;
  var totalPages = Math.max(1, Math.ceil(total / s.limit));
  if (s.page > totalPages) s.page = totalPages;
  if (s.page < 1) s.page = 1;
  var start = (s.page - 1) * s.limit;
  return {
    rows: (rows || []).slice(start, start + s.limit),
    page: s.page,
    limit: s.limit,
    total: total,
    totalPages: totalPages
  };
}

// ═══════════════ SAVED FILTERS ═══════════════
// Presets are stored per list key in localStorage. Only the values the caller
// hands back from buildParams() are persisted - never tokens or user data.

function sfKey(key) { return 'eb_sf_' + key; }

function sfLoad(key) {
  try {
    var raw = localStorage.getItem(sfKey(key));
    var list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function sfPersist(key, list) {
  try { localStorage.setItem(sfKey(key), JSON.stringify(list)); } catch (e) {}
}

function sfSave(key, name, params) {
  var list = sfLoad(key).filter(function(f) { return f.name !== name; });
  list.push({ name: name, params: params, at: new Date().toISOString() });
  sfPersist(key, list);
  return list;
}

function sfRemove(key, name) {
  var list = sfLoad(key).filter(function(f) { return f.name !== name; });
  sfPersist(key, list);
  return list;
}

// cfg: { key, current: {name, params}, onApply(params, name), onSaved() }
function kitRenderSavedBar(container, cfg) {
  var el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) return;
  var list = sfLoad(cfg.key);
  var activeName = cfg.current && cfg.current.name;
  var html = '<span class="saved-label">Saved</span>';
  if (!list.length) {
    html += '<span class="pager-info">No presets yet</span>';
  } else {
    list.forEach(function(f) {
      html += '<span class="sf-chip' + (f.name === activeName ? ' on' : '') + '" data-apply="' + esc(f.name) + '" role="button" tabindex="0">' +
        esc(f.name) +
        '<span class="sf-x" data-del="' + esc(f.name) + '" title="Delete preset" aria-label="Delete preset">&times;</span></span>';
    });
  }
  html += '<button type="button" class="sf-save" data-save-title="Save current filters as a preset">' +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Save current</button>';
  el.innerHTML = html;

  Array.prototype.forEach.call(el.querySelectorAll('[data-apply]'), function(chip) {
    chip.onclick = function(e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-del')) return;
      var name = chip.getAttribute('data-apply');
      var found = sfLoad(cfg.key).filter(function(f) { return f.name === name; })[0];
      if (found && cfg.onApply) cfg.onApply(found.params, name);
    };
  });
  Array.prototype.forEach.call(el.querySelectorAll('[data-del]'), function(x) {
    x.onclick = function(e) {
      e.stopPropagation();
      sfRemove(cfg.key, x.getAttribute('data-del'));
      kitRenderSavedBar(container, cfg);
    };
  });
  var saveBtn = el.querySelector('[data-save-title]');
  if (saveBtn) {
    saveBtn.onclick = function() {
      var current = (cfg.current && cfg.current.params) || {};
      if (!Object.keys(current).length) { toast('Nothing to save - set a filter or sort first', false); return; }
      var name = window.prompt('Name this preset', (cfg.current && cfg.current.name) || '');
      if (!name) return;
      sfSave(cfg.key, name.trim(), current);
      if (cfg.onSaved) cfg.onSaved(name.trim());
      toast('Preset "' + name.trim() + '" saved');
    };
  }
}

// ═══════════════ DRAFT AUTOSAVE ═══════════════
// Long forms keep a local draft while they are being filled in. Drafts hold
// only field values from the form itself and are cleared on successful save.

var draftTimers = {};

function draftKey(key) { return 'eb_draft_' + key; }

function draftSave(key, values) {
  try { localStorage.setItem(draftKey(key), JSON.stringify({ v: values, at: Date.now() })); } catch (e) {}
}

function draftLoad(key) {
  try {
    var raw = localStorage.getItem(draftKey(key));
    if (!raw) return null;
    var obj = JSON.parse(raw);
    // Drafts expire after 24 hours so stale content never resurfaces.
    if (!obj || !obj.v || Date.now() - (obj.at || 0) > 24 * 60 * 60 * 1000) {
      draftClear(key);
      return null;
    }
    return obj.v;
  } catch (e) { return null; }
}

function draftClear(key) {
  try { localStorage.removeItem(draftKey(key)); } catch (e) {}
  if (draftTimers[key]) { clearTimeout(draftTimers[key]); delete draftTimers[key]; }
}

// Collects the named fields of a form/container into a plain object.
function draftValues(root, fields) {
  var out = {};
  (fields || []).forEach(function(name) {
    var el = root.querySelector('[name="' + name + '"]');
    if (!el) el = document.getElementById(name);
    if (!el) return;
    out[name] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return out;
}

function draftRestore(root, fields, values) {
  if (!values) return false;
  var restored = false;
  (fields || []).forEach(function(name) {
    var el = root.querySelector('[name="' + name + '"]');
    if (!el) el = document.getElementById(name);
    if (!el || values[name] === undefined) return;
    if (el.type === 'checkbox') el.checked = !!values[name];
    else el.value = values[name];
    restored = true;
  });
  return restored;
}

// Wires live autosave for the given field ids. Call once when a form opens.
function draftBind(key, fieldIds) {
  if (!key || !fieldIds || !fieldIds.length) return;
  var save = function() {
    if (draftTimers[key]) clearTimeout(draftTimers[key]);
    draftTimers[key] = setTimeout(function() {
      var values = {};
      fieldIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) values[id] = el.type === 'checkbox' ? el.checked : el.value;
      });
      var empty = fieldIds.every(function(id) {
        var v = values[id];
        return v === undefined || v === '' || v === false;
      });
      if (empty) draftClear(key);
      else draftSave(key, values);
    }, 700);
  };
  fieldIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el || el.getAttribute('data-draft')) return;
    el.setAttribute('data-draft', '1');
    el.addEventListener('input', save);
    el.addEventListener('change', save);
  });
}

// Restores a draft into the form if one exists; returns true when restored.
function draftRestoreInto(key, fieldIds) {
  var values = draftLoad(key);
  if (!values) return false;
  var any = false;
  fieldIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el || values[id] === undefined) return;
    if (el.type === 'checkbox') el.checked = !!values[id];
    else el.value = values[id];
    any = true;
  });
  if (any) toast('Unsent draft restored');
  return any;
}
