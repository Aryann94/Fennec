import * as THREE from "three";
import type { Collider, SceneContext, World } from "./types";

const EYE = 0.26;
const SEA_LEVEL = 0;
const PAD = { x: 0, z: 45, y: 1.8 };
const PITCH_W = 44;
const PITCH_L = 28;
const HW = PITCH_W / 2;
const HL = PITCH_L / 2;
const MARGIN = 4;
const TIERS = 7;
const TIER_H = 0.8;
const TIER_D = 1.4;
const STAND_DEPTH = TIER_D * TIERS;
const STAND_TOP = TIER_H * TIERS;
const GATE_HALF = 4;
const STAND_Z_IN = HL + MARGIN;
const STAND_Z_OUT = STAND_Z_IN + STAND_DEPTH;
const STAND_X_IN = HW + MARGIN;
const STAND_X_OUT = STAND_X_IN + STAND_DEPTH;
const JSK_YELLOW = 0xf4c81c;
const JSK_GREEN = 0x0f7a3d;

/** Hauteur du sol : plage en pente vers la mer, prairies vallonnées, plateau du stade. */
export function coastHeightAt(x: number, z: number): number {
  const shore = THREE.MathUtils.clamp((z + 58) / 46, 0, 1);
  const base = -1.6 + shore * 3.2;
  const hills =
    Math.sin(x * 0.035 + Math.sin(z * 0.02) * 1.5) * 0.9 +
    Math.sin(z * 0.045 + 1.1) * 0.6 +
    Math.sin((x - z) * 0.09) * 0.18;
  const h = base + hills * (0.25 + shore * 0.75);
  const dx = Math.abs(x - PAD.x) / 46;
  const dz = Math.abs(z - PAD.z) / 36;
  const k = 1 - THREE.MathUtils.smoothstep(Math.max(dx, dz), 1, 1.45);
  return h * (1 - k) + PAD.y * k;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stadeBannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#123049";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f4c81c";
  ctx.fillRect(0, 0, canvas.width, 10);
  ctx.fillStyle = "#0f7a3d";
  ctx.fillRect(0, canvas.height - 10, canvas.width, 10);
  ctx.fillStyle = "#f7f2e6";
  ctx.font = "bold 150px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("STADE", canvas.width / 2, canvas.height / 2 + 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Drapeau algérien : vert à la hampe, blanc à la volée, croissant et étoile rouges. */
function algeriaFlagTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#006233";
  ctx.fillRect(0, 0, 150, 200);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(150, 0, 150, 200);

  ctx.fillStyle = "#d21034";
  ctx.beginPath();
  ctx.arc(150, 100, 46, 0, Math.PI * 2);
  ctx.arc(163, 100, 36, 0, Math.PI * 2, true);
  ctx.fill();

  // étoile à cinq branches
  ctx.beginPath();
  const cx = 176;
  const cy = 100;
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? 19 : 7.6;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildCoast({ scene }: SceneContext): World {
  const rand = mulberry32(11);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const colliders: Collider[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(m: T) => {
    mats.push(m);
    return m;
  };

  const HORIZON = new THREE.Color(0xd7e6ee);
  scene.fog = new THREE.FogExp2(HORIZON, 0.006);

  // --- Ciel de jour -----------------------------------------------------
  const sunDir = new THREE.Vector3(0.25, 0.42, -0.87).normalize();
  const skyGroup = new THREE.Group();
  scene.add(skyGroup);

  const skyMat = mat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        horizon: { value: HORIZON },
        mid: { value: new THREE.Color(0x8fbcd8) },
        top: { value: new THREE.Color(0x2c6fa8) },
        sunDir: { value: sunDir },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 horizon; uniform vec3 mid; uniform vec3 top; uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.28, y));
          col = mix(col, top, smoothstep(0.2, 0.85, y));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += vec3(1.0, 0.96, 0.85) * pow(s, 28.0) * 0.5;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  const skyGeo = geo(new THREE.SphereGeometry(600, 32, 16));
  skyGroup.add(new THREE.Mesh(skyGeo, skyMat));

  const sunGeo = geo(new THREE.SphereGeometry(16, 20, 12));
  const sunMat = mat(new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.copy(sunDir).multiplyScalar(540);
  skyGroup.add(sun);

  // --- Lumières ---------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x7a8a58, 0.9));
  const dirLight = new THREE.DirectionalLight(0xfff3d6, 2.3);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  const sc = dirLight.shadow.camera;
  sc.left = sc.bottom = -60;
  sc.right = sc.top = 60;
  sc.near = 1;
  sc.far = 260;
  sc.updateProjectionMatrix();
  dirLight.shadow.bias = -0.0006;
  dirLight.shadow.normalBias = 0.05;
  scene.add(dirLight, dirLight.target);

  // --- Terrain herbeux et plage ----------------------------------------
  const SIZE = 700;
  const groundGeo = geo(new THREE.PlaneGeometry(SIZE, SIZE, 200, 200));
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sandCol = new THREE.Color(0xd9c191);
  const grassCol = new THREE.Color(0x5c8a44);
  const grassLight = new THREE.Color(0x8fb75e);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = coastHeightAt(x, z);
    pos.setY(i, y);
    const landT = THREE.MathUtils.clamp((z + 34) / 14, 0, 1);
    const heightT = THREE.MathUtils.clamp((y - 0.55) / 0.9, 0, 1) * 0.85;
    const t = Math.max(landT, heightT);
    const patch = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.sin(z * 0.23);
    tmp.copy(sandCol).lerp(grassCol, t);
    tmp.lerp(grassLight, t * patch * 0.7).multiplyScalar(0.94 + rand() * 0.1);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  groundGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const groundMat = mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Mer --------------------------------------------------------------
  const seaGeo = geo(new THREE.PlaneGeometry(1400, 1400));
  seaGeo.rotateX(-Math.PI / 2);
  const seaMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x2c6f8a, roughness: 0.22, metalness: 0.25 })
  );
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.set(0, SEA_LEVEL, 0);
  sea.receiveShadow = true;
  scene.add(sea);

  const foamMat = mat(
    new THREE.MeshBasicMaterial({
      color: 0xeef7fa,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      fog: false,
    })
  );
  const foams: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const fg = geo(new THREE.PlaneGeometry(520, 1.5 - i * 0.35));
    fg.rotateX(-Math.PI / 2);
    const f = new THREE.Mesh(fg, foamMat);
    f.position.set(0, SEA_LEVEL + 0.04, -32 - i * 2.2);
    scene.add(f);
    foams.push(f);
  }

  // --- Touffes d'herbe ---------------------------------------------------
  const tuftGeo = geo(new THREE.ConeGeometry(0.07, 0.6, 4));
  tuftGeo.translate(0, 0.3, 0);
  const tuftMat = mat(new THREE.MeshStandardMaterial({ color: 0x6f9a44, roughness: 1 }));
  const TUFTS = 900;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  let placed = 0;
  for (let guard = 0; placed < TUFTS && guard < TUFTS * 10; guard++) {
    const x = (rand() - 0.5) * 300;
    const z = (rand() - 0.5) * 240 + 20;
    const y = coastHeightAt(x, z);
    if (y < 0.45) continue;
    if (Math.hypot(x - PAD.x, z - PAD.z) < STAND_X_OUT + 6) continue;
    if (Math.abs(x) < 5 && z > -30 && z < STAND_Z_OUT + PAD.z) continue;
    const s = 0.5 + rand() * 1.1;
    eul.set((rand() - 0.5) * 0.35, rand() * 6, (rand() - 0.5) * 0.35);
    q.setFromEuler(eul);
    mtx.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    tufts.setMatrixAt(placed++, mtx);
  }
  tufts.count = placed;
  scene.add(tufts);

  // --- Rochers de plage --------------------------------------------------
  const rockGeo = geo(new THREE.DodecahedronGeometry(1, 0));
  const rockMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.9, flatShading: true })
  );
  for (let i = 0; i < 22; i++) {
    const x = (rand() - 0.5) * 220;
    const z = -10 - rand() * 24;
    if (Math.abs(x) < 12) continue;
    const y = coastHeightAt(x, z);
    if (y < -0.2) continue;
    const s = 0.22 + rand() * 0.85;
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.set(s * (1 + rand() * 0.5), s * (0.5 + rand() * 0.4), s * (1 + rand() * 0.5));
    rock.position.set(x, y + s * 0.1, z);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    colliders.push({ kind: "circle", x, z, r: s * 1.1 });
  }

  // --- Allée vers l'entrée ----------------------------------------------
  const pathGeo = geo(new THREE.PlaneGeometry(5, 64, 3, 64));
  pathGeo.rotateX(-Math.PI / 2);
  pathGeo.translate(0, 0, 2);
  const pathPos = pathGeo.attributes.position;
  for (let i = 0; i < pathPos.count; i++) {
    pathPos.setY(i, coastHeightAt(pathPos.getX(i), pathPos.getZ(i)) + 0.03);
  }
  pathGeo.computeVertexNormals();
  const pathMat = mat(new THREE.MeshStandardMaterial({ color: 0xbdb49f, roughness: 1 }));
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.receiveShadow = true;
  scene.add(path);

  // --- Stade ------------------------------------------------------------
  const y0 = PAD.y;

  // Pelouse
  const STRIPES = 8;
  const stripeW = PITCH_W / STRIPES;
  for (let i = 0; i < STRIPES; i++) {
    const g = geo(new THREE.PlaneGeometry(stripeW, PITCH_L));
    g.rotateX(-Math.PI / 2);
    const mm = mat(
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x3f7c46 : 0x478a4c, roughness: 1 })
    );
    const stripe = new THREE.Mesh(g, mm);
    stripe.position.set(PAD.x - HW + stripeW * (i + 0.5), y0 + 0.02, PAD.z);
    stripe.receiveShadow = true;
    scene.add(stripe);
  }

  // Lignes de jeu
  const lineMat = mat(new THREE.MeshBasicMaterial({ color: 0xeef3ea }));
  const addLine = (w: number, d: number, x: number, z: number) => {
    const g = geo(new THREE.PlaneGeometry(w, d));
    g.rotateX(-Math.PI / 2);
    const line = new THREE.Mesh(g, lineMat);
    line.position.set(x, y0 + 0.05, z);
    scene.add(line);
  };
  const TH = 0.12;
  addLine(PITCH_W, TH, PAD.x, PAD.z - HL + TH / 2);
  addLine(PITCH_W, TH, PAD.x, PAD.z + HL - TH / 2);
  addLine(TH, PITCH_L, PAD.x - HW + TH / 2, PAD.z);
  addLine(TH, PITCH_L, PAD.x + HW - TH / 2, PAD.z);
  addLine(PITCH_W, TH, PAD.x, PAD.z);

  const circleGeo = geo(new THREE.RingGeometry(5.9, 6.1, 64));
  circleGeo.rotateX(-Math.PI / 2);
  const circle = new THREE.Mesh(circleGeo, lineMat);
  circle.position.set(PAD.x, y0 + 0.05, PAD.z);
  scene.add(circle);

  const spotGeo = geo(new THREE.CircleGeometry(0.2, 24));
  spotGeo.rotateX(-Math.PI / 2);
  const spot = new THREE.Mesh(spotGeo, lineMat);
  spot.position.set(PAD.x, y0 + 0.05, PAD.z);
  scene.add(spot);

  const pbW = 18;
  const pbD = 7;
  for (const s of [-1, 1]) {
    const xInner = PAD.x + s * (HW - 0.06);
    const xOuter = PAD.x + s * (HW - pbD);
    addLine(pbD, TH, (xInner + xOuter) / 2, PAD.z - pbW / 2);
    addLine(pbD, TH, (xInner + xOuter) / 2, PAD.z + pbW / 2);
    addLine(TH, pbW, xOuter, PAD.z);
  }

  // Buts
  const goalW = 7.32;
  const goalH = 2.44;
  const postGeo = geo(new THREE.CylinderGeometry(0.07, 0.07, goalH, 12));
  const postMat = mat(new THREE.MeshStandardMaterial({ color: 0xf2f4f0, roughness: 0.6 }));
  const barGeo = geo(new THREE.CylinderGeometry(0.07, 0.07, goalW, 12));
  barGeo.rotateX(Math.PI / 2);
  const netMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      roughness: 1,
    })
  );
  const netGeo = geo(new THREE.PlaneGeometry(goalW, goalH));
  for (const s of [-1, 1]) {
    const gx = PAD.x + s * (HW - 0.4);
    for (const dz of [-goalW / 2, goalW / 2]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(gx, y0 + goalH / 2, PAD.z + dz);
      post.castShadow = true;
      scene.add(post);
      colliders.push({ kind: "circle", x: gx, z: PAD.z + dz, r: 0.12 });
    }
    const bar = new THREE.Mesh(barGeo, postMat);
    bar.position.set(gx, y0 + goalH, PAD.z);
    bar.castShadow = true;
    scene.add(bar);
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(gx + s * 0.9, y0 + goalH / 2, PAD.z);
    net.rotation.y = Math.PI / 2;
    scene.add(net);
  }

  // --- Tribunes ----------------------------------------------------------
  const concreteMat = mat(new THREE.MeshStandardMaterial({ color: 0xb3b9bd, roughness: 0.95 }));
  const seatYellow = mat(new THREE.MeshStandardMaterial({ color: JSK_YELLOW, roughness: 0.8 }));
  const seatGreen = mat(new THREE.MeshStandardMaterial({ color: JSK_GREEN, roughness: 0.8 }));
  const roofMat = mat(new THREE.MeshStandardMaterial({ color: 0xe6eaec, roughness: 0.9 }));
  const fasciaMat = mat(new THREE.MeshStandardMaterial({ color: JSK_GREEN, roughness: 0.8 }));
  const baseMat = mat(new THREE.MeshStandardMaterial({ color: 0xd3cec1, roughness: 0.95 }));

  const addTier = (w: number, d: number, x: number, z: number, h: number, yellow: boolean) => {
    const body = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), concreteMat);
    body.position.set(x, y0 + h / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    scene.add(body);
    const slab = new THREE.Mesh(
      geo(new THREE.BoxGeometry(w, 0.16, d)),
      yellow ? seatYellow : seatGreen
    );
    slab.position.set(x, y0 + h + 0.11, z);
    slab.receiveShadow = true;
    scene.add(slab);
  };

  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material
  ) => {
    const g = geo(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  for (const s of [-1, 1]) {
    for (let i = 0; i < TIERS; i++) {
      const h = TIER_H * (i + 1);
      addTier(TIER_D, PITCH_L + MARGIN * 2, PAD.x + s * (STAND_X_IN + TIER_D * (i + 0.5)), PAD.z, h, i % 2 === 1);
      const zc = PAD.z + s * (STAND_Z_IN + TIER_D * (i + 0.5));
      if (s === 1) {
        addTier(PITCH_W + MARGIN * 2, TIER_D, PAD.x, zc, h, i % 2 === 1);
      } else {
        const blockLen = HW + MARGIN - GATE_HALF;
        const xc = GATE_HALF + blockLen / 2;
        addTier(blockLen, TIER_D, xc, zc, h, i % 2 === 1);
        addTier(blockLen, TIER_D, -xc, zc, h, i % 2 === 1);
      }
    }
  }

  const standZOuter = PAD.z - STAND_Z_OUT;
  const standZInner = PAD.z - STAND_Z_IN;
  colliders.push(
    {
      kind: "box",
      minX: STAND_X_IN,
      maxX: STAND_X_OUT,
      minZ: PAD.z - STAND_Z_IN,
      maxZ: PAD.z + STAND_Z_IN,
    },
    {
      kind: "box",
      minX: -STAND_X_OUT,
      maxX: -STAND_X_IN,
      minZ: PAD.z - STAND_Z_IN,
      maxZ: PAD.z + STAND_Z_IN,
    },
    {
      kind: "box",
      minX: -STAND_X_IN,
      maxX: STAND_X_IN,
      minZ: PAD.z + STAND_Z_IN,
      maxZ: PAD.z + STAND_Z_OUT,
    },
    { kind: "box", minX: -STAND_X_IN, maxX: -GATE_HALF, minZ: standZOuter, maxZ: standZInner },
    { kind: "box", minX: GATE_HALF, maxX: STAND_X_IN, minZ: standZOuter, maxZ: standZInner }
  );

  // Toiture annulaire
  const roofY = y0 + STAND_TOP + 1.4;
  for (const s of [-1, 1]) {
    addBox(STAND_DEPTH + 4, 0.4, 2 * STAND_Z_IN + 2 * STAND_DEPTH + 4, s * (STAND_X_IN + STAND_DEPTH / 2), roofY, PAD.z, roofMat);
    addBox(2 * STAND_X_IN, 0.4, STAND_DEPTH + 4, 0, roofY, PAD.z + s * (STAND_Z_IN + STAND_DEPTH / 2), roofMat);
  }

  // Bandeau de façade aux couleurs du club
  for (const s of [-1, 1]) {
    addBox(2 * STAND_X_OUT + 2, 1.8, 0.6, 0, y0 + STAND_TOP + 0.2, PAD.z + s * STAND_Z_OUT, fasciaMat);
    addBox(0.6, 1.8, 2 * STAND_Z_OUT, s * STAND_X_OUT, y0 + STAND_TOP + 0.2, PAD.z, fasciaMat);
  }

  // --- Façade sud : socle, nervures, entrée ------------------------------
  const facadeZ = standZOuter - 0.3;
  const plinthLen = STAND_X_OUT - GATE_HALF;
  for (const sx of [-1, 1]) {
    addBox(plinthLen, 2, 1, sx * (GATE_HALF + plinthLen / 2), y0 + 1, facadeZ + 0.3, baseMat);
  }
  const ribGeo = geo(new THREE.BoxGeometry(0.5, STAND_TOP - 2, 0.7));
  for (let i = -5; i <= 5; i++) {
    const rx = i * 6.4;
    if (Math.abs(rx) < GATE_HALF + 2.5) continue;
    const rib = new THREE.Mesh(ribGeo, baseMat);
    rib.position.set(rx, y0 + 2 + (STAND_TOP - 2) / 2, facadeZ);
    rib.castShadow = true;
    scene.add(rib);
  }

  const gateZ = standZOuter - 0.5;
  const pillarH = 7.4;
  const pillarGeo = geo(new THREE.BoxGeometry(1.1, pillarH, 1.1));
  const pillarMat = mat(new THREE.MeshStandardMaterial({ color: 0x9c3b2a, roughness: 0.8 }));
  for (const sx of [-1, 1]) {
    const px = sx * (GATE_HALF + 0.8);
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(px, y0 + pillarH / 2, gateZ);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
    colliders.push({ kind: "circle", x: px, z: gateZ, r: 0.8 });
  }

  const lintel = addBox(GATE_HALF * 2 + 4.2, 1.6, 1.4, 0, y0 + pillarH + 0.4, gateZ, pillarMat);

  const bannerTex = stadeBannerTexture();
  texs.push(bannerTex);
  const bannerMat = mat(
    new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false, side: THREE.DoubleSide })
  );
  const bannerGeo = geo(new THREE.PlaneGeometry(9.6, 1.9));
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(0, lintel.position.y, gateZ - 0.75);
  banner.rotation.y = Math.PI;
  scene.add(banner);

  // Voûte du tunnel et éclairage intérieur
  addBox(2 * GATE_HALF + 1, 0.35, STAND_DEPTH, 0, y0 + STAND_TOP - 0.2, PAD.z - STAND_Z_IN - STAND_DEPTH / 2, roofMat);
  const tunnelLightMat = mat(new THREE.MeshBasicMaterial({ color: 0xfff3d6 }));
  const tunnelLightGeo = geo(new THREE.PlaneGeometry(1.8, 0.9));
  for (let i = 0; i < 2; i++) {
    const lamp = new THREE.Mesh(tunnelLightGeo, tunnelLightMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, y0 + STAND_TOP - 0.42, standZOuter + 3.5 + i * 4);
    scene.add(lamp);
  }

  // --- Public dans les gradins -------------------------------------------
  const seatStep = 0.62;
  const spectators: { x: number; y: number; z: number; yaw: number }[] = [];
  for (let i = 0; i < TIERS; i++) {
    const h = TIER_H * (i + 1);
    const y = y0 + h + 0.2;
    for (const s of [-1, 1]) {
      for (let t = -(HL + MARGIN) + 0.4; t < HL + MARGIN; t += seatStep) {
        if (rand() < 0.7) {
          spectators.push({
            x: PAD.x + s * (STAND_X_IN + TIER_D * (i + 0.5)),
            y,
            z: PAD.z + t,
            yaw: Math.PI / 2,
          });
        }
      }
      for (let t = -(HW + MARGIN) + 0.4; t < HW + MARGIN; t += seatStep) {
        if (s === -1 && Math.abs(t) < GATE_HALF + 0.6) continue;
        if (rand() < 0.7) {
          spectators.push({
            x: PAD.x + t,
            y,
            z: PAD.z + s * (STAND_Z_IN + TIER_D * (i + 0.5)),
            yaw: 0,
          });
        }
      }
    }
  }

  const bodyGeo = geo(new THREE.BoxGeometry(0.4, 1.05, 0.28));
  bodyGeo.translate(0, 0.52, 0);
  const headGeo = geo(new THREE.SphereGeometry(0.16, 8, 6));
  headGeo.translate(0, 1.2, 0);
  const bodyMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.9 }));
  const headMat = mat(new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.9 }));
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, spectators.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, spectators.length);
  bodies.castShadow = true;
  const palette = [
    JSK_YELLOW,
    JSK_YELLOW,
    JSK_YELLOW,
    JSK_GREEN,
    JSK_GREEN,
    JSK_GREEN,
    0xffffff,
    0x1c3f63,
  ];
  const shirt = new THREE.Color();
  const spectatorMatrix = new THREE.Matrix4();
  const spectatorQuat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  spectators.forEach((sp, index) => {
    spectatorQuat.setFromAxisAngle(up, sp.yaw);
    spectatorMatrix.compose(new THREE.Vector3(sp.x, sp.y, sp.z), spectatorQuat, new THREE.Vector3(1, 1, 1));
    bodies.setMatrixAt(index, spectatorMatrix);
    heads.setMatrixAt(index, spectatorMatrix);
    shirt.setHex(palette[Math.floor(rand() * palette.length)]);
    bodies.setColorAt(index, shirt);
  });
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  scene.add(bodies, heads);

  // --- Drapeaux algériens ------------------------------------------------
  const flagTex = algeriaFlagTexture();
  texs.push(flagTex);
  const flagMat = mat(
    new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.85 })
  );
  const poleMat = mat(new THREE.MeshStandardMaterial({ color: 0xd5dade, roughness: 0.5 }));
  const poleGeo = geo(new THREE.CylinderGeometry(0.05, 0.06, 1, 8));
  const flags: { mesh: THREE.Mesh; base: number; phase: number }[] = [];

  const addFlag = (x: number, z: number, poleH: number, w: number, baseYaw: number, groundY = y0) => {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.scale.set(1, poleH, 1);
    pole.position.set(x, groundY + poleH / 2, z);
    pole.castShadow = true;
    scene.add(pole);
    const g = geo(new THREE.PlaneGeometry(w, (w * 2) / 3));
    g.translate(w / 2, -w / 3, 0);
    const flag = new THREE.Mesh(g, flagMat);
    flag.position.set(x, groundY + poleH - 0.05, z);
    flag.rotation.y = baseYaw;
    flag.castShadow = true;
    scene.add(flag);
    flags.push({ mesh: flag, base: baseYaw, phase: rand() * Math.PI * 2 });
  };

  // Deux grands drapeaux sur le portail
  addFlag(-(GATE_HALF + 0.8), gateZ, pillarH + 3, 2.2, 0.25);
  addFlag(GATE_HALF + 0.8, gateZ, pillarH + 3, 2.2, Math.PI - 0.25);

  // Drapeaux aux quatre coins de la pelouse
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addFlag(PAD.x + sx * (HW - 1), PAD.z + sz * (HL - 1), 2.4, 1.2, sx > 0 ? 0.4 : Math.PI - 0.4);
    }
  }

  // Mâture autour du stade
  const ringX = STAND_X_OUT + 6;
  const ringZ = STAND_Z_OUT + 6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addFlag(PAD.x + sx * ringX, PAD.z + sz * ringZ, 5.5, 1.8, sx > 0 ? 0.3 : Math.PI - 0.3);
      addFlag(PAD.x + sx * ringX * 0.5, PAD.z + sz * (ringZ + 3), 4.5, 1.4, sz > 0 ? -0.4 : 0.4);
    }
  }
  // Drapeaux sur le bandeau sud
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    addFlag(i * 7, standZOuter, STAND_TOP + 2.6, 1.1, 0.2 * Math.sign(i));
  }

  // Panneaux d'éclairage
  const mastGeo = geo(new THREE.CylinderGeometry(0.22, 0.3, 14, 10));
  const mastMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x9aa4aa, roughness: 0.7, metalness: 0.3 })
  );
  const lampGeo = geo(new THREE.BoxGeometry(4, 2.4, 0.4));
  const lampMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff6dc,
      emissiveIntensity: 1.2,
      roughness: 0.4,
    })
  );
  const lightX = STAND_X_OUT + 5;
  const lightZ = STAND_Z_OUT + 4;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = PAD.x + sx * lightX;
      const pz = PAD.z + sz * lightZ;
      const base = coastHeightAt(px, pz);
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.set(px, base + 7, pz);
      mast.castShadow = true;
      scene.add(mast);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(px, base + 14.3, pz);
      lamp.lookAt(PAD.x, y0 + 2, PAD.z);
      scene.add(lamp);
      colliders.push({ kind: "circle", x: px, z: pz, r: 0.55 });
    }
  }

  // --- Animation --------------------------------------------------------
  let time = 0;

  return {
    heightAt: coastHeightAt,
    eye: EYE,
    spawn: { x: 0, z: -24, yaw: Math.PI, pitch: 0.05 },
    clamp: (p) => {
      p.x = THREE.MathUtils.clamp(p.x, -120, 120);
      p.z = THREE.MathUtils.clamp(p.z, -30, 105);
    },
    colliders,
    onFrame: (dt, camera) => {
      time += dt;
      skyGroup.position.copy(camera.position);
      dirLight.target.position.set(camera.position.x, 0, camera.position.z);
      dirLight.position
        .set(camera.position.x, 0, camera.position.z)
        .addScaledVector(sunDir, 90);
      dirLight.position.y += 30;
      foams.forEach((f, i) => {
        f.position.z = -32 - i * 2.2 + Math.sin(time * 0.5 + i * 1.4) * 1.1;
      });
      flags.forEach((f) => {
        f.mesh.rotation.y = f.base + Math.sin(time * 1.7 + f.phase) * 0.22;
      });
    },
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((mt) => mt.dispose());
      texs.forEach((t) => t.dispose());
    },
  };
}
