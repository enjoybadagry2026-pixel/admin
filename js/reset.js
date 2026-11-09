/* Enjoy Badagry — password reset page logic
 *
 * The emailed link points here with the raw token, either as a path segment
 * (/reset-password/{token}) or a query parameter (/reset-password/?token={token}).
 * On load we validate the token WITHOUT consuming it; on submit we send the
 * token + new password to the backend, which consumes it and updates Firebase.
 */
(function () {
  "use strict";

  var API_BASE = "https://api.enjoybadagry.online/api";
  var TOKEN_RE = /^[a-f0-9]{64}$/i;

  var card = document.getElementById("rcard");
  if (!card) return;

  var states = {};
  card.querySelectorAll(".rstate").forEach(function (el) {
    states[el.getAttribute("data-state")] = el;
  });

  var currentState = null;
  var lastToken = null;
  var validatedOnce = false;

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

  function extractToken() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get("token");
    if (token && TOKEN_RE.test(token)) return token;

    // Path style: /reset-password/{token} (with or without trailing slash)
    var match = window.location.pathname.match(/\/reset-password\/([a-f0-9]{64})\/?$/i);
    if (match) return match[1];

    // A token was present but malformed — treat as invalid, not missing.
    if (token) return token;
    return null;
  }

  /* ---------- token validation (non-consuming) ---------- */

  function validateToken(token) {
    lastToken = token;
    showState("checking");

    fetch(API_BASE + "/auth/validate-reset-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ token: token })
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () { return {}; })
          .then(function (body) { return { res: res, body: body }; });
      })
      .then(function (result) {
        var res = result.res;
        var body = result.body || {};
        var message = typeof body.message === "string" ? body.message : null;

        if (res.ok && body.success) {
          var data = body.data || {};
          var email = (data.passwordReset && data.passwordReset.email) || "";
          var emailEl = states.form.querySelector('[data-role="email"]');
          if (emailEl) emailEl.textContent = email;
          validatedOnce = true;
          showState("form");
          var pw = document.getElementById("new-password");
          if (pw) pw.focus();
          return;
        }

        mapTokenError(body, message);
      })
      .catch(function () {
        showState("network");
      });
  }

  function mapTokenError(body, message) {
    switch (body.errorCode) {
      case "RESET_TOKEN_EXPIRED":
        showState("expired", message);
        break;
      case "RESET_TOKEN_USED":
        showState("used", message);
        break;
      case "RESET_TOKEN_REVOKED":
        showState("revoked", message);
        break;
      case "RESET_TOKEN_INVALID":
        showState("invalid", message);
        break;
      default:
        if (body.errorCode === "PASSWORD_UPDATE_FAILED") {
          showState("network", message);
        } else if (message) {
          showState("invalid", message);
        } else {
          showState("network");
        }
    }
  }

  /* ---------- password submit ---------- */

  function setFormError(msg) {
    var errEl = states.form.querySelector('[data-role="form-error"]');
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
    var btn = states.form.querySelector('[data-role="submit"]');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle("is-loading", isLoading);
    var spin = btn.querySelector(".rform__submit-spinner");
    if (spin) spin.hidden = !isLoading;
  }

  function submitReset(e) {
    e.preventDefault();
    if (currentState !== "form" || !lastToken) return;

    var newPw = document.getElementById("new-password");
    var confPw = document.getElementById("confirm-password");
    if (!newPw || !confPw) return;

    var pwVal = newPw.value;
    var confVal = confPw.value;

    // Reset previous error state
    newPw.classList.remove("is-invalid");
    confPw.classList.remove("is-invalid");
    setFormError(null);

    if (pwVal.length < 8) {
      newPw.classList.add("is-invalid");
      setFormError("Password must be at least 8 characters.");
      newPw.focus();
      return;
    }
    if (pwVal.length > 64) {
      newPw.classList.add("is-invalid");
      setFormError("Password must be 64 characters or less.");
      newPw.focus();
      return;
    }
    if (pwVal !== confVal) {
      confPw.classList.add("is-invalid");
      setFormError("Passwords do not match.");
      confPw.focus();
      return;
    }

    setLoading(true);

    fetch(API_BASE + "/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        token: lastToken,
        newPassword: pwVal,
        confirmPassword: confVal
      })
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () { return {}; })
          .then(function (body) { return { res: res, body: body }; });
      })
      .then(function (result) {
        setLoading(false);
        var res = result.res;
        var body = result.body || {};
        var message = typeof body.message === "string" ? body.message : null;

        if (res.ok && body.success) {
          showState("success");
          // Clear the URL so a back-navigation doesn't expose the token.
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, "", window.location.pathname);
          }
          return;
        }

        // Token-related failures map to the same states as validation.
        if (
          body.errorCode &&
          body.errorCode.indexOf("RESET_TOKEN_") === 0
        ) {
          mapTokenError(body, message);
          return;
        }

        // Other errors (validation, server) show inline on the form.
        setFormError(message || "Something went wrong. Please try again.");
      })
      .catch(function () {
        setLoading(false);
        setFormError("We could not reach the server. Please check your connection and try again.");
      });
  }

  /* ---------- boot ---------- */

  // Password visibility toggles
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

  // Retry button on the network state
  var retryBtn = card.querySelector('[data-role="retry"]');
  if (retryBtn) {
    retryBtn.addEventListener("click", function () {
      if (lastToken) {
        if (validatedOnce && currentState === "network") {
          // Retry the last action that failed: if we were on the form, re-show it.
          // Otherwise re-validate.
          validateToken(lastToken);
        } else {
          validateToken(lastToken);
        }
      }
    });
  }

  // Form submit
  var form = document.getElementById("reset-form");
  if (form) {
    form.addEventListener("submit", submitReset);
  }

  // Initial validation
  var token = extractToken();
  if (!token) {
    showState("missing");
  } else if (!TOKEN_RE.test(token)) {
    showState("invalid");
  } else {
    validateToken(token);
  }
})();
