import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { WorldFactory } from "./scenes/types";
import { resolveCollisions } from "./scenes/collide";
import { Fennec } from "./characters/fennec";
import { wrapAngle } from "./characters/common";

// --- Réglages du joueur ----------------------------------------------------
/** Vitesses en m/s (les clips du fennec sont calés pour des vitesses réelles, voir MODELES.md). */
const WALK_SPEED = 1.1;
const RUN_SPEED = 2.5;
const JUMP_SPEED = 3.4;
const GRAVITY = 9.8;
const AIR_TIME = (2 * JUMP_SPEED) / GRAVITY;

/** Vue par les yeux du fennec. */
const FP_FOV = 80;
const FP_NEAR = 0.01; // très proche, pour que le museau ne soit pas coupé
/** Limites du regard commandé à la souris (radians). */
const HEAD_YAW_MAX = 0.9; // au-delà, le corps tourne avec la tête
const FP_PITCH_MIN = -1.75; // un peu au-delà de la verticale (menton rentré) : on voit les pattes avant
const FP_PITCH_MAX = 0.45;
/**
 * La tête est levée de cet angle par rapport au regard de la caméra : le museau
 * du modèle descend en pente raide, c'est ce qui le fait apparaître en bas de l'écran.
 * Quand on regarde vers le bas, l'écart diminue (la tête ne peut pas plonger plus).
 */
const FP_HEAD_RAISE = 0.4;
const headRaise = (pitch: number) =>
  FP_HEAD_RAISE * THREE.MathUtils.clamp((pitch - FP_PITCH_MIN) / (-0.5 - FP_PITCH_MIN), 0.25, 1);

/** Vue de derrière (touche C). */
const TP_FOV = 60;
const TP_NEAR = 0.05;
const TP_DISTANCE = 1.3;
const TP_TARGET_HEIGHT = 0.22;
const TP_PITCH_MIN = -0.15;
const TP_PITCH_MAX = 1.2;

type ExplorerProps = {
  world: WorldFactory;
  title: string;
  hint: string;
  onExit?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

export default function Explorer({ world, title, hint, onExit, className, style }: ExplorerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- Renderer ---------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FP_FOV, 1, FP_NEAR, 1500);
    camera.rotation.order = "YXZ";
    scene.add(camera);

    const built = world({ scene, camera, renderer, mount });
    const colliders = built.colliders ?? [];
    const spawn = built.spawn ?? {};
    const eye = built.eye ?? 0.26;
    const heightAt = built.heightAt;
    /** Direction du regard (0 = vers -Z, comme la caméra). */
    let yaw = spawn.yaw ?? 0;
    let fpPitch = spawn.pitch ?? 0.04;
    let tpPitch = 0.35;
    let view: "fp" | "tp" = "fp";
    const player = new THREE.Vector3(spawn.x ?? 0, 0, spawn.z ?? 0);

    // --- Fennec -----------------------------------------------------------
    let fennec: Fennec | null = null;
    let disposed = false;
    Fennec.load()
      .then((f) => {
        if (disposed) {
          f.dispose();
          return;
        }
        fennec = f;
        scene.add(f.root);
      })
      .catch((err) => console.error("Impossible de charger fennec.glb", err));

    const setView = (v: "fp" | "tp") => {
      view = v;
      camera.fov = v === "fp" ? FP_FOV : TP_FOV;
      camera.near = v === "fp" ? FP_NEAR : TP_NEAR;
      camera.updateProjectionMatrix();
    };

    // --- Entrées ----------------------------------------------------------
    const keys = new Set<string>();
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.code === "KeyM" && onExitRef.current) {
        onExitRef.current();
        return;
      }
      if (ev.code === "KeyC" && !ev.repeat) setView(view === "fp" ? "tp" : "fp");
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(ev.code)) {
        ev.preventDefault();
      }
      keys.add(ev.code);
      setStarted(true);
    };
    const onKeyUp = (ev: KeyboardEvent) => keys.delete(ev.code);
    const onMouseMove = (ev: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= ev.movementX * 0.0022;
      if (view === "fp") {
        fpPitch = THREE.MathUtils.clamp(fpPitch - ev.movementY * 0.0022, FP_PITCH_MIN, FP_PITCH_MAX);
      } else {
        tpPitch = THREE.MathUtils.clamp(tpPitch + ev.movementY * 0.0022, TP_PITCH_MIN, TP_PITCH_MAX);
      }
    };
    const lockPointer = () => {
      const result: unknown = renderer.domElement.requestPointerLock?.();
      if (result instanceof Promise) result.catch(() => {});
    };
    const onClick = () => {
      setStarted(true);
      lockPointer();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("click", onClick);

    // --- Taille -----------------------------------------------------------
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // --- Boucle -----------------------------------------------------------
    const vel = new THREE.Vector2();
    const dir = new THREE.Vector2();
    const prev = new THREE.Vector2();
    const feet = new THREE.Vector3();
    const ground = new THREE.Vector3();
    const target = new THREE.Vector3();
    let moveSpeed = 0;
    let bodyYaw = wrapAngle(yaw + Math.PI); // le modèle regarde vers +Z, la caméra vers -Z
    let jumpY = 0;
    let jumpV = 0;
    const clock = new THREE.Clock();
    let raf = 0;

    const groundNormal = (x: number, z: number) => {
      const e = 0.2;
      return ground
        .set(
          -(heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e),
          1,
          -(heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e)
        )
        .normalize();
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const k = (c: string) => keys.has(c);

      yaw += ((k("ArrowLeft") ? 1 : 0) - (k("ArrowRight") ? 1 : 0)) * 1.8 * dt;
      yaw = wrapAngle(yaw);

      // Déplacement, par rapport à la direction du regard.
      const fwd = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
      const side = (k("KeyD") ? 1 : 0) - (k("KeyA") ? 1 : 0);
      const speed = k("ShiftLeft") || k("ShiftRight") ? RUN_SPEED : WALK_SPEED;
      dir.set(
        -Math.sin(yaw) * fwd + Math.cos(yaw) * side,
        -Math.cos(yaw) * fwd - Math.sin(yaw) * side
      );
      if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed);
      vel.lerp(dir, 1 - Math.exp(-8 * dt));

      prev.set(player.x, player.z);
      player.x += vel.x * dt;
      player.z += vel.y * dt;
      built.clamp?.(player);
      resolveCollisions(player, colliders);
      built.clamp?.(player);
      // Vitesse réellement parcourue (contre un rocher, il ne court pas sur place).
      const actual = Math.hypot(player.x - prev.x, player.z - prev.y) / Math.max(dt, 1e-4);
      moveSpeed += (actual - moveSpeed) * (1 - Math.exp(-12 * dt));

      // Saut.
      let jumped = false;
      if (k("Space") && jumpY === 0 && jumpV === 0) {
        jumpV = JUMP_SPEED;
        jumped = true;
      }
      jumpV -= GRAVITY * dt;
      jumpY = Math.max(0, jumpY + jumpV * dt);
      if (jumpY === 0 && jumpV < 0) jumpV = 0;

      // Orientation du corps : il se tourne dans le sens de la marche.
      // Tous les angles restent entre -π et π, et chaque écart est ramené entre -π et π
      // avant d'être lissé : le corps prend toujours le chemin le plus court.
      const viewFacing = wrapAngle(yaw + Math.PI);
      const prevBodyYaw = bodyYaw;
      let backward = false;
      if (vel.length() > 0.05) {
        let moveYaw = Math.atan2(vel.x, vel.y);
        if (view === "fp" && Math.abs(wrapAngle(moveYaw - viewFacing)) > Math.PI / 2 + 0.2) {
          // À la première personne, S le fait reculer sans se retourner.
          moveYaw += Math.PI;
          backward = true;
        }
        const diff = wrapAngle(moveYaw - bodyYaw);
        bodyYaw = wrapAngle(bodyYaw + diff * (1 - Math.exp(-10 * dt)));
      }
      if (view === "fp") {
        // La tête ne tourne pas au-delà de sa limite : le corps suit.
        const off = wrapAngle(viewFacing - bodyYaw);
        if (Math.abs(off) > HEAD_YAW_MAX) bodyYaw = wrapAngle(viewFacing - Math.sign(off) * HEAD_YAW_MAX);
      }
      const turnRate = wrapAngle(bodyYaw - prevBodyYaw) / Math.max(dt, 1e-4);
      const lookYaw = THREE.MathUtils.clamp(wrapAngle(viewFacing - bodyYaw), -HEAD_YAW_MAX, HEAD_YAW_MAX);

      feet.set(player.x, heightAt(player.x, player.z) + jumpY, player.z);

      if (fennec) {
        fennec.place(feet, bodyYaw, groundNormal(player.x, player.z), dt);
        if (jumped) fennec.jump(AIR_TIME);
        fennec.update(dt, {
          speed: moveSpeed,
          backward,
          airborne: jumpY > 0 || jumpV > 0,
          lookYaw,
          lookPitch: view === "fp" ? fpPitch + headRaise(fpPitch) : 0,
          turnRate,
        });
      }

      // --- Caméra -----------------------------------------------------------
      // En vue par les yeux, les globes oculaires sont cachés (la caméra est juste au-dessus).
      fennec?.setEyesVisible(view !== "fp");
      if (view === "fp") {
        if (fennec) {
          // Aux yeux du fennec, sans le balancement de la marche ; elle suit la tête.
          fennec.firstPersonEye(camera.position);
          camera.rotation.set(fennec.bodyPitch() + fpPitch + fennec.headPitchOffset(), yaw, 0);
        } else {
          // Le modèle n'est pas encore chargé.
          camera.position.set(feet.x, feet.y + eye, feet.z);
          camera.rotation.set(fpPitch, yaw, 0);
        }
      } else {
        target.set(feet.x, feet.y + TP_TARGET_HEIGHT, feet.z);
        const flat = Math.cos(tpPitch) * TP_DISTANCE;
        camera.position.set(
          target.x + Math.sin(yaw) * flat,
          target.y + Math.sin(tpPitch) * TP_DISTANCE,
          target.z + Math.cos(yaw) * flat
        );
        const floor = heightAt(camera.position.x, camera.position.z) + 0.12;
        if (camera.position.y < floor) camera.position.y = floor;
        camera.lookAt(target);
      }

      built.onFrame?.(dt, camera, feet);

      renderer.render(scene, camera);
    };
    tick();

    // --- Nettoyage --------------------------------------------------------
    return () => {
      disposed = true;
      camera.removeFromParent();
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onClick);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      (fennec as Fennec | null)?.dispose();
      built.dispose?.();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [world]);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", minHeight: 320, ...style }}
    >
      {!started && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            color: "#fbe6cf",
            background: "rgba(20, 14, 30, 0.45)",
            font: "500 17px/1.5 system-ui, sans-serif",
            textAlign: "center",
            pointerEvents: "none",
            padding: 24,
          }}
        >
          <strong style={{ fontSize: 24, fontWeight: 600 }}>{title}</strong>
          <span>Cliquez pour tourner la tête à la souris, ou utilisez directement le clavier.</span>
          <span style={{ opacity: 0.8 }}>{hint}</span>
          {onExit && <span style={{ opacity: 0.6, fontSize: 14 }}>M : revenir aux plateaux</span>}
        </div>
      )}
    </div>
  );
}
