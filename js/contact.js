/* Enjoy Badagry — contact page message builder
   Builds a support/enquiry message and copies it to the clipboard so the
   visitor can paste it into their chosen support channel. Nothing is sent
   or stored from this page. */
(function () {
  "use strict";

  var form = document.getElementById("composer");
  if (!form) return;

  var nameInput = document.getElementById("c-name");
  var topicInput = document.getElementById("c-topic");
  var refInput = document.getElementById("c-ref");
  var detailsInput = document.getElementById("c-details");
  var errorBox = document.getElementById("composer-error");
  var statusBox = document.getElementById("composer-status");
  var outputBox = document.getElementById("composer-output");
  var outputText = document.getElementById("c-output");
  var clearBtn = document.getElementById("composer-clear");

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.hidden = true;
  }

  function setStatus(message) {
    if (statusBox) statusBox.textContent = message || "";
  }

  function hideOutput() {
    if (outputBox) outputBox.hidden = true;
    if (outputText) outputText.value = "";
  }

  function buildMessage() {
    var name = nameInput ? nameInput.value.trim() : "";
    var topic = topicInput ? topicInput.value : "";
    var reference = refInput ? refInput.value.trim() : "";
    var details = detailsInput ? detailsInput.value.trim() : "";

    var lines = [];
    lines.push("Enjoy Badagry — Support request");
    lines.push("");
    lines.push("Name: " + (name || "Not provided"));
    lines.push("Topic: " + topic);
    if (reference) lines.push("Reference: " + reference);
    lines.push("");
    lines.push("Details:");
    lines.push(details);
    return lines.join("\n");
  }

  function copyWithFallback(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.top = "-1000px";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      var copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (err) {
        copied = false;
      }
      document.body.removeChild(helper);
      if (copied) resolve();
      else reject(new Error("copy-unavailable"));
    });
  }

  function revealOutput(text) {
    if (outputBox && outputText) {
      outputText.value = text;
      outputBox.hidden = false;
      outputText.focus();
      outputText.select();
    }
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearError();
      setStatus("");
      hideOutput();

      var name = nameInput ? nameInput.value.trim() : "";
      var details = detailsInput ? detailsInput.value.trim() : "";

      if (!name) {
        showError("Add your name so the team knows who they are replying to.");
        if (nameInput) nameInput.focus();
        return;
      }

      if (details.length < 10) {
        showError("Describe what you need help with in at least a sentence or two.");
        if (detailsInput) detailsInput.focus();
        return;
      }

      var message = buildMessage();

      copyWithFallback(message).then(function () {
        setStatus("Copied — paste your message into an email or in-app Help & Support.");
      }).catch(function () {
        setStatus("Automatic copy was blocked, so your message is below.");
        revealOutput(message);
      });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      form.reset();
      clearError();
      setStatus("");
      hideOutput();
      if (nameInput) nameInput.focus();
    });
  }

  if (detailsInput) {
    detailsInput.addEventListener("input", clearError);
  }
  if (nameInput) {
    nameInput.addEventListener("input", clearError);
  }
}());
