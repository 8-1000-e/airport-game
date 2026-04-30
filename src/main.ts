// 2D carousel skeleton — stadium-shaped track with luggage moving around it.

import { startPriceFeed } from "./priceFeed";
import { drawPriceChart } from "./chart";

const canvas = document.getElementById("carousel") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// Live SOL/USD feed via Magicblock ER + Pyth Lazer oracle
const feed = startPriceFeed();
let openPrice: number | null = null;

let width = 0;
let height = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener("resize", resize);

// ─── Carousel geometry (stadium = rectangle + 2 semi-circles) ───────────────
const TRACK = {
  straight: 360,
  radius: 180,
  trackWidth: 90,
};

function perimeter() {
  return 2 * TRACK.straight + 2 * Math.PI * TRACK.radius;
}

function stadiumPath(t: number, cx: number, cy: number) {
  const peri = perimeter();
  const d = ((t % 1) + 1) % 1 * peri;

  const sLen = TRACK.straight;
  const arc = Math.PI * TRACK.radius;
  const r = TRACK.radius;
  const halfS = sLen / 2;

  if (d < sLen) {
    const u = d / sLen;
    return { x: cx - halfS + u * sLen, y: cy - r, angle: 0 };
  }
  if (d < sLen + arc) {
    const u = (d - sLen) / arc;
    const theta = -Math.PI / 2 + u * Math.PI;
    return {
      x: cx + halfS + Math.cos(theta) * r,
      y: cy + Math.sin(theta) * r,
      angle: theta + Math.PI / 2,
    };
  }
  if (d < 2 * sLen + arc) {
    const u = (d - sLen - arc) / sLen;
    return { x: cx + halfS - u * sLen, y: cy + r, angle: Math.PI };
  }
  const u = (d - 2 * sLen - arc) / arc;
  const theta = Math.PI / 2 + u * Math.PI;
  return {
    x: cx - halfS + Math.cos(theta) * r,
    y: cy + Math.sin(theta) * r,
    angle: theta + Math.PI / 2,
  };
}

// ─── Stadium shape helper ───────────────────────────────────────────────────
function stadiumPathOnly(cx: number, cy: number, r: number) {
  const halfS = TRACK.straight / 2;
  ctx.beginPath();
  ctx.moveTo(cx - halfS, cy - r);
  ctx.lineTo(cx + halfS, cy - r);
  ctx.arc(cx + halfS, cy, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - halfS, cy + r);
  ctx.arc(cx - halfS, cy, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
}

function drawStadiumRing(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  fill: string,
) {
  const halfS = TRACK.straight / 2;
  ctx.beginPath();
  ctx.moveTo(cx - halfS, cy - rOuter);
  ctx.lineTo(cx + halfS, cy - rOuter);
  ctx.arc(cx + halfS, cy, rOuter, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - halfS, cy + rOuter);
  ctx.arc(cx - halfS, cy, rOuter, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.moveTo(cx - halfS, cy - rInner);
  ctx.arc(cx - halfS, cy, rInner, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(cx + halfS, cy + rInner);
  ctx.arc(cx + halfS, cy, rInner, Math.PI / 2, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill("evenodd");
}

// ─── Track rendering ────────────────────────────────────────────────────────
function drawTrack(cx: number, cy: number, beltT: number) {
  const rOuter = TRACK.radius + TRACK.trackWidth / 2;
  const rInner = TRACK.radius - TRACK.trackWidth / 2;

  // Outer rim (dark frame)
  drawStadiumRing(cx, cy, rOuter + 10, rOuter, "#15151c");

  // Belt surface — dark gray
  drawStadiumRing(cx, cy, rOuter, rInner, "#26262e");

  // Belt segmentation lines (slats) — offset by beltT so the belt visually
  // moves at the same rate as the luggage on top of it.
  const slatCount = 60;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i < slatCount; i++) {
    const t = (i / slatCount + beltT) % 1;
    const inner = stadiumPath(t, cx, cy);
    // Compute outer/inner endpoints perpendicular to direction of travel
    const nx = Math.cos(inner.angle - Math.PI / 2);
    const ny = Math.sin(inner.angle - Math.PI / 2);
    const halfW = TRACK.trackWidth / 2;
    ctx.beginPath();
    ctx.moveTo(inner.x + nx * halfW, inner.y + ny * halfW);
    ctx.lineTo(inner.x - nx * halfW, inner.y - ny * halfW);
    ctx.stroke();
  }

  // Inner edge highlight
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1.5;
  stadiumPathOnly(cx, cy, rInner);
  ctx.stroke();

  // Outer edge highlight
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1.5;
  stadiumPathOnly(cx, cy, rOuter);
  ctx.stroke();

  // Inner platform (the gray "island" in the middle)
  ctx.save();
  stadiumPathOnly(cx, cy, rInner - 4);
  ctx.fillStyle = "#1c1c24";
  ctx.fill();
  ctx.strokeStyle = "#2e2e3a";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// ─── Luggage ────────────────────────────────────────────────────────────────
const LUGGAGE_COLORS = [
  "#e8d4b0", // beige
  "#e83a8b", // hot pink
  "#9333ea", // purple
  "#10b981", // green
  "#c2873a", // orange/brown
  "#f59e0b", // amber
  "#ec4899", // pink
  "#84cc16", // lime
];

type BagType = "hard" | "duffle" | "backpack" | "briefcase";

interface Luggage {
  t: number;
  speed: number;
  color: string;
  multiplier: number;
  size: number;
  type: BagType;
}

const luggage: Luggage[] = [];
const COUNT = 10;
const MULTIPLIERS = [0.6, 0.8, 0.9, 1.2, 1.5, 1.8, 2.0, 2.5, 3.0, 3.5];
const TYPES: BagType[] = ["hard", "duffle", "backpack", "briefcase"];

for (let i = 0; i < COUNT; i++) {
  luggage.push({
    t: i / COUNT,
    speed: 0.04,
    color: LUGGAGE_COLORS[i % LUGGAGE_COLORS.length],
    multiplier: MULTIPLIERS[i % MULTIPLIERS.length],
    size: 60,
    type: TYPES[i % TYPES.length],
  });
}

function shadeColor(hex: string, factor: number): string {
  const c = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((c & 0xff) * factor)));
  return `rgb(${r},${g},${b})`;
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

// ─── Bag variants ───────────────────────────────────────────────────────────
function drawHardCase(s: number, color: string) {
  const w = s;
  const h = s;
  const dark = shadeColor(color, 0.6);
  const light = shadeColor(color, 1.15);

  // Body
  ctx.fillStyle = color;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, 8);
  ctx.fill();
  ctx.stroke();

  // Vertical grooves (3 lines)
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    const x = i * (w * 0.22);
    ctx.beginPath();
    ctx.moveTo(x, -h / 2 + 6);
    ctx.lineTo(x, h / 2 - 6);
    ctx.stroke();
  }

  // Top reflection
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, -w / 2 + 5, -h / 2 + 4, w - 10, h * 0.22, 5);
  ctx.fill();

  // Latch (small square)
  ctx.fillStyle = "#d4a85a";
  ctx.fillRect(-w * 0.08, h * 0.32, w * 0.16, h * 0.1);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeRect(-w * 0.08, h * 0.32, w * 0.16, h * 0.1);

  // Side handle
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, -h / 2 - 1, w * 0.18, Math.PI, 0);
  ctx.stroke();
  // Handle base anchors
  ctx.fillStyle = dark;
  ctx.fillRect(-w * 0.2, -h / 2 - 2, 4, 4);
  ctx.fillRect(w * 0.2 - 4, -h / 2 - 2, 4, 4);

  // Wheels (bottom corners)
  ctx.fillStyle = "#1a1a24";
  ctx.beginPath();
  ctx.arc(-w * 0.35, h / 2 + 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.35, h / 2 + 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Color highlight on left
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(-w / 2 + 5, -h / 2 + 8, 3, h - 16);
  ctx.globalAlpha = 1;
}

function drawDuffle(s: number, color: string) {
  const w = s * 1.05;
  const h = s * 0.78;
  const dark = shadeColor(color, 0.6);
  const light = shadeColor(color, 1.15);

  // Body — capsule
  ctx.fillStyle = color;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();

  // Top zipper line
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + h / 2, -2);
  ctx.lineTo(w / 2 - h / 2, -2);
  ctx.stroke();
  // Zipper teeth
  ctx.lineWidth = 1;
  for (let x = -w / 2 + h / 2; x < w / 2 - h / 2; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, -4);
    ctx.lineTo(x, 0);
    ctx.stroke();
  }

  // Handles (two arcs above)
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(-w * 0.18, -h / 2, w * 0.1, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w * 0.18, -h / 2, w * 0.1, Math.PI, 0);
  ctx.stroke();
  // Handle binding
  ctx.fillStyle = dark;
  ctx.fillRect(-w * 0.32, -h / 2 - 2, w * 0.28, 3);
  ctx.fillRect(w * 0.04, -h / 2 - 2, w * 0.28, 3);

  // Top highlight
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.3;
  roundRect(ctx, -w / 2 + 6, -h / 2 + 4, w - 12, h * 0.18, h * 0.1);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBackpack(s: number, color: string) {
  const w = s * 0.78;
  const h = s * 0.95;
  const dark = shadeColor(color, 0.6);
  const light = shadeColor(color, 1.15);

  // Body
  ctx.fillStyle = color;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, 12);
  ctx.fill();
  ctx.stroke();

  // Front pocket (lower half)
  ctx.fillStyle = shadeColor(color, 0.85);
  ctx.strokeStyle = dark;
  roundRect(ctx, -w / 2 + 5, h * 0.05, w - 10, h * 0.42, 6);
  ctx.fill();
  ctx.stroke();
  // Pocket zip
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 8, h * 0.08);
  ctx.lineTo(w / 2 - 8, h * 0.08);
  ctx.stroke();

  // Top loop handle
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, -h / 2, w * 0.12, Math.PI, 0);
  ctx.stroke();

  // Logo patch
  ctx.fillStyle = light;
  roundRect(ctx, -w * 0.12, -h * 0.18, w * 0.24, h * 0.1, 2);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Side highlight
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(-w / 2 + 6, -h / 2 + 8, 3, h * 0.4);
}

function drawBriefcase(s: number, color: string) {
  const w = s * 1.05;
  const h = s * 0.7;
  const dark = shadeColor(color, 0.55);
  const light = shadeColor(color, 1.2);

  // Body
  ctx.fillStyle = color;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.fill();
  ctx.stroke();

  // Top binding line (where the case opens)
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 4, -h * 0.1);
  ctx.lineTo(w / 2 - 4, -h * 0.1);
  ctx.stroke();

  // Two gold latches
  ctx.fillStyle = "#e3b34a";
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1;
  const latchW = w * 0.1;
  const latchH = h * 0.18;
  ctx.fillRect(-w * 0.28, -h * 0.18, latchW, latchH);
  ctx.strokeRect(-w * 0.28, -h * 0.18, latchW, latchH);
  ctx.fillRect(w * 0.18, -h * 0.18, latchW, latchH);
  ctx.strokeRect(w * 0.18, -h * 0.18, latchW, latchH);

  // Top leather handle
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -h / 2, w * 0.16, Math.PI, 0);
  ctx.stroke();

  // Stitching outline
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  roundRect(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 3);
  ctx.stroke();
  ctx.setLineDash([]);

  // Highlight
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.25;
  roundRect(ctx, -w / 2 + 6, -h / 2 + 4, w - 12, h * 0.18, 3);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawLuggage(lug: Luggage, cx: number, cy: number) {
  const { x, y, angle } = stadiumPath(lug.t, cx, cy);
  const s = lug.size;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Drop shadow under bag
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.5, s * 0.55, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  switch (lug.type) {
    case "hard": drawHardCase(s, lug.color); break;
    case "duffle": drawDuffle(s, lug.color); break;
    case "backpack": drawBackpack(s, lug.color); break;
    case "briefcase": drawBriefcase(s, lug.color); break;
  }

  ctx.restore();

  // Multiplier label (upright, outside the track)
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy) || 1;
  const labelOffset = TRACK.trackWidth * 0.55 + 18;
  const tx = x + (dx / dist) * labelOffset;
  const ty = y + (dy / dist) * labelOffset;
  ctx.fillText(`${lug.multiplier}x`, tx, ty);
  ctx.restore();
}

// ─── Animate ────────────────────────────────────────────────────────────────
let last = performance.now();
let beltT = 0; // belt phase, advances at the same rate as the luggage

function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;

  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;

  // Advance belt at the luggage cruise speed so slats move with the bags.
  beltT = (beltT + 0.04 * dt) % 1;

  drawTrack(cx, cy, beltT);

  // Price chart fills the entire inner stadium platform (oval shape).
  const price = feed.current();
  if (openPrice === null && price !== null) openPrice = price;
  const rInner = TRACK.radius - TRACK.trackWidth / 2 - 4;
  drawPriceChart(
    ctx,
    {
      cx,
      cy,
      straight: TRACK.straight,
      rInner,
    },
    {
      price,
      history: feed.history(),
      open: openPrice,
    },
  );

  for (const lug of luggage) {
    lug.t = (lug.t + lug.speed * dt) % 1;
    drawLuggage(lug, cx, cy);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
