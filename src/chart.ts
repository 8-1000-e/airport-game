import type { PricePoint } from "./priceFeed";

const HISTORY_WINDOW_MS = 60_000;
const RANGE_PADDING = 0.00000005;
const VERTICAL_INSET_RATIO = 0.14;

export interface StadiumArea {
  cx: number;
  cy: number;
  straight: number; // length of the straight section
  rInner: number;   // radius of the rounded ends
}

export interface ChartData {
  price: number | null;
  history: PricePoint[];
  open?: number | null;
}

function clipStadium(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfS: number,
  rInner: number,
) {
  ctx.beginPath();
  ctx.moveTo(cx - halfS, cy - rInner);
  ctx.lineTo(cx + halfS, cy - rInner);
  ctx.arc(cx + halfS, cy, rInner, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - halfS, cy + rInner);
  ctx.arc(cx - halfS, cy, rInner, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.clip();
}

export function drawPriceChart(
  ctx: CanvasRenderingContext2D,
  area: StadiumArea,
  data: ChartData,
) {
  const { cx, cy, straight, rInner } = area;
  const { price, history } = data;
  const halfS = straight / 2;
  const stadiumLeft = cx - halfS - rInner;
  const stadiumRight = cx + halfS + rInner;
  const stadiumTop = cy - rInner;
  const stadiumBottom = cy + rInner;
  const stadiumW = stadiumRight - stadiumLeft;
  const stadiumH = stadiumBottom - stadiumTop;

  // ALL chart drawing is clipped to the stadium so it fills the oval shape.
  // A small leftward shift keeps the line / current-price dot away from the
  // narrow right tip where the carousel curve would otherwise visually clip them.
  const SHIFT_LEFT = 290;
  ctx.save();
  clipStadium(ctx, cx, cy, halfS, rInner);
  ctx.translate(-SHIFT_LEFT, 0);

  const now = Date.now();
  const windowStart = now - HISTORY_WINDOW_MS;

  // Visible points + virtual tip at "now"
  const pts = history.filter((pt) => pt.timestamp >= windowStart);
  if (pts.length > 0) {
    const lastPt = pts[pts.length - 1];
    if (now - lastPt.timestamp > 50) {
      pts.push({ price: lastPt.price, timestamp: now });
    }
  }

  // Same range computation as red-light: tight pad, lets the line span min→max.
  let range: { min: number; max: number } | null = null;
  if (pts.length > 0 || price !== null) {
    const prices = pts.map((p) => p.price);
    if (price !== null) prices.push(price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = Math.max((max - min) * 0.001, (min || 80) * RANGE_PADDING);
    range = { min: min - pad, max: max + pad };
  }

  // Plot uses the FULL stadium bounding box — line and fill extend edge to edge,
  // the clip naturally trims them to the oval curves.
  const plotTop = stadiumTop + stadiumH * VERTICAL_INSET_RATIO;
  const plotBottom = stadiumBottom - stadiumH * VERTICAL_INSET_RATIO;
  const plotH = plotBottom - plotTop;

  // ─── Header (SOL/USD + big price) ─────────────────────────────────────────
  // Positioned in the upper-left "safe" zone — inside the straight section,
  // never in the curved end.
  const headerX = cx - halfS + 16;
  ctx.fillStyle = "#9ca3af";
  ctx.font = "bold 13px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("SOL / USD", headerX, stadiumTop + 18);

  if (price !== null) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px -apple-system, sans-serif";
    ctx.fillText(price.toFixed(2), headerX, stadiumTop + 36);
  }

  if (!range || pts.length < 2) {
    if (price === null) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Connecting to Pyth feed…", cx, cy);
    }
    ctx.restore();
    return;
  }

  const priceToY = (p: number) => {
    const ratio = (range!.max - p) / (range!.max - range!.min);
    return plotTop + ratio * plotH;
  };
  const timeToX = (t: number) => {
    return stadiumLeft + ((t - windowStart) / HISTORY_WINDOW_MS) * stadiumW;
  };

  // ─── Grid lines (no Y labels) ─────────────────────────────────────────────
  const steps = 5;
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= steps; i++) {
    const py = plotTop + (plotH / steps) * i;
    ctx.beginPath();
    ctx.moveTo(stadiumLeft, py);
    ctx.lineTo(stadiumRight, py);
    ctx.stroke();
  }

  // ─── Trend color ──────────────────────────────────────────────────────────
  const first = pts[0].price;
  const lastP = pts[pts.length - 1].price;
  const goingUp = lastP >= first;
  const lineColor = goingUp ? "#22c55e" : "#ef4444";
  const fillRgb = goingUp ? "rgba(34, 197, 94, " : "rgba(239, 68, 68, ";

  // ─── Gradient fill under curve ────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  grad.addColorStop(0, fillRgb + "0.30)");
  grad.addColorStop(1, fillRgb + "0.0)");

  ctx.beginPath();
  ctx.moveTo(timeToX(pts[0].timestamp), plotBottom);
  for (const pt of pts) {
    ctx.lineTo(timeToX(pt.timestamp), priceToY(pt.price));
  }
  ctx.lineTo(timeToX(pts[pts.length - 1].timestamp), plotBottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // ─── Glow ─────────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.strokeStyle = fillRgb + "0.35)";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 0; i < pts.length; i++) {
    const px = timeToX(pts[i].timestamp);
    const py = priceToY(pts[i].price);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // ─── Main line ────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 0; i < pts.length; i++) {
    const px = timeToX(pts[i].timestamp);
    const py = priceToY(pts[i].price);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // ─── Current price dot ────────────────────────────────────────────────────
  const lastPt = pts[pts.length - 1];
  const lx = timeToX(lastPt.timestamp);
  const ly = priceToY(lastPt.price);
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lx, ly, 9, 0, Math.PI * 2);
  ctx.strokeStyle = fillRgb + "0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}
