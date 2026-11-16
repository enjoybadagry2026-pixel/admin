// ═══════════════ DESTINATIONS ═══════════════

// Client-side sort keys, mirroring the fields GET /destinations returns.
var DEST_SORT_OPTIONS = [
  { value: 'created', label: 'Date created' },
  { value: 'updated', label: 'Last updated' },
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' }
];

function destSortValue(p, key) {
  if (key === 'name') return String(p.name || '');
  if (key === 'category') return String(p.category || '');
  if (key === 'updated') return String(p.updatedAt || p.createdAt || '');
  return String(p.createdAt || '');
}

function renderDest(places) {
  places = places || cachedPlacesArr;
  kitList('dest', { sort: 'created', dir: 'desc', limit: 24 });
  if (!bulkStore.d) {
    bulkRegister('d', 'destinations', function() { loadAllData(); },
      { category: true, tags: true });
  }
  var filtered = [];
  places.forEach(function(p) {
    if (search && (p.name||'').toLowerCase().indexOf(search) < 0 && (p.category||'').toLowerCase().indexOf(search) < 0 && (p.address||'').toLowerCase().indexOf(search) < 0) return;
    filtered.push(p);
  });
  filtered = kitSortRows(filtered, destSortValue, 'dest');
  var page = kitSlice(filtered, 'dest');
  var n = filtered.length;

  var html = '';
  var visibleIds = filtered.map(function(p) { return p.id; });
  page.rows.forEach(function(p) {
    var catArr = (p.category||'').split(',').filter(Boolean);
    var catTags = '';
    catArr.forEach(function(c) {
      catTags += '<span class="tag tag-feat">' + esc(c.trim()) + '</span>';
    });
    var hasImg = p.coverImage && p.coverImage.trim();
    var imgSection = hasImg
      ? '<img class="dest-card-img" src="' + esc(p.coverImage) + '" onerror="this.parentElement.innerHTML=\'<div class=dest-card-img-fallback>\uD83C\uDFD6\uFE0F</div>\'">'
      : '<div class="dest-card-img-fallback">\uD83C\uDFD6\uFE0F</div>';
    html += '<div class="dest-card' + (bulkStore.d && bulkStore.d.selected[p.id] ? ' is-selected' : '') + '" onclick="prevDest(\'' + p.id + '\')">' +
      '<div class="cms-card-check" onclick="event.stopPropagation()">' +
        '<input type="checkbox" class="bulk-check" ' + (bulkStore.d && bulkStore.d.selected[p.id] ? 'checked' : '') +
        ' onchange="bulkToggle(\'d\',\'' + p.id + '\',this.checked)">' +
      '</div>' +
      '<div class="dest-card-img-wrap">' +
        imgSection +
        '<div class="dest-card-overlay"></div>' +
        (p.featured ? '<div class="dest-card-badge">&#9733; Featured</div>' : '') +
      '</div>' +
      '<div class="dest-card-body">' +
        '<div class="dest-card-name">' + esc(p.name) + '</div>' +
        '<div class="dest-card-meta">' +
          (p.address ? '<span class="dest-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + esc(p.address.length > 30 ? p.address.substring(0, 30) + '...' : p.address) + '</span>' : '') +
          (p.entranceFee ? '<span class="dest-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' + esc(p.entranceFee) + '</span>' : '') +
          (p.hours ? '<span class="dest-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + esc(p.hours) + '</span>' : '') +
        '</div>' +
        (catTags ? '<div class="dest-card-tags">' + catTags + '</div>' : '') +
        '<div class="cms-card-badges">' + cmsStatusBadge(p) + '</div>' +
        '<div class="dest-card-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editDest(\'' + p.id + '\')">Edit</button>' +
          '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();delDest(\'' + p.id + '\')">Delete</button>' +
          '<select class="cms-quick-status" onclick="event.stopPropagation()" onchange="quickStatus(\'destinations\',\'' + p.id + '\',this.value)">' +
            '<option value="draft" ' + (p.status === 'draft' ? 'selected' : '') + '>Draft</option>' +
            '<option value="published" ' + (p.status !== 'draft' && p.status !== 'archived' ? 'selected' : '') + '>Published</option>' +
            '<option value="archived" ' + (p.status === 'archived' ? 'selected' : '') + '>Archived</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
    '</div>';
  });
  bulkVisible['d'] = visibleIds;
  if (!html && !n) {
    var noMatch = !!search && places.length > 0;
    html = noMatch
      ? '<div class="dest-empty"><div class="dest-empty-icon">\uD83D\uDD0D</div><div class="dest-empty-title">No destinations match your search</div><div class="dest-empty-text">Try a different name, category or address.</div></div>'
      : '<div class="dest-empty"><div class="dest-empty-icon">\uD83C\uDFD6\uFE0F</div><div class="dest-empty-title">No destinations yet</div><div class="dest-empty-text">Create your first destination to get started.</div><button class="btn btn-accent" onclick="openDestModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Create Destination</button></div>';
    html += '<div id="d-insights" style="margin-top:16px"></div>';
  }
  document.getElementById('d-list').innerHTML = html;
  document.getElementById('d-count').textContent = n + ' place' + (n !== 1 ? 's' : '');
  kitRenderPager('d-pager', 'dest', n ? page : null, function() { renderDest(); });
  kitRenderSort('d-sort', 'dest', DEST_SORT_OPTIONS, function() { renderDest(); });
  kitRenderSavedBar('d-saved', {
    key: 'dest',
    current: { name: kitList('dest').preset, params: { sort: kitList('dest').sort, dir: kitList('dest').dir } },
    onApply: function(params, name) {
      kitApplyParams('dest', params);
      kitList('dest').preset = name;
      renderDest();
    },
    onSaved: function() { renderDest(); }
  });
  bulkRender('d');
  if (document.getElementById('d-insights')) loadInsightsInto('d-insights');
}

// ═══════════════ MODAL CONTROLS ═══════════════

// Fields kept as a local draft while a new destination is being written.
var DEST_DRAFT_FIELDS = ['d-name', 'd-cat', 'd-tags', 'd-addr', 'd-maps', 'd-coords',
  'd-phone', 'd-email', 'd-web', 'd-hours', 'd-fee', 'd-status'];

function openDestModal() {
  resetDest();
  cmsGalleryInit('d-gal', 'd-cover');
  draftBind('dest', DEST_DRAFT_FIELDS);
  draftRestoreInto('dest', DEST_DRAFT_FIELDS);
  document.getElementById('destModalTitle').textContent = 'Create Destination';
  document.getElementById('d-save').textContent = 'Save Destination';
  document.getElementById('destModal').classList.add('on');
  document.body.style.overflow = 'hidden';
  setTimeout(function() { document.getElementById('d-name').focus(); }, 200);
}

function closeDestModal() {
  document.getElementById('destModal').classList.remove('on');
  document.body.style.overflow = '';
}

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', function() {
  var destModal = document.getElementById('destModal');
  if (destModal) {
    destModal.addEventListener('click', function(e) {
      if (e.target === destModal) closeDestModal();
    });
  }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var destModal = document.getElementById('destModal');
    if (destModal && destModal.classList.contains('on')) {
      closeDestModal();
    }
  }
});

// ═══════════════ CRUD ═══════════════

async function saveDest() {
  var name = document.getElementById('d-name').value.trim();
  var cat = document.getElementById('d-cat').value;
  var cover = document.getElementById('d-cover').value.trim();
  var desc = rteText('d-desc');
  var addr = document.getElementById('d-addr').value.trim();
  if (!name || !cat || !cover || !desc || !addr) { toast('Fill all required fields', false); return; }
  load(true);
  var data = {
    name: name, category: cat, coverImage: cover, description: desc, address: addr,
    descriptionHtml: rteGet('d-desc'),
    tags: document.getElementById('d-tags').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
    mapsLink: document.getElementById('d-maps').value.trim(),
    coordinates: document.getElementById('d-coords').value.trim(),
    phone: document.getElementById('d-phone').value.trim(),
    email: document.getElementById('d-email').value.trim(),
    website: document.getElementById('d-web').value.trim(),
    hours: document.getElementById('d-hours').value.trim(),
    entranceFee: document.getElementById('d-fee').value.trim(),
    gallery: cmsGalleryGet('d-gal'),
    status: document.getElementById('d-status').value,
    featured: document.getElementById('d-feat').classList.contains('on')
  };
  if (data.featured) {
    data.featuredFrom = document.getElementById('d-feat-from').value || null;
    data.featuredUntil = document.getElementById('d-feat-until').value || null;
  } else {
    data.featuredFrom = null;
    data.featuredUntil = null;
  }
  var editId = document.getElementById('d-edit').value;
  try {
    if (editId) {
      await api('PUT', '/destinations/' + editId, data);
    } else {
      await api('POST', '/destinations', data);
    }
    load(false);
    closeDestModal();
    draftClear('dest');
    toast(editId ? 'Destination updated!' : 'Destination created!');
    cmsLoadTaxonomy(true);
    loadAllData();
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

function editDest(id) {
  var p = cachedPlaces[id];
  if (!p) return;
  document.getElementById('d-edit').value = id;
  document.getElementById('d-name').value = p.name || '';
  document.getElementById('d-cat').value = p.category || '';
  document.getElementById('d-tags').value = (p.tags || []).join(', ');
  document.getElementById('d-addr').value = p.address || '';
  document.getElementById('d-maps').value = p.mapsLink || '';
  document.getElementById('d-coords').value = p.coordinates || '';
  document.getElementById('d-phone').value = p.phone || '';
  document.getElementById('d-email').value = p.email || '';
  document.getElementById('d-web').value = p.website || '';
  document.getElementById('d-hours').value = p.hours || '';
  document.getElementById('d-fee').value = p.entranceFee || '';
  document.getElementById('d-status').value = p.status || 'published';
  renderTagChips('d-cat');
  renderTagChips('d-tags');
  cmsCoverSet('d-cover', p.coverImage || '');
  cmsGallerySet('d-gal', p.gallery || []);
  cmsGalleryInit('d-gal', 'd-cover');
  rteSet('d-desc', p.descriptionHtml || '');
  document.getElementById('d-feat').classList.toggle('on', !!p.featured);
  cmsFeatToggle('d');
  document.getElementById('d-feat-from').value = cmsToLocalInput(p.featuredFrom);
  document.getElementById('d-feat-until').value = cmsToLocalInput(p.featuredUntil);
  document.getElementById('destModalTitle').textContent = 'Edit Destination';
  document.getElementById('d-save').textContent = 'Update Destination';
  document.getElementById('destModal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function delDest(id) {
  var p = cachedPlaces[id];
  showDel('Delete "' + (p&&p.name||'this') + '"?', async function(){
    load(true);
    try {
      await api('DELETE', '/destinations/' + id);
      load(false);
      toast('Deleted');
      loadAllData();
    } catch (e) {
      load(false);
      toast(e.message, false);
    }
  });
}

function resetDest() {
  document.getElementById('destForm').reset();
  document.getElementById('d-edit').value = '';
  document.getElementById('d-cat').value = '';
  document.getElementById('d-tags').value = '';
  document.getElementById('d-status').value = 'published';
  document.getElementById('d-feat').classList.remove('on');
  cmsFeatToggle('d');
  document.getElementById('d-feat-from').value = '';
  document.getElementById('d-feat-until').value = '';
  document.getElementById('d-save').textContent = 'Save Destination';
  cmsCoverSet('d-cover', '');
  cmsGallerySet('d-gal', []);
  rteClear('d-desc');
  ['d-cat', 'd-tags'].forEach(function(prefix) {
    var input = document.getElementById(prefix + '-input');
    var wrap = document.getElementById(prefix + '-wrap');
    if (input && wrap) {
      wrap.innerHTML = '';
      wrap.appendChild(input);
      input.value = '';
    }
  });
}

function prevDest(id) {
  var p = cachedPlaces[id];
  if (p) toast(p.name + (p.featured ? ' \u2605' : ''), true);
}
