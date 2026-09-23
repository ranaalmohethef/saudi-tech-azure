// Moving network background (same look as particles.js, no internet needed).
// Colours follow the dark / light theme. Hover links dots to the mouse, click adds dots.
(function () {
  const box = document.getElementById("particles-js");
  if (!box) return;
  const cv = document.createElement("canvas");
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  box.appendChild(cv);
  const ctx = cv.getContext("2d");
  const DIST = 160, GRAB = 180;
  let W = 0, H = 0, dpr = 1, dots = [], mouse = null, colors;

  function theme() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    colors = dark
      ? { dot: "200,150,62", dotA: 0.7, line: "246,242,234", lineA: 0.25 }   // gold dots, cream lines
      : { dot: "111,191,162", dotA: 0.9, line: "63,163,131", lineA: 0.6 };   // light green dots, green lines
  }
  function dot(x, y) {
    return { x: x ?? Math.random() * W, y: y ?? Math.random() * H,
             vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2,
             r: 1 + Math.random() * 3 };
  }
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = box.clientWidth || window.innerWidth; H = box.clientHeight || window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const want = Math.max(30, Math.min(Math.round(W * H / 1000 * 70 / 900), 150));   // same density as before
    while (dots.length < want) dots.push(dot());
    dots.length = want;
  }
  function line(a, b, alpha) {
    ctx.strokeStyle = `rgba(${colors.line},${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of dots) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
    }
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].x - dots[j].x, dy = dots[i].y - dots[j].y, d = Math.hypot(dx, dy);
        if (d < DIST) line(dots[i], dots[j], colors.lineA * (1 - d / DIST));
      }
      if (mouse) {
        const d = Math.hypot(dots[i].x - mouse.x, dots[i].y - mouse.y);
        if (d < GRAB) line(dots[i], mouse, 0.8 * (1 - d / GRAB));
      }
    }
    ctx.fillStyle = `rgba(${colors.dot},${colors.dotA})`;
    for (const p of dots) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", e => { mouse = { x: e.clientX, y: e.clientY }; });
  document.addEventListener("mouseleave", () => { mouse = null; });
  window.addEventListener("click", e => { for (let k = 0; k < 4; k++) dots.push(dot(e.clientX, e.clientY)); });
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  theme(); resize(); frame();
})();
