// Direction chevrons — laid out along an arc that follows the curved right
// edge of the inner stadium platform. Each chevron is rotated so its tip
// points along the local tangent of the arc, like the directional arrows on
// an airport carousel.

export interface ArrowState {
  chargeUp: number;
  chargeDown: number;
  flashUpStart: number;
  flashDownStart: number;
}

export interface ChevronArc {
  cx: number;       // arc center x
  cy: number;       // arc center y
  radius: number;   // chevron placement radius (along the arc)
}

export const FLASH_DURATION_MS = 450;

interface Palette {
  dim: string;
  mid: string;
  bright: string;
}

const PALETTE_UP: Palette = {
  dim: "#155e75",
  mid: "#22d3ee",
  bright: "#a5f3fc",
};
const PALETTE_DOWN: Palette = {
  dim: "#831843",
  mid: "#ec4899",
  bright: "#fbcfe8",
};

const CHEVRON_COUNT = 6;
const CHEVRON_W = 30;            // width perpendicular to the arc tangent (radial extent)
const CHEVRON_TIP_H = 14;        // tip-to-base depth (along tangent)
const CHEVRON_THICKNESS = 5;
const ARC_STEP = 0.21;           // angular distance (radians) between chevron centers
const ARC_FOOT_GAP = 0.28;       // angular gap above/below the arc center for the foot of each set

export function makeArrowState(): ArrowState {
  return {
    chargeUp: 0,
    chargeDown: 0,
    flashUpStart: -Infinity,
    flashDownStart: -Infinity,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function rgb(hex: string): [number, number, number] {
  const c = parseInt(hex.slice(1), 16);
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Draws a chevron at the local origin in the active transform. The chevron's
 * "tip" points toward -y in local space; "base" toward +y. Width is along x.
 */
function drawChevronLocal(
  ctx: CanvasRenderingContext2D,
  isUp: boolean,
) {
  const halfW = CHEVRON_W / 2;
  const halfH = CHEVRON_TIP_H / 2;
  ctx.beginPath();
  if (isUp) {
    ctx.moveTo(-halfW, halfH);
    ctx.lineTo(0, -halfH);
    ctx.lineTo(halfW, halfH);
  } else {
    ctx.moveTo(-halfW, -halfH);
    ctx.lineTo(0, halfH);
    ctx.lineTo(halfW, -halfH);
  }
}

// ─── One chevron set, distributed along an arc ──────────────────────────────
function drawChevronArcSet(
  ctx: CanvasRenderingContext2D,
  arc: ChevronArc,
  isUp: boolean,
  charge: number,
  flashStart: number,
  pal: Palette,
  now: number,
  isActive: boolean,
) {
  const flashElapsed = now - flashStart;
  const flashing =
    flashElapsed >= 0 && flashElapsed < FLASH_DURATION_MS;
  const flashT = flashing ? flashElapsed / FLASH_DURATION_MS : -1;
  const visualCharge = flashing ? 1 : charge;

  // Foot angle on the arc (slightly offset from the rightmost middle point so
  // the up + down sets don't overlap at theta=0).
  // Up set: foot at theta = -ARC_FOOT_GAP, tip at -(ARC_FOOT_GAP + (N-1)*ARC_STEP)
  // Down set: mirror over the horizontal axis.
  const dirSign = isUp ? -1 : 1;
  const thetaFoot = dirSign * ARC_FOOT_GAP;
  const thetaTip = thetaFoot + dirSign * (CHEVRON_COUNT - 1) * ARC_STEP;
  // Centroid of the arc (used as the flash burst origin / halo center)
  const thetaCentroid = (thetaFoot + thetaTip) / 2;
  const centroidX = arc.cx + arc.radius * Math.cos(thetaCentroid);
  const centroidY = arc.cy + arc.radius * Math.sin(thetaCentroid);

  // Scale bump during flash
  const scale = flashing ? 1 + Math.sin(Math.PI * flashT) * 0.16 : 1;
  ctx.save();
  ctx.translate(centroidX, centroidY);
  ctx.scale(scale, scale);
  ctx.translate(-centroidX, -centroidY);

  // ─── Outer halo, centered on the arc centroid ─────────────────────────────
  const haloIntensity =
    visualCharge * 0.55 + (flashing ? (1 - flashT) * 0.7 : 0);
  if (haloIntensity > 0.04) {
    const haloR = arc.radius * 0.55 + (flashing ? flashT * 30 : 0);
    const haloGrad = ctx.createRadialGradient(
      centroidX,
      centroidY,
      0,
      centroidX,
      centroidY,
      haloR,
    );
    haloGrad.addColorStop(0, withAlpha(pal.mid, haloIntensity * 0.4));
    haloGrad.addColorStop(0.6, withAlpha(pal.dim, haloIntensity * 0.18));
    haloGrad.addColorStop(1, withAlpha(pal.dim, 0));
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(centroidX, centroidY, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Running light: a pulse that travels foot → tip on the active set, telling
  // the user which direction the carousel is currently rotating.
  const RUNNER_PERIOD_MS = 1100;
  const runnerPos = isActive
    ? ((now % RUNNER_PERIOD_MS) / RUNNER_PERIOD_MS) * (CHEVRON_COUNT + 1.5)
    : -10;

  // ─── Each chevron along the arc ───────────────────────────────────────────
  // Foot (i=0) lights first; tip (i=N-1) lights last.
  for (let i = 0; i < CHEVRON_COUNT; i++) {
    const theta = thetaFoot + dirSign * i * ARC_STEP;
    const x = arc.cx + arc.radius * Math.cos(theta);
    const y = arc.cy + arc.radius * Math.sin(theta);
    const rotation = theta;

    const litness = Math.max(0, Math.min(1, visualCharge * CHEVRON_COUNT - i));
    const isCrest = litness > 0 && litness < 1;

    // Running-light intensity for this chevron (active-set indicator).
    // Triangular pulse around runnerPos with width 1.4 chevrons.
    const dist = Math.abs(runnerPos - i);
    const pulse = isActive && dist <= 1.4 ? Math.max(0, 1 - dist / 1.4) : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // Dim outline (always visible) — slightly brighter for the active set
    drawChevronLocal(ctx, isUp);
    ctx.strokeStyle = withAlpha(pal.dim, isActive ? 0.85 : 0.5);
    ctx.lineWidth = CHEVRON_THICKNESS;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Running-light pulse layer (active set only) — kept subtle
    if (pulse > 0) {
      drawChevronLocal(ctx, isUp);
      ctx.strokeStyle = withAlpha(pal.mid, 0.25 * pulse);
      ctx.lineWidth = CHEVRON_THICKNESS + 4;
      ctx.stroke();

      drawChevronLocal(ctx, isUp);
      ctx.strokeStyle = withAlpha(pal.bright, 0.4 * pulse);
      ctx.lineWidth = CHEVRON_THICKNESS;
      ctx.stroke();
    } else if (isActive) {
      // Subtle persistent glow on all chevrons of the active set so it's
      // distinguishable from the inactive set even when the runner isn't here.
      drawChevronLocal(ctx, isUp);
      ctx.strokeStyle = withAlpha(pal.mid, 0.32);
      ctx.lineWidth = CHEVRON_THICKNESS + 2;
      ctx.stroke();

      drawChevronLocal(ctx, isUp);
      ctx.strokeStyle = withAlpha(pal.mid, 0.55);
      ctx.lineWidth = CHEVRON_THICKNESS;
      ctx.stroke();
    }

    if (litness > 0) {
      // Wide soft glow
      drawChevronLocal(ctx, isUp);
      ctx.strokeStyle = withAlpha(pal.mid, 0.45 * litness);
      ctx.lineWidth = CHEVRON_THICKNESS + 10;
      ctx.stroke();

      // Mid glow
      drawChevronLocal(ctx, isUp);
      ctx.strokeStyle = withAlpha(pal.mid, 0.7 * litness);
      ctx.lineWidth = CHEVRON_THICKNESS + 4;
      ctx.stroke();

      // Crisp colored stroke
      drawChevronLocal(ctx, isUp);
      ctx.strokeStyle = withAlpha(pal.bright, litness);
      ctx.lineWidth = CHEVRON_THICKNESS;
      ctx.stroke();

      // Bright white core for the wave-crest chevron
      if (isCrest) {
        drawChevronLocal(ctx, isUp);
        ctx.strokeStyle = withAlpha("#ffffff", 0.85);
        ctx.lineWidth = CHEVRON_THICKNESS - 2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // ─── Flash burst effects ──────────────────────────────────────────────────
  if (flashing) {
    // Sparks shooting from the tip chevron along the tangent direction
    const tipTheta = thetaTip;
    const tipX = arc.cx + arc.radius * Math.cos(tipTheta);
    const tipY = arc.cy + arc.radius * Math.sin(tipTheta);
    // Tangent direction toward beyond the tip (extending the arc)
    const tangentX = -Math.sin(tipTheta) * dirSign;
    const tangentY = Math.cos(tipTheta) * dirSign;
    // Up set: dirSign=-1, tangent toward smaller theta (above the tip)
    // Down set: dirSign=+1, tangent toward larger theta (below the tip)
    // Re-derive: tangent in the direction of i increasing, which is dirSign * (-sin(theta), cos(theta)).
    // Wait — for up set (dirSign=-1), as i grows we go to MORE negative theta (smaller).
    //   d/d(i) of theta = -ARC_STEP. The position derivative w.r.t. theta is (-sin, cos)*r.
    //   Multiply by d(theta)/d(i) = -ARC_STEP: tangent direction = (sin(theta), -cos(theta)) = -1 * (-sin, cos).
    // For down set (dirSign=+1), tangent = (-sin(theta), cos(theta)).
    // Pattern: tangent_along_i = dirSign * (-sin(theta), cos(theta))? No, let me redo.
    //   Up: i++ → theta -= ARC_STEP → position moves by (sin(theta), -cos(theta))*ARC_STEP. So tangent_along_i = (sin(theta), -cos(theta)).
    //   Down: i++ → theta += ARC_STEP → position moves by (-sin(theta), cos(theta))*ARC_STEP. So tangent_along_i = (-sin(theta), cos(theta)).
    //   Up has tangent = -1 * (-sin, cos), Down has tangent = +1 * (-sin, cos). So:
    //     tangent_along_i = dirSign_correction * (-sin(theta), cos(theta))
    //     where dirSign_correction = +1 for down, -1 for up = -dirSign (since dirSign is -1 for up).
    //   So tangent_along_i = -dirSign * (-sin(theta), cos(theta)) = dirSign * (sin(theta), -cos(theta)).
    // Sparks should shoot OUT past the tip = same direction as tangent_along_i.
    const sparkDirX = dirSign * Math.sin(tipTheta);
    const sparkDirY = dirSign * -Math.cos(tipTheta);
    // (avoid unused-var warnings if I refactor away from tangentX/Y)
    void tangentX;
    void tangentY;

    const sparkLen = flashT * 38;
    const sparkAlpha = (1 - flashT) * 0.95;
    ctx.strokeStyle = withAlpha(pal.bright, sparkAlpha);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      const offsetX = -sparkDirY * i * 5; // perpendicular spread
      const offsetY = sparkDirX * i * 5;
      const tail = 6 + Math.abs(i) * 2;
      ctx.beginPath();
      ctx.moveTo(
        tipX + offsetX + sparkDirX * tail,
        tipY + offsetY + sparkDirY * tail,
      );
      ctx.lineTo(
        tipX + offsetX + sparkDirX * (tail + sparkLen),
        tipY + offsetY + sparkDirY * (tail + sparkLen),
      );
      ctx.stroke();
    }

    // 3 expanding shockwave rings, centered on the centroid
    const rings = [
      { color: pal.mid,    delay: 0,    spread: 70, width: 3 },
      { color: "#ffffff",  delay: 0.18, spread: 90, width: 2 },
      { color: pal.bright, delay: 0.35, spread: 110, width: 2 },
    ];
    for (const ring of rings) {
      const t = (flashT - ring.delay) / (1 - ring.delay);
      if (t < 0 || t > 1) continue;
      const r = 18 + t * ring.spread;
      const a = (1 - t) * 0.85;
      ctx.beginPath();
      ctx.arc(centroidX, centroidY, r, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(ring.color, a);
      ctx.lineWidth = ring.width * (1 - t * 0.5);
      ctx.stroke();
    }

    // Outward-flying particles
    const partR = 80 * flashT;
    const partAlpha = (1 - flashT) * 0.9;
    ctx.fillStyle = withAlpha("#ffffff", partAlpha);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + flashT * 0.4;
      const px = centroidX + Math.cos(angle) * partR;
      const py = centroidY + Math.sin(angle) * partR;
      const pr = 2.5 * (1 - flashT * 0.7);
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ─── Public API ─────────────────────────────────────────────────────────────
/**
 * @param activeDirection +1 or -1 — which carousel direction is currently
 *   active. The corresponding chevron set gets a continuous "running light"
 *   pulse so the user can see at a glance which way the carousel is going.
 *
 * Mapping (must match main.ts trigger logic):
 *   - up-arrow trigger sets directionTarget = -1 → up set is active when -1
 *   - down-arrow trigger sets directionTarget = +1 → down set is active when +1
 */
export function drawDirectionArrows(
  ctx: CanvasRenderingContext2D,
  arc: ChevronArc,
  state: ArrowState,
  now: number,
  activeDirection: number,
) {
  const upActive = activeDirection === -1;
  const downActive = activeDirection === 1;
  drawChevronArcSet(
    ctx,
    arc,
    true,
    state.chargeUp,
    state.flashUpStart,
    PALETTE_UP,
    now,
    upActive,
  );
  drawChevronArcSet(
    ctx,
    arc,
    false,
    state.chargeDown,
    state.flashDownStart,
    PALETTE_DOWN,
    now,
    downActive,
  );
}
