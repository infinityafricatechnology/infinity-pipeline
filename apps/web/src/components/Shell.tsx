import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { api, useApi } from "../lib/api";
import { initials } from "../lib/format";
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
      {open && (
        <div className="space-menu" role="menu" aria-label="Espaces">
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
      <aside className="sidebar" aria-label="Navigation principale">
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
      {open && <div className="scrim" style={{ zIndex: 45 }} onClick={() => setOpen(false)} />}
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
