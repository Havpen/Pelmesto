/* Shared shell behaviour for inner pages: burger nav + analytics goals. */
(function () {
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
  var footerBandMq = window.matchMedia("(max-width: 900px)");
  var footerSyncRaf = 0;
  function syncFooterBand() {
    footerSyncRaf = 0;
    if (!footerEl) return;
    var mobile = footerBandMq.matches;
    var h = mobile ? footerEl.offsetHeight : 0;
    document.documentElement.style.setProperty("--footer-h", h + "px");
    var after = 0;
    if (mobile) {
      var patternH =
        parseFloat(getComputedStyle(document.body, "::before").height) || window.innerHeight;
      after = Math.max(0, patternH - footerEl.getBoundingClientRect().top);
    }
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
})();
