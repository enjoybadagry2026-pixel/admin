/* Enjoy Badagry — site interactions */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Dynamic copyright year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* ---------- Sticky nav shadow ---------- */
  var nav = document.getElementById("nav");
  var toTop = document.getElementById("to-top");

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (nav) {
      nav.classList.toggle("is-scrolled", y > 8);
    }
    if (toTop) {
      var show = y > 600;
      if (show) {
        toTop.hidden = false;
        requestAnimationFrame(function () {
          toTop.classList.add("is-visible");
        });
      } else {
        toTop.classList.remove("is-visible");
      }
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({
        top: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
      var brand = document.querySelector(".nav__brand");
      if (brand) {
        brand.focus({ preventScroll: true });
      }
    });
  }

  /* ---------- Mobile navigation ---------- */
  var toggle = document.getElementById("nav-toggle");
  var menu = document.getElementById("nav-menu");

  function setMenu(open) {
    if (!toggle || !menu) return;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
  }

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") !== "true";
      setMenu(open);
    });

    menu.addEventListener("click", function (e) {
      var target = e.target;
      if (target && target.closest && target.closest("a")) {
        setMenu(false);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        toggle.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 920) {
        setMenu(false);
      }
    });
  }

  /* ---------- FAQ accordion ---------- */
  var faqButtons = document.querySelectorAll(".faq-item__btn");

  faqButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var expanded = btn.getAttribute("aria-expanded") === "true";
      var panelId = btn.getAttribute("aria-controls");
      var panel = panelId ? document.getElementById(panelId) : null;
      var item = btn.closest(".faq-item");

      // Close other open items (single-open accordion)
      faqButtons.forEach(function (other) {
        if (other === btn) return;
        if (other.getAttribute("aria-expanded") === "true") {
          other.setAttribute("aria-expanded", "false");
          var otherId = other.getAttribute("aria-controls");
          var otherPanel = otherId ? document.getElementById(otherId) : null;
          if (otherPanel) otherPanel.hidden = true;
          var otherItem = other.closest(".faq-item");
          if (otherItem) otherItem.classList.remove("is-open");
        }
      });

      btn.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (panel) panel.hidden = expanded;
      if (item) item.classList.toggle("is-open", !expanded);
    });
  });

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  } else {
    // Stagger siblings that reveal together
    var groups = new Map();
    revealEls.forEach(function (el) {
      var parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, 0);
      var index = groups.get(parent);
      el.style.setProperty("--reveal-delay", Math.min(index * 0.09, 0.45) + "s");
      groups.set(parent, index + 1);
    });

    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* ---------- Active nav link while scrolling ---------- */
  var sections = document.querySelectorAll("main section[id]");
  var navLinks = document.querySelectorAll(".nav__link");

  if ("IntersectionObserver" in window && sections.length && navLinks.length) {
    var linkById = {};
    navLinks.forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (href.charAt(0) === "#") {
        linkById[href.slice(1)] = link;
      }
    });

    var currentId = null;

    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.id;
            if (id !== currentId) {
              currentId = id;
              navLinks.forEach(function (link) {
                link.classList.remove("is-active");
              });
              var active = linkById[id];
              if (active) active.classList.add("is-active");
            }
          }
        });
      },
      { rootMargin: "-38% 0px -55% 0px", threshold: 0 }
    );

    sections.forEach(function (section) {
      sectionObserver.observe(section);
    });
  }
})();
