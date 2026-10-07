// ═══════════════ EVENTS & FESTIVALS ═══════════════

var cachedEvents = null;
var evLoaded = false;

async function loadEventsPanel() {
  if (!bulkStore.ev) {
    bulkRegister('ev', 'events', function() { evLoaded = false; loadEventsPanel(); },
      { category: true, tags: true });
  }
  if (!evLoaded || !cachedEvents) {
    try {
      load(true);
      var res = await api('GET', '/events');
      cachedEvents = res.data.events || [];
      evLoaded = true;
      load(false);
    } catch (e) {
      load(false);
      toast('Failed to load events: ' + e.message, false);
      return;
    }
  }
  renderEvents();
}

function renderEvents() {
  var list = document.getElementById('ev-list');
  if (!list) return;
  var q = ((document.getElementById('ev-search') || {}).value || '').trim().toLowerCase();
  var statusF = ((document.getElementById('ev-status-filter') || {}).value || '');
  var scopeF = ((document.getElementById('ev-scope-filter') || {}).value || '');
  var now = Date.now();

  var visible = [];
  (cachedEvents || []).forEach(function(ev) {
    if (q && (ev.name || '').toLowerCase().indexOf(q) < 0 &&
        (ev.location || '').toLowerCase().indexOf(q) < 0 &&
        (ev.organizer || '').toLowerCase().indexOf(q) < 0 &&
        (ev.category || '').toLowerCase().indexOf(q) < 0) return;
    if (statusF && ev.status !== statusF) return;
    if (scopeF === 'upcoming' && ev.endAt && Date.parse(ev.endAt) < now) return;
    if (scopeF === 'past' && ev.endAt && Date.parse(ev.endAt) >= now) return;
    visible.push(ev);
  });

  bulkVisible['ev'] = visible.map(function(ev) { return ev.id; });

  var html = visible.map(function(ev) {
    var tags = (ev.tags || []).map(function(t) {
      return '<span class="tag">' + esc(t) + '</span>';
    }).join('');
    var price = ev.isFree ? '<span class="tag tag-avail">Free</span>'
      : (ev.ticketPrice ? '<span class="cms-price">' + fmtNaira(ev.ticketPrice) + '</span>' : '');
    var when = '';
    if (ev.startAt) {
      when = '<span class="cms-card-chip">' + esc(fmtDate(ev.startAt)) + '</span>';
      if (ev.endAt) when += '<span class="cms-card-chip">→ ' + esc(fmtDate(ev.endAt)) + '</span>';
    }
    return '<div class="cms-card" onclick="editEvent(\'' + ev.id + '\')">' +
      '<div class="cms-card-check" onclick="event.stopPropagation()">' +
        '<input type="checkbox" class="bulk-check" ' + (bulkStore.ev && bulkStore.ev.selected[ev.id] ? 'checked' : '') +
        ' onchange="bulkToggle(\'ev\',\'' + ev.id + '\',this.checked)">' +
      '</div>' +
      '<div class="cms-card-img-wrap">' +
        (ev.coverImage
          ? '<img class="cms-card-img" src="' + esc(ev.coverImage) + '" onerror="this.outerHTML=\'<div class=cms-card-img-fallback>🎉</div>\'">'
          : '<div class="cms-card-img-fallback">🎉</div>') +
        '<div class="cms-card-overlay"></div>' +
        (when ? '<div class="cms-card-chips">' + when + '</div>' : '') +
      '</div>' +
      '<div class="cms-card-body">' +
        '<div class="cms-card-name">' + esc(ev.name) + '</div>' +
        '<div class="cms-card-meta">' +
          (ev.category ? '<span class="cms-card-meta-item">' + esc(ev.category) + '</span>' : '') +
          (ev.location ? '<span class="cms-card-meta-item">' + esc(ev.location) + '</span>' : '') +
          price +
        '</div>' +
        '<div class="cms-card-badges">' + cmsStatusBadge(ev) + '</div>' +
        (tags ? '<div class="cms-card-tags">' + tags + '</div>' : '') +
        '<div class="cms-card-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editEvent(\'' + ev.id + '\')">Edit</button>' +
          '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();delEvent(\'' + ev.id + '\')">Delete</button>' +
          '<select class="cms-quick-status" onclick="event.stopPropagation()" onchange="quickStatus(\'events\',\'' + ev.id + '\',this.value)">' +
            '<option value="draft" ' + (ev.status === 'draft' ? 'selected' : '') + '>Draft</option>' +
            '<option value="published" ' + (ev.status === 'published' ? 'selected' : '') + '>Published</option>' +
            '<option value="archived" ' + (ev.status === 'archived' ? 'selected' : '') + '>Archived</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  list.innerHTML = html || '<div class="cms-empty"><div class="cms-empty-icon">🎉</div><div class="cms-empty-title">No events found</div><div class="cms-empty-text">' +
    (q || statusF || scopeF ? 'Try adjusting the filters.' : 'Create your first event or festival to get started.') + '</div>' +
    '<button class="btn btn-accent" onclick="openEventModal()">+ Create Event</button></div>';

  document.getElementById('ev-count').textContent = visible.length + ' event' + (visible.length !== 1 ? 's' : '');
  bulkRender('ev');
}

// ═══════════════ MODAL CONTROLS ═══════════════

function openEventModal(editId) {
  resetEvent();
  if (editId) {
    var ev = (cachedEvents || []).filter(function(e) { return e.id === editId; })[0];
    if (!ev) return;
    document.getElementById('ev-edit').value = editId;
    document.getElementById('ev-name').value = ev.name || '';
    document.getElementById('ev-start').value = cmsToLocalInput(ev.startAt);
    document.getElementById('ev-end').value = cmsToLocalInput(ev.endAt);
    document.getElementById('ev-cat').value = ev.category || '';
    document.getElementById('ev-tags').value = (ev.tags || []).join(', ');
    document.getElementById('ev-location').value = ev.location || '';
    document.getElementById('ev-address').value = ev.address || '';
    document.getElementById('ev-organizer').value = ev.organizer || '';
    document.getElementById('ev-phone').value = ev.contactPhone || '';
    document.getElementById('ev-email').value = ev.contactEmail || '';
    document.getElementById('ev-price').value = ev.ticketPrice || '';
    document.getElementById('ev-ticket-url').value = ev.ticketUrl || '';
    document.getElementById('ev-status').value = ev.status || 'draft';
    renderTagChips('ev-cat');
    renderTagChips('ev-tags');
    cmsCoverSet('ev-cover', ev.coverImage || '');
    cmsGallerySet('ev-gal', ev.gallery || []);
    rteSet('ev-desc', ev.descriptionHtml || '');
    var free = ev.isFree !== false;
    document.getElementById('ev-free').classList.toggle('on', free);
    evFreeToggle();
    document.getElementById('ev-feat').classList.toggle('on', !!ev.featured);
    cmsFeatToggle('ev');
    document.getElementById('ev-feat-from').value = cmsToLocalInput(ev.featuredFrom);
    document.getElementById('ev-feat-until').value = cmsToLocalInput(ev.featuredUntil);
    document.getElementById('eventModalTitle').textContent = 'Edit Event';
    document.getElementById('ev-save').textContent = 'Update Event';
  }
  cmsGalleryInit('ev-gal', 'ev-cover');
  document.getElementById('eventModal').classList.add('on');
  document.body.style.overflow = 'hidden';
  setTimeout(function() { var n = document.getElementById('ev-name'); if (n) n.focus(); }, 150);
}

function closeEventModal() {
  document.getElementById('eventModal').classList.remove('on');
  document.body.style.overflow = '';
}

function evFreeToggle() {
  var free = document.getElementById('ev-free').classList.contains('on');
  cmsToggleField('ev-price-row', !free);
  cmsToggleField('ev-ticketrow', !free);
}

function editEvent(id) { openEventModal(id); }

async function saveEvent() {
  var name = document.getElementById('ev-name').value.trim();
  var start = document.getElementById('ev-start').value;
  var end = document.getElementById('ev-end').value;
  var cover = document.getElementById('ev-cover').value.trim();
  if (!name || !start || !end || !cover) { toast('Fill all required fields (name, dates, cover)', false); return; }
  if (new Date(end) <= new Date(start)) { toast('End date/time must be after the start', false); return; }

  var isFree = document.getElementById('ev-free').classList.contains('on');
  var data = {
    name: name,
    startAt: start,
    endAt: end,
    category: document.getElementById('ev-cat').value.trim(),
    tags: document.getElementById('ev-tags').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
    coverImage: cover,
    descriptionHtml: rteGet('ev-desc'),
    location: document.getElementById('ev-location').value.trim(),
    address: document.getElementById('ev-address').value.trim(),
    organizer: document.getElementById('ev-organizer').value.trim(),
    contactPhone: document.getElementById('ev-phone').value.trim(),
    contactEmail: document.getElementById('ev-email').value.trim(),
    isFree: isFree,
    ticketPrice: isFree ? 0 : Number(document.getElementById('ev-price').value || 0),
    ticketUrl: isFree ? '' : document.getElementById('ev-ticket-url').value.trim(),
    gallery: cmsGalleryGet('ev-gal'),
    status: document.getElementById('ev-status').value,
    featured: document.getElementById('ev-feat').classList.contains('on')
  };
  if (data.featured) {
    data.featuredFrom = document.getElementById('ev-feat-from').value || null;
    data.featuredUntil = document.getElementById('ev-feat-until').value || null;
  } else {
    data.featuredFrom = null;
    data.featuredUntil = null;
  }

  var editId = document.getElementById('ev-edit').value;
  try {
    load(true);
    if (editId) await api('PUT', '/events/' + editId, data);
    else await api('POST', '/events', data);
    load(false);
    toast(editId ? 'Event updated!' : 'Event created!');
    closeEventModal();
    cmsLoadTaxonomy(true);
    evLoaded = false;
    loadEventsPanel();
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

function delEvent(id) {
  var ev = (cachedEvents || []).filter(function(e) { return e.id === id; })[0];
  showDel('Delete "' + (ev && ev.name || 'this event') + '"?', async function() {
    try {
      load(true);
      await api('DELETE', '/events/' + id);
      load(false);
      toast('Deleted');
      evLoaded = false;
      loadEventsPanel();
    } catch (e) {
      load(false);
      toast(e.message, false);
    }
  });
}

function resetEvent() {
  document.getElementById('eventForm').reset();
  document.getElementById('ev-edit').value = '';
  document.getElementById('ev-cat').value = '';
  document.getElementById('ev-tags').value = '';
  document.getElementById('ev-status').value = 'published';
  document.getElementById('ev-free').classList.add('on');
  evFreeToggle();
  document.getElementById('ev-feat').classList.remove('on');
  cmsFeatToggle('ev');
  document.getElementById('ev-save').textContent = 'Save Event';
  document.getElementById('eventModalTitle').textContent = 'Create Event';
  cmsCoverSet('ev-cover', '');
  cmsGallerySet('ev-gal', []);
  rteClear('ev-desc');
  ['ev-cat', 'ev-tags'].forEach(function(prefix) {
    var input = document.getElementById(prefix + '-input');
    var wrap = document.getElementById(prefix + '-wrap');
    if (input && wrap) {
      wrap.innerHTML = '';
      wrap.appendChild(input);
      input.value = '';
    }
  });
}

// Backdrop + Escape close
document.addEventListener('click', function(e) {
  var bg = document.getElementById('eventModal');
  if (bg && e.target === bg) closeEventModal();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var bg = document.getElementById('eventModal');
    if (bg && bg.classList.contains('on')) closeEventModal();
  }
});
