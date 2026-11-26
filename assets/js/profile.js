// ═══════════════ MY PROFILE ═══════════════

var pfState = { loading: false, loaded: false };
var pfProfile = null;
var pfPermissions = [];
var pfSessions = [];

function pfShowState(state, message) {
  var loading = document.getElementById('pf-loading');
  var error = document.getElementById('pf-error');
  var grid = document.getElementById('pf-grid');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') {
      var t = document.getElementById('pf-error-text');
      if (t) t.textContent = message || 'Something went wrong';
    }
  }
  if (grid) grid.style.display = state === 'loading' || state === 'error' ? 'none' : '';
}

function loadProfilePanel(force) {
  if (pfState.loading) return;
  if (!force && pfState.loaded) return;
  pfState.loading = true;
  pfShowState('loading');

  var restricted = window.adminEnrollmentRestricted === true;
  var sessionVersion = window.adminProfileSessionVersion || 0;
  Promise.resolve().then(async function () {
    if (restricted) {
      var authorization = await api('GET', '/security/enrollment/status');
      if (!authorization.data || Date.parse(authorization.data.expires_at) <= Date.now()) {
        throw new Error('Security enrollment authorization is required. Ask a Super Admin to authorize your enrollment, then retry.');
      }
    }
    return Promise.all([api('GET', '/profile'), restricted ? Promise.resolve({ data: { sessions: [] } }) : api('GET', '/profile/sessions')]);
  })
    .then(function(results) {
      if (sessionVersion !== (window.adminProfileSessionVersion || 0)) return;
      var data = results[0].data || {};
      pfProfile = data.profile || null;
      pfPermissions = Array.isArray(data.permissions) ? data.permissions : [];
      pfSessions = (results[1].data && results[1].data.sessions) || [];
      pfState.loaded = true;
       pfShowState('ready');
       renderProfile();
       renderPfSessions();
       if (typeof pfLoadSecurity === 'function') pfLoadSecurity();
    })
    .catch(function(e) {
      if (sessionVersion !== (window.adminProfileSessionVersion || 0)) return;
      pfShowState('error', e.message);
      toast('Error: ' + e.message, false);
    })
    .finally(function() {
      if (sessionVersion !== (window.adminProfileSessionVersion || 0)) return;
      pfState.loading = false;
    });
}

function renderProfile() {
  var p = pfProfile;
  if (!p) return;

  var host = document.getElementById('pf-identity');
  if (host) {
    var initials = (p.fullName || p.email || 'A').trim().split(/\s+/).slice(0, 2)
      .map(function(w) { return w.charAt(0); }).join('').toUpperCase() || 'A';
    host.innerHTML =
      '<div class="side-foot-avatar pf-avatar">' + esc(initials) + '</div>' +
      '<div class="pf-id-info">' +
        '<div class="pf-id-name">' + esc(p.fullName || '—') + '</div>' +
        '<div class="pf-id-email">' + esc(p.email) + '</div>' +
        '<div class="pf-id-meta">' +
          '<span class="tag tag-pending">' + esc(p.roleLabel || p.role) + '</span>' +
          (p.active ? '<span class="tag tag-confirmed">Active</span>' : '<span class="tag tag-cancelled">Disabled</span>') +
        '</div>' +
         '<div class="pf-id-facts">' +
           '<span><b>Last login</b>' + (p.lastLogin ? esc(fmtDate(p.lastLogin)) : '—') + '</span>' +
           '<span><b>Password changed</b>' + (p.passwordChangedAt ? esc(fmtDate(p.passwordChangedAt)) : '—') + '</span>' +
           '<span><b>Member since</b>' + (p.createdAt ? esc(fmtDate(p.createdAt)) : '—') + '</span>' +
        '</div>' +
      '</div>';
  }

  var nameInput = document.getElementById('pf-name');
  var phoneInput = document.getElementById('pf-phone');
  if (nameInput && !nameInput.value) nameInput.value = p.fullName || '';
  if (phoneInput && !phoneInput.value) phoneInput.value = p.phone || '';

  var count = document.getElementById('pf-count');
  var wildcard = pfPermissions.indexOf('*') >= 0;
  if (count) {
    count.textContent = (p.roleDescription || p.roleLabel || p.role || '') + ' · ' + (wildcard ? 'All permissions' : pfPermissions.length + (pfPermissions.length === 1 ? ' permission' : ' permissions'));
    count.title = count.textContent;
  }

  var note = document.getElementById('pf-role-note');
  if (note) {
    note.textContent = p.roleDescription ||
      'Granted by your role (' + (p.roleLabel || p.role) + '). Role changes are made by a Super Admin and are audited.';
  }

  var permsHost = document.getElementById('pf-perms');
  if (permsHost) {
    if (!pfPermissions.length) {
      permsHost.innerHTML = '<p class="pf-note">No permissions are attached to your role yet.</p>';
    } else if (pfPermissions.indexOf('*') >= 0) {
       permsHost.innerHTML = '<span class="pf-perm pf-perm-all">All permissions</span><span class="pf-perm-source">Granted by Super Admin role</span>';
    } else {
      permsHost.innerHTML = pfPermissions.slice().sort().map(function(c) {
        return '<span class="pf-perm">' + esc(c) + '</span>';
      }).join('');
    }
  }

  pfApplyRestrictedState();
}

function pfApplyRestrictedState() {
  var restricted = window.adminEnrollmentRestricted === true;
  var editButton = document.getElementById('pf-edit-button');
  var editToggle = document.getElementById('pf-edit-toggle');
  var editForm = document.getElementById('pf-edit-form');
  var passwordCard = document.querySelector('.pf-password-card');
  if (editButton) editButton.disabled = restricted;
  if (editToggle) { editToggle.hidden = restricted; editToggle.title = restricted ? 'Profile editing is unavailable during security enrollment' : ''; }
  if (editForm && restricted) editForm.style.display = 'none';
  if (passwordCard) { passwordCard.hidden = restricted; passwordCard.classList.toggle('pf-restricted-disabled', restricted); }
  document.querySelectorAll('.pf-sessions-card,.pf-permissions-card').forEach(function (card) { card.hidden = restricted; });
  ['pf-cur-pass','pf-new-pass','pf-new-pass2','pf-pass-save'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.disabled = restricted;
  });
}

function pfToggleEdit() {
  if (window.adminEnrollmentRestricted === true) return;
  var form = document.getElementById('pf-edit-form');
  var toggle = document.getElementById('pf-edit-toggle');
  var err = document.getElementById('pf-edit-err');
  if (!form) return;
  var show = form.style.display === 'none';
  form.style.display = show ? '' : 'none';
  if (toggle) toggle.style.display = show ? 'none' : '';
  if (err) err.textContent = '';
  if (show && pfProfile) {
    var nameInput = document.getElementById('pf-name');
    var phoneInput = document.getElementById('pf-phone');
    if (nameInput) nameInput.value = pfProfile.fullName || '';
    if (phoneInput) phoneInput.value = pfProfile.phone || '';
    if (nameInput) nameInput.focus();
  }
}

function pfSaveProfile() {
  if (window.adminEnrollmentRestricted === true) return;
  var err = document.getElementById('pf-edit-err');
  var save = document.getElementById('pf-edit-save');
  if (err) err.textContent = '';
  var fullName = document.getElementById('pf-name').value.trim();
  var phone = document.getElementById('pf-phone').value.trim();
  if (!fullName) { if (err) err.textContent = 'Name cannot be empty.'; return; }

  save.disabled = true;
  save.textContent = 'Saving...';
  api('PUT', '/profile', { fullName: fullName, phone: phone }).then(function(res) {
    save.disabled = false;
    save.textContent = 'Save changes';
    var data = res.data || {};
    if (pfProfile) {
      pfProfile.fullName = data.fullName;
      pfProfile.phone = data.phone;
    }
    try {
      var u = JSON.parse(localStorage.getItem('admin_user') || '{}') || {};
      u.fullName = data.fullName;
      localStorage.setItem('admin_user', JSON.stringify(u));
    } catch (e) {}
    renderAdminIdentity();
    renderProfile();
    pfToggleEdit();
    toast('Profile updated');
  }).catch(function(e) {
    save.disabled = false;
    save.textContent = 'Save changes';
    if (err) err.textContent = e.message;
  });
}

function pfPassHint() {
  var hint = document.getElementById('pf-pass-hint');
  var a = document.getElementById('pf-new-pass').value;
  var b = document.getElementById('pf-new-pass2').value;
  if (!hint) return;
  if (!a && !b) {
    hint.textContent = 'Minimum 8 characters, different from your current password.';
    hint.className = 'pf-hint';
    return;
  }
  if (a.length < 8) {
    hint.textContent = 'Too short — ' + a.length + '/8 characters.';
    hint.className = 'pf-hint pf-hint-bad';
  } else if (b && a !== b) {
    hint.textContent = 'Passwords do not match.';
    hint.className = 'pf-hint pf-hint-bad';
  } else {
    hint.textContent = 'Looks good.';
    hint.className = 'pf-hint pf-hint-ok';
  }
}

function pfChangePassword() {
  if (window.adminEnrollmentRestricted === true) return;
  var err = document.getElementById('pf-pass-err');
  var save = document.getElementById('pf-pass-save');
  if (err) err.textContent = '';
  var current = document.getElementById('pf-cur-pass').value;
  var next = document.getElementById('pf-new-pass').value;
  var confirm = document.getElementById('pf-new-pass2').value;

  if (!current) { if (err) err.textContent = 'Current password is required.'; return; }
  if (next.length < 8) { if (err) err.textContent = 'New password must be at least 8 characters.'; return; }
  if (next !== confirm) { if (err) err.textContent = 'The new passwords do not match.'; return; }
  if (next === current) { if (err) err.textContent = 'New password must differ from the current one.'; return; }

  save.disabled = true;
  save.textContent = 'Changing...';
  api('POST', '/profile/change-password', { currentPassword: current, newPassword: next })
    .then(function(res) {
      save.disabled = false;
      save.textContent = 'Change password';
      document.getElementById('pf-cur-pass').value = '';
      document.getElementById('pf-new-pass').value = '';
      document.getElementById('pf-new-pass2').value = '';
      pfPassHint();
      var revoked = (res.data && res.data.otherSessionsRevoked) || 0;
      toast('Password changed' + (revoked ? ' · ' + revoked + ' other session(s) signed out' : ''));
      loadProfilePanel(true);
    })
    .catch(function(e) {
      save.disabled = false;
      save.textContent = 'Change password';
      if (err) err.textContent = e.message;
    });
}

function renderPfSessions() {
  var host = document.getElementById('pf-sessions');
  if (!host) return;
  var count = document.getElementById('pf-sess-count');
  if (count) count.textContent = pfSessions.length;

  if (!pfSessions.length) {
    host.innerHTML = '<p class="pf-note">No other live sessions.</p>';
  } else {
    host.innerHTML = '<div class="um-rows">' + pfSessions.map(function(s) {
      return '<div class="um-row' + (s.current ? ' pf-sess-current' : '') + '">' +
        '<div class="um-row-main">' +
          '<div class="um-row-title">' + esc(s.ip || 'Unknown device') + (s.current ? ' <span class="tag tag-confirmed">this device</span>' : '') + '</div>' +
          '<div class="um-row-sub">' + esc((s.userAgent || '').slice(0, 90) || 'No user agent') + '</div>' +
        '</div>' +
        '<div class="um-row-side">' +
          '<div class="um-row-meta">seen ' + esc(fmtDate(s.lastSeenAt)) + '</div>' +
          '<div class="um-row-meta">expires ' + esc(fmtDate(s.expiresAt)) + '</div>' +
          (s.current ? '' : '<button class="btn btn-ghost btn-sm" onclick="pfRevokeSession(' + s.id + ')">Sign out</button>') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  var others = pfSessions.filter(function(s) { return !s.current; }).length;
  var wrap = document.getElementById('pf-revoke-others-wrap');
  if (wrap) wrap.style.display = others ? '' : 'none';
}

function pfRevokeSession(id) {
  showDel('Sign out session #' + id + '? The device will need to sign in again.', function() {
    api('DELETE', '/profile/sessions/' + id).then(function(res) {
      if (res.data && res.data.self) { doLogout(); return; }
      toast('Session signed out');
      loadProfilePanel(true);
    }).catch(function(e) {
      toast(e.message, false);
    });
  });
}

function pfRevokeOthers() {
  showDel('Sign out of every other device? Only this session stays active.', function() {
    api('POST', '/profile/sessions/revoke-others').then(function(res) {
      var n = (res.data && res.data.revoked) || 0;
      toast(n ? n + ' session(s) signed out' : 'No other sessions to sign out');
      loadProfilePanel(true);
    }).catch(function(e) {
      toast(e.message, false);
    });
  });
}

function pfCopyText(text, btn) {
  function done() {
    toast('Copied to clipboard');
    if (btn) {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function() { btn.textContent = old; }, 1500);
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function() { pfFallbackCopy(text); done(); });
  } else {
    pfFallbackCopy(text);
    done();
  }
}

function pfFallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  ta.remove();
}
