(function () {
  const root = document.querySelector("[data-polaroid]");
  if (!root) return;

  const cards = Array.prototype.slice.call(root.querySelectorAll(".pl-card"));
  const n = cards.length;
  if (!n) return;

  const path = root.querySelector(".pl-string path");
  const cap = root.querySelector(".pl-cap");
  const count = root.querySelector(".pl-count");
  const live = root.querySelector(".pl-sr");
  const slides = cards.map(function (el) {
    return {
      title: el.getAttribute("data-title") || "",
      caption: el.getAttribute("data-caption") || "",
    };
  });

  const sim = { off: 0, vel: 0, target: 0, a: [], w: [] };
  let drag = null;
  let active = 0;
  let spacing = 1;
  let phone = false;
  const layout = { y0: 18, sag: 22 };
  const size = { w: 1200, h: 600, cw: 280 };
  let lastTouch = 0;
  const autoplay = 4500;

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function stringY(x, w, y0, sag) {
    const t = clamp(x / w, 0, 1);
    return y0 + 4 * sag * t * (1 - t);
  }

  function springStep(x, v, target, dt, k) {
    const c = 2 * Math.sqrt(k);
    const nv = v + (k * (target - x) - c * v) * dt;
    return [x + nv * dt, nv];
  }

  function swingStep(a, w, lineVel, dt, gain) {
    const nw = w + (-38 * a - 4.2 * w + lineVel * 0.0034 * gain) * dt;
    return [clamp(a + nw * dt, -0.6, 0.6), nw];
  }

  function nearestAt(off) {
    return clamp(Math.round(off / spacing), 0, Math.max(0, n - 1));
  }

  function paintCaption(index) {
    const slide = slides[index] || {};
    cap.textContent = "";
    if (slide.title) {
      const title = document.createElement("span");
      title.className = "pl-title";
      title.textContent = slide.title;
      cap.appendChild(title);
    }
    if (slide.caption) {
      const sub = document.createElement("span");
      sub.className = "pl-sub";
      sub.textContent = slide.caption;
      cap.appendChild(sub);
    }
    count.innerHTML = "<b>" + pad2(index + 1) + "</b> / " + pad2(n);
    live.textContent =
      "Фото " + (index + 1) + " из " + n + (slide.title ? ": " + slide.title : "");
  }

  function setActive(index) {
    if (index === active) return;
    active = index;
    cards.forEach(function (el, i) {
      el.setAttribute("data-on", i === index ? "1" : "0");
      if (i === index) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", "true");
    });
    paintCaption(index);
  }

  function measure() {
    const rect = root.getBoundingClientRect();
    phone = window.matchMedia("(max-width: 900px)").matches;
    let cw;
    if (phone) {
      cw = Math.round(Math.min(300, Math.max(210, rect.width * 0.78)));
      layout.y0 = Math.max(18, rect.height * 0.08);
      layout.sag = 22;
    } else {
      layout.y0 = 16;
      layout.sag = 40;
      const bar = root.querySelector(".pl-bar");
      let barTop = rect.height - 100;
      if (bar) {
        const top = bar.getBoundingClientRect().top - rect.top;
        if (top > 160) barTop = top;
      }
      const hang = layout.y0 + layout.sag - 6 + 46;
      cw = Math.round(Math.min(520, Math.max(360, barTop - 20 - hang)));
    }
    const next = phone ? Math.max(cw * 1.02, rect.width * 0.96) : cw * 1.14;
    size.w = rect.width;
    size.h = rect.height;
    size.cw = cw;
    root.style.setProperty("--pl-cw", cw + "px");
    if (Math.abs(next - spacing) > 0.5) {
      spacing = next;
      sim.target = active * spacing;
      sim.off = active * spacing;
      sim.vel = 0;
    }
  }

  function goTo(index) {
    sim.target = clamp(index, 0, n - 1) * spacing;
  }

  measure();
  paintCaption(0);
  cards.forEach(function (el, i) {
    el.setAttribute("data-on", i === 0 ? "1" : "0");
    if (i !== 0) el.setAttribute("aria-hidden", "true");
  });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let visible = true;
  let raf = 0;
  let prev = performance.now();

  function frame(now) {
    raf = 0;
    if (!visible) return;
    if (Math.abs(root.clientWidth - size.w) > 1 || Math.abs(root.clientHeight - size.h) > 1) measure();
    const dt = Math.min(0.033, (now - prev) / 1000);
    prev = now;
    const w = size.w;
    const h = size.h;
    const cw = size.cw;
    const sag = layout.sag;
    const y0 = layout.y0;
    const gain = reduce ? 0 : phone ? 0.65 : 1;
    let lineVel;
    if (drag && drag.moved) {
      lineVel = drag.v * 1000;
    } else {
      const before = sim.off;
      const stepped = springStep(sim.off, sim.vel, sim.target, dt, 70);
      sim.off = stepped[0];
      sim.vel = stepped[1];
      lineVel = -(sim.off - before) / Math.max(dt, 1e-3);
    }
    const near = nearestAt(sim.off);
    for (let i = 0; i < n; i++) {
      const el = cards[i];
      const x = w / 2 + i * spacing - sim.off;
      if (x < -cw * 1.4 || x > w + cw * 1.4) {
        el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "visible";
      let angle = sim.a[i] || 0;
      let spin = sim.w[i] || 0;
      const swung = swingStep(angle, spin, lineVel, dt, gain);
      angle = swung[0];
      spin = swung[1];
      if (gain) angle += Math.sin(now / 1300 + i * 1.7) * 0.0009 * gain;
      sim.a[i] = angle;
      sim.w[i] = spin;
      const y = stringY(x, w, y0, sag) - 6;
      el.style.transform =
        "translate(" + (x - cw / 2).toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + angle.toFixed(4) + "rad)";
      el.style.zIndex = String(i === near ? n + 1 : n - Math.abs(i - near));
    }
    if (path) {
      path.setAttribute(
        "d",
        "M-12 " + y0 + " Q" + w / 2 + " " + (y0 + 2 * sag) + " " + (w + 12) + " " + y0,
      );
    }
    if (near !== active) setActive(near);
    raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible && !raf) {
      prev = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });
  io.observe(root);
  raf = requestAnimationFrame(frame);

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(measure);
    ro.observe(root);
  } else {
    window.addEventListener("resize", measure);
  }

  if (!reduce && autoplay && n > 1) {
    window.setInterval(function () {
      if (document.hidden || drag || performance.now() - lastTouch < autoplay) return;
      goTo(active >= n - 1 ? 0 : active + 1);
    }, autoplay);
  }

  function onDown(event) {
    if (event.target.closest(".pl-bar")) return;
    lastTouch = performance.now();
    drag = {
      x: event.clientX,
      off: sim.off,
      lx: event.clientX,
      lt: event.timeStamp,
      v: 0,
      moved: false,
    };
  }

  function onMove(event) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 5) {
      drag.moved = true;
      root.setAttribute("data-drag", "1");
      if (root.setPointerCapture) root.setPointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    const dt = Math.max(1, event.timeStamp - drag.lt);
    drag.v = 0.7 * ((event.clientX - drag.lx) / dt) + 0.3 * drag.v;
    drag.lx = event.clientX;
    drag.lt = event.timeStamp;
    const max = (n - 1) * spacing;
    let off = drag.off - dx;
    if (off < 0) off *= 0.35;
    if (off > max) off = max + (off - max) * 0.35;
    sim.off = off;
  }

  function onUp(event) {
    const current = drag;
    drag = null;
    lastTouch = performance.now();
    if (!current) return;
    if (current.moved) {
      root.setAttribute("data-drag", "0");
      sim.vel = -current.v * 1000;
      goTo(nearestAt(sim.off - current.v * 180));
      return;
    }
    const card = event.target.closest("[data-i]");
    if (card) goTo(Number(card.getAttribute("data-i")));
  }

  function step(dir) {
    lastTouch = performance.now();
    goTo(clamp(active + dir, 0, n - 1));
  }

  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);
  root.addEventListener("keydown", function (event) {
    if (event.key === "ArrowRight") step(1);
    else if (event.key === "ArrowLeft") step(-1);
    else return;
    event.preventDefault();
  });
  root.querySelector("[data-pl-prev]").addEventListener("click", function () {
    step(-1);
  });
  root.querySelector("[data-pl-next]").addEventListener("click", function () {
    step(1);
  });
})();
