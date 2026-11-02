import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { api, useApi } from "../lib/api";
import { initials } from "../lib/format";
import { project, rubberband, SETTLE, settleDuration, usePresence, useVelocity } from "../lib/motion";
import { equivalentPath, SPACE_LIST, type SpaceCode, useSpace } from "../lib/space";
import type { Me } from "../lib/types";
import { CommandPalette } from "./CommandPalette";
import { IconCheck, IconChevron, IconLogout, IconMenu, IconSearch, IconSwitch } from "./icons";
import { SpaceMark } from "./Logo";
import { NAV, SUMMARY_PATH } from "./nav";

export const APP_NAME = "Infinity Pipeline";

function Item({
  to,
  icon,
  children,
  count,
  alert,
  countLabel,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  count?: number;
  alert?: boolean;
  /** Ce que compte le nombre, lu par les lecteurs d'écran et montré au survol. */
  countLabel?: string;
}) {
  return (
    <NavLink to={to} end={to.split("/").length === 2} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      {icon}
      {children}
      {count != null && count > 0 && (
        <span className={`nav-count num${alert ? " alert" : ""}`} title={countLabel ? `${count} ${countLabel}` : undefined}>
          {count}
          {countLabel && <span className="visually-hidden"> {countLabel}</span>}
        </span>
      )}
    </NavLink>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const SWITCH_SHORTCUT = isMac ? "⌘⇧E" : "Ctrl ⇧ E";

/** Aller dans un autre espace en restant, si possible, sur la même rubrique. */
export function useSwitchSpace() {
  const navigate = useNavigate();
  const location = useLocation();
  return (target: SpaceCode) => navigate(equivalentPath(location.pathname, target));
}

/**
 * Marque de l'espace courant ; quand l'utilisateur a accès à plusieurs filiales, elle ouvre le menu
 * de bascule (logo, nom et rôle de chaque espace, coche sur l'espace actif).
 */
function SpaceSwitcher({ me, compact = false }: { me: Me; compact?: boolean }) {
  const space = useSpace();
  const switchTo = useSwitchSpace();
  const [open, setOpen] = useState(false);
  const menu = usePresence(open, 140);
  const box = useRef<HTMLDivElement>(null);
  const available = SPACE_LIST.filter((s) => me.user.spaces.includes(s.code));
  const several = available.length > 1;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const label = (
    <>
      <SpaceMark space={space.code} className={compact ? "logo" : undefined} />
      <span className="brand-name">
        {compact ? space.name : APP_NAME}
        {!compact && <span className="brand-sub">Espace {space.name}</span>}
      </span>
    </>
  );

  if (!several) {
    return (
      <Link to={space.base} className={compact ? "brand compact" : "brand"}>
        {label}
      </Link>
    );
  }
  return (
    <div className={`space-switcher${compact ? " compact" : ""}`} ref={box}>
      <button
        type="button"
        className={compact ? "brand compact" : "brand"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={`Changer d’espace (${SWITCH_SHORTCUT})`}
      >
        {label}
        <IconChevron className="brand-chev" aria-hidden />
      </button>
      {menu.mounted && (
        <div className={`space-menu${menu.leaving ? " leaving" : ""}`} role="menu" aria-label="Espaces" inert={menu.leaving || undefined}>
          <div className="space-menu-head">Espaces</div>
          {available.map((s) => (
            <button
              key={s.code}
              type="button"
              role="menuitemradio"
              aria-checked={s.code === space.code}
              className={`space-option${s.code === space.code ? " current" : ""}`}
              data-space-option={s.code}
              onClick={() => {
                setOpen(false);
                if (s.code !== space.code) switchTo(s.code);
              }}
            >
              <SpaceMark space={s.code} />
              <span className="row-main">
                <span className="row-title">{s.name}</span>
                <span className="row-meta">{s.fullName}</span>
              </span>
              {s.code === space.code && <IconCheck className="space-check" />}
            </button>
          ))}
          <div className="space-menu-foot">
            <Link to="/" onClick={() => setOpen(false)}>
              Tous les espaces
            </Link>
            <kbd>{SWITCH_SHORTCUT}</kbd>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tiroir de navigation mobile : glissé vers la gauche, il suit le doigt (1:1), résiste s'il est tiré vers la
 * droite et, au lâcher, se ferme si l'élan le projette au-delà de sa moitié.
 */
function useDrawerSwipe(open: boolean, close: () => void) {
  const ref = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x0: number; y0: number; dx: number; active: boolean } | null>(null);
  const velocity = useVelocity();
  const narrow = () => window.matchMedia("(max-width: 860px)").matches;
  const place = (dx: number, transition = "none") => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.translate = dx ? `${dx}px 0` : "";
    if (scrimRef.current) {
      scrimRef.current.style.transition = transition.replace("translate", "opacity");
      scrimRef.current.style.opacity = dx ? String(Math.max(0, 1 + dx / el.offsetWidth)) : "";
    }
  };
  // Après une fermeture par le geste, le voile est déjà transparent : on le laisse ainsi jusqu'à son retrait.
  const reset = (keepScrim = false) => {
    if (ref.current) ref.current.style.transition = ref.current.style.translate = "";
    if (scrimRef.current && !keepScrim) scrimRef.current.style.transition = scrimRef.current.style.opacity = "";
  };
  return {
    ref,
    scrimRef,
    handlers: {
      onPointerDown(e: React.PointerEvent) {
        if (!open || !narrow() || e.pointerType === "mouse") return;
        gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, active: false };
        velocity.reset();
        velocity.add(e.clientX, 0);
      },
      onPointerMove(e: React.PointerEvent) {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        const dx = e.clientX - g.x0;
        const dy = e.clientY - g.y0;
        if (!g.active) {
          // Seuil de 10 px avant de choisir : un geste vertical reste un défilement de la navigation.
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
          if (Math.abs(dy) > Math.abs(dx)) {
            gesture.current = null;
            return;
          }
          g.active = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        g.dx = dx <= 0 ? dx : rubberband(dx, ref.current?.offsetWidth ?? 280);
        velocity.add(e.clientX, 0);
        place(g.dx);
      },
      onPointerUp(e: React.PointerEvent) {
        const g = gesture.current;
        gesture.current = null;
        if (!g?.active || g.id !== e.pointerId) return;
        const vx = velocity.get().x;
        const width = ref.current?.offsetWidth ?? 280;
        if (g.dx + project(vx) < -width / 2 && vx <= 0) {
          const ms = settleDuration(width + g.dx, vx, 140, 280);
          place(-width, `translate ${ms}ms ${SETTLE}`);
          window.setTimeout(() => {
            close();
            requestAnimationFrame(() => reset(true));
          }, ms);
        } else {
          place(0, `translate ${settleDuration(g.dx, vx)}ms ${SETTLE}`);
          window.setTimeout(() => reset(), 400);
        }
      },
      onPointerCancel() {
        if (gesture.current?.active) place(0, `translate 240ms ${SETTLE}`);
        gesture.current = null;
      },
    },
  };
}

export function Shell({ me }: { me: Me }) {
  const space = useSpace();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const location = useLocation();
  const client = useQueryClient();
  const switchTo = useSwitchSpace();
  const { data: summary } = useApi<never>(SUMMARY_PATH[space.code]);
  const others = me.user.spaces.filter((s) => s !== space.code);
  useEffect(() => setOpen(false), [location.pathname]);
  const scrim = usePresence(open, 300);
  const drawer = useDrawerSwipe(open, () => setOpen(false));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setSearching((v) => !v);
      } else if (key === "e" && event.shiftKey && others.length) {
        event.preventDefault();
        switchTo(others[0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [others, switchTo]);

  const logout = async () => {
    await api.post("/auth/logout", {});
    client.clear();
    window.location.assign("/connexion");
  };

  return (
    <div className={`shell${open ? " menu-open" : ""}`}>
      <aside className="sidebar" aria-label="Navigation principale" ref={drawer.ref} {...drawer.handlers}>
        <SpaceSwitcher me={me} />
        <button type="button" className="search-trigger" onClick={() => setSearching(true)}>
          <IconSearch />
          <span>Rechercher</span>
          <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        {NAV[space.code].map((entry) => (
          <div key={entry.to} style={{ display: "contents" }}>
            {entry.group && <div className="nav-group">{entry.group}</div>}
            <Item
              to={entry.to}
              icon={entry.icon}
              count={summary && entry.count ? entry.count(summary) : undefined}
              alert={entry.alert}
              countLabel={entry.countLabel}
            >
              {entry.label}
            </Item>
          </div>
        ))}
        {others.length > 0 && (
          <button type="button" className="space-jump" onClick={() => switchTo(others[0])}>
            <IconSwitch />
            <span>
              Passer à l’espace {others[0].toUpperCase()}
              <small>{SWITCH_SHORTCUT}</small>
            </span>
          </button>
        )}
        <div className="sidebar-foot">
          <span className="avatar">{initials(me.user.name)}</span>
          <span className="who">
            {me.user.name}
            <span>{me.user.email}</span>
          </span>
          <button type="button" className="btn btn-plain icon-btn" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter">
            <IconLogout />
          </button>
        </div>
      </aside>
      {scrim.mounted && (
        <div className={`scrim drawer-scrim${scrim.leaving ? " leaving" : ""}`} ref={drawer.scrimRef} onClick={() => setOpen(false)} />
      )}
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button type="button" className="btn btn-plain icon-btn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <IconMenu />
          </button>
          <SpaceSwitcher me={me} compact />
          <button type="button" className="btn btn-plain icon-btn" style={{ marginLeft: "auto" }} onClick={() => setSearching(true)} aria-label="Rechercher">
            <IconSearch />
          </button>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={searching} onClose={() => setSearching(false)} spaces={me.user.spaces} />
    </div>
  );
}
