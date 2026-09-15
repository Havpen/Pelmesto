/* ПельМесто admin: заказы, редактор меню, акции. */
(function () {
  var TOKEN_KEY = "pel_admin_token";
  var ORDERS_POLL_MS = 20000;

  var loginView = document.getElementById("login-view");
  var appView = document.getElementById("app-view");
  var passInput = document.getElementById("login-password");
  var loginBtn = document.getElementById("login-btn");
  var loginError = document.getElementById("login-error");
  var logoutBtn = document.getElementById("logout-btn");

  var menu = { categories: [], items: [] };
  var orders = [];
  var promoCache = [];
  var pollTimer = null;

  /* ------------------------------------------------------------------ utils */

  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function showError(el, message) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function api(url, options) {
    options = options || {};
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(url, {
      credentials: "same-origin",
      method: options.method || "GET",
      headers: headers,
      body: options.body || undefined,
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          data = null;
        }
        if (!res.ok) {
          var err = new Error((data && data.error) || "Ошибка " + res.status);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(value) {
    return Number(value || 0).toFixed(2).replace(".", ",");
  }

  function grams(value) {
    if (value >= 1000) return String(value / 1000).replace(".", ",") + " кг";
    return value + " г";
  }

  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function num(value) {
    if (value === "" || value === null || value === undefined) return null;
    var parsed = Number(String(value).replace(",", "."));
    return isFinite(parsed) ? parsed : null;
  }

  function formData(form) {
    var out = {};
    new FormData(form).forEach(function (value, key) {
      out[key] = value;
    });
    return out;
  }

  function setAuthed(ok) {
    if (ok) {
      loginView.setAttribute("hidden", "");
      appView.removeAttribute("hidden");
      startPolling();
    } else {
      appView.setAttribute("hidden", "");
      loginView.removeAttribute("hidden");
      stopPolling();
    }
  }

  /* ------------------------------------------------------- reusable cropper */

  /** Wires a file input + canvas into a crop-and-upload widget. */
  function createCropper(config) {
    var fileInput = document.getElementById(config.file);
    var browseBtn = document.getElementById(config.browse);
    var fileName = document.getElementById(config.fileName);
    var wrap = document.getElementById(config.crop);
    var canvas = document.getElementById(config.canvas);
    var zoom = document.getElementById(config.zoom);
    var applyBtn = document.getElementById(config.apply);
    var cancelBtn = document.getElementById(config.cancel);
    var errorEl = document.getElementById(config.error);
    var urlInput = document.getElementById(config.urlInput);
    var preview = document.getElementById(config.preview);

    var img = null;
    var scale = 1;
    var minScale = 1;
    var offsetX = 0;
    var offsetY = 0;
    var dragging = false;
    var lastX = 0;
    var lastY = 0;

    function setUrl(url) {
      if (url) {
        urlInput.value = url;
        preview.src = url;
        preview.hidden = false;
        fileName.textContent = url;
      } else {
        urlInput.value = "";
        preview.removeAttribute("src");
        preview.hidden = true;
        fileName.textContent = "Файл не выбран";
      }
    }

    function clear() {
      img = null;
      wrap.hidden = true;
      fileInput.value = "";
      showError(errorEl, "");
    }

    function draw() {
      if (!img) return;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      var dw = img.naturalWidth * scale;
      var dh = img.naturalHeight * scale;
      /* Keep the image covering the frame. */
      if (offsetX > 0) offsetX = 0;
      if (offsetY > 0) offsetY = 0;
      if (offsetX < canvas.width - dw) offsetX = canvas.width - dw;
      if (offsetY < canvas.height - dh) offsetY = canvas.height - dh;
      ctx.drawImage(img, offsetX, offsetY, dw, dh);
    }

    function open(file) {
      var url = URL.createObjectURL(file);
      var next = new Image();
      next.onload = function () {
        URL.revokeObjectURL(url);
        img = next;
        minScale = Math.max(config.width / next.naturalWidth, config.height / next.naturalHeight);
        scale = minScale;
        offsetX = (config.width - next.naturalWidth * scale) / 2;
        offsetY = (config.height - next.naturalHeight * scale) / 2;
        zoom.value = "100";
        canvas.width = config.width;
        canvas.height = config.height;
        wrap.hidden = false;
        fileName.textContent = file.name || "Выбранный файл";
        showError(errorEl, "");
        draw();
      };
      next.onerror = function () {
        URL.revokeObjectURL(url);
        showError(errorEl, "Не удалось прочитать изображение");
      };
      next.src = url;
    }

    function exportDataUrl() {
      if (!img) return null;
      var out = document.createElement("canvas");
      out.width = config.width;
      out.height = config.height;
      var ctx = out.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, config.width, config.height);
      ctx.drawImage(img, offsetX, offsetY, img.naturalWidth * scale, img.naturalHeight * scale);
      return out.toDataURL("image/jpeg", 0.9);
    }

    browseBtn.onclick = function () {
      fileInput.click();
    };

    fileInput.onchange = function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        showError(errorEl, "Выберите файл изображения");
        return;
      }
      open(file);
    };

    zoom.oninput = function () {
      if (!img) return;
      var prev = scale;
      scale = minScale * (Number(zoom.value) / 100);
      var cx = config.width / 2;
      var cy = config.height / 2;
      offsetX = cx - ((cx - offsetX) * scale) / prev;
      offsetY = cy - ((cy - offsetY) * scale) / prev;
      draw();
    };

    canvas.addEventListener("pointerdown", function (e) {
      if (!img) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.parentElement.classList.add("is-dragging");
    });

    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var rect = canvas.getBoundingClientRect();
      offsetX += (e.clientX - lastX) * (canvas.width / rect.width);
      offsetY += (e.clientY - lastY) * (canvas.height / rect.height);
      lastX = e.clientX;
      lastY = e.clientY;
      draw();
    });

    function endDrag() {
      dragging = false;
      canvas.parentElement.classList.remove("is-dragging");
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    cancelBtn.onclick = function () {
      clear();
      setUrl("");
    };

    applyBtn.onclick = function () {
      showError(errorEl, "");
      var dataUrl = exportDataUrl();
      if (!dataUrl) {
        showError(errorEl, "Сначала выберите фото");
        return;
      }
      applyBtn.disabled = true;
      applyBtn.textContent = "Загрузка…";
      api(config.endpoint, { method: "POST", body: JSON.stringify({ image: dataUrl }) })
        .then(function (res) {
          setUrl(res.url);
          clear();
          fileName.textContent = res.url;
        })
        .catch(function (err) {
          showError(errorEl, err.message || "Не удалось загрузить");
        })
        .then(function () {
          applyBtn.disabled = false;
          applyBtn.textContent = "Обрезать и загрузить";
        });
    };

    return {
      setUrl: setUrl,
      reset: function () {
        clear();
        setUrl("");
      },
    };
  }

  var menuCropper = createCropper({
    file: "menu-file",
    browse: "menu-browse",
    fileName: "menu-file-name",
    crop: "menu-crop",
    canvas: "menu-crop-canvas",
    zoom: "menu-crop-zoom",
    apply: "menu-crop-apply",
    cancel: "menu-crop-cancel",
    error: "menu-crop-error",
    urlInput: "menu-image-url",
    preview: "menu-image-preview",
    endpoint: "/api/admin/upload-menu",
    width: 800,
    height: 800,
  });

  var promoCropper = createCropper({
    file: "promo-file",
    browse: "promo-browse",
    fileName: "promo-file-name",
    crop: "promo-crop",
    canvas: "promo-crop-canvas",
    zoom: "promo-crop-zoom",
    apply: "promo-crop-apply",
    cancel: "promo-crop-cancel",
    error: "promo-crop-error",
    urlInput: "promo-image-url",
    preview: "promo-image-preview",
    endpoint: "/api/admin/upload-promo",
    width: 1550,
    height: 350,
  });

  /* ------------------------------------------------------------------ orders */

  var ordersList = document.getElementById("orders-list");
  var ordersHistory = document.getElementById("orders-history");
  var ordersHistoryCount = document.getElementById("orders-history-count");
  var ordersBadge = document.getElementById("orders-badge");
  var ordersError = document.getElementById("orders-error");
  var ordersUpdated = document.getElementById("orders-updated");
  var ordersRefresh = document.getElementById("orders-refresh");

  function orderItemsHtml(order) {
    return (
      '<ul class="order__items">' +
      (order.items || [])
        .map(function (line) {
          var qty = line.unit === "g" ? grams(line.qty) : line.qty + " шт";
          return (
            "<li><span>" +
            esc(line.title) +
            (line.variantLabel ? " · " + esc(line.variantLabel) : "") +
            " — " +
            esc(qty) +
            "</span><span>" +
            money(line.sum) +
            " BYN</span></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  var STATUS_LABEL = { new: "Новый", confirmed: "Подтверждён", rejected: "Отказ" };

  function orderHtml(order, history) {
    var actions = history
      ? '<button class="btn btn--danger btn--mini" type="button" data-order-delete="' +
        esc(order.id) +
        '">Удалить из истории</button>'
      : '<div class="form-actions">' +
        '<button class="btn btn--dark btn--mini" type="button" data-order-confirm="' +
        esc(order.id) +
        '">Подтвердить</button>' +
        '<button class="btn btn--danger btn--mini" type="button" data-order-reject="' +
        esc(order.id) +
        '">Отказать</button></div>';

    return (
      '<li class="order order--' +
      esc(order.status) +
      '">' +
      '<div class="order__top">' +
      '<p class="order__number">' +
      esc(order.number) +
      ' <span class="order__when">' +
      esc(when(order.createdAt)) +
      "</span></p>" +
      '<span class="order__status order__status--' +
      esc(order.status) +
      '">' +
      esc(STATUS_LABEL[order.status] || order.status) +
      "</span>" +
      "</div>" +
      '<p class="order__who">' +
      "<strong>" +
      esc(order.name) +
      "</strong>" +
      '<a href="tel:' +
      esc(order.phone) +
      '">' +
      esc(order.phone) +
      "</a>" +
      '<span class="order__tag">' +
      (order.fulfillment === "delivery" ? "Доставка (Яндекс, клиент сам)" : "Самовынос") +
      "</span>" +
      "</p>" +
      orderItemsHtml(order) +
      (order.comment ? '<p class="order__comment">' + esc(order.comment) + "</p>" : "") +
      '<div class="order__foot">' +
      '<p class="order__total">' +
      money(order.total) +
      " BYN</p>" +
      actions +
      "</div>" +
      "</li>"
    );
  }

  function renderOrders() {
    var fresh = orders.filter(function (order) {
      return order.status === "new";
    });
    var past = orders.filter(function (order) {
      return order.status !== "new";
    });

    ordersList.innerHTML = fresh.length
      ? fresh
          .map(function (order) {
            return orderHtml(order, false);
          })
          .join("")
      : '<li class="card__empty">Новых заказов нет.</li>';

    ordersHistory.innerHTML = past.length
      ? past
          .map(function (order) {
            return orderHtml(order, true);
          })
          .join("")
      : '<li class="card__empty">История пуста.</li>';

    ordersHistoryCount.textContent = String(past.length);
    ordersBadge.hidden = fresh.length === 0;
    ordersBadge.textContent = String(fresh.length);
    document.title = fresh.length
      ? "(" + fresh.length + ") ПельМесто — админка"
      : "ПельМесто — админка";
    ordersUpdated.textContent = "Обновлено в " + new Date().toLocaleTimeString("ru-RU");
  }

  function loadOrders() {
    return api("/api/orders")
      .then(function (list) {
        orders = list || [];
        showError(ordersError, "");
        renderOrders();
      })
      .catch(function (err) {
        if (err.status === 401) {
          setToken("");
          setAuthed(false);
          return;
        }
        showError(ordersError, err.message || "Не удалось загрузить заказы");
      });
  }

  function setOrderStatus(id, status) {
    return api("/api/orders/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify({ status: status }),
    }).then(loadOrders);
  }

  ordersRefresh.onclick = loadOrders;

  function handleOrderClick(event) {
    var confirmBtn = event.target.closest("[data-order-confirm]");
    if (confirmBtn) {
      setOrderStatus(confirmBtn.getAttribute("data-order-confirm"), "confirmed");
      return;
    }
    var rejectBtn = event.target.closest("[data-order-reject]");
    if (rejectBtn) {
      if (!window.confirm("Отказать в заказе?")) return;
      setOrderStatus(rejectBtn.getAttribute("data-order-reject"), "rejected");
      return;
    }
    var deleteBtn = event.target.closest("[data-order-delete]");
    if (deleteBtn) {
      if (!window.confirm("Удалить заказ из истории безвозвратно?")) return;
      api("/api/orders/" + encodeURIComponent(deleteBtn.getAttribute("data-order-delete")), {
        method: "DELETE",
      }).then(loadOrders);
    }
  }

  ordersList.onclick = handleOrderClick;
  ordersHistory.onclick = handleOrderClick;

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      loadOrders();
    }, ORDERS_POLL_MS);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  /* -------------------------------------------------------------- categories */

  var categoryForm = document.getElementById("category-form");
  var categoryFormTitle = document.getElementById("category-form-title");
  var categorySubmit = document.getElementById("category-submit");
  var categoryCancel = document.getElementById("category-cancel");
  var categoryEditId = document.getElementById("category-edit-id");
  var categoryError = document.getElementById("category-error");
  var categoryList = document.getElementById("category-list");

  var KIND_LABEL = { hall: "Меню зала", frozen: "Заморозка" };

  function sortedCategories() {
    return menu.categories.slice().sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === "hall" ? -1 : 1;
      return (a.order || 0) - (b.order || 0);
    });
  }

  function itemsOf(categoryId) {
    return menu.items.filter(function (item) {
      return item.categoryId === categoryId;
    });
  }

  function resetCategoryForm() {
    categoryForm.reset();
    categoryEditId.value = "";
    categoryFormTitle.textContent = "Новая категория";
    categorySubmit.textContent = "Добавить категорию";
    categoryCancel.hidden = true;
    showError(categoryError, "");
  }

  function renderCategories() {
    var list = sortedCategories();
    categoryList.innerHTML = list.length
      ? list
          .map(function (category) {
            var count = itemsOf(category.id).length;
            return (
              '<div class="row">' +
              '<div class="row__main">' +
              '<p class="row__title">' +
              esc(category.title) +
              ' <span class="menu-cat__kind' +
              (category.kind === "frozen" ? " menu-cat__kind--frozen" : "") +
              '">' +
              esc(KIND_LABEL[category.kind] || category.kind) +
              "</span></p>" +
              '<p class="row__meta">' +
              count +
              " поз." +
              (category.note ? " · " + esc(category.note) : "") +
              "</p>" +
              "</div>" +
              '<div class="row__actions">' +
              '<button class="btn btn--glass btn--mini" type="button" data-edit-category="' +
              esc(category.id) +
              '">Изменить</button>' +
              '<button class="btn btn--danger btn--mini" type="button" data-delete-category="' +
              esc(category.id) +
              '">Удалить</button>' +
              "</div>" +
              "</div>"
            );
          })
          .join("")
      : '<p class="card__empty">Категорий пока нет.</p>';
  }

  categoryForm.onsubmit = function (event) {
    event.preventDefault();
    showError(categoryError, "");
    var data = formData(categoryForm);
    var editId = String(data.id || "").trim();
    delete data.id;
    var request = editId
      ? api("/api/menu/categories/" + encodeURIComponent(editId), {
          method: "PUT",
          body: JSON.stringify(data),
        })
      : api("/api/menu/categories", { method: "POST", body: JSON.stringify(data) });
    request
      .then(function () {
        resetCategoryForm();
        return loadMenu();
      })
      .catch(function (err) {
        showError(categoryError, err.message || "Ошибка");
      });
  };

  categoryCancel.onclick = resetCategoryForm;

  categoryList.onclick = function (event) {
    var editBtn = event.target.closest("[data-edit-category]");
    if (editBtn) {
      var id = editBtn.getAttribute("data-edit-category");
      var found = menu.categories.filter(function (entry) {
        return entry.id === id;
      })[0];
      if (!found) return;
      categoryEditId.value = found.id;
      categoryForm.title.value = found.title || "";
      categoryForm.kind.value = found.kind || "hall";
      categoryForm.note.value = found.note || "";
      categoryFormTitle.textContent = "Редактировать категорию";
      categorySubmit.textContent = "Сохранить";
      categoryCancel.hidden = false;
      categoryForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    var deleteBtn = event.target.closest("[data-delete-category]");
    if (!deleteBtn) return;
    var deleteId = deleteBtn.getAttribute("data-delete-category");
    var count = itemsOf(deleteId).length;
    if (
      !window.confirm(
        count
          ? "Удалить категорию вместе с " + count + " позициями? Это нельзя отменить."
          : "Удалить категорию?",
      )
    ) {
      return;
    }
    api("/api/menu/categories/" + encodeURIComponent(deleteId), { method: "DELETE" })
      .then(loadMenu)
      .catch(function (err) {
        showError(categoryError, err.message || "Ошибка");
      });
  };

  /* ------------------------------------------------------------------- items */

  var itemForm = document.getElementById("item-form");
  var itemFormTitle = document.getElementById("item-form-title");
  var itemSubmit = document.getElementById("item-submit");
  var itemCancel = document.getElementById("item-cancel");
  var itemEditId = document.getElementById("item-edit-id");
  var itemError = document.getElementById("item-error");
  var itemList = document.getElementById("item-list");
  var itemCount = document.getElementById("item-count");
  var itemCategorySelect = document.getElementById("item-category");
  var itemUnitSelect = document.getElementById("item-unit");
  var itemOrderable = document.getElementById("item-orderable");

  function fillCategorySelect() {
    var current = itemCategorySelect.value;
    itemCategorySelect.innerHTML = sortedCategories()
      .map(function (category) {
        return (
          '<option value="' +
          esc(category.id) +
          '">' +
          esc(KIND_LABEL[category.kind] || category.kind) +
          " · " +
          esc(category.title) +
          "</option>"
        );
      })
      .join("");
    if (current) itemCategorySelect.value = current;
  }

  function resetItemForm() {
    itemForm.reset();
    itemEditId.value = "";
    itemOrderable.checked = true;
    itemFormTitle.textContent = "Новая позиция меню";
    itemSubmit.textContent = "Добавить позицию";
    itemCancel.hidden = true;
    showError(itemError, "");
    menuCropper.reset();
  }

  /** Frozen items are priced per 500 g by default, hall items per portion. */
  itemUnitSelect.onchange = function () {
    var isGrams = itemUnitSelect.value === "g";
    if (!itemForm.step.value || itemForm.step.value === "1" || itemForm.step.value === "500") {
      itemForm.step.value = isGrams ? "500" : "1";
    }
    if (
      !itemForm.priceUnit.value ||
      itemForm.priceUnit.value === "1" ||
      itemForm.priceUnit.value === "500"
    ) {
      itemForm.priceUnit.value = isGrams ? "500" : "1";
    }
  };

  function itemRowHtml(item) {
    var priceText =
      item.variants && item.variants.length
        ? item.variants
            .map(function (variant) {
              return variant.label + " — " + money(variant.price);
            })
            .join(" · ")
        : item.price === null || item.price === undefined
          ? "цена не указана"
          : money(item.price) +
            " BYN" +
            (item.unit === "g" && item.priceUnit > 1 ? " / " + grams(item.priceUnit) : "");

    var noPrice = !(item.variants && item.variants.length) && (item.price === null || item.price === undefined);

    return (
      '<div class="row">' +
      (item.imageUrl
        ? '<img class="row__thumb" src="' + esc(item.imageUrl) + '" alt="" loading="lazy" />'
        : '<div class="row__thumb row__thumb--empty">' +
          esc((item.title || "?").charAt(0)) +
          "</div>") +
      '<div class="row__main">' +
      '<p class="row__title">' +
      esc(item.title) +
      (item.badge ? " · " + esc(item.badge) : "") +
      (item.orderable === false ? " · только в зале" : "") +
      "</p>" +
      '<p class="row__meta' +
      (noPrice ? " row__meta--warn" : "") +
      '">' +
      (item.weight ? esc(item.weight) + " · " : "") +
      esc(priceText) +
      (item.nutrition ? " · КБЖУ есть" : "") +
      "</p>" +
      "</div>" +
      '<div class="row__actions">' +
      '<button class="btn btn--glass btn--mini" type="button" data-edit-item="' +
      esc(item.id) +
      '">Изменить</button>' +
      '<button class="btn btn--danger btn--mini" type="button" data-delete-item="' +
      esc(item.id) +
      '">Удалить</button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderItems() {
    var list = sortedCategories();
    itemCount.textContent = String(menu.items.length);
    itemList.innerHTML = list.length
      ? list
          .map(function (category) {
            var rows = itemsOf(category.id);
            return (
              '<section class="menu-cat">' +
              '<div class="menu-cat__head">' +
              '<h3 class="menu-cat__title">' +
              esc(category.title) +
              "</h3>" +
              '<span class="menu-cat__kind' +
              (category.kind === "frozen" ? " menu-cat__kind--frozen" : "") +
              '">' +
              esc(KIND_LABEL[category.kind] || category.kind) +
              "</span>" +
              "</div>" +
              (rows.length
                ? rows.map(itemRowHtml).join("")
                : '<p class="card__empty">Пусто.</p>') +
              "</section>"
            );
          })
          .join("")
      : '<p class="card__empty">Сначала создайте категорию.</p>';
  }

  itemForm.onsubmit = function (event) {
    event.preventDefault();
    showError(itemError, "");
    var data = formData(itemForm);
    var editId = String(data.id || "").trim();
    var existing = editId
      ? menu.items.filter(function (entry) {
          return entry.id === editId;
        })[0]
      : null;

    var payload = {
      categoryId: data.categoryId,
      title: data.title,
      description: data.description,
      weight: data.weight,
      price: data.price,
      unit: data.unit,
      step: data.step,
      priceUnit: data.priceUnit,
      badge: data.badge,
      orderable: itemOrderable.checked,
      imageUrl: data.imageUrl,
      slug: existing ? existing.slug : "",
      /* Variants stay as-is; they are only seeded, not edited here. */
      variants: existing ? existing.variants : [],
      nutrition: {
        protein: num(data.protein),
        fat: num(data.fat),
        carbs: num(data.carbs),
        kcal: num(data.kcal),
      },
    };

    var request = editId
      ? api("/api/menu/items/" + encodeURIComponent(editId), {
          method: "PUT",
          body: JSON.stringify(payload),
        })
      : api("/api/menu/items", { method: "POST", body: JSON.stringify(payload) });

    request
      .then(function () {
        resetItemForm();
        return loadMenu();
      })
      .catch(function (err) {
        showError(itemError, err.message || "Ошибка");
      });
  };

  itemCancel.onclick = resetItemForm;

  itemList.onclick = function (event) {
    var editBtn = event.target.closest("[data-edit-item]");
    if (editBtn) {
      var id = editBtn.getAttribute("data-edit-item");
      var item = menu.items.filter(function (entry) {
        return entry.id === id;
      })[0];
      if (!item) return;
      itemEditId.value = item.id;
      itemForm.categoryId.value = item.categoryId || "";
      itemForm.title.value = item.title || "";
      itemForm.description.value = item.description || "";
      itemForm.weight.value = item.weight || "";
      itemForm.price.value = item.price === null || item.price === undefined ? "" : item.price;
      itemForm.badge.value = item.badge || "";
      itemForm.unit.value = item.unit || "pcs";
      itemForm.step.value = item.step || 1;
      itemForm.priceUnit.value = item.priceUnit || 1;
      itemOrderable.checked = item.orderable !== false;
      itemForm.protein.value = item.nutrition && item.nutrition.protein !== null ? item.nutrition.protein : "";
      itemForm.fat.value = item.nutrition && item.nutrition.fat !== null ? item.nutrition.fat : "";
      itemForm.carbs.value = item.nutrition && item.nutrition.carbs !== null ? item.nutrition.carbs : "";
      itemForm.kcal.value = item.nutrition && item.nutrition.kcal !== null ? item.nutrition.kcal : "";
      menuCropper.setUrl(item.imageUrl || "");
      itemFormTitle.textContent = "Редактировать позицию";
      itemSubmit.textContent = "Сохранить";
      itemCancel.hidden = false;
      showError(itemError, "");
      itemForm.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    var deleteBtn = event.target.closest("[data-delete-item]");
    if (!deleteBtn) return;
    if (!window.confirm("Удалить позицию из меню?")) return;
    api("/api/menu/items/" + encodeURIComponent(deleteBtn.getAttribute("data-delete-item")), {
      method: "DELETE",
    })
      .then(loadMenu)
      .catch(function (err) {
        showError(itemError, err.message || "Ошибка");
      });
  };

  function loadMenu() {
    return api("/api/menu").then(function (data) {
      menu = {
        categories: (data && data.categories) || [],
        items: (data && data.items) || [],
      };
      fillCategorySelect();
      renderCategories();
      renderItems();
    });
  }

  /* ------------------------------------------------------------------ promos */

  var promoForm = document.getElementById("promo-form");
  var promoFormTitle = document.getElementById("promo-form-title");
  var promoSubmit = document.getElementById("promo-submit");
  var promoCancel = document.getElementById("promo-cancel");
  var promoEditId = document.getElementById("promo-edit-id");
  var promoError = document.getElementById("promo-error");
  var promoList = document.getElementById("promo-list");

  function resetPromoForm() {
    promoForm.reset();
    promoEditId.value = "";
    promoFormTitle.textContent = "Новая акция / новость";
    promoSubmit.textContent = "Добавить акцию";
    promoCancel.hidden = true;
    showError(promoError, "");
    promoCropper.reset();
  }

  function renderPromos(items) {
    promoCache = items || [];
    if (!promoCache.length) {
      promoList.innerHTML = '<li class="card__empty">Пока нет акций и новостей.</li>';
      return;
    }
    promoList.innerHTML = promoCache
      .map(function (item) {
        var locked = !!(item.locked || item.seo);
        var actions = locked
          ? '<span class="card__lock" title="SEO-акция закреплена">🔒 SEO</span>'
          : '<div class="card__actions">' +
            '<button class="btn btn--glass btn--mini" type="button" data-edit-promo="' +
            esc(item.id) +
            '">Изменить</button>' +
            '<button class="btn btn--danger btn--mini" type="button" data-delete-promo="' +
            esc(item.id) +
            '">Удалить</button></div>';
        return (
          '<li class="card' +
          (locked ? " card--locked" : "") +
          '">' +
          '<div class="card__top"><div><h3 class="card__title">' +
          esc(item.title) +
          "</h3>" +
          (item.link ? '<p class="card__meta">' + esc(item.link) + "</p>" : "") +
          (locked ? '<p class="card__meta">Закреплено для SEO · редактирование недоступно</p>' : "") +
          "</div>" +
          actions +
          "</div>" +
          (item.text ? '<p class="card__text">' + esc(item.text) + "</p>" : "") +
          (item.imageUrl
            ? '<img class="card__thumb" src="' + esc(item.imageUrl) + '" alt="" loading="lazy" />'
            : "") +
          "</li>"
        );
      })
      .join("");
  }

  promoForm.onsubmit = function (event) {
    event.preventDefault();
    showError(promoError, "");
    var data = formData(promoForm);
    var editId = String(data.id || "").trim();
    delete data.id;
    var request = editId
      ? api("/api/promos/" + encodeURIComponent(editId), {
          method: "PUT",
          body: JSON.stringify(data),
        })
      : api("/api/promos", { method: "POST", body: JSON.stringify(data) });
    request
      .then(function () {
        resetPromoForm();
        return loadPromos();
      })
      .catch(function (err) {
        showError(promoError, err.message || "Ошибка");
      });
  };

  promoCancel.onclick = resetPromoForm;

  promoList.onclick = function (event) {
    var editBtn = event.target.closest("[data-edit-promo]");
    if (editBtn) {
      var id = editBtn.getAttribute("data-edit-promo");
      var found = promoCache.filter(function (entry) {
        return entry.id === id;
      })[0];
      if (!found) return;
      if (found.locked || found.seo) {
        showError(promoError, "SEO-акция закреплена и недоступна для редактирования");
        return;
      }
      promoEditId.value = found.id;
      promoForm.title.value = found.title || "";
      promoForm.text.value = found.text || "";
      promoForm.link.value = found.link || "";
      promoCropper.setUrl(found.imageUrl || "");
      promoFormTitle.textContent = "Редактировать акцию";
      promoSubmit.textContent = "Сохранить";
      promoCancel.hidden = false;
      showError(promoError, "");
      promoForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    var deleteBtn = event.target.closest("[data-delete-promo]");
    if (!deleteBtn) return;
    var deleteId = deleteBtn.getAttribute("data-delete-promo");
    var target = promoCache.filter(function (entry) {
      return entry.id === deleteId;
    })[0];
    if (target && (target.locked || target.seo)) {
      showError(promoError, "SEO-акция закреплена и недоступна для удаления");
      return;
    }
    if (!window.confirm("Удалить акцию?")) return;
    api("/api/promos/" + encodeURIComponent(deleteId), { method: "DELETE" }).then(function () {
      resetPromoForm();
      return loadPromos();
    });
  };

  function loadPromos() {
    return api("/api/promos").then(renderPromos);
  }

  /* ------------------------------------------------------------ auth + tabs */

  function refreshAll() {
    return Promise.all([loadOrders(), loadMenu(), loadPromos()]);
  }

  function doLogin() {
    showError(loginError, "");
    var password = passInput.value;
    if (!password) {
      showError(loginError, "Введите пароль");
      return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = "Входим…";
    api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: password }) })
      .then(function (data) {
        if (data && data.token) setToken(data.token);
        setAuthed(true);
        passInput.value = "";
        return refreshAll();
      })
      .catch(function (err) {
        showError(loginError, (err && err.message) || "Не удалось войти");
        setAuthed(false);
      })
      .then(function () {
        loginBtn.disabled = false;
        loginBtn.textContent = "Войти";
      });
  }

  loginBtn.onclick = function (event) {
    event.preventDefault();
    doLogin();
  };

  passInput.onkeydown = function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      doLogin();
    }
  };

  logoutBtn.onclick = function () {
    api("/api/admin/logout", { method: "POST", body: "{}" })
      .catch(function () {})
      .then(function () {
        setToken("");
        setAuthed(false);
      });
  };

  document.querySelectorAll("[data-tab]").forEach(function (btn) {
    btn.onclick = function () {
      document.querySelectorAll(".tabs__btn").forEach(function (el) {
        el.classList.remove("is-active");
      });
      document.querySelectorAll(".panel").forEach(function (el) {
        el.classList.remove("is-active");
      });
      btn.classList.add("is-active");
      document.getElementById("panel-" + btn.getAttribute("data-tab")).classList.add("is-active");
    };
  });

  if (getToken()) {
    api("/api/admin/session")
      .then(function (session) {
        if (session && session.ok) {
          setAuthed(true);
          return refreshAll();
        }
        setToken("");
        setAuthed(false);
      })
      .catch(function () {
        setToken("");
        setAuthed(false);
      });
  } else {
    setAuthed(false);
  }
})();
