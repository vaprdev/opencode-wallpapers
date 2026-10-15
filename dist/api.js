// @bun
// src/math.ts
var TAU = Math.PI * 2;
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function rand(min, max) {
  return min + Math.random() * (max - min);
}
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function hashString(text) {
  let h = 2166136261;
  for (let i = 0;i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
function hsv(h, s, v) {
  h = (h % 1 + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}
function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 57.3), hash(i + 1 + seed * 57.3), u);
}
function fbm1(x, seed = 0, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0;i < octaves; i++) {
    sum += noise1(x * freq, seed + i * 13) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}
function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), ux), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux), uy);
}
function fbm2(x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0;i < octaves; i++) {
    sum += noise2(x * freq + i * 17.3, y * freq + i * 9.1) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

// src/touched.ts
var lists = new WeakMap;
function trackTouched(hdr, list) {
  lists.set(hdr, list);
}
function touch(hdr, x0, y0, x1, y1) {
  const list = lists.get(hdr);
  if (list)
    addBox(list, x0, y0, x1, y1);
}
function addBox(list, x0, y0, x1, y1) {
  const n = list.length;
  if (n && x0 >= list[n - 4] - 1 && y0 >= list[n - 3] - 1 && x1 <= list[n - 2] + 1 && y1 <= list[n - 1] + 1) {
    list[n - 4] = Math.min(list[n - 4], x0);
    list[n - 3] = Math.min(list[n - 3], y0);
    list[n - 2] = Math.max(list[n - 2], x1);
    list[n - 1] = Math.max(list[n - 1], y1);
    return;
  }
  list.push(x0, y0, x1, y1);
}

// src/points.ts
var POINT_STRIDE = 10;

class Points {
  on = false;
  count = 0;
  data = new Float32Array(POINT_STRIDE * 64);
  next = new Float32Array(POINT_STRIDE * 64);
  pending = 0;
  add(hdr, W, H, x, y, r, g, b, size = 1, glide = false) {
    if (x < 0 || y < 0 || x >= W || y >= H)
      return;
    const o = ((y | 0) * W + (x | 0)) * 3;
    hdr[o] += r;
    hdr[o + 1] += g;
    hdr[o + 2] += b;
    touch(hdr, x | 0, y | 0, x | 0, y | 0);
    if (!this.on)
      return;
    if ((this.pending + 1) * POINT_STRIDE > this.next.length) {
      const grown = new Float32Array(this.next.length * 2);
      grown.set(this.next);
      this.next = grown;
    }
    const p = this.pending++ * POINT_STRIDE;
    const d = this.next;
    d[p] = x;
    d[p + 1] = y;
    d[p + 2] = size;
    d[p + 3] = glide ? 1 : 0;
    d[p + 4] = r;
    d[p + 5] = g;
    d[p + 6] = b;
    d[p + 7] = hdr[o];
    d[p + 8] = hdr[o + 1];
    d[p + 9] = hdr[o + 2];
  }
  resolve(hdr, W, scale, exposure) {
    const done = this.data;
    this.data = this.next;
    this.next = done;
    this.count = resolvePoints(this.data, this.pending, hdr, W, scale, exposure);
    this.pending = 0;
  }
}
function resolvePoints(d, pending, hdr, W, scale, exposure) {
  let count = 0;
  for (let p = 0;p < pending * POINT_STRIDE; p += POINT_STRIDE) {
    const i = (d[p + 1] | 0) * W + (d[p] | 0);
    if (hdr[i * 3] !== d[p + 7] || hdr[i * 3 + 1] !== d[p + 8] || hdr[i * 3 + 2] !== d[p + 9])
      continue;
    const k = scale[i] * exposure;
    const q = count++ * POINT_STRIDE;
    for (let c = 0;c < 4; c++)
      d[q + c] = d[p + c];
    for (let c = 0;c < 3; c++) {
      hdr[i * 3 + c] -= d[p + 4 + c];
      const under = hdr[i * 3 + c] * k;
      d[q + 4 + c] = (aces(under + d[p + 4 + c] * k) - aces(under)) * 255;
    }
  }
  return count;
}
function aces(v) {
  const mapped = v * (2.51 * v + 0.03) / (v * (2.43 * v + 0.59) + 0.14);
  return mapped < 0 ? 0 : mapped > 1 ? 1 : mapped;
}
function splat(hdr, W, H, x, y, r, g, b) {
  const px = x - 0.5;
  const py = y - 0.5;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const fx = px - x0;
  const fy = py - y0;
  touch(hdr, x0, y0, x0 + 1, y0 + 1);
  for (let j = 0;j < 2; j++) {
    const yi = y0 + j;
    if (yi < 0 || yi >= H)
      continue;
    for (let i = 0;i < 2; i++) {
      const xi = x0 + i;
      if (xi < 0 || xi >= W)
        continue;
      const k = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      const o = (yi * W + xi) * 3;
      hdr[o] += r * k;
      hdr[o + 1] += g * k;
      hdr[o + 2] += b * k;
    }
  }
}

// src/orbs.ts
var lists2 = new WeakMap;
function trackOrbs(hdr, list) {
  lists2.set(hdr, list);
}
function addOrb(hdr, cx, cy, r) {
  lists2.get(hdr)?.push(cx, cy, r);
}
function onOrb(hdr, x, y, margin = 1) {
  const list = lists2.get(hdr);
  if (!list)
    return false;
  for (let i = 0;i < list.length; i += 3)
    if ((x - list[i]) ** 2 + (y - list[i + 1]) ** 2 <= (list[i + 2] + margin) ** 2)
      return true;
  return false;
}

// src/shadow.ts
var SQUASH = 0.38;
function sunShade(time, orb, covered = false) {
  const away = orb.x < 0.5 ? 1 : -1;
  const looks = {
    day: { tint: [0.36, 0.44, 0.64], contact: 0.75, cast: 0.6, length: 0.6, x: away, y: 0.45, radiate: false },
    sunset: { tint: [0.32, 0.22, 0.42], contact: 0.7, cast: 0.75, length: 2.4, x: orb.x, y: orb.y, radiate: true },
    night: { tint: [0.35, 0.45, 0.85], contact: 0.45, cast: 0.2, length: 0.6, x: away, y: 0.45, radiate: false }
  };
  const shade = looks[time];
  return { ...shade, contact: covered ? shade.contact * 0.8 : shade.contact, cast: covered ? 0 : shade.cast };
}
function groundShadow(hdr, W, H, shade, x, y, w, h, tip = 0.7, lift = 0) {
  const [tr, tg, tb] = shade.tint;
  const up = clamp(lift / Math.max(1, h * 0.5), 0, 1);
  const r = w * 0.6 * (1 + up * 0.6);
  const cy = y + r * SQUASH * 0.3;
  if (shade.contact > 0 && up < 1)
    fillShadow(hdr, W, H, x, cy, x, cy, r, r, tr, tg, tb, shade.contact * (1 - up) ** 2, 1, 0.6);
  if (shade.cast <= 0)
    return;
  const dx = shade.radiate ? x - shade.x * W : shade.x;
  const dy = shade.radiate ? Math.max(0, y - shade.y * H) : shade.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d * 0.5;
  const near = lift * shade.length;
  const far = near + h * shade.length;
  fillShadow(hdr, W, H, x + ux * near, y + uy * near, x + ux * far, y + uy * far, w * 0.4, w * 0.4 * tip, tr, tg, tb, shade.cast * (1 - up * 0.5), 0.3, 0.55);
}
var depth = new WeakMap;
function keepShadows(hdr) {
  const d = depth.get(hdr);
  if (!d)
    return;
  d.fixed = d.amount.slice();
  d.dirty = false;
}
function clearShadows(hdr) {
  const d = depth.get(hdr);
  if (!d?.dirty)
    return;
  d.amount.set(d.fixed);
  d.dirty = false;
}
function fillShadow(hdr, W, H, ax, ay, bx, by, r0, r1, tr, tg, tb, a, fade, soft) {
  if (a <= 0)
    return;
  let d = depth.get(hdr);
  if (!d || d.amount.length !== W * H) {
    d = { amount: new Float32Array(W * H), fixed: new Float32Array(W * H), dirty: false };
    depth.set(hdr, d);
  }
  d.dirty = true;
  const amount = d.amount;
  const R = Math.max(r0, r1);
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R * SQUASH));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R * SQUASH));
  touch(hdr, x0, y0, x1, y1);
  const dx = bx - ax;
  const dy = (by - ay) / SQUASH;
  const len2 = dx * dx + dy * dy;
  for (let y = y0;y <= y1; y++) {
    const oy = (y + 0.5 - ay) / SQUASH;
    for (let x = x0;x <= x1; x++) {
      const ox = x + 0.5 - ax;
      const t = len2 > 0 ? clamp((ox * dx + oy * dy) / len2, 0, 1) : 0;
      const r = r0 + (r1 - r0) * t;
      const e = Math.hypot(ox - dx * t, oy - dy * t) / r;
      if (e >= 1)
        continue;
      const k = clamp((1 - e) / (soft + (1 - soft) * t), 0, 1);
      const s = a * k * k * (3 - 2 * k) * (1 + (fade - 1) * t);
      const p = y * W + x;
      const m = amount[p];
      if (s <= m)
        continue;
      amount[p] = s;
      const i = p * 3;
      hdr[i] *= (1 - s * (1 - tr)) / (1 - m * (1 - tr));
      hdr[i + 1] *= (1 - s * (1 - tg)) / (1 - m * (1 - tg));
      hdr[i + 2] *= (1 - s * (1 - tb)) / (1 - m * (1 - tb));
    }
  }
}

// src/canvas.ts
var BLOOM = 4;
var BLOOM_THRESHOLD = 0.82;
var BLOOM_EPSILON = 0.0001;
var SUPERSAMPLE = 2;
var LAYOUT_PIXELS = 600000;
function cap(ax, ay, bx, by, r0, r1, color, ribs = 0) {
  return { kind: "capsule", ax, ay, bx, by, r0, r1, color, ribs };
}
function ell(cx, cy, rx, ry, angle, color, ribs = 0) {
  return { kind: "ellipse", cx, cy, rx, ry, angle, color, ribs };
}
function blade(spine, widths, color) {
  return spine.slice(1).map(([bx, by], i) => {
    const [ax, ay] = spine[i];
    const half = Math.hypot(bx - ax, by - ay) * 0.75;
    return ell((ax + bx) / 2, (ay + by) / 2, Math.max(half, 0.5), Math.max(0.5, (widths[i] + widths[i + 1]) / 2), Math.atan2(by - ay, bx - ax), color);
  });
}

class Canvas {
  W = 0;
  H = 0;
  A = 1;
  cells = false;
  hdr = new Float32Array(0);
  pixels = new Uint8Array(0);
  touched = [];
  changed = [];
  restored = false;
  points = new Points;
  orbs = [];
  bw = 0;
  bh = 0;
  bloomA = new Float32Array(0);
  bloomB = new Float32Array(0);
  bw2 = 0;
  bh2 = 0;
  bloom2A = new Float32Array(0);
  bloom2B = new Float32Array(0);
  bloomUp = new Float32Array(0);
  bloomRow = new Float32Array(0);
  vignette = new Float32Array(0);
  rowA = new Int32Array(0);
  rowB = new Int32Array(0);
  rowF = new Float32Array(0);
  colA = new Int32Array(0);
  colB = new Int32Array(0);
  colF = new Float32Array(0);
  still = new Float32Array(0);
  stillSource = new Float32Array(0);
  stillBloom = new Float32Array(0);
  stillPixels = new Uint8Array(0);
  stillExposure = NaN;
  retone = new Uint8Array(0);
  toned = new Uint8Array(0);
  region = new Int32Array(4);
  gloom = 0;
  gloomy = false;
  frame = 0;
  react(event) {
    this.gloomy = event === "error";
    if (event === "done")
      this.visit();
  }
  visit() {}
  stepGloom(dt) {
    this.gloom = clamp(this.gloom + (this.gloomy ? dt : -dt) * 0.3, 0, 1);
  }
  text;
  textMap(map) {
    this.text = map;
  }
  covered(x, y) {
    const t = this.text;
    if (!t)
      return 0;
    return t.cover[clamp(Math.floor(y * t.rows), 0, t.rows - 1) * t.cols + clamp(Math.floor(x / this.A * t.cols), 0, t.cols - 1)];
  }
  openSpot(x0, x1, y0, y1) {
    let best = [rand(x0, x1), rand(y0, y1)];
    let least = this.covered(best[0], best[1]);
    for (let i = 0;i < 5 && least > 0.05; i++) {
      const spot = [rand(x0, x1), rand(y0, y1)];
      const c = this.covered(spot[0], spot[1]);
      if (c >= least)
        continue;
      best = spot;
      least = c;
    }
    return best;
  }
  openRow(y0, y1) {
    let best = rand(y0, y1);
    const t = this.text;
    if (!t)
      return best;
    const cover = (y) => {
      const row = clamp(Math.floor(y * t.rows), 0, t.rows - 1) * t.cols;
      let sum = 0;
      for (let c = 0;c < t.cols; c++)
        sum += t.cover[row + c];
      return sum;
    };
    let least = cover(best);
    for (let i = 0;i < 4; i++) {
      const y = rand(y0, y1);
      const c = cover(y);
      if (c >= least)
        continue;
      best = y;
      least = c;
    }
    return best;
  }
  layout() {}
  background = new Float32Array(0);
  px = 1;
  supersample = SUPERSAMPLE;
  resize(W, H, cells = false) {
    W = Math.max(64, Math.round(W));
    H = Math.max(36, Math.round(H));
    if (W === this.W && H === this.H && cells === this.cells)
      return;
    this.W = W;
    this.H = H;
    this.cells = cells;
    this.points.on = cells;
    this.A = W / H;
    this.hdr = new Float32Array(W * H * 3);
    trackTouched(this.hdr, this.touched);
    this.orbs.length = 0;
    trackOrbs(this.hdr, this.orbs);
    this.pixels = new Uint8Array(W * H * 4);
    this.bw = Math.ceil(W / BLOOM);
    this.bh = Math.ceil(H / BLOOM);
    this.bloomA = new Float32Array(this.bw * this.bh * 3);
    this.bloomB = new Float32Array(this.bw * this.bh * 3);
    this.bloomUp = new Float32Array(this.bw * this.bh * 3);
    this.bloomRow = new Float32Array(this.bw * 3);
    this.bw2 = Math.ceil(this.bw / 2);
    this.bh2 = Math.ceil(this.bh / 2);
    this.bloom2A = new Float32Array(this.bw2 * this.bh2 * 3);
    this.bloom2B = new Float32Array(this.bw2 * this.bh2 * 3);
    this.stillSource = new Float32Array(this.bw * this.bh * 3);
    this.stillBloom = new Float32Array(this.bw * this.bh * 3);
    this.stillPixels = new Uint8Array(W * H * 4);
    this.retone = new Uint8Array(this.bw * this.bh);
    this.toned = new Uint8Array(this.bw * this.bh);
    const invR = 1 / Math.hypot(W / 2, H / 2);
    this.vignette = new Float32Array(W * H);
    for (let y = 0;y < H; y++)
      for (let x = 0;x < W; x++) {
        const dx = (x - W / 2) * invR;
        const dy = (y - H / 2) * invR;
        const corner = this.frame * smoothstep(0.45, 1, y / H) * (0.35 + 0.65 * (2 * Math.abs(x / W - 0.5)) ** 2);
        this.vignette[y * W + x] = (1 - 0.62 * Math.pow(dx * dx + dy * dy, 1.25)) * (1 - corner);
      }
    this.rowA = new Int32Array(H);
    this.rowB = new Int32Array(H);
    this.rowF = new Float32Array(H);
    for (let y = 0;y < H; y++) {
      const by = (y + 0.5) * (this.bh / H) - 0.5;
      const i = clamp(Math.floor(by), 0, this.bh - 1);
      this.rowA[y] = i * this.bw * 3;
      this.rowB[y] = Math.min(this.bh - 1, i + 1) * this.bw * 3;
      this.rowF[y] = clamp(by - i, 0, 1);
    }
    this.colA = new Int32Array(W);
    this.colB = new Int32Array(W);
    this.colF = new Float32Array(W);
    for (let x = 0;x < W; x++) {
      const bx = (x + 0.5) * (this.bw / W) - 0.5;
      const i = clamp(Math.floor(bx), 0, this.bw - 1);
      this.colA[x] = i * 3;
      this.colB[x] = Math.min(this.bw - 1, i + 1) * 3;
      this.colF[x] = clamp(bx - i, 0, 1);
    }
    const S = W * H * this.supersample ** 2 <= LAYOUT_PIXELS ? this.supersample : 1;
    let fine;
    if (S > 1) {
      const hdr = this.hdr;
      this.W = W * S;
      this.H = H * S;
      this.px = S;
      this.hdr = new Float32Array(W * S * H * S * 3);
      this.layout();
      fine = this.hdr;
      this.W = W;
      this.H = H;
      this.px = 1;
      this.hdr = hdr;
    }
    this.layout();
    keepShadows(this.hdr);
    this.background = fine ? shrink(fine, W, H, S, 3) : this.hdr.slice();
    this.still = this.background;
    this.stillExposure = NaN;
  }
  shrink(buf, channels = 3) {
    return shrink(buf, this.W / this.px, this.H / this.px, this.px, channels);
  }
  thick(radius, min = 1) {
    return this.cells ? Math.max(radius * this.H, min * this.px) : radius * this.H;
  }
  restore(background = this.background) {
    if (background)
      this.hdr.set(background);
    this.touched.length = 0;
    this.restored = true;
  }
  rebake() {
    this.stillExposure = NaN;
  }
  hold() {
    this.background = this.hdr.slice();
    this.still = this.background;
    this.stillExposure = NaN;
  }
  touch(x0, y0, x1, y1) {
    addBox(this.touched, x0, y0, x1, y1);
  }
  add(x, y, r, g, b) {
    const xi = x | 0;
    const yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.W || yi >= this.H)
      return;
    const i = (yi * this.W + xi) * 3;
    this.hdr[i] += r;
    this.hdr[i + 1] += g;
    this.hdr[i + 2] += b;
    this.touch(xi, yi, xi, yi);
  }
  point(x, y, r, g, b, size = 1, glide = false) {
    this.points.add(this.hdr, this.W, this.H, x, y, r, g, b, size, glide);
  }
  splat(x, y, r, g, b) {
    splat(this.hdr, this.W, this.H, x, y, r, g, b);
  }
  blend(i, r, g, b, a) {
    const h = this.hdr;
    h[i] += (r - h[i]) * a;
    h[i + 1] += (g - h[i + 1]) * a;
    h[i + 2] += (b - h[i + 2]) * a;
    const y = Math.floor(i / 3 / this.W);
    const x = i / 3 - y * this.W;
    this.touch(x, y, x, y);
  }
  disc(cx, cy, rad, r, g, b, a) {
    fillDisc(this.hdr, this.W, this.H, cx, cy, rad, r, g, b, a);
    this.touch(cx - rad - 2, cy - rad - 2, cx + rad + 2, cy + rad + 2);
  }
  ellipse(cx, cy, rx, ry, r, g, b, a) {
    fillEllipse(this.hdr, this.W, this.H, cx, cy, rx, ry, r, g, b, a);
    this.touch(cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2);
  }
  polygon(points, color, alpha = 1) {
    fillPolygon(this.hdr, this.W, this.H, points, color[0], color[1], color[2], alpha);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of points) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (points.length)
      this.touch(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  }
  shape(parts, lighting, light = 1) {
    fillShape(this.hdr, this.W, this.H, parts, lighting, light, this.px);
    for (const p of parts) {
      const r = (p.kind === "capsule" ? Math.max(p.r0, p.r1) : Math.max(p.rx, p.ry)) + 2;
      if (p.kind === "capsule")
        this.touch(Math.min(p.ax, p.bx) - r, Math.min(p.ay, p.by) - r, Math.max(p.ax, p.bx) + r, Math.max(p.ay, p.by) + r);
      else
        this.touch(p.cx - r, p.cy - r, p.cx + r, p.cy + r);
    }
  }
  finish(exposure = 1.25) {
    this.points.resolve(this.hdr, this.W, this.vignette, exposure);
    clearShadows(this.hdr);
    const { W, H, bw, bh, retone } = this;
    const fresh = exposure !== this.stillExposure;
    if (fresh) {
      bloomSource(this.still, W, H, bw, bh, this.stillSource, undefined, this.stillSource, retone, this.region);
      this.bloomA.set(this.stillSource);
      this.stillBloom.fill(0);
      bloom(bw, bh, this.bloomA, this.bloomB, this.bw2, this.bh2, this.bloom2A, this.bloom2B, this.stillBloom, retone, 0, 0, bw - 1, bh - 1);
      toneMap(this.still, this.stillPixels, W, H, bw, retone, this.stillBloom, this.bloomRow, this.vignette, this.rowA, this.rowB, this.rowF, this.colA, this.colB, this.colF, exposure);
      this.stillExposure = exposure;
      this.pixels.set(this.stillPixels);
      this.toned.fill(0);
    }
    if (this.restored)
      markBlocks(retone, bw, bh, this.touched);
    else
      retone.fill(1);
    this.restored = false;
    bloomSource(this.hdr, W, H, bw, bh, this.bloomA, this.still, this.stillSource, retone, this.region);
    const region = this.region;
    const spread = region[2] >= region[0];
    if (spread) {
      this.bloomUp.set(this.stillBloom);
      bloom(bw, bh, this.bloomA, this.bloomB, this.bw2, this.bh2, this.bloom2A, this.bloom2B, this.bloomUp, retone, region[0], region[1], region[2], region[3]);
    }
    settleBlocks(this.pixels, this.stillPixels, W, H, bw, bh, this.toned, retone, this.changed, fresh);
    toneMap(this.hdr, this.pixels, W, H, bw, retone, spread ? this.bloomUp : this.stillBloom, this.bloomRow, this.vignette, this.rowA, this.rowB, this.rowF, this.colA, this.colB, this.colF, exposure);
  }
}
function markBlocks(blocks, bw, bh, boxes) {
  blocks.fill(0);
  for (let b = 0;b < boxes.length; b += 4) {
    const x0 = Math.max(0, Math.floor(boxes[b] / BLOOM));
    const y0 = Math.max(0, Math.floor(boxes[b + 1] / BLOOM));
    const x1 = Math.min(bw - 1, Math.floor(boxes[b + 2] / BLOOM));
    const y1 = Math.min(bh - 1, Math.floor(boxes[b + 3] / BLOOM));
    for (let y = y0;y <= y1; y++)
      if (x0 <= x1)
        blocks.fill(1, y * bw + x0, y * bw + x1 + 1);
  }
}
function settleBlocks(pixels, stillPixels, W, H, bw, bh, toned, retone, changed, fresh) {
  changed.length = 0;
  if (fresh)
    changed.push(0, 0, W - 1, H - 1);
  for (let by = 0;by < bh; by++) {
    let run = -1;
    for (let bx = 0;bx <= bw; bx++) {
      const b = by * bw + bx;
      const moved = bx < bw && (toned[b] === 1 || retone[b] === 1);
      if (bx < bw && toned[b] && !retone[b])
        for (let y = by * BLOOM;y < Math.min(H, by * BLOOM + BLOOM); y++) {
          const o = (y * W + bx * BLOOM) * 4;
          pixels.set(stillPixels.subarray(o, (y * W + Math.min(W, bx * BLOOM + BLOOM)) * 4), o);
        }
      if (bx < bw)
        toned[b] = retone[b];
      if (moved && run < 0)
        run = bx;
      if (moved || run < 0)
        continue;
      if (!fresh)
        changed.push(run * BLOOM, by * BLOOM, Math.min(W, bx * BLOOM) - 1, Math.min(H, by * BLOOM + BLOOM) - 1);
      run = -1;
    }
  }
}
function blur(a, tmp, w, x0, y0, x1, y1) {
  blurLines(a, tmp, x0, x1, 3, y0, y1, w * 3);
  blurLines(tmp, a, y0, y1, w * 3, x0, x1, 3);
}
function blurLines(src, dst, k0, k1, step, l0, l1, lineStep) {
  for (let l = l0;l <= l1; l++) {
    const base = l * lineStep;
    for (let k = k0;k <= k1; k++) {
      const m3 = base + Math.max(k - 3, k0) * step;
      const m2 = base + Math.max(k - 2, k0) * step;
      const m1 = base + Math.max(k - 1, k0) * step;
      const o = base + k * step;
      const p1 = base + Math.min(k + 1, k1) * step;
      const p2 = base + Math.min(k + 2, k1) * step;
      const p3 = base + Math.min(k + 3, k1) * step;
      for (let c = 0;c < 3; c++)
        dst[o + c] = (src[m3 + c] + src[p3 + c] + 6 * (src[m2 + c] + src[p2 + c]) + 15 * (src[m1 + c] + src[p1 + c]) + 20 * src[o + c]) / 64;
    }
  }
}
function shrink(src, W, H, S, channels) {
  const out = new Float32Array(W * H * channels);
  const k = 1 / (S * S);
  for (let y = 0;y < H; y++)
    for (let sy = 0;sy < S; sy++) {
      const row = (y * S + sy) * W * S;
      for (let x = 0;x < W; x++)
        for (let sx = 0;sx < S; sx++) {
          const i = (row + x * S + sx) * channels;
          const o = (y * W + x) * channels;
          for (let c = 0;c < channels; c++)
            out[o + c] += src[i + c] * k;
        }
    }
  return out;
}
function fillDisc(hdr, W, H, cx, cy, rad, r, g, b, a) {
  const x0 = Math.max(0, Math.floor(cx - rad - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad + 1));
  const y0 = Math.max(0, Math.floor(cy - rad - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad + 1));
  for (let y = y0;y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0;x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const cov = clamp(rad - Math.sqrt(dx * dx + dy * dy) + 0.5, 0, 1) * a;
      if (cov <= 0)
        continue;
      const i = (y * W + x) * 3;
      hdr[i] += (r - hdr[i]) * cov;
      hdr[i + 1] += (g - hdr[i + 1]) * cov;
      hdr[i + 2] += (b - hdr[i + 2]) * cov;
    }
  }
}
function fillEllipse(hdr, W, H, cx, cy, rx, ry, r, g, b, a) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  const m = Math.min(rx, ry);
  for (let y = y0;y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    for (let x = x0;x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const cov = clamp((1 - Math.sqrt(dx * dx + dy * dy)) * m + 0.5, 0, 1) * a;
      if (cov <= 0)
        continue;
      const i = (y * W + x) * 3;
      hdr[i] += (r - hdr[i]) * cov;
      hdr[i + 1] += (g - hdr[i + 1]) * cov;
      hdr[i + 2] += (b - hdr[i + 2]) * cov;
    }
  }
}
function fillShape(hdr, W, H, parts, lighting, light, unit) {
  if (!parts.length)
    return;
  let cx0 = Infinity;
  let cy0 = Infinity;
  let cx1 = -Infinity;
  let cy1 = -Infinity;
  const boxes = new Float32Array(parts.length * 4);
  for (let j = 0;j < parts.length; j++) {
    const p = parts[j];
    const radius = p.kind === "capsule" ? Math.max(p.r0, p.r1) : Math.max(p.rx, p.ry);
    const pad = p.kind === "capsule" ? radius + 1 : radius * (1 + 0.5 / Math.max(0.01, Math.min(p.rx, p.ry))) + 1;
    const [ax, ay, bx, by] = p.kind === "capsule" ? [p.ax, p.ay, p.bx, p.by] : [p.cx, p.cy, p.cx, p.cy];
    cx0 = Math.min(cx0, ax - radius - 1, bx - radius - 1);
    cy0 = Math.min(cy0, ay - radius - 1, by - radius - 1);
    cx1 = Math.max(cx1, ax + radius + 1, bx + radius + 1);
    cy1 = Math.max(cy1, ay + radius + 1, by + radius + 1);
    boxes[j * 4] = Math.min(ax, bx) - pad;
    boxes[j * 4 + 1] = Math.min(ay, by) - pad;
    boxes[j * 4 + 2] = Math.max(ax, bx) + pad;
    boxes[j * 4 + 3] = Math.max(ay, by) + pad;
  }
  const lx0 = lighting.style === "rim" ? lighting.x : 0;
  const ly0 = lighting.style === "rim" ? lighting.y : 0;
  const sl = Math.hypot(lx0 - (cx0 + cx1) / 2, ly0 - (cy0 + cy1) / 2) || 1;
  const sx = (lx0 - (cx0 + cx1) / 2) / sl;
  const sy = (ly0 - (cy0 + cy1) / 2) / sl;
  for (let y = Math.max(0, Math.floor(cy0));y <= Math.min(H - 1, Math.ceil(cy1)); y++)
    for (let x = Math.max(0, Math.floor(cx0));x <= Math.min(W - 1, Math.ceil(cx1)); x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let best = Infinity;
      let part = parts[0];
      let nx = 0;
      let ny = 0;
      let e = 0;
      let across = 0;
      for (let j = 0;j < parts.length; j++) {
        if (px < boxes[j * 4] || py < boxes[j * 4 + 1] || px > boxes[j * 4 + 2] || py > boxes[j * 4 + 3])
          continue;
        const p = parts[j];
        if (p.kind === "capsule") {
          const dx = p.bx - p.ax;
          const dy = p.by - p.ay;
          const len2 = dx * dx + dy * dy || 0.000001;
          const t = clamp(((px - p.ax) * dx + (py - p.ay) * dy) / len2, 0, 1);
          const ox2 = px - (p.ax + dx * t);
          const oy2 = py - (p.ay + dy * t);
          const r = p.r0 + (p.r1 - p.r0) * t;
          const dist = Math.hypot(ox2, oy2) || 0.000001;
          const d2 = dist - r;
          if (d2 >= best)
            continue;
          best = d2;
          part = p;
          nx = ox2 / dist;
          ny = oy2 / dist;
          e = dist / Math.max(r, 0.5);
          across = (ox2 * dy - oy2 * dx) / Math.sqrt(len2) / Math.max(r, 0.5);
          continue;
        }
        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        const ox = px - p.cx;
        const oy = py - p.cy;
        const lx = ox * ca + oy * sa;
        const ly = -ox * sa + oy * ca;
        const radial = Math.sqrt((lx / p.rx) ** 2 + (ly / p.ry) ** 2);
        const d = (radial - 1) * Math.min(p.rx, p.ry);
        if (d >= best)
          continue;
        const gx = lx / (p.rx * p.rx);
        const gy = ly / (p.ry * p.ry);
        const gl = Math.hypot(gx, gy) || 0.000001;
        best = d;
        part = p;
        nx = (gx * ca - gy * sa) / gl;
        ny = (gx * sa + gy * ca) / gl;
        e = radial;
        across = lx / p.rx;
      }
      const cov = clamp(0.5 - best, 0, 1);
      if (cov <= 0)
        continue;
      const k = part.ribs ? 0.8 + 0.2 * Math.cos(across * Math.PI * part.ribs) : 1;
      const c = part.color;
      const o = (y * W + x) * 3;
      if (lighting.style === "front") {
        const r = Math.min(1, e);
        const lit2 = Math.max(0, nx * r * lighting.dir[0] + ny * r * lighting.dir[1] + Math.sqrt(1 - r * r) * lighting.dir[2]);
        const shade = k * (1 - light + light * (0.45 + 0.75 * lit2));
        hdr[o] += (c[0] * shade - hdr[o]) * cov;
        hdr[o + 1] += (c[1] * shade - hdr[o + 1]) * cov;
        hdr[o + 2] += (c[2] * shade - hdr[o + 2]) * cov;
        continue;
      }
      const lit = light * clamp((best + 2.2 * unit) / (2.2 * unit), 0, 1) * Math.max(0, nx * sx + ny * sy) * 0.8;
      hdr[o] += (c[0] * k + lighting.color[0] * lit - hdr[o]) * cov;
      hdr[o + 1] += (c[1] * k + lighting.color[1] * lit - hdr[o + 1]) * cov;
      hdr[o + 2] += (c[2] * k + lighting.color[2] * lit - hdr[o + 2]) * cov;
    }
}
function toneMap(hdr, pixels, W, H, bw, retone, bloomUp, row, vignette, rowA, rowB, rowF, colA, colB, colF, exposure) {
  for (let y = 0;y < H; y++) {
    const blocks = (y / BLOOM | 0) * bw;
    let blended = false;
    for (let x = 0;x < W; x++) {
      if (!retone[blocks + (x / BLOOM | 0)]) {
        x += BLOOM - 1;
        continue;
      }
      if (!blended) {
        const fy = rowF[y];
        for (let j = 0;j < bw * 3; j++)
          row[j] = bloomUp[rowA[y] + j] * (1 - fy) + bloomUp[rowB[y] + j] * fy;
        blended = true;
      }
      const i = y * W + x;
      const fx = colF[x];
      const a = colA[x];
      const b = colB[x];
      const k = vignette[i] * exposure;
      const o = i * 4;
      for (let c = 0;c < 3; c++) {
        const v = (hdr[i * 3 + c] + row[a + c] * (1 - fx) + row[b + c] * fx) * k;
        const mapped = v * (2.51 * v + 0.03) / (v * (2.43 * v + 0.59) + 0.14) * 255;
        pixels[o + c] = mapped < 0 ? 0 : mapped > 255 ? 255 : mapped;
      }
      pixels[o + 3] = 255;
    }
  }
}
function bloomSource(hdr, W, H, bw, bh, source, still, stillSource, retone, region) {
  region[0] = bw;
  region[1] = bh;
  region[2] = -1;
  region[3] = -1;
  for (let by = 0;by < bh; by++)
    for (let bx = 0;bx < bw; bx++) {
      const o = (by * bw + bx) * 3;
      const same = still !== undefined && (!retone[by * bw + bx] || sameBlock(hdr, still, W, H, bx, by));
      retone[by * bw + bx] = same ? 0 : 1;
      if (same) {
        source[o] = source[o + 1] = source[o + 2] = 0;
        continue;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = by * BLOOM;yy < Math.min(H, by * BLOOM + BLOOM); yy++)
        for (let xx = bx * BLOOM;xx < Math.min(W, bx * BLOOM + BLOOM); xx++) {
          const i = (yy * W + xx) * 3;
          r += hdr[i];
          g += hdr[i + 1];
          b += hdr[i + 2];
          n++;
        }
      r /= n;
      g /= n;
      b /= n;
      const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const k = l > 0.0001 ? Math.max(0, l - BLOOM_THRESHOLD) / l : 0;
      source[o] = r * k - (still ? stillSource[o] : 0);
      source[o + 1] = g * k - (still ? stillSource[o + 1] : 0);
      source[o + 2] = b * k - (still ? stillSource[o + 2] : 0);
      if (!source[o] && !source[o + 1] && !source[o + 2])
        continue;
      region[0] = Math.min(region[0], bx);
      region[1] = Math.min(region[1], by);
      region[2] = Math.max(region[2], bx);
      region[3] = Math.max(region[3], by);
    }
}
function sameBlock(hdr, still, W, H, bx, by) {
  for (let y = by * BLOOM;y < Math.min(H, by * BLOOM + BLOOM); y++)
    for (let i = (y * W + bx * BLOOM) * 3;i < (y * W + Math.min(W, bx * BLOOM + BLOOM)) * 3; i++)
      if (hdr[i] !== still[i])
        return false;
  return true;
}
function bloom(bw, bh, bloomA, bloomB, bw2, bh2, bloom2A, bloom2B, out, retone, x0, y0, x1, y1) {
  const ax0 = Math.max(0, x0 - 6);
  const ay0 = Math.max(0, y0 - 6);
  const ax1 = Math.min(bw - 1, x1 + 6);
  const ay1 = Math.min(bh - 1, y1 + 6);
  blur(bloomA, bloomB, bw, ax0, ay0, ax1, ay1);
  blur(bloomA, bloomB, bw, ax0, ay0, ax1, ay1);
  const cx0 = Math.max(0, (ax0 >> 1) - 6);
  const cy0 = Math.max(0, (ay0 >> 1) - 6);
  const cx1 = Math.min(bw2 - 1, (ax1 >> 1) + 6);
  const cy1 = Math.min(bh2 - 1, (ay1 >> 1) + 6);
  bloom2A.fill(0);
  for (let y = cy0;y <= cy1; y++)
    for (let x = cx0;x <= cx1; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y * 2;yy < Math.min(bh, y * 2 + 2); yy++)
        for (let xx = x * 2;xx < Math.min(bw, x * 2 + 2); xx++) {
          const i = (yy * bw + xx) * 3;
          r += bloomA[i];
          g += bloomA[i + 1];
          b += bloomA[i + 2];
          n++;
        }
      const o = (y * bw2 + x) * 3;
      bloom2A[o] = r / n;
      bloom2A[o + 1] = g / n;
      bloom2A[o + 2] = b / n;
    }
  blur(bloom2A, bloom2B, bw2, cx0, cy0, cx1, cy1);
  blur(bloom2A, bloom2B, bw2, cx0, cy0, cx1, cy1);
  for (let y = Math.max(0, cy0 * 2 - 3);y <= Math.min(bh - 1, cy1 * 2 + 3); y++) {
    const sy = clamp((y + 0.5) * (bh2 / bh) - 0.5, 0, bh2 - 1);
    const sy0 = Math.floor(sy);
    const sy1 = Math.min(bh2 - 1, sy0 + 1);
    const fy = sy - sy0;
    for (let x = Math.max(0, cx0 * 2 - 3);x <= Math.min(bw - 1, cx1 * 2 + 3); x++) {
      const sx = clamp((x + 0.5) * (bw2 / bw) - 0.5, 0, bw2 - 1);
      const sx0 = Math.floor(sx);
      const sx1 = Math.min(bw2 - 1, sx0 + 1);
      const fx = sx - sx0;
      const o = (y * bw + x) * 3;
      let change = 0;
      for (let c = 0;c < 3; c++) {
        const a = bloom2A[(sy0 * bw2 + sx0) * 3 + c] * (1 - fx) + bloom2A[(sy0 * bw2 + sx1) * 3 + c] * fx;
        const b = bloom2A[(sy1 * bw2 + sx0) * 3 + c] * (1 - fx) + bloom2A[(sy1 * bw2 + sx1) * 3 + c] * fx;
        const v = bloomA[o + c] * 1.1 + (a * (1 - fy) + b * fy) * 1.4;
        out[o + c] += v;
        change += Math.abs(v);
      }
      if (change < BLOOM_EPSILON)
        continue;
      for (let yy = Math.max(0, y - 1);yy <= Math.min(bh - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1);xx <= Math.min(bw - 1, x + 1); xx++)
          retone[yy * bw + xx] = 1;
    }
  }
}
function fillPolygon(hdr, W, H, pts, r, g, b, a) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const n = pts.length;
  for (let y = Math.max(0, Math.floor(y0 - 1));y <= Math.min(H - 1, Math.ceil(y1 + 1)); y++)
    for (let x = Math.max(0, Math.floor(x0 - 1));x <= Math.min(W - 1, Math.ceil(x1 + 1)); x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let inside = false;
      let dmin = 0.5;
      for (let i = 0, j = n - 1;i < n; j = i++) {
        const [ax, ay] = pts[j];
        const [bx, by] = pts[i];
        if (ay > py !== by > py && px < (bx - ax) * (py - ay) / (by - ay) + ax)
          inside = !inside;
        if (px < Math.min(ax, bx) - 0.5 || px > Math.max(ax, bx) + 0.5 || py < Math.min(ay, by) - 0.5 || py > Math.max(ay, by) + 0.5)
          continue;
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 0.000001)));
        dmin = Math.min(dmin, Math.hypot(px - ax - dx * t, py - ay - dy * t));
      }
      const cov = Math.max(0, Math.min(1, (inside ? dmin : -dmin) + 0.5)) * a;
      if (cov <= 0)
        continue;
      const o = (y * W + x) * 3;
      hdr[o] += (r - hdr[o]) * cov;
      hdr[o + 1] += (g - hdr[o + 1]) * cov;
      hdr[o + 2] += (b - hdr[o + 2]) * cov;
    }
}
// src/creature.ts
function gait(face = 1, phase = 0) {
  return { phase, go: 0, turn: face, lag: 0, lagV: 0 };
}
function stepGait(g, strides, dt, face, rate = 3) {
  g.phase += strides;
  g.go = clamp(g.go + (strides > 0 ? dt : -dt) * 2.5, 0, 1);
  const before = g.turn;
  g.turn = face > g.turn ? Math.min(face, g.turn + dt * rate) : Math.max(face, g.turn - dt * rate);
  const target = g.go + Math.abs(g.turn - before) / Math.max(dt, 0.000001) * 0.15;
  g.lagV += ((target - g.lag) * 40 - g.lagV * 5) * dt;
  g.lag += g.lagV * dt;
}
function view(turn) {
  const a = (1 - turn) * Math.PI / 2;
  return [Math.cos(a), Math.sin(a)];
}
function stride(phase, offset = 0, duty = 0.6) {
  const p = ((phase + offset) % 1 + 1) % 1;
  if (p < duty)
    return [1 - 2 * p / duty, 0];
  const q = (p - duty) / (1 - duty);
  return [-1 + 2 * smoothstep(0, 1, q), Math.sin(Math.PI * q)];
}
function bob(phase, duty = 0.6) {
  return 0.5 + 0.5 * Math.cos(TAU * 2 * (phase - duty / 2));
}
function joint(ax, ay, bx, by, a, b, bend) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy) || 0.000001;
  const r = clamp(d, Math.abs(a - b) + 0.000001, a + b - 0.000001);
  const along = (a * a - b * b + r * r) / (2 * r);
  const h = Math.sqrt(Math.max(0, a * a - along * along)) * bend;
  return [ax + dx / d * along - dy / d * h, ay + dy / d * along + dx / d * h];
}
function limb(P, ax, ay, bx, by, a, b, bend, r0, r1, r2, color) {
  const [jx, jy] = joint(ax, ay, bx, by, a, b, bend);
  return [cap(...P(ax, ay), ...P(jx, jy), r0, r1, color), cap(...P(jx, jy), ...P(bx, by), r1, r2, color)];
}
function body(x, y, S, turn) {
  const [along, across] = view(turn);
  const P = (u, v, w = 0) => [x + (u * along - w * across) * S, y + v * S];
  return Object.assign(P, { S, along, across, len: (u, w) => (u * Math.abs(along) + w * across) * S });
}
function quadruped(P, g, far, o) {
  const S = P.S;
  const [r0, r1, r2] = o.r;
  const k = (o.top - r2) * 1.06 / (o.a + o.b);
  const along = view(g.turn)[0];
  const legs = [
    [o.fore, o.w, 0],
    [-o.hind, -o.w, 0],
    [o.fore, -o.w, 0.5],
    [-o.hind, o.w, 0.5]
  ];
  return legs.filter(([, w]) => w * along < 0 === far).flatMap(([u, w, offset]) => {
    const [reach, lift] = stride(g.phase, offset);
    const fu = u + reach * o.reach * g.go;
    const fv = -lift * o.lift * g.go - r2;
    const Q = (a, b) => P(a, b, w);
    const parts = limb(Q, u, -o.top, fu, fv, o.a * k, o.b * k, u > 0 ? -1 : 1, r0 * S, r1 * S, r2 * S, o.color);
    return o.paw ? [...parts, cap(...Q(fu, fv), ...Q(fu + o.paw[0], fv + r2 * 0.1), r2 * 1.15 * S, r2 * S, o.paw[1])] : parts;
  });
}
function chain(path, n, r0, r1, color) {
  return Array.from({ length: n }, (_, i) => cap(...path(i / n), ...path((i + 1) / n), r0 + (r1 - r0) * (i / n), r0 + (r1 - r0) * ((i + 1) / n), color));
}
// src/egg.ts
var EGG = Symbol.for("opencode-wallpapers.egg");
var clock = globalThis[EGG] ??= { viewed: 0, due: -1 };
function eggWait(next = false) {
  if (process.env.WALLPAPER_EGG === "1")
    return 3;
  const wait = 1800 - Math.log(1 - Math.random()) * 3600;
  if (next || clock.due < 0)
    clock.due = clock.viewed + wait;
  return Math.max(0, clock.due - clock.viewed);
}
function watchEgg(seconds) {
  clock.viewed += seconds;
}
// src/flock.ts
function startle(birds, x, y, count) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0;i < count; i++)
    birds.push({ x: x + rand(-0.03, 0.03), y: y + rand(-0.01, 0.01), vx: dir * rand(0.1, 0.18), vy: -rand(0.12, 0.2), phase: Math.random() * TAU });
}
function flyAway(birds, dt, A) {
  for (const b of birds) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vy *= Math.exp(-dt * 0.4);
    b.phase += dt * 20;
  }
  return birds.filter((b) => b.y > -0.1 && b.x > -0.1 && b.x < A + 0.1);
}
function bird(b, H, size, color) {
  const x = b.x * H;
  const y = b.y * H;
  const flap = Math.sin(b.phase);
  return [
    ell(x, y, 0.3 * size, 0.13 * size, 0, color),
    cap(x, y, x - size, y - size * (0.15 + flap * 0.55), 0.12 * size, 0.04 * size, color),
    cap(x, y, x + size, y - size * (0.15 + flap * 0.55), 0.12 * size, 0.04 * size, color)
  ];
}
// src/grade.ts
function haze(hdr, sky, W, H, y0, y1, far, near = 0, top = 0) {
  for (let y = Math.max(0, Math.floor(top * H));y < Math.min(H, Math.ceil(y1 * H)); y++) {
    const k = lerp(far, near, smoothstep(y0, y1, (y + 0.5) / H));
    if (k <= 0)
      continue;
    for (let o = y * W * 3;o < (y + 1) * W * 3; o++)
      hdr[o] += (sky[o] - hdr[o]) * k;
  }
}
function mottle(hdr, W, H, y0, y1, size, warm, cool) {
  const span = 1 - y0 + 0.04;
  for (let y = Math.max(0, Math.ceil(y0 * H));y < Math.min(H, Math.ceil(y1 * H)); y++) {
    const v = (y + 0.5) / H;
    const z = Math.min(6, span / (v - y0 + 0.04));
    const fade = smoothstep(y0, y0 + 0.08, v);
    for (let x = 0;x < W; x++) {
      const n = Math.max(-1, Math.min(1, (fbm2(x / H * z / size, z * span / size, 3) - 0.5) * 3.2)) * fade;
      const t = n > 0 ? warm : cool;
      const a = Math.abs(n);
      const o = (y * W + x) * 3;
      hdr[o] *= 1 + (t[0] - 1) * a;
      hdr[o + 1] *= 1 + (t[1] - 1) * a;
      hdr[o + 2] *= 1 + (t[2] - 1) * a;
    }
  }
}
// src/light.ts
function lightPool(hdr, W, H, cx, cy, rx, ry, color, lift, glow) {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry));
  touch(hdr, x0, y0, x1, y1);
  const lr = color[0] * lift;
  const lg = color[1] * lift;
  const lb = color[2] * lift;
  const gr = color[0] * glow;
  const gg = color[1] * glow;
  const gb = color[2] * glow;
  for (let y = y0;y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    for (let x = x0;x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const d = 1 - dx * dx - dy * dy;
      if (d <= 0)
        continue;
      const f = d * d;
      const o = (y * W + x) * 3;
      const m = Math.min(0.2, Math.max(hdr[o], hdr[o + 1], hdr[o + 2]));
      hdr[o] += (m * lr + gr) * f;
      hdr[o + 1] += (m * lg + gg) * f;
      hdr[o + 2] += (m * lb + gb) * f;
    }
  }
}
function fireflyLight(hdr, W, H, x, y, k) {
  lightPool(hdr, W, H, x, y, 0.045 * H, 0.045 * H, [0.75, 1, 0.25], 4 * k, 0.012 * k);
}
function campfire(x, gy, H, t) {
  const flicker = 0.85 + 0.1 * Math.sin(t * 7.1) + 0.05 * Math.sin(t * 13.3 + 1);
  const log = [0.05, 0.025, 0.02];
  const logs = [cap(x - 0.03 * H, gy, x + 0.025 * H, gy - 0.008 * H, 0.006 * H, 0.005 * H, log), cap(x + 0.03 * H, gy, x - 0.02 * H, gy - 0.01 * H, 0.006 * H, 0.005 * H, log)];
  const flames = [
    [-0.008, 0.036, 0.009, false],
    [0.008, 0.03, 0.008, false],
    [0, 0.046, 0.011, false],
    [0, 0.026, 0.006, true]
  ].map(([dx, h, r, core]) => {
    const sway = Math.sin(t * 3 + dx * 400) * 0.003 * H;
    const height = h * H * (0.8 + 0.2 * Math.sin(t * 5.3 + dx * 900 + h * 100)) * flicker;
    return [cap(x + dx * H, gy - 0.004 * H, x + dx * H + sway, gy - height, r * H, 0.0015 * H, core ? [2.6, 1.5, 0.3] : [2, 0.6, 0.08])];
  });
  return { flicker, logs, flames };
}
// src/lightmap.ts
class LightMap {
  cell = 1;
  cols = 0;
  rows = 0;
  W = 0;
  H = 0;
  lift = new Float32Array(0);
  glow = new Float32Array(0);
  lit = new Uint8Array(0);
  dim = new Float32Array(0);
  box = [0, 0, -1, -1];
  clear(W, H) {
    if (W !== this.W || H !== this.H) {
      this.W = W;
      this.H = H;
      this.cell = Math.max(4, Math.round(H / 30));
      this.cols = Math.floor((W - 0.5) / this.cell) + 2;
      this.rows = Math.floor((H - 0.5) / this.cell) + 2;
      this.lift = new Float32Array(this.cols * this.rows * 3);
      this.glow = new Float32Array(this.cols * this.rows * 3);
      this.lit = new Uint8Array(this.cols * this.rows);
      this.dim = Float32Array.from({ length: this.cols }, (_, i) => 1 - 0.45 * smoothstep(0.4, 0.15, Math.abs(i * this.cell / W - 0.5)));
      this.box = [0, 0, -1, -1];
    }
    const [i0, j0, i1, j1] = this.box;
    for (let j = j0;j <= j1; j++) {
      this.lift.fill(0, (j * this.cols + i0) * 3, (j * this.cols + i1 + 1) * 3);
      this.glow.fill(0, (j * this.cols + i0) * 3, (j * this.cols + i1 + 1) * 3);
      this.lit.fill(0, j * this.cols + i0, j * this.cols + i1 + 1);
    }
    this.box = [this.cols, this.rows, -1, -1];
  }
  node(i, j, color, lift, glow) {
    const n = j * this.cols + i;
    const o = n * 3;
    this.lift[o] += color[0] * lift;
    this.lift[o + 1] += color[1] * lift;
    this.lift[o + 2] += color[2] * lift;
    this.glow[o] += color[0] * glow;
    this.glow[o + 1] += color[1] * glow;
    this.glow[o + 2] += color[2] * glow;
    this.lit[n] = 1;
    const b = this.box;
    if (i < b[0])
      b[0] = i;
    if (j < b[1])
      b[1] = j;
    if (i > b[2])
      b[2] = i;
    if (j > b[3])
      b[3] = j;
  }
  pool(cx, cy, rx, ry, color, lift, glow) {
    const c = this.cell;
    for (let j = Math.max(0, Math.ceil((cy - ry) / c));j <= Math.min(this.rows - 1, Math.floor((cy + ry) / c)); j++) {
      const dy = (j * c - cy) / ry;
      for (let i = Math.max(0, Math.ceil((cx - rx) / c));i <= Math.min(this.cols - 1, Math.floor((cx + rx) / c)); i++) {
        const dx = (i * c - cx) / rx;
        const d = 1 - dx * dx - dy * dy;
        if (d > 0)
          this.node(i, j, color, lift * d * d, glow * d * d);
      }
    }
  }
  apply(hdr) {
    const [i0, j0, i1, j1] = this.box;
    if (i1 < i0)
      return;
    applyLight(hdr, this.W, this.H, this.cell, this.cols, this.lift, this.glow, this.lit, this.dim, Math.max(0, i0 - 1), Math.max(0, j0 - 1), Math.min(this.cols - 2, i1), Math.min(this.rows - 2, j1));
  }
}
function firelight(t, seed) {
  return 0.8 + 0.13 * noise1(t * 1.1, seed) + 0.07 * noise1(t * 2.4, seed + 3);
}
function applyLight(hdr, W, H, cell, cols, lift, glow, lit, dim, bi0, bj0, bi1, bj1) {
  for (let bj = bj0;bj <= bj1; bj++) {
    let run = -1;
    for (let bi = bi0;bi <= bi1 + 1; bi++) {
      const a = bj * cols + bi;
      const c = a + cols;
      const on = bi <= bi1 && (lit[a] || lit[a + 1] || lit[c] || lit[c + 1]);
      if (!on && run >= 0)
        touch(hdr, run * cell, bj * cell, bi * cell - 1, (bj + 1) * cell - 1);
      if (!on) {
        run = -1;
        continue;
      }
      if (run < 0)
        run = bi;
      const dl = dim[bi];
      const dr = dim[bi + 1];
      const x0 = bi * cell;
      const x1 = Math.min(W, x0 + cell);
      for (let y = bj * cell;y < Math.min(H, (bj + 1) * cell); y++) {
        const fy = (y + 0.5) / cell - bj;
        const gy = 1 - fy;
        const lr = (lift[a * 3] * gy + lift[c * 3] * fy) * dl;
        const lg = (lift[a * 3 + 1] * gy + lift[c * 3 + 1] * fy) * dl;
        const lb = (lift[a * 3 + 2] * gy + lift[c * 3 + 2] * fy) * dl;
        const rr = (lift[a * 3 + 3] * gy + lift[c * 3 + 3] * fy) * dr;
        const rg = (lift[a * 3 + 4] * gy + lift[c * 3 + 4] * fy) * dr;
        const rb = (lift[a * 3 + 5] * gy + lift[c * 3 + 5] * fy) * dr;
        const gl = (glow[a * 3] * gy + glow[c * 3] * fy) * dl;
        const gg = (glow[a * 3 + 1] * gy + glow[c * 3 + 1] * fy) * dl;
        const gb = (glow[a * 3 + 2] * gy + glow[c * 3 + 2] * fy) * dl;
        const hr = (glow[a * 3 + 3] * gy + glow[c * 3 + 3] * fy) * dr;
        const hg = (glow[a * 3 + 4] * gy + glow[c * 3 + 4] * fy) * dr;
        const hb = (glow[a * 3 + 5] * gy + glow[c * 3 + 5] * fy) * dr;
        for (let x = x0;x < x1; x++) {
          const fx = (x + 0.5) / cell - bi;
          const o = (y * W + x) * 3;
          const m = Math.min(0.2, Math.max(hdr[o], hdr[o + 1], hdr[o + 2]));
          hdr[o] += m * (lr + (rr - lr) * fx) + gl + (hr - gl) * fx;
          hdr[o + 1] += m * (lg + (rg - lg) * fx) + gg + (hg - gg) * fx;
          hdr[o + 2] += m * (lb + (rb - lb) * fx) + gb + (hb - gb) * fx;
        }
      }
    }
  }
}
// src/sky.ts
var STAR_TINTS = [
  [0.55, 0.75, 1.2],
  [1.15, 0.85, 0.45],
  [1.1, 0.6, 0.85],
  [0.7, 0.6, 1.2]
];
function paintSky(hdr, W, H, stops, orb, px = 1) {
  const ox = orb.x * W;
  const oy = orb.y * H;
  const R = orb.r * H;
  addOrb(hdr, ox, oy, R);
  for (let y = 0;y < H; y++) {
    const v = y / H;
    const i = stops.findIndex(([at]) => at >= v);
    const [a, from] = stops[Math.max(0, i - 1)];
    const [b, to] = stops[i < 0 ? stops.length - 1 : i];
    const k = b > a ? smoothstep(a, b, v) : 1;
    for (let x = 0;x < W; x++) {
      const d = Math.hypot(x - ox, y - oy) / H;
      const glow = orb.near * Math.exp(-d / (orb.r * 1.8)) + orb.wide * Math.exp(-d / 0.35);
      const o = (y * W + x) * 3;
      hdr[o] = lerp(from[0], to[0], k) + glow * orb.glow[0];
      hdr[o + 1] = lerp(from[1], to[1], k) + glow * orb.glow[1];
      hdr[o + 2] = lerp(from[2], to[2], k) + glow * orb.glow[2];
      const r = d * H;
      const cov = Math.min(1, Math.max(0, R - r + 0.5));
      if (cov <= 0)
        continue;
      const limb2 = 0.85 + 0.15 * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
      const maria = orb.moon ? 1 - 0.18 * smoothstep(0.55, 0.75, fbm1((x - ox) / px * 0.25 + 3, 7) + fbm1((y - oy) / px * 0.25 + 1, 9) * 0.6) : 1;
      const m = limb2 * maria;
      hdr[o] += (orb.core[0] * m - hdr[o]) * cov;
      hdr[o + 1] += (orb.core[1] * m - hdr[o + 1]) * cov;
      hdr[o + 2] += (orb.core[2] * m - hdr[o + 2]) * cov;
    }
  }
}
function makeStars(count, top) {
  return Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random() * top, b: 0.4 + Math.random() * 0.6, phase: Math.random() * TAU, tint: STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)] }));
}
function paintStars(hdr, W, H, stars, time, top, brightness, points) {
  for (const s of stars) {
    const x = s.x * W | 0;
    const y = s.y * H | 0;
    if (x < 0 || y < 0 || x >= W || y >= H || onOrb(hdr, x + 0.5, y + 0.5, 1.5))
      continue;
    const k = s.b * Math.max(0, 1 - s.y / top) * (0.7 + 0.3 * Math.sin(time * 0.8 + s.phase)) * brightness;
    if (points) {
      points.add(hdr, W, H, x, y, k * s.tint[0], k * s.tint[1], k * s.tint[2], s.b > 0.9 ? 3 : s.b > 0.65 ? 2 : 1);
      continue;
    }
    const o = (y * W + x) * 3;
    hdr[o] += k * s.tint[0];
    hdr[o + 1] += k * s.tint[1];
    hdr[o + 2] += k * s.tint[2];
    touch(hdr, x, y, x, y);
  }
}
var KINDS = {
  cumulus: { size: [0.08, 0.13], speed: [0.003, 0.007], edge: [0.02, 0.28], alpha: 1, thin: 0 },
  towering: { size: [0.09, 0.14], speed: [0, 0], edge: [0.02, 0.28], alpha: 0.85, thin: 0 },
  ash: { size: [0.1, 0.16], speed: [0.004, 0.007], edge: [0, 0.6], alpha: 0.8, thin: 0 },
  cirrus: { size: [0.14, 0.24], speed: [0.005, 0.009], edge: [0.05, 0.8], alpha: 0.9, thin: 0.7 },
  wisp: { size: [0.12, 0.2], speed: [0.003, 0.006], edge: [0.04, 0.85], alpha: 0.75, thin: 0.6 },
  stratus: { size: [0.25, 0.45], speed: [0.002, 0.004], edge: [0.12, 0.75], alpha: 0.75, thin: 0.5 },
  shadow: { size: [0.2, 0.45], speed: [0.004, 0.01], edge: [0, 0.8], alpha: 1, thin: 0 }
};
function makeClouds(count, kind, y0, y1) {
  return Array.from({ length: count }, (_, i) => {
    const size = rand(KINDS[kind].size[0], KINDS[kind].size[1]);
    const [parts, base] = shapeParts(kind, size);
    return { x: (i + Math.random() * 0.8) / count * 2, y: y0 + Math.random() * (y1 - y0), speed: rand(KINDS[kind].speed[0], KINDS[kind].speed[1]), kind, w: halfWidth(parts), parts, base, seed: Math.random() * 100 };
  });
}
function makeShadows(count, y0, y1) {
  return Array.from({ length: count }, (_, i) => {
    const near = (i + Math.random()) / count;
    const w = lerp(KINDS.shadow.size[0], KINDS.shadow.size[1], near);
    const parts = [{ x: 0, y: 0, r: w, s: w * (0.12 + 0.12 * near), t: 0 }];
    return { x: Math.random() * 2, y: lerp(y0, y1, near), speed: lerp(KINDS.shadow.speed[0], KINDS.shadow.speed[1], near), kind: "shadow", w, parts, base: Infinity, seed: Math.random() * 100 };
  });
}
function driftClouds(clouds, A, dt) {
  for (const c of clouds) {
    c.x += c.speed * dt;
    if (c.x > A + c.w)
      c.x = -c.w;
  }
}
function makeStorm() {
  return makeClouds(8, "cumulus", 0.04, 0.26);
}
function paintStorm(hdr, W, H, clouds, top, bottom, gloom) {
  if (gloom <= 0)
    return;
  paintClouds(hdr, W, H, clouds, [top[0] * 0.45, top[1] * 0.45, top[2] * 0.5], [bottom[0] * 0.4, bottom[1] * 0.4, bottom[2] * 0.45], smoothstep(0, 1, gloom) * 0.8);
}
function paintClouds(hdr, W, H, clouds, top, bottom, alpha, orb) {
  const [lit, shade] = luma(top) >= luma(bottom) ? [top, bottom] : [bottom, top];
  const low = !!orb && !orb.moon && orb.y > 0.3;
  const sky = !orb ? 1 : orb.moon ? 0.25 : low ? 0 : 0.35;
  const edge = !orb ? 0 : orb.moon ? 0.6 : low ? 0.3 : 0.15;
  const k = !orb ? 0 : orb.moon ? 1.6 : low ? 1.4 : 0.6;
  for (const c of clouds) {
    const s = spriteFor(c, H);
    const dx = orb ? orb.x * (W / H) - c.x : 0;
    const dy = orb ? orb.y - c.y - s.cy : -1;
    const dist = Math.hypot(dx, dy) || 1;
    const back = orb ? Math.exp(-dist / 0.3) : 0;
    const glow = orb?.glow ?? lit;
    const m = orb?.moon ? back : 1;
    const rim = [lerp(lit[0] * 2.5, glow[0] * k, m), lerp(lit[1] * 2.5, glow[1] * k, m), lerp(lit[2] * 2.5, glow[2] * k, m)];
    drawCloud(hdr, W, H, s, c.x * H, c.y * H, lit, shade, rim, dx / dist, dy / dist, back, edge, sky, alpha);
  }
}
function paintShadows(hdr, W, H, shadows, ground, orb) {
  if (!orb || orb.moon || orb.y > 0.3)
    return;
  for (const c of shadows)
    drawShadow(hdr, W, H, spriteFor(c, H), c.x * H, c.y * H, ground * H);
}
function paintHaze(hdr, W, H, y0, y1, color, alpha) {
  for (let y = Math.max(0, Math.floor(y0 * H));y < Math.min(H, Math.ceil(y1 * H)); y++) {
    const v = (y / H - y0) / (y1 - y0);
    const band = smoothstep(0, 1, v) * (1 - smoothstep(0.92, 1, v) * 0.5) * alpha;
    for (let x = 0;x < W; x++) {
      const a = Math.min(1, band * (0.55 + 0.9 * fbm2(x / H * 2.5, y / H * 18, 3)));
      const o = (y * W + x) * 3;
      hdr[o] += (color[0] - hdr[o]) * a;
      hdr[o + 1] += (color[1] - hdr[o + 1]) * a;
      hdr[o + 2] += (color[2] - hdr[o + 2]) * a;
    }
  }
}
function luma(c) {
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function shapeParts(kind, size) {
  const part = (x, y, r, s = 0, t = 0) => ({ x, y, r, s, t });
  if (kind === "cumulus") {
    const h = size * rand(0.6, 0.8);
    const n = 5 + Math.floor(Math.random() * 3);
    const row = Array.from({ length: n }, (_, i) => {
      const f = i / (n - 1) * 2 - 1;
      const r = h * (0.6 - 0.3 * Math.abs(f)) * rand(0.7, 1.2);
      return part(f * size * 0.7 + rand(-0.06, 0.06) * size, h * 0.35 - r * rand(0.5, 0.95), r);
    });
    const heap = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => part(rand(-0.4, 0.4) * size, -h * rand(0.35, 0.55), h * rand(0.3, 0.42)));
    return [[...row, ...heap], h * 0.35];
  }
  if (kind === "towering") {
    const h = size * rand(1.4, 1.9);
    const lean = rand(-0.25, 0.25) * size;
    const foot = Array.from({ length: 5 }, (_, i) => part((i / 4 * 2 - 1) * size * 0.72 + rand(-0.05, 0.05) * size, -size * rand(0.1, 0.2), size * rand(0.26, 0.36)));
    const column = Array.from({ length: 9 }, (_, i) => {
      const f = (i + 1) / 9;
      const r = size * (0.5 - 0.22 * f) * rand(0.8, 1.1);
      return part(lean * f + rand(-0.3, 0.3) * size * (1 - 0.5 * f), -h * f * 0.75, r);
    });
    return [[...foot, ...column], 0];
  }
  if (kind === "ash")
    return [Array.from({ length: 11 }, () => part(rand(-0.8, 0.8) * size, rand(-0.12, 0.12) * size, size * rand(0.16, 0.3))), Infinity];
  if (kind === "cirrus")
    return [Array.from({ length: 3 + Math.floor(Math.random() * 2) }, () => part(rand(-0.35, 0.35) * size, rand(-0.03, 0.03), size * rand(0.45, 0.7), rand(0.007, 0.012), rand(-0.1, 0.02))), Infinity];
  if (kind === "wisp")
    return [Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => part(rand(-0.3, 0.3) * size, rand(-0.012, 0.012), size * rand(0.55, 0.85), rand(0.007, 0.012), rand(-0.05, 0.05))), Infinity];
  return [Array.from({ length: 3 }, () => part(rand(-0.25, 0.25) * size, rand(-0.01, 0.01), size * rand(0.65, 0.9), rand(0.013, 0.022))), Infinity];
}
function halfWidth(parts) {
  return parts.reduce((m, p) => Math.max(m, Math.abs(p.x) + p.r * 1.12), 0);
}
function spriteFor(c, H) {
  if (c.sprite?.H !== H)
    c.sprite = buildSprite(c, H);
  return c.sprite;
}
function buildSprite(c, H) {
  const kind = KINDS[c.kind];
  const puffy = c.kind === "cumulus" || c.kind === "towering" || c.kind === "ash";
  const grow = puffy ? 1.12 : 1;
  const x0 = Math.floor((-c.w - 0.01) * H);
  const top = c.parts.reduce((m, p) => Math.min(m, p.y - (puffy ? p.r * grow : p.s * 4 + Math.abs(p.t) * p.r + (c.kind === "cirrus" ? 0.02 : 0))), 0);
  const bottom = c.parts.reduce((m, p) => Math.max(m, Math.min(c.base, p.y + (puffy ? p.r * grow : p.s * 4 + Math.abs(p.t) * p.r))), 0);
  const y0 = Math.floor(top * H) - 1;
  const w = Math.ceil((c.w + 0.01) * H) - x0;
  const h = Math.ceil(bottom * H) + 1 - y0;
  const n = w * h;
  const field = new Float32Array(n);
  const a = new Float32Array(n);
  const d = new Float32Array(n);
  const [lo, hi] = kind.edge;
  for (let j = 0;j < h; j++)
    for (let i = 0;i < w; i++) {
      const u = (x0 + i + 0.5) / H;
      const v = (y0 + j + 0.5) / H;
      const f = shapeAt(c, u, v, puffy);
      const k = j * w + i;
      field[k] = f;
      a[k] = smoothstep(lo, hi, f) * kind.alpha;
      d[k] = smoothstep(lo, 1, f);
    }
  const r = Math.max(1, Math.round(H * 0.01));
  const blurred = boxBlur(boxBlur(field, w, h, r, 1, 0), w, h, r, 0, 1);
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const nz = new Float32Array(n);
  const e = new Float32Array(n);
  const scale = H * 0.02;
  for (let j = 0;j < h; j++)
    for (let i = 0;i < w; i++) {
      const k = j * w + i;
      const gx = -(blurred[j * w + Math.min(w - 1, i + 1)] - blurred[j * w + Math.max(0, i - 1)]) * scale;
      const gy = -(blurred[Math.min(h - 1, j + 1) * w + i] - blurred[Math.max(0, j - 1) * w + i]) * scale;
      const l = Math.hypot(gx, gy, 1);
      nx[k] = gx / l;
      ny[k] = gy / l;
      nz[k] = 1 / l;
      e[k] = (1 - d[k]) ** 2 * Math.sqrt(a[k]);
    }
  return { H, w, h, x0, y0, cy: (y0 + h / 2) / H, thin: kind.thin, a, nx, ny, nz, d, e };
}
function shapeAt(c, u, v, puffy) {
  let f = -1;
  for (const p of c.parts) {
    if (puffy) {
      f = Math.max(f, 1 - ((u - p.x) ** 2 + (v - p.y) ** 2) / (p.r * p.r));
      continue;
    }
    const along = (u - p.x) / p.r;
    if (along <= -1 || along >= 1)
      continue;
    const cirrus = c.kind === "cirrus";
    const dv = v - p.y - p.t * (u - p.x) + (cirrus ? 0.02 * Math.max(0, along) ** 3 : 0);
    const s = p.s * (cirrus ? 1.3 - 0.6 * along : 0.5 + 1.1 * fbm1(u * 6 + p.x * 50, 3));
    const ends = 1 - along * along + (c.kind === "stratus" ? (fbm1(v * 60 + p.y * 90, 2) - 0.45) * 0.8 : 0);
    f = Math.max(f, ends * Math.exp(-((dv / s) ** 2)));
  }
  const seed = c.seed;
  const fray = (fbm2(u * 28 + seed, v * 28 + seed * 0.7, 3) - 0.44) * 2.4 * (1 - clamp(f, 0, 1));
  const base = c.base + (fbm1(u * 40 + seed, 3) - 0.5) * 0.008;
  if (c.kind === "cumulus")
    return (f + fray) * smoothstep(base + 0.004, base - 0.01, v);
  if (c.kind === "towering")
    return (f + fray * 0.8) * smoothstep(0.002, -0.008, v);
  if (c.kind === "ash")
    return f + fray * 1.2;
  if (c.kind === "cirrus")
    return f * clamp((fbm2(u * 5 + seed, v * 70, 3) - 0.25) * 2.6, 0, 1.3);
  if (c.kind === "wisp")
    return f * (0.55 + 0.9 * fbm2(u * 5 + seed, v * 45, 3));
  if (c.kind === "stratus")
    return f + fray * smoothstep(0, 0.2, f);
  return f * (0.6 + 0.8 * fbm2(u * 6 + seed, v * 18, 2));
}
function boxBlur(src, w, h, r, dx, dy) {
  const out = new Float32Array(src.length);
  for (let j = 0;j < h; j++)
    for (let i = 0;i < w; i++) {
      let sum = 0;
      for (let t = -r;t <= r; t++)
        sum += src[clamp(j + t * dy, 0, h - 1) * w + clamp(i + t * dx, 0, w - 1)];
      out[j * w + i] = sum / (2 * r + 1);
    }
  return out;
}
function drawCloud(hdr, W, H, s, x, y, lit, shade, rim, lx, ly, back, edge, sky, alpha) {
  const l = Math.hypot(lx, ly, 0.4);
  const Lx = lx / l;
  const Ly = ly / l;
  const Lz = 0.4 / l;
  const px = x + s.x0;
  const X0 = Math.floor(px);
  const f = px - X0;
  const Y0 = Math.round(y) + s.y0;
  const sw = s.w;
  touch(hdr, X0, Y0, X0 + sw, Y0 + s.h - 1);
  for (let j = Math.max(0, -Y0);j < Math.min(s.h, H - Y0); j++)
    for (let i = Math.max(0, -X0);i <= Math.min(sw, W - 1 - X0); i++) {
      const k = j * sw + i;
      const a = ((i < sw ? s.a[k] : 0) * (1 - f) + (i > 0 ? s.a[k - 1] : 0) * f) * alpha;
      if (a < 0.003)
        continue;
      const q = i < sw ? k : k - 1;
      const nx = s.nx[q];
      const ny = s.ny[q];
      const light = (Math.max(0, nx * Lx + ny * Ly + s.nz[q] * Lz) * (1 - sky) + (0.5 - 0.5 * ny) * sky) * (1 - 0.5 * back * s.d[q]);
      const t = light + (1 - light) * s.thin;
      const g = (back + edge) * s.e[q] * Math.max(0, nx * lx + ny * ly) * alpha;
      const o = ((Y0 + j) * W + X0 + i) * 3;
      hdr[o] += (shade[0] + (lit[0] - shade[0]) * t - hdr[o]) * a + rim[0] * g;
      hdr[o + 1] += (shade[1] + (lit[1] - shade[1]) * t - hdr[o + 1]) * a + rim[1] * g;
      hdr[o + 2] += (shade[2] + (lit[2] - shade[2]) * t - hdr[o + 2]) * a + rim[2] * g;
    }
}
function drawShadow(hdr, W, H, s, x, y, ground) {
  const px = x + s.x0;
  const X0 = Math.floor(px);
  const f = px - X0;
  const Y0 = Math.round(y) + s.y0;
  const sw = s.w;
  const fade = H * 0.03;
  touch(hdr, X0, Math.max(Y0, Math.floor(ground)), X0 + sw, Y0 + s.h - 1);
  for (let j = Math.max(0, -Y0, Math.floor(ground) - Y0);j < Math.min(s.h, H - Y0); j++) {
    const row = clamp((Y0 + j - ground) / fade, 0, 1) * 0.38;
    for (let i = Math.max(0, -X0);i <= Math.min(sw, W - 1 - X0); i++) {
      const k = j * sw + i;
      const a = ((i < sw ? s.a[k] : 0) * (1 - f) + (i > 0 ? s.a[k - 1] : 0) * f) * row;
      if (a < 0.003)
        continue;
      const o = ((Y0 + j) * W + X0 + i) * 3;
      hdr[o] *= 1 - a;
      hdr[o + 1] *= 1 - a * 0.88;
      hdr[o + 2] *= 1 - a * 0.62;
    }
  }
}
// src/wallpaper.ts
var AGENT_EVENTS = ["busy", "idle", "done", "error"];
function settingsFor(wallpaper, settings) {
  return wallpaper.fixedTime ? { ...settings, time: wallpaper.fixedTime } : settings;
}
var ACTIVITIES = ["calm", "lively", "teeming"];
var TIMES = ["day", "sunset", "night"];
var BRIGHTNESSES = ["subtle", "normal", "vivid"];
var POWERS = ["saver", "smooth"];
// src/water.ts
var wave = new Float32Array(0);
function reflect(hdr, W, H, y0, y1, rows, amp, weight, tint, time, still) {
  if (wave.length !== W)
    wave = new Float32Array(W);
  touch(hdr, 0, y0, W - 1, y1 - 1);
  for (let x = 0;x < W; x++)
    wave[x] = 2.4 * Math.sin(x / H * 9 + time * 0.35) + 1.2 * Math.sin(x / H * 23 - time * 0.6);
  for (let y = Math.max(0, y0);y < Math.min(H, y1); y++) {
    const r = y - y0;
    const a = amp[r];
    const phase = y / H * 150 + time * 1.2;
    for (let x = 0;x < W; x++) {
      const w = weight[r * W + x];
      if (w <= 0)
        continue;
      const o = (y * W + x) * 3;
      const s = (r * W + x) * 3;
      if (still && (hdr[o] !== still[s] || hdr[o + 1] !== still[s + 1] || hdr[o + 2] !== still[s + 2]))
        continue;
      const p = phase + wave[x];
      const sx = Math.min(W - 1.001, Math.max(0, x + a * Math.sin(p)));
      const sy = Math.min(H - 1, Math.max(0, Math.round(rows[r] + a * 0.6 * Math.cos(p))));
      const x0 = sx | 0;
      const f = sx - x0;
      const m = (sy * W + x0) * 3;
      hdr[o] += ((hdr[m] + (hdr[m + 3] - hdr[m]) * f) * tint[0] - hdr[o]) * w;
      hdr[o + 1] += ((hdr[m + 1] + (hdr[m + 4] - hdr[m + 1]) * f) * tint[1] - hdr[o + 1]) * w;
      hdr[o + 2] += ((hdr[m + 2] + (hdr[m + 5] - hdr[m + 2]) * f) * tint[2] - hdr[o + 2]) * w;
    }
  }
}
// src/wind.ts
var SLOT = 14;
var SPEED = 0.45;
var RISE = 1.1;
var FALL = 3.2;
var PHASE = 15.5;
function gust(x, t) {
  const s = t - x / SPEED + PHASE;
  const n = Math.floor(s / SLOT);
  const strength = hash(n * 7.31 + 2.1);
  if (strength < 0.3)
    return 0;
  const u = s - n * SLOT - hash(n * 3.17 + 0.5) * (SLOT - RISE - FALL);
  if (u <= 0 || u >= RISE + FALL)
    return 0;
  return (u < RISE ? smoothstep(0, RISE, u) : 1 - smoothstep(RISE, RISE + FALL, u)) * (0.6 + 0.4 * (strength - 0.3) / 0.7);
}
function sway(x, t, phase = 0, rate = 0.7) {
  const g = gust(x, t);
  return Math.sin(t * rate + phase) * (1 + 0.4 * g) + g * (1.65 + 0.22 * Math.sin(t * rate * 2.7 + phase * 1.7));
}

class SwayLayer {
  dir;
  before = new Float32Array(0);
  x0 = 0;
  y0 = 0;
  w = 0;
  h = 0;
  reach = 0;
  bare = new Float32Array(0);
  layer = new Float32Array(0);
  cover = new Uint8Array(0);
  weight = new Float32Array(0);
  shift = new Float32Array(0);
  top = new Int32Array(0);
  bottom = new Int32Array(0);
  constructor(dir = 1) {
    this.dir = dir;
  }
  begin(hdr) {
    this.before = hdr.slice();
  }
  end(hdr, W, H, reach, weight) {
    const before = this.before;
    this.before = new Float32Array(0);
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0;y < H; y++)
      for (let x = 0;x < W; x++) {
        const o = (y * W + x) * 3;
        if (hdr[o] === before[o] && hdr[o + 1] === before[o + 1] && hdr[o + 2] === before[o + 2])
          continue;
        if (weight(x, y) <= 0)
          continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    this.w = 0;
    if (x1 < 0)
      return;
    const pad = Math.ceil(reach) + 1;
    this.x0 = Math.max(0, x0 - pad);
    this.y0 = y0;
    this.w = Math.min(W - 1, x1 + pad) - this.x0 + 1;
    this.h = y1 - y0 + 1;
    this.reach = reach;
    const n = this.w * this.h;
    this.bare = new Float32Array(n * 3);
    this.layer = new Float32Array(n * 3);
    this.cover = new Uint8Array(n);
    this.weight = new Float32Array(n);
    this.shift = new Float32Array(this.w);
    for (let y = 0;y < this.h; y++)
      for (let x = 0;x < this.w; x++) {
        const i = y * this.w + x;
        const o = ((this.y0 + y) * W + this.x0 + x) * 3;
        for (let c = 0;c < 3; c++) {
          this.bare[i * 3 + c] = before[o + c];
          this.layer[i * 3 + c] = hdr[o + c];
        }
        this.cover[i] = hdr[o] !== before[o] || hdr[o + 1] !== before[o + 1] || hdr[o + 2] !== before[o + 2] ? 1 : 0;
        this.weight[i] = Math.max(0, weight(this.x0 + x, this.y0 + y));
      }
  }
  seal(hdr, W) {
    for (let y = 0;y < this.h; y++)
      for (let x = 0;x < this.w; x++) {
        const i = y * this.w + x;
        const o = ((this.y0 + y) * W + this.x0 + x) * 3;
        if (hdr[o] !== this.layer[i * 3] || hdr[o + 1] !== this.layer[i * 3 + 1] || hdr[o + 2] !== this.layer[i * 3 + 2])
          this.cover[i] = 2;
      }
  }
  offset(x, y) {
    const i = Math.round(x) - this.x0;
    const j = Math.round(y) - this.y0;
    if (i < 0 || j < 0 || i >= this.w || j >= this.h)
      return 0;
    return this.shift[i] * this.weight[j * this.w + i];
  }
  draw(hdr, W, H, t) {
    if (!this.w)
      return;
    let any = false;
    for (let x = 0;x < this.w; x++) {
      const u = (this.dir > 0 ? this.x0 + x : W - this.x0 - x) / H;
      const g = gust(u, t);
      this.shift[x] = this.dir * g * this.reach * (0.64 + 0.19 * Math.sin(t * 2.3 + u * 9));
      if (g > 0)
        any = true;
    }
    if (!any)
      return;
    if (this.top.length !== this.w) {
      this.top = new Int32Array(this.w);
      this.bottom = new Int32Array(this.w);
    }
    shear(hdr, W, this.x0, this.y0, this.w, this.h, this.bare, this.layer, this.cover, this.weight, this.shift, this.top, this.bottom);
    let run = -1;
    let y0 = 0;
    let y1 = 0;
    for (let x = 0;x <= this.w; x++) {
      const moved = x < this.w && this.top[x] <= this.bottom[x];
      if (moved && run < 0)
        run = x, y0 = this.top[x], y1 = this.bottom[x];
      if (moved)
        y0 = Math.min(y0, this.top[x]), y1 = Math.max(y1, this.bottom[x]);
      if (moved || run < 0)
        continue;
      touch(hdr, this.x0 + run, this.y0 + y0, this.x0 + x - 1, this.y0 + y1);
      run = -1;
    }
  }
}
function shear(hdr, W, x0, y0, w, h, bare, layer, cover, weight, shift, top, bottom) {
  top.fill(h);
  bottom.fill(-1);
  for (let y = 0;y < h; y++) {
    const row = y * w;
    for (let x = 0;x < w; x++) {
      const i = row + x;
      if (cover[i] === 2)
        continue;
      const d = shift[x] * weight[i];
      if (d < 0.02 && d > -0.02)
        continue;
      const sx = x - d;
      const xa = Math.floor(sx);
      const f = sx - xa;
      const a = xa >= 0 && cover[row + xa] ? 1 - f : 0;
      const b = xa + 1 < w && xa + 1 >= 0 && cover[row + xa + 1] ? f : 0;
      if (a + b === 0 && cover[i] === 0)
        continue;
      const o = ((y0 + y) * W + x0 + x) * 3;
      const k = 1 - a - b;
      const ia = (row + xa) * 3;
      for (let c = 0;c < 3; c++)
        hdr[o + c] = bare[i * 3 + c] * k + (a ? layer[ia + c] * a : 0) + (b ? layer[ia + 3 + c] * b : 0);
      if (y < top[x])
        top[x] = y;
      bottom[x] = y;
    }
  }
}
export {
  view,
  sway,
  sunShade,
  stride,
  stepGait,
  startle,
  smoothstep,
  reflect,
  rand,
  quadruped,
  paintStorm,
  paintStars,
  paintSky,
  paintShadows,
  paintHaze,
  paintClouds,
  noise2,
  noise1,
  mottle,
  makeStorm,
  makeStars,
  makeShadows,
  makeClouds,
  limb,
  lightPool,
  lerp,
  joint,
  hsv,
  haze,
  hashString,
  hash2,
  hash,
  gust,
  groundShadow,
  gait,
  flyAway,
  firelight,
  fireflyLight,
  fillShadow,
  fbm2,
  fbm1,
  ell,
  eggWait,
  driftClouds,
  clamp,
  chain,
  cap,
  campfire,
  body,
  bob,
  blade,
  bird,
  TIMES,
  TAU,
  SwayLayer,
  STAR_TINTS,
  LightMap,
  Canvas,
  AGENT_EVENTS,
  ACTIVITIES
};
