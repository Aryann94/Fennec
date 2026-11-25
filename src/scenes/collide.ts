import type { Collider } from "./types";

export const PLAYER_RADIUS = 0.35;

/**
 * Repousse un point (x, z) hors des obstacles, avec le rayon du joueur.
 * Deux passes suffisent à stabiliser les coins où deux boîtes se touchent.
 */
export function resolveCollisions(
  p: { x: number; z: number },
  colliders: Collider[],
  radius = PLAYER_RADIUS
) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (c.kind === "circle") {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const minD = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD) {
          const d = Math.sqrt(d2) || 0.0001;
          p.x = c.x + (dx / d) * minD;
          p.z = c.z + (dz / d) * minD;
        }
      } else {
        const minX = c.minX - radius;
        const maxX = c.maxX + radius;
        const minZ = c.minZ - radius;
        const maxZ = c.maxZ + radius;
        if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
          const dl = p.x - minX;
          const dr = maxX - p.x;
          const db = p.z - minZ;
          const dt = maxZ - p.z;
          const m = Math.min(dl, dr, db, dt);
          if (m === dl) p.x = minX;
          else if (m === dr) p.x = maxX;
          else if (m === db) p.z = minZ;
          else p.z = maxZ;
        }
      }
    }
  }
}
