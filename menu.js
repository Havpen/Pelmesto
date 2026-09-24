/* Menu page: renders categories from /api/menu, keeps a local cart and posts
   the order to /api/orders. Prices are re-checked server-side on submit. */
(function () {
  var CART_KEY = "pelmesto_cart_v1";
  var BYN = '<span class="byn" role="img" aria-label="белорусский рубль"></span>';

  var groupsEl = document.querySelector("[data-menu-groups]");
  var chipsEl = document.querySelector("[data-menu-chips]");
  var switchEl = document.querySelector("[data-menu-switch]");
  var pillEl = document.querySelector("[data-cart-pill]");
  var pillCountEl = document.querySelector("[data-cart-count]");
  var cartBodyEl = document.querySelector("[data-cart-body]");
  var cartFootEl = document.querySelector("[data-cart-foot]");
  var cartTotalEl = document.querySelector("[data-cart-total]");
  var orderForm = document.querySelector("[data-order-form]");
  var orderErrorEl = document.querySelector("[data-order-error]");
  var orderSubmitEl = document.querySelector("[data-order-submit]");
  var deliveryHintEl = document.querySelector("[data-delivery-hint]");

  var menu = { categories: [], items: [] };
  var itemsById = {};
  var kind = "hall";
  /** cart: { key: { itemId, variantId, qty } } — key is itemId or itemId:variantId. */
  var cart = {};
  /** Chosen variant per item id, so the card remembers the selected chip. */
  var chosenVariant = {};

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(value) {
    return Number(value).toFixed(2).replace(".", ",");
  }

  /** 500 -> "500 г", 1500 -> "1,5 кг" */
  function grams(value) {
    if (value >= 1000) return String(value / 1000).replace(".", ",") + " кг";
    return value + " г";
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      cart = raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
      cart = {};
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      /* private mode — cart stays in memory only */
    }
  }

  function lineKey(itemId, variantId) {
    return variantId ? itemId + ":" + variantId : itemId;
  }

  function unitPrice(item, variantId) {
    if (item.variants && item.variants.length) {
      var variant = findVariant(item, variantId);
      return variant ? variant.price : null;
    }
    return item.price;
  }

  function findVariant(item, variantId) {
    if (!item.variants || !item.variants.length) return null;
    for (var i = 0; i < item.variants.length; i += 1) {
      if (item.variants[i].id === variantId) return item.variants[i];
    }
    return item.variants[0];
  }

  function lineSum(entry) {
    var item = itemsById[entry.itemId];
    if (!item) return 0;
    var price = unitPrice(item, entry.variantId);
    if (price === null || price === undefined) return 0;
    var perUnit = item.variants && item.variants.length ? 1 : item.priceUnit || 1;
    return Math.round((price * entry.qty * 100) / perUnit) / 100;
  }

  function cartLines() {
    return Object.keys(cart)
      .map(function (key) {
        return cart[key];
      })
      .filter(function (entry) {
        return entry && itemsById[entry.itemId] && entry.qty > 0;
      });
  }

  function cartTotal() {
    return cartLines().reduce(function (sum, entry) {
      return sum + lineSum(entry);
    }, 0);
  }

  /* ------------------------------------------------------------- rendering */

  function badgeClass(badge) {
    var lower = String(badge).toLowerCase();
    if (lower === "new" || lower === "новинка") return "dish__badge--new";
    if (lower === "веган") return "dish__badge--vegan";
    return "";
  }

  function nutritionHtml(item) {
    var n = item.nutrition;
    if (!n) return "";
    var parts = [];
    if (n.protein !== null && n.protein !== undefined) parts.push("Б " + n.protein);
    if (n.fat !== null && n.fat !== undefined) parts.push("Ж " + n.fat);
    if (n.carbs !== null && n.carbs !== undefined) parts.push("У " + n.carbs);
    if (n.kcal !== null && n.kcal !== undefined) parts.push(Math.round(n.kcal) + " ккал");
    if (!parts.length) return "";
    return (
      '<ul class="dish__kbju">' +
      parts
        .map(function (part) {
          return "<li>" + escapeHtml(part) + "</li>";
        })
        .join("") +
      "</ul>" +
      '<p class="dish__kbju-note">на 100 г</p>'
    );
  }

  function mediaHtml(item) {
    if (item.imageUrl) {
      return (
        '<div class="dish__media">' +
        '<img src="' +
        escapeHtml(item.imageUrl) +
        '" alt="' +
        escapeHtml(item.title) +
        '" width="760" height="760" loading="lazy" decoding="async" />' +
        badgeHtml(item) +
        "</div>"
      );
    }
    return (
      '<div class="dish__media dish__media--empty">' +
      '<span class="dish__monogram" aria-hidden="true">' +
      escapeHtml((item.title || "П").trim().charAt(0)) +
      "</span>" +
      badgeHtml(item) +
      "</div>"
    );
  }

  function badgeHtml(item) {
    if (!item.badge) return "";
    return (
      '<span class="dish__badge ' + badgeClass(item.badge) + '">' + escapeHtml(item.badge) + "</span>"
    );
  }

  function variantsHtml(item) {
    if (!item.variants || !item.variants.length) return "";
    var active = chosenVariant[item.id] || item.variants[0].id;
    return (
      '<div class="dish__variants">' +
      item.variants
        .map(function (variant) {
          return (
            '<button type="button" class="dish__variant' +
            (variant.id === active ? " is-active" : "") +
            '" data-variant="' +
            escapeHtml(variant.id) +
            '" data-item="' +
            escapeHtml(item.id) +
            '">' +
            escapeHtml(variant.label) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function footHtml(item) {
    if (item.orderable === false) {
      return '<div class="dish__foot"><span>Только в зале</span></div>';
    }

    var variantId = item.variants && item.variants.length
      ? chosenVariant[item.id] || item.variants[0].id
      : "";
    var price = unitPrice(item, variantId);
    var entry = cart[lineKey(item.id, variantId)];
    var inCart = !!(entry && entry.qty > 0);

    var priceHtml =
      price === null || price === undefined
        ? '<span class="dish__price dish__price--empty">Цена уточняется</span>'
        : '<span class="dish__price">' +
          money(price) +
          BYN +
          (item.unit === "g" && item.priceUnit > 1
            ? '<span class="dish__weight"> / ' + grams(item.priceUnit) + "</span>"
            : "") +
          "</span>";

    var action;
    if (price === null || price === undefined) {
      action = '<button class="dish__add" type="button" disabled aria-label="Недоступно">+</button>';
    } else if (inCart) {
      var qtyLabel = item.unit === "g" ? grams(entry.qty) : entry.qty + " шт";
      action =
        '<div class="dish__in-cart" role="group" aria-label="Количество">' +
        '<button type="button" data-step="-1" data-item="' +
        escapeHtml(item.id) +
        '" data-variant="' +
        escapeHtml(variantId) +
        '" aria-label="Убрать">−</button>' +
        '<span class="dish__in-cart-qty">' +
        qtyLabel +
        "</span>" +
        '<button type="button" data-step="1" data-item="' +
        escapeHtml(item.id) +
        '" data-variant="' +
        escapeHtml(variantId) +
        '" aria-label="Добавить">+</button>' +
        "</div>";
    } else {
      action =
        '<button class="dish__add" type="button" data-add="' +
        escapeHtml(item.id) +
        '" data-variant="' +
        escapeHtml(variantId) +
        '" aria-label="Добавить ' +
        escapeHtml(item.title) +
        '">+</button>';
    }

    return (
      '<div class="dish__foot' +
      (inCart ? " is-active" : "") +
      '">' +
      priceHtml +
      action +
      "</div>"
    );
  }

  function dishHtml(item) {
    var weight = item.weight;
    if (item.variants && item.variants.length) {
      var variant = findVariant(item, chosenVariant[item.id]);
      weight = variant && variant.weight ? variant.weight : weight;
    }

    return (
      '<article class="dish' +
      (item.orderable === false ? " dish--hall-only" : "") +
      '" data-dish="' +
      escapeHtml(item.id) +
      '">' +
      mediaHtml(item) +
      '<div class="dish__body">' +
      '<h3 class="dish__title">' +
      escapeHtml(item.title) +
      "</h3>" +
      (item.description ? '<p class="dish__desc">' + escapeHtml(item.description) + "</p>" : "") +
      (weight ? '<p class="dish__weight">' + escapeHtml(weight) + "</p>" : "") +
      nutritionHtml(item) +
      variantsHtml(item) +
      footHtml(item) +
      "</div>" +
      "</article>"
    );
  }

  function visibleCategories() {
    return menu.categories
      .filter(function (category) {
        return category.kind === kind;
      })
      .sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      })
      .filter(function (category) {
        return itemsOf(category.id).length > 0;
      });
  }

  function itemsOf(categoryId) {
    return menu.items.filter(function (item) {
      return item.categoryId === categoryId;
    });
  }

  function render() {
    var categories = visibleCategories();

    chipsEl.innerHTML = categories
      .map(function (category) {
        return (
          '<li><a draggable="false" href="#cat-' +
          escapeHtml(category.slug) +
          '">' +
          escapeHtml(category.title) +
          "</a></li>"
        );
      })
      .join("");

    groupsEl.innerHTML = categories.length
      ? categories
          .map(function (category) {
            return (
              '<section class="menu-group" id="cat-' +
              escapeHtml(category.slug) +
              '">' +
              '<div class="menu-group__head">' +
              '<h2 class="menu-group__title">' +
              escapeHtml(category.title) +
              "</h2>" +
              (category.note
                ? '<p class="menu-group__note">' + escapeHtml(category.note) + "</p>"
                : "") +
              "</div>" +
              '<div class="dish-grid">' +
              itemsOf(category.id).map(dishHtml).join("") +
              "</div>" +
              "</section>"
            );
          })
          .join("")
      : '<p class="menu-loading">В этом разделе пока нет позиций.</p>';

    renderCart();
    syncSwitchHeight();
    updateActiveChip();
  }

  /* ------------------------------------------------- category strip behaviour */

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var scrollMode = reduceMotion ? "auto" : "smooth";

  /** Anchors offset themselves by the switch bar, whose height depends on wrapping. */
  function syncSwitchHeight() {
    if (!switchEl) return;
    document.documentElement.style.setProperty(
      "--menu-switch-h",
      switchEl.offsetHeight + "px"
    );
  }

  function scrollToCategory(slug) {
    var target = document.getElementById("cat-" + slug);
    if (!target) return;
    // Lock the chip spy so intermediate categories don't yank the strip left/right.
    chipSpyLocked = true;
    if (chipSpyUnlockTimer) clearTimeout(chipSpyUnlockTimer);
    var chip = chipsEl && chipsEl.querySelector('a[href="#cat-' + slug + '"]');
    if (chip) {
      if (activeChip) activeChip.classList.remove("is-active");
      activeChip = chip;
      chip.classList.add("is-active");
      centerChip(chip);
    }
    target.scrollIntoView({ behavior: scrollMode, block: "start" });
    if (history.replaceState) history.replaceState(null, "", "#cat-" + slug);
    chipSpyUnlockTimer = setTimeout(
      function () {
        chipSpyLocked = false;
        updateActiveChip();
      },
      reduceMotion ? 80 : 900
    );
  }

  /** Slides the strip so the given chip sits in the middle of its own row. */
  function centerChip(chip) {
    if (!chipsEl || chipsEl.classList.contains("is-dragging")) return;
    var strip = chipsEl.getBoundingClientRect();
    var box = chip.getBoundingClientRect();
    var left = chipsEl.scrollLeft + (box.left - strip.left) - (strip.width - box.width) / 2;
    if (chipsEl.scrollTo) chipsEl.scrollTo({ left: left, behavior: scrollMode });
    else chipsEl.scrollLeft = left;
  }

  var activeChip = null;
  var chipSpyLocked = false;
  var chipSpyUnlockTimer = 0;

  /** Marks the chip whose group currently sits across the middle of the screen. */
  function updateActiveChip() {
    if (chipSpyLocked) return;
    if (!chipsEl || !groupsEl) return;
    var groups = groupsEl.querySelectorAll(".menu-group");
    if (!groups.length) return;

    var middle = window.innerHeight / 2;
    var closest = null;
    var closestGap = Infinity;

    groups.forEach(function (group) {
      var box = group.getBoundingClientRect();
      var gap = box.top > middle ? box.top - middle : box.bottom < middle ? middle - box.bottom : 0;
      if (gap < closestGap) {
        closestGap = gap;
        closest = group;
      }
    });

    if (!closest) return;
    var chip = chipsEl.querySelector('a[href="#' + closest.id + '"]');
    if (chip === activeChip) return;

    if (activeChip) activeChip.classList.remove("is-active");
    activeChip = chip;
    if (!chip) return;
    chip.classList.add("is-active");
    centerChip(chip);
  }

  /** Mouse drag with a bit of glide; touch keeps the browser's own momentum. */
  function enableDragScroll(el) {
    var dragging = false;
    var startX = 0;
    var startScroll = 0;
    var travel = 0;
    var lastX = 0;
    var lastAt = 0;
    var velocity = 0;
    var frame = 0;

    el.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "touch" || event.button !== 0) return;
      cancelAnimationFrame(frame);
      dragging = true;
      travel = 0;
      velocity = 0;
      startX = lastX = event.clientX;
      startScroll = el.scrollLeft;
      lastAt = event.timeStamp;
    });

    el.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      var shift = event.clientX - startX;
      travel = Math.abs(shift);
      // Capture only once it is a real drag, so a plain click still hits the chip.
      if (travel > 4 && !el.classList.contains("is-dragging")) {
        el.classList.add("is-dragging");
        if (el.setPointerCapture) el.setPointerCapture(event.pointerId);
      }
      el.scrollLeft = startScroll - shift;

      var elapsed = event.timeStamp - lastAt;
      if (elapsed > 0) velocity = (event.clientX - lastX) / elapsed;
      lastX = event.clientX;
      lastAt = event.timeStamp;
    });

    function release() {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("is-dragging");

      var perFrame = velocity * 16;
      if (Math.abs(perFrame) < 1) return;
      (function glide() {
        perFrame *= 0.93;
        el.scrollLeft -= perFrame;
        if (Math.abs(perFrame) > 0.4) frame = requestAnimationFrame(glide);
      })();
    }

    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);

    // Links are draggable by default, so a drag would otherwise start an HTML5
    // drag-and-drop and trail a translucent copy of the chip under the cursor.
    el.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });

    // Capture phase, so a drag that ends on a chip never navigates. Needs
    // stopImmediatePropagation: the chip handler sits on this same element and
    // plain stopPropagation would still let it run.
    el.addEventListener(
      "click",
      function (event) {
        if (travel <= 4) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        travel = 0;
      },
      true
    );
  }

  /** Re-renders one card foot so changing quantity does not reload the photo. */
  function renderDish(itemId) {
    var item = itemsById[itemId];
    var node = groupsEl.querySelector('[data-dish="' + itemId + '"]');
    if (!item || !node) return;

    var foot = node.querySelector(".dish__foot");
    if (foot) {
      foot.outerHTML = footHtml(item);
      return;
    }

    node.outerHTML = dishHtml(item);
  }

  function renderCart() {
    var lines = cartLines();
    var count = lines.length;
    var total = cartTotal();

    if (pillEl) {
      pillEl.hidden = count === 0;
      if (pillCountEl) pillCountEl.textContent = String(count);
    }

    if (!cartBodyEl) return;

    if (!count) {
      cartBodyEl.innerHTML =
        '<p class="cart__empty">Корзина пуста.<br />Добавьте блюда из меню зала или заморозку.</p>';
      if (cartFootEl) cartFootEl.hidden = true;
      return;
    }

    cartBodyEl.innerHTML =
      '<ul class="cart__list">' +
      lines
        .map(function (entry) {
          var item = itemsById[entry.itemId];
          var variant = entry.variantId ? findVariant(item, entry.variantId) : null;
          var step = item.variants && item.variants.length ? 1 : item.step || 1;
          return (
            "<li class=\"cart-line\">" +
            "<div>" +
            '<p class="cart-line__title">' +
            escapeHtml(item.title) +
            (variant ? " · " + escapeHtml(variant.label) : "") +
            "</p>" +
            '<p class="cart-line__meta">' +
            escapeHtml(money(unitPrice(item, entry.variantId))) +
            " BYN" +
            (item.unit === "g" && item.priceUnit > 1 ? " / " + grams(item.priceUnit) : " / шт") +
            "</p>" +
            "</div>" +
            '<span class="cart-line__sum">' +
            money(lineSum(entry)) +
            BYN +
            "</span>" +
            '<span class="cart-line__qty">' +
            '<button type="button" data-cart-step="-' +
            step +
            '" data-key="' +
            escapeHtml(lineKey(entry.itemId, entry.variantId)) +
            '" aria-label="Меньше">−</button>' +
            "<output>" +
            (item.unit === "g" ? grams(entry.qty) : entry.qty + " шт") +
            "</output>" +
            '<button type="button" data-cart-step="' +
            step +
            '" data-key="' +
            escapeHtml(lineKey(entry.itemId, entry.variantId)) +
            '" aria-label="Больше">+</button>' +
            "</span>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";

    if (cartFootEl) cartFootEl.hidden = false;
    if (cartTotalEl) cartTotalEl.innerHTML = money(total) + BYN;
  }

  /* ---------------------------------------------------------------- actions */

  function changeQty(itemId, variantId, delta) {
    var item = itemsById[itemId];
    if (!item || item.orderable === false) return;
    var price = unitPrice(item, variantId);
    if (price === null || price === undefined) return;
    var key = lineKey(itemId, variantId);
    var current = cart[key] ? cart[key].qty : 0;
    var next = current + delta;

    if (next <= 0) delete cart[key];
    else cart[key] = { itemId: itemId, variantId: variantId, qty: next };

    saveCart();
    renderDish(itemId);
    renderCart();
  }

  function addToCart(itemId, variantId) {
    var item = itemsById[itemId];
    if (!item || item.orderable === false) return;
    if (unitPrice(item, variantId) == null) return;
    var step = item.variants && item.variants.length ? 1 : item.step || 1;
    changeQty(itemId, variantId, step);
  }

  function setCartOpen(open) {
    var root = document.documentElement;
    if (open) {
      if (!document.body.classList.contains("cart-open")) {
        document.body.dataset.cartScrollY = String(window.scrollY || window.pageYOffset || 0);
      }
      document.body.classList.add("cart-open");
      document.body.style.position = "fixed";
      document.body.style.top = "-" + (document.body.dataset.cartScrollY || "0") + "px";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      root.style.overflow = "hidden";
      resetOrderView();
    } else {
      var y = Number(document.body.dataset.cartScrollY || 0);
      document.body.classList.remove("cart-open");
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      root.style.overflow = "";
      window.scrollTo(0, y);
      delete document.body.dataset.cartScrollY;
    }
  }

  function resetOrderView() {
    var done = document.querySelector("[data-order-done]");
    if (done) done.hidden = true;
    if (orderForm) orderForm.hidden = false;
    if (orderErrorEl) orderErrorEl.hidden = true;
  }

  /* ------------------------------------------------------------------ events */

  if (switchEl) {
    switchEl.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-kind]");
      if (!btn) return;
      kind = btn.getAttribute("data-kind") === "frozen" ? "frozen" : "hall";
      switchEl.querySelectorAll("[data-kind]").forEach(function (el) {
        el.classList.toggle("is-active", el === btn);
      });
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (chipsEl) {
    enableDragScroll(chipsEl);

    chipsEl.addEventListener("click", function (event) {
      var link = event.target.closest('a[href^="#cat-"]');
      if (!link) return;
      event.preventDefault();
      scrollToCategory(link.getAttribute("href").slice(5));
    });
  }

  var spyFrame = 0;
  function queueChipUpdate() {
    if (spyFrame) return;
    spyFrame = requestAnimationFrame(function () {
      spyFrame = 0;
      updateActiveChip();
    });
  }

  window.addEventListener("scroll", queueChipUpdate, { passive: true });
  window.addEventListener("resize", function () {
    syncSwitchHeight();
    queueChipUpdate();
  });

  groupsEl.addEventListener("click", function (event) {
    var variantBtn = event.target.closest("[data-variant][data-item]:not([data-step])");
    if (variantBtn && variantBtn.classList.contains("dish__variant")) {
      chosenVariant[variantBtn.getAttribute("data-item")] = variantBtn.getAttribute("data-variant");
      renderDish(variantBtn.getAttribute("data-item"));
      return;
    }

    var addBtn = event.target.closest("[data-add]");
    if (addBtn) {
      addToCart(addBtn.getAttribute("data-add"), addBtn.getAttribute("data-variant") || "");
      return;
    }

    var stepBtn = event.target.closest("[data-step]");
    if (stepBtn) {
      var item = itemsById[stepBtn.getAttribute("data-item")];
      var step = item && !(item.variants && item.variants.length) ? item.step || 1 : 1;
      changeQty(
        stepBtn.getAttribute("data-item"),
        stepBtn.getAttribute("data-variant") || "",
        Number(stepBtn.getAttribute("data-step")) * step,
      );
    }
  });

  if (cartBodyEl) {
    cartBodyEl.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-cart-step]");
      if (!btn) return;
      var entry = cart[btn.getAttribute("data-key")];
      if (!entry) return;
      changeQty(entry.itemId, entry.variantId, Number(btn.getAttribute("data-cart-step")));
    });
  }

  document.querySelectorAll("[data-cart-open]").forEach(function (el) {
    el.addEventListener("click", function () {
      setCartOpen(true);
    });
  });

  document.querySelectorAll("[data-cart-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      setCartOpen(false);
    });
  });

  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setCartOpen(false);
  });

  if (orderForm) {
    orderForm.addEventListener("change", function (event) {
      if (event.target.name !== "fulfillment") return;
      if (deliveryHintEl) deliveryHintEl.hidden = event.target.value !== "delivery";
    });

    orderForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (orderErrorEl) orderErrorEl.hidden = true;

      var lines = cartLines();
      if (!lines.length) {
        showOrderError("Корзина пуста");
        return;
      }

      var data = new FormData(orderForm);
      var payload = {
        name: String(data.get("name") || ""),
        phone: String(data.get("phone") || ""),
        fulfillment: String(data.get("fulfillment") || "pickup"),
        comment: String(data.get("comment") || ""),
        items: lines.map(function (entry) {
          return { itemId: entry.itemId, variantId: entry.variantId, qty: entry.qty };
        }),
      };

      orderSubmitEl.disabled = true;
      orderSubmitEl.textContent = "Отправляем…";

      Promise.reject(new Error("Онлайн-заказ на GitHub Pages недоступен — откройте сайт на сервере или позвоните нам."))
        .then(function (response) {
          return response.text().then(function (text) {
            var body = null;
            try {
              body = text ? JSON.parse(text) : null;
            } catch (e) {
              body = null;
            }
            if (!response.ok) {
              throw new Error((body && body.error) || "Не удалось отправить заказ");
            }
            return body;
          });
        })
        .then(function (body) {
          cart = {};
          saveCart();
          render();
          showOrderDone(body);
        })
        .catch(function (error) {
          showOrderError(error.message || "Не удалось отправить заказ");
        })
        .then(function () {
          orderSubmitEl.disabled = false;
          orderSubmitEl.textContent = "Отправить заказ";
        });
    });
  }

  function showOrderError(message) {
    if (!orderErrorEl) return;
    orderErrorEl.hidden = false;
    orderErrorEl.textContent = message;
  }

  function showOrderDone(body) {
    var done = document.querySelector("[data-order-done]");
    var numberEl = document.querySelector("[data-order-number]");
    if (numberEl && body && body.number) numberEl.textContent = body.number;
    if (done) done.hidden = false;
    if (orderForm) orderForm.hidden = true;
    if (cartFootEl) cartFootEl.hidden = true;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "order_sent" });
  }

  /* -------------------------------------------------------------------- boot */

  loadCart();

  fetch("/Pelmesto/data/menu.json")
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      menu = {
        categories: Array.isArray(data.categories) ? data.categories : [],
        items: Array.isArray(data.items) ? data.items : [],
      };
      itemsById = {};
      menu.items.forEach(function (item) {
        itemsById[item.id] = item;
      });

      /* Drop lines that vanished, are hall-only, or lost a price. */
      Object.keys(cart).forEach(function (key) {
        var entry = cart[key];
        var item = itemsById[entry && entry.itemId];
        if (!item || item.orderable === false) {
          delete cart[key];
          return;
        }
        if (unitPrice(item, entry.variantId) == null) delete cart[key];
      });
      saveCart();

      if (location.hash.indexOf("#cat-frozen") === 0 || location.search.indexOf("frozen") > -1) {
        kind = "frozen";
        var frozenBtn = switchEl && switchEl.querySelector('[data-kind="frozen"]');
        if (frozenBtn) {
          switchEl.querySelectorAll("[data-kind]").forEach(function (el) {
            el.classList.toggle("is-active", el === frozenBtn);
          });
        }
      }

      render();

      /* Landing on an anchor jumps straight there — animating from the top of a
         freshly loaded page just looks like a glitch. */
      if (location.hash) {
        var target = document.getElementById(location.hash.slice(1));
        if (target) target.scrollIntoView();
      }

      updateActiveChip();
    })
    .catch(function () {
      groupsEl.innerHTML =
        '<p class="menu-loading">Не удалось загрузить меню. Обновите страницу или позвоните нам: <a href="tel:+375295505545">+375 29 550-55-45</a>.</p>';
    });
})();
