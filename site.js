/* Shared shell behaviour for inner pages: burger nav + analytics goals. */
(function () {
  if (/CriOS/.test(navigator.userAgent)) {
    var probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:100lvh";
    document.documentElement.appendChild(probe);
    var large = probe.offsetHeight;
    probe.style.height = "100svh";
    var small = probe.offsetHeight;
    probe.remove();
    var max = large > small + 2 ? large : Math.max(large, window.screen.height || 0);
    if (max) document.documentElement.style.setProperty("--pattern-lock", max + "px");
  }
  var navToggle = document.querySelector("[data-nav-toggle]");
  var siteNav = document.querySelector("[data-nav]");
  var navBackdrop = document.querySelector("[data-nav-backdrop]");

  function setNavOpen(open) {
    document.body.classList.toggle("nav-open", open);
    if (!navToggle) return;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  }

  if (navToggle) {
    navToggle.addEventListener("click", function () {
      setNavOpen(!document.body.classList.contains("nav-open"));
    });
  }

  if (siteNav) {
    siteNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setNavOpen(false);
      });
    });
  }

  if (navBackdrop) {
    navBackdrop.addEventListener("click", function () {
      setNavOpen(false);
    });
  }

  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setNavOpen(false);
  });

  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 901px)").matches) setNavOpen(false);
  });

  var footerEl = document.querySelector(".site-footer");
  var footerSyncRaf = 0;
  function syncFooterBand() {
    footerSyncRaf = 0;
    if (!footerEl) return;
    var h = footerEl.offsetHeight;
    document.documentElement.style.setProperty("--footer-h", h + "px");
    var patternH =
      parseFloat(getComputedStyle(document.body, "::before").height) || window.innerHeight;
    var after = Math.max(0, patternH - footerEl.getBoundingClientRect().top);
    document.documentElement.style.setProperty("--after-contacts", after + "px");
  }
  function scheduleFooterBand() {
    if (footerSyncRaf) return;
    footerSyncRaf = requestAnimationFrame(syncFooterBand);
  }
  scheduleFooterBand();
  window.addEventListener("scroll", scheduleFooterBand, { passive: true });
  window.addEventListener("resize", scheduleFooterBand);
  window.addEventListener("load", scheduleFooterBand);

  document.addEventListener("click", function (event) {
    var target = event.target.closest("[data-analytics]");
    if (!target) return;
    var name = target.getAttribute("data-analytics");
    if (!name) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name });
    if (typeof window.gtag === "function") window.gtag("event", name);
    if (typeof window.ym === "function" && window.PELMESTO_YM_ID) {
      window.ym(window.PELMESTO_YM_ID, "reachGoal", name);
    }
  });

  if ("serviceWorker" in navigator) {
    var swBase = location.pathname.indexOf("/Pelmesto") === 0 ? "/Pelmesto" : "";
    navigator.serviceWorker.register(swBase + "/sw.js", { scope: swBase + "/" }).catch(function () {});
  }

  var glueQueued = 0;
  var gluePassing = false;
  var glueProbe = document.createElement("span");
  glueProbe.setAttribute("data-glue-probe", "");
  glueProbe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;";
  document.body.appendChild(glueProbe);
  function lastGlueText(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return /\S/.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var last = null;
    var node;
    while ((node = walker.nextNode())) last = node;
    return last;
  }
  function glueLines(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return /\S/.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var range = document.createRange();
    var tops = [];
    var node;
    while ((node = walker.nextNode())) {
      var parts = node.textContent.split(/(\s+)/);
      var offset = 0;
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (/\S/.test(part)) {
          range.setStart(node, offset);
          range.setEnd(node, offset + part.length);
          var rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) tops.push(Math.round(rect.top));
        }
        offset += part.length;
      }
    }
    if (!tops.length) return [];
    var counts = [1];
    for (var j = 1; j < tops.length; j++) {
      if (Math.abs(tops[j] - tops[j - 1]) > 3) counts.push(1);
      else counts[counts.length - 1] += 1;
    }
    return counts;
  }
  function gluePairFits(el, style, left, right) {
    glueProbe.style.font = style.font;
    glueProbe.style.letterSpacing = style.letterSpacing;
    glueProbe.textContent = right ? left + "\u00a0" + right : left;
    return glueProbe.offsetWidth <= el.clientWidth + 1;
  }
  function glueBlock(el) {
    if (el.closest(".menu-list, .shop-card, button, .button")) return;
    var style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return;
    if (style.whiteSpace === "nowrap" || style.textWrap === "nowrap") return;
    var width = el.clientWidth;
    if (!width) return;
    var node = lastGlueText(el);
    if (!node) return;
    if (el.getAttribute("data-glue-w") === String(width)) return;
    node.textContent = node.textContent.replace(/(\S(?:\u00a0\S+)+)\s*$/, function (cluster) {
      return cluster.replace(/\u00a0/g, " ");
    });
    var counts = glueLines(el);
    if (counts.length < 2 || counts[counts.length - 1] !== 1) {
      el.setAttribute("data-glue-w", String(width));
      return;
    }
    var text = node.textContent;
    var found = [];
    var scan = /\S+/g;
    var token;
    while ((token = scan.exec(text))) found.push(token);
    if (found.length < 4) {
      el.setAttribute("data-glue-w", String(width));
      return;
    }
    function attempt(count) {
      if (found.length < count) return false;
      var from = found[found.length - count];
      var phrase = [];
      for (var i = found.length - count; i < found.length; i++) phrase.push(found[i][0]);
      var joined = phrase.join("\u00a0");
      if (!gluePairFits(el, style, joined, "")) return false;
      var end = found[found.length - 1].index + found[found.length - 1][0].length;
      node.textContent = text.slice(0, from.index) + joined + text.slice(end);
      var after = glueLines(el);
      if (!after.length || after.some(function (item) { return item === 1; })) {
        node.textContent = text;
        return false;
      }
      return true;
    }
    if (!attempt(2)) attempt(3);
    el.setAttribute("data-glue-w", String(width));
  }
  function gluePass() {
    if (gluePassing) return;
    gluePassing = true;
    document
      .querySelectorAll("p, h1, h2, h3, li, figcaption, blockquote, .pl-note, .pl-title, .hero__title-tagline, .page-head__lead, .page-head__text")
      .forEach(glueBlock);
    gluePassing = false;
  }
  function scheduleGlue() {
    if (gluePassing) return;
    clearTimeout(glueQueued);
    glueQueued = setTimeout(gluePass, 80);
  }
  scheduleGlue();
  window.addEventListener("resize", function () {
    document.querySelectorAll("[data-glue-w]").forEach(function (el) {
      el.removeAttribute("data-glue-w");
    });
    scheduleGlue();
  });
  window.addEventListener("load", scheduleGlue);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      document.querySelectorAll("[data-glue-w]").forEach(function (el) {
        el.removeAttribute("data-glue-w");
      });
      scheduleGlue();
    });
  }
  new MutationObserver(scheduleGlue).observe(document.body, { childList: true, subtree: true });
})();
