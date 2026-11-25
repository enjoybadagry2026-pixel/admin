// �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"� TOUR PACKAGES + ITINERARY �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

var cachedTours = null;
var toursLoaded = false;
var trRequestSeq = 0;
var trQuerySig = '';
var TOUR_ITEM_TYPES = ['destination', 'activity', 'meal', 'transport', 'accommodation', 'free_time', 'other'];

async function loadToursPanel() {
  if (!bulkStore.tr) {
    bulkRegister('tr', 'tours', function() { toursLoaded = false; loadToursPanel(); },
      { category: false, tags: false });
  }
  var q = ((document.getElementById('tr-search') || {}).value || '').trim();
  var status = ((document.getElementById('tr-status-filter') || {}).value || '');
  var sig = [q, status].join('|');
  var state = kitList('tours', { limit: 24, sort: 'created', dir: 'desc' });
  if (sig !== trQuerySig) { state.page = 1; trQuerySig = sig; }
  var request = ++trRequestSeq;
  try {
    load(true);
    var res = await api('GET', '/tours' + kitQuery(kitParams('tours', { search: q, status: status })));
    if (request !== trRequestSeq) return;
    var data = res.data || {};
    cachedTours = Array.isArray(data.tours) ? data.tours : [];
    if (Array.isArray(data.itemTypes) && data.itemTypes.length) TOUR_ITEM_TYPES = data.itemTypes;
    state.pagination = res.pagination || { page: 1, limit: cachedTours.length || state.limit, total: cachedTours.length, totalPages: 1 };
    toursLoaded = true;
    load(false);
  } catch (e) {
    if (request !== trRequestSeq) return;
    load(false);
    toast('Could not load packages. ' + (e.message || 'Check your connection.'), false);
    return;
  }
  renderTours();
}

function renderTours() {
  var list = document.getElementById('tr-list');
  if (!list) return;
  var q = ((document.getElementById('tr-search') || {}).value || '').trim();
  var statusF = ((document.getElementById('tr-status-filter') || {}).value || '');
  var visible = cachedTours || [];

  bulkVisible['tr'] = visible.map(function(t) { return t.id; });

  var html = visible.map(function(t) {
    var chips = [];
    if (t.durationLabel || t.durationDays) {
       chips.push('<span class="cms-card-chip">\uD83D\uDD52 ' + esc(t.durationLabel || (t.durationDays + ' day(s)')) + '</span>');
    }
    if (t.maxGroupSize) chips.push('<span class="cms-card-chip">\uD83D\uDC65 max ' + t.maxGroupSize + '</span>');
    return '<div class="cms-card" onclick="editTour(\'' + t.id + '\')">' +
      '<div class="cms-card-check" onclick="event.stopPropagation()">' +
        '<input type="checkbox" class="bulk-check" ' + (bulkStore.tr && bulkStore.tr.selected[t.id] ? 'checked' : '') +
        ' onchange="bulkToggle(\'tr\',\'' + t.id + '\',this.checked)">' +
      '</div>' +
      '<div class="cms-card-img-wrap">' +
        (t.coverImage
          ? '<img class="cms-card-img" src="' + esc(t.coverImage) + '" onerror="this.outerHTML=\'<div class=cms-card-img-fallback>\uD83D\uDDFA\uFE0F</div>\'">'
          : '<div class="cms-card-img-fallback">\uD83D\uDDFA\uFE0F</div>') +
        '<div class="cms-card-overlay"></div>' +
        (chips.length ? '<div class="cms-card-chips">' + chips.join('') + '</div>' : '') +
      '</div>' +
      '<div class="cms-card-body">' +
        '<div class="cms-card-name">' + esc(t.name) + '</div>' +
        '<div class="cms-card-meta">' +
          '<span class="cms-price">' + fmtNaira(t.price) + '</span>' +
           '<span class="cms-card-meta-item">' + (t.availability !== false ? '\u25CF Accepting bookings' : '\u25CF Bookings paused') + '</span>' +
        '</div>' +
        '<div class="cms-card-badges">' + cmsStatusBadge(t) + '</div>' +
        '<div class="cms-card-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editTour(\'' + t.id + '\')">Edit</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openItinModal(\'' + t.id + '\')">Itinerary</button>' +
          '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();delTour(\'' + t.id + '\')">Delete</button>' +
          '<select class="cms-quick-status" onclick="event.stopPropagation()" onchange="quickStatus(\'tours\',\'' + t.id + '\',this.value)">' +
            '<option value="draft" ' + (t.status === 'draft' ? 'selected' : '') + '>Draft</option>' +
            '<option value="published" ' + (t.status === 'published' ? 'selected' : '') + '>Published</option>' +
            '<option value="archived" ' + (t.status === 'archived' ? 'selected' : '') + '>Archived</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  list.innerHTML = html || '<div class="cms-empty"><div class="cms-empty-icon">\uD83D\uDDFA\uFE0F</div><div class="cms-empty-title">No tour packages found</div><div class="cms-empty-text">' +
    (q || statusF ? 'Try adjusting the filters.' : 'Create your first package to get started.') + '</div>' +
    '<button class="btn btn-accent" onclick="openTourModal()">+ Create Package</button></div>';

  var state = kitList('tours');
  document.getElementById('tr-count').textContent = state.pagination ? state.pagination.total + ' package' + (state.pagination.total !== 1 ? 's' : '') : visible.length + ' packages';
  kitRenderPager('tr-pagination', 'tours', state.pagination, loadToursPanel);
  bulkRender('tr');
}

// MODAL CONTROLS

function openTourModal(editId) {
  resetTour();
  if (editId) {
    var t = (cachedTours || []).filter(function(x) { return x.id === editId; })[0];
    if (!t) return;
    document.getElementById('tr-edit').value = editId;
    document.getElementById('tr-name').value = t.name || '';
    document.getElementById('tr-price').value = t.price || '';
    document.getElementById('tr-days').value = t.durationDays || '';
    document.getElementById('tr-duration-label').value = t.durationLabel || '';
    document.getElementById('tr-group').value = t.maxGroupSize || '';
    document.getElementById('tr-status').value = t.status || 'draft';
    document.getElementById('tr-avail').classList.toggle('on', t.availability !== false);
    cmsCoverSet('tr-cover', t.coverImage || '');
    cmsGallerySet('tr-gal', t.gallery || []);
    rteSet('tr-desc', t.descriptionHtml || '');
    document.getElementById('tr-feat').classList.toggle('on', !!t.featured);
    cmsFeatToggle('tr');
    document.getElementById('tr-feat-from').value = cmsToLocalInput(t.featuredFrom);
    document.getElementById('tr-feat-until').value = cmsToLocalInput(t.featuredUntil);
    cmsToggleField('tr-itin-hint', true);
    document.getElementById('tourModalTitle').textContent = 'Edit Tour Package';
    document.getElementById('tr-save').textContent = 'Update Package';
  }
  cmsGalleryInit('tr-gal', 'tr-cover');
  document.getElementById('tourModal').classList.add('on');
  document.body.style.overflow = 'hidden';
  setTimeout(function() { var n = document.getElementById('tr-name'); if (n) n.focus(); }, 150);
}

function closeTourModal() {
  document.getElementById('tourModal').classList.remove('on');
  document.body.style.overflow = '';
}

function editTour(id) { openTourModal(id); }

async function saveTour() { if (!hasPerm('content.tours.write')) { toast('You do not have permission to manage tours.', false); return; }
  var name = document.getElementById('tr-name').value.trim();
  var price = document.getElementById('tr-price').value;
  var cover = document.getElementById('tr-cover').value.trim();
  if (!name || price === '' || !cover) { toast('Fill all required fields (name, price, cover)', false); return; }

  var data = {
    name: name,
    price: Number(price),
    durationDays: document.getElementById('tr-days').value ? Number(document.getElementById('tr-days').value) : null,
    durationLabel: document.getElementById('tr-duration-label').value.trim(),
    maxGroupSize: document.getElementById('tr-group').value ? Number(document.getElementById('tr-group').value) : null,
    coverImage: cover,
    descriptionHtml: rteGet('tr-desc'),
    gallery: cmsGalleryGet('tr-gal'),
    availability: document.getElementById('tr-avail').classList.contains('on'),
    status: document.getElementById('tr-status').value,
    featured: document.getElementById('tr-feat').classList.contains('on')
  };
  if (data.featured) {
    data.featuredFrom = document.getElementById('tr-feat-from').value || null;
    data.featuredUntil = document.getElementById('tr-feat-until').value || null;
  } else {
    data.featuredFrom = null;
    data.featuredUntil = null;
  }

  var editId = document.getElementById('tr-edit').value;
  try {
    load(true);
    if (editId) await api('PUT', '/tours/' + editId, data);
    else await api('POST', '/tours', data);
    load(false);
    toast(editId ? 'Package updated!' : 'Package created!');
    closeTourModal();
    toursLoaded = false;
    loadToursPanel();
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

function delTour(id) {
  var t = (cachedTours || []).filter(function(x) { return x.id === id; })[0];
  showDel('Delete "' + (t && t.name || 'this package') + '"? Its itinerary will be removed too.', async function() {
    try {
      load(true);
      await api('DELETE', '/tours/' + id);
      load(false);
      toast('Deleted');
      toursLoaded = false;
      loadToursPanel();
    } catch (e) {
      load(false);
      toast(e.message, false);
    }
  });
}

function resetTour() {
  document.getElementById('tourForm').reset();
  document.getElementById('tr-edit').value = '';
  document.getElementById('tr-status').value = 'published';
  document.getElementById('tr-avail').classList.add('on');
  document.getElementById('tr-feat').classList.remove('on');
  cmsFeatToggle('tr');
  document.getElementById('tr-save').textContent = 'Save Package';
  document.getElementById('tourModalTitle').textContent = 'Create Tour Package';
  cmsToggleField('tr-itin-hint', false);
  cmsCoverSet('tr-cover', '');
  cmsGallerySet('tr-gal', []);
  rteClear('tr-desc');
}

document.addEventListener('click', function(e) {
  var bg = document.getElementById('tourModal');
  if (bg && e.target === bg) closeTourModal();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var bg = document.getElementById('tourModal');
    if (bg && bg.classList.contains('on')) closeTourModal();
  }
});

// ITINERARY BUILDER

var itinTourId = null;

async function openItinModal(tourId) {
  var id = tourId || document.getElementById('tr-edit').value;
  if (!id) { toast('Save the package first, then add the itinerary', false); return; }
  itinTourId = id;

  var t = (cachedTours || []).filter(function(x) { return x.id === id; })[0];
  document.getElementById('itin-tour-name').textContent = (t && t.name) || '';

  var days = [];
  try {
    load(true);
    var res = await api('GET', '/tours/' + id);
    load(false);
    days = res.data && res.data.tour && Array.isArray(res.data.tour.itinerary) ? res.data.tour.itinerary : [];
  } catch (e) {
    load(false);
    toast('Failed to load itinerary: ' + e.message, false);
    return;
  }

  renderItinerary(days);
  document.getElementById('itinModal').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeItinModal() {
  document.getElementById('itinModal').classList.remove('on');
  document.body.style.overflow = '';
}

function itinDestOptions(selected) {
  var opts = '<option value="">No destination link</option>';
  (cachedPlacesArr || []).forEach(function(p) {
    opts += '<option value="' + esc(p.id) + '"' + (selected === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
  });
  return opts;
}

function itinTypeOptions(selected) {
  return TOUR_ITEM_TYPES.map(function(ty) {
    return '<option value="' + ty + '"' + (selected === ty ? ' selected' : '') + '>' +
      ty.charAt(0).toUpperCase() + ty.slice(1).replace('_', ' ') + '</option>';
  }).join('');
}

function itinItemHtml(dayIdx, item) {
  item = item || {};
  return '<div class="itin-item">' +
    '<div class="itin-item-row">' +
      '<input type="text" class="itin-item-title" placeholder="Item title *" value="' + esc(item.title || '') + '">' +
      '<select class="itin-select itin-item-type">' + itinTypeOptions(item.itemType || 'activity') + '</select>' +
      '<input type="text" class="itin-item-time" placeholder="e.g. 10:00" value="' + esc(item.timeLabel || '') + '">' +
      '<button type="button" class="itin-del" title="Remove item" onclick="this.closest(\'.itin-item\').remove()">&times;</button>' +
    '</div>' +
    '<div class="itin-item-row2">' +
      '<select class="itin-select itin-item-dest">' + itinDestOptions(item.destinationId || '') + '</select>' +
      '<input type="text" class="itin-item-desc" placeholder="Short description (optional)" value="' + esc(item.description || '') + '">' +
    '</div>' +
  '</div>';
}

function itinDayHtml(day, dayIdx) {
  day = day || {};
  var num = day.dayNumber || (dayIdx + 1);
  var items = (day.items || []).map(function(it) { return itinItemHtml(dayIdx, it); }).join('');
  return '<div class="itin-day" data-day="' + num + '">' +
    '<div class="itin-day-head">' +
      '<span class="itin-day-num">Day ' + num + '</span>' +
      '<input type="text" class="itin-day-title" placeholder="Day title" value="' + esc(day.title || '') + '">' +
      '<button type="button" class="itin-del" title="Remove day" onclick="this.closest(\'.itin-day\').remove();itinRenumber()">&times;</button>' +
    '</div>' +
    '<textarea class="itin-day-desc" placeholder="Day summary (optional)">' + esc(day.description || '') + '</textarea>' +
    '<div class="itin-items">' + items + '</div>' +
    '<button type="button" class="btn btn-ghost btn-sm itin-add-item" onclick="itinAddItem(this)">+ Add item</button>' +
  '</div>';
}

function renderItinerary(days) {
  var host = document.getElementById('itin-days');
  host.innerHTML = days.map(function(d, i) { return itinDayHtml(d, i); }).join('') ||
    '<div class="tax-empty">No itinerary yet — add the first day below.</div>';
  if (!days.length) itinAddDay();
}

function itinAddDay() {
  var host = document.getElementById('itin-days');
  var empty = host.querySelector('.tax-empty');
  if (empty) empty.remove();
  var idx = host.querySelectorAll('.itin-day').length;
  host.insertAdjacentHTML('beforeend', itinDayHtml(null, idx));
  itinRenumber();
}

function itinRenumber() {
  document.querySelectorAll('#itin-days .itin-day').forEach(function(d, i) {
    d.setAttribute('data-day', i + 1);
    var badge = d.querySelector('.itin-day-num');
    if (badge) badge.textContent = 'Day ' + (i + 1);
  });
}

function itinAddItem(btn) {
  var day = btn.closest('.itin-day');
  var items = day.querySelector('.itin-items');
  items.insertAdjacentHTML('beforeend', itinItemHtml(0, null));
}

async function saveItinerary() {
  if (!itinTourId) return;
  var dayEls = document.querySelectorAll('#itin-days .itin-day');
  if (!dayEls.length) { toast('Add at least one day', false); return; }

  var itinerary = [];
  var bad = null;
  dayEls.forEach(function(d, i) {
    var day = {
      dayNumber: i + 1,
      title: d.querySelector('.itin-day-title').value.trim() || ('Day ' + (i + 1)),
      description: d.querySelector('.itin-day-desc').value.trim(),
      items: []
    };
    d.querySelectorAll('.itin-item').forEach(function(el) {
      var title = el.querySelector('.itin-item-title').value.trim();
      if (!title) { if (!bad) bad = 'Every itinerary item needs a title'; return; }
      day.items.push({
        itemType: el.querySelector('.itin-item-type').value,
        title: title,
        timeLabel: el.querySelector('.itin-item-time').value.trim(),
        destinationId: el.querySelector('.itin-item-dest').value || null,
        description: el.querySelector('.itin-item-desc').value.trim()
      });
    });
    itinerary.push(day);
  });

  if (bad) { toast(bad, false); return; }

  try {
    load(true);
    var res = await api('PUT', '/tours/' + itinTourId + '/itinerary', { itinerary: itinerary });
    load(false);
    toast(res.message || 'Itinerary saved');
    closeItinModal();
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

document.addEventListener('click', function(e) {
  var bg = document.getElementById('itinModal');
  if (bg && e.target === bg) closeItinModal();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var bg = document.getElementById('itinModal');
    if (bg && bg.classList.contains('on')) closeItinModal();
  }
});
