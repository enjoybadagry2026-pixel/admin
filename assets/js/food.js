// ═══════════════ FOODS ═══════════════

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
  var html = '';
  var n = 0;
  Object.keys(foods).forEach(function(id) {
    var f = foods[id];
    if (search && (f.name||'').toLowerCase().indexOf(search) < 0 && (f.category||'').toLowerCase().indexOf(search) < 0) return;
    n++;
    var price = f.price ? fmtNaira(f.price) : '';
    var dest = f.destinationId && places[f.destinationId] ? places[f.destinationId].name : '';
    var catDisplay = esc((f.category||'').replace(/,/g, ', '));
    var tags = f.tags ? f.tags.split(',').map(function(t){return t.trim()}).filter(Boolean) : [];
    html += '<div class="food-card" onclick="prevFood(\''+id+'\')">' +
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
        '<div class="food-card-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editFood(\''+id+'\')">Edit</button>' +
          '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();delFood(\''+id+'\')">Delete</button>' +
        '</div>' +
      '</div></div>';
  });
  document.getElementById('f-list').innerHTML = html || '<div class="food-empty"><div class="food-empty-icon">🍽️</div><div class="food-empty-title">No food items yet</div><div class="food-empty-text">Add your first menu item to start managing the food catalog.</div></div>';
  document.getElementById('f-count').textContent = n + ' item' + (n !== 1 ? 's' : '');
}

function openFoodModal(editId) {
  resetFood();
  if (editId) {
    var f = cachedFoods[editId];
    if (!f) return;
    document.getElementById('f-edit').value = editId;
    document.getElementById('f-name').value = f.name || '';
    document.getElementById('f-cat').value = f.category || '';
    document.getElementById('f-img').value = f.image || '';
    document.getElementById('f-price').value = f.price || '';
    document.getElementById('f-desc').value = f.description || '';
    document.getElementById('f-dest').value = f.destinationId || '';
    document.getElementById('f-prep').value = f.prepTime || '';
    document.getElementById('f-tags').value = f.tags || '';
    renderTagChips('f-cat');
    setGalInputs('f-gal-list', f.gallery || []);
    document.getElementById('f-avail').classList.toggle('on', f.available !== false);
    document.getElementById('f-feat').classList.toggle('on', !!f.featured);
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
  var gal = getGalInputs('f-gal-list');
  var data = {
    name: name, category: cat, image: img,
    price: Number(price),
    destinationId: document.getElementById('f-dest').value || null,
    description: document.getElementById('f-desc').value.trim(),
    prepTime: document.getElementById('f-prep').value.trim(),
    tags: document.getElementById('f-tags').value.trim(),
    gallery: gal,
    available: document.getElementById('f-avail').classList.contains('on'),
    featured: document.getElementById('f-feat').classList.contains('on')
  };
  var editId = document.getElementById('f-edit').value;
  try {
    if (editId) {
      await api('PUT', '/foods/' + editId, data);
    } else {
      await api('POST', '/foods', data);
    }
    load(false);
    toast(editId ? 'Updated!' : 'Added!');
    closeFoodModal();
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
  document.getElementById('f-feat').classList.remove('on');
  document.getElementById('f-save').textContent = 'Save Food Item';
  document.getElementById('foodModalTitle').textContent = 'Create Food Item';
  document.getElementById('f-gal-list').innerHTML = '<div class="img-add-row"><input placeholder="Image URL 1" class="gal-input"><button type="button" class="btn-icon" onclick="this.parentElement.remove()">&times;</button></div>';
  var catInput = document.getElementById('f-cat-input');
  var wrap = document.getElementById('f-cat-wrap');
  wrap.innerHTML = '';
  wrap.appendChild(catInput);
  catInput.value = '';
}

function prevFood(id) {
  var f = cachedFoods[id];
  if (f) toast(f.name + (f.price ? ' \u2014 ' + fmtNaira(f.price) : ''), true);
}
