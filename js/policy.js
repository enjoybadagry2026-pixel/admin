/* Enjoy Badagry — privacy policy page interactions */
(function () {
  "use strict";

  /* Close the mobile TOC drawer after choosing a section */
  var mobileToc = document.querySelector(".ptoc-mobile");
  if (mobileToc) {
    mobileToc.addEventListener("click", function (e) {
      var target = e.target;
      if (target && target.closest && target.closest("a")) {
        mobileToc.open = false;
      }
    });
  }

  /* Highlight the current section in the desktop TOC while scrolling */
  var tocLinks = document.querySelectorAll(".ptoc__list a");
  if (!tocLinks.length || !("IntersectionObserver" in window)) return;

  var linkById = {};
  var sectionIds = [];
  tocLinks.forEach(function (link) {
    var href = link.getAttribute("href") || "";
    if (href.charAt(0) === "#") {
      var id = href.slice(1);
      linkById[id] = link;
      if (sectionIds.indexOf(id) === -1) sectionIds.push(id);
    }
  });

  var sections = sectionIds
    .map(function (id) {
      return document.getElementById(id);
    })
    .filter(Boolean);

  if (!sections.length) return;

  var currentId = null;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        if (id === currentId) return;
        currentId = id;
        Object.keys(linkById).forEach(function (key) {
          linkById[key].classList.toggle("is-active", key === id);
        });
      });
    },
    { rootMargin: "-20% 0px -65% 0px", threshold: 0 }
  );

  sections.forEach(function (section) {
    observer.observe(section);
  });
})();
