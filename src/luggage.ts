import * as THREE from "three";

// ─── Palette ────────────────────────────────────────────────────────────────
export const LUGGAGE_COLORS = [
  0xe8d4b0, // beige
  0xe83a8b, // hot pink
  0xd14a8a, // magenta
  0x4ad19a, // mint
  0xb87654, // brown leather
  0x6b3f2c, // dark brown
  0xeec4a3, // tan
  0x55c478, // lime
  0x2c3e50, // navy
  0xc94c4c, // crimson
  0x4a6cb6, // royal blue
  0xf2c14e, // mustard
];

const HARDWARE_COLOR = 0x2a2a2a;
const STRAP_COLOR = 0x1a1a1a;

// Helper materials -----------------------------------------------------------
const matFabric = (color: number) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
const matLeather = (color: number) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
const matHardShell = (color: number) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.35,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
  });
const matMetal = (color = 0x9aa0a8) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.85 });
const matRubber = (color = 0x111114) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.0 });

// Add a small luggage tag dangling from a handle ----------------------------
function addTag(parent: THREE.Object3D, anchor: THREE.Vector3): void {
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a6a3a }),
  );
  string.position.copy(anchor);
  string.position.y -= 0.09;
  parent.add(string);

  const tag = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.12, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xf5d984, roughness: 0.7 }),
  );
  tag.position.copy(anchor);
  tag.position.y -= 0.22;
  tag.castShadow = true;
  parent.add(tag);
}

// ─── Hard-shell suitcase ────────────────────────────────────────────────────
function makeHardCase(color: number): THREE.Group {
  const g = new THREE.Group();

  const w = 1.4 + Math.random() * 0.4;
  const h = 0.85 + Math.random() * 0.25;
  const d = 0.85 + Math.random() * 0.2;

  // Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    matHardShell(color),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Recessed split line (where the case opens) — a thin darker stripe around the middle
  const splitMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.55),
    roughness: 0.7,
  });
  const split = new THREE.Mesh(new THREE.BoxGeometry(w * 1.005, 0.02, d * 1.005), splitMat);
  split.position.y = 0;
  g.add(split);

  // Decorative grooves on top face — common on hard shells
  for (let i = -1; i <= 1; i++) {
    const groove = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.85, 0.015, 0.04),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(0.7),
        roughness: 0.6,
      }),
    );
    groove.position.set(0, h / 2 + 0.005, i * (d / 4));
    g.add(groove);
  }

  // Top handle (telescopic-looking)
  const handleBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.05, 0.12),
    matMetal(0x666666),
  );
  handleBase.position.y = h / 2 + 0.025;
  g.add(handleBase);

  const handleArc = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.025, 8, 18, Math.PI),
    matMetal(0x999999),
  );
  handleArc.rotation.x = Math.PI / 2;
  handleArc.position.y = h / 2 + 0.05;
  handleArc.castShadow = true;
  g.add(handleArc);

  // Side handle (one of the long edges)
  const sideHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.018, 6, 14, Math.PI),
    matMetal(0x888888),
  );
  sideHandle.rotation.z = Math.PI / 2;
  sideHandle.rotation.x = Math.PI / 2;
  sideHandle.position.set(w / 2 + 0.005, 0, 0);
  g.add(sideHandle);

  // 4 wheels on the bottom
  const wheelGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.07, 16);
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, matRubber());
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(dx * (w / 2 - 0.18), -h / 2 - 0.04, dz * (d / 2 - 0.18));
      wheel.castShadow = true;
      g.add(wheel);
    }
  }

  // Telescopic handle slots — two small dark dots on the back top
  const slotGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12);
  for (const dx of [-0.18, 0.18]) {
    const slot = new THREE.Mesh(slotGeo, matRubber(0x222226));
    slot.position.set(dx, h / 2 + 0.005, -d / 2 + 0.1);
    g.add(slot);
  }

  // 50% chance of dangling tag
  if (Math.random() < 0.6) {
    addTag(g, new THREE.Vector3(0.05, h / 2 + 0.05, 0));
  }

  return g;
}

// ─── Duffle / soft bag ──────────────────────────────────────────────────────
function makeDuffle(color: number): THREE.Group {
  const g = new THREE.Group();

  const len = 1.6 + Math.random() * 0.4;
  const r = 0.42 + Math.random() * 0.1;

  // Body: a stretched capsule made of cylinder + 2 hemispheres
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), matFabric(color));
  cyl.rotation.z = Math.PI / 2;
  cyl.castShadow = true;
  g.add(cyl);

  const capGeo = new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, matFabric(color));
    cap.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    cap.position.x = sx * (len / 2);
    cap.castShadow = true;
    g.add(cap);
  }

  // Zipper line (top)
  const zipper = new THREE.Mesh(
    new THREE.BoxGeometry(len, 0.02, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.4, metalness: 0.7 }),
  );
  zipper.position.y = r - 0.02;
  g.add(zipper);

  // Two parallel handles on top, joined in the middle
  const handleH = 0.18;
  const handleSpacing = 0.1;
  for (const dz of [-handleSpacing, handleSpacing]) {
    const hand = new THREE.Mesh(
      new THREE.TorusGeometry(handleH, 0.025, 8, 18, Math.PI),
      matLeather(STRAP_COLOR),
    );
    hand.rotation.x = Math.PI / 2;
    hand.position.set(0, r, dz);
    hand.castShadow = true;
    g.add(hand);
  }
  // Wrap binding the two handles together
  const binding = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, handleSpacing * 2 + 0.07, 12),
    matLeather(0x4a3525),
  );
  binding.rotation.x = Math.PI / 2;
  binding.position.y = r + handleH;
  g.add(binding);

  // Small side pocket detail
  const pocket = new THREE.Mesh(
    new THREE.BoxGeometry(len * 0.4, r * 1.0, 0.05),
    matFabric(new THREE.Color(color).multiplyScalar(0.85).getHex()),
  );
  pocket.position.z = r;
  g.add(pocket);

  // 40% chance of tag
  if (Math.random() < 0.4) {
    addTag(g, new THREE.Vector3(0, r + handleH, 0));
  }

  return g;
}

// ─── Backpack ───────────────────────────────────────────────────────────────
function makeBackpack(color: number): THREE.Group {
  const g = new THREE.Group();

  const w = 0.85 + Math.random() * 0.15;
  const h = 1.1 + Math.random() * 0.2;
  const d = 0.55 + Math.random() * 0.1;

  // Main body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    matFabric(color),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Front pocket
  const pocketColor = new THREE.Color(color).multiplyScalar(0.85).getHex();
  const pocket = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.7, h * 0.45, 0.12),
    matFabric(pocketColor),
  );
  pocket.position.set(0, -h * 0.15, d / 2 + 0.04);
  pocket.castShadow = true;
  g.add(pocket);

  // Pocket zipper
  const zip = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.6, 0.02, 0.02),
    matMetal(0xc0c0c0),
  );
  zip.position.set(0, -h * 0.05, d / 2 + 0.11);
  g.add(zip);

  // Top loop handle
  const loop = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.025, 8, 16, Math.PI),
    matFabric(color),
  );
  loop.rotation.x = Math.PI / 2;
  loop.position.set(0, h / 2 + 0.05, 0);
  loop.castShadow = true;
  g.add(loop);

  // Two shoulder straps (visible from above as two thick lines on the back)
  const strapGeo = new THREE.BoxGeometry(0.13, h * 0.6, 0.08);
  for (const dx of [-w * 0.28, w * 0.28]) {
    const strap = new THREE.Mesh(strapGeo, matFabric(STRAP_COLOR));
    strap.position.set(dx, h * 0.05, -d / 2 - 0.04);
    strap.castShadow = true;
    g.add(strap);
  }

  // Strap buckles
  for (const dx of [-w * 0.28, w * 0.28]) {
    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.05, 0.1),
      matMetal(0x999999),
    );
    buckle.position.set(dx, -h * 0.18, -d / 2 - 0.04);
    g.add(buckle);
  }

  // Logo patch (small rectangle on the front)
  const logo = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.08, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 }),
  );
  logo.position.set(0, h * 0.25, d / 2 + 0.005);
  g.add(logo);

  return g;
}

// ─── Briefcase ──────────────────────────────────────────────────────────────
function makeBriefcase(color: number): THREE.Group {
  const g = new THREE.Group();
  const w = 1.2;
  const h = 0.8;
  const d = 0.25;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    matLeather(color),
  );
  body.castShadow = true;
  g.add(body);

  // Latches
  for (const dx of [-w * 0.3, w * 0.3]) {
    const latch = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.06, 0.05),
      matMetal(0xb89b6a),
    );
    latch.position.set(dx, h / 2 - 0.08, d / 2 + 0.001);
    g.add(latch);
  }

  // Top handle
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.022, 8, 18, Math.PI),
    matLeather(0x3b2516),
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.y = h / 2 + 0.02;
  handle.castShadow = true;
  g.add(handle);

  // Stitch line near edges (visible as a slightly darker outline)
  const stitch = new THREE.Mesh(
    new THREE.RingGeometry(0.001, 0.001, 4),
    new THREE.MeshBasicMaterial(),
  );
  stitch.visible = false;
  g.add(stitch); // placeholder

  return g;
}

// ─── Factory ────────────────────────────────────────────────────────────────
export type LuggageType = "hardcase" | "duffle" | "backpack" | "briefcase";

export function makeLuggage(typeOverride?: LuggageType, colorOverride?: number): THREE.Group {
  const type =
    typeOverride ??
    (["hardcase", "hardcase", "duffle", "backpack", "briefcase"] as LuggageType[])[
      Math.floor(Math.random() * 5)
    ];
  const color =
    colorOverride ?? LUGGAGE_COLORS[Math.floor(Math.random() * LUGGAGE_COLORS.length)];

  let g: THREE.Group;
  switch (type) {
    case "duffle":
      g = makeDuffle(color);
      break;
    case "backpack":
      g = makeBackpack(color);
      break;
    case "briefcase":
      g = makeBriefcase(color);
      break;
    default:
      g = makeHardCase(color);
  }

  // Slight random orientation jitter so the carousel isn't perfectly uniform
  g.rotation.y += (Math.random() - 0.5) * 0.25;

  // Mark all meshes castShadow / receiveShadow if they weren't already
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).castShadow = true;
      (o as THREE.Mesh).receiveShadow = true;
    }
  });

  // Bottom-align: shift every child so the group's lowest point sits at local y=0.
  // Caller just sets mesh.position.y = beltTop.
  const bbox = new THREE.Box3().setFromObject(g);
  const lift = -bbox.min.y;
  g.children.forEach((c) => (c.position.y += lift));

  return g;
}
