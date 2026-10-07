// ═══════════════ CMS SHARED TOOLKIT ═══════════════
// Uploads, drag-and-drop galleries, image cropping, rich text editor,
// taxonomy suggestions, publishing helpers and bulk actions.
// Loaded before the content module scripts.

// ─────────────── Taxonomy master (categories + tags) ───────────────

var cmsTaxonomy = null;

async function cmsLoadTaxonomy(force) {
  if (cmsTaxonomy && !force) return cmsTaxonomy;
  try {
    var cats = await api('GET', '/categories');
    var tgs = await api('GET', '/tags');
    cmsTaxonomy = {
      categories: (cats.data && cats.data.categories || []).map(function(c) { return c.name; }),
      tags: (tgs.data && tgs.data.tags || []).map(function(t) { return t.name; }),
      categoryRecords: (cats.data && cats.data.categories) || [],
      tagRecords: (tgs.data && tgs.data.tags) || []
    };
  } catch (e) {
    cmsTaxonomy = cmsTaxonomy || { categories: [], tags: [], categoryRecords: [], tagRecords: [] };
  }
  return cmsTaxonomy;
}

// Suggestion dropdown under a chip input (prefix = hidden input id).
function cmsSuggest(prefix, source) {
  var wrap = document.getElementById(prefix + '-wrap');
  if (!wrap) return;
  var box = document.getElementById(prefix + '-sug');
  if (!box) {
    box = document.createElement('div');
    box.className = 'cms-sug';
    box.id = prefix + '-sug';
    wrap.parentElement.appendChild(box);
  }
  var input = wrap.querySelector('input');
  var q = (input && input.value || '').trim().toLowerCase();
  var hidden = document.getElementById(prefix);
  var picked = hidden && hidden.value ? hidden.value.split(',').map(function(s) { return s.trim().toLowerCase(); }) : [];
  var list = (source === 'tags' && cmsTaxonomy) ? cmsTaxonomy.tags : (cmsTaxonomy ? cmsTaxonomy.categories : []);
  var matches = list.filter(function(n) {
    return picked.indexOf(n.toLowerCase()) === -1 && (!q || n.toLowerCase().indexOf(q) >= 0);
  }).slice(0, 8);
  if (!matches.length) { box.style.display = 'none'; return; }
  box.innerHTML = '';
  matches.forEach(function(n) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cms-sug-item';
    btn.textContent = n;
    btn.addEventListener('mousedown', function(e) { e.preventDefault(); });
    btn.addEventListener('click', function() { cmsSuggestPick(prefix, n); });
    box.appendChild(btn);
  });
  box.style.display = 'block';
}

function cmsSuggestPick(prefix, name) {
  var hidden = document.getElementById(prefix);
  var arr = hidden.value ? hidden.value.split(',').filter(Boolean) : [];
  if (arr.indexOf(name) >= 0) { toast('Already added', false); return; }
  arr.push(name);
  hidden.value = arr.join(',');
  renderTagChips(prefix);
  var box = document.getElementById(prefix + '-sug');
  if (box) box.style.display = 'none';
}

document.addEventListener('click', function(e) {
  document.querySelectorAll('.cms-sug').forEach(function(box) {
    if (!box.contains(e.target)) box.style.display = 'none';
  });
});

// ─────────────── Status / publishing helpers ───────────────

function cmsStatusBadge(item) {
  var status = item.status || 'published';
  var label = status.charAt(0).toUpperCase() + status.slice(1);
  var cls = status === 'published' ? 'tag-avail' : status === 'draft' ? 'tag-pending' : 'tag-no';
  var html = '<span class="cms-badge ' + cls + '">' + label + '</span>';
  if (item.featuredActive || (item.featured && status === 'published' && !item.featuredFrom)) {
    html += '<span class="cms-badge tag-feat">★ Featured</span>';
  } else if (item.featured && item.featuredFrom && !item.featuredActive) {
    html += '<span class="cms-badge tag-pending">★ Scheduled</span>';
  }
  return html;
}

function cmsStatusSelect(id, selected) {
  var opts = [
    ['draft', 'Draft'],
    ['published', 'Published'],
    ['archived', 'Archived']
  ];
  return '<select id="' + id + '">' + opts.map(function(o) {
    return '<option value="' + o[0] + '"' + (selected === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
  }).join('') + '</select>';
}

function cmsToLocalInput(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// datetime-local inputs carry local wall time ("2026-10-05T14:30") with no
// offset; the backend stores timestamptz, so convert to a real ISO instant.
function cmsFromLocalInput(v) {
  if (!v) return null;
  var d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ─────────────── Upload (XHR with progress) ───────────────

function cmsUploadFiles(files, onProgress) {
  return new Promise(function(resolve, reject) {
    if (!files || !files.length) { reject(new Error('No files selected')); return; }
    var fd = new FormData();
    for (var i = 0; i < files.length; i++) fd.append('images', files[i]);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/media');
    var token = localStorage.getItem('admin_token');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = function() {
      var json = null;
      try { json = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status === 401) { doLogout(); reject(new Error('Session expired')); return; }
      if (!json || !json.success) {
        reject(new Error((json && json.message) || 'Upload failed (' + xhr.status + ')'));
        return;
      }
      resolve((json.data && json.data.media) || []);
    };
    xhr.onerror = function() { reject(new Error('Network error during upload')); };
    xhr.send(fd);
  });
}

function cmsPickFiles(multiple) {
  return new Promise(function(resolve) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    if (multiple) input.multiple = true;
    input.onchange = function() { resolve(Array.prototype.slice.call(input.files || [])); };
    input.click();
  });
}

// ─────────────── Cover image widget ───────────────
// Requires markup: <input type="hidden" id="X"> +
// <div class="cms-cover-preview" id="X-preview"></div>

function cmsCoverSync(hiddenId) {
  var input = document.getElementById(hiddenId);
  var prev = document.getElementById(hiddenId + '-preview');
  if (!input || !prev) return;
  var url = input.value;
  if (url) {
    prev.innerHTML = '<img src="' + esc(url) + '" alt="Cover preview" onerror="this.style.opacity=.35">';
    prev.classList.add('has-img');
  } else {
    prev.innerHTML = '<span class="cms-cover-empty">No image selected</span>';
    prev.classList.remove('has-img');
  }
}

function cmsCoverSet(hiddenId, url) {
  var input = document.getElementById(hiddenId);
  if (!input) return;
  input.value = url || '';
  cmsCoverSync(hiddenId);
}

function cmsCoverClear(hiddenId) {
  cmsCoverSet(hiddenId, '');
}

async function cmsCoverUpload(hiddenId, progressEl) {
  try {
    var files = await cmsPickFiles(false);
    if (!files.length) return null;
    var bar = progressEl ? document.getElementById(progressEl) : null;
    if (bar) { bar.style.display = 'block'; bar.firstElementChild.style.width = '5%'; }
    var media = await cmsUploadFiles(files, function(pct) {
      if (bar) bar.firstElementChild.style.width = pct + '%';
    });
    if (bar) { bar.firstElementChild.style.width = '100%'; setTimeout(function() { bar.style.display = 'none'; }, 400); }
    cmsCoverSet(hiddenId, media[0].url);
    return media[0].url;
  } catch (e) {
    toast('Upload failed: ' + e.message, false);
    return null;
  }
}

function cmsCoverFromUrl(hiddenId, value) {
  var v = (value || '').trim();
  if (!/^https?:\/\/\S+$/i.test(v)) { toast('Enter a valid http(s) image URL', false); return; }
  cmsCoverSet(hiddenId, v);
}

function cmsCoverUrl(hiddenId) {
  var input = document.getElementById(hiddenId);
  var v = prompt('Paste the image URL (https://…):', input && input.value ? input.value : '');
  if (v === null) return;
  cmsCoverFromUrl(hiddenId, v);
}

function cmsToggleField(id, show) {
  var el = document.getElementById(id);
  if (el) el.style.display = show ? '' : 'none';
}

function cmsFeatToggle(prefix) {
  var tgl = document.getElementById(prefix + '-feat');
  cmsToggleField(prefix + '-sched', !!(tgl && tgl.classList.contains('on')));
}

function cmsCoverCrop(hiddenId) {
  var input = document.getElementById(hiddenId);
  if (!input || !input.value) { toast('Upload or add an image first', false); return; }
  cmsOpenCrop(input.value, function(url) { cmsCoverSet(hiddenId, url); });
}

// ─────────────── Gallery widget (drag & drop, crop, cover) ───────────────

var cmsGalleries = {};

function cmsGalleryState(listId) {
  if (!cmsGalleries[listId]) cmsGalleries[listId] = { urls: [], coverId: null };
  return cmsGalleries[listId];
}

function cmsGalleryInit(listId, coverId) {
  var el = document.getElementById(listId);
  if (!el) return;
  var st = cmsGalleryState(listId);
  st.coverId = coverId || el.getAttribute('data-cover') || null;
  el.classList.add('cms-gallery');
  cmsGalleryRender(listId);
}

function cmsGalleryGet(listId) {
  return (cmsGalleries[listId] ? cmsGalleries[listId].urls : []) || [];
}

function cmsGallerySet(listId, urls) {
  var st = cmsGalleryState(listId);
  st.urls = (urls || []).filter(function(u) { return typeof u === 'string' && u; });
  cmsGalleryRender(listId);
}

function cmsGalleryRender(listId) {
  var el = document.getElementById(listId);
  if (!el) return;
  var st = cmsGalleryState(listId);
  var coverUrl = '';
  if (st.coverId) {
    var coverInput = document.getElementById(st.coverId);
    coverUrl = coverInput ? coverInput.value : '';
  }

  var html = st.urls.map(function(url, i) {
    var isCover = coverUrl && url === coverUrl;
    return '' +
      '<div class="cms-gal-tile' + (isCover ? ' is-cover' : '') + '" draggable="true" data-i="' + i + '">' +
        '<img src="' + esc(url) + '" alt="" onerror="this.style.opacity=.3">' +
        (isCover ? '<span class="cms-gal-cover-mark">Cover</span>' : '') +
        '<div class="cms-gal-tools">' +
          '<button type="button" title="Drag to reorder" class="cms-gal-btn cms-gal-handle">⋮⋮</button>' +
          (st.coverId ? '<button type="button" title="Set as cover" class="cms-gal-btn" onclick="cmsGalCover(\'' + listId + '\',' + i + ')">★</button>' : '') +
          '<button type="button" title="Crop" class="cms-gal-btn" onclick="cmsGalCrop(\'' + listId + '\',' + i + ')">✂</button>' +
          '<button type="button" title="Replace" class="cms-gal-btn" onclick="cmsGalReplace(\'' + listId + '\',' + i + ')">⟳</button>' +
          '<button type="button" title="Remove" class="cms-gal-btn cms-gal-del" onclick="cmsGalRemove(\'' + listId + '\',' + i + ')">×</button>' +
        '</div>' +
        '<div class="cms-gal-idx">' + (i + 1) + '</div>' +
      '</div>';
  }).join('');

  if (!st.urls.length) {
    html = '<div class="cms-gal-empty">No gallery images yet — upload or add by URL</div>';
  }
  el.innerHTML = html;
  cmsGalleryBindDnd(el, listId);
}

function cmsGalleryBindDnd(el, listId) {
  var dragFrom = null;
  el.querySelectorAll('.cms-gal-tile').forEach(function(tile) {
    tile.addEventListener('dragstart', function(e) {
      dragFrom = parseInt(tile.getAttribute('data-i'), 10);
      tile.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (err) {}
      e.dataTransfer.effectAllowed = 'move';
    });
    tile.addEventListener('dragend', function() {
      tile.classList.remove('dragging');
      el.querySelectorAll('.cms-gal-tile').forEach(function(t) { t.classList.remove('drag-over'); });
    });
    tile.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tile.classList.add('drag-over');
    });
    tile.addEventListener('dragleave', function() { tile.classList.remove('drag-over'); });
    tile.addEventListener('drop', function(e) {
      e.preventDefault();
      tile.classList.remove('drag-over');
      var to = parseInt(tile.getAttribute('data-i'), 10);
      if (dragFrom === null || isNaN(to) || dragFrom === to) return;
      var st = cmsGalleryState(listId);
      var moved = st.urls.splice(dragFrom, 1)[0];
      st.urls.splice(to, 0, moved);
      dragFrom = null;
      cmsGalleryRender(listId);
    });
  });
}

async function cmsGalleryPick(listId) {
  try {
    var files = await cmsPickFiles(true);
    if (!files.length) return;
    var st = cmsGalleryState(listId);
    var media = await cmsUploadFiles(files, null);
    media.forEach(function(m) { st.urls.push(m.url); });
    cmsGalleryRender(listId);
    toast(media.length + ' image(s) added to gallery');
  } catch (e) {
    toast('Upload failed: ' + e.message, false);
  }
}

function cmsGalleryAddUrl(listId) {
  var url = prompt('Enter the image URL:');
  if (!url) return;
  url = url.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) { toast('Enter a valid http(s) image URL', false); return; }
  var st = cmsGalleryState(listId);
  st.urls.push(url);
  cmsGalleryRender(listId);
}

function cmsGalRemove(listId, i) {
  var st = cmsGalleryState(listId);
  st.urls.splice(i, 1);
  cmsGalleryRender(listId);
}

function cmsGalCover(listId, i) {
  var st = cmsGalleryState(listId);
  if (!st.coverId) return;
  cmsCoverSet(st.coverId, st.urls[i]);
  cmsGalleryRender(listId);
  toast('Cover image updated');
}

function cmsGalCrop(listId, i) {
  var st = cmsGalleryState(listId);
  var oldUrl = st.urls[i];
  cmsOpenCrop(oldUrl, function(url) {
    st.urls[i] = url;
    // Keep the cover in sync when the cropped tile was the cover image.
    if (st.coverId) {
      var coverInput = document.getElementById(st.coverId);
      if (coverInput && coverInput.value === oldUrl) {
        coverInput.value = url;
        cmsCoverSync(st.coverId);
      }
    }
    cmsGalleryRender(listId);
  });
}

async function cmsGalReplace(listId, i) {
  try {
    var files = await cmsPickFiles(false);
    if (!files.length) return;
    var media = await cmsUploadFiles(files, null);
    var st = cmsGalleryState(listId);
    if (st.coverId) {
      var coverInput = document.getElementById(st.coverId);
      if (coverInput && coverInput.value === st.urls[i]) coverInput.value = media[0].url;
    }
    st.urls[i] = media[0].url;
    cmsGalleryRender(listId);
    toast('Image replaced');
  } catch (e) {
    toast('Upload failed: ' + e.message, false);
  }
}

// ─────────────── Image cropper (shared modal) ───────────────

var cmsCropState = { url: null, done: null, natW: 0, natH: 0, box: null, ratio: 0 };

function cmsOpenCrop(url, onDone) {
  var modal = document.getElementById('cropModal');
  if (!modal) { toast('Crop modal missing', false); return; }
  cmsCropState.url = url;
  cmsCropState.done = onDone;
  cmsCropState.ratio = 0;

  var img = document.getElementById('cropImg');
  var stage = document.getElementById('cropStage');
  var box = document.getElementById('cropBox');
  box.style.display = 'none';

  img.onload = function() {
    cmsCropState.natW = img.naturalWidth;
    cmsCropState.natH = img.naturalHeight;
    var r = img.getBoundingClientRect();
    var sr = stage.getBoundingClientRect();
    var x = (r.width * 0.1), y = (r.height * 0.1);
    cmsCropState.box = { x: x, y: y, w: r.width - x * 2, h: r.height - y * 2, ox: r.left - sr.left, oy: r.top - sr.top, dw: r.width, dh: r.height };
    cmsCropBoxPaint();
    box.style.display = 'block';
    document.getElementById('cropDims').textContent = cmsCropState.natW + ' × ' + cmsCropState.natH + ' px';
  };
  img.src = url;
  modal.classList.add('on');
}

function cmsCropBoxPaint() {
  var b = cmsCropState.box;
  var box = document.getElementById('cropBox');
  if (!b) return;
  box.style.left = (b.ox + b.x) + 'px';
  box.style.top = (b.oy + b.y) + 'px';
  box.style.width = b.w + 'px';
  box.style.height = b.h + 'px';
}

function cmsCloseCrop() {
  var modal = document.getElementById('cropModal');
  if (modal) modal.classList.remove('on');
  cmsCropState.done = null;
}

function cmsCropAspect(v) {
  cmsCropState.ratio = v === 'free' ? 0 : (v === '1:1' ? 1 : v === '4:3' ? 4 / 3 : v === '16:9' ? 16 / 9 : 0);
  if (cmsCropState.ratio && cmsCropState.box) {
    var b = cmsCropState.box;
    b.h = b.w / cmsCropState.ratio;
    if (b.y + b.h > b.dh) { b.h = b.dh - b.y; b.w = b.h * cmsCropState.ratio; }
    cmsCropBoxPaint();
  }
}

function cmsCropInitDrag() {
  var stage = document.getElementById('cropStage');
  var box = document.getElementById('cropBox');
  if (!stage || !box) return;
  var mode = null, sx = 0, sy = 0, start = null;

  function down(e, m) {
    mode = m;
    var pt = e.touches ? e.touches[0] : e;
    sx = pt.clientX; sy = pt.clientY;
    start = Object.assign({}, cmsCropState.box);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    e.preventDefault(); e.stopPropagation();
  }
  function move(e) {
    if (!mode) return;
    var pt = e.touches ? e.touches[0] : e;
    var dx = pt.clientX - sx, dy = pt.clientY - sy;
    var b = cmsCropState.box;
    if (mode === 'move') {
      b.x = Math.max(0, Math.min(start.w > 0 ? b.dh * 0 + start.dw - start.w : 0, start.x + dx));
      b.y = Math.max(0, Math.min(start.dh - start.h, start.y + dy));
      b.x = Math.max(0, Math.min(start.dw - start.w, start.x + dx));
    } else {
      var nw = Math.max(40, start.w + (mode.indexOf('e') >= 0 ? dx : -dx));
      var nh = Math.max(40, start.h + (mode.indexOf('s') >= 0 ? dy : -dy));
      if (cmsCropState.ratio) {
        if (Math.abs(dx) > Math.abs(dy)) nh = nw / cmsCropState.ratio;
        else nw = nh * cmsCropState.ratio;
      }
      if (mode.indexOf('w') >= 0) {
        var maxW = start.x + start.w;
        nw = Math.min(nw, maxW);
        b.x = maxW - nw;
      } else {
        nw = Math.min(nw, start.dw - start.x);
      }
      if (mode.indexOf('n') >= 0) {
        var maxH = start.y + start.h;
        nh = Math.min(nh, maxH);
        b.y = maxH - nh;
      } else {
        nh = Math.min(nh, start.dh - start.y);
      }
      b.w = nw; b.h = nh;
    }
    cmsCropBoxPaint();
    if (e.cancelable) e.preventDefault();
  }
  function up() {
    mode = null;
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', up);
  }

  box.onmousedown = function(e) {
    if (e.target.classList.contains('crop-h')) return;
    down(e, 'move');
  };
  box.querySelectorAll('.crop-h').forEach(function(h) {
    h.onmousedown = function(e) { down(e, h.getAttribute('data-dir')); };
  });
}

async function cmsCropApply() {
  var b = cmsCropState.box;
  var done = cmsCropState.done;
  if (!b) { toast('Nothing to crop', false); return; }
  var img = document.getElementById('cropImg');
  var btn = document.getElementById('cropApplyBtn');
  try {
    btn.disabled = true; btn.textContent = 'Cropping…';
    var sx = b.x * (cmsCropState.natW / b.dw);
    var sy = b.y * (cmsCropState.natH / b.dh);
    var sw = b.w * (cmsCropState.natW / b.dw);
    var sh = b.h * (cmsCropState.natH / b.dh);
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    var blob = await new Promise(function(res) { canvas.toBlob(res, 'image/jpeg', 0.9); });
    if (!blob) throw new Error('Could not process the cropped image');
    var file = new File([blob], 'crop-' + Date.now() + '.jpg', { type: 'image/jpeg' });
    var media = await cmsUploadFiles([file], null);
    cmsCloseCrop();
    if (done) done(media[0].url);
    toast('Cropped image uploaded');
  } catch (e) {
    toast('Crop failed: ' + e.message, false);
  } finally {
    btn.disabled = false; btn.textContent = 'Apply & Upload';
  }
}

// ─────────────── Rich text editor ───────────────

var RTE_TOOLBAR = [
  ['bold', 'B', 'Bold'],
  ['italic', 'I', 'Italic'],
  ['underline', 'U', 'Underline'],
  ['sep'],
  ['formatBlock', 'H2', 'Heading', '<h2>'],
  ['formatBlock', 'H3', 'Subheading', '<h3>'],
  ['formatBlock', '¶', 'Paragraph', '<p>'],
  ['sep'],
  ['insertUnorderedList', '•', 'Bullet list'],
  ['insertOrderedList', '1.', 'Numbered list'],
  ['sep'],
  ['link', '🔗', 'Insert link'],
  ['unlink', '⛓', 'Remove link'],
  ['removeFormat', 'Tx', 'Clear formatting']
];

function rteInit(id) {
  var host = document.getElementById(id);
  if (!host || host.getAttribute('data-rte')) return;
  host.setAttribute('data-rte', '1');
  host.classList.add('rte');
  var tools = RTE_TOOLBAR.map(function(t) {
    if (t[0] === 'sep') return '<span class="rte-sep"></span>';
    if (t[0] === 'link') return '<button type="button" class="rte-btn" title="' + t[2] + '" onmousedown="event.preventDefault()" onclick="rteLink(\'' + id + '\')">' + t[1] + '</button>';
    return '<button type="button" class="rte-btn ' + (t[1] === 'B' ? 'rte-b' : t[1] === 'I' ? 'rte-i' : t[1] === 'U' ? 'rte-u' : '') + '" title="' + t[2] + '" onmousedown="event.preventDefault()" onclick="rteCmd(\'' + id + '\',\'' + t[0] + '\',' + (t[3] ? "'" + t[3] + "'" : 'null') + ')">' + t[1] + '</button>';
  }).join('');

  host.innerHTML =
    '<div class="rte-toolbar">' + tools + '</div>' +
    '<div class="rte-area" contenteditable="true" id="' + id + '-area" data-ph="' + esc(host.getAttribute('data-ph') || '') + '"></div>';

  var area = document.getElementById(id + '-area');
  area.addEventListener('paste', function(e) {
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  });
}

function rteArea(id) { return document.getElementById(id + '-area'); }

function rteGet(id) {
  var area = rteArea(id);
  return area ? area.innerHTML.trim() : '';
}

function rteText(id) {
  var area = rteArea(id);
  return area ? (area.innerText || '').trim() : '';
}

function rteSet(id, html) {
  rteInit(id);
  var area = rteArea(id);
  if (area) area.innerHTML = html || '';
}

function rteClear(id) {
  var area = rteArea(id);
  if (area) area.innerHTML = '';
}

function rteCmd(id, cmd, val) {
  var area = rteArea(id);
  if (!area) return;
  area.focus();
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  if (cmd === 'formatBlock') document.execCommand('formatBlock', false, val || '<p>');
  else document.execCommand(cmd, false, val || null);
}

function rteLink(id) {
  var url = prompt('Link URL (https://…):');
  if (!url) return;
  url = url.trim();
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) { toast('Only http(s), mailto or tel links are allowed', false); return; }
  var area = rteArea(id);
  area.focus();
  document.execCommand('createLink', false, url);
}

// ─────────────── Bulk actions ───────────────

var bulkStore = {};
// Visible (filtered) ids per prefix — feeds "select all visible".
var bulkVisible = {};

function bulkRegister(prefix, type, refreshFn, opts) {
  bulkStore[prefix] = {
    type: type,
    selected: {},
    refresh: refreshFn,
    // Which taxonomy actions this content type supports on the backend.
    allowCategory: !!(opts && opts.category),
    allowTags: !!(opts && opts.tags)
  };
  bulkRender(prefix);
}

function bulkIds(prefix) {
  var st = bulkStore[prefix];
  return st ? Object.keys(st.selected).filter(function(k) { return st.selected[k]; }) : [];
}

function bulkToggle(prefix, id, checked) {
  var st = bulkStore[prefix];
  if (!st) return;
  st.selected[id] = checked;
  bulkRender(prefix);
}

function bulkSelectAll(prefix, ids, checked) {
  var st = bulkStore[prefix];
  if (!st) return;
  st.selected = {};
  if (checked) ids.forEach(function(id) { st.selected[id] = true; });
  bulkRender(prefix);
  document.querySelectorAll('#panel-' + prefix + ' .bulk-check, #panel-' + bulkPanel(prefix) + ' .bulk-check').forEach(function(cb) { cb.checked = checked; });
}

function bulkClear(prefix) {
  var st = bulkStore[prefix];
  if (!st) return;
  st.selected = {};
  bulkRender(prefix);
  document.querySelectorAll('.bulk-check').forEach(function(cb) { cb.checked = false; });
}

function bulkPanel(prefix) {
  return ({ d: 'dest', h: 'hotel', f: 'food', ev: 'events', tr: 'tours' })[prefix] || prefix;
}

function bulkRender(prefix) {
  var bar = document.getElementById(prefix + '-bulkbar');
  if (!bar) return;
  var st = bulkStore[prefix];
  var ids = bulkIds(prefix);
  if (!ids.length) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  var catOptions = (cmsTaxonomy ? cmsTaxonomy.categories : []).map(function(c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');
  var tagOptions = (cmsTaxonomy ? cmsTaxonomy.tags : []).map(function(t) {
    return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
  }).join('');

  var html =
    '<span class="bulk-count">' + ids.length + ' selected</span>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="bulkRun(\'' + prefix + '\',\'publish\')">Publish</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="bulkRun(\'' + prefix + '\',\'unpublish\')">Unpublish</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="bulkRun(\'' + prefix + '\',\'archive\')">Archive</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="bulkRun(\'' + prefix + '\',\'feature\')">Feature</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="bulkRun(\'' + prefix + '\',\'unfeature\')">Unfeature</button>';

  if (st && st.allowCategory) {
    html += '<span class="bulk-sep"></span>' +
      '<select id="' + prefix + '-bulk-cat" class="bulk-select"><option value="">Set category…</option>' + catOptions + '</select>' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="bulkRun(\'' + prefix + '\',\'set_category\')">Apply</button>';
  }
  if (st && st.allowTags) {
    html += '<select id="' + prefix + '-bulk-tag" class="bulk-select"><option value="">Add tag…</option>' + tagOptions + '</select>' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="bulkRun(\'' + prefix + '\',\'add_tags\')">Add</button>';
  }

  html += '<span class="bulk-sep"></span>' +
    '<button type="button" class="btn btn-red btn-sm" onclick="bulkRun(\'' + prefix + '\',\'delete\')">Delete</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="bulkClear(\'' + prefix + '\')">Clear</button>';

  bar.style.display = 'flex';
  bar.innerHTML = html;
}

async function bulkRun(prefix, action) {
  var st = bulkStore[prefix];
  if (!st) return;
  var ids = bulkIds(prefix);
  if (!ids.length) { toast('No items selected', false); return; }

  var body = { type: st.type, ids: ids, action: action };
  if (action === 'set_category') {
    var sel = document.getElementById(prefix + '-bulk-cat');
    if (!sel || !sel.value) { toast('Choose a category first', false); return; }
    body.category = sel.value;
  }
  if (action === 'add_tags') {
    var tagSel = document.getElementById(prefix + '-bulk-tag');
    if (!tagSel || !tagSel.value) { toast('Choose a tag first', false); return; }
    body.tags = [tagSel.value];
  }

  var verbs = {
    publish: 'Publish', unpublish: 'Unpublish (set to draft)', archive: 'Archive',
    feature: 'Feature (no schedule — active immediately)', unfeature: 'Unfeature',
    delete: 'DELETE', set_category: 'Set category on', add_tags: 'Add tag to'
  };
  var msg = verbs[action] + ' ' + ids.length + ' selected item(s)?';
  if (action === 'delete') {
    msg = 'Permanently DELETE ' + ids.length + ' selected item(s)? This cannot be undone and affects only the selected records.';
  }

  showDel(msg, async function() {
    try {
      load(true);
      var res = await api('POST', '/content/bulk', body);
      load(false);
      toast(res.message || 'Done');
      bulkClear(prefix);
      cmsLoadTaxonomy(true);
      if (st.refresh) st.refresh();
    } catch (e) {
      load(false);
      toast('Error: ' + e.message, false);
    }
  });
}

// ─────────────── Quick status change from a card ───────────────

async function quickStatus(type, id, status) {
  var action = status === 'published' ? 'publish' : status === 'archived' ? 'archive' : 'unpublish';
  try {
    load(true);
    var res = await api('POST', '/content/' + type + '/' + action, { id: id });
    load(false);
    toast(res.message || 'Status updated');
    if (type === 'events' && typeof loadEventsPanel === 'function') {
      evLoaded = false;
      loadEventsPanel();
    } else if (type === 'tours' && typeof loadToursPanel === 'function') {
      toursLoaded = false;
      loadToursPanel();
    } else if (typeof loadAllData === 'function') {
      loadAllData();
    }
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

// ─────────────── Misc ───────────────

function cmsEscapeKeyHandler(e) {
  if (e.key === 'Escape') {
    var crop = document.getElementById('cropModal');
    if (crop && crop.classList.contains('on')) cmsCloseCrop();
  }
}
document.addEventListener('keydown', cmsEscapeKeyHandler);

document.addEventListener('DOMContentLoaded', function() {
    var tax = hasPerm('content.taxonomy.read')
      ? cmsLoadTaxonomy()
      : Promise.resolve({ categories: [], tags: [] });
    tax.then(function() { Object.keys(bulkStore).forEach(bulkRender); });
  cmsCropInitDrag();
  // Build every rich text editor up front so toolbars exist even when a
  // modal is opened for creation (before any rteSet call).
  ['d-desc', 'h-desc', 'f-desc', 'ev-desc', 'tr-desc'].forEach(function(id) {
    if (document.getElementById(id)) rteInit(id);
  });
});
