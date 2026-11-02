/**
 * Glisser-déposer des cartes du Kanban aux Pointer Events (souris, stylet et doigt).
 *
 * - Souris : la carte se soulève après 6 px de déplacement ; un simple clic l'ouvre.
 * - Doigt : appui long (280 ms) pour la soulever ; un glissement plus tôt reste un défilement du tableau.
 * - La carte suit le pointeur 1:1, à l'endroit exact où elle a été saisie (copie flottante : le tableau,
 *   qui défile horizontalement, couperait la carte elle-même). Le tableau défile seul près de ses bords.
 * - Au lâcher, la copie glisse jusqu'à la place de la carte (nouvelle colonne, ou retour à l'origine)
 *   avec une durée qui reprend la vitesse du geste, puis disparaît. Échap annule.
 */
import { useEffect, useRef, useState } from "react";
import { reducedMotion, SETTLE, settleDuration, useVelocity } from "./motion";

type Drag = {
  id: number;
  pointer: number;
  touch: boolean;
  card: HTMLElement;
  board: HTMLElement | null;
  x0: number;
  y0: number;
  x: number;
  y: number;
  rect: DOMRect;
  ghost: HTMLElement | null;
  timer: number;
  lane: string | null;
  from: string;
};

export function useBoardDrag({ laneOf, onDrop }: { laneOf: (id: number) => string; onDrop: (id: number, lane: string) => void }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const velocity = useVelocity();
  const scrollLoop = useRef(0);

  const laneAt = (x: number, y: number) =>
    (document.elementsFromPoint(x, y).find((el) => (el as HTMLElement).dataset?.lane) as HTMLElement | undefined)?.dataset.lane ?? null;

  const preventScroll = (e: TouchEvent) => e.preventDefault();

  const lift = (d: Drag) => {
    const ghost = d.card.cloneNode(true) as HTMLElement;
    ghost.classList.add("card-ghost");
    ghost.removeAttribute("data-card-id");
    Object.assign(ghost.style, { left: `${d.rect.left}px`, top: `${d.rect.top}px`, width: `${d.rect.width}px`, height: `${d.rect.height}px` });
    document.body.appendChild(ghost);
    d.ghost = ghost;
    d.card.setPointerCapture?.(d.pointer);
    document.body.classList.add("is-dragging");
    if (d.touch) {
      document.addEventListener("touchmove", preventScroll, { passive: false });
      navigator.vibrate?.(8);
    }
    setDragging(d.id);
    move(d, d.x, d.y);
    autoScroll();
  };

  const move = (d: Drag, x: number, y: number) => {
    d.x = x;
    d.y = y;
    if (!d.ghost) return;
    d.ghost.style.transform = `translate(${x - d.x0}px, ${y - d.y0}px) scale(1.03) rotate(-1deg)`;
    const lane = laneAt(x, y);
    if (lane !== d.lane) {
      d.lane = lane;
      setOver(lane);
    }
  };

  // Près des bords du tableau, il défile tout seul, d'autant plus vite que le pointeur s'en approche.
  const autoScroll = () => {
    cancelAnimationFrame(scrollLoop.current);
    const step = () => {
      const d = drag.current;
      if (!d?.ghost || !d.board) return;
      const r = d.board.getBoundingClientRect();
      const edge = 64;
      const speed = d.x < r.left + edge ? -(r.left + edge - d.x) : d.x > r.right - edge ? d.x - (r.right - edge) : 0;
      if (speed) {
        d.board.scrollLeft += speed * 0.35;
        move(d, d.x, d.y);
      }
      scrollLoop.current = requestAnimationFrame(step);
    };
    scrollLoop.current = requestAnimationFrame(step);
  };

  const finish = (d: Drag, commit: boolean) => {
    window.clearTimeout(d.timer);
    cancelAnimationFrame(scrollLoop.current);
    document.removeEventListener("touchmove", preventScroll);
    document.body.classList.remove("is-dragging");
    drag.current = null;
    setOver(null);
    const ghost = d.ghost;
    if (!ghost) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    if (commit && d.lane && d.lane !== d.from) onDrop(d.id, d.lane);
    const v = velocity.get();
    // Attendre que la carte ait pris sa nouvelle place pour y faire atterrir la copie.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const card = document.querySelector<HTMLElement>(`[data-card-id="${d.id}"]`);
        const home = card?.getBoundingClientRect() ?? d.rect;
        const dx = home.left - d.rect.left;
        const dy = home.top - d.rect.top;
        const distance = Math.hypot(home.left - (d.rect.left + d.x - d.x0), home.top - (d.rect.top + d.y - d.y0));
        const ms = settleDuration(distance, Math.hypot(v.x, v.y), 180, 320);
        const done = () => {
          ghost.remove();
          setDragging(null);
        };
        if (!ms || reducedMotion()) return done();
        ghost.style.transition = `transform ${ms}ms ${SETTLE}, box-shadow ${ms}ms ease`;
        ghost.classList.add("settling");
        ghost.style.transform = `translate(${dx}px, ${dy}px)`;
        window.setTimeout(done, ms);
      }),
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drag.current?.ghost) {
        e.preventDefault();
        finish(drag.current, false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const d = drag.current;
      if (d) {
        d.ghost?.remove();
        window.clearTimeout(d.timer);
        document.removeEventListener("touchmove", preventScroll);
        document.body.classList.remove("is-dragging");
      }
    };
  }, []);

  const cardProps = (id: number) => ({
    "data-card-id": id,
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.button !== 0 || drag.current) return;
      const card = e.currentTarget;
      const d: Drag = {
        id,
        pointer: e.pointerId,
        touch: e.pointerType === "touch",
        card,
        board: card.closest<HTMLElement>(".board"),
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        rect: card.getBoundingClientRect(),
        ghost: null,
        timer: 0,
        lane: laneOf(id),
        from: laneOf(id),
      };
      drag.current = d;
      velocity.reset();
      velocity.add(e.clientX, e.clientY);
      if (d.touch) d.timer = window.setTimeout(() => drag.current === d && lift(d), 280);
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.pointer !== e.pointerId) return;
      velocity.add(e.clientX, e.clientY);
      if (d.ghost) return move(d, e.clientX, e.clientY);
      const distance = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
      if (d.touch) {
        // Le doigt a bougé avant l'appui long : c'est un défilement, pas une saisie.
        if (distance > 8) {
          window.clearTimeout(d.timer);
          drag.current = null;
        }
        return;
      }
      if (distance > 6) {
        d.x = e.clientX;
        d.y = e.clientY;
        lift(d);
      }
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.pointer !== e.pointerId) return;
      if (!d.ghost) {
        window.clearTimeout(d.timer);
        drag.current = null;
        return;
      }
      finish(d, true);
    },
    onPointerCancel(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.pointer !== e.pointerId) return;
      if (d.ghost) finish(d, false);
      else {
        window.clearTimeout(d.timer);
        drag.current = null;
      }
    },
    onContextMenu(e: React.MouseEvent) {
      // Appui long au doigt : pas de menu contextuel ni de sélection, c'est une saisie de carte.
      if (drag.current?.touch) e.preventDefault();
    },
    onClickCapture(e: React.MouseEvent) {
      if (suppressClick.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  });

  const laneProps = (lane: string) => ({ "data-lane": lane });

  return { dragging, over, cardProps, laneProps };
}
