// ═══════════════ UTILITIES ═══════════════

var search = '';
var delCb = null;

function switchTab(t) {
  document.querySelectorAll('.tab').forEach(function(b){
    var txt = b.textContent.toLowerCase();
    var match = false;
    if (t === 'overview') match = txt.indexOf('overview') >= 0;
    else if (t === 'dest') match = txt.indexOf('dest') >= 0;
    else if (t === 'hotel') match = txt.indexOf('hotel') >= 0;
    else if (t === 'food') match = txt.indexOf('food') >= 0;
    else if (t === 'orders') match = txt.indexOf('order') >= 0;
    else if (t === 'drivers') match = txt.indexOf('driver') >= 0;
    b.classList.toggle('on', match);
  });
  document.getElementById('panel-overview').classList.toggle('on', t === 'overview');
  document.getElementById('panel-dest').classList.toggle('on', t === 'dest');
  document.getElementById('panel-hotel').classList.toggle('on', t === 'hotel');
  document.getElementById('panel-food').classList.toggle('on', t === 'food');
  document.getElementById('panel-orders').classList.toggle('on', t === 'orders');
  document.getElementById('panel-drivers').classList.toggle('on', t === 'drivers');
  document.getElementById('panel-driver-details').classList.remove('on');
  if (t === 'overview' && typeof loadOverviewStats === 'function') loadOverviewStats();
}

function doSearch(v) { search = v.toLowerCase(); renderCached(); }

function toast(msg, ok) {
  var d = document.createElement('div');
  d.className = 'toast ' + (ok !== false ? 'ok' : 'err');
  d.textContent = msg;
  document.getElementById('toast-box').appendChild(d);
  setTimeout(function(){ d.remove(); }, 3000);
}

function load(on) {
  var el = document.getElementById('loading');
  if (on) { el.className = 'on'; }
  else { el.className = 'done'; setTimeout(function(){ el.className = ''; }, 400); }
}

function showDel(txt, cb) {
  document.getElementById('delTxt').textContent = txt;
  document.getElementById('delModal').classList.add('on');
  delCb = cb;
}
function closeDel() { document.getElementById('delModal').classList.remove('on'); delCb = null; }
function confirmDel() { var cb = delCb; closeDel(); if (cb) cb(); }

function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function fmtDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('en-NG', {day:'numeric',month:'short',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-NG', {hour:'2-digit',minute:'2-digit'});
}

function fmtNaira(n) { return '\u20A6' + Number(n||0).toLocaleString(); }

function orderStatusClass(s) {
  if (!s) return 'tag-pending';
  var l = s.toLowerCase();
  if (l.indexOf('pending') >= 0) return 'tag-pending';
  if (l.indexOf('confirmed') >= 0) return 'tag-confirmed';
  if (l.indexOf('prepar') >= 0) return 'tag-preparing';
  if (l.indexOf('out') >= 0 || l.indexOf('delivering') >= 0) return 'tag-out';
  if (l.indexOf('delivered') >= 0) return 'tag-delivered';
  if (l.indexOf('cancel') >= 0) return 'tag-cancelled';
  return 'tag-pending';
}

function addTag(e, prefix) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  var val = e.target.value.trim();
  if (!val) return;
  var hidden = document.getElementById(prefix);
  var arr = hidden.value ? hidden.value.split(',').filter(Boolean) : [];
  if (arr.indexOf(val) >= 0) { toast('Already added', false); return; }
  arr.push(val);
  hidden.value = arr.join(',');
  renderTagChips(prefix);
  e.target.value = '';
}

function renderTagChips(prefix) {
  var wrapId = prefix + '-wrap';
  var wrap = document.getElementById(wrapId);
  if (!wrap) return;
  var hidden = document.getElementById(prefix);
  var arr = hidden.value ? hidden.value.split(',').filter(Boolean) : [];
  var input = wrap.querySelector('input');
  wrap.innerHTML = '';
  arr.forEach(function(tag) {
    var span = document.createElement('span');
    span.className = 'tag-item';
    span.innerHTML = esc(tag) + ' <span class="tag-x" onclick="removeTag(\'' + prefix + '\',\'' + esc(tag) + '\')">&times;</span>';
    wrap.appendChild(span);
  });
  wrap.appendChild(input);
  input.value = '';
  input.focus();
}

function removeTag(prefix, tag) {
  var hidden = document.getElementById(prefix);
  var arr = hidden.value ? hidden.value.split(',').filter(Boolean) : [];
  arr = arr.filter(function(t) { return t !== tag; });
  hidden.value = arr.join(',');
  renderTagChips(prefix);
}

function addGalInput(listId) {
  var list = document.getElementById(listId);
  var count = list.querySelectorAll('.img-add-row').length + 1;
  var row = document.createElement('div');
  row.className = 'img-add-row';
  row.innerHTML = '<input placeholder="Image URL ' + count + '" class="gal-input"><button type="button" class="btn-icon" onclick="this.parentElement.remove()">&times;</button>';
  list.appendChild(row);
}

function getGalInputs(listId) {
  var list = document.getElementById(listId);
  var inputs = list.querySelectorAll('.gal-input');
  var urls = [];
  inputs.forEach(function(inp) {
    var v = inp.value.trim();
    if (v) urls.push(v);
  });
  return urls;
}

function setGalInputs(listId, urls) {
  var list = document.getElementById(listId);
  list.innerHTML = '';
  if (!urls || !urls.length) {
    addGalInput(listId);
    return;
  }
  urls.forEach(function(url) {
    var row = document.createElement('div');
    row.className = 'img-add-row';
    row.innerHTML = '<input placeholder="Image URL" class="gal-input" value="' + esc(url) + '"><button type="button" class="btn-icon" onclick="this.parentElement.remove()">&times;</button>';
    list.appendChild(row);
  });
}
