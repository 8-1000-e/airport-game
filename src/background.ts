// Animated airport background — bright polished tile floor + ceiling-light pools.

interface CeilingLight {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  pulsePhase: number;
}

let lights: CeilingLight[] = [];
let initWidth = 0;
let initHeight = 0;
let initialized = false;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

interface CarouselBounds {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

const TILE = 96;
const TILE_VARIANTS = ["#3e3846", "#3a3442", "#36303e", "#322c3a"];

function tileHash(ix: number, iy: number): number {
  const v = Math.sin(ix * 12.9898 + iy * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function spawn(width: number, height: number, _bounds: CarouselBounds) {
  lights = [];
  // Ceiling-light pools — warm patches of brighter floor that pulse slowly
  for (let i = 0; i < 8; i++) {
    lights.push({
      x: rand(60, width - 60),
      y: rand(60, height - 60),
      radius: rand(160, 260),
      intensity: rand(0.08, 0.16),
      pulsePhase: Math.random() * Math.PI * 2,
    });
  }
}

function drawTileFloor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const cols = Math.ceil(width / TILE) + 1;
  const rows = Math.ceil(height / TILE) + 1;

  // ─── Each tile: solid color (with per-tile variation) ─────────────────
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const px = tx * TILE;
      const py = ty * TILE;
      const hash = tileHash(tx, ty);
      const color = TILE_VARIANTS[Math.floor(hash * TILE_VARIANTS.length)];
      ctx.fillStyle = color;
      ctx.fillRect(px, py, TILE, TILE);
    }
  }

  // ─── Polished sheen: each tile gets a soft glossy highlight in the
  // upper-left, like overhead lighting hits each tile from that direction ─
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const px = tx * TILE;
      const py = ty * TILE;
      const grad = ctx.createRadialGradient(
        px + TILE * 0.3,
        py + TILE * 0.3,
        0,
        px + TILE * 0.3,
        py + TILE * 0.3,
        TILE * 0.9,
      );
      grad.addColorStop(0, "rgba(255, 245, 230, 0.09)");
      grad.addColorStop(1, "rgba(255, 245, 230, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, TILE, TILE);
    }
  }

  // ─── Bevel highlight: 1px lighter line on top + left edge of each tile ─
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = TILE; x < width; x += TILE) {
    ctx.moveTo(x + 1, 0);
    ctx.lineTo(x + 1, height);
  }
  for (let y = TILE; y < height; y += TILE) {
    ctx.moveTo(0, y + 1);
    ctx.lineTo(width, y + 1);
  }
  ctx.stroke();

  // ─── Dark grout lines on top (cleanly separates tiles) ────────────────
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let x = TILE; x < width; x += TILE) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = TILE; y < height; y += TILE) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  // ─── Scratches / scuffs: a couple of short faint dark lines per few tiles ─
  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const h = tileHash(tx + 7, ty + 11);
      if (h < 0.18) {
        const px = tx * TILE;
        const py = ty * TILE;
        const sx = px + 10 + h * 50;
        const sy = py + 20 + h * 40;
        const angle = h * Math.PI * 2;
        const len = 14 + h * 18;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
      }
    }
  }
  ctx.stroke();
}

function drawCeilingLights(
  ctx: CanvasRenderingContext2D,
  now: number,
) {
  for (const l of lights) {
    const pulse = 0.7 + 0.3 * Math.sin(now / 1500 + l.pulsePhase);
    const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
    grad.addColorStop(0, `rgba(255, 235, 180, ${l.intensity * pulse})`);
    grad.addColorStop(1, "rgba(255, 235, 180, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const vGrad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.5,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.85,
  );
  vGrad.addColorStop(0, "rgba(0,0,0,0)");
  vGrad.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, width, height);
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  _dt: number,
  now: number,
  bounds: CarouselBounds,
) {
  if (!initialized || initWidth !== width || initHeight !== height) {
    spawn(width, height, bounds);
    initWidth = width;
    initHeight = height;
    initialized = true;
  }

  drawTileFloor(ctx, width, height);
  drawCeilingLights(ctx, now);
  drawVignette(ctx, width, height);
}
