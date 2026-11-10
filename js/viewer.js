// The figure: one page image that zooms (1×–5×) and pans, with an overlay that keeps its
// sizes in screen points. Taps, long-presses and hovers are reported in page fractions.

import { clamp } from './util.js';

const MIN_ZOOM = 1, MAX_ZOOM = 5, MARGIN = 10;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class Viewer {
  /**
   * @param root the figure element (gets touch-action: none)
   * @param on { tap(e), longPress(e), hover(point | null, pointerType), scale(pw, ph) }
   */
  constructor(root, on = {}) {
    this.root = root;
    this.on = on;
    root.innerHTML = `
      <div class="stage">
        <div class="paper"></div>
        <img class="plate" alt="" decoding="async" draggable="false">
        <div class="overlay">
          <svg class="leaders" aria-hidden="true"></svg>
          <div class="marks"></div>
          <div class="tags"></div>
        </div>
      </div>
      <div class="cursor-ring" hidden></div>`;
    this.stage = root.querySelector('.stage');
    this.paper = root.querySelector('.paper');
    this.img = root.querySelector('.plate');
    this.overlay = root.querySelector('.overlay');
    this.leaders = root.querySelector('.leaders');
    this.marks = root.querySelector('.marks');
    this.tags = root.querySelector('.tags');
    this.cursor = root.querySelector('.cursor-ring');

    this.iw = 1555; this.ih = 2200; // until the image loads
    this.z = 1.6; this.cx = 0.5; this.cy = 0.5; // zoom, and the page point at the centre of the view
    this.W = 0; this.H = 0;
    /** The ringed number (page fractions): zooming keeps it in place while it is in view. */
    this.focus = null;
    this.lastPW = 0;

    this.resizer = new ResizeObserver(() => { this.measure(); this.render(); });
    this.resizer.observe(root);
    this.measure();
    this.bind();
  }

  destroy() {
    this.resizer.disconnect();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.anim);
    clearTimeout(this.pressTimer);
  }

  measure() {
    this.W = this.root.clientWidth;
    this.H = this.root.clientHeight;
  }

  /** Shows a figure; resolves once it is on screen. */
  load(url) {
    const token = (this.token = Symbol());
    this.img.classList.remove('ready');
    this.paper.classList.add('loading');
    return new Promise((resolve) => {
      const probe = new Image();
      probe.decoding = 'async';
      probe.onload = async () => {
        if (token !== this.token) return resolve(false);
        try { await probe.decode?.(); } catch { /* shown anyway */ }
        if (token !== this.token) return resolve(false);
        this.iw = probe.naturalWidth; this.ih = probe.naturalHeight;
        this.img.src = url;
        this.img.style.width = `${this.iw}px`;
        this.img.style.height = `${this.ih}px`;
        this.img.classList.add('ready');
        this.paper.classList.remove('loading');
        this.render();
        resolve(true);
      };
      probe.onerror = () => { this.paper.classList.remove('loading'); resolve(false); };
      probe.src = url;
    });
  }

  // ---- Geometry

  size(z = this.z) {
    const fit = Math.max(0.0001, Math.min((this.W - 2 * MARGIN) / this.iw, (this.H - 2 * MARGIN) / this.ih));
    const s = fit * z;
    return { s, pw: this.iw * s, ph: this.ih * s };
  }

  /** The page can't be dragged past its edges; smaller than the view, it stays centred. */
  clamped(cx, cy, z) {
    const { pw, ph } = this.size(z);
    const hx = this.W / (2 * pw), hy = this.H / (2 * ph);
    return {
      cx: hx >= 0.5 ? 0.5 : clamp(cx, hx, 1 - hx),
      cy: hy >= 0.5 ? 0.5 : clamp(cy, hy, 1 - hy),
    };
  }

  metrics() {
    const { s, pw, ph } = this.size();
    return { s, pw, ph, tx: this.W / 2 - this.cx * pw, ty: this.H / 2 - this.cy * ph };
  }

  toPage(vx, vy) {
    const { pw, ph, tx, ty } = this.metrics();
    return { x: (vx - tx) / pw, y: (vy - ty) / ph };
  }

  toView(x, y) {
    const { pw, ph, tx, ty } = this.metrics();
    return { x: tx + x * pw, y: ty + y * ph };
  }

  render() {
    if (!this.W || !this.H) return;
    this.z = clamp(this.z, MIN_ZOOM, MAX_ZOOM);
    Object.assign(this, this.clamped(this.cx, this.cy, this.z));
    const { s, pw, ph, tx, ty } = this.metrics();
    this.stage.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    this.img.style.transform = `scale(${s})`;
    if (Math.abs(pw - this.lastPW) > 0.01 || this.lastPH !== ph) {
      this.lastPW = pw; this.lastPH = ph;
      for (const layer of [this.paper, this.overlay]) {
        layer.style.width = `${pw}px`;
        layer.style.height = `${ph}px`;
      }
      this.on.scale?.(pw, ph);
    }
  }

  invalidate() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.render());
  }

  // ---- Moving

  stop() {
    cancelAnimationFrame(this.anim);
    this.anim = 0;
  }

  panBy(dx, dy) {
    const { pw, ph } = this.size();
    this.cx -= dx / pw;
    this.cy -= dy / ph;
    this.invalidate();
  }

  /** Zooms keeping the page point under (vx, vy) in place — or the ringed number, while it is in view. */
  zoomAround(z, vx, vy) {
    if (this.focus) {
      const f = this.toView(this.focus[0], this.focus[1]);
      if (f.x >= 0 && f.x <= this.W && f.y >= 0 && f.y <= this.H) { vx = f.x; vy = f.y; }
    }
    const p = this.toPage(vx, vy);
    this.z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    const { pw, ph } = this.size();
    this.cx = p.x - (vx - this.W / 2) / pw;
    this.cy = p.y - (vy - this.H / 2) / ph;
    this.invalidate();
  }

  animateTo({ cx = this.cx, cy = this.cy, z = this.z }, duration = 350) {
    this.stop();
    z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    const to = { z, ...this.clamped(cx, cy, z) };
    const from = { z: this.z, cx: this.cx, cy: this.cy };
    if (!this.W || matchMedia('(prefers-reduced-motion: reduce)').matches) duration = 0;
    const moved = Math.abs(to.z - from.z) + Math.abs(to.cx - from.cx) + Math.abs(to.cy - from.cy);
    if (!duration || moved < 1e-4) { Object.assign(this, to); this.render(); return; }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration), k = ease(t);
      this.z = from.z + (to.z - from.z) * k;
      this.cx = from.cx + (to.cx - from.cx) * k;
      this.cy = from.cy + (to.cy - from.cy) * k;
      this.render();
      this.anim = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    this.anim = requestAnimationFrame(tick);
  }

  centerOn(x, y, animated = true) {
    this.animateTo({ cx: x, cy: y }, animated ? 350 : 0);
  }

  zoomBy(factor) {
    const z = clamp(this.z * factor, MIN_ZOOM, MAX_ZOOM);
    this.animateTo(this.focus ? { z, cx: this.focus[0], cy: this.focus[1] } : { z }, 220);
  }

  wholePage() {
    this.animateTo({ z: 1, cx: 0.5, cy: 0.5 }, 260);
  }

  reset() {
    this.stop();
    this.z = 1.6; this.cx = 0.5; this.cy = 0.5;
    this.render();
  }

  /** A circle that fades where a finger tapped. */
  flash(vx, vy, kind) {
    const dot = document.createElement('div');
    dot.className = `tap-flash k-${kind}`;
    dot.style.left = `${vx}px`;
    dot.style.top = `${vy}px`;
    this.root.append(dot);
    dot.addEventListener('animationend', () => dot.remove());
    setTimeout(() => dot.remove(), 700);
  }

  // ---- Input (Pointer Events for mouse, pen and touch)

  bind() {
    const root = this.root;
    const points = new Map();
    let gesture = null; // one pointer: a tap, a long-press or a pan
    let pinch = null;

    const local = (e) => {
      const b = root.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const report = (at, source, e) => {
      const p = this.toPage(at.x, at.y);
      return {
        x: p.x, y: p.y, vx: at.x, vy: at.y,
        inside: p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1,
        pointerType: source.type, altKey: !!e?.altKey, target: source.target,
      };
    };
    const two = () => {
      const [a, b] = [...points.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };

    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { root.setPointerCapture(e.pointerId); } catch { /* already released */ }
      this.stop();
      const p = local(e);
      points.set(e.pointerId, p);
      clearTimeout(this.pressTimer);
      if (points.size === 1) {
        const g = (gesture = { start: p, time: performance.now(), moved: false, done: false, type: e.pointerType, target: e.target });
        if (e.pointerType !== 'mouse') {
          this.pressTimer = setTimeout(() => {
            if (gesture !== g || g.moved || points.size !== 1) return;
            g.done = true;
            this.on.longPress?.(report(g.start, g));
          }, 500);
        }
      } else if (points.size === 2) {
        if (gesture) gesture.done = true;
        const { d, mid } = two();
        pinch = { d, z: this.z, page: this.toPage(mid.x, mid.y) };
      }
    });

    root.addEventListener('pointermove', (e) => {
      const p = local(e);
      if (!points.has(e.pointerId)) {
        if (e.pointerType !== 'touch') this.on.hover?.(p, e.pointerType);
        return;
      }
      const before = points.get(e.pointerId);
      points.set(e.pointerId, p);
      if (points.size === 1 && gesture) {
        const threshold = gesture.type === 'mouse' ? 4 : 8;
        if (!gesture.moved && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > threshold) {
          gesture.moved = true;
          clearTimeout(this.pressTimer);
          root.classList.add('panning');
        }
        if (gesture.moved) this.panBy(p.x - before.x, p.y - before.y);
        if (e.pointerType !== 'touch') this.on.hover?.(p, e.pointerType);
      } else if (points.size === 2 && pinch) {
        // The page point that was under the fingers stays under their midpoint.
        const { d, mid } = two();
        this.z = clamp(pinch.z * d / pinch.d, MIN_ZOOM, MAX_ZOOM);
        const { pw, ph } = this.size();
        this.cx = pinch.page.x - (mid.x - this.W / 2) / pw;
        this.cy = pinch.page.y - (mid.y - this.H / 2) / ph;
        this.invalidate();
      }
    });

    const up = (e) => {
      if (!points.delete(e.pointerId)) return;
      clearTimeout(this.pressTimer);
      if (points.size === 0) {
        root.classList.remove('panning');
        const g = gesture;
        gesture = null; pinch = null;
        if (g && !g.moved && !g.done && e.type === 'pointerup' && performance.now() - g.time < 500) {
          this.on.tap?.(report(g.start, g, e));
        }
      } else if (points.size === 1) {
        // A finger lifted from a pinch: the other one keeps panning, and is never a tap.
        pinch = null;
        gesture = { start: [...points.values()][0], time: 0, moved: true, done: true, type: e.pointerType, target: null };
      }
    };
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') this.on.hover?.(null, e.pointerType); });

    // Two-finger scroll pans; a trackpad pinch (wheel with ctrlKey) zooms at the pointer.
    root.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.stop();
      const p = local(e);
      if (e.ctrlKey) {
        this.zoomAround(this.z * Math.exp(-clamp(e.deltaY, -40, 40) * 0.01), p.x, p.y);
      } else {
        const k = e.deltaMode === 1 ? 12 : 1;
        this.panBy(-e.deltaX * k, -e.deltaY * k);
      }
      this.on.hover?.(p, 'mouse');
    }, { passive: false });

    // Safari on a Mac reports a trackpad pinch as gesture events instead.
    let gestureZoom = null;
    root.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      gestureZoom = points.size ? null : this.z;
    });
    root.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (gestureZoom == null || points.size) return;
      const p = local(e);
      this.zoomAround(gestureZoom * e.scale, p.x, p.y);
    });
    root.addEventListener('gestureend', (e) => { e.preventDefault(); gestureZoom = null; });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('dragstart', (e) => e.preventDefault());
  }
}
