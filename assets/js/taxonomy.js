// ═══════════════ TAGS & CATEGORIES (master lists) ═══════════════

var txCats = [];
var txTags = [];

async function loadTaxonomyPanel() {
  try {
    load(true);
    var cats = await api('GET', '/categories');
    var tgs = await api('GET', '/tags');
    txCats = cats.data.categories || [];
    txTags = tgs.data.tags || [];
    load(false);
  } catch (e) {
    load(false);
    toast('Failed to load taxonomy: ' + e.message, false);
    return;
  }
  cmsLoadTaxonomy(true);
  renderTaxonomy();
}

function txUsage(u) {
  if (!u) return '';
  var parts = [];
  if (Number(u.destinations)) parts.push(u.destinations + ' dest');
  if (Number(u.foods)) parts.push(u.foods + ' food');
  if (Number(u.hotels)) parts.push(u.hotels + ' hotel');
  if (Number(u.events)) parts.push(u.events + ' event');
  var total = Number(u.total) || 0;
  return '<span class="tax-usage" title="' + esc(parts.join(', ') || 'Unused') + '">' + total + ' used</span>';
}

function txRowHtml(kind, rec) {
  var isCat = kind === 'cat';
  var toggleTitle = isCat
    ? (rec.active !== false ? 'Active — click to disable' : 'Disabled — click to enable')
    : (rec.active !== false ? 'Active — click to disable' : 'Disabled — click to enable');
  return '<div class="tax-row' + (rec.active === false ? ' off' : '') + '" id="tx-' + kind + '-' + rec.id + '">' +
    '<span class="tax-name" title="Click to rename" onclick="txRenameStart(\'' + kind + '\',' + rec.id + ')">' + esc(rec.name) + '</span>' +
    txUsage(rec.usage) +
    '<div class="tax-acts">' +
      '<button type="button" class="tax-btn' + (rec.active !== false ? ' on' : '') + '" title="' + toggleTitle + '" onclick="txToggle(\'' + kind + '\',' + rec.id + ',' + (rec.active === false) + ')">' +
        (rec.active !== false ? 'ON' : 'OFF') + '</button>' +
      '<button type="button" class="tax-btn" title="Rename" onclick="txRenameStart(\'' + kind + '\',' + rec.id + ')">✎</button>' +
      '<button type="button" class="tax-btn danger" title="Delete" onclick="txDelete(\'' + kind + '\',' + rec.id + ')">×</button>' +
    '</div>' +
  '</div>';
}

function renderTaxonomy() {
  var catHost = document.getElementById('tx-cats');
  var tagHost = document.getElementById('tx-tags');
  if (catHost) {
    catHost.innerHTML = txCats.length
      ? txCats.map(function(c) { return txRowHtml('cat', c); }).join('')
      : '<div class="tax-empty">No categories yet — add the first one above.</div>';
  }
  if (tagHost) {
    tagHost.innerHTML = txTags.length
      ? txTags.map(function(t) { return txRowHtml('tag', t); }).join('')
      : '<div class="tax-empty">No tags yet — add the first one above.</div>';
  }
  var cc = document.getElementById('tx-cat-count');
  var tc = document.getElementById('tx-tag-count');
  if (cc) cc.textContent = txCats.length + ' total';
  if (tc) tc.textContent = txTags.length + ' total';
}

async function txCreate(kind) {
  var input = document.getElementById(kind === 'cat' ? 'tx-cat-new' : 'tx-tag-new');
  var name = input.value.trim();
  if (!name) { toast('Type a name first', false); return; }
  try {
    load(true);
    await api('POST', kind === 'cat' ? '/categories' : '/tags', { name: name });
    load(false);
    input.value = '';
    toast((kind === 'cat' ? 'Category' : 'Tag') + ' created');
    loadTaxonomyPanel();
  } catch (e) {
    load(false);
    toast(e.message, false);
  }
}

function txRenameStart(kind, id) {
  var row = document.getElementById('tx-' + kind + '-' + id);
  if (!row) return;
  var span = row.querySelector('.tax-name');
  if (!span || span.querySelector('input')) return;
  var original = span.textContent;
  span.innerHTML = '<input type="text" value="' + esc(original) + '">';
  var inp = span.querySelector('input');
  inp.focus();
  inp.select();
  var done = false;

  async function commit() {
    if (done) return;
    done = true;
    var v = inp.value.trim();
    if (!v || v === original) { txRenameCancel(kind, id, original); return; }
    try {
      load(true);
      await api('PUT', (kind === 'cat' ? '/categories/' : '/tags/') + id, { name: v });
      load(false);
      toast('Renamed');
      loadTaxonomyPanel();
      // Renames rewrite category/tag values on content rows server-side.
      if (typeof loadAllData === 'function') loadAllData();
    } catch (e) {
      load(false);
      toast(e.message, false);
      txRenameCancel(kind, id, original);
    }
  }

  inp.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
    if (ev.key === 'Escape') { done = true; txRenameCancel(kind, id, original); }
  });
  inp.addEventListener('blur', function() { commit(); });
}

function txRenameCancel(kind, id, original) {
  var row = document.getElementById('tx-' + kind + '-' + id);
  if (row) {
    var span = row.querySelector('.tax-name');
    if (span) { span.textContent = original; }
  }
}

async function txToggle(kind, id, active) {
  try {
    load(true);
    await api('PUT', (kind === 'cat' ? '/categories/' : '/tags/') + id, { active: active });
    load(false);
    toast(active ? 'Enabled' : 'Disabled');
    loadTaxonomyPanel();
  } catch (e) {
    load(false);
    toast(e.message, false);
  }
}

function txDelete(kind, id) {
  var list = kind === 'cat' ? txCats : txTags;
  var rec = list.filter(function(r) { return r.id === id; })[0];
  var label = kind === 'cat' ? 'Category' : 'Tag';
  showDel('Delete ' + label + ' "' + (rec && rec.name || 'this') + '"? ' +
    (rec && Number(rec.usage && rec.usage.total) > 0
      ? 'It is currently in use — you may need to disable it instead.'
      : ''), async function() {
    try {
      load(true);
      await api('DELETE', (kind === 'cat' ? '/categories/' : '/tags/') + id);
      load(false);
      toast(label + ' deleted');
      loadTaxonomyPanel();
    } catch (e) {
      load(false);
      toast(e.message, false);
    }
  });
}

