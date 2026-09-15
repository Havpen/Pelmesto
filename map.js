/* Lazy Yandex map for [data-ymap]; same tinting as the home page card. */
(function () {
  var MAP_LAT = 52.43581;
  var MAP_LNG = 31.00687;

  function loadYmaps() {
    if (window.ymaps) return Promise.resolve(window.ymaps);
    return new Promise(function (resolve, reject) {
      function done() {
        if (window.ymaps) resolve(window.ymaps);
        else reject(new Error("ymaps"));
      }
      var existing = document.getElementById("yandex-maps-api");
      if (existing) {
        if (window.ymaps) done();
        else existing.addEventListener("load", done, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.id = "yandex-maps-api";
      script.async = true;
      script.defer = true;
      script.src = "https://api-maps.yandex.ru/2.1/?lang=ru_RU&load=package.standard&mode=release";
      script.onload = done;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function initMap(el) {
    if (el.dataset.ready === "1") return;
    loadYmaps()
      .then(function (ymaps) {
        ymaps.ready(function () {
          if (el.dataset.ready === "1") return;
          el.dataset.ready = "1";

          var map = new ymaps.Map(
            el,
            { center: [MAP_LAT, MAP_LNG], zoom: 16, controls: ["zoomControl"] },
            { suppressMapOpenBlock: true, autoFitToViewport: "always" },
          );

          var zoom = map.controls.get("zoomControl");
          if (zoom) zoom.options.set("position", { right: 10, top: 10 });

          map.geoObjects.add(
            new ymaps.Placemark(
              [MAP_LAT, MAP_LNG],
              {
                balloonContentHeader: "ПельМесто",
                balloonContentBody: "Гомель, ул. Советская, 44",
              },
              { preset: "islands#redDotIcon" },
            ),
          );

          var groundPane = map.panes.get("ground");
          var ground = groundPane && groundPane.getElement();
          if (ground) {
            ground.style.filter =
              "grayscale(1) sepia(0.85) hue-rotate(-18deg) saturate(1.45) brightness(0.96)";
          }
          map.container.fitToViewport();
        });
      })
      .catch(function () {});
  }

  var el = document.querySelector("[data-ymap]");
  if (!el) return;

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        if (!entries[0] || !entries[0].isIntersecting) return;
        observer.disconnect();
        initMap(el);
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
  } else {
    initMap(el);
  }
})();
