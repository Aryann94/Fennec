import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { disposeModel, fadeTo, loadModel, makeActions, MixerPose, prepareModel, rotateBone } from "./common";

/** Vitesse (m/s) pour laquelle chaque clip a été calé (voir MODELES.md). */
const CLIP_SPEED = { walk: 0.26, trot: 0.72, run: 1.25 } as const;

/** Allure choisie selon la vitesse : en dessous de chaque seuil, on garde l'allure. */
const GAIT_MAX: [Gait, number][] = [
  ["idle", 0.06],
  ["walk", 0.46],
  ["trot", 1.62],
];
const GAIT_ORDER: Gait[] = ["idle", "walk", "trot", "run"];
/** Marge autour des seuils pour ne pas changer d'allure en boucle. */
const GAIT_MARGIN = 0.05;

/**
 * Position de la caméra « yeux du fennec », dans le modèle au repos (mesuré sur fennec.glb).
 * Les yeux sont à y = 0,278, z = 0,177, mais le crâne bas-poly passe 1 cm au-dessus :
 * une caméra placée entre les yeux serait dans la tête et ne verrait pas le museau.
 * On la met donc juste au-dessus du front (2 cm), au niveau des yeux. L'avancer vers le museau
 * ferait sortir la truffe de l'écran : le museau descend en pente raide (environ 42°).
 */
const EYE_REST = new THREE.Vector3(0, 0.315, 0.175);
/** Direction du museau (de l'os head vers la truffe), dans le modèle au repos. */
const SNOUT_REST = new THREE.Vector3(0, -0.003, 0.0915).normalize();
/** Part de la rotation de la tête prise par le cou (le reste par l'os head). */
const NECK_SHARE = 0.35;
const NECK_SHARE_DOWN = 0.1;
/** Le corps suit la pente à 85 % (100 % donnerait un fennec trop penché). */
const TILT_AMOUNT = 0.85;
/**
 * Lissage (en secondes) de la caméra par rapport à la tête : position, puis inclinaison.
 * La position est presque solidaire de la tête : la truffe n'est qu'à 6 cm de la caméra,
 * un retard de 1 cm la ferait sauter d'une dizaine de degrés à l'écran. Ce qui ferait
 * trembler la vue, ce sont les rotations, et en vue par les yeux la tête est bloquée.
 */
const EYE_SMOOTH = 0.03;
const PITCH_SMOOTH = 0.14;
/** Vitesse de rotation du corps (rad/s) au-delà de laquelle la queue ne réagit pas plus. */
const TAIL_TURN_MAX = 4;
/** Durée (s) du fondu quand la tête passe de libre (vue de derrière) à bloquée (vue par les yeux). */
const HEAD_LOCK_FADE = 0.15;
/** Matériau des globes oculaires, cachés en vue par les yeux (sinon on les voit en tournant ou en courant). */
const EYES_MATERIAL = "Fennec_Eyes";

type Gait = "idle" | "walk" | "trot" | "run";

export type FennecInput = {
  /** Vitesse horizontale réelle, en m/s. */
  speed: number;
  /** Vrai quand il recule (vue à la première personne, touche S). */
  backward: boolean;
  /** Vrai tant qu'il est en l'air. */
  airborne: boolean;
  /** Rotation de la tête par rapport au corps, en radians (+ = vers sa gauche). */
  lookYaw: number;
  /** Inclinaison de la tête, en radians (+ = vers le haut). */
  lookPitch: number;
  /** Vitesse de rotation du corps, en rad/s (pour la queue). */
  turnRate: number;
  /**
   * Vue par les yeux : orientation de la tête imposée dans le monde (radians ;
   * `yaw` comme `root.rotation.y`, `pitch` + = vers le haut). Absent en vue de derrière.
   */
  lockHead?: { yaw: number; pitch: number };
};

const UP = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _body = new THREE.Quaternion();
const _headFrame = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _hp = new THREE.Vector3();

/** Angle d'une direction au-dessus (+) ou au-dessous (−) de l'horizontale. */
const pitchOf = (v: THREE.Vector3) => Math.atan2(v.y, Math.hypot(v.x, v.z));

export class Fennec {
  /** À ajouter à la scène. Sa position = les pattes, sa rotation = direction + pente. */
  readonly root = new THREE.Group();

  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<string, THREE.AnimationAction>;
  private current: THREE.AnimationAction | null = null;
  private gait: Gait | "jump" | null = null;

  private readonly neck: THREE.Object3D;
  private readonly head: THREE.Object3D;
  private readonly ears: THREE.Object3D[];
  private readonly tail: THREE.Object3D[];
  /** Pose du mixer sur les os qu'on retouche (pour ne pas accumuler nos rotations). */
  private readonly pose: MixerPose;

  // Pose de repos, dans le repère du modèle.
  private readonly neckPivot = new THREE.Vector3();
  private readonly headPivot = new THREE.Vector3();
  private readonly headRestInv = new THREE.Quaternion();
  private readonly headRest = new THREE.Quaternion();
  /** Part du blocage de la tête (1 en vue par les yeux, 0 en vue de derrière), en fondu. */
  private lockWeight = 0;
  private lastLock = { yaw: 0, pitch: 0 };
  private readonly eyeInHead = new THREE.Vector3();

  // Rotations de la tête appliquées à cette image (repère du corps).
  private readonly neckLook = new THREE.Quaternion();
  private readonly headLook = new THREE.Quaternion();
  /** Écart lissé entre les yeux animés et les yeux « sans animation ». */
  private readonly eyeWobble = new THREE.Vector3();
  /** Écart lissé entre l'inclinaison réelle du museau et celle demandée (radians). */
  private pitchWobble = 0;
  private readonly snoutInHead = new THREE.Vector3();

  private readonly normal = new THREE.Vector3(0, 1, 0);
  private time = 0;
  private tailPhase = 0;
  /** Vitesse de rotation du corps, bornée et lissée, pour la queue. */
  private tailTurn = 0;
  private readonly eyeMeshes: THREE.Object3D[] = [];
  private readonly earTimer = [1.5 + Math.random() * 3, 3 + Math.random() * 3];
  private readonly earFlick = [-1, -1];

  static async load(): Promise<Fennec> {
    return new Fennec(await loadModel("fennec.glb"));
  }

  private constructor(gltf: GLTF) {
    this.model = gltf.scene;
    prepareModel(this.model);
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name === EYES_MATERIAL) {
        this.eyeMeshes.push(mesh);
      }
    });

    const bone = (name: string) => {
      const b = this.model.getObjectByName(name);
      if (!b) throw new Error(`fennec.glb : os « ${name} » introuvable`);
      return b;
    };
    this.neck = bone("neck");
    this.head = bone("head");
    this.ears = [bone("ear_L"), bone("ear_R")];
    this.tail = [bone("tail_01"), bone("tail_02"), bone("tail_03"), bone("tail_04")];
    this.pose = new MixerPose([this.neck, this.head, ...this.ears, ...this.tail]);

    // Le modèle n'est encore nulle part : son repère monde est celui du modèle.
    this.model.updateMatrixWorld(true);
    this.neck.getWorldPosition(this.neckPivot);
    this.head.getWorldPosition(this.headPivot);
    this.head.getWorldQuaternion(this.headRest);
    this.headRestInv.copy(this.headRest).invert();
    this.eyeInHead.copy(EYE_REST);
    this.head.worldToLocal(this.eyeInHead);
    this.snoutInHead.copy(SNOUT_REST).applyQuaternion(this.headRestInv);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = makeActions(this.mixer, gltf.animations);
    const jump = this.actions.jump;
    jump.setLoop(THREE.LoopOnce, 1);
    jump.clampWhenFinished = true;

    this.root.add(this.model);
    this.setGait("idle", 0);
  }

  /** Place le fennec : `feet` = position des pattes, `yaw` = direction du corps, `ground` = normale du sol. */
  place(feet: THREE.Vector3, yaw: number, ground: THREE.Vector3, dt: number) {
    _n.copy(UP).lerp(ground, TILT_AMOUNT).normalize();
    this.normal.lerp(_n, 1 - Math.exp(-8 * dt)).normalize();
    _q.setFromUnitVectors(UP, this.normal);
    _q2.setFromAxisAngle(UP, yaw);
    this.root.quaternion.multiplyQuaternions(_q, _q2);
    this.root.position.copy(feet);
  }

  /** Inclinaison avant/arrière du corps due à la pente (+ = museau vers le haut). */
  bodyPitch() {
    _v.set(0, 0, 1).applyQuaternion(this.root.quaternion);
    return Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1));
  }

  /** Lance l'animation de saut, accélérée pour durer `airTime` secondes. */
  jump(airTime: number) {
    const a = this.actions.jump;
    a.timeScale = a.getClip().duration / airTime;
    fadeTo(this.current, a, 0.15);
    this.current = a;
    this.gait = "jump";
  }

  update(dt: number, input: FennecInput) {
    this.time += dt;

    // --- Choix de l'animation --------------------------------------------
    if (this.gait === "jump" && !input.airborne) this.gait = null;
    if (this.gait !== "jump") {
      const g = this.pickGait(input.speed);
      if (g !== this.gait) this.setGait(g, 0.25);
      if (g !== "idle" && this.current) {
        const scale = THREE.MathUtils.clamp(input.speed / CLIP_SPEED[g], 0.5, 2.2);
        this.current.timeScale = input.backward ? -scale : scale;
      }
    }
    this.pose.restore();
    this.mixer.update(dt);
    this.pose.save();

    // --- Par-dessus l'animation (toujours après mixer.update) -------------
    this.model.getWorldQuaternion(_body);

    // Tête et cou : là où regarde le joueur.
    this.headLook.setFromEuler(_e.set(-input.lookPitch, input.lookYaw, 0, "YXZ"));
    // Vers le bas, c'est surtout la tête qui plonge : si le cou s'avançait, les yeux
    // passeraient loin devant les pattes avant et on ne les verrait plus.
    const neckPitch = input.lookPitch * (input.lookPitch > 0 ? NECK_SHARE : NECK_SHARE_DOWN);
    this.neckLook.setFromEuler(_e.set(-neckPitch, input.lookYaw * NECK_SHARE, 0, "YXZ"));
    _q.copy(this.neckLook).invert().premultiply(this.headLook); // part restante pour la tête
    rotateBone(this.neck, this.neckLook, _body);
    rotateBone(this.head, _q, _body);

    // Vue par les yeux : la tête est fixée exactement dans la direction de la caméra
    // (sans le balancement de l'animation ni le roulis de la pente), sinon le museau
    // balaie l'écran. Fondu entre les deux modes quand on change de vue.
    if (input.lockHead) this.lastLock = input.lockHead;
    const lockTarget = input.lockHead ? 1 : 0;
    this.lockWeight += (lockTarget - this.lockWeight) * (1 - Math.exp(-dt / HEAD_LOCK_FADE));
    if (Math.abs(this.lockWeight - lockTarget) < 0.001) this.lockWeight = lockTarget;
    if (this.lockWeight > 0) {
      _q2.setFromEuler(_e.set(-this.lastLock.pitch, this.lastLock.yaw, 0, "YXZ")).multiply(this.headRest);
      this.head.parent!.getWorldQuaternion(_q).invert().multiply(_q2); // orientation voulue, en local
      this.head.quaternion.slerp(_q, this.lockWeight);
    }

    // Oreilles : rabattues quand il court, petits frémissements de temps en temps.
    const run = Math.min(input.speed / 2.5, 1);
    this.head.getWorldQuaternion(_headFrame).multiply(this.headRestInv);
    this.ears.forEach((ear, i) => {
      this.earTimer[i] -= dt;
      if (this.earTimer[i] <= 0) {
        this.earFlick[i] = 0;
        this.earTimer[i] = 2 + Math.random() * 5;
      }
      let flick = 0;
      if (this.earFlick[i] >= 0) {
        this.earFlick[i] += dt;
        const t = this.earFlick[i] / 0.3;
        if (t >= 1) this.earFlick[i] = -1;
        else flick = Math.sin(Math.PI * t);
      }
      const side = i === 0 ? 1 : -1; // ear_L est du côté +X
      const back = 0.35 * run + 0.25 * flick + 0.03 * Math.sin(this.time * 1.7 + i * 2);
      const out = 0.12 * flick + 0.03 * Math.sin(this.time * 1.1 + i);
      _q.setFromEuler(_e.set(-back, 0, -side * out, "XYZ"));
      rotateBone(ear, _q, _headFrame);
    });

    // Queue : balancement qui se propage vers le bout, et retard dans les virages.
    // La phase avance de `freq × dt` : avec `temps × freq`, un changement de vitesse
    // ferait sauter la phase (d'autant plus que la partie dure) et la queue battrait très vite.
    const amp = 0.07 + 0.12 * run;
    const freq = 2 + 7 * run;
    this.tailPhase = (this.tailPhase + freq * dt) % (Math.PI * 2);
    const turnRate = THREE.MathUtils.clamp(input.turnRate, -TAIL_TURN_MAX, TAIL_TURN_MAX);
    this.tailTurn += (turnRate - this.tailTurn) * (1 - Math.exp(-6 * dt));
    const turn = -this.tailTurn * 0.07;
    this.tail.forEach((b, i) => {
      const a = amp * Math.sin(this.tailPhase - i * 0.8) + turn * (0.15 + 0.1 * i);
      rotateBone(b, _q.setFromAxisAngle(UP, a), _body);
    });

    // --- Yeux pour la caméra : on garde la position voulue, on lisse le balancement.
    this.eyeLocal(_v).sub(this.steadyEyeLocal(_n));
    this.eyeWobble.lerp(_v, 1 - Math.exp(-dt / EYE_SMOOTH));

    // Inclinaison réelle du museau (animation comprise) moins celle demandée, lissée :
    // la caméra suit les mouvements lents de la tête mais pas les secousses de la course.
    // Quand la tête est bloquée (vue par les yeux), il n'y a rien à suivre : on ne compte
    // que la part libre, sinon les changements de pente en virage décaleraient la caméra.
    this.head.getWorldQuaternion(_q).premultiply(_q2.copy(_body).invert());
    _v.copy(this.snoutInHead).applyQuaternion(_q);
    _n.copy(SNOUT_REST).applyQuaternion(this.headLook);
    const pitchDelta = (pitchOf(_v) - pitchOf(_n)) * (1 - this.lockWeight);
    this.pitchWobble += (pitchDelta - this.pitchWobble) * (1 - Math.exp(-dt / PITCH_SMOOTH));
  }

  /** Position de la caméra en vue « yeux du fennec », en coordonnées monde. */
  firstPersonEye(target: THREE.Vector3) {
    this.steadyEyeLocal(target).add(this.eyeWobble);
    return this.root.localToWorld(target);
  }

  /** Affiche ou cache les globes oculaires (cachés en vue par les yeux). */
  setEyesVisible(visible: boolean) {
    this.eyeMeshes.forEach((m) => (m.visible = visible));
  }

  /** De combien l'animation lève (+) ou baisse (−) la tête en ce moment, lissé (radians). */
  headPitchOffset() {
    return this.pitchWobble;
  }

  dispose() {
    disposeModel(this.model, this.mixer);
    this.root.removeFromParent();
  }

  // ----------------------------------------------------------------------

  private setGait(g: Gait, fade: number) {
    const next = this.actions[g];
    const bothMoving = this.gait !== null && this.gait !== "idle" && this.gait !== "jump" && g !== "idle";
    fadeTo(this.current, next, fade, bothMoving);
    this.current = next;
    this.gait = g;
  }

  private pickGait(speed: number): Gait {
    let g: Gait = "run";
    for (const [name, max] of GAIT_MAX) {
      if (speed < max) {
        g = name;
        break;
      }
    }
    const cur = this.gait;
    if (cur && cur !== "jump" && cur !== g) {
      const ci = GAIT_ORDER.indexOf(cur);
      const gi = GAIT_ORDER.indexOf(g);
      const edge = GAIT_MAX[Math.min(ci, gi)][1];
      if (Math.abs(gi - ci) === 1 && Math.abs(speed - edge) < GAIT_MARGIN) g = cur;
    }
    return g;
  }

  /** Yeux de la pose animée, dans le repère du fennec. */
  private eyeLocal(target: THREE.Vector3) {
    this.head.updateWorldMatrix(true, false);
    target.copy(this.eyeInHead).applyMatrix4(this.head.matrixWorld);
    return this.root.worldToLocal(target);
  }

  /** Yeux de la pose de repos tournée comme le veut le joueur, sans l'animation. */
  private steadyEyeLocal(target: THREE.Vector3) {
    // Le cou tourne autour de son pivot (ce qui déplace la tête), puis la tête autour du sien.
    _hp.subVectors(this.headPivot, this.neckPivot).applyQuaternion(this.neckLook).add(this.neckPivot);
    target.copy(EYE_REST).sub(this.neckPivot).applyQuaternion(this.neckLook).add(this.neckPivot);
    _q.copy(this.neckLook).invert().premultiply(this.headLook);
    return target.sub(_hp).applyQuaternion(_q).add(_hp);
  }
}
