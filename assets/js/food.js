// ═══════════════ FOODS ═══════════════

// Client-side sort keys, mirroring the fields GET /foods returns.
var FOOD_SORT_OPTIONS = [
  { value: 'created', label: 'Date added' },
  { value: 'updated', label: 'Last updated' },
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Price' },
  { value: 'category', label: 'Category' }
];

function foodSortValue(f, key) {
  if (key === 'price') return Number(f.price) || 0;
  if (key === 'name') return String(f.name || '');
  if (key === 'category') return String(f.category || '');
  if (key === 'updated') return String(f.updatedAt || f.createdAt || '');
  return String(f.createdAt || '');
}

function updateDestDropdown() {
  var sel = document.getElementById('f-dest');
  var cur = sel.value;
  sel.innerHTML = '<option value="">None</option>';
  cachedPlacesArr.forEach(function(p){
    var o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name || p.id;
    sel.appendChild(o);
  });
  sel.value = cur;
}

function renderFood(foods, places) {
  foods = foods || {};
  places = places || {};
  kitList('food', { sort: 'created', dir: 'desc', limit: 24 });
  if (!bulkStore.f) {
    bulkRegister('f', 'foods', function() { loadAllData(); },
      { category: true, tags: true });
  }
  var filtered = [];
  Object.keys(foods).forEach(function(id) {
    var f = foods[id];
    if (search && (f.name||'').toLowerCase().indexOf(search) < 0 && (f.category||'').toLowerCase().indexOf(search) < 0) return;
    filtered.push({ id: id, f: f });
  });
  filtered = kitSortRows(filtered, function(row, key) { return foodSortValue(row.f, key); }, 'food');
  var page = kitSlice(filtered, 'food');
  var n = filtered.length;

  var html = '';
  var visibleIds = filtered.map(function(row) { return row.id; });
  page.rows.forEach(function(row) {
    var id = row.id;
    var f = row.f;
    var price = f.price ? fmtNaira(f.price) : '';
    var dest = f.destinationId && places[f.destinationId] ? places[f.destinationId].name : '';
    var catDisplay = esc((f.category||'').replace(/,/g, ', '));
    var tagRaw = f.tags;
    var tagList = Array.isArray(tagRaw) ? tagRaw : (tagRaw ? String(tagRaw).split(',') : []);
    var tags = tagList.map(function(t){return String(t).trim()}).filter(Boolean);
    html += '<div class="food-card' + (bulkStore.f && bulkStore.f.selected[id] ? ' is-selected' : '') + '" onclick="prevFood(\''+id+'\')">' +
      '<div class="cms-card-check" onclick="event.stopPropagation()">' +
        '<input type="checkbox" class="bulk-check" ' + (bulkStore.f && bulkStore.f.selected[id] ? 'checked' : '') +
        ' onchange="bulkToggle(\'f\',\'' + id + '\',this.checked)">' +
      '</div>' +
      '<div class="food-card-img-wrap">' +
        (f.image
          ? '<img class="food-card-img" src="'+esc(f.image)+'" onerror="this.outerHTML=\'<div class=food-card-img-fallback>🍽️</div>\'">'
          : '<div class="food-card-img-fallback">🍽️</div>'
        ) +
        '<div class="food-card-overlay"></div>' +
        (f.featured ? '<div class="food-card-badge">⭐ Featured</div>' : '') +
        (price ? '<div class="food-card-price">'+price+'</div>' : '') +
      '</div>' +
      '<div class="food-card-body">' +
        '<div class="food-card-name">'+esc(f.name)+'</div>' +
        '<div class="food-card-meta">' +
          '<span class="food-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'+catDisplay+'</span>' +
          (dest ? '<span class="food-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'+esc(dest)+'</span>' : '') +
          (f.prepTime ? '<span class="food-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'+esc(f.prepTime)+'</span>' : '') +
        '</div>' +
        (tags.length ? '<div class="food-card-tags">' + tags.map(function(t){return '<span class="tag">'+esc(t)+'</span>'}).join('') + '</div>' : '') +
        '<div style="margin-bottom:8px">' +
          '<span class="food-card-status '+(f.available !== false ? 'food-card-status-available' : 'food-card-status-unavailable')+'">'+(f.available !== false ? '● Available' : '● Unavailable')+'</span>' +
        '</div>' +
        '<div class="cms-card-badges">' + cmsStatusBadge(f) + '</div>' +
        '<div class="food-card-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editFood(\''+id+'\')">Edit</button>' +
          '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();delFood(\''+id+'\')">Delete</button>' +
          '<select class="cms-quick-status" onclick="event.stopPropagation()" onchange="quickStatus(\'foods\',\'' + id + '\',this.value)">' +
            '<option value="draft" ' + (f.status === 'draft' ? 'selected' : '') + '>Draft</option>' +
            '<option value="published" ' + (f.status !== 'draft' && f.status !== 'archived' ? 'selected' : '') + '>Published</option>' +
            '<option value="archived" ' + (f.status === 'archived' ? 'selected' : '') + '>Archived</option>' +
          '</select>' +
        '</div>' +
      '</div></div>';
  });
  bulkVisible['f'] = visibleIds;
  if (!html && !n) {
    var noMatch = !!search && Object.keys(foods).length > 0;
    html = noMatch
      ? '<div class="food-empty"><div class="food-empty-icon">\uD83D\uDD0D</div><div class="food-empty-title">No food items match your search</div><div class="food-empty-text">Try a different name or category.</div></div>'
      : '<div class="food-empty"><div class="food-empty-icon">🍽️</div><div class="food-empty-title">No food items yet</div><div class="food-empty-text">Add your first menu item to start managing the food catalog.</div></div>';
    html += '<div id="f-insights" style="margin-top:16px"></div>';
  }
  document.getElementById('f-list').innerHTML = html;
  document.getElementById('f-count').textContent = n + ' item' + (n !== 1 ? 's' : '');
  kitRenderPager('f-pager', 'food', n ? page : null, function() { renderFood(cachedFoods, cachedPlaces); });
  kitRenderSort('f-sort', 'food', FOOD_SORT_OPTIONS, function() { renderFood(cachedFoods, cachedPlaces); });
  kitRenderSavedBar('f-saved', {
    key: 'food',
    current: { name: kitList('food').preset, params: { sort: kitList('food').sort, dir: kitList('food').dir } },
    onApply: function(params, name) {
      kitApplyParams('food', params);
      kitList('food').preset = name;
      renderFood(cachedFoods, cachedPlaces);
    },
    onSaved: function() { renderFood(cachedFoods, cachedPlaces); }
  });
  bulkRender('f');
  if (document.getElementById('f-insights')) loadInsightsInto('f-insights');
}

// Fields kept as a local draft while a new food item is being written.
var FOOD_DRAFT_FIELDS = ['f-name', 'f-cat', 'f-price', 'f-dest', 'f-prep', 'f-tags', 'f-status'];

function openFoodModal(editId) {
  resetFood();
  cmsGalleryInit('f-gal', 'f-img');
  if (!editId) {
    draftBind('food', FOOD_DRAFT_FIELDS);
    draftRestoreInto('food', FOOD_DRAFT_FIELDS);
  }
  if (editId) {
    var f = cachedFoods[editId];
    if (!f) return;
    document.getElementById('f-edit').value = editId;
    document.getElementById('f-name').value = f.name || '';
    document.getElementById('f-cat').value = f.category || '';
    document.getElementById('f-price').value = f.price || '';
    document.getElementById('f-dest').value = f.destinationId || '';
    document.getElementById('f-prep').value = f.prepTime || '';
    var tagRaw = f.tags;
    document.getElementById('f-tags').value = Array.isArray(tagRaw) ? tagRaw.join(', ') : (tagRaw || '');
    document.getElementById('f-status').value = f.status || 'published';
    renderTagChips('f-cat');
    cmsCoverSet('f-img', f.image || '');
    cmsGallerySet('f-gal', f.gallery || []);
    cmsGalleryInit('f-gal', 'f-img');
    rteSet('f-desc', f.descriptionHtml || '');
    document.getElementById('f-avail').classList.toggle('on', f.available !== false);
    document.getElementById('f-feat').classList.toggle('on', !!f.featured);
    cmsFeatToggle('f');
    document.getElementById('f-feat-from').value = cmsToLocalInput(f.featuredFrom);
    document.getElementById('f-feat-until').value = cmsToLocalInput(f.featuredUntil);
    document.getElementById('foodModalTitle').textContent = 'Edit Food Item';
    document.getElementById('f-save').textContent = 'Update Food Item';
  }
  document.getElementById('foodModal').classList.add('on');
  document.body.style.overflow = 'hidden';
  setTimeout(function(){ document.getElementById('f-name').focus() }, 120);
}

function closeFoodModal() {
  document.getElementById('foodModal').classList.remove('on');
  document.body.style.overflow = '';
  resetFood();
}

document.addEventListener('click', function(e) {
  var bg = document.getElementById('foodModal');
  if (bg && e.target === bg) closeFoodModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var bg = document.getElementById('foodModal');
    if (bg && bg.classList.contains('on')) closeFoodModal();
  }
});

async function saveFood() {
  var name = document.getElementById('f-name').value.trim();
  var cat = document.getElementById('f-cat').value;
  var img = document.getElementById('f-img').value.trim();
  var price = document.getElementById('f-price').value;
  if (!name || !cat || !img || !price) { toast('Fill all required fields', false); return; }
  load(true);
  var data = {
    name: name, category: cat, image: img,
    price: Number(price),
    destinationId: document.getElementById('f-dest').value || null,
    description: rteText('f-desc'),
    descriptionHtml: rteGet('f-desc'),
    prepTime: document.getElementById('f-prep').value.trim(),
    tags: document.getElementById('f-tags').value.trim(),
    gallery: cmsGalleryGet('f-gal'),
    available: document.getElementById('f-avail').classList.contains('on'),
    status: document.getElementById('f-status').value,
    featured: document.getElementById('f-feat').classList.contains('on')
  };
  if (data.featured) {
    data.featuredFrom = document.getElementById('f-feat-from').value || null;
    data.featuredUntil = document.getElementById('f-feat-until').value || null;
  } else {
    data.featuredFrom = null;
    data.featuredUntil = null;
  }
  var editId = document.getElementById('f-edit').value;
  try {
    if (editId) {
      await api('PUT', '/foods/' + editId, data);
    } else {
      await api('POST', '/foods', data);
    }
    load(false);
    draftClear('food');
    toast(editId ? 'Updated!' : 'Added!');
    closeFoodModal();
    cmsLoadTaxonomy(true);
    loadAllData();
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

function editFood(id) {
  openFoodModal(id);
}

function delFood(id) {
  var f = cachedFoods[id];
  showDel('Delete "' + (f&&f.name||'this') + '"?', async function(){
    load(true);
    try {
      await api('DELETE', '/foods/' + id);
      load(false);
      toast('Deleted');
      loadAllData();
    } catch (e) {
      load(false);
      toast(e.message, false);
    }
  });
}

function resetFood() {
  document.getElementById('foodForm').reset();
  document.getElementById('f-edit').value = '';
  document.getElementById('f-cat').value = '';
  document.getElementById('f-avail').classList.add('on');
  document.getElementById('f-status').value = 'published';
  document.getElementById('f-feat').classList.remove('on');
  cmsFeatToggle('f');
  document.getElementById('f-feat-from').value = '';
  document.getElementById('f-feat-until').value = '';
  document.getElementById('f-save').textContent = 'Save Food Item';
  document.getElementById('foodModalTitle').textContent = 'Create Food Item';
  cmsCoverSet('f-img', '');
  cmsGallerySet('f-gal', []);
  rteClear('f-desc');
  var catInput = document.getElementById('f-cat-input');
  var wrap = document.getElementById('f-cat-wrap');
  if (catInput && wrap) {
    wrap.innerHTML = '';
    wrap.appendChild(catInput);
    catInput.value = '';
  }
}

function prevFood(id) {
  var f = cachedFoods[id];
  if (f) toast(f.name + (f.price ? ' \u2014 ' + fmtNaira(f.price) : ''), true);
}
