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

    html += '<div class="driver-card">' +
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
