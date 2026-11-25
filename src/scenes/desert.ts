import * as THREE from "three";
import type { Collider, SceneContext, World } from "./types";
import { Touareg } from "../characters/touareg";

const GROUND_SIZE = 300;
const LIMIT = 130;
const EYE = 0.26;

export function desertHeightAt(x: number, z: number): number {
  const big = Math.sin(x * 0.02 + Math.sin(z * 0.013) * 2) * 6;
  const mid = Math.sin(z * 0.025 + x * 0.01) * 4;
  const small = Math.sin((x + z) * 0.045) * 2;
  const ripples = Math.sin(x * 0.11 + z * 0.07 + Math.sin(z * 0.3)) * 0.12;
  return big + mid + small + ripples;
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

export function buildDesert({ scene, mount }: SceneContext): World {
  const rand = mulberry32(7);
  const colliders: Collider[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T) => {
    mats.push(m);
    return m;
  };

  const HORIZON = new THREE.Color(0xc96f48);
  scene.fog = new THREE.FogExp2(HORIZON, 0.0125);

  // --- Ciel, soleil bas, étoiles ---------------------------------------
  const sunDir = new THREE.Vector3(0.45, 0.09, -0.89).normalize();
  const skyGroup = new THREE.Group();
  scene.add(skyGroup);

  const skyMat = trackMat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        horizon: { value: HORIZON },
        mid: { value: new THREE.Color(0x7a4a6a) },
        top: { value: new THREE.Color(0x141a3c) },
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
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.2, y));
          col = mix(col, top, smoothstep(0.15, 0.75, y));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += vec3(1.0, 0.55, 0.25) * pow(s, 10.0) * 0.55;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  const skyGeo = trackGeo(new THREE.SphereGeometry(500, 32, 16));
  skyGroup.add(new THREE.Mesh(skyGeo, skyMat));

  const sunGeo = trackGeo(new THREE.SphereGeometry(14, 24, 12));
  const sunMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffb468, fog: false }));
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.copy(sunDir).multiplyScalar(450);
  skyGroup.add(sun);

  const starPos: number[] = [];
  while (starPos.length < 900) {
    const v = new THREE.Vector3(rand() * 2 - 1, rand(), rand() * 2 - 1).normalize();
    if (v.y > 0.3) starPos.push(v.x * 480, v.y * 480, v.z * 480);
  }
  const starGeo = trackGeo(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = trackMat(
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.75,
      fog: false,
    })
  );
  skyGroup.add(new THREE.Points(starGeo, starMat));

  // --- Lumières ---------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x6a6aa8, 0xb0704a, 0.7));
  const dirLight = new THREE.DirectionalLight(0xffa464, 2.4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  const sc = dirLight.shadow.camera;
  sc.left = sc.bottom = -40;
  sc.right = sc.top = 40;
  sc.near = 1;
  sc.far = 200;
  sc.updateProjectionMatrix();
  dirLight.shadow.bias = -0.0006;
  dirLight.shadow.normalBias = 0.05;
  scene.add(dirLight, dirLight.target);

  // --- Terrain ----------------------------------------------------------
  const groundGeo = trackGeo(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 220, 220));
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const valley = new THREE.Color(0xa85f38);
  const crest = new THREE.Color(0xeab47c);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = desertHeightAt(x, z);
    pos.setY(i, y);
    const t = THREE.MathUtils.clamp((y + 9) / 18, 0, 1);
    tmp.copy(valley).lerp(crest, t).multiplyScalar(0.94 + rand() * 0.1);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  groundGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const groundMat = trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Rochers ----------------------------------------------------------
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1, 0));
  const rockMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7a5236,
      roughness: 0.95,
      flatShading: true,
    })
  );
  for (let i = 0; i < 45; i++) {
    const x = (rand() - 0.5) * 240;
    const z = (rand() - 0.5) * 240;
    const s = 0.25 + rand() * rand() * 2.4;
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.set(s * (1 + rand() * 0.6), s * (0.5 + rand() * 0.4), s * (1 + rand() * 0.6));
    rock.position.set(x, desertHeightAt(x, z) + s * 0.1, z);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    colliders.push({ kind: "circle", x, z, r: s * 1.15 });
  }

  // --- Touffes d'herbe sèche -------------------------------------------
  const tuftGeo = trackGeo(new THREE.ConeGeometry(0.06, 0.5, 4));
  tuftGeo.translate(0, 0.25, 0);
  const tuftMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x8c7b3c, roughness: 1 }));
  const TUFTS = 700;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < TUFTS; i++) {
    const x = (rand() - 0.5) * 260;
    const z = (rand() - 0.5) * 260;
    const s = 0.5 + rand() * 1.2;
    e.set((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, desertHeightAt(x, z), z), q, new THREE.Vector3(s, s, s));
    tufts.setMatrixAt(i, m);
  }
  scene.add(tufts);

  // --- Touareg, à quelques mètres du point d'apparition -------------------
  // Le joueur part face au soleil. Le Touareg est placé sur le côté, à 90° de la
  // direction du soleil (vers la gauche du joueur) : il est éclairé de profil
  // (pas à contre-jour) et on le voit en tournant un peu la tête. Plus près de la
  // direction du regard, il serait au bord de l'écran au départ, étiré par le grand-angle.
  // Aucun rocher à moins de 20 m du départ.
  const TOUAREG_DISTANCE = 5.7;
  const TOUAREG_ANGLE_FROM_SUN = THREE.MathUtils.degToRad(90);
  const sunAzimuth = Math.atan2(sunDir.x, sunDir.z);
  const touaregX = Math.sin(sunAzimuth + TOUAREG_ANGLE_FROM_SUN) * TOUAREG_DISTANCE;
  const touaregZ = Math.cos(sunAzimuth + TOUAREG_ANGLE_FROM_SUN) * TOUAREG_DISTANCE;
  const touareg = new Touareg({
    scene,
    mount,
    x: touaregX,
    z: touaregZ,
    heightAt: desertHeightAt,
    faces: { x: 0, z: 0 },
  });
  colliders.push(touareg.collider);

  return {
    heightAt: desertHeightAt,
    eye: EYE,
    spawn: { x: 0, z: 0, yaw: 0, pitch: 0.04 },
    colliders,
    clamp: (p) => {
      const r = Math.hypot(p.x, p.z);
      if (r > LIMIT) {
        p.x *= LIMIT / r;
        p.z *= LIMIT / r;
      }
    },
    onFrame: (dt, camera, player) => {
      touareg.update(dt, player);
      skyGroup.position.copy(camera.position);
      dirLight.target.position.set(camera.position.x, 0, camera.position.z);
      dirLight.position
        .set(camera.position.x, 0, camera.position.z)
        .addScaledVector(sunDir, 80);
      dirLight.position.y += 10;
    },
    dispose: () => {
      touareg.dispose();
      geos.forEach((g) => g.dispose());
      mats.forEach((mt) => mt.dispose());
    },
  };
}
