// Industrial robotic claw arm — pivots around a fixed base on the right side
// of the carousel, swinging from "pickup" to "drop" positions.

export type ClawPhase =
  | "idle"
  | "closing"
  | "lifting"
  | "dropping"
  | "returning";

export interface ClawState {
  phase: ClawPhase;
  phaseStart: number;
  grabbedBagId: number | null;
}

export function makeClawState(): ClawState {
  return { phase: "idle", phaseStart: 0, grabbedBagId: null };
}

export interface ClawTargets {
  pivot: { x: number; y: number };
  armLength: number;
  bagAttachDist: number; // beyond the arm end, along arm direction
  idleAngle: number;
  dropAngle: number;
}

export interface ClawRender {
  pivot: { x: number; y: number };
  armLength: number;
  armAngle: number;
  prongOpen: number; // 0 closed, 1 fully open
  /** World position of the bag held in the claw. */
  bagPos: { x: number; y: number };
}

const CLOSING_MS = 220;
const LIFTING_MS = 600;
const DROPPING_MS = 220;
const RETURNING_MS = 550;

const ARM_THICKNESS = 14;
const HOUSING_W = 38;
const HOUSING_H = 22;
const PRONG_LEN = 22;
const PRONG_THICK = 6;
const PIVOT_R = 14;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Returns the world position where the claw will grip a bag at idle. */
export function getPickPosition(targets: ClawTargets): { x: number; y: number } {
  const armEndX = targets.pivot.x + Math.cos(targets.idleAngle) * targets.armLength;
  const armEndY = targets.pivot.y + Math.sin(targets.idleAngle) * targets.armLength;
  return {
    x: armEndX + Math.cos(targets.idleAngle) * targets.bagAttachDist,
    y: armEndY + Math.sin(targets.idleAngle) * targets.bagAttachDist,
  };
}

export function updateClaw(
  state: ClawState,
  now: number,
  targets: ClawTargets,
): ClawRender {
  const elapsed = now - state.phaseStart;
  let armAngle = targets.idleAngle;
  let prongOpen = 1;

  switch (state.phase) {
    case "idle":
      break;
    case "closing": {
      const t = Math.min(1, elapsed / CLOSING_MS);
      prongOpen = 1 - t;
      if (t >= 1) {
        state.phase = "lifting";
        state.phaseStart = now;
      }
      break;
    }
    case "lifting": {
      const t = Math.min(1, elapsed / LIFTING_MS);
      const e = easeInOutCubic(t);
      armAngle = targets.idleAngle + (targets.dropAngle - targets.idleAngle) * e;
      prongOpen = 0;
      if (t >= 1) {
        state.phase = "dropping";
        state.phaseStart = now;
      }
      break;
    }
    case "dropping": {
      const t = Math.min(1, elapsed / DROPPING_MS);
      armAngle = targets.dropAngle;
      prongOpen = Math.max(0, easeOutBack(t));
      if (t >= 1) {
        state.phase = "returning";
        state.phaseStart = now;
        state.grabbedBagId = null;
      }
      break;
    }
    case "returning": {
      const t = Math.min(1, elapsed / RETURNING_MS);
      const e = easeInOutCubic(t);
      armAngle = targets.dropAngle + (targets.idleAngle - targets.dropAngle) * e;
      prongOpen = 1;
      if (t >= 1) {
        state.phase = "idle";
        state.phaseStart = now;
      }
      break;
    }
  }

  const armEndX = targets.pivot.x + Math.cos(armAngle) * targets.armLength;
  const armEndY = targets.pivot.y + Math.sin(armAngle) * targets.armLength;
  const bagPos = {
    x: armEndX + Math.cos(armAngle) * targets.bagAttachDist,
    y: armEndY + Math.sin(armAngle) * targets.bagAttachDist,
  };

  return {
    pivot: targets.pivot,
    armLength: targets.armLength,
    armAngle,
    prongOpen,
    bagPos,
  };
}

export function triggerPick(
  state: ClawState,
  now: number,
  bagId: number,
): boolean {
  if (state.phase !== "idle") return false;
  state.phase = "closing";
  state.phaseStart = now;
  state.grabbedBagId = bagId;
  return true;
}

// ─── Rendering ──────────────────────────────────────────────────────────────
export function drawClaw(
  ctx: CanvasRenderingContext2D,
  render: ClawRender,
) {
  const { pivot, armLength, armAngle, prongOpen } = render;
  const armEndX = pivot.x + Math.cos(armAngle) * armLength;
  const armEndY = pivot.y + Math.sin(armAngle) * armLength;

  // ─── Arm ──────────────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(armAngle);

  // Body
  const armGrad = ctx.createLinearGradient(0, -ARM_THICKNESS / 2, 0, ARM_THICKNESS / 2);
  armGrad.addColorStop(0, "#a1a8b3");
  armGrad.addColorStop(0.5, "#6b7280");
  armGrad.addColorStop(1, "#2f3744");
  ctx.fillStyle = armGrad;
  roundRectPath(ctx, -2, -ARM_THICKNESS / 2, armLength + 4, ARM_THICKNESS, 5);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center stripe
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(armLength, 0);
  ctx.stroke();

  // Bolt rivets along the arm
  ctx.fillStyle = "#1f2937";
  for (let i = 1; i <= 3; i++) {
    const px = (armLength / 4) * i;
    ctx.beginPath();
    ctx.arc(px, -ARM_THICKNESS / 2 + 3, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, ARM_THICKNESS / 2 - 3, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ─── Pivot base (drawn ON TOP of the arm root) ───────────────────────────
  // Outer ring
  const pivGrad = ctx.createRadialGradient(
    pivot.x - 3,
    pivot.y - 3,
    0,
    pivot.x,
    pivot.y,
    PIVOT_R,
  );
  pivGrad.addColorStop(0, "#9ca3af");
  pivGrad.addColorStop(1, "#374151");
  ctx.fillStyle = pivGrad;
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, PIVOT_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 2;
  ctx.stroke();
  // Inner disc
  ctx.fillStyle = "#4b5563";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, PIVOT_R * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Center bolt + cross slots
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pivot.x - 4, pivot.y);
  ctx.lineTo(pivot.x + 4, pivot.y);
  ctx.moveTo(pivot.x, pivot.y - 4);
  ctx.lineTo(pivot.x, pivot.y + 4);
  ctx.stroke();

  // ─── Claw end-effector at the arm tip ─────────────────────────────────────
  ctx.save();
  ctx.translate(armEndX, armEndY);
  // Rotate so the housing's "down" (local +y) faces along the arm direction
  // (i.e., outward from the pivot).
  ctx.rotate(armAngle - Math.PI / 2);
  drawHousingAndProngs(ctx, prongOpen);
  ctx.restore();
}

function drawHousingAndProngs(
  ctx: CanvasRenderingContext2D,
  prongOpen: number,
) {
  // Housing
  const houseGrad = ctx.createLinearGradient(0, -HOUSING_H / 2, 0, HOUSING_H / 2);
  houseGrad.addColorStop(0, "#9ca3af");
  houseGrad.addColorStop(0.5, "#6b7280");
  houseGrad.addColorStop(1, "#374151");
  ctx.fillStyle = houseGrad;
  roundRectPath(ctx, -HOUSING_W / 2, -HOUSING_H / 2, HOUSING_W, HOUSING_H, 5);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Top highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  roundRectPath(
    ctx,
    -HOUSING_W / 2 + 4,
    -HOUSING_H / 2 + 3,
    HOUSING_W - 8,
    3,
    1.5,
  );
  ctx.fill();

  // Hydraulic ports / lights at the top
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.arc(-HOUSING_W / 2 + 6, -HOUSING_H / 2 + 4, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(HOUSING_W / 2 - 6, -HOUSING_H / 2 + 4, 1.4, 0, Math.PI * 2);
  ctx.fill();

  // Prongs pivot at the bottom of the housing
  const pivotY = HOUSING_H / 2;
  const leftPivotX = -HOUSING_W / 2 + 5;
  const rightPivotX = HOUSING_W / 2 - 5;
  const maxAngle = Math.PI / 5;
  const prongAngle = maxAngle * prongOpen;

  drawProng(ctx, leftPivotX, pivotY, -prongAngle, true);
  drawProng(ctx, rightPivotX, pivotY, prongAngle, false);
}

function drawProng(
  ctx: CanvasRenderingContext2D,
  pivotX: number,
  pivotY: number,
  angle: number,
  isLeft: boolean,
) {
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(angle);

  const grad = ctx.createLinearGradient(-PRONG_THICK / 2, 0, PRONG_THICK / 2, 0);
  grad.addColorStop(0, "#9ca3af");
  grad.addColorStop(0.5, "#cbd5e1");
  grad.addColorStop(1, "#475569");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-PRONG_THICK / 2, 0);
  ctx.lineTo(PRONG_THICK / 2, 0);
  ctx.lineTo(PRONG_THICK / 2 - 1, PRONG_LEN * 0.85);
  const inward = isLeft ? 4 : -4;
  ctx.lineTo(PRONG_THICK / 2 + inward, PRONG_LEN);
  ctx.lineTo(-PRONG_THICK / 2 + inward, PRONG_LEN);
  ctx.lineTo(-PRONG_THICK / 2 + 1, PRONG_LEN * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.fillRect(-PRONG_THICK / 2 + 1, 1, 1.5, PRONG_LEN * 0.7);

  // Pivot bolt
  ctx.fillStyle = "#374151";
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.restore();
}

// ─── Delivery box drawing ───────────────────────────────────────────────────
export function drawDeliveryBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
) {
  const w = 80;
  const h = 56;
  const x = cx - w / 2;
  const y = cy - h / 2;

  const bodyGrad = ctx.createLinearGradient(0, y, 0, y + h);
  bodyGrad.addColorStop(0, "#1f2937");
  bodyGrad.addColorStop(1, "#0f172a");
  ctx.fillStyle = bodyGrad;
  roundRectPath(ctx, x, y, w, h, 6);
  ctx.fill();

  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  roundRectPath(ctx, x + 4, y + 4, w - 8, 8, 3);
  ctx.fill();

  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#fbbf24";
  ctx.shadowBlur = 12;
  roundRectPath(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "#fde68a";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  const cornerLen = 9;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + cornerLen + 4);
  ctx.lineTo(x + 4, y + 4);
  ctx.lineTo(x + cornerLen + 4, y + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w - cornerLen - 4, y + 4);
  ctx.lineTo(x + w - 4, y + 4);
  ctx.lineTo(x + w - 4, y + cornerLen + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 4, y + h - cornerLen - 4);
  ctx.lineTo(x + 4, y + h - 4);
  ctx.lineTo(x + cornerLen + 4, y + h - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w - cornerLen - 4, y + h - 4);
  ctx.lineTo(x + w - 4, y + h - 4);
  ctx.lineTo(x + w - 4, y + h - cornerLen - 4);
  ctx.stroke();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
