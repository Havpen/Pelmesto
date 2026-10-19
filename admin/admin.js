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

  /** Wires a file input + canvas into a crop-and-upload widget.
   *  frame:true shows the whole photo and a movable card-ratio crop box. */
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
    var recropBtn = config.recrop ? document.getElementById(config.recrop) : null;
    var frameMode = !!config.frame;
    var stage = canvas.parentElement;

    var img = null;
    var savedUrl = "";
    var scale = 1;
    var minScale = 1;
    var offsetX = 0;
    var offsetY = 0;
    var dragging = false;
    var lastX = 0;
    var lastY = 0;
    var view = { x: 0, y: 0, s: 1 };
    var crop = { x: 0, y: 0, w: 0, h: 0 };
    var drag = null;
    var laidW = 0;
    var laidH = 0;
    var box = null;
    var handle = null;

    if (frameMode) {
      box = document.createElement("div");
      box.className = "crop__box";
      handle = document.createElement("span");
      handle.className = "crop__handle";
      handle.title = "Потяните, чтобы изменить кадр";
      box.appendChild(handle);
      stage.appendChild(box);
    }

    function syncChrome() {
      var showSaved = !!(savedUrl && wrap.hidden);
      if (showSaved) {
        if (preview.getAttribute("src") !== savedUrl) preview.src = savedUrl;
        preview.hidden = false;
        fileName.textContent = savedUrl;
      } else if (!savedUrl) {
        preview.removeAttribute("src");
        preview.hidden = true;
        if (wrap.hidden) fileName.textContent = "Файл не выбран";
      } else {
        preview.hidden = true;
      }
      if (recropBtn) recropBtn.hidden = !showSaved;
    }

    function setUrl(url) {
      savedUrl = url || "";
      urlInput.value = savedUrl;
      syncChrome();
    }

    function clear() {
      img = null;
      drag = null;
      wrap.hidden = true;
      fileInput.value = "";
      showError(errorEl, "");
      laidW = 0;
      laidH = 0;
      syncChrome();
    }

    function draw() {
      if (!img) return;
      var ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
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

    function imageBounds() {
      return {
        x: view.x,
        y: view.y,
        w: img.naturalWidth * view.s,
        h: img.naturalHeight * view.s,
      };
    }

    function maxCropSize(bounds) {
      var ar = config.width / config.height;
      var w = bounds.w;
      var h = w / ar;
      if (h > bounds.h) {
        h = bounds.h;
        w = h * ar;
      }
      return { w: w, h: h };
    }

    function clampCrop() {
      var bounds = imageBounds();
      var max = maxCropSize(bounds);
      var ar = config.width / config.height;
      if (crop.w > max.w) {
        crop.w = max.w;
        crop.h = max.h;
      }
      var minW = max.w / 3;
      if (crop.w < minW) {
        crop.w = minW;
        crop.h = crop.w / ar;
      }
      if (crop.x < bounds.x) crop.x = bounds.x;
      if (crop.y < bounds.y) crop.y = bounds.y;
      if (crop.x + crop.w > bounds.x + bounds.w) crop.x = bounds.x + bounds.w - crop.w;
      if (crop.y + crop.h > bounds.y + bounds.h) crop.y = bounds.y + bounds.h - crop.h;
    }

    function syncZoomFromCrop() {
      var max = maxCropSize(imageBounds());
      var pct = Math.round((max.w / crop.w) * 100);
      if (pct < 100) pct = 100;
      if (pct > 300) pct = 300;
      zoom.value = String(pct);
    }

    function placeInitialCrop() {
      var bounds = imageBounds();
      var max = maxCropSize(bounds);
      crop.w = max.w;
      crop.h = max.h;
      crop.x = bounds.x + (bounds.w - crop.w) / 2;
      crop.y = bounds.y + (bounds.h - crop.h) / 2;
      syncZoomFromCrop();
    }

    function cropInImage() {
      return {
        sx: (crop.x - view.x) / view.s,
        sy: (crop.y - view.y) / view.s,
        sw: crop.w / view.s,
        sh: crop.h / view.s,
      };
    }

    function restoreCrop(rel) {
      crop.x = view.x + rel.sx * view.s;
      crop.y = view.y + rel.sy * view.s;
      crop.w = rel.sw * view.s;
      crop.h = rel.sh * view.s;
      clampCrop();
      syncZoomFromCrop();
    }

    function fitImage() {
      var sw = stage.clientWidth;
      var sh = stage.clientHeight;
      if (sw < 2 || sh < 2 || !img) return false;
      laidW = sw;
      laidH = sh;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(sw * dpr);
      canvas.height = Math.round(sh * dpr);
      var fit = Math.min(sw / img.naturalWidth, sh / img.naturalHeight);
      view.s = fit;
      view.x = (sw - img.naturalWidth * fit) / 2;
      view.y = (sh - img.naturalHeight * fit) / 2;
      return true;
    }

    function drawFrame() {
      if (!img) return;
      var sw = stage.clientWidth;
      var sh = stage.clientHeight;
      var dpr = canvas.width / sw;
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(0, 0, sw, sh);
      ctx.drawImage(img, view.x, view.y, img.naturalWidth * view.s, img.naturalHeight * view.s);
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.rect(0, 0, sw, sh);
      ctx.rect(crop.x, crop.y, crop.w, crop.h);
      ctx.fill("evenodd");
      box.style.left = crop.x + "px";
      box.style.top = crop.y + "px";
      box.style.width = crop.w + "px";
      box.style.height = crop.h + "px";
    }

    function begin(next, label) {
      img = next;
      wrap.hidden = false;
      fileName.textContent = label;
      showError(errorEl, "");
      zoom.value = "100";
      if (frameMode) {
        syncChrome();
        requestAnimationFrame(function () {
          fitImage();
          placeInitialCrop();
          drawFrame();
          wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return;
      }
      minScale = Math.max(config.width / next.naturalWidth, config.height / next.naturalHeight);
      scale = minScale;
      offsetX = (config.width - next.naturalWidth * scale) / 2;
      offsetY = (config.height - next.naturalHeight * scale) / 2;
      canvas.width = config.width;
      canvas.height = config.height;
      draw();
    }

    function open(file) {
      var url = URL.createObjectURL(file);
      var next = new Image();
      next.onload = function () {
        URL.revokeObjectURL(url);
        begin(next, file.name || "Выбранный файл");
      };
      next.onerror = function () {
        URL.revokeObjectURL(url);
        wrap.hidden = false;
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
      if (frameMode) {
        var sx = (crop.x - view.x) / view.s;
        var sy = (crop.y - view.y) / view.s;
        var sw = crop.w / view.s;
        var sh = crop.h / view.s;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, config.width, config.height);
      } else {
        ctx.drawImage(img, offsetX, offsetY, img.naturalWidth * scale, img.naturalHeight * scale);
      }
      return out.toDataURL("image/jpeg", 0.9);
    }

    browseBtn.onclick = function () {
      fileInput.click();
    };

    fileInput.onchange = function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.type && !/^image\//.test(file.type)) {
        wrap.hidden = false;
        showError(errorEl, "Выберите файл изображения");
        return;
      }
      open(file);
    };

    zoom.oninput = function () {
      if (!img) return;
      if (frameMode) {
        var bounds = imageBounds();
        var max = maxCropSize(bounds);
        var pct = Number(zoom.value) / 100;
        if (pct < 1) pct = 1;
        var w = max.w / pct;
        var h = max.h / pct;
        var cx = crop.x + crop.w / 2;
        var cy = crop.y + crop.h / 2;
        crop.w = w;
        crop.h = h;
        crop.x = cx - w / 2;
        crop.y = cy - h / 2;
        clampCrop();
        drawFrame();
        return;
      }
      var prev = scale;
      scale = minScale * (Number(zoom.value) / 100);
      var midX = config.width / 2;
      var midY = config.height / 2;
      offsetX = midX - ((midX - offsetX) * scale) / prev;
      offsetY = midY - ((midY - offsetY) * scale) / prev;
      draw();
    };

    if (frameMode) {
      function startBoxDrag(type, event) {
        if (!img) return;
        event.preventDefault();
        event.stopPropagation();
        drag = {
          type: type,
          px: event.clientX,
          py: event.clientY,
          cx: crop.x,
          cy: crop.y,
          cw: crop.w,
          ch: crop.h,
        };
        box.classList.add("is-dragging");
        document.addEventListener("pointermove", onBoxDrag);
        document.addEventListener("pointerup", endBoxDrag);
        document.addEventListener("pointercancel", endBoxDrag);
      }

      function onBoxDrag(event) {
        if (!drag) return;
        var dx = event.clientX - drag.px;
        var dy = event.clientY - drag.py;
        if (drag.type === "move") {
          crop.x = drag.cx + dx;
          crop.y = drag.cy + dy;
          crop.w = drag.cw;
          crop.h = drag.ch;
        } else {
          var ar = config.width / config.height;
          var nextW = drag.cw + dx;
          var nextH = nextW / ar;
          if (Math.abs(dy) > Math.abs(dx / ar)) {
            nextH = drag.ch + dy;
            nextW = nextH * ar;
          }
          crop.x = drag.cx;
          crop.y = drag.cy;
          crop.w = nextW;
          crop.h = nextH;
        }
        clampCrop();
        if (drag.type === "resize") syncZoomFromCrop();
        drawFrame();
      }

      function endBoxDrag() {
        drag = null;
        box.classList.remove("is-dragging");
        document.removeEventListener("pointermove", onBoxDrag);
        document.removeEventListener("pointerup", endBoxDrag);
        document.removeEventListener("pointercancel", endBoxDrag);
      }

      box.addEventListener("pointerdown", function (event) {
        if (event.target === handle) return;
        startBoxDrag("move", event);
      });
      handle.addEventListener("pointerdown", function (event) {
        startBoxDrag("resize", event);
      });

      if (window.ResizeObserver) {
        var resizeObserver = new ResizeObserver(function () {
          if (!img || wrap.hidden) return;
          if (stage.clientWidth === laidW && stage.clientHeight === laidH) return;
          var rel = cropInImage();
          if (!fitImage()) return;
          if (rel.sw > 1) restoreCrop(rel);
          else placeInitialCrop();
          drawFrame();
        });
        resizeObserver.observe(stage);
      }

      if (recropBtn) {
        recropBtn.onclick = function () {
          if (!savedUrl) return;
          var next = new Image();
          next.onload = function () {
            begin(next, "Текущее фото");
          };
          next.onerror = function () {
            wrap.hidden = false;
            showError(errorEl, "Не удалось прочитать изображение");
          };
          next.src = savedUrl;
        };
      }
    } else {
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
    }

    cancelBtn.onclick = function () {
      var keep = frameMode ? savedUrl : "";
      clear();
      setUrl(keep);
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
    frame: true,
    recrop: "promo-recrop",
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
    renderStats();
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

  /* ------------------------------------------------------------------- stats */

  var statsRange = "week";
  var statsCategories = null;
  var STATS_MS = {
    day: 86400000,
    week: 7 * 86400000,
    month: 30 * 86400000,
    half: 182 * 86400000,
  };
  var STATS_BUCKETS = { day: 24, week: 7, month: 30, half: 6 };
  var STATS_COMPARE = {
    day: "к предыдущим суткам",
    week: "к предыдущей неделе",
    month: "к предыдущим 30 дням",
    half: "к предыдущим 6 месяцам",
  };

  function statsDelta(current, previous) {
    if (!previous && !current) return '<span class="delta delta--flat">— 0%</span>';
    if (!previous) return '<span class="delta delta--up">▲ новое</span>';
    var pct = ((current - previous) / previous) * 100;
    if (Math.abs(pct) < 0.05) return '<span class="delta delta--flat">— 0%</span>';
    var abs = Math.abs(pct);
    var text = (abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10).toString().replace(".", ",");
    if (pct > 0) return '<span class="delta delta--up">▲ ' + text + "%</span>";
    return '<span class="delta delta--down">▼ ' + text + "%</span>";
  }

  function categoryFilterOn() {
    return !!(statsCategories && statsCategories.size);
  }

  function lineIncluded(line) {
    if (!categoryFilterOn()) return true;
    return statsCategories.has(String(line.category || ""));
  }

  function orderIncluded(order) {
    if (!categoryFilterOn()) return true;
    return (order.items || []).some(lineIncluded);
  }

  function orderValue(order) {
    if (!categoryFilterOn()) return Number(order.total) || 0;
    var sum = 0;
    (order.items || []).forEach(function (line) {
      if (lineIncluded(line)) sum += Number(line.sum) || 0;
    });
    return sum;
  }

  function confirmedBetween(start, end) {
    return orders.filter(function (order) {
      if (order.status !== "confirmed") return false;
      if (!orderIncluded(order)) return false;
      var t = new Date(order.createdAt).getTime();
      return t >= start && t < end;
    });
  }

  function collectOrders(list) {
    var profit = 0;
    var dishes = {};
    list.forEach(function (order) {
      profit += orderValue(order);
      var seen = {};
      (order.items || []).forEach(function (line) {
        if (!lineIncluded(line)) return;
        var name = String(line.title || "Без названия");
        if (line.variantLabel) name += " · " + line.variantLabel;
        var key = name + "|" + (line.category || "");
        if (!dishes[key]) {
          dishes[key] = {
            name: name,
            category: line.category || "",
            revenue: 0,
            orders: 0,
            qty: 0,
            unit: line.unit || "pcs",
          };
        }
        dishes[key].revenue += Number(line.sum) || 0;
        dishes[key].qty += Number(line.qty) || 0;
        if (!seen[key]) {
          seen[key] = true;
          dishes[key].orders += 1;
        }
      });
    });
    return {
      profit: profit,
      count: list.length,
      avg: list.length ? profit / list.length : 0,
      dishes: dishes,
    };
  }

  function bucketSums(list, start, end, count) {
    var step = (end - start) / count;
    var sums = [];
    var labels = [];
    for (var i = 0; i < count; i++) {
      var a = start + i * step;
      var b = i === count - 1 ? end : start + (i + 1) * step;
      var sum = 0;
      list.forEach(function (order) {
        var t = new Date(order.createdAt).getTime();
        if (t >= a && t < b) sum += orderValue(order);
      });
      sums.push(sum);
      var d = new Date(a);
      if (statsRange === "day") labels.push(("0" + d.getHours()).slice(-2));
      else if (statsRange === "half") {
        labels.push(d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""));
      } else labels.push(String(d.getDate()));
    }
    return { sums: sums, labels: labels };
  }

  function trendSvg(current, previous, labels) {
    var w = 640;
    var h = 188;
    var padL = 4;
    var padR = 4;
    var padT = 10;
    var padB = 26;
    var n = current.length;
    var max = 1;
    for (var i = 0; i < n; i++) max = Math.max(max, current[i], previous[i] || 0);
    var slot = (w - padL - padR) / n;
    var barW = Math.max(2, (slot - 5) / 2);
    var innerH = h - padT - padB;
    var parts = [];
    for (var j = 0; j < n; j++) {
      var x = padL + j * slot;
      var ph = ((previous[j] || 0) / max) * innerH;
      var ch = (current[j] / max) * innerH;
      if (ph) {
        parts.push(
          '<rect class="stats-bar stats-bar--prev" x="' +
            x.toFixed(1) +
            '" y="' +
            (padT + innerH - ph).toFixed(1) +
            '" width="' +
            barW.toFixed(1) +
            '" height="' +
            ph.toFixed(1) +
            '" rx="2"></rect>',
        );
      }
      if (ch) {
        parts.push(
          '<rect class="stats-bar stats-bar--now" x="' +
            (x + barW + 2).toFixed(1) +
            '" y="' +
            (padT + innerH - ch).toFixed(1) +
            '" width="' +
            barW.toFixed(1) +
            '" height="' +
            ch.toFixed(1) +
            '" rx="2"></rect>',
        );
      }
      var show = statsRange !== "day" || j % 4 === 0;
      if (show) {
        parts.push(
          '<text x="' +
            (x + slot / 2).toFixed(1) +
            '" y="' +
            (h - 6) +
            '" text-anchor="middle">' +
            esc(labels[j]) +
            "</text>",
        );
      }
    }
    var dense = n > 16 ? " is-dense" : "";
    return (
      '<svg class="' +
      dense.trim() +
      '" viewBox="0 0 ' +
      w +
      " " +
      h +
      '" role="img" aria-label="Прибыль по отрезкам">' +
      parts.join("") +
      "</svg>"
    );
  }

  function rankHtml(title, rows, valueOf, prevOf, labelOf) {
    var body = rows.length
      ? '<ol class="stats-rank">' +
        rows
          .map(function (dish, index) {
            var value = valueOf(dish);
            var max = valueOf(rows[0]) || 1;
            var width = Math.max(4, (value / max) * 100);
            return (
              '<li><span class="stats-rank__pos">' +
              (index + 1) +
              '</span><div><div class="stats-rank__name">' +
              esc(dish.name) +
              "</div>" +
              (dish.category ? '<div class="stats-rank__meta">' + esc(dish.category) + "</div>" : "") +
              '<div class="stats-rank__track"><span style="width:' +
              width.toFixed(1) +
              '%"></span></div></div><div class="stats-rank__val"><span>' +
              labelOf(dish) +
              "</span>" +
              statsDelta(value, prevOf(dish)) +
              "</div></li>"
            );
          })
          .join("") +
        "</ol>"
      : '<p class="card__empty">За этот срок позиций нет.</p>';
    return "<h3>" + title + "</h3>" + body;
  }

  function renderStats() {
    var root = document.getElementById("stats-kpis");
    var trend = document.getElementById("stats-trend");
    var moneyBox = document.getElementById("stats-money");
    var freqBox = document.getElementById("stats-freq");
    var note = document.getElementById("stats-note");
    if (!root || !trend || !moneyBox || !freqBox) return;

    var now = Date.now();
    var span = STATS_MS[statsRange] || STATS_MS.week;
    var currentOrders = confirmedBetween(now - span, now);
    var previousOrders = confirmedBetween(now - span * 2, now - span);
    var current = collectOrders(currentOrders);
    var previous = collectOrders(previousOrders);
    var buckets = STATS_BUCKETS[statsRange] || 7;
    var nowBuckets = bucketSums(currentOrders, now - span, now, buckets);
    var prevBuckets = bucketSums(previousOrders, now - span * 2, now - span, buckets);

    var catBox = document.getElementById("stats-cats");
    var catOptions = [];
    var catSeen = {};
    sortedCategories().forEach(function (category) {
      var title = String(category.title || "").trim();
      if (!title || catSeen[title]) return;
      catSeen[title] = true;
      catOptions.push(title);
    });
    orders.forEach(function (order) {
      (order.items || []).forEach(function (line) {
        var title = String(line.category || "").trim();
        if (!title || catSeen[title]) return;
        catSeen[title] = true;
        catOptions.push(title);
      });
    });
    if (statsCategories) {
      var still = new Set();
      statsCategories.forEach(function (title) {
        if (catSeen[title]) still.add(title);
      });
      statsCategories = still.size ? still : null;
    }
    if (catBox) {
      catBox.innerHTML =
        '<button class="stats__range' +
        (categoryFilterOn() ? "" : " is-active") +
        '" type="button" data-stats-cat="*">Все</button>' +
        catOptions
          .map(function (title) {
            var on = categoryFilterOn() && statsCategories.has(title);
            return (
              '<button class="stats__range' +
              (on ? " is-active" : "") +
              '" type="button" data-stats-cat="' +
              esc(title) +
              '">' +
              esc(title) +
              "</button>"
            );
          })
          .join("");
    }

    if (note) {
      var catNote = "";
      if (categoryFilterOn()) {
        var names = Array.from(statsCategories);
        catNote =
          (names.length > 1 ? " Категории: " : " Категория: ") +
          names.join(", ") +
          ". Прибыль — сумма позиций выбранных категорий.";
      }
      note.textContent =
        "Подтверждённые заказы. Стрелка — " +
        (STATS_COMPARE[statsRange] || "к прошлому сроку") +
        "." +
        catNote;
    }

    root.innerHTML = [
      ["Прибыль", money(current.profit) + ' <small>BYN</small>', current.profit, previous.profit],
      ["Заказов", String(current.count), current.count, previous.count],
      ["Средний чек", money(current.avg) + ' <small>BYN</small>', current.avg, previous.avg],
      [
        "Позиций в заказах",
        String(
          Object.keys(current.dishes).reduce(function (sum, key) {
            return sum + current.dishes[key].orders;
          }, 0),
        ),
        Object.keys(current.dishes).reduce(function (sum, key) {
          return sum + current.dishes[key].orders;
        }, 0),
        Object.keys(previous.dishes).reduce(function (sum, key) {
          return sum + previous.dishes[key].orders;
        }, 0),
      ],
    ]
      .map(function (card) {
        return (
          '<article class="stats-kpi"><p class="stats-kpi__label">' +
          card[0] +
          '</p><p class="stats-kpi__value">' +
          card[1] +
          '</p><p class="stats-kpi__delta">' +
          statsDelta(card[2], card[3]) +
          "</p></article>"
        );
      })
      .join("");

    trend.innerHTML =
      "<h3>Прибыль по отрезкам</h3>" +
      '<p class="stats-legend"><span><i class="is-now"></i>Этот срок</span><span><i class="is-prev"></i>Прошлый срок</span></p>' +
      trendSvg(nowBuckets.sums, prevBuckets.sums, nowBuckets.labels);

    var merged = {};
    Object.keys(current.dishes).forEach(function (key) {
      merged[key] = current.dishes[key];
      merged[key].prevRevenue = previous.dishes[key] ? previous.dishes[key].revenue : 0;
      merged[key].prevOrders = previous.dishes[key] ? previous.dishes[key].orders : 0;
    });
    var list = Object.keys(merged).map(function (key) {
      return merged[key];
    });
    var byMoney = list
      .slice()
      .sort(function (a, b) {
        return b.revenue - a.revenue;
      })
      .slice(0, 8);
    var byFreq = list
      .slice()
      .sort(function (a, b) {
        return b.orders - a.orders || b.revenue - a.revenue;
      })
      .slice(0, 8);
    moneyBox.innerHTML = rankHtml(
      "Сколько принесли позиции",
      byMoney,
      function (dish) {
        return dish.revenue;
      },
      function (dish) {
        return dish.prevRevenue;
      },
      function (dish) {
        return money(dish.revenue) + " BYN";
      },
    );
    freqBox.innerHTML = rankHtml(
      "Чаще в заказах",
      byFreq,
      function (dish) {
        return dish.orders;
      },
      function (dish) {
        return dish.prevOrders;
      },
      function (dish) {
        var qty = dish.unit === "g" ? grams(dish.qty) : dish.qty + " шт";
        var n = dish.orders;
        var n10 = n % 10;
        var n100 = n % 100;
        var times =
          n10 === 1 && n100 !== 11
            ? n + " заказ"
            : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)
              ? n + " заказа"
              : n + " заказов";
        return times + " · " + qty;
      },
    );
  }

  var statsCats = document.getElementById("stats-cats");
  if (statsCats) {
    statsCats.onclick = function (event) {
      var btn = event.target.closest("[data-stats-cat]");
      if (!btn) return;
      var title = btn.getAttribute("data-stats-cat");
      if (title === "*") {
        statsCategories = null;
      } else {
        if (!statsCategories) statsCategories = new Set();
        if (statsCategories.has(title)) statsCategories.delete(title);
        else statsCategories.add(title);
        if (!statsCategories.size) statsCategories = null;
      }
      renderStats();
    };
  }

  var statsRanges = document.getElementById("stats-ranges");
  if (statsRanges) {
    statsRanges.onclick = function (event) {
      var btn = event.target.closest("[data-stats-range]");
      if (!btn) return;
      statsRange = btn.getAttribute("data-stats-range");
      statsRanges.querySelectorAll("[data-stats-range]").forEach(function (el) {
        el.classList.toggle("is-active", el === btn);
      });
      renderStats();
    };
  }

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
        var lockBtn =
          '<button class="btn btn--glass btn--mini" type="button" data-lock-promo="' +
          esc(item.id) +
          '" data-locked="' +
          (locked ? "1" : "0") +
          '">' +
          (locked ? "🔒 SEO" : "Замок") +
          "</button>";
        var actions = locked
          ? lockBtn
          : '<div class="card__actions">' +
            lockBtn +
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
    if (!document.getElementById("promo-crop").hidden) {
      showError(promoError, "Сначала отметьте кадр и нажмите «Обрезать и загрузить»");
      return;
    }
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
    var lockBtn = event.target.closest("[data-lock-promo]");
    if (lockBtn) {
      var lockId = lockBtn.getAttribute("data-lock-promo");
      var isLocked = lockBtn.getAttribute("data-locked") === "1";
      var password = window.prompt(
        isLocked
          ? "Пароль админки, чтобы снять замок"
          : "Пароль админки, чтобы поставить замок",
      );
      if (password == null) return;
      if (!String(password).trim()) {
        showError(promoError, "Введите пароль");
        return;
      }
      api("/api/promos/" + encodeURIComponent(lockId) + "/lock", {
        method: "POST",
        body: JSON.stringify({ password: password }),
      })
        .then(function () {
          showError(promoError, "");
          return loadPromos();
        })
        .catch(function (err) {
          showError(promoError, (err && err.message) || "Неверный пароль");
        });
      return;
    }

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
