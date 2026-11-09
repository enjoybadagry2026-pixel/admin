/* Enjoy Badagry — account deletion page logic
 *
 * Two-step, same pattern as the password-reset page:
 *   1. Re-authenticate with Firebase's own REST sign-in (the password goes
 *      ONLY to Google — never to our backend), which mints a fresh ID token.
 *   2. Call POST /api/user/delete-account with that token and the explicit
 *      confirmation phrase. The backend identifies the account from the
 *      verified token alone and performs the deletion transactionally.
 *
 * Blocking conditions (wallet balance, pending payment, active ride or
 * order) are refused by the server with 409 + a plain-language message,
 * which this page shows in its own state — nothing is deleted on failure.
 */
(function () {
  "use strict";

  var API_BASE = "https://api.enjoybadagry.online/api";
  // Public Firebase web API key (ships in the app config too — it only
  // identifies the Firebase project; access is enforced by credentials).
  var FIREBASE_API_KEY = "AIzaSyBKZUVzQatCSVY1HFyyLwRdrsg2RAP7oWs";
  var FIREBASE_SIGN_IN_URL =
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + FIREBASE_API_KEY;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var card = document.getElementById("dcard");
  if (!card) return;

  var states = {};
  card.querySelectorAll(".rstate").forEach(function (el) {
    states[el.getAttribute("data-state")] = el;
  });

  var currentState = null;

  /* ---------- helpers ---------- */

  function showState(name, message) {
    if (!states[name]) name = "network";
    Object.keys(states).forEach(function (key) {
      states[key].hidden = key !== name;
    });
    currentState = name;

    if (message) {
      var msgEl = states[name].querySelector('[data-role="message"]');
      if (msgEl) msgEl.textContent = message;
    }
  }

  function setFormError(msg) {
    var errEl = states.intro.querySelector('[data-role="form-error"]');
    if (!errEl) return;
    if (msg) {
      errEl.textContent = msg;
      errEl.hidden = false;
    } else {
      errEl.textContent = "";
      errEl.hidden = true;
    }
  }

  function setLoading(isLoading) {
    var btn = states.intro.querySelector('[data-role="submit"]');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle("is-loading", isLoading);
    var spin = btn.querySelector(".rform__submit-spinner");
    if (spin) spin.hidden = !isLoading;
    var label = btn.querySelector(".rform__submit-label");
    if (label) label.textContent = isLoading ? "Deleting…" : "Delete my account permanently";
  }

  function markInvalid(input, invalid) {
    if (!input) return;
    if (invalid) input.classList.add("is-invalid");
    else input.classList.remove("is-invalid");
  }

  /* ---------- step 1: Firebase re-authentication (password → Google) ---------- */

  function signInWithFirebase(email, password) {
    return fetch(FIREBASE_SIGN_IN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ email: email, password: password, returnSecureToken: true })
    }).then(function (res) {
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (body) { return { res: res, body: body }; });
    });
  }

  function mapFirebaseError(body) {
    var code = (body && body.error && body.error.message) || "";
    if (code.indexOf("INVALID_PASSWORD") !== -1 || code.indexOf("INVALID_LOGIN_CREDENTIALS") !== -1) {
      return "Incorrect email or password.";
    }
    if (code.indexOf("EMAIL_NOT_FOUND") !== -1 || code.indexOf("INVALID_EMAIL") !== -1) {
      return "No Enjoy Badagry account was found for that email address.";
    }
    if (code.indexOf("TOO_MANY_ATTEMPTS") !== -1) {
      return "Too many attempts. Please wait a few minutes and try again.";
    }
    if (code.indexOf("USER_DISABLED") !== -1) {
      return "This account has been disabled. Please contact support.";
    }
    if (code.indexOf("NETWORK") !== -1) {
      return "We could not reach the sign-in service. Please check your connection and try again.";
    }
    return "We couldn't verify those sign-in details. Please try again.";
  }

  /* ---------- step 2: backend deletion ---------- */

  function deleteOnBackend(idToken) {
    return fetch(API_BASE + "/user/delete-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + idToken
      },
      body: JSON.stringify({ confirm: "DELETE" })
    }).then(function (res) {
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (body) { return { res: res, body: body }; });
    });
  }

  function mapBackendError(res, body) {
    var message = typeof body.message === "string" ? body.message : null;

    if (res.status === 409) {
      showState("blocked", message || null);
      return;
    }
    if (res.status === 401) {
      setFormError("We couldn't find an Enjoy Badagry account for that email. It may already have been deleted.");
      return;
    }
    if (body.errorCode === "REAUTHENTICATION_REQUIRED") {
      setFormError("For your security, please try again and re-enter your password.");
      return;
    }
    if (res.status === 429) {
      setFormError(message || "Too many attempts. Please wait a few minutes and try again.");
      return;
    }
    setFormError(message || "Something went wrong. Please try again.");
  }

  /* ---------- full submit ---------- */

  function submitDelete(e) {
    if (e) e.preventDefault();
    if (currentState !== "intro") return;

    var emailInput = document.getElementById("del-email");
    var passwordInput = document.getElementById("del-password");
    var confirmInput = document.getElementById("del-confirm");
    if (!emailInput || !passwordInput || !confirmInput) return;

    var email = emailInput.value.trim();
    var password = passwordInput.value;
    var confirm = confirmInput.value.trim();

    markInvalid(emailInput, false);
    markInvalid(passwordInput, false);
    markInvalid(confirmInput, false);
    setFormError(null);

    if (!EMAIL_RE.test(email)) {
      markInvalid(emailInput, true);
      setFormError("Enter the email address of the account you want to delete.");
      emailInput.focus();
      return;
    }
    if (!password) {
      markInvalid(passwordInput, true);
      setFormError("Enter your password to confirm it's you.");
      passwordInput.focus();
      return;
    }
    if (confirm !== "DELETE") {
      markInvalid(confirmInput, true);
      setFormError("Type DELETE exactly, in uppercase, to confirm.");
      confirmInput.focus();
      return;
    }

    setLoading(true);

    // 1. Re-authenticate with Firebase (fresh ID token = fresh auth_time).
    signInWithFirebase(email, password)
      .then(function (result) {
        var res = result.res;
        var body = result.body || {};

        if (!res.ok || !body.idToken) {
          setLoading(false);
          setFormError(mapFirebaseError(body));
          return null;
        }

        // 2. Ask the backend to permanently delete the account.
        return deleteOnBackend(body.idToken)
          .then(function (backend) {
            setLoading(false);
            var bRes = backend.res;
            var bBody = backend.body || {};

            if (bRes.ok && bBody.success) {
              // Never keep the password in the DOM after a completed deletion.
              passwordInput.value = "";
              showState("success");
              return;
            }

            mapBackendError(bRes, bBody);
          })
          .catch(function () {
            setLoading(false);
            showState("network");
          });
      })
      .catch(function () {
        setLoading(false);
        showState("network");
      });
  }

  /* ---------- boot ---------- */

  // Password visibility toggle
  card.querySelectorAll(".rform__toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-toggle");
      var input = document.getElementById(id);
      if (!input) return;
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      // SVG elements ignore the `hidden` attribute/property, so visibility
      // of .icon-eye / .icon-eye-off is driven by this class (see reset.css).
      btn.classList.toggle("is-revealed", !showing);
    });
  });

  // Network-state retry: re-run the whole flow with the values still in the form.
  var retryBtn = card.querySelector('[data-role="retry"]');
  if (retryBtn) {
    retryBtn.addEventListener("click", function () {
      showState("intro");
      setFormError(null);
      var emailInput = document.getElementById("del-email");
      var passwordInput = document.getElementById("del-password");
      if (emailInput && passwordInput && emailInput.value.trim() && passwordInput.value) {
        submitDelete();
      }
    });
  }

  // Blocked-state "Back": return to the form so the user can settle the blocker first.
  var backBtn = card.querySelector('[data-role="back-to-form"]');
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      showState("intro");
      setFormError(null);
    });
  }

  // Form submit
  var form = document.getElementById("delete-form");
  if (form) {
    form.addEventListener("submit", submitDelete);
  }

  showState("intro");
})();
