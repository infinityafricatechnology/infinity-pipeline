/**
 * Primitives de mouvement partagées : présence (laisser jouer une animation de sortie), projection de l'élan
 * d'un geste, résistance élastique en bout de course et suivi de vitesse du pointeur.
 */
import { useEffect, useRef, useState } from "react";

/** Durée des sorties (doit correspondre aux animations `*-out` de app.css). */
export const EXIT_MS = 180;

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Garde un élément affiché le temps de son animation de sortie.
 * `mounted` : à rendre ; `leaving` : appliquer la classe de sortie.
 */
export function usePresence(open: boolean, ms = EXIT_MS) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), reducedMotion() ? 0 : ms);
    return () => window.clearTimeout(timer);
  }, [open, ms]);
  return { mounted: open || mounted, leaving: !open && mounted };
}

/**
 * Point d'arrivée d'un geste lâché avec une vitesse donnée (px/s), comme la décélération d'un défilement
 * (fonction de projection d'Apple, « Designing Fluid Interfaces »).
 */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Résistance progressive au-delà d'une limite : plus on tire, moins l'élément suit. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Vitesse instantanée (px/s) à partir des derniers déplacements du pointeur. */
export function useVelocity() {
  const samples = useRef<{ x: number; y: number; t: number }[]>([]);
  return {
    reset() {
      samples.current = [];
    },
    add(x: number, y: number) {
      const now = performance.now();
      samples.current = [...samples.current.filter((s) => now - s.t < 100), { x, y, t: now }];
    },
    get() {
      const s = samples.current;
      if (s.length < 2) return { x: 0, y: 0 };
      const first = s[0];
      const last = s[s.length - 1];
      const dt = Math.max(last.t - first.t, 1) / 1000;
      return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
    },
  };
}

/** Courbe de fin de geste : départ rapide (reprend l'élan du doigt), arrivée douce, sans rebond. */
export const SETTLE = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Durée de l'animation de fin de geste : plus le doigt allait vite, plus elle est courte (≈ continuité de vitesse). */
export function settleDuration(distance: number, velocity: number, min = 160, max = 380) {
  if (reducedMotion()) return 0;
  const v = Math.abs(velocity);
  if (v < 50) return max;
  // La courbe SETTLE démarre avec une pente ≈ 2,2 × la vitesse moyenne : on aligne cette pente sur celle du doigt.
  return Math.min(max, Math.max(min, ((Math.abs(distance) * 2.2) / v) * 1000));
}
