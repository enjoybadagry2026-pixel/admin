/* Enjoy Badagry — live Explore directory */
(function () {
  "use strict";

  var API_BASE = "https://api.enjoybadagry.online/api";
  var FALLBACK_IMAGE = {
    destination: "../images/museum.jpg",
    hotel: "../images/hotel.jpg",
    food: "../images/food.jpg",
  };
  var state = {
    destinations: [],
    hotels: [],
    food: [],
    destinationFilter: "All",
    foodFilter: "All",
    loaded: 0,
    failed: 0,
  };

  function getJson(path) {
    return fetch(API_BASE + path, { headers: { Accept: "application/json" } }).then(function (response) {
      if (!response.ok) throw new Error("Request failed");
      return response.json();
    }).then(function (payload) {
      if (!payload || payload.success !== true || !payload.data) throw new Error("Unexpected response");
      return payload.data;
    });
  }

  function text(value, fallback) {
    return value === null || value === undefined || String(value).trim() === "" ? (fallback || "") : String(value).trim();
  }

  function description(item) {
    return text(item.shortDescription || item.description, "Discover more details in the Enjoy Badagry app.");
  }

  function imageUrl(item, type) {
    var value = type === "food" ? item.image : item.coverImage;
    if (!value && Array.isArray(item.gallery) && item.gallery.length) value = item.gallery[0];
    return text(value, FALLBACK_IMAGE[type]);
  }

  function formatPrice(value, prefix) {
    var number = Number(value);
    if (!isFinite(number) || number <= 0) return "Price available in the app";
    var label = prefix === undefined ? "From " : prefix;
    return label + "₦" + number.toLocaleString("en-NG");
  }

  function entranceFee(value) {
    var number = Number(value);
    if (!isFinite(number) || number <= 0) return "";
    return "Entrance: ₦" + number.toLocaleString("en-NG");
  }

  function location(item) {
    return text(item.address || item.city || item.state, "Badagry, Lagos");
  }

  function rating(item) {
    var value = Number(item.rating);
    if (!isFinite(value) || value <= 0) return "";
    var reviews = Number(item.totalReviews || item.reviewCount);
    return "★ " + value.toFixed(1) + (isFinite(reviews) && reviews > 0 ? " (" + reviews + ")" : "");
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function createElement(tag, className, content) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }

  function createCard(item, type) {
    var card = createElement("article", "live-card");
    var media = createElement("div", "live-card__media");
    var image = document.createElement("img");
    image.src = imageUrl(item, type);
    image.alt = text(item.name, type === "food" ? "Food listing" : "Enjoy Badagry listing");
    image.loading = "lazy";
    var fallbackUsed = false;
    image.onerror = function () {
      if (fallbackUsed) return;
      fallbackUsed = true;
      image.src = FALLBACK_IMAGE[type];
    };
    media.appendChild(image);
    if (item.featured === true) media.appendChild(createElement("span", "live-card__badge", "Featured"));

    var body = createElement("div", "live-card__body");
    var meta = createElement("div", "live-card__meta");
    var category = text(item.category, type === "hotel" ? "Stay" : type === "food" ? "Food" : "Destination");
    meta.appendChild(createElement("span", "live-card__category", category));
    var score = rating(item);
    if (score) meta.appendChild(createElement("span", "live-card__rating", score));

    body.appendChild(meta);
    body.appendChild(createElement("h4", "live-card__title", text(item.name, "Enjoy Badagry listing")));

    var subtitle = "";
    if (type === "food") {
      subtitle = text(item.restaurantName, "");
      if (!subtitle && text(item.prepTime, "")) subtitle = "Prep time: " + text(item.prepTime);
    } else {
      subtitle = location(item);
    }
    if (subtitle) {
      var locationLine = createElement("p", "live-card__location", subtitle);
      locationLine.title = subtitle;
      body.appendChild(locationLine);
    }

    body.appendChild(createElement("p", "live-card__description", description(item)));

    var footer = createElement("div", "live-card__footer");
    var price = type === "hotel" ? formatPrice(item.startingPrice) : type === "food" ? formatPrice(item.price, "") : entranceFee(item.entranceFee);
    if (price) footer.appendChild(createElement("span", "live-card__price", price));
    var link = createElement("a", "link-arrow", type === "food" ? "View food details" : type === "hotel" ? "View stay details" : "View destination");
    link.href = "../index.html#app";
    link.appendChild(createElement("span", "", "→"));
    footer.appendChild(link);
    body.appendChild(footer);
    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  function renderList(id, items, type, emptyMessage, errorMessage) {
    var node = document.getElementById(id);
    if (!node) return;
    clearNode(node);
    if (errorMessage) {
      node.appendChild(createElement("p", "live-state live-state--error", errorMessage));
      return;
    }
    if (!items.length) {
      node.appendChild(createElement("p", "live-state", emptyMessage));
      return;
    }
    items.forEach(function (item) { node.appendChild(createCard(item, type)); });
  }

  function uniqueValues(items, field) {
    var values = ["All"];
    items.forEach(function (item) {
      var value = text(item[field], "");
      if (value && values.indexOf(value) === -1) values.push(value);
    });
    return values;
  }

  function renderFilters(id, values, current, callback) {
    var node = document.getElementById(id);
    if (!node) return;
    clearNode(node);
    values.slice(0, 12).forEach(function (value) {
      var button = createElement("button", "filter-chip" + (value === current ? " is-selected" : ""), value);
      button.type = "button";
      button.setAttribute("aria-pressed", value === current ? "true" : "false");
      button.addEventListener("click", function () { callback(value); });
      node.appendChild(button);
    });
  }

  function renderDestinations() {
    var items = state.destinations.filter(function (item) { return state.destinationFilter === "All" || text(item.category) === state.destinationFilter; });
    renderFilters("destination-filters", uniqueValues(state.destinations, "category"), state.destinationFilter, function (value) {
      state.destinationFilter = value;
      renderDestinations();
    });
    renderList("destination-list", items, "destination", "No destinations are available right now.", null);
  }

  function renderFood() {
    var items = state.food.filter(function (item) { return state.foodFilter === "All" || text(item.category) === state.foodFilter; });
    renderFilters("food-filters", uniqueValues(state.food, "category"), state.foodFilter, function (value) {
      state.foodFilter = value;
      renderFood();
    });
    renderList("food-list", items, "food", "No food listings are available right now.", null);
  }

  function loadSection(path, key, onSuccess, id, type, emptyMessage) {
    getJson(path).then(function (data) {
      state[key] = Array.isArray(data[key]) ? data[key] : [];
      state.loaded += 1;
      onSuccess();
      refreshDerived();
    }).catch(function () {
      state.failed += 1;
      renderList(id, [], type, emptyMessage, "This section is temporarily unavailable. Please try again in the app.");
      refreshDerived();
    });
  }

  function categoryLabel(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function renderCategories() {
    var node = document.getElementById("category-tiles");
    if (!node) return;
    clearNode(node);
    if (!state.destinations.length) {
      node.appendChild(createElement("p", "live-state", state.failed && !state.loaded
        ? "Categories are temporarily unavailable."
        : "Categories will appear as destination listings load."));
      return;
    }

    var counts = {};
    state.destinations.forEach(function (item) {
      var name = text(item.category, "Other");
      counts[name] = (counts[name] || 0) + 1;
    });

    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (name) {
      var button = createElement("button", "category-tile");
      button.type = "button";
      button.setAttribute("aria-label", "Show " + name + " destinations");
      button.appendChild(createElement("span", "category-tile__name", categoryLabel(name)));
      button.appendChild(createElement("span", "category-tile__count", counts[name] + (counts[name] === 1 ? " place" : " places")));
      button.addEventListener("click", function () {
        state.destinationFilter = name;
        renderDestinations();
        var target = document.getElementById("destination-list");
        if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      node.appendChild(button);
    });
  }

  function renderRecent() {
    var node = document.getElementById("recent-list");
    if (!node) return;

    var combined = [];
    state.destinations.forEach(function (item) { combined.push({ item: item, type: "destination" }); });
    state.hotels.forEach(function (item) { combined.push({ item: item, type: "hotel" }); });
    state.food.forEach(function (item) { combined.push({ item: item, type: "food" }); });

    combined = combined
      .filter(function (entry) { return typeof entry.item.createdAt === "number"; })
      .sort(function (a, b) { return b.item.createdAt - a.item.createdAt; })
      .slice(0, 6);

    clearNode(node);
    if (!combined.length) {
      var message = "New listings will appear here as they are added.";
      var error = null;
      if (!state.loaded && state.failed) {
        message = "Recently added places are temporarily unavailable.";
        error = message;
      }
      renderList("recent-list", [], "destination", message, error);
      return;
    }
    combined.forEach(function (entry) { node.appendChild(createCard(entry.item, entry.type)); });
  }

  function refreshDerived() {
    renderCategories();
    renderRecent();
  }

  function init() {
    loadSection("/destinations/popular", "destinations", renderDestinations, "destination-list", "destination", "No destinations are available right now.");
    loadSection("/hotels", "hotels", function () {
      renderList("hotel-list", state.hotels, "hotel", "No accommodation listings are available right now.", null);
    }, "hotel-list", "hotel", "No accommodation listings are available right now.");
    loadSection("/food/all", "foods", function () {
      state.food = state.foods || [];
      renderFood();
    }, "food-list", "food", "No food listings are available right now.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());
