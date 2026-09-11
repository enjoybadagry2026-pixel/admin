// ═══════════════ DESTINATIONS ═══════════════

function renderDest(places) {
  places = places || cachedPlacesArr;
  var html = '';
  var n = 0;
  places.forEach(function(p) {
    if (search && (p.name||'').toLowerCase().indexOf(search) < 0 && (p.category||'').toLowerCase().indexOf(search) < 0 && (p.address||'').toLowerCase().indexOf(search) < 0) return;
    n++;
    var catArr = (p.category||'').split(',').filter(Boolean);
    var catTags = '';
    catArr.forEach(function(c) {
      catTags += '<span class="tag tag-feat">' + esc(c.trim()) + '</span>';
    });
    var hasImg = p.coverImage && p.coverImage.trim();
    var imgSection = hasImg
      ? '<img class="dest-card-img" src="' + esc(p.coverImage) + '" onerror="this.parentElement.innerHTML=\'<div class=dest-card-img-fallback>\uD83C\uDFD6\uFE0F</div>\'">'
      : '<div class="dest-card-img-fallback">\uD83C\uDFD6\uFE0F</div>';
    html += '<div class="dest-card" onclick="prevDest(\'' + p.id + '\')">' +
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
        '<div class="dest-card-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editDest(\'' + p.id + '\')">Edit</button>' +
          '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();delDest(\'' + p.id + '\')">Delete</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  });
  document.getElementById('d-list').innerHTML = html || '<div class="dest-empty"><div class="dest-empty-icon">\uD83C\uDFD6\uFE0F</div><div class="dest-empty-title">No destinations yet</div><div class="dest-empty-text">Create your first destination to get started.</div><button class="btn btn-accent" onclick="openDestModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Create Destination</button></div>';
  document.getElementById('d-count').textContent = n + ' place' + (n !== 1 ? 's' : '');
}

// ═══════════════ MODAL CONTROLS ═══════════════

function openDestModal() {
  resetDest();
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
  var desc = document.getElementById('d-desc').value.trim();
  var addr = document.getElementById('d-addr').value.trim();
  if (!name || !cat || !cover || !desc || !addr) { toast('Fill all required fields', false); return; }
  load(true);
  var gal = getGalInputs('d-gal-list');
  var data = {
    name: name, category: cat, coverImage: cover, description: desc, address: addr,
    mapsLink: document.getElementById('d-maps').value.trim(),
    coordinates: document.getElementById('d-coords').value.trim(),
    phone: document.getElementById('d-phone').value.trim(),
    email: document.getElementById('d-email').value.trim(),
    website: document.getElementById('d-web').value.trim(),
    hours: document.getElementById('d-hours').value.trim(),
    entranceFee: document.getElementById('d-fee').value.trim(),
    gallery: gal,
    featured: document.getElementById('d-feat').classList.contains('on')
  };
  var editId = document.getElementById('d-edit').value;
  try {
    if (editId) {
      await api('PUT', '/destinations/' + editId, data);
    } else {
      await api('POST', '/destinations', data);
    }
    load(false);
    closeDestModal();
    toast(editId ? 'Destination updated!' : 'Destination created!');
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
  document.getElementById('d-cover').value = p.coverImage || '';
  document.getElementById('d-desc').value = p.description || '';
  document.getElementById('d-addr').value = p.address || '';
  document.getElementById('d-maps').value = p.mapsLink || '';
  document.getElementById('d-coords').value = p.coordinates || '';
  document.getElementById('d-phone').value = p.phone || '';
  document.getElementById('d-email').value = p.email || '';
  document.getElementById('d-web').value = p.website || '';
  document.getElementById('d-hours').value = p.hours || '';
  document.getElementById('d-fee').value = p.entranceFee || '';
  renderTagChips('d-cat');
  setGalInputs('d-gal-list', p.gallery || []);
  document.getElementById('d-feat').classList.toggle('on', !!p.featured);
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
  document.getElementById('d-feat').classList.remove('on');
  document.getElementById('d-save').textContent = 'Save Destination';
  document.getElementById('d-gal-list').innerHTML = '<div class="img-add-row"><input placeholder="Image URL 1" class="gal-input"><button type="button" class="btn-icon" onclick="this.parentElement.remove()">&times;</button></div>';
  var catInput = document.getElementById('d-cat-input');
  var wrap = document.getElementById('d-cat-wrap');
  wrap.innerHTML = '';
  wrap.appendChild(catInput);
  catInput.value = '';
}

function prevDest(id) {
  var p = cachedPlaces[id];
  if (p) toast(p.name + (p.featured ? ' \u2605' : ''), true);
}
