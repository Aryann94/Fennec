import type * as THREE from "three";

export type SceneContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  mount: HTMLDivElement;
};

/** Obstacle solide, en coordonnées monde (vue de dessus). */
export type Collider =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number };

export type World = {
  /** Hauteur du sol à une position, en mètres. */
  heightAt: (x: number, z: number) => number;
  /** Hauteur des yeux au-dessus du sol (0,26 m par défaut). */
  eye?: number;
  spawn?: { x?: number; z?: number; yaw?: number; pitch?: number };
  /** Empêche le joueur de sortir de la zone praticable. */
  clamp?: (position: THREE.Vector3) => void;
  /** Obstacles infranchissables (rochers, tribunes, poteaux…). */
  colliders?: Collider[];
  /** Appelé à chaque image, avant le rendu. `player` = position des pattes du fennec. */
  onFrame?: (dt: number, camera: THREE.PerspectiveCamera, player: THREE.Vector3) => void;
  dispose?: () => void;
};

export type WorldFactory = (context: SceneContext) => World;
