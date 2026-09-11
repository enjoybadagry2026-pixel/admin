// ═══════════════ DRIVER REGISTRATION ═══════════════

(function() {
  var sel = document.getElementById('dri-v-year');
  if (!sel) return;
  var y = new Date().getFullYear();
  for (var i = y; i >= y - 30; i--) {
    var o = document.createElement('option');
    o.value = i;
    o.textContent = i;
    sel.appendChild(o);
  }
})();

function getInitials(name) {
  if (!name) return '?';
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

function validateDriverForm() {
  var fields = {
    'dri-name': 'Full Name is required.',
    'dri-phone': 'Phone Number is required.',
    'dri-dob': 'Date of Birth is required.',
    'dri-gender': 'Gender is required.',
    'dri-state': 'State of Origin is required.',
    'dri-lga': 'Local Government Area is required.',
    'dri-address': 'Residential Address is required.',
    'dri-ec-name': 'Emergency Contact Name is required.',
    'dri-ec-phone': 'Emergency Contact Phone is required.',
    'dri-nin': 'NIN is required.',
    'dri-bvn': 'BVN is required.',
    'dri-license': 'Driver\'s License Number is required.',
    'dri-license-expiry': 'Driver\'s License Expiry Date is required.',
    'dri-started': 'Driver Started Date is required.',
    'dri-experience': 'Years of Experience is required.',
    'dri-type': 'Driver Type is required.',
    'dri-v-make': 'Vehicle Make is required.',
    'dri-v-model': 'Vehicle Model is required.',
    'dri-v-color': 'Vehicle Color is required.',
    'dri-v-plate': 'Plate Number is required.',
    'dri-v-year': 'Vehicle Year is required.'
  };
  for (var id in fields) {
    var el = document.getElementById(id);
    if (!el || !el.value || el.value.trim() === '') {
      toast(fields[id], false);
      el && el.focus && el.focus();
      return false;
    }
  }
  var phone = document.getElementById('dri-phone').value.trim();
  if (!/^0\d{10}$/.test(phone) && !/^\+234\d{10}$/.test(phone)) {
    toast('Enter a valid Nigerian phone number (e.g. 08031234567)', false);
    document.getElementById('dri-phone').focus();
    return false;
  }
  var nin = document.getElementById('dri-nin').value.trim();
  if (!/^\d{11}$/.test(nin)) {
    toast('NIN must be exactly 11 digits.', false);
    document.getElementById('dri-nin').focus();
    return false;
  }
  var bvn = document.getElementById('dri-bvn').value.trim();
  if (!/^\d{11}$/.test(bvn)) {
    toast('BVN must be exactly 11 digits.', false);
    document.getElementById('dri-bvn').focus();
    return false;
  }
  return true;
}

function renderDrivers(drivers) {
  drivers = drivers || {};
  var html = '';
  var n = 0;
  var sorted = Object.keys(drivers).sort(function(a,b){
    var da = drivers[a].createdAt || '';
    var db2 = drivers[b].createdAt || '';
    return String(db2).localeCompare(String(da));
  });
  sorted.forEach(function(id) {
    var d = drivers[id];
    if (search && (d.fullName||'').toLowerCase().indexOf(search) < 0 && (d.drt||'').indexOf(search) < 0 && (d.phoneNumber||'').indexOf(search) < 0) return;
    n++;

    var verifyLabel, verifyClass;
    if (d.phoneVerified) {
      verifyLabel = 'Verified';
      verifyClass = 'driver-card-status-verified';
    } else if (d.isRegistered) {
      verifyLabel = 'OTP Pending';
      verifyClass = 'driver-card-status-otp';
    } else {
      verifyLabel = 'Not Registered';
      verifyClass = 'driver-card-status-unverified';
    }

    var statusLabel = d.status || 'Pending';
    var statusClass = 'driver-card-status-pending';
    if (statusLabel.toLowerCase() === 'active') statusClass = 'driver-card-status-active';
    else if (statusLabel.toLowerCase() === 'suspended') statusClass = 'driver-card-status-suspended';

    var vehicleType = d.vehicle && d.vehicle.type ? d.vehicle.type : '';
    var vehicleInfo = d.vehicle ? [d.vehicle.make, d.vehicle.model, d.vehicle.color].filter(Boolean).join(' ') : '';

    html += '<div class="driver-card" onclick="openDriverDetails(\'' + id + '\')">' +
      '<div class="driver-card-top">' +
        '<div class="driver-card-avatar">' + getInitials(d.fullName) + '</div>' +
        '<div class="driver-card-top-info">' +
          '<div class="driver-card-name">' + esc(d.fullName) + '</div>' +
          '<div class="driver-card-id">' + esc(d.driverId || id) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="driver-card-body">' +
        '<div class="driver-card-drt-wrap">' +
          '<span class="driver-card-drt-label">DRT</span>' +
          '<span class="driver-card-drt-val">' + esc(d.drt || '') + '</span>' +
          '<button class="driver-card-drt-copy" onclick="event.stopPropagation();copyDriverDRT(\'' + esc(d.drt || '') + '\')" title="Copy DRT">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="driver-card-meta">' +
          '<span class="driver-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' + esc(d.phoneNumber) + '</span>' +
          (vehicleType ? '<span class="driver-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' + esc(vehicleType) + '</span>' : '') +
          (vehicleInfo ? '<span class="driver-card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + esc(vehicleInfo) + '</span>' : '') +
        '</div>' +
        '<div class="driver-card-statuses">' +
          '<span class="driver-card-status ' + verifyClass + '">' + esc(verifyLabel) + '</span>' +
          '<span class="driver-card-status ' + statusClass + '">' + esc(statusLabel) + '</span>' +
        '</div>' +
        '<div class="driver-card-date">' + fmtDate(d.createdAt) + '</div>' +
        '<div class="driver-card-acts">' +
          '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();deleteDriver(\'' + id + '\')">Delete</button>' +
        '</div>' +
      '</div></div>';
  });
  document.getElementById('dri-list').innerHTML = html || '<div class="driver-empty"><div class="driver-empty-icon">🚗</div><div class="driver-empty-title">No drivers registered yet</div><div class="driver-empty-text">Register your first driver to start building the fleet.</div></div>';
  document.getElementById('dri-count').textContent = n + ' driver' + (n !== 1 ? 's' : '');
}

// ═══════════════ DRIVER MODAL ═══════════════

function openDriverModal() {
  resetDriverForm();
  document.getElementById('driverModal').classList.add('on');
  document.body.style.overflow = 'hidden';
  setTimeout(function(){ document.getElementById('dri-name').focus() }, 120);
}

function closeDriverModal() {
  document.getElementById('driverModal').classList.remove('on');
  document.body.style.overflow = '';
  resetDriverForm();
}

document.addEventListener('click', function(e) {
  var bg = document.getElementById('driverModal');
  if (bg && e.target === bg) closeDriverModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var bg = document.getElementById('driverModal');
    if (bg && bg.classList.contains('on')) closeDriverModal();
  }
});

async function saveDriver() {
  if (!validateDriverForm()) return;
  load(true);

  try {
    var phone = document.getElementById('dri-phone').value.trim();
    var nin = document.getElementById('dri-nin').value.trim();
    var bvn = document.getElementById('dri-bvn').value.trim();
    var license = document.getElementById('dri-license').value.trim();

    var dupRes = await api('GET', '/drivers/check-duplicates?phone=' + encodeURIComponent(phone) + '&nin=' + encodeURIComponent(nin) + '&bvn=' + encodeURIComponent(bvn) + '&license=' + encodeURIComponent(license));
    if (dupRes.data.duplicates) {
      load(false);
      dupRes.data.errors.forEach(function(e) { toast(e, false); });
      return;
    }

    var idRes = await api('GET', '/drivers/generate-id');
    var driverId = idRes.data.driverId;

    var drtRes = await api('GET', '/drivers/generate-drt');
    var drt = drtRes.data.drt;
    var drtExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    var driverData = {
      driverId: driverId,
      fullName: document.getElementById('dri-name').value.trim(),
      phoneNumber: phone,
      email: document.getElementById('dri-email').value.trim(),
      gender: document.getElementById('dri-gender').value,
      dateOfBirth: document.getElementById('dri-dob').value,
      stateOfOrigin: document.getElementById('dri-state').value,
      lga: document.getElementById('dri-lga').value.trim(),
      residentialAddress: document.getElementById('dri-address').value.trim(),
      emergencyContact: {
        name: document.getElementById('dri-ec-name').value.trim(),
        phone: document.getElementById('dri-ec-phone').value.trim()
      },
      nin: nin,
      bvn: bvn,
      driversLicenseNumber: license,
      driversLicenseExpiry: document.getElementById('dri-license-expiry').value,
      vehicle: {
        type: document.getElementById('dri-type').value,
        make: document.getElementById('dri-v-make').value.trim(),
        model: document.getElementById('dri-v-model').value.trim(),
        color: document.getElementById('dri-v-color').value.trim(),
        plateNumber: document.getElementById('dri-v-plate').value.trim(),
        year: document.getElementById('dri-v-year').value
      },
      drt: drt,
      status: document.getElementById('dri-status').value
    };

    await api('POST', '/drivers', driverData);

    load(false);
    closeDriverModal();
    toast('Driver registered! DRT: ' + drt, true);
    loadAllData();
  } catch (e) {
    load(false);
    toast('Error: ' + e.message, false);
  }
}

function deleteDriver(id) {
  var d = cachedDrivers[id];
  showDel('Delete driver "' + (d&&d.fullName||'this') + '"? This cannot be undone.', async function(){
    load(true);
    try {
      await api('DELETE', '/drivers/' + id);
      load(false);
      toast('Driver deleted.');
      loadAllData();
    } catch (e) {
      load(false);
      toast(e.message, false);
    }
  });
}

function resetDriverForm() {
  document.getElementById('driverForm').reset();
  document.getElementById('dri-status').value = 'Pending';
}

function copyDriverDRT(drt) {
  if (!drt) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(drt).then(function(){
      toast('DRT copied to clipboard!', true);
    }).catch(function(){
      fallbackCopy(drt);
    });
  } else {
    fallbackCopy(drt);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('DRT copied to clipboard!', true);
  } catch(e) {
    toast('Failed to copy DRT.', false);
  }
  document.body.removeChild(ta);
}

// ═══════════════ DRIVER DETAILS SPA ═══════════════

var currentDriverId = null;
var currentDriverDetails = null;
var driverRidesPage = 1;
var driverRidesStatus = '';

function openDriverDetails(id) {
  currentDriverId = id;
  document.getElementById('panel-drivers').classList.remove('on');
  document.getElementById('panel-driver-details').classList.add('on');
  document.getElementById('drv-detail-content').innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading driver details...</div></div>';
  loadDriverDetails(id);
}

function closeDriverDetails() {
  document.getElementById('panel-driver-details').classList.remove('on');
  document.getElementById('panel-drivers').classList.add('on');
  currentDriverId = null;
  currentDriverDetails = null;
}

async function loadDriverDetails(id) {
  try {
    var res = await api('GET', '/drivers/' + id + '/details');
    currentDriverDetails = res.data;
    renderDriverDetails(res.data);
  } catch (e) {
    document.getElementById('drv-detail-content').innerHTML = '<div class="drv-error"><div class="drv-error-icon">⚠️</div><div class="drv-error-title">Failed to load driver details</div><div class="drv-error-text">' + esc(e.message) + '</div><button class="btn btn-accent" onclick="loadDriverDetails(\'' + id + '\')">Retry</button></div>';
  }
}

function renderDriverDetails(data) {
  var p = data.profile;
  var reg = data.registration;
  var v = data.vehicle;
  var s = data.status;
  var st = data.stats;
  var t = data.today;
  var w = data.thisWeek;
  var m = data.thisMonth;
  var wallet = data.wallet;

  var onlineClass = s.onlineStatus === 'online' ? 'online' : (s.currentStatus === 'busy' ? 'busy' : 'offline');
  var onlineLabel = s.onlineStatus === 'online' ? 'Online' : (s.currentStatus === 'busy' ? 'Busy' : 'Offline');
  var hasAnyActivity = st.totalTrips > 0 || st.totalRatings > 0;

  var html = '';

  // Registration Warning Banner
  if (!reg.isRegistered) {
    html += '<div class="drv-banner drv-banner-warning">';
    html += '<div class="drv-banner-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>';
    html += '<div class="drv-banner-text">';
    html += '<div class="drv-banner-title">Driver has not registered via the app</div>';
    html += '<div class="drv-banner-desc">This driver was registered in the admin panel but hasn\'t signed up with their DRT number and password yet. Ride and earnings data will appear after they register and start completing trips.</div>';
    html += '</div></div>';
  }

  // Profile Header
  html += '<div class="drv-profile">';
  html += '<div class="drv-profile-top">';
  if (p.profilePicture) {
    html += '<div class="drv-profile-avatar"><img src="' + esc(p.profilePicture) + '" onerror="this.parentElement.innerHTML=\'' + getInitials(p.fullName) + '\'"><div class="drv-profile-online ' + onlineClass + '"></div></div>';
  } else {
    html += '<div class="drv-profile-avatar">' + getInitials(p.fullName) + '<div class="drv-profile-online ' + onlineClass + '"></div></div>';
  }
  html += '<div class="drv-profile-info">';
  html += '<div class="drv-profile-name">' + esc(p.fullName) + '</div>';
  html += '<div class="drv-profile-id">' + esc(p.driverId) + ' · ' + esc(p.id.substring(0, 8)) + '...</div>';
  html += '<div class="drv-profile-badges">';
  html += '<span class="drv-badge drv-badge-' + s.accountStatus + '">' + esc(s.accountStatus) + '</span>';
  html += '<span class="drv-badge drv-badge-' + onlineClass + '">' + esc(onlineLabel) + '</span>';
  html += reg.isRegistered ? '<span class="drv-badge drv-badge-registered">Registered</span>' : '<span class="drv-badge drv-badge-unregistered">Not Registered</span>';
  html += reg.phoneVerified ? '<span class="drv-badge drv-badge-verified">Phone Verified</span>' : '<span class="drv-badge drv-badge-unverified">Phone Unverified</span>';
  html += '</div></div>';
  html += '</div>';

  // Quick Info
  html += '<div class="drv-quick-grid">';
  html += drvQuickItem('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>', 'Phone', p.phoneNumber || 'N/A');
  html += drvQuickItem('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>', 'Email', p.email || 'N/A');
  html += drvQuickItem('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', 'Gender', p.gender || 'N/A');
  html += drvQuickItem('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', 'Joined', fmtDate(p.createdAt));
  html += drvQuickItem('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>', 'Location', (p.stateOfOrigin || '') + (p.lga ? ', ' + p.lga : ''));
  html += drvQuickItem('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', 'Last Active', reg.lastActivity ? fmtDate(reg.lastActivity) : 'Never');
  html += drvQuickItem('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>', 'Wallet', fmtNaira(wallet.balance));
  html += '</div></div>';

  // Tabs
  html += '<div class="drv-tabs">';
  html += '<button class="drv-tab on" onclick="switchDrvTab(\'overview\',this)">Overview</button>';
  html += '<button class="drv-tab" onclick="switchDrvTab(\'rides\',this)">Ride History</button>';
  html += '<button class="drv-tab" onclick="switchDrvTab(\'earnings\',this)">Earnings</button>';
  html += '<button class="drv-tab" onclick="switchDrvTab(\'ratings\',this)">Ratings</button>';
  html += '<button class="drv-tab" onclick="switchDrvTab(\'vehicle\',this)">Vehicle</button>';
  html += '</div>';

  // Tab: Overview
  html += '<div class="drv-tab-panel on" id="drv-tab-overview">';

  // Stats Cards
  html += '<div class="drv-stats-grid">';
  html += drvStatCard('accent', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>', 'Total Earnings', fmtNaira(st.totalEarnings), hasAnyActivity ? 'Lifetime earnings' : 'No trips yet');
  html += drvStatCard('green', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', 'Total Trips', st.totalTrips, hasAnyActivity ? st.completedTrips + ' completed' : 'No trips yet');
  html += drvStatCard('blue', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>', 'Distance', hasAnyActivity ? st.totalDistance.toFixed(1) + ' km' : '0 km', hasAnyActivity ? st.avgDistance.toFixed(1) + ' km avg/trip' : 'No trips yet');
  html += drvStatCard('purple', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', 'Rating', hasAnyActivity ? st.avgRating.toFixed(1) + ' ★' : '—', hasAnyActivity ? st.totalRatings + ' ratings' : 'No ratings yet');
  html += drvStatCard('yellow', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>', 'Acceptance', hasAnyActivity ? st.acceptanceRate + '%' : '—', hasAnyActivity ? st.completionRate + '% completion' : 'No data yet');
  html += drvStatCard('accent', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>', 'Today', fmtNaira(t.earnings), t.completed + ' trips · ' + t.distance.toFixed(1) + ' km');
  html += '</div>';

  // Performance Bars
  html += '<div class="drv-section"><div class="drv-section-header"><div class="drv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Performance</div></div>';
  if (hasAnyActivity) {
    html += '<div style="display:flex;flex-direction:column;gap:10px">';
    html += drvPerfBar('Completion Rate', st.completionRate, 'green');
    html += drvPerfBar('Acceptance Rate', st.acceptanceRate, 'blue');
    html += drvPerfBar('Cancellation Rate', st.cancellationRate, 'red');
    html += '</div>';
  } else {
    html += '<div class="drv-empty-inline"><div class="drv-empty-inline-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="drv-empty-inline-text">No performance data yet — this appears after the driver completes their first trip.</div></div>';
  }
  html += '</div>';

  // Recent Rides
  if (data.recentRides && data.recentRides.length) {
    html += '<div class="drv-section"><div class="drv-section-header"><div class="drv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Recent Rides</div></div>';
    html += '<div class="drv-rides-list">';
    data.recentRides.forEach(function(r) { html += drvRideCard(r); });
    html += '</div></div>';
  } else {
    html += '<div class="drv-section"><div class="drv-section-header"><div class="drv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Recent Rides</div></div>';
    html += '<div class="drv-empty-inline"><div class="drv-empty-inline-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div><div class="drv-empty-inline-text">No rides yet — recent trips will appear here once the driver starts completing rides.</div></div>';
    html += '</div>';
  }

  html += '</div>'; // end overview

  // Tab: Rides (loaded dynamically)
  html += '<div class="drv-tab-panel" id="drv-tab-rides"><div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading ride history...</div></div></div>';

  // Tab: Earnings
  html += '<div class="drv-tab-panel" id="drv-tab-earnings">';
  if (hasAnyActivity) {
    html += '<div class="drv-section"><div class="drv-section-header"><div class="drv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Earnings Breakdown</div></div>';
    html += '<div class="drv-earnings-grid">';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">Today</div><div class="drv-earning-value">' + fmtNaira(t.earnings) + '</div></div>';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">This Week</div><div class="drv-earning-value">' + fmtNaira(w.earnings) + '</div></div>';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">This Month</div><div class="drv-earning-value">' + fmtNaira(m.earnings) + '</div></div>';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">All Time</div><div class="drv-earning-value">' + fmtNaira(st.totalEarnings) + '</div></div>';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">Wallet Balance</div><div class="drv-earning-value">' + fmtNaira(wallet.balance) + '</div></div>';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">Avg/Trip</div><div class="drv-earning-value">' + (st.completedTrips > 0 ? fmtNaira(st.totalEarnings / st.completedTrips) : fmtNaira(0)) + '</div></div>';
    html += '</div></div>';

    // Distance breakdown
    html += '<div class="drv-section"><div class="drv-section-header"><div class="drv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Distance Breakdown</div></div>';
    html += '<div class="drv-earnings-grid">';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">Today</div><div class="drv-earning-value">' + t.distance.toFixed(1) + ' km</div></div>';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">This Week</div><div class="drv-earning-value">' + w.distance.toFixed(1) + ' km</div></div>';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">This Month</div><div class="drv-earning-value">' + m.distance.toFixed(1) + ' km</div></div>';
    html += '<div class="drv-earning-card"><div class="drv-earning-label">All Time</div><div class="drv-earning-value">' + st.totalDistance.toFixed(1) + ' km</div></div>';
    html += '</div></div>';
  } else {
    html += '<div class="drv-empty-inline" style="padding:40px 20px"><div class="drv-empty-inline-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="drv-empty-inline-text">No earnings data yet — earnings and distance breakdowns will appear after the driver completes their first trip.</div></div>';
  }
  html += '</div>';

  // Tab: Ratings
  html += '<div class="drv-tab-panel" id="drv-tab-ratings">';
  html += '<div class="drv-section"><div class="drv-section-header"><div class="drv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Ratings & Reviews</div></div>';
  if (st.totalRatings > 0) {
    // Rating summary
    html += '<div class="drv-rating-big">';
    html += '<div class="drv-rating-number">' + st.avgRating.toFixed(1) + '</div>';
    html += '<div>';
    html += '<div class="drv-rating-stars">' + drvStars(st.avgRating) + '</div>';
    html += '<div style="font-size:12px;color:var(--text2);margin-top:2px">' + st.totalRatings + ' rating' + (st.totalRatings !== 1 ? 's' : '') + '</div>';
    html += '</div>';
    html += '</div>';
    // Distribution
    html += '<div class="drv-rating-dist">';
    [5,4,3,2,1].forEach(function(star) {
      var count = st['star' + star] || 0;
      var pct = st.totalRatings > 0 ? Math.round((count / st.totalRatings) * 100) : 0;
      html += '<div class="drv-rating-bar"><span class="drv-rating-bar-label">' + star + '</span><div class="drv-rating-bar-track"><div class="drv-rating-bar-fill" style="width:' + pct + '%"></div></div><span class="drv-rating-bar-count">' + count + '</span></div>';
    });
    html += '</div>';
    // Recent reviews
    if (data.recentRatings && data.recentRatings.length) {
      html += '<div style="margin-top:20px"><div style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Recent Reviews</div>';
      html += '<div class="drv-reviews-list">';
      data.recentRatings.forEach(function(r) {
        html += '<div class="drv-review-card">';
        html += '<div class="drv-review-header"><span class="drv-review-user">' + esc(r.userName) + '</span><div class="drv-review-stars">' + drvStars(r.rating) + '</div></div>';
        if (r.comment) html += '<div class="drv-review-text">' + esc(r.comment) + '</div>';
        html += '<div class="drv-review-date">' + fmtDate(r.createdAt) + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    }
  } else {
    html += '<div class="drv-empty-inline" style="padding:40px 20px"><div class="drv-empty-inline-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div class="drv-empty-inline-text">No ratings yet — passenger reviews will appear here after completed trips.</div></div>';
  }
  html += '</div></div>';

  // Tab: Vehicle
  html += '<div class="drv-tab-panel" id="drv-tab-vehicle">';
  html += '<div class="drv-section"><div class="drv-section-header"><div class="drv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Vehicle Information</div></div>';
  html += '<div class="drv-vehicle">';
  if (v && (v.type || v.make || v.model)) {
    html += '<div class="drv-vehicle-header">';
    html += '<div class="drv-vehicle-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>';
    html += '<div class="drv-vehicle-title">' + esc(v.type || 'Vehicle') + '</div>';
    html += '</div>';
    html += '<div class="drv-vehicle-grid">';
    if (v.make) html += '<div class="order-detail-field"><div class="order-detail-field-label">Make</div><div class="order-detail-field-value">' + esc(v.make) + '</div></div>';
    if (v.model) html += '<div class="order-detail-field"><div class="order-detail-field-label">Model</div><div class="order-detail-field-value">' + esc(v.model) + '</div></div>';
    if (v.year) html += '<div class="order-detail-field"><div class="order-detail-field-label">Year</div><div class="order-detail-field-value">' + esc(v.year) + '</div></div>';
    if (v.color) html += '<div class="order-detail-field"><div class="order-detail-field-label">Color</div><div class="order-detail-field-value">' + esc(v.color) + '</div></div>';
    if (v.plateNumber) html += '<div class="order-detail-field"><div class="order-detail-field-label">Plate Number</div><div class="order-detail-field-value" style="font-family:monospace;font-weight:700;color:var(--accent)">' + esc(v.plateNumber) + '</div></div>';
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:32px;color:var(--text2)"><div style="font-size:24px;margin-bottom:8px;opacity:.4">🚗</div><div style="font-size:13px">No vehicle information available</div></div>';
  }
  html += '</div></div>';

  // Registration Info
  html += '<div class="drv-section"><div class="drv-section-header"><div class="drv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Registration Details</div></div>';
  html += '<div class="drv-vehicle-grid">';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">DRT Number</div><div class="order-detail-field-value" style="font-family:monospace;color:var(--accent)">' + esc(reg.drt || 'N/A') + '</div></div>';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">DRT Status</div><div class="order-detail-field-value">' + esc(reg.drtStatus) + '</div></div>';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">NIN</div><div class="order-detail-field-value">' + esc(p.nin || 'N/A') + '</div></div>';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">BVN</div><div class="order-detail-field-value">' + esc(p.bvn || 'N/A') + '</div></div>';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">License Number</div><div class="order-detail-field-value">' + esc(p.driversLicenseNumber || 'N/A') + '</div></div>';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">License Expiry</div><div class="order-detail-field-value">' + esc(p.driversLicenseExpiry || 'N/A') + '</div></div>';
  if (p.residentialAddress) html += '<div class="order-detail-field order-detail-field-wide"><div class="order-detail-field-label">Address</div><div class="order-detail-field-value">' + esc(p.residentialAddress) + '</div></div>';
  if (p.emergencyContact && p.emergencyContact.name) {
    html += '<div class="order-detail-field"><div class="order-detail-field-label">Emergency Contact</div><div class="order-detail-field-value">' + esc(p.emergencyContact.name) + '</div></div>';
    html += '<div class="order-detail-field"><div class="order-detail-field-label">Emergency Phone</div><div class="order-detail-field-value">' + esc(p.emergencyContact.phone || '') + '</div></div>';
  }
  html += '</div></div>';
  html += '</div>';

  document.getElementById('drv-detail-content').innerHTML = html;
}

function switchDrvTab(tab, btn) {
  document.querySelectorAll('.drv-tab').forEach(function(t) { t.classList.remove('on'); });
  document.querySelectorAll('.drv-tab-panel').forEach(function(p) { p.classList.remove('on'); });
  btn.classList.add('on');
  var panel = document.getElementById('drv-tab-' + tab);
  if (panel) panel.classList.add('on');
  if (tab === 'rides' && currentDriverId) loadDriverRides(currentDriverId, 1, '');
}

async function loadDriverRides(id, page, status) {
  driverRidesPage = page || 1;
  driverRidesStatus = status || '';
  var panel = document.getElementById('drv-tab-rides');
  if (!panel) return;
  panel.innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading rides...</div></div>';

  try {
    var url = '/drivers/' + id + '/rides?page=' + driverRidesPage + '&limit=10';
    if (driverRidesStatus) url += '&status=' + encodeURIComponent(driverRidesStatus);
    var res = await api('GET', url);
    var rides = res.data.rides;
    var pagination = res.data.pagination;

    var html = '';

    // Filter buttons
    html += '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">';
    var filters = ['', 'Trip Completed', 'Cancelled', 'Passenger Picked Up'];
    filters.forEach(function(f) {
      var label = f || 'All';
      var active = driverRidesStatus === f ? ' on' : '';
      html += '<button class="drv-tab' + active + '" onclick="loadDriverRides(\'' + id + '\',1,\'' + esc(f) + '\')">' + esc(label) + '</button>';
    });
    html += '</div>';

    if (rides.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:var(--text2)"><div style="font-size:24px;margin-bottom:8px;opacity:.4">🚗</div><div style="font-size:13px">No rides found</div></div>';
    } else {
      html += '<div class="drv-rides-list">';
      rides.forEach(function(r) { html += drvRideCard(r); });
      html += '</div>';

      // Pagination
      if (pagination.totalPages > 1) {
        html += '<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px">';
        html += '<button class="btn btn-ghost btn-sm" ' + (pagination.page <= 1 ? 'disabled' : '') + ' onclick="loadDriverRides(\'' + id + '\',' + (pagination.page - 1) + ')">Prev</button>';
        html += '<span style="font-size:12px;color:var(--text2)">Page ' + pagination.page + ' of ' + pagination.totalPages + '</span>';
        html += '<button class="btn btn-ghost btn-sm" ' + (pagination.page >= pagination.totalPages ? 'disabled' : '') + ' onclick="loadDriverRides(\'' + id + '\',' + (pagination.page + 1) + ')">Next</button>';
        html += '</div>';
      }
    }

    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = '<div class="drv-error"><div class="drv-error-icon">⚠️</div><div class="drv-error-title">Failed to load rides</div><div class="drv-error-text">' + esc(e.message) + '</div></div>';
  }
}

// ═══════════════ HELPER RENDERERS ═══════════════

function drvQuickItem(icon, label, value) {
  return '<div class="drv-quick-item"><div class="drv-quick-icon">' + icon + '</div><div class="drv-quick-text"><div class="drv-quick-label">' + esc(label) + '</div><div class="drv-quick-value">' + esc(value) + '</div></div></div>';
}

function drvStatCard(color, icon, label, value, sub) {
  return '<div class="drv-stat-card ' + color + '"><div class="drv-stat-icon ' + color + '">' + icon + '</div><div class="drv-stat-label">' + esc(label) + '</div><div class="drv-stat-value">' + esc(value) + '</div>' + (sub ? '<div class="drv-stat-sub">' + esc(sub) + '</div>' : '') + '</div>';
}

function drvPerfBar(label, pct, color) {
  return '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 16px"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:12px;font-weight:600;color:var(--text)">' + esc(label) + '</span><span style="font-size:12px;font-weight:700;color:var(--' + (color === 'green' ? 'green' : color === 'blue' ? 'text' : color === 'red' ? 'red' : 'accent') + ')">' + pct + '%</span></div><div style="height:6px;background:var(--input);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:var(--' + (color === 'green' ? 'green' : color === 'blue' ? 'accent' : color === 'red' ? 'red' : 'accent') + ');border-radius:3px;transition:width .4s"></div></div></div>';
}

function drvRideCard(r) {
  var statusClass = orderStatusClass(r.status);
  var pickupAddr = r.pickup && r.pickup.address ? r.pickup.address : 'N/A';
  var destAddr = r.destination && r.destination.address ? r.destination.address : 'N/A';
  if (pickupAddr.length > 40) pickupAddr = pickupAddr.substring(0, 40) + '...';
  if (destAddr.length > 40) destAddr = destAddr.substring(0, 40) + '...';

  var html = '<div class="drv-ride-card">';
  html += '<div class="drv-ride-top"><span class="drv-ride-ref">' + esc(r.bookingNumber) + '</span><span class="drv-ride-status ' + statusClass + '">' + esc(r.status) + '</span></div>';
  html += '<div class="drv-ride-route">';
  html += '<div><div class="drv-ride-route-dot pickup"></div><div class="drv-ride-route-line"></div><div class="drv-ride-route-dot dest"></div></div>';
  html += '<div><div class="drv-ride-route-text">' + esc(pickupAddr) + '</div><div class="drv-ride-route-text" style="margin-top:8px">' + esc(destAddr) + '</div></div>';
  html += '</div>';
  html += '<div class="drv-ride-meta">';
  html += '<span class="drv-ride-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' + fmtNaira(r.fare) + '</span>';
  if (r.distance) html += '<span class="drv-ride-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + parseFloat(r.distance).toFixed(1) + ' km</span>';
  if (r.duration) html += '<span class="drv-ride-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + r.duration + ' min</span>';
  html += '<span class="drv-ride-meta-item">' + fmtDate(r.completedAt || r.createdAt) + '</span>';
  html += '</div></div>';
  return html;
}

function drvStars(rating) {
  var html = '';
  var full = Math.floor(rating);
  var half = rating - full >= 0.5;
  for (var i = 1; i <= 5; i++) {
    if (i <= full) html += '<span class="star">★</span>';
    else if (i === full + 1 && half) html += '<span class="star">★</span>';
    else html += '<span class="star empty">★</span>';
  }
  return html;
}
