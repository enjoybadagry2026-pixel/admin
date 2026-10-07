// ═══════════════ BANNERS / CAROUSEL ═══════════════

var cachedBanners = null;
var bnLoaded = false;
var bnOrderDirty = false;
var bnDragFrom = null;

async function loadBannersPanel() {
  if (!bnLoaded || !cachedBanners) {
    try {
      load(true);
      var res = await api('GET', '/banners');
      cachedBanners = res.data.banners || [];
      bnLoaded = true;
      bnOrderDirty = false;
      load(false);
    } catch (e) {
      load(false);
      toast('Failed to load banners: ' + e.message, false);
      return;
    }
  }
  renderBanners();
}

function renderBanners() {
  var list = document.getElementById('bn-list');
  if (!list) return;
  var saveBtn = document.getElementById('bn-order-save');
  if (saveBtn) saveBtn.style.display = bnOrderDirty ? '' : 'none';

  var html = (cachedBanners || []).map(function(b, i) {
    var badges = '<span class="bn-badge">' + esc(b.placement || 'home_carousel') + '</span>';
    badges += b.active
      ? '<span class="bn-badge on">Active</span>'
      : '<span class="bn-badge off">Inactive</span>';
    if (b.live) badges += '<span class="bn-badge live">● Live now</span>';
    var cta = b.ctaType && b.ctaType !== 'none'
      ? '<span class="cms-card-meta-item">Button: ' + esc(b.ctaLabel || b.ctaType) + '</span>' : '';
    var window_ = '';
    if (b.startsAt) window_ = 'From ' + fmtDate(b.startsAt);
    if (b.endsAt) window_ += (window_ ? ' · ' : '') + 'Until ' + fmtDate(b.endsAt);

    return '<div class="bn-card" draggable="true" data-i="' + i + '">' +
      '<div class="bn-order">' +
        '<button type="button" class="bn-move" title="Move up" ' + (i === 0 ? 'disabled' : '') +
          ' onclick="event.stopPropagation();bnMove(' + i + ',-1)">&#9650;</button>' +
        '<button type="button" class="bn-move" title="Move down" ' + (i === cachedBanners.length - 1 ? 'disabled' : '') +
          ' onclick="event.stopPropagation();bnMove(' + i + ',1)">&#9660;</button>' +
      '</div>' +
      (b.imageUrl
        ? '<img class="bn-img" src="' + esc(b.imageUrl) + '" alt="" onerror="this.style.display=\'none\'">'
        : '<div class="cms-card-img-fallback">🖼️</div>') +
      '<div class="bn-info">' +
        '<div class="bn-title">' + esc(b.title) + '</div>' +
        (b.subtitle ? '<div class="bn-sub">' + esc(b.subtitle) + '</div>' : '') +
        '<div class="bn-badges">' + badges + '</div>' +
        '<div class="cms-card-meta">' + cta + (window_ ? '<span class="cms-card-meta-item">' + esc(window_) + '</span>' : '') + '</div>' +
        '<div class="bn-acts">' +
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editBanner(\'' + b.id + '\')">Edit</button>' +
          '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();delBanner(\'' + b.id + '\')">Delete</button>' +
          '<span class="cms-list-hint" style="margin-left:auto">Position ' + (i + 1) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  list.innerHTML = html || '<div class="cms-empty"><div class="cms-empty-icon">🖼️</div><div class="cms-empty-title">No banners yet</div><div class="cms-empty-text">Add a banner to populate the homepage carousel.</div>' +
    '<button class="btn btn-accent" onclick="openBannerModal()">+ Add Banner</button></div>';

  document.getElementById('bn-count').textContent = (cachedBanners || []).length + ' banner' +
    ((cachedBanners || []).length !== 1 ? 's' : '');

  bindBannerDnd(list);
}

function bindBannerDnd(list) {
  list.querySelectorAll('.bn-card').forEach(function(card) {
    card.addEventListener('dragstart', function(e) {
      bnDragFrom = parseInt(card.getAttribute('data-i'), 10);
      card.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', String(bnDragFrom)); } catch (err) {}
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', function() {
      card.classList.remove('dragging');
      list.querySelectorAll('.bn-card').forEach(function(c) { c.classList.remove('drag-over'); });
    });
    card.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', function() { card.classList.remove('drag-over'); });
    card.addEventListener('drop', function(e) {
      e.preventDefault();
      card.classList.remove('drag-over');
      var to = parseInt(card.getAttribute('data-i'), 10);
      if (bnDragFrom === null || isNaN(to) || bnDragFrom === to) return;
      var moved = cachedBanners.splice(bnDragFrom, 1)[0];
      cachedBanners.splice(to, 0, moved);
      bnDragFrom = null;
      bnOrderDirty = true;
      renderBanners();
    });
  });
}

function bnMove(i, dir) {
  var j = i + dir;
  if (!cachedBanners || j < 0 || j >= cachedBanners.length) return;
  var moved = cachedBanners.splice(i, 1)[0];
  cachedBanners.splice(j, 0, moved);
  bnOrderDirty = true;
  renderBanners();
}

async function saveBannerOrder() {
  if (!cachedBanners) return;
  var ids = cachedBanners.map(function(b) { return b.id; });
  try {
    load(true);
    await api('POST', '/banners/reorder', { ids: ids });
    load(false);
    bnOrderDirty = false;
    renderBanners();
    toast('Banner order saved');
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

// ═══════════════ MODAL CONTROLS ═══════════════

function openBannerModal(editId) {
  resetBanner();
  if (editId) {
    var b = (cachedBanners || []).filter(function(x) { return x.id === editId; })[0];
    if (!b) return;
    document.getElementById('bn-edit').value = editId;
    document.getElementById('bn-title').value = b.title || '';
    document.getElementById('bn-subtitle').value = b.subtitle || '';
    document.getElementById('bn-placement').value = b.placement || 'home_carousel';
    document.getElementById('bn-sort').value = b.sortOrder || 0;
    document.getElementById('bn-cta-type').value = b.ctaType || 'none';
    document.getElementById('bn-cta-label').value = b.ctaLabel || '';
    document.getElementById('bn-cta-value').value = b.ctaValue || '';
    cmsToggleField('bn-cta-value-row', (b.ctaType || 'none') !== 'none');
    document.getElementById('bn-starts').value = cmsToLocalInput(b.startsAt);
    document.getElementById('bn-ends').value = cmsToLocalInput(b.endsAt);
    document.getElementById('bn-active').classList.toggle('on', b.active !== false);
    cmsCoverSet('bn-img', b.imageUrl || '');
    document.getElementById('bannerModalTitle').textContent = 'Edit Banner';
    document.getElementById('bn-save').textContent = 'Update Banner';
  }
  document.getElementById('bannerModal').classList.add('on');
  document.body.style.overflow = 'hidden';
  setTimeout(function() { var t = document.getElementById('bn-title'); if (t) t.focus(); }, 150);
}

function closeBannerModal() {
  document.getElementById('bannerModal').classList.remove('on');
  document.body.style.overflow = '';
}

function editBanner(id) { openBannerModal(id); }

async function saveBanner() {
  var title = document.getElementById('bn-title').value.trim();
  var img = document.getElementById('bn-img').value.trim();
  if (!title || !img) { toast('Title and banner image are required', false); return; }

  var data = {
    title: title,
    subtitle: document.getElementById('bn-subtitle').value.trim(),
    imageUrl: img,
    placement: document.getElementById('bn-placement').value,
    sortOrder: Number(document.getElementById('bn-sort').value || 0),
    ctaType: document.getElementById('bn-cta-type').value,
    ctaLabel: document.getElementById('bn-cta-label').value.trim(),
    ctaValue: document.getElementById('bn-cta-value').value.trim(),
    startsAt: document.getElementById('bn-starts').value || null,
    endsAt: document.getElementById('bn-ends').value || null,
    active: document.getElementById('bn-active').classList.contains('on')
  };

  var editId = document.getElementById('bn-edit').value;
  try {
    load(true);
    if (editId) await api('PUT', '/banners/' + editId, data);
    else await api('POST', '/banners', data);
    load(false);
    toast(editId ? 'Banner updated!' : 'Banner added!');
    closeBannerModal();
    bnLoaded = false;
    loadBannersPanel();
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

function delBanner(id) {
  var b = (cachedBanners || []).filter(function(x) { return x.id === id; })[0];
  showDel('Delete banner "' + (b && b.title || 'this') + '"?', async function() {
    try {
      load(true);
      await api('DELETE', '/banners/' + id);
      load(false);
      toast('Deleted');
      bnLoaded = false;
      loadBannersPanel();
    } catch (e) {
      load(false);
      toast(e.message, false);
    }
  });
}

function resetBanner() {
  document.getElementById('bannerForm').reset();
  document.getElementById('bn-edit').value = '';
  document.getElementById('bn-placement').value = 'home_carousel';
  document.getElementById('bn-cta-type').value = 'none';
  cmsToggleField('bn-cta-value-row', false);
  document.getElementById('bn-active').classList.add('on');
  document.getElementById('bn-save').textContent = 'Save Banner';
  document.getElementById('bannerModalTitle').textContent = 'Add Banner';
  cmsCoverSet('bn-img', '');
}

document.addEventListener('click', function(e) {
  var bg = document.getElementById('bannerModal');
  if (bg && e.target === bg) closeBannerModal();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var bg = document.getElementById('bannerModal');
    if (bg && bg.classList.contains('on')) closeBannerModal();
  }
});
