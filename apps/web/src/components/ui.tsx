import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { compact, fcfa, relativeDays } from "../lib/format";
import { STAGES } from "../lib/types";
import { EXIT_MS, project, reducedMotion, rubberband, SETTLE, settleDuration, usePresence, useVelocity } from "../lib/motion";
import { IconChevron, IconClose, IconSearch, MarkBad, MarkGood, MarkInfo, MarkNone, MarkWarn } from "./icons";

/* ---------- Montant ---------- */

export function Amount({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  return (
    <span className={`num ${className}`} title={value != null ? fcfa(value) : undefined}>
      {compact(value)}
    </span>
  );
}

/* ---------- Étape : jauge de sept segments ---------- */

type StageDef = { code: string; label: string; short: string };

/**
 * Jauge d'avancement : un segment par étape du flux. Par défaut les étapes IAT (M0 → M6) ;
 * IAP passe ses étapes immobilières (P0 → P5) et son étape « Conclu ».
 */
export function Stage({
  code,
  withLabel = true,
  stages = STAGES,
  flow = 7,
  wonCode = "M6",
}: {
  code: string | null;
  withLabel?: boolean;
  stages?: StageDef[];
  /** Nombre d'étapes du flux (hors perdu / clôturé). */
  flow?: number;
  wonCode?: string;
}) {
  const index = stages.findIndex((s) => s.code === code);
  const stage = stages[index];
  const ended = code === "LOST" || code === "CLOSED";
  return (
    <span className={`stage${code === wonCode ? " won" : ""}${ended ? " ended" : ""}`} title={stage?.label}>
      <span className="stage-meter" aria-hidden>
        {Array.from({ length: flow }, (_, i) => (
          <i key={i} className={!ended && i <= index ? "on" : ""} />
        ))}
      </span>
      {withLabel && <span className="stage-label">{stage ? (ended ? stage.short : `${stage.code} ${stage.short}`) : "—"}</span>}
    </span>
  );
}

export function Prio({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={`prio ${value.toLowerCase()}`}>{value}</span>;
}

/* ---------- Statut : pictogramme + libellé, jamais la couleur seule ---------- */

export type Tone = "good" | "warn" | "bad" | "info" | "none";
const MARKS = { good: MarkGood, warn: MarkWarn, bad: MarkBad, info: MarkInfo, none: MarkNone };

export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Mark = MARKS[tone];
  return (
    <span className={`status ${tone}`}>
      <Mark />
      {children}
    </span>
  );
}

export function healthTone(health: string | null | undefined): Tone {
  if (health === "Bon") return "good";
  if (health === "À surveiller") return "warn";
  if (health === "À risque") return "bad";
  return "none";
}

export function Health({ value }: { value: string | null | undefined }) {
  return <Status tone={healthTone(value)}>{value ?? "À renseigner"}</Status>;
}

export function renewalTone(alert: string): Tone {
  if (alert === "Échu - urgent") return "bad";
  if (alert.startsWith("À relancer")) return "warn";
  if (alert === "Renouvelé") return "good";
  if (alert === "À venir") return "info";
  return "none";
}

export function Due({ date, days, done = false }: { date: string | null; days: number | null; done?: boolean }) {
  if (!date) return <span className="due">Sans échéance</span>;
  const late = !done && days != null && days < 0;
  const soon = !done && days != null && days >= 0 && days <= 3;
  return (
    <span className={`due${late ? " late" : soon ? " soon" : ""}`}>
      {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}
      {!done && days != null && Math.abs(days) <= 60 ? ` · ${relativeDays(days)}` : ""}
    </span>
  );
}

export function Dots({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value == null) return <span className="muted">—</span>;
  return (
    <span className="dots" title={`${value} sur ${max}`} aria-label={`${value} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < value ? "on" : ""} />
      ))}
    </span>
  );
}

/* ---------- Contrôles ---------- */

export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search">
      <IconSearch />
      <span className="visually-hidden">{placeholder}</span>
      <input className="input" type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: (string | { value: string; label: string })[];
}) {
  return (
    <select className={`select pill-select${value ? " on" : ""}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

/* ---------- Rangée de liste groupée ---------- */

export function Row({
  lead,
  title,
  meta,
  aside,
  onClick,
  className = "",
}: {
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button type="button" className={`row ${className}`} onClick={onClick}>
      {lead}
      <span className="row-main">
        <span className="row-title">{title}</span>
        {meta && <span className="row-meta">{meta}</span>}
      </span>
      {aside && <span className="row-aside">{aside}</span>}
      <IconChevron className="chev" />
    </button>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Loading({ height = 240 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-label="Chargement" />;
}

/* ---------- Panneau latéral ---------- */

/**
 * Fenêtre d'édition. Toute fermeture (bouton, Échap, voile, enregistrement, glissement vers le bas) joue la
 * sortie avant de démonter : `onClose` n'est appelé qu'à la fin de l'animation.
 * `canClose` peut refuser une fermeture demandée par l'utilisateur (saisie non enregistrée) ;
 * `dismissRef` donne au parent la fermeture animée (après un enregistrement réussi).
 */
export function Sheet({
  caption,
  title,
  onClose,
  canClose,
  dismissRef,
  children,
  footer,
  aside,
}: {
  caption?: ReactNode;
  title: ReactNode;
  onClose: () => void;
  canClose?: () => boolean | Promise<boolean>;
  dismissRef?: { current: (() => void) | null };
  children: ReactNode;
  footer?: ReactNode;
  /** Colonne latérale (historique…), placée sous le formulaire sur les écrans étroits. */
  aside?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const canCloseRef = useRef(canClose);
  canCloseRef.current = canClose;
  const leavingRef = useRef(false);

  const dismiss = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(() => closeRef.current(), reducedMotion() ? 0 : EXIT_MS);
  }, []);
  if (dismissRef) dismissRef.current = dismiss;
  const request = useCallback(async () => {
    if (leavingRef.current) return;
    if (canCloseRef.current && !(await canCloseRef.current())) return;
    dismiss();
  }, [dismiss]);

  // Le focus n'est pris qu'à l'ouverture : la fonction de fermeture peut changer à chaque frappe.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    // La fenêtre couvre la page : on fige le défilement derrière elle.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && request();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [request]);

  // Glisser l'en-tête vers le bas : la fenêtre suit le doigt, et part si le geste est lancé vers le bas.
  const drag = useRef<{ id: number; y0: number; dy: number } | null>(null);
  const velocity = useVelocity();
  const setOffset = (dy: number, transition = "none") => {
    const sheet = ref.current;
    if (!sheet) return;
    sheet.style.transition = transition;
    sheet.style.transform = dy ? `translateY(${dy}px)` : "";
    if (scrim.current) {
      scrim.current.style.transition = transition.replace("transform", "opacity");
      scrim.current.style.opacity = String(Math.max(0, 1 - Math.max(dy, 0) / (sheet.offsetHeight || 1)));
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    drag.current = { id: e.pointerId, y0: e.clientY, dy: 0 };
    velocity.reset();
    velocity.add(0, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const raw = e.clientY - d.y0;
    // Vers le haut il n'y a rien : la fenêtre résiste au lieu de s'arrêter net.
    d.dy = raw >= 0 ? raw : rubberband(raw, ref.current?.offsetHeight ?? 600);
    velocity.add(0, e.clientY);
    setOffset(d.dy);
  };
  const onPointerUp = async (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const vy = velocity.get().y;
    const height = ref.current?.offsetHeight ?? 600;
    const landing = d.dy + project(vy);
    if (d.dy > 4 && landing > height * 0.35 && vy >= 0 && (!canCloseRef.current || (await canCloseRef.current()))) {
      const ms = settleDuration(height - d.dy, vy, 140, 260);
      setOffset(height, `transform ${ms}ms ${SETTLE}`);
      leavingRef.current = true;
      window.setTimeout(() => closeRef.current(), ms);
      return;
    }
    setOffset(0, `transform ${settleDuration(d.dy, vy)}ms ${SETTLE}`);
  };

  return (
    <>
      <div className={`scrim${leaving ? " leaving" : ""}`} ref={scrim} onClick={request} />
      <div className={`sheet${leaving ? " leaving" : ""}`} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <div
          className="sheet-head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="sheet-grabber" aria-hidden />
          <div className="sheet-inner">
            <div className="sheet-title">
              {caption && <div className="t-caption">{caption}</div>}
              <h2>{title}</h2>
            </div>
            <button type="button" className="btn icon-btn" onClick={request} aria-label="Fermer">
              <IconClose />
            </button>
          </div>
        </div>
        <div className="sheet-body">
          <div className={`sheet-inner sheet-layout${aside ? " with-aside" : ""}`}>
            <div className="sheet-main">{children}</div>
            {aside && <aside className="sheet-aside">{aside}</aside>}
          </div>
        </div>
        {footer && (
          <div className="sheet-foot">
            <div className="sheet-inner">{footer}</div>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- Confirmation ---------- */

type ConfirmOptions = { title: string; message?: ReactNode; confirm: string; cancel?: string; destructive?: boolean };
type ConfirmState = ConfirmOptions & { resolve: (ok: boolean) => void };
const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

/**
 * Boîte de confirmation de l'application (remplace window.confirm) : réservée aux actions irréversibles ou
 * à la perte d'une saisie. Le bouton prudent a le focus ; Échap et le voile annulent.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const last = useRef<ConfirmState | null>(null);
  if (state) last.current = state;
  const { mounted, leaving } = usePresence(state != null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })), []);
  const answer = useCallback(
    (ok: boolean) =>
      setState((s) => {
        s?.resolve(ok);
        return null;
      }),
    [],
  );
  useEffect(() => {
    if (!state) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Échap ferme la confirmation, pas la fenêtre qui est dessous.
      e.preventDefault();
      e.stopImmediatePropagation();
      answer(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [state, answer]);
  const shown = state ?? last.current;
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {mounted && shown && (
        <>
          <div className={`scrim confirm-scrim${leaving ? " leaving" : ""}`} onClick={() => answer(false)} />
          <div
            className={`confirm${leaving ? " leaving" : ""}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={shown.message ? "confirm-message" : undefined}
          >
            <h2 id="confirm-title">{shown.title}</h2>
            {shown.message && <p id="confirm-message">{shown.message}</p>}
            <div className="confirm-actions">
              <button type="button" className="btn" ref={cancelButton} onClick={() => answer(false)}>
                {shown.cancel ?? "Annuler"}
              </button>
              <button type="button" className={`btn ${shown.destructive ? "btn-danger" : "btn-primary"}`} onClick={() => answer(true)}>
                {shown.confirm}
              </button>
            </div>
          </div>
        </>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

/* ---------- Notifications ---------- */

type ToastAction = { label: string; onClick: () => void };
type ToastState = { text: string; error?: boolean; action?: ToastAction; key: number } | null;
const ToastContext = createContext<(text: string, error?: boolean, action?: ToastAction) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const last = useRef<ToastState>(null);
  if (toast) last.current = toast;
  const { mounted, leaving } = usePresence(toast != null);
  const timer = useRef<number>(0);
  const show = useCallback((text: string, error = false, action?: ToastAction) => {
    window.clearTimeout(timer.current);
    setToast({ text, error, action, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), error || action ? 5000 : 2400);
  }, []);
  const shown = toast ?? last.current;
  return (
    <ToastContext.Provider value={show}>
      {children}
      {mounted && shown && (
        <div key={shown.key} className={`toast${shown.error ? " error" : ""}${leaving ? " leaving" : ""}`} role="status" aria-live="polite">
          {shown.text}
          {shown.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                shown.action!.onClick();
                setToast(null);
              }}
            >
              {shown.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
