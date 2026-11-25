import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();

/** Charge un modèle placé dans `public/models/`. */
export function loadModel(file: string): Promise<GLTF> {
  return loader.loadAsync(`${import.meta.env.BASE_URL}models/${file}`);
}

/** Ombres sur tous les maillages, et `frustumCulled = false` sur les SkinnedMesh (voir MODELES.md). */
export function prepareModel(model: THREE.Object3D) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
  });
}

/** Libère géométries, matériaux et mixer, et retire le modèle de la scène. */
export function disposeModel(model: THREE.Object3D, mixer: THREE.AnimationMixer) {
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m.dispose());
  });
  model.removeFromParent();
}

/** Crée une action par animation du fichier, rangées par nom. */
export function makeActions(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]) {
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const clip of clips) actions[clip.name] = mixer.clipAction(clip);
  return actions;
}

/**
 * Passe en fondu d'une animation à une autre.
 * `syncPhase` : la nouvelle démarre au même moment du pas que l'ancienne (marche → trot, etc.).
 */
export function fadeTo(
  current: THREE.AnimationAction | null,
  next: THREE.AnimationAction,
  duration = 0.25,
  syncPhase = false
) {
  if (current === next) return;
  if (syncPhase && current) {
    const phase = current.time / current.getClip().duration;
    next.reset();
    next.time = phase * next.getClip().duration;
  } else {
    next.reset();
  }
  next.setEffectiveWeight(1);
  next.fadeIn(duration);
  next.play();
  current?.fadeOut(duration);
}

/**
 * Garde la pose « propre » posée par le mixer sur les os qu'on retouche en code.
 *
 * Le mixer ne réécrit un os que si la valeur de l'animation a changé depuis
 * l'image précédente : sans ça, nos rotations s'ajouteraient d'une image à l'autre.
 * Utilisation : `restore()` juste avant `mixer.update()`, `save()` juste après.
 */
export class MixerPose {
  private readonly bones: THREE.Object3D[];
  private readonly saved: THREE.Quaternion[];

  /** `bones` : uniquement les os qu'on retouche en code (rien d'autre n'est jamais modifié). */
  constructor(bones: THREE.Object3D[]) {
    this.bones = bones;
    this.saved = bones.map((b) => b.quaternion.clone());
  }

  restore() {
    this.bones.forEach((b, i) => b.quaternion.copy(this.saved[i]));
  }

  save() {
    this.bones.forEach((b, i) => this.saved[i].copy(b.quaternion));
  }
}

const _parent = new THREE.Quaternion();
const _space = new THREE.Quaternion();
const _local = new THREE.Quaternion();

/**
 * Ajoute la rotation `q` à un os, `q` étant exprimée dans un repère donné
 * (par exemple celui du corps du personnage) par son orientation monde `spaceWorld`.
 * On part toujours de la rotation actuelle de l'os, donc il faut l'appeler
 * juste après `mixer.update()`, qui remet chaque os à sa pose d'animation.
 */
export function rotateBone(bone: THREE.Object3D, q: THREE.Quaternion, spaceWorld: THREE.Quaternion) {
  const parent = bone.parent;
  if (!parent) return;
  parent.getWorldQuaternion(_parent);
  _parent.premultiply(_space.copy(spaceWorld).invert());
  _local.copy(_parent).invert().multiply(q).multiply(_parent);
  bone.quaternion.premultiply(_local);
}

/** Angle ramené entre -π et π. */
export function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
