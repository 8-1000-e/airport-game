import * as THREE from "three";
import { makeLuggage } from "./luggage";

// ─── Scene ──────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(0, 38, 28);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Lights ─────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
// Hemisphere fill (sky blue / floor warm) — gives natural ambient gradient
scene.add(new THREE.HemisphereLight(0xb8d8ff, 0x4a3a2a, 0.45));

// Key light
const keyLight = new THREE.DirectionalLight(0xfff2d8, 0.95);
keyLight.position.set(20, 38, 18);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -40;
keyLight.shadow.camera.right = 40;
keyLight.shadow.camera.top = 40;
keyLight.shadow.camera.bottom = -40;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

// Fill light — softer, opposite side
const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.35);
fillLight.position.set(-15, 25, -10);
scene.add(fillLight);

// Rim light — accent from behind
const rimLight = new THREE.DirectionalLight(0xffe0c0, 0.4);
rimLight.position.set(0, 20, -25);
scene.add(rimLight);

// ─── Floor ──────────────────────────────────────────────────────────────────
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x1a1a24 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ─── Carousel geometry ─────────────────────────────────────────────────────
// Stadium shape: two straight sides + two semi-circle ends
const STRAIGHT_LEN = 16;   // horizontal straight section length
const RADIUS = 7;          // semi-circle radius (also half of belt depth)
const BELT_WIDTH = 2.6;    // width of the moving belt
const BELT_HEIGHT = 0.4;   // belt thickness above floor
const CENTER_HEIGHT = 0.2; // center "platform" thickness (the gray pad inside)

// Inner platform (the static gray center that bags revolve around)
const innerShape = new THREE.Shape();
const inner = STRAIGHT_LEN / 2;
const innerR = RADIUS - BELT_WIDTH / 2 - 0.3;
innerShape.moveTo(-inner, innerR);
innerShape.lineTo(inner, innerR);
innerShape.absarc(inner, 0, innerR, Math.PI / 2, -Math.PI / 2, true);
innerShape.lineTo(-inner, -innerR);
innerShape.absarc(-inner, 0, innerR, -Math.PI / 2, Math.PI / 2, true);
const innerGeo = new THREE.ExtrudeGeometry(innerShape, {
  depth: CENTER_HEIGHT,
  bevelEnabled: false,
});
innerGeo.rotateX(-Math.PI / 2);
const innerPad = new THREE.Mesh(
  innerGeo,
  new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.9 }),
);
innerPad.position.y = 0.01;
innerPad.receiveShadow = true;
scene.add(innerPad);

// Outer rim (wood-tone border around the carousel)
const outerShape = new THREE.Shape();
const outerR = RADIUS + 0.4;
outerShape.moveTo(-inner, outerR);
outerShape.lineTo(inner, outerR);
outerShape.absarc(inner, 0, outerR, Math.PI / 2, -Math.PI / 2, true);
outerShape.lineTo(-inner, -outerR);
outerShape.absarc(-inner, 0, outerR, -Math.PI / 2, Math.PI / 2, true);
// Cut a hole the shape of the belt's outer edge
const beltOuterHole = new THREE.Path();
const holeR = RADIUS + 0.05;
beltOuterHole.moveTo(-inner, holeR);
beltOuterHole.lineTo(inner, holeR);
beltOuterHole.absarc(inner, 0, holeR, Math.PI / 2, -Math.PI / 2, true);
beltOuterHole.lineTo(-inner, -holeR);
beltOuterHole.absarc(-inner, 0, holeR, -Math.PI / 2, Math.PI / 2, true);
outerShape.holes.push(beltOuterHole);
const rimGeo = new THREE.ExtrudeGeometry(outerShape, {
  depth: BELT_HEIGHT + 0.15,
  bevelEnabled: false,
});
rimGeo.rotateX(-Math.PI / 2);
const rim = new THREE.Mesh(
  rimGeo,
  new THREE.MeshStandardMaterial({ color: 0xc28b5a, roughness: 0.7 }),
);
rim.position.y = 0.01;
rim.castShadow = true;
rim.receiveShadow = true;
scene.add(rim);

// Belt surface (the moving track — visually static here, motion is the bags)
const beltShape = new THREE.Shape();
const beltOuter = RADIUS;
beltShape.moveTo(-inner, beltOuter);
beltShape.lineTo(inner, beltOuter);
beltShape.absarc(inner, 0, beltOuter, Math.PI / 2, -Math.PI / 2, true);
beltShape.lineTo(-inner, -beltOuter);
beltShape.absarc(-inner, 0, beltOuter, -Math.PI / 2, Math.PI / 2, true);
const beltInner = new THREE.Path();
const beltInnerR = RADIUS - BELT_WIDTH;
beltInner.moveTo(-inner, beltInnerR);
beltInner.lineTo(inner, beltInnerR);
beltInner.absarc(inner, 0, beltInnerR, Math.PI / 2, -Math.PI / 2, true);
beltInner.lineTo(-inner, -beltInnerR);
beltInner.absarc(-inner, 0, beltInnerR, -Math.PI / 2, Math.PI / 2, true);
beltShape.holes.push(beltInner);
const beltGeo = new THREE.ExtrudeGeometry(beltShape, {
  depth: BELT_HEIGHT,
  bevelEnabled: false,
});
beltGeo.rotateX(-Math.PI / 2);
const belt = new THREE.Mesh(
  beltGeo,
  new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95 }),
);
belt.position.y = 0.01;
belt.receiveShadow = true;
scene.add(belt);

// Belt center radius (where bags ride)
const BELT_CENTER_R = RADIUS - BELT_WIDTH / 2;

// ─── Stadium path math ─────────────────────────────────────────────────────
// Total perimeter
const STRAIGHT_PERI = STRAIGHT_LEN; // each straight
const ARC_PERI = Math.PI * BELT_CENTER_R; // each semi-circle (half of 2πr)
const PERIMETER = 2 * STRAIGHT_PERI + 2 * ARC_PERI;

/**
 * Returns position + tangent angle for a `t` in [0, 1] along the stadium path.
 * The path runs counter-clockwise: top straight (left→right), right arc (top→bottom),
 * bottom straight (right→left), left arc (bottom→top).
 */
function stadiumPath(t: number): { x: number; z: number; angle: number } {
  const d = ((t % 1) + 1) % 1 * PERIMETER; // wrap

  // Top straight: x: -inner → +inner, z: +BELT_CENTER_R
  if (d < STRAIGHT_PERI) {
    const u = d / STRAIGHT_PERI;
    return {
      x: -STRAIGHT_LEN / 2 + u * STRAIGHT_LEN,
      z: BELT_CENTER_R,
      angle: 0, // moving +x
    };
  }
  // Right arc: top → right → bottom (angle: π/2 → -π/2 going clockwise around right end)
  if (d < STRAIGHT_PERI + ARC_PERI) {
    const u = (d - STRAIGHT_PERI) / ARC_PERI; // 0 → 1
    const theta = Math.PI / 2 - u * Math.PI;
    return {
      x: STRAIGHT_LEN / 2 + Math.cos(theta) * BELT_CENTER_R,
      z: Math.sin(theta) * BELT_CENTER_R,
      angle: -u * Math.PI, // tangent angle
    };
  }
  // Bottom straight: x: +inner → -inner, z: -BELT_CENTER_R
  if (d < 2 * STRAIGHT_PERI + ARC_PERI) {
    const u = (d - STRAIGHT_PERI - ARC_PERI) / STRAIGHT_PERI;
    return {
      x: STRAIGHT_LEN / 2 - u * STRAIGHT_LEN,
      z: -BELT_CENTER_R,
      angle: -Math.PI,
    };
  }
  // Left arc: bottom → left → top
  const u = (d - 2 * STRAIGHT_PERI - ARC_PERI) / ARC_PERI;
  const theta = -Math.PI / 2 - u * Math.PI;
  return {
    x: -STRAIGHT_LEN / 2 + Math.cos(theta) * BELT_CENTER_R,
    z: Math.sin(theta) * BELT_CENTER_R,
    angle: -Math.PI - u * Math.PI,
  };
}

// ─── Luggage ────────────────────────────────────────────────────────────────
interface Luggage {
  mesh: THREE.Group;
  t: number; // position along path, 0..1
  speed: number; // delta t per second
}

const luggageItems: Luggage[] = [];
const COUNT = 10;
const BASE_SPEED = 0.04; // 4% of perimeter per second → ~25s for a full loop
for (let i = 0; i < COUNT; i++) {
  const mesh = makeLuggage();
  // Bag's bottom is at local y=0 (auto-aligned). Place it flush on belt top.
  mesh.position.y = BELT_HEIGHT + 0.05;
  scene.add(mesh);
  luggageItems.push({
    mesh,
    t: i / COUNT, // evenly spaced
    speed: BASE_SPEED,
  });
}

// ─── Animate ────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  const dt = clock.getDelta();

  for (const lug of luggageItems) {
    lug.t += lug.speed * dt;
    if (lug.t >= 1) lug.t -= 1;
    const { x, z, angle } = stadiumPath(lug.t);
    lug.mesh.position.x = x;
    lug.mesh.position.z = z;
    // Orient the bag to face along its direction of travel
    lug.mesh.rotation.y = -angle + Math.PI / 2;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
