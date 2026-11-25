import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { WorldFactory } from "./scenes/types";
import { resolveCollisions } from "./scenes/collide";

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
    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 1500);
    camera.rotation.order = "YXZ";
    scene.add(camera);

    const built = world({ scene, camera, renderer, mount });
    const colliders = built.colliders ?? [];
    const spawn = built.spawn ?? {};
    const eye = built.eye ?? 0.26;
    let yaw = spawn.yaw ?? 0;
    let pitch = spawn.pitch ?? 0.04;
    const player = new THREE.Vector3(spawn.x ?? 0, 0, spawn.z ?? 0);



    // --- Entrées ----------------------------------------------------------
    const keys = new Set<string>();
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.code === "KeyM" && onExitRef.current) {
        onExitRef.current();
        return;
      }
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
      pitch = THREE.MathUtils.clamp(pitch - ev.movementY * 0.0022, -1.2, 1.2);
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
    let jumpY = 0;
    let jumpV = 0;
    let bobPhase = 0;
    const clock = new THREE.Clock();
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const k = (c: string) => keys.has(c);

      yaw += ((k("ArrowLeft") ? 1 : 0) - (k("ArrowRight") ? 1 : 0)) * 1.8 * dt;

      const fwd = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
      const side = (k("KeyD") ? 1 : 0) - (k("KeyA") ? 1 : 0);
      const speed = k("ShiftLeft") || k("ShiftRight") ? 6 : 2.6;

      const dir = new THREE.Vector2(
        -Math.sin(yaw) * fwd + Math.cos(yaw) * side,
        -Math.cos(yaw) * fwd - Math.sin(yaw) * side
      );
      if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed);
      vel.lerp(dir, 1 - Math.exp(-10 * dt));

      player.x += vel.x * dt;
      player.z += vel.y * dt;
      built.clamp?.(player);
      resolveCollisions(player, colliders);
      built.clamp?.(player);

      if (k("Space") && jumpY === 0) jumpV = 3.4;
      jumpV -= 9.8 * dt;
      jumpY = Math.max(0, jumpY + jumpV * dt);
      if (jumpY === 0 && jumpV < 0) jumpV = 0;

      const moving = vel.length();
      bobPhase += moving * dt * 3.2;
      const bob = jumpY === 0 ? Math.sin(bobPhase) * 0.012 * Math.min(moving / 2.6, 1.5) : 0;

      player.y = built.heightAt(player.x, player.z) + eye + jumpY + bob;
      camera.position.copy(player);
      camera.rotation.set(pitch, yaw, 0);

      built.onFrame?.(dt, camera);

      renderer.render(scene, camera);
    };
    tick();

    // --- Nettoyage --------------------------------------------------------
    return () => {
      camera.removeFromParent();
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onClick);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
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
          <span>Cliquez pour regarder à la souris, ou utilisez directement le clavier.</span>
          <span style={{ opacity: 0.8 }}>{hint}</span>
          {onExit && <span style={{ opacity: 0.6, fontSize: 14 }}>M : revenir aux plateaux</span>}
        </div>
      )}
    </div>
  );
}
