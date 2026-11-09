/* Enjoy Badagry — email verification page logic
 *
 * The emailed link points here with the raw token, either as a path segment
 * (/verify-account/{token}) or a query parameter (/verify-account/?token={token}).
 * This script extracts the token, calls the backend once, and swaps the card
 * between loading / success / error states.
 */
(function () {
  "use strict";

  var API_BASE = "https://api.enjoybadagry.online/api";
  var TOKEN_RE = /^[a-f0-9]{64}$/i;

  var card = document.getElementById("vcard");
  if (!card) return;

  var states = {};
  card.querySelectorAll(".vstate").forEach(function (el) {
    states[el.getAttribute("data-state")] = el;
  });

  var currentState = null;
  var lastToken = null;

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

    // Path style: /verify-account/{token} (with or without trailing slash)
    var match = window.location.pathname.match(/\/verify-account\/([a-f0-9]{64})\/?$/i);
    if (match) return match[1];

    // A token was present but malformed — treat as invalid, not missing.
    if (token) return token;
    return null;
  }

  /* ---------- verification call ---------- */

  function verify(token) {
    lastToken = token;
    showState("loading");

    fetch(API_BASE + "/auth/verify-email", {
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
          if (data.alreadyVerified) {
            showState("success", "Your email was already verified. You can sign in to Enjoy Badagry.");
          } else {
            showState("success");
          }
          return;
        }

        switch (body.errorCode) {
          case "VERIFICATION_TOKEN_EXPIRED":
            showState("expired", message);
            break;
          case "VERIFICATION_TOKEN_REVOKED":
            showState("revoked", message);
            break;
          case "VERIFICATION_TOKEN_INVALID":
            showState("invalid", message);
            break;
          default:
            if (res.status === 422) {
              showState("invalid", message || "This verification link is not valid.");
            } else {
              showState("network", message);
            }
        }
      })
      .catch(function () {
        showState("network");
      });
  }

  /* ---------- boot ---------- */

  var retryBtn = card.querySelector('[data-role="retry"]');
  if (retryBtn) {
    retryBtn.addEventListener("click", function () {
      if (lastToken) verify(lastToken);
    });
  }

  var token = extractToken();
  if (!token) {
    showState("missing");
  } else if (!TOKEN_RE.test(token)) {
    showState("invalid");
  } else {
    verify(token);
  }
})();
