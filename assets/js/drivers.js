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

// Panel-local driver search (the header search stays global) + sorting.
var driQuery = '';
var driSearchTimer = null;

// Client-side sort keys, mirroring the fields GET /drivers returns.
var DRI_SORT_OPTIONS = [
  { value: 'created', label: 'Date registered' },
  { value: 'updated', label: 'Last updated' },
  { value: 'name', label: 'Name' },
  { value: 'rating', label: 'Rating' },
  { value: 'trips', label: 'Trips' },
  { value: 'status', label: 'Status' }
];

function driverSortValue(d, key) {
  if (key === 'name') return String(d.fullName || '');
  if (key === 'rating') return Number(d.rating) || 0;
  if (key === 'trips') return Number(d.totalTrips) || 0;
  if (key === 'status') return String(d.status || '');
  if (key === 'updated') return String(d.updatedAt || d.createdAt || '');
  return String(d.createdAt || '');
}

function onDriverSearch(v) {
  if (driSearchTimer) clearTimeout(driSearchTimer);
  driSearchTimer = setTimeout(function() {
    driQuery = String(v || '').trim().toLowerCase();
    kitSetPage('drivers', 1);
    renderDrivers(cachedDrivers);
  }, 250);
}

function renderDrivers(drivers) {
  drivers = drivers || {};
  kitList('drivers', { sort: 'created', dir: 'desc', limit: 24 });
  var filtered = [];
  Object.keys(drivers).forEach(function(id) {
    var d = drivers[id];
    if (search && (d.fullName||'').toLowerCase().indexOf(search) < 0 && (d.drt||'').indexOf(search) < 0 && (d.phoneNumber||'').indexOf(search) < 0) return;
    if (driQuery && (d.fullName||'').toLowerCase().indexOf(driQuery) < 0 && (d.drt||'').toLowerCase().indexOf(driQuery) < 0 &&
        (d.phoneNumber||'').toLowerCase().indexOf(driQuery) < 0 && (d.driverId||'').toLowerCase().indexOf(driQuery) < 0) return;
    filtered.push({ id: id, d: d });
  });
  filtered = kitSortRows(filtered, function(row, key) { return driverSortValue(row.d, key); }, 'drivers');
  var page = kitSlice(filtered, 'drivers');
  var n = filtered.length;

  var html = '';
  page.rows.forEach(function(row) {
    var id = row.id;
    var d = row.d;

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
  if (!html && !n) {
    var noMatch = (!!search || !!driQuery) && Object.keys(drivers).length > 0;
    html = noMatch
      ? '<div class="driver-empty"><div class="driver-empty-icon">\uD83D\uDD0D</div><div class="driver-empty-title">No drivers match your search</div><div class="driver-empty-text">Try a different name, DRT, driver ID or phone number.</div></div>'
      : '<div class="driver-empty"><div class="driver-empty-icon">🚗</div><div class="driver-empty-title">No drivers registered yet</div><div class="driver-empty-text">Register your first driver to start building the fleet.</div></div>';
    html += '<div id="dri-insights" style="margin-top:16px"></div>';
  }
  document.getElementById('dri-list').innerHTML = html;
  document.getElementById('dri-count').textContent = n + ' driver' + (n !== 1 ? 's' : '');
  kitRenderPager('dri-pager', 'drivers', n ? page : null, function() { renderDrivers(cachedDrivers); });
  kitRenderSort('dri-sort', 'drivers', DRI_SORT_OPTIONS, function() { renderDrivers(cachedDrivers); });
  scheduleDriAlertPill();
  if (document.getElementById('dri-insights')) loadInsightsInto('dri-insights');
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
  var rv = data.review || {};
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

  // Suspension banner (reason + who + when recorded by admin)
  if (s.accountStatus === 'suspended' && rv.suspendReason) {
    html += '<div class="drv-banner drv-banner-danger">';
    html += '<div class="drv-banner-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div>';
    html += '<div class="drv-banner-text">';
    html += '<div class="drv-banner-title">Driver is suspended</div>';
    html += '<div class="drv-banner-desc">Reason: ' + esc(rv.suspendReason) + ' — ' + esc(rv.suspendedBy || 'admin') + (rv.suspendedAt ? ' on ' + esc(fmtDate(rv.suspendedAt)) : '') + '</div>';
    html += '</div></div>';
  }

  // Rejection banner
  if (rv.verificationStatus === 'rejected' && rv.rejectionReason) {
    html += '<div class="drv-banner drv-banner-danger">';
    html += '<div class="drv-banner-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>';
    html += '<div class="drv-banner-text">';
    html += '<div class="drv-banner-title">Application rejected</div>';
    html += '<div class="drv-banner-desc">Reason: ' + esc(rv.rejectionReason) + ' — ' + esc(rv.rejectedBy || 'admin') + (rv.rejectedAt ? ' on ' + esc(fmtDate(rv.rejectedAt)) : '') + '</div>';
    html += '</div></div>';
  }

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
  if (rv.verificationStatus === 'verified') html += '<span class="drv-badge drv-badge-verified">Approved</span>';
  else if (rv.verificationStatus === 'rejected') html += '<span class="drv-badge drv-badge-rejected">Rejected</span>';
  html += '</div></div>';

  // Action bar: right-aligned inside the profile header so it never crowds the badges
  html += '<div class="drv-actions">';
  if (rv.verificationStatus !== 'verified') {
    html += '<button class="btn btn-green btn-sm" onclick="openDrvApprove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Approve</button>';
  }
  if (rv.verificationStatus !== 'rejected') {
    html += '<button class="btn btn-red btn-sm" onclick="openDrvReject()">Reject</button>';
  }
  if (s.accountStatus === 'suspended') {
    html += '<button class="btn btn-green btn-sm" onclick="drvUnsuspendDriver()">Unsuspend</button>';
  } else {
    html += '<button class="btn btn-ghost btn-sm" onclick="openDrvSuspend()">Suspend</button>';
  }
  html += '<button class="btn btn-ghost btn-sm" onclick="openDrvMessage()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Message</button>';
  html += '</div>';
  html += '</div>'; // end profile-top

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
  html += '<button class="drv-tab" onclick="switchDrvTab(\'documents\',this)">Documents</button>';
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
    html += '<div class="drv-perf-grid">';
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
  html += '<div class="order-detail-field"><div class="order-detail-field-label">NIN</div><div class="order-detail-field-value">' + esc(rv.nin || p.nin || 'N/A') + '</div></div>';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">BVN</div><div class="order-detail-field-value">' + esc(p.bvn || 'N/A') + '</div></div>';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">License Number</div><div class="order-detail-field-value">' + esc(rv.driversLicenseNumber || p.driversLicenseNumber || 'N/A') + '</div></div>';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">License Expiry</div><div class="order-detail-field-value">' + esc(rv.driversLicenseExpiry || p.driversLicenseExpiry || 'N/A') + '</div></div>';
  html += '<div class="order-detail-field"><div class="order-detail-field-label">Verification</div><div class="order-detail-field-value">' + esc(rv.verificationStatus || 'unverified') + (rv.approvedAt ? ' · approved ' + esc(fmtDate(rv.approvedAt)) : '') + '</div></div>';
  if (p.residentialAddress) html += '<div class="order-detail-field order-detail-field-wide"><div class="order-detail-field-label">Address</div><div class="order-detail-field-value">' + esc(p.residentialAddress) + '</div></div>';
  if (p.emergencyContact && p.emergencyContact.name) {
    html += '<div class="order-detail-field"><div class="order-detail-field-label">Emergency Contact</div><div class="order-detail-field-value">' + esc(p.emergencyContact.name) + '</div></div>';
    html += '<div class="order-detail-field"><div class="order-detail-field-label">Emergency Phone</div><div class="order-detail-field-value">' + esc(p.emergencyContact.phone || '') + '</div></div>';
  }
  html += '</div></div>';
  html += '</div>';

  // Tab: Documents (KYC uploads)
  html += '<div class="drv-tab-panel" id="drv-tab-documents">';
  html += '<div class="drv-section"><div class="drv-section-header"><div class="drv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> KYC Documents</div>';
  html += '<div class="dri-doc-upload">';
  html += '<select id="dri-doc-type" class="search" style="width:auto">' +
    '<option value="license">Driver Licence</option>' +
    '<option value="nin">NIN</option>' +
    '<option value="id_card">ID Card</option>' +
    '<option value="vehicle_registration">Vehicle Registration</option>' +
    '<option value="insurance">Insurance</option>' +
    '<option value="profile_photo">Profile Photo</option>' +
    '<option value="other">Other</option>' +
  '</select>';
  html += '<label class="btn btn-accent btn-sm" style="cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload<input type="file" accept="image/*" style="display:none" onchange="driUploadDoc(this)"></label>';
  html += '</div></div>';
  html += '<div id="drv-documents-body"><div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading documents...</div></div></div>';
  html += '</div></div>';

  document.getElementById('drv-detail-content').innerHTML = html;
}

function switchDrvTab(tab, btn) {
  document.querySelectorAll('.drv-tab').forEach(function(t) { t.classList.remove('on'); });
  document.querySelectorAll('.drv-tab-panel').forEach(function(p) { p.classList.remove('on'); });
  btn.classList.add('on');
  var panel = document.getElementById('drv-tab-' + tab);
  if (panel) panel.classList.add('on');
  if (tab === 'rides' && currentDriverId) loadDriverRides(currentDriverId, 1, '');
  if (tab === 'documents' && currentDriverId) loadDriverDocuments(currentDriverId);
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

// ═══════════════ DRIVERS UPGRADES (KYC, approval, map, import/export) ═══════════════

function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('on');
}

// ─── List / Map view toggle ────────────────────────────────────────

var driversView = 'list';
var driMap = null;
var driMapMarkers = {};
var driMapTimer = null;
var driMapLoading = false;

function setDriversView(view) {
  driversView = view === 'map' ? 'map' : 'list';
  var segList = document.getElementById('dri-seg-list');
  var segMap = document.getElementById('dri-seg-map');
  if (segList) segList.classList.toggle('on', driversView === 'list');
  if (segMap) segMap.classList.toggle('on', driversView === 'map');
  var mapWrap = document.getElementById('dri-map-wrap');
  var list = document.getElementById('dri-list');
  if (!mapWrap || !list) return;
  if (driversView === 'map') {
    mapWrap.style.display = '';
    list.style.display = 'none';
    initDriverMap();
    refreshDriverMap();
    if (driMapTimer) clearInterval(driMapTimer);
    driMapTimer = setInterval(refreshDriverMap, 30000);
  } else {
    mapWrap.style.display = 'none';
    list.style.display = '';
    if (driMapTimer) { clearInterval(driMapTimer); driMapTimer = null; }
  }
}

function initDriverMap() {
  if (driMap || typeof L === 'undefined') return;
  // Default view: Badagry axis (the served area), zoomed to the fleet.
  driMap = L.map('dri-map', { zoomControl: true }).setView([6.435, 2.875], 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }).addTo(driMap);
}

function driFmtAge(seconds) {
  if (seconds === null || seconds === undefined) return 'unknown';
  if (seconds < 60) return seconds + 's ago';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

async function refreshDriverMap() {
  if (driMapLoading || !driMap) return;
  driMapLoading = true;
  var bar = document.getElementById('dri-map-bar');
  try {
    var res = await api('GET', '/drivers/locations');
    var drivers = res.data.drivers || [];
    var seen = {};

    if (bar) {
      if (!drivers.length) {
        bar.innerHTML = '<strong>No driver has reported a location yet.</strong> Positions appear here once the driver app sends a GPS update — nothing on this map is simulated.';
      } else {
        bar.innerHTML = '<strong>' + drivers.length + '</strong> driver' + (drivers.length !== 1 ? 's' : '') + ' with a reported position · <strong>' + (res.data.online || 0) + '</strong> online · <strong>' + (res.data.fresh || 0) + '</strong> updated in the last 2 minutes';
      }
    }

    drivers.forEach(function(d) {
      if (!Number.isFinite(d.latitude) || !Number.isFinite(d.longitude)) return;
      seen[d.id] = true;
      var color = d.stale ? '#8a8a9e' : (d.onlineStatus === 'online' ? '#2ecc71' : '#E88A3A');
      var marker = driMapMarkers[d.id];
      if (!marker) {
        marker = L.circleMarker([d.latitude, d.longitude], {
          radius: 9,
          color: color,
          fillColor: color,
          fillOpacity: 0.85,
          weight: 2
        }).addTo(driMap);
        driMapMarkers[d.id] = marker;
      } else {
        marker.setLatLng([d.latitude, d.longitude]);
        marker.setStyle({ color: color, fillColor: color });
      }
      var popup = '<div class="dri-map-popup">' +
        '<div class="dri-map-popup-name">' + esc(d.fullName || 'Driver') + '</div>' +
        '<div class="dri-map-popup-line">' + esc(d.driverId || d.id.substring(0, 8)) + ' · ' + esc(d.onlineStatus || 'offline') + '</div>' +
        (d.vehicle.plateNumber ? '<div class="dri-map-popup-line">' + esc(d.vehicle.plateNumber) + '</div>' : '') +
        '<div class="dri-map-popup-line ' + (d.stale ? 'stale' : 'fresh') + '">Position ' + (d.stale ? 'stale — ' : 'updated ') + driFmtAge(d.ageSeconds) + '</div>' +
        '<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="closeDriverDetails();openDriverDetails(\'' + d.id + '\')">View driver</button>' +
        '</div>';
      marker.bindPopup(popup);
    });

    // Hide markers for drivers whose position was cleared
    Object.keys(driMapMarkers).forEach(function(id) {
      if (!seen[id]) {
        driMap.removeLayer(driMapMarkers[id]);
        delete driMapMarkers[id];
      }
    });
  } catch (e) {
    if (bar) bar.innerHTML = 'Failed to load driver locations: ' + esc(e.message) + ' <button class="btn btn-ghost btn-sm" onclick="refreshDriverMap()">Retry</button>';
  } finally {
    driMapLoading = false;
  }
}

// ─── Licence expiry alerts ────────────────────────────────────────

var driAlertsCache = { at: 0, data: null };

function scheduleDriAlertPill() {
  if (Date.now() - driAlertsCache.at < 60000 && driAlertsCache.data) return;
  driAlertsCache.at = Date.now();
  loadDriAlertPill();
}

async function loadDriAlertPill() {
  try {
    var res = await api('GET', '/drivers/license-alerts');
    driAlertsCache.data = res.data;
    driAlertsCache.at = Date.now();
    renderDriAlertPill(res.data);
  } catch (e) { /* pill is non-critical */ }
}

function renderDriAlertPill(data) {
  var pill = document.getElementById('dri-alert-pill');
  var strip = document.getElementById('dri-license-strip');
  var summary = data.summary || {};
  var total = summary.total || 0;
  if (pill) {
    if (total > 0) {
      pill.style.display = '';
      pill.textContent = total;
    } else {
      pill.style.display = 'none';
    }
  }
  if (strip) {
    if (total > 0) {
      strip.style.display = '';
      strip.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        '<span><strong>' + (summary.expired || 0) + '</strong> expired · <strong>' + (summary.expiring || 0) + '</strong> expiring within ' + (summary.windowDays || 30) + ' days</span>' +
        '<button class="btn btn-ghost btn-sm" onclick="openDriLicenseAlerts()">Review</button>';
    } else {
      strip.style.display = 'none';
      strip.innerHTML = '';
    }
  }
}

async function openDriLicenseAlerts() {
  var listEl = document.getElementById('drv-alerts-list');
  var sumEl = document.getElementById('drv-alerts-summary');
  if (sumEl) sumEl.textContent = 'Loading…';
  if (listEl) listEl.innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading alerts...</div></div>';
  document.getElementById('drvAlertsModal').classList.add('on');
  try {
    var res = await api('GET', '/drivers/license-alerts');
    driAlertsCache.data = res.data;
    driAlertsCache.at = Date.now();
    renderDriAlertPill(res.data);
    var alerts = res.data.alerts || [];
    var sum = res.data.summary || {};
    if (sumEl) {
      sumEl.textContent = alerts.length
        ? sum.expired + ' expired · ' + sum.expiring + ' expiring within ' + sum.windowDays + ' days'
        : 'No licences expire within the next ' + (sum.windowDays || 30) + ' days.';
    }
    if (!alerts.length) {
      listEl.innerHTML = '<div class="drv-empty-inline"><div class="drv-empty-inline-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg></div><div class="drv-empty-inline-text">All driver licences are valid for now.</div></div>';
      return;
    }
    var html = '';
    alerts.forEach(function(a) {
      var expired = a.expired;
      var days = a.daysRemaining;
      html += '<div class="drv-alert-row" onclick="closeModal(\'drvAlertsModal\');openDriverDetails(\'' + a.id + '\')">';
      html += '<div class="drv-alert-avatar">' + getInitials(a.fullName) + '</div>';
      html += '<div class="drv-alert-info"><div class="drv-alert-name">' + esc(a.fullName) + '</div>';
      html += '<div class="drv-alert-meta">' + esc(a.licenseNumber || 'No licence number') + ' · ' + esc(a.phoneNumber || '') + '</div></div>';
      html += '<div class="drv-alert-right">';
      html += '<span class="drv-alert-days ' + (expired ? 'expired' : 'expiring') + '">' + (expired ? Math.abs(days) + 'd overdue' : days + 'd left') + '</span>';
      html += '<div class="drv-alert-date">Expires ' + esc(fmtDate(a.licenseExpiry)) + '</div>';
      html += '</div></div>';
    });
    listEl.innerHTML = html;
  } catch (e) {
    if (sumEl) sumEl.textContent = '';
    if (listEl) listEl.innerHTML = '<div class="drv-error"><div class="drv-error-title">Failed to load alerts</div><div class="drv-error-text">' + esc(e.message) + '</div></div>';
  }
}

// ─── Export ────────────────────────────────────────────────────────

async function exportDriversFile(format) {
  load(true);
  try {
    var r = await apiDownload('/drivers/export?format=' + encodeURIComponent(format), 'drivers-export.' + format);
    toast('Exported ' + (r.rows || '0') + ' drivers (' + format.toUpperCase() + ')', true);
  } catch (e) {
    toast(e.message, false);
  } finally {
    load(false);
  }
}

// ─── Import wizard ─────────────────────────────────────────────────

var driImportCsv = '';
var driImportRows = [];

function driImportSetStep(n) {
  [1, 2, 3].forEach(function(i) {
    var el = document.getElementById('dri-import-step' + i);
    if (el) el.style.display = i === n ? '' : 'none';
  });
  var steps = document.querySelectorAll('#dri-import-steps li');
  steps.forEach(function(li, idx) { li.classList.toggle('on', idx + 1 === n); });
}

function openDriImport() {
  driImportCsv = '';
  driImportRows = [];
  var paste = document.getElementById('dri-import-paste');
  var file = document.getElementById('dri-import-file');
  var label = document.getElementById('dri-import-file-label');
  if (paste) paste.value = '';
  if (file) file.value = '';
  if (label) label.textContent = 'Click to choose a .csv file';
  driImportSetStep(1);
  document.getElementById('drvImportModal').classList.add('on');
}

function closeDriImport() {
  closeModal('drvImportModal');
}

function driImportFilePicked(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var label = document.getElementById('dri-import-file-label');
  if (label) label.textContent = file.name;
  var reader = new FileReader();
  reader.onload = function() {
    driImportCsv = String(reader.result || '');
  };
  reader.readAsText(file);
}

function driImportGatherCsv() {
  var paste = document.getElementById('dri-import-paste');
  if (paste && paste.value.trim()) return paste.value;
  return driImportCsv;
}

async function driImportPreview() {
  var csv = driImportGatherCsv();
  if (!csv.trim()) {
    toast('Choose a CSV file or paste CSV content first.', false);
    return;
  }
  var btn = document.getElementById('dri-import-next');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  try {
    var res = await api('POST', '/drivers/import/preview', { csv: csv });
    driImportRows = res.data.rows || [];
    renderDriImportPreview(res.data.summary || {});
    driImportSetStep(2);
  } catch (e) {
    toast(e.message, false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Preview'; }
  }
}

function renderDriImportPreview(summary) {
  var sum = document.getElementById('dri-import-summary');
  if (sum) {
    sum.innerHTML = '<span class="dri-sum-ok">' + summary.valid + ' valid</span> · <span class="dri-sum-bad">' + summary.invalid + ' with errors</span> of ' + summary.total + ' rows';
  }
  var table = document.getElementById('dri-import-table');
  var html = '<thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Result</th></tr></thead><tbody>';
  driImportRows.forEach(function(r) {
    var d = r.data || {};
    html += '<tr class="' + (r.valid ? 'ok' : 'bad') + '">';
    html += '<td>' + r.rowNumber + '</td>';
    html += '<td>' + esc(d.fullName || '') + '</td>';
    html += '<td>' + esc(d.phoneNumber || '') + '</td>';
    html += '<td>' + (r.valid ? 'Ready to import' : esc(r.errors.join('; '))) + '</td>';
    html += '</tr>';
  });
  html += '</tbody>';
  if (table) table.innerHTML = html;
  var commitBtn = document.getElementById('dri-import-commit');
  if (commitBtn) {
    commitBtn.disabled = !summary.valid;
    commitBtn.textContent = 'Import ' + summary.valid + ' Valid Row' + (summary.valid === 1 ? '' : 's');
  }
}

function driImportBack() {
  driImportSetStep(1);
}

async function driImportCommit() {
  var valid = driImportRows.filter(function(r) { return r.valid; });
  if (!valid.length) {
    toast('No valid rows to import.', false);
    return;
  }
  var btn = document.getElementById('dri-import-commit');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
  try {
    var res = await api('POST', '/drivers/import/commit', { rows: valid });
    var created = res.data.created || 0;
    var skipped = res.data.skipped || 0;
    var done = document.getElementById('dri-import-done');
    if (done) {
      done.innerHTML = '<div class="dri-import-done-icon">✓</div>' +
        '<div class="dri-import-done-title">' + created + ' driver' + (created === 1 ? '' : 's') + ' imported</div>' +
        (skipped ? '<div class="dri-import-done-sub">' + skipped + ' skipped (already registered)</div>' : '') +
        '<div class="dri-import-done-sub">Drivers were created with status <strong>pending</strong> and will need approval before going online.</div>';
    }
    driImportSetStep(3);
    loadAllData();
  } catch (e) {
    toast(e.message, false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Import Rows'; }
  }
}

// ─── Fleet announcement ────────────────────────────────────────────

var driAnnEstTimer = null;
var driAnnSelected = [];

function openDriAnnounce() {
  driAnnSelected = [];
  var seg = document.getElementById('dri-ann-segment');
  if (seg) seg.value = 'all';
  var title = document.getElementById('dri-ann-title');
  var msg = document.getElementById('dri-ann-message');
  if (title) title.value = '';
  if (msg) msg.value = '';
  var err = document.getElementById('dri-ann-err');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  driAnnounceSegmentChange();
  document.getElementById('drvAnnounceModal').classList.add('on');
}

function driAnnounceSegmentChange() {
  var seg = document.getElementById('dri-ann-segment');
  var value = seg ? seg.value : 'all';
  var valueWrap = document.getElementById('dri-ann-value-wrap');
  var valueSel = document.getElementById('dri-ann-value');
  var valueLabel = document.getElementById('dri-ann-value-label');
  var pickWrap = document.getElementById('dri-ann-pick-wrap');

  if (value === 'online') {
    valueWrap.style.display = '';
    valueLabel.textContent = 'Connection';
    valueSel.innerHTML = '<option value="online">Online drivers</option><option value="offline">Offline drivers</option>';
    pickWrap.style.display = 'none';
  } else if (value === 'status') {
    valueWrap.style.display = '';
    valueLabel.textContent = 'Account status';
    valueSel.innerHTML = ['pending', 'active', 'suspended', 'inactive'].map(function(s) {
      return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join('');
    pickWrap.style.display = 'none';
  } else if (value === 'specific') {
    valueWrap.style.display = 'none';
    pickWrap.style.display = '';
    driAnnRenderPicked();
    driAnnRenderResults('');
  } else {
    valueWrap.style.display = 'none';
    pickWrap.style.display = 'none';
  }
  driAnnounceQueueEstimate();
}

function driAnnounceBody() {
  var seg = document.getElementById('dri-ann-segment');
  var val = document.getElementById('dri-ann-value');
  var segment = seg ? seg.value : 'all';
  var body = { recipientType: 'driver', segment: segment, segmentValue: null, recipientIds: [] };
  if (segment === 'online' || segment === 'status') body.segmentValue = val.value;
  if (segment === 'specific') body.recipientIds = driAnnSelected.map(function(r) { return r.id; });
  return body;
}

function driAnnounceQueueEstimate() {
  clearTimeout(driAnnEstTimer);
  var el = document.getElementById('dri-ann-estimate');
  if (el) el.textContent = 'Estimating reach…';
  driAnnEstTimer = setTimeout(driAnnounceRunEstimate, 350);
}

async function driAnnounceRunEstimate() {
  var el = document.getElementById('dri-ann-estimate');
  var body = driAnnounceBody();
  if (body.segment === 'specific' && !body.recipientIds.length) {
    if (el) el.textContent = 'Pick at least one driver.';
    return;
  }
  try {
    var res = await api('POST', '/notifications/audience/estimate', body);
    if (el) {
      el.innerHTML = 'Reaches <strong>' + Number(res.data.matched).toLocaleString() + '</strong> driver' + (res.data.matched === 1 ? '' : 's') +
        ' · <strong>' + Number(res.data.reachable).toLocaleString() + '</strong> with a registered device';
    }
  } catch (e) {
    if (el) el.textContent = 'Could not estimate reach: ' + e.message;
  }
}

function driAnnRenderPicked() {
  var el = document.getElementById('dri-ann-picked');
  if (!el) return;
  if (!driAnnSelected.length) {
    el.innerHTML = '<span class="dri-ann-none">No drivers selected yet</span>';
    return;
  }
  el.innerHTML = driAnnSelected.map(function(r) {
    return '<span class="dri-ann-chip">' + esc(r.name) + '<button onclick="driAnnRemove(\'' + r.id + '\')" title="Remove">×</button></span>';
  }).join('');
}

function driAnnRenderResults(query) {
  var el = document.getElementById('dri-ann-results');
  if (!el) return;
  var q = (query || '').toLowerCase();
  var pickedIds = {};
  driAnnSelected.forEach(function(r) { pickedIds[r.id] = true; });
  var matches = Object.keys(cachedDrivers).filter(function(id) {
    if (pickedIds[id]) return false;
    if (!q) return true;
    var d = cachedDrivers[id];
    return (d.fullName || '').toLowerCase().indexOf(q) >= 0 || (d.phoneNumber || '').indexOf(q) >= 0;
  }).slice(0, 8);
  if (!q) { el.innerHTML = ''; return; }
  if (!matches.length) {
    el.innerHTML = '<div class="dri-ann-none">No matching drivers</div>';
    return;
  }
  el.innerHTML = matches.map(function(id) {
    var d = cachedDrivers[id];
    return '<div class="dri-ann-result" onclick="driAnnAdd(\'' + id + '\')">' +
      '<span>' + esc(d.fullName) + '</span><span class="dri-ann-result-phone">' + esc(d.phoneNumber || '') + '</span>' +
      '</div>';
  }).join('');
}

function driAnnAdd(id) {
  var d = cachedDrivers[id];
  if (!d) return;
  if (!driAnnSelected.some(function(r) { return r.id === id; })) {
    driAnnSelected.push({ id: id, name: d.fullName || id });
  }
  var search = document.getElementById('dri-ann-search');
  if (search) search.value = '';
  driAnnRenderPicked();
  driAnnRenderResults('');
  driAnnounceQueueEstimate();
}

function driAnnRemove(id) {
  driAnnSelected = driAnnSelected.filter(function(r) { return r.id !== id; });
  driAnnRenderPicked();
  driAnnounceQueueEstimate();
}

async function driAnnounceSend() {
  var title = (document.getElementById('dri-ann-title').value || '').trim();
  var message = (document.getElementById('dri-ann-message').value || '').trim();
  var err = document.getElementById('dri-ann-err');
  var body = driAnnounceBody();

  var errors = [];
  if (!title) errors.push('Title is required.');
  if (!message) errors.push('Message is required.');
  if (message.length > 1000) errors.push('Message must be 1000 characters or fewer.');
  if (body.segment === 'specific' && !body.recipientIds.length) errors.push('Pick at least one driver.');
  if (errors.length) {
    if (err) { err.style.display = ''; err.textContent = errors[0]; }
    return;
  }
  if (err) err.style.display = 'none';

  var btn = document.getElementById('dri-ann-send');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    var payload = {
      title: title,
      message: message,
      imageUrl: '',
      recipientType: 'driver',
      segment: body.segment,
      segmentValue: body.segmentValue,
      recipientIds: body.recipientIds
    };
    var res = await api('POST', '/notifications', payload);
    closeModal('drvAnnounceModal');
    toast(res.message || 'Announcement queued for delivery', true);
  } catch (e) {
    if (err) { err.style.display = ''; err.textContent = e.message; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Announcement'; }
  }
}

// ─── KYC documents ─────────────────────────────────────────────────

var DRI_DOC_LABELS = {
  license: 'Driver Licence',
  nin: 'NIN',
  id_card: 'ID Card',
  vehicle_registration: 'Vehicle Registration',
  insurance: 'Insurance',
  profile_photo: 'Profile Photo',
  other: 'Other'
};

async function loadDriverDocuments(id) {
  var body = document.getElementById('drv-documents-body');
  if (!body) return;
  body.innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading documents...</div></div>';
  try {
    var res = await api('GET', '/drivers/' + id + '/documents');
    renderDriverDocuments(res.data.documents || []);
  } catch (e) {
    body.innerHTML = '<div class="drv-error"><div class="drv-error-title">Failed to load documents</div><div class="drv-error-text">' + esc(e.message) + '</div><button class="btn btn-accent btn-sm" onclick="loadDriverDocuments(\'' + id + '\')">Retry</button></div>';
  }
}

function renderDriverDocuments(docs) {
  var body = document.getElementById('drv-documents-body');
  if (!body) return;
  if (!docs.length) {
    body.innerHTML = '<div class="drv-empty-inline"><div class="drv-empty-inline-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="drv-empty-inline-text">No documents uploaded yet — use the upload button above to attach KYC files.</div></div>';
    return;
  }
  var html = '<div class="drv-doc-grid">';
  docs.forEach(function(d) {
    var cls = d.verificationStatus === 'verified' ? 'verified' : (d.verificationStatus === 'rejected' ? 'rejected' : 'pending');
    html += '<div class="drv-doc-card ' + cls + '">';
    html += '<div class="drv-doc-thumb" onclick="driViewDoc(\'' + esc(d.fileUrl) + '\',\'' + esc(DRI_DOC_LABELS[d.documentType] || d.documentType) + '\')">';
    html += '<img src="' + esc(d.fileUrl) + '" alt="' + esc(d.documentType) + '" loading="lazy">';
    html += '</div>';
    html += '<div class="drv-doc-info">';
    html += '<div class="drv-doc-type">' + esc(DRI_DOC_LABELS[d.documentType] || d.documentType) + '</div>';
    html += '<span class="drv-doc-status ' + cls + '">' + esc(d.verificationStatus) + '</span>';
    html += '<div class="drv-doc-date">' + esc(fmtDate(d.createdAt)) + (d.verifiedBy ? ' · by ' + esc(d.verifiedBy) : '') + '</div>';
    if (d.rejectionReason) html += '<div class="drv-doc-reason">' + esc(d.rejectionReason) + '</div>';
    html += '<div class="drv-doc-acts">';
    if (d.verificationStatus !== 'verified') html += '<button class="btn btn-green btn-sm" onclick="driSetDocStatus(\'' + d.id + '\',\'verified\')">Verify</button>';
    if (d.verificationStatus !== 'rejected') html += '<button class="btn btn-red btn-sm" onclick="driRejectDoc(\'' + d.id + '\')">Reject</button>';
    html += '<button class="btn btn-ghost btn-sm" onclick="driDeleteDoc(\'' + d.id + '\')">Delete</button>';
    html += '</div></div></div>';
  });
  html += '</div>';
  body.innerHTML = html;
}

async function driUploadDoc(input) {
  var file = input.files && input.files[0];
  if (!file || !currentDriverId) return;
  var typeSel = document.getElementById('dri-doc-type');
  var type = typeSel ? typeSel.value : 'other';
  load(true);
  try {
    var fd = new FormData();
    fd.append('image', file);
    fd.append('documentType', type);
    await apiUpload('/drivers/' + currentDriverId + '/documents', fd);
    toast('Document uploaded', true);
    loadDriverDocuments(currentDriverId);
  } catch (e) {
    toast(e.message, false);
  } finally {
    load(false);
    input.value = '';
  }
}

async function driSetDocStatus(docId, status, reason) {
  if (!currentDriverId) return;
  load(true);
  try {
    await api('PATCH', '/drivers/' + currentDriverId + '/documents/' + docId, {
      verificationStatus: status,
      rejectionReason: reason || ''
    });
    toast('Document ' + status, true);
    loadDriverDocuments(currentDriverId);
  } catch (e) {
    toast(e.message, false);
  } finally {
    load(false);
  }
}

function driRejectDoc(docId) {
  openDrvReason({
    title: 'Reject Document',
    desc: 'The driver will see this reason on their uploaded document.',
    placeholder: 'e.g. The licence image is blurred and unreadable',
    confirmText: 'Reject',
    onConfirm: function(reason) {
      driSetDocStatus(docId, 'rejected', reason);
    }
  });
}

function driDeleteDoc(docId) {
  showDel('Delete this document? The uploaded file is removed as well.', async function() {
    if (!currentDriverId) return;
    load(true);
    try {
      await api('DELETE', '/drivers/' + currentDriverId + '/documents/' + docId);
      toast('Document deleted');
      loadDriverDocuments(currentDriverId);
    } catch (e) {
      toast(e.message, false);
    } finally {
      load(false);
    }
  });
}

function driViewDoc(url, name) {
  document.getElementById('drv-doc-title').textContent = name || 'Document';
  var img = document.getElementById('drv-doc-img');
  img.src = url;
  document.getElementById('drv-doc-open').href = url;
  document.getElementById('drvDocModal').classList.add('on');
}

// ─── Approval / suspension / messaging ─────────────────────────────

var drvReasonCb = null;

function openDrvReason(opts) {
  drvReasonCb = opts.onConfirm || null;
  document.getElementById('drv-reason-title').textContent = opts.title || 'Reason';
  var desc = document.getElementById('drv-reason-desc');
  desc.textContent = opts.desc || '';
  desc.style.display = opts.desc ? '' : 'none';
  var input = document.getElementById('drv-reason-input');
  input.value = '';
  input.placeholder = opts.placeholder || 'Enter the reason...';
  var btn = document.getElementById('drv-reason-confirm');
  btn.textContent = opts.confirmText || 'Confirm';
  btn.className = 'btn ' + (opts.danger === false ? 'btn-accent' : 'btn-red');
  document.getElementById('drvReasonModal').classList.add('on');
  setTimeout(function() { input.focus(); }, 120);
}

function closeDrvReason() {
  closeModal('drvReasonModal');
  drvReasonCb = null;
}

function confirmDrvReason() {
  var input = document.getElementById('drv-reason-input');
  var reason = (input.value || '').trim();
  if (reason.length < 3) {
    toast('Please enter a reason of at least 3 characters.', false);
    input.focus();
    return;
  }
  if (reason.length > 500) {
    toast('Reason must be 500 characters or fewer.', false);
    return;
  }
  var cb = drvReasonCb;
  closeDrvReason();
  if (cb) cb(reason);
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    ['drvReasonModal', 'drvMessageModal', 'drvApproveModal', 'drvAlertsModal', 'drvImportModal', 'drvAnnounceModal', 'drvDocModal'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el && el.classList.contains('on')) el.classList.remove('on');
    });
  }
});

function openDrvApprove() {
  var rv = (currentDriverDetails && currentDriverDetails.review) || {};
  var checks = [
    { label: 'Licence number recorded', ok: !!rv.driversLicenseNumber },
    { label: 'Licence not expired', ok: !!rv.driversLicenseExpiry && new Date(rv.driversLicenseExpiry) >= new Date(new Date().toDateString()) },
    { label: 'NIN recorded', ok: !!rv.nin }
  ];
  var allOk = checks.every(function(c) { return c.ok; });
  document.getElementById('drv-approve-desc').textContent = allOk
    ? 'Approving activates this driver immediately — they can sign in and go online.'
    : 'This driver cannot be approved yet. The following requirements are missing:';
  document.getElementById('drv-approve-checks').innerHTML = checks.map(function(c) {
    return '<div class="drv-check ' + (c.ok ? 'ok' : 'bad') + '">' +
      (c.ok ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>') +
      '<span>' + esc(c.label) + '</span></div>';
  }).join('');
  var btn = document.getElementById('drv-approve-confirm');
  btn.disabled = !allOk;
  btn.textContent = allOk ? 'Approve' : 'Requirements missing';
  document.getElementById('drvApproveModal').classList.add('on');
}

async function drvApproveDriver() {
  if (!currentDriverId) return;
  var btn = document.getElementById('drv-approve-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
  load(true);
  try {
    await api('POST', '/drivers/' + currentDriverId + '/approve');
    closeModal('drvApproveModal');
    toast('Driver approved', true);
    loadDriverDetails(currentDriverId);
    loadAllData();
  } catch (e) {
    toast(e.message, false);
  } finally {
    load(false);
    if (btn) { btn.disabled = false; btn.textContent = 'Approve'; }
  }
}

function openDrvReject() {
  openDrvReason({
    title: 'Reject Driver',
    desc: 'The driver will be notified with this reason. Their account stays inactive until re-reviewed.',
    placeholder: 'e.g. Licence details do not match the uploaded document',
    confirmText: 'Reject Driver',
    onConfirm: function(reason) { drvRejectDriver(reason); }
  });
}

async function drvRejectDriver(reason) {
  if (!currentDriverId) return;
  load(true);
  try {
    await api('POST', '/drivers/' + currentDriverId + '/reject', { reason: reason });
    toast('Driver rejected', true);
    loadDriverDetails(currentDriverId);
    loadAllData();
  } catch (e) {
    toast(e.message, false);
  } finally {
    load(false);
  }
}

function openDrvSuspend() {
  openDrvReason({
    title: 'Suspend Driver',
    desc: 'The driver is taken offline immediately and notified with this reason.',
    placeholder: 'e.g. Repeated complaints about reckless driving',
    confirmText: 'Suspend',
    onConfirm: function(reason) { drvSuspendDriver(reason); }
  });
}

async function drvSuspendDriver(reason) {
  if (!currentDriverId) return;
  load(true);
  try {
    await api('POST', '/drivers/' + currentDriverId + '/suspend', { reason: reason });
    toast('Driver suspended', true);
    loadDriverDetails(currentDriverId);
    loadAllData();
  } catch (e) {
    toast(e.message, false);
  } finally {
    load(false);
  }
}

function drvUnsuspendDriver() {
  showDel('Lift the suspension on this driver? They will be able to sign in again.', async function() {
    if (!currentDriverId) return;
    load(true);
    try {
      await api('POST', '/drivers/' + currentDriverId + '/unsuspend');
      toast('Driver reinstated', true);
      loadDriverDetails(currentDriverId);
      loadAllData();
    } catch (e) {
      toast(e.message, false);
    } finally {
      load(false);
    }
  });
}

function openDrvMessage() {
  var p = (currentDriverDetails && currentDriverDetails.profile) || {};
  document.getElementById('drv-msg-to').textContent = 'To: ' + (p.fullName || 'Driver') + (p.phoneNumber ? ' · ' + p.phoneNumber : '');
  document.getElementById('drv-msg-title').value = '';
  document.getElementById('drv-msg-body').value = '';
  document.getElementById('drv-msg-count').textContent = '0';
  document.getElementById('drvMessageModal').classList.add('on');
  setTimeout(function() { document.getElementById('drv-msg-title').focus(); }, 120);
}

async function drvMessageDriver() {
  if (!currentDriverId) return;
  var title = (document.getElementById('drv-msg-title').value || '').trim();
  var message = (document.getElementById('drv-msg-body').value || '').trim();
  if (!title || !message) {
    toast('Both a title and a message are required.', false);
    return;
  }
  var btn = document.getElementById('drv-msg-send');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    var res = await api('POST', '/drivers/' + currentDriverId + '/message', { title: title, message: message });
    closeModal('drvMessageModal');
    toast(res.data.pushSent ? 'Message sent (in-app + push)' : 'Message saved in-app (driver has no registered device)', true);
  } catch (e) {
    toast(e.message, false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
  }
}
