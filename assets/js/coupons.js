var cpRows = [];
var cpHistoryRows = [];
var cpLoaded = false;
var cpTimer = null;

function cpDebouncedLoad() { clearTimeout(cpTimer); cpTimer = setTimeout(function() { cpLoad(true); }, 250); }
async function cpLoad(force) {
  if (cpLoaded && !force) { cpRender(); return; }
  try {
    load(true);
    var q = document.getElementById('cp-search').value.trim();
    var active = document.getElementById('cp-filter').value;
    var path = '/coupons?limit=100&sort=created_at&dir=desc' + (q ? '&q=' + encodeURIComponent(q) : '') + (active ? '&active=' + active : '');
    var res = await api('GET', path);
    cpRows = (res.data && res.data.coupons) || [];
    cpRender(res.data && res.data.summary);
    cpLoaded = true;
  } catch (e) { toast('Failed to load coupons: ' + e.message, false); }
  finally { load(false); }
}
function cpMoney(n) { return '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 }); }
function cpStatus(c) { if (c.archived) return '<span class="cp-badge archived">Archived</span>'; if (!c.active) return '<span class="cp-badge off">Inactive</span>'; if (c.expiresAt && new Date(c.expiresAt) < new Date()) return '<span class="cp-badge off">Expired</span>'; return '<span class="cp-badge on">Active</span>'; }
function cpRender(summary) {
  var s = summary || { total: cpRows.length, active: cpRows.filter(function(c) { return c.active; }).length, expired: 0, redemptions: cpRows.reduce(function(a,c){return a+(c.usageCount||0);},0), totalDiscounts: 0 };
  document.getElementById('cp-count').textContent = s.total + ' coupons';
  document.getElementById('cp-summary').innerHTML = [['Total coupons',s.total],['Active',s.active],['Expired',s.expired],['Redemptions',s.redemptions],['Discounts granted',cpMoney(s.totalDiscounts)]].map(function(x){return '<div class="cp-stat"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>';}).join('');
  var list = document.getElementById('cp-list');
  document.getElementById('cp-empty').style.display = cpRows.length ? 'none' : '';
  list.innerHTML = cpRows.map(function(c) { return '<tr><td><strong>'+esc(c.code)+'</strong><small>'+esc(c.name || '')+'</small></td><td>'+ (c.type === 'percentage' ? esc(c.value)+'%' : cpMoney(c.value)) + (c.maximumDiscount ? '<small>Cap '+cpMoney(c.maximumDiscount)+'</small>' : '') +'</td><td>'+esc(c.serviceScope || 'all')+'</td><td>'+c.usageCount+(c.usageLimit ? ' / '+c.usageLimit : ' / ∞')+'</td><td>'+ (c.startsAt ? fmtDate(c.startsAt) : 'Now') +' — '+(c.expiresAt ? fmtDate(c.expiresAt) : 'Never')+'</td><td>'+cpStatus(c)+'</td><td><button class="btn btn-ghost btn-sm" onclick="cpOpenModal(\''+esc(c.code)+'\')">Edit</button> <button class="btn btn-ghost btn-sm" onclick="cpShowRedemptions(\''+esc(c.code)+'\')">History</button> <button class="btn btn-ghost btn-sm" onclick="cpToggle(\''+esc(c.code)+'\','+(c.active ? 'false':'true')+')">'+(c.active?'Deactivate':'Activate')+'</button></td></tr>'; }).join('');
}
function cpLocal(iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; var p = function(n){return String(n).padStart(2,'0');}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes()); }
function cpIso(value) { if (!value) return null; var d = new Date(value); return isNaN(d.getTime()) ? null : d.toISOString(); }
function cpReset() { document.getElementById('cp-form').reset(); document.getElementById('cp-edit').value=''; document.getElementById('cp-active').classList.add('on'); document.getElementById('cp-first').classList.remove('on'); document.getElementById('cp-code').disabled=false; document.getElementById('cp-modal-title').textContent='Create Coupon'; document.getElementById('cp-save').textContent='Save Coupon'; }
async function cpOpenModal(code) {
  cpReset();
  if (code) { var c = cpRows.filter(function(x){return x.code===code;})[0]; if (!c) return; document.getElementById('cp-edit').value=c.code; document.getElementById('cp-code').value=c.code; document.getElementById('cp-code').disabled=true; document.getElementById('cp-name').value=c.name||''; document.getElementById('cp-description').value=c.description||''; document.getElementById('cp-type').value=c.type; document.getElementById('cp-value').value=c.value; document.getElementById('cp-max').value=c.maximumDiscount||''; document.getElementById('cp-service').value=c.serviceScope||'all'; document.getElementById('cp-limit').value=c.usageLimit||''; document.getElementById('cp-user-limit').value=c.perUserLimit||''; document.getElementById('cp-min').value=c.minimumOrderAmount||''; document.getElementById('cp-starts').value=cpLocal(c.startsAt); document.getElementById('cp-expires').value=cpLocal(c.expiresAt); document.getElementById('cp-active').classList.toggle('on',c.active!==false); document.getElementById('cp-first').classList.toggle('on',c.firstTimeOnly===true); document.getElementById('cp-modal-title').textContent='Edit Coupon'; document.getElementById('cp-save').textContent='Update Coupon'; }
  document.getElementById('couponModal').classList.add('on'); document.body.style.overflow='hidden';
}
function cpCloseModal(){document.getElementById('couponModal').classList.remove('on');document.body.style.overflow='';}
async function cpSave(){
  var code=document.getElementById('cp-code').value.trim().toUpperCase(), value=Number(document.getElementById('cp-value').value), type=document.getElementById('cp-type').value;
  if(!/^[A-Z0-9_-]{3,50}$/.test(code)||!value||value<=0||(type==='percentage'&&value>100)){toast('Enter a valid code and discount value',false);return;}
  var data={code:code,name:document.getElementById('cp-name').value.trim(),description:document.getElementById('cp-description').value.trim(),type:type,value:value,maximumDiscount:document.getElementById('cp-max').value||null,serviceScope:document.getElementById('cp-service').value,usageLimit:document.getElementById('cp-limit').value||null,perUserLimit:document.getElementById('cp-user-limit').value||null,minimumOrderAmount:document.getElementById('cp-min').value||null,startsAt:cpIso(document.getElementById('cp-starts').value),expiresAt:cpIso(document.getElementById('cp-expires').value),active:document.getElementById('cp-active').classList.contains('on'),firstTimeOnly:document.getElementById('cp-first').classList.contains('on')};
  try { load(true); await api(document.getElementById('cp-edit').value?'PUT':'POST',document.getElementById('cp-edit').value?'/coupons/'+encodeURIComponent(code):'/coupons',data); toast(document.getElementById('cp-edit').value?'Coupon updated':'Coupon created'); cpCloseModal(); cpLoaded=false; await cpLoad(true); } catch(e){toast(e.message,false);} finally{load(false);}
}
function cpToggle(code, active){ showDel((active?'Activate':'Deactivate')+' coupon '+code+'?',async function(){try{await api('PUT','/coupons/'+encodeURIComponent(code),{active:active});toast(active?'Coupon activated':'Coupon deactivated');cpLoaded=false;cpLoad(true);}catch(e){toast(e.message,false);}}); }
function cpShowTab(tab) {
  var history = tab === 'history';
  document.getElementById('cp-summary').style.display = history ? 'none' : '';
  document.querySelector('.cp-toolbar').style.display = history ? 'none' : '';
  document.querySelector('.cp-table-wrap').style.display = history ? 'none' : '';
  document.getElementById('cp-empty').style.display = history ? 'none' : (cpRows.length ? 'none' : '');
  document.getElementById('cp-history-screen').style.display = history ? '' : 'none';
  document.getElementById('cp-tab-coupons').classList.toggle('on', !history);
  document.getElementById('cp-tab-history').classList.toggle('on', history);
  if (history) cpLoadHistory();
}
function cpRenderHistory() {
  var q=(document.getElementById('cp-history-search').value||'').toLowerCase();
  var rows=cpHistoryRows.filter(function(r){return !q || [r.couponCode,r.customerName,r.customerEmail,r.reference,r.service].join(' ').toLowerCase().indexOf(q)>=0;});
  document.getElementById('cp-history-count').textContent=rows.length+' redemptions';
  document.getElementById('cp-history-empty').style.display=rows.length?'none':'';
  document.getElementById('cp-history-list').innerHTML=rows.map(function(r){return '<tr><td>'+esc(fmtDate(r.createdAt))+'</td><td><strong>'+esc(r.couponCode)+'</strong></td><td>'+esc(r.customerName)+'<small>'+esc(r.customerEmail||'')+'</small></td><td>'+esc(r.service)+'<small>'+esc(r.reference||'')+'</small></td><td>'+cpMoney(r.eligibleAmount)+'</td><td class="cp-history-discount">-'+cpMoney(r.discountAmount)+'</td><td>'+cpMoney(r.finalAmount)+'</td><td>'+esc(r.status)+'</td></tr>';}).join('');
}
async function cpLoadHistory(force) { if(cpHistoryRows.length && !force){cpRenderHistory();return;} try{load(true);var res=await api('GET','/coupons/redemptions');cpHistoryRows=(res.data&&res.data.redemptions)||[];cpRenderHistory();}catch(e){toast('Failed to load redemption history: '+e.message,false);}finally{load(false);} }
async function cpShowRedemptions(code){ cpShowTab('history'); document.getElementById('cp-history-search').value=code; cpLoadHistory(true); }
document.addEventListener('click',function(e){var m=document.getElementById('couponModal');if(m&&e.target===m)cpCloseModal();});
