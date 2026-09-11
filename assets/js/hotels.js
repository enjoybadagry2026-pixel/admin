// ═══════════════ HOTELS ═══════════════

function renderHotels(hotels) {
  hotels = hotels || {};
  var html = '';
  var n = 0;
  Object.keys(hotels).forEach(function(id) {
    var h = hotels[id];
    if (search && (h.name||'').toLowerCase().indexOf(search) < 0 && (h.category||'').toLowerCase().indexOf(search) < 0 && (h.address||'').toLowerCase().indexOf(search) < 0) return;
    n++;
    var catArr = (h.category||'').split(',').filter(Boolean);
    var catTags = '';
    catArr.forEach(function(c) {
      catTags += '<span class="tag tag-feat">' + esc(c.trim()) + '</span>';
    });
    var hasImg = h.coverImage && h.coverImage.trim();
    var imgSection = hasImg
      ? '<img class="hotel-card-img" src="' + esc(h.coverImage) + '" onerror="this.parentElement.innerHTML=\'<div class=hotel-card-img-fallback>\uD83C\uDFE8</div>\'">'
      : '<div class="hotel-card-img-fallback">\uD83C\uDFE8</div>';
    var ratingStars = '';
    if (h.rating) {
      var starCount = parseInt(h.rating) || 0;
      ratingStars = '<div class="hotel-card-rating"><svg width="12" height="12" viewBox="0 0 24 24" fill="#f1c40f" stroke="#f1c40f" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' + esc(h.rating) + '</div>';
    }
    html += '<div class="hotel-card" onclick="prevHotel(\'' + id + '\')">' +
      '<div class="hotel-card-img-wrap">' +
        imgSection +
        '<div class="hotel-card-overlay"></div>' +
        ratingStars +
        (h.featured ? '<div class="hotel-card-badge">&#9733; Featured</div>' : '') +
      '</div>' +
      '<div class="hotel-card-body">' +
        '<div class="hotel-card-name">' + esc(h.name) + '</div>' +
        '<div class="hotel-card-meta">' +
          (h.address ? '<span class="hotel-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + esc(h.address.length > 30 ? h.address.substring(0, 30) + '...' : h.address) + '</span>' : '') +
          (h.checkInTime ? '<span class="hotel-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + esc(h.checkInTime) + '</span>' : '') +
          (h.checkOutTime ? '<span class="hotel-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + esc(h.checkOutTime) + '</span>' : '') +
        '</div>' +
        (catTags ? '<div class="hotel-card-tags">' + catTags + '</div>' : '') +
        '<div class="hotel-card-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editHotel(\'' + id + '\')">Edit</button>' +
          '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();delHotel(\'' + id + '\')">Delete</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  });
  document.getElementById('h-list').innerHTML = html || '<div class="hotel-empty"><div class="hotel-empty-icon">\uD83C\uDFE8</div><div class="hotel-empty-title">No hotels yet</div><div class="hotel-empty-text">Create your first hotel to get started.</div><button class="btn btn-accent" onclick="openHotelModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Create Hotel</button></div>';
  document.getElementById('h-count').textContent = n + ' hotel' + (n !== 1 ? 's' : '');
}

// ═══════════════ MODAL CONTROLS ═══════════════

function openHotelModal() {
  resetHotel();
  document.getElementById('hotelModalTitle').textContent = 'Create Hotel';
  document.getElementById('h-save').textContent = 'Save Hotel';
  document.getElementById('hotelModal').classList.add('on');
  document.body.style.overflow = 'hidden';
  setTimeout(function() { document.getElementById('h-name').focus(); }, 200);
}

function closeHotelModal() {
  document.getElementById('hotelModal').classList.remove('on');
  document.body.style.overflow = '';
}

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', function() {
  var hotelModal = document.getElementById('hotelModal');
  if (hotelModal) {
    hotelModal.addEventListener('click', function(e) {
      if (e.target === hotelModal) closeHotelModal();
    });
  }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var hotelModal = document.getElementById('hotelModal');
    if (hotelModal && hotelModal.classList.contains('on')) {
      closeHotelModal();
    }
  }
});

// ═══════════════ CRUD ═══════════════

async function saveHotel() {
  var name = document.getElementById('h-name').value.trim();
  var cat = document.getElementById('h-cat').value;
  var cover = document.getElementById('h-cover').value.trim();
  var desc = document.getElementById('h-desc').value.trim();
  var addr = document.getElementById('h-addr').value.trim();
  if (!name || !cat || !cover || !desc || !addr) { toast('Fill all required fields', false); return; }
  load(true);
  var gal = getGalInputs('h-gal-list');
  var data = {
    name: name, category: cat, coverImage: cover, description: desc, address: addr,
    mapsLink: document.getElementById('h-maps').value.trim(),
    coordinates: document.getElementById('h-coords').value.trim(),
    phone: document.getElementById('h-phone').value.trim(),
    email: document.getElementById('h-email').value.trim(),
    website: document.getElementById('h-web').value.trim(),
    checkInTime: document.getElementById('h-checkin').value.trim(),
    checkOutTime: document.getElementById('h-checkout').value.trim(),
    rating: document.getElementById('h-rating').value.trim(),
    gallery: gal,
    featured: document.getElementById('h-feat').classList.contains('on')
  };
  var editId = document.getElementById('h-edit').value;
  try {
    if (editId) {
      await api('PUT', '/hotels/' + editId, data);
    } else {
      await api('POST', '/hotels', data);
    }
    load(false);
    closeHotelModal();
    toast(editId ? 'Hotel updated!' : 'Hotel created!');
    loadAllData();
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

function editHotel(id) {
  var h = cachedHotels[id];
  if (!h) return;
  document.getElementById('h-edit').value = id;
  document.getElementById('h-name').value = h.name || '';
  document.getElementById('h-cat').value = h.category || '';
  document.getElementById('h-rating').value = h.rating || '';
  document.getElementById('h-cover').value = h.coverImage || '';
  document.getElementById('h-desc').value = h.description || '';
  document.getElementById('h-addr').value = h.address || '';
  document.getElementById('h-maps').value = h.mapsLink || '';
  document.getElementById('h-coords').value = h.coordinates || '';
  document.getElementById('h-phone').value = h.phone || '';
  document.getElementById('h-email').value = h.email || '';
  document.getElementById('h-web').value = h.website || '';
  document.getElementById('h-checkin').value = h.checkInTime || '';
  document.getElementById('h-checkout').value = h.checkOutTime || '';
  renderTagChips('h-cat');
  setGalInputs('h-gal-list', h.gallery || []);
  document.getElementById('h-feat').classList.toggle('on', !!h.featured);
  document.getElementById('hotelModalTitle').textContent = 'Edit Hotel';
  document.getElementById('h-save').textContent = 'Update Hotel';
  document.getElementById('hotelModal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function delHotel(id) {
  var h = cachedHotels[id];
  showDel('Delete "' + (h&&h.name||'this') + '"?', async function(){
    load(true);
    try {
      await api('DELETE', '/hotels/' + id);
      load(false);
      toast('Deleted');
      loadAllData();
    } catch (e) {
      load(false);
      toast(e.message, false);
    }
  });
}

function resetHotel() {
  document.getElementById('hotelForm').reset();
  document.getElementById('h-edit').value = '';
  document.getElementById('h-cat').value = '';
  document.getElementById('h-feat').classList.remove('on');
  document.getElementById('h-save').textContent = 'Save Hotel';
  document.getElementById('h-gal-list').innerHTML = '<div class="img-add-row"><input placeholder="Image URL 1" class="gal-input"><button type="button" class="btn-icon" onclick="this.parentElement.remove()">&times;</button></div>';
  var catInput = document.getElementById('h-cat-input');
  var wrap = document.getElementById('h-cat-wrap');
  wrap.innerHTML = '';
  wrap.appendChild(catInput);
  catInput.value = '';
}

function prevHotel(id) {
  var h = cachedHotels[id];
  if (h) toast(h.name + (h.rating ? ' \u00B7 ' + h.rating : '') + (h.featured ? ' \u2605' : ''), true);
}
