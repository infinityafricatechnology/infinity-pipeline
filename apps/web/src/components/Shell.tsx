import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { api, useApi } from "../lib/api";
import { initials } from "../lib/format";
import type { Me, Summary } from "../lib/types";
import {
  IconAccounts,
  IconActions,
  IconActivity,
  IconContacts,
  IconDeals,
  IconLogout,
  IconMenu,
  IconOverview,
  IconRenewals,
  IconSearch,
  IconSettings,
  IconSolutions,
  IconTenders,
} from "./icons";
import { IatMark } from "./Logo";
import { CommandPalette } from "./CommandPalette";

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
    <NavLink to={to} end={to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
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

export function Shell({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const location = useLocation();
  const client = useQueryClient();
  const { data: summary } = useApi<Summary>("/summary");
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const logout = async () => {
    await api.post("/auth/logout", {});
    client.clear();
    window.location.assign("/connexion");
  };

  return (
    <div className={`shell${open ? " menu-open" : ""}`}>
      <aside className="sidebar" aria-label="Navigation principale">
        <Link to="/" className="brand">
          <IatMark />
          <span className="brand-name">
            {APP_NAME}
            <span className="brand-sub">Infinity Africa Technologies</span>
          </span>
        </Link>
        <button type="button" className="search-trigger" onClick={() => setSearching(true)}>
          <IconSearch />
          <span>Rechercher</span>
          <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <Item to="/" icon={<IconOverview />}>
          Vue d’ensemble
        </Item>
        <Item to="/affaires" icon={<IconDeals />} count={summary?.pipeline.deals_count} countLabel="affaires">
          Affaires
        </Item>
        <Item to="/actions" icon={<IconActions />} count={summary?.pipeline.overdue_actions_count} alert countLabel="en retard">
          Plan d’actions
        </Item>
        <Item to="/renouvellements" icon={<IconRenewals />} count={summary?.billing.expired_count} alert countLabel="contrats échus">
          Renouvellements
        </Item>
        <div className="nav-group">Portefeuille</div>
        <Item to="/comptes" icon={<IconAccounts />}>
          Comptes
        </Item>
        <Item to="/solutions" icon={<IconSolutions />}>
          Solutions et prospects
        </Item>
        <Item to="/appels-offres" icon={<IconTenders />}>
          Appels d’offres
        </Item>
        <Item to="/contacts" icon={<IconContacts />} count={summary?.contacts.total} countLabel="contacts">
          Contacts
        </Item>
        <div className="nav-group">Suivi</div>
        <Item to="/journal" icon={<IconActivity />}>
          Journal
        </Item>
        <Item to="/reglages" icon={<IconSettings />}>
          Réglages
        </Item>
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
          <IatMark className="logo" />
          {APP_NAME}
          <button type="button" className="btn btn-plain icon-btn" style={{ marginLeft: "auto" }} onClick={() => setSearching(true)} aria-label="Rechercher">
            <IconSearch />
          </button>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={searching} onClose={() => setSearching(false)} />
    </div>
  );
}
