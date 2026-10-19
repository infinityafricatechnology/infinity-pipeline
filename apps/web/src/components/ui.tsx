import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { compact, fcfa, relativeDays } from "../lib/format";
import { STAGES } from "../lib/types";
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

export function Stage({ code, withLabel = true }: { code: string | null; withLabel?: boolean }) {
  const index = STAGES.findIndex((s) => s.code === code);
  const stage = STAGES[index];
  const ended = code === "LOST" || code === "CLOSED";
  return (
    <span className={`stage${code === "M6" ? " won" : ""}${ended ? " ended" : ""}`} title={stage?.label}>
      <span className="stage-meter" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
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

export function Sheet({
  caption,
  title,
  onClose,
  children,
  footer,
  aside,
}: {
  caption?: ReactNode;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Colonne latérale (historique…), placée sous le formulaire sur les écrans étroits. */
  aside?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Le focus n'est pris qu'à l'ouverture : la fonction de fermeture peut changer à chaque frappe.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    // La fenêtre couvre la page : on fige le défilement derrière elle.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  return (
    <>
      <div className="scrim" onClick={() => closeRef.current()} />
      <div className="sheet" role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <div className="sheet-head">
          <div className="sheet-inner">
            <div className="sheet-title">
              {caption && <div className="t-caption">{caption}</div>}
              <h2>{title}</h2>
            </div>
            <button type="button" className="btn icon-btn" onClick={() => closeRef.current()} aria-label="Fermer">
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

/* ---------- Notifications ---------- */

type ToastAction = { label: string; onClick: () => void };
type ToastState = { text: string; error?: boolean; action?: ToastAction } | null;
const ToastContext = createContext<(text: string, error?: boolean, action?: ToastAction) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<number>(0);
  const show = useCallback((text: string, error = false, action?: ToastAction) => {
    window.clearTimeout(timer.current);
    setToast({ text, error, action });
    timer.current = window.setTimeout(() => setToast(null), error || action ? 5000 : 2400);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast${toast.error ? " error" : ""}`} role="status" aria-live="polite">
          {toast.text}
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.action!.onClick();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
