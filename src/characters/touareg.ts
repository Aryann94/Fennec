import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { Collider } from "../scenes/types";
import { disposeModel, fadeTo, loadModel, makeActions, MixerPose, prepareModel, rotateBone } from "./common";
import { TOUAREG_DIALOGUE } from "./dialogue";

/**
 * Distances en mètres, mesurées entre le fennec et le Touareg.
 * GREET_DIST doit rester plus petit que la distance au point de départ (5,7 m dans le désert),
 * sinon il salue dès le chargement, hors de l'écran, et on ne voit jamais le salut.
 */
const GREET_DIST = 4.5; // il salue quand le joueur arrive à cette distance
const GREET_RESET = 8; // il saluera de nouveau si le joueur s'éloigne au-delà
const TALK_DIST = 2.5; // on peut lui parler (touche E) en dessous
const LEAVE_DIST = 4; // le dialogue se ferme si le joueur s'éloigne au-delà
const LOOK_DIST = 12; // il suit le joueur des yeux en dessous
const FENNEC_LOOK_DIST = 5; // le fennec (vue de derrière) le regarde en dessous

/** Clips attendus dans touareg.glb (voir MODELES.md). */
const CLIPS = ["idle", "talk", "nod", "wave"] as const;
type Clip = (typeof CLIPS)[number];

/** Hauteur de la tête du fennec au-dessus de ses pattes. */
const PLAYER_HEAD = 0.25;
/** Limites de rotation de la tête (radians). */
const LOOK_YAW_MAX = 1.1;
const LOOK_PITCH_MIN = -0.7;
const LOOK_PITCH_MAX = 0.35;
const NECK_SHARE = 0.3;
/** Le clip « wave » est un seul cycle (1,2 s) : on le joue 3 fois. */
const WAVE_REPEATS = 3;

export type TouaregOptions = {
  scene: THREE.Scene;
  mount: HTMLElement;
  x: number;
  z: number;
  heightAt: (x: number, z: number) => number;
  /** Point vers lequel il est tourné au départ. */
  faces: { x: number; z: number };
};

const _v = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _body = new THREE.Quaternion();
const _neck = new THREE.Quaternion();
const _head = new THREE.Quaternion();
const _e = new THREE.Euler();

export class Touareg {
  /** Obstacle à ajouter aux colliders du décor. */
  readonly collider: Collider;

  private readonly root = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current: THREE.AnimationAction | null = null;
  private neckBone: THREE.Object3D | null = null;
  private headBone: THREE.Object3D | null = null;
  /** Pose du mixer sur le cou et la tête (pour ne pas accumuler nos rotations). */
  private pose: MixerPose | null = null;

  private readonly look = { yaw: 0, pitch: 0 };
  private readonly player = new THREE.Vector3();
  private playerDist = Infinity;
  private greeted = false;
  private disposed = false;

  // Dialogue : step = -1 quand il est fermé.
  private step = -1;
  private chosen = -1;
  private talkTimer = 0;
  private readonly box: HTMLDivElement;
  private readonly prompt: HTMLDivElement;

  constructor(opts: TouaregOptions) {
    const { scene, mount, x, z, heightAt, faces } = opts;
    this.root.position.set(x, heightAt(x, z), z);
    this.root.rotation.y = Math.atan2(faces.x - x, faces.z - z);
    scene.add(this.root);
    this.collider = { kind: "circle", x, z, r: 0.3 };

    this.prompt = document.createElement("div");
    Object.assign(this.prompt.style, PROMPT_STYLE);
    this.prompt.textContent = "E : parler au Touareg";
    this.box = document.createElement("div");
    Object.assign(this.box.style, BOX_STYLE);
    mount.append(this.prompt, this.box);
    window.addEventListener("keydown", this.onKeyDown);

    loadModel("touareg.glb")
      .then((gltf) => this.setup(gltf))
      .catch((err) => console.error("Impossible de charger touareg.glb", err));
  }

  update(dt: number, player: THREE.Vector3) {
    this.player.copy(player);
    this.playerDist = Math.hypot(player.x - this.root.position.x, player.z - this.root.position.z);
    const dist = this.playerDist;
    if (!this.mixer) return;

    if (this.step < 0) {
      // Salut quand le joueur approche, une fois par visite.
      if (!this.greeted && dist < GREET_DIST) {
        this.greeted = true;
        this.play("wave");
      } else if (dist > GREET_RESET) {
        this.greeted = false;
      }
    } else {
      if (dist > LEAVE_DIST) this.closeDialogue();
      if (this.talkTimer > 0) {
        this.talkTimer -= dt;
        if (this.talkTimer <= 0 && this.current === this.actions.talk) this.play("idle");
      }
    }
    this.prompt.style.display = this.step < 0 && dist < TALK_DIST ? "block" : "none";

    this.pose?.restore();
    this.mixer.update(dt);
    this.pose?.save();
    this.lookAtPlayer(dt, dist);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("keydown", this.onKeyDown);
    this.box.remove();
    this.prompt.remove();
    if (this.model && this.mixer) disposeModel(this.model, this.mixer);
    this.root.removeFromParent();
  }

  // ----------------------------------------------------------------------

  private setup(gltf: GLTF) {
    const model = gltf.scene;
    const mixer = new THREE.AnimationMixer(model);
    if (this.disposed) {
      disposeModel(model, mixer);
      return;
    }
    prepareModel(model);
    // La tête s'oriente avec l'os « head », et un peu « neck » (voir MODELES.md).
    // Seuls ces deux os sont retouchés en code : les épaules dépendent de « chest », pas du cou.
    this.neckBone = model.getObjectByName("neck") ?? null;
    this.headBone = model.getObjectByName("head") ?? null;
    if (this.neckBone && this.headBone) this.pose = new MixerPose([this.neckBone, this.headBone]);
    else console.warn("touareg.glb : os « neck » ou « head » introuvable, la tête ne suivra pas le joueur");

    this.actions = makeActions(mixer, gltf.animations);
    const found = gltf.animations.map((c) => c.name);
    const missing = CLIPS.filter((name) => !this.actions[name]);
    if (missing.length > 0) {
      console.error(`[Touareg] clip(s) manquant(s) : ${missing.join(", ")} — clips du fichier : ${found.join(", ")}`);
      disposeModel(model, mixer);
      return;
    }
    console.info(`[Touareg] clips chargés : ${found.join(", ")}`);
    this.actions.wave.setLoop(THREE.LoopRepeat, WAVE_REPEATS);
    this.actions.wave.clampWhenFinished = true;
    this.actions.nod.setLoop(THREE.LoopOnce, 1);
    this.actions.nod.clampWhenFinished = true;
    mixer.addEventListener("finished", (e) => {
      if (e.action !== this.current) return;
      if (e.action === this.actions.wave) this.play("idle");
      else if (e.action === this.actions.nod) this.nextStep();
    });

    this.model = model;
    this.mixer = mixer;
    this.root.add(model);
    this.play("idle", 0);
  }

  private play(name: Clip, fade = 0.25) {
    const next = this.actions[name];
    console.info(`[Touareg] clip : ${name}`);
    if (next === this.current) next.reset().play();
    else fadeTo(this.current, next, fade);
    this.current = next;
  }

  /**
   * Position de sa tête, si le fennec est assez près pour le regarder (vue de derrière).
   * Renvoie null sinon, ou tant que le modèle n'est pas chargé.
   */
  lookTargetFor(player: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 | null {
    if (!this.headBone) return null;
    const dist = Math.hypot(player.x - this.root.position.x, player.z - this.root.position.z);
    if (dist > FENNEC_LOOK_DIST) return null;
    return this.headBone.getWorldPosition(target);
  }

  /** Tourne la tête (et un peu le cou) vers le fennec, dans les limites d'un vrai cou. */
  private lookAtPlayer(dt: number, dist: number) {
    if (!this.neckBone || !this.headBone || !this.model) return;
    let yaw = 0;
    let pitch = 0;
    if (dist < LOOK_DIST) {
      this.headBone.getWorldPosition(_hp);
      _v.set(this.player.x, this.player.y + PLAYER_HEAD, this.player.z)
        .sub(_hp)
        .applyQuaternion(_q.copy(this.root.quaternion).invert());
      yaw = Math.atan2(_v.x, _v.z);
      pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      if (Math.abs(yaw) > 2) {
        // Joueur dans son dos : il ne se tord pas le cou.
        yaw = 0;
        pitch = 0;
      }
      yaw = THREE.MathUtils.clamp(yaw, -LOOK_YAW_MAX, LOOK_YAW_MAX);
      pitch = THREE.MathUtils.clamp(pitch, LOOK_PITCH_MIN, LOOK_PITCH_MAX);
    }
    const t = 1 - Math.exp(-4 * dt);
    this.look.yaw += (yaw - this.look.yaw) * t;
    this.look.pitch += (pitch - this.look.pitch) * t;

    this.model.getWorldQuaternion(_body);
    _head.setFromEuler(_e.set(-this.look.pitch, this.look.yaw, 0, "YXZ"));
    _neck.setFromEuler(_e.set(-this.look.pitch * NECK_SHARE, this.look.yaw * NECK_SHARE, 0, "YXZ"));
    _q.copy(_neck).invert().premultiply(_head);
    rotateBone(this.neckBone, _neck, _body);
    rotateBone(this.headBone, _q, _body);
  }

  // --- Dialogue -------------------------------------------------------------

  private onKeyDown = (ev: KeyboardEvent) => {
    if (!this.mixer || ev.repeat) return;
    if (ev.code === "KeyE") {
      if (this.step < 0) {
        if (this.playerDist < TALK_DIST) this.openStep(0);
      } else if (TOUAREG_DIALOGUE[this.step].answers.length === 0) {
        this.closeDialogue();
      }
      return;
    }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(ev.code);
    if (!m || this.step < 0 || this.chosen >= 0) return;
    const i = Number(m[1]) - 1;
    if (i >= TOUAREG_DIALOGUE[this.step].answers.length) return;
    this.chosen = i;
    this.render();
    this.play("nod");
  };

  private openStep(i: number) {
    const step = TOUAREG_DIALOGUE[i];
    this.step = i;
    this.chosen = -1;
    this.talkTimer = Math.max(this.actions.talk.getClip().duration, step.line.length * 0.06);
    this.play("talk");
    this.render();
  }

  private nextStep() {
    if (this.step + 1 < TOUAREG_DIALOGUE.length) this.openStep(this.step + 1);
    else this.closeDialogue();
  }

  private closeDialogue() {
    if (this.step < 0) return;
    this.step = -1;
    this.chosen = -1;
    this.talkTimer = 0;
    this.box.style.display = "none";
    if (this.current === this.actions.talk || this.current === this.actions.nod) this.play("idle");
  }

  private render() {
    const step = TOUAREG_DIALOGUE[this.step];
    this.box.replaceChildren();
    const name = document.createElement("div");
    Object.assign(name.style, { fontSize: "13px", letterSpacing: "0.08em", opacity: "0.7" });
    name.textContent = "TOUAREG";
    const line = document.createElement("div");
    Object.assign(line.style, { fontSize: "18px", margin: "4px 0 10px" });
    line.textContent = step.line;
    this.box.append(name, line);

    step.answers.forEach((answer, i) => {
      const row = document.createElement("div");
      row.textContent = `${i + 1} : ${answer}`;
      Object.assign(row.style, {
        padding: "3px 0",
        opacity: this.chosen < 0 || this.chosen === i ? "1" : "0.35",
        fontWeight: this.chosen === i ? "600" : "400",
      });
      this.box.append(row);
    });
    if (step.answers.length === 0) {
      const end = document.createElement("div");
      Object.assign(end.style, { opacity: "0.6", fontSize: "14px" });
      end.textContent = "E : terminer";
      this.box.append(end);
    }
    this.box.style.display = "block";
  }
}

const PROMPT_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  left: "50%",
  bottom: "28px",
  transform: "translateX(-50%)",
  padding: "8px 16px",
  borderRadius: "999px",
  background: "rgba(12, 16, 36, 0.6)",
  color: "#fbe6cf",
  font: "500 15px/1.2 system-ui, sans-serif",
  pointerEvents: "none",
  display: "none",
};

const BOX_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  left: "50%",
  bottom: "24px",
  transform: "translateX(-50%)",
  width: "min(560px, calc(100% - 32px))",
  boxSizing: "border-box",
  padding: "14px 18px",
  borderRadius: "14px",
  border: "1px solid rgba(251, 230, 207, 0.25)",
  background: "rgba(12, 16, 36, 0.72)",
  color: "#fbe6cf",
  font: "400 16px/1.45 system-ui, sans-serif",
  pointerEvents: "none",
  display: "none",
};
