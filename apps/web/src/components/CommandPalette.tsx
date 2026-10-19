import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api, type Page } from "../lib/api";
import { compact } from "../lib/format";
import type { Account, Action, Contact, Deal } from "../lib/types";
import { IconAccounts, IconActions, IconChevron, IconContacts, IconDeals, IconSearch } from "./icons";

type Result = { key: string; group: string; title: string; meta?: string; to: string; icon: React.ReactNode };

const PAGES: { title: string; to: string; words: string }[] = [
  { title: "Vue d’ensemble", to: "/", words: "accueil synthese tableau de bord" },
  { title: "Affaires", to: "/affaires", words: "pipeline deals opportunites" },
  { title: "Affaires par étape", to: "/affaires?vue=etapes", words: "kanban colonnes etapes" },
  { title: "Plan d’actions", to: "/actions", words: "taches a faire todo" },
  { title: "Renouvellements", to: "/renouvellements", words: "contrats echeances relances licences" },
  { title: "Comptes", to: "/comptes", words: "clients prospects partenaires" },
  { title: "Solutions et prospects", to: "/solutions", words: "catalogue credolab wari pitch" },
  { title: "Appels d’offres", to: "/appels-offres", words: "ao consultation" },
  { title: "Contacts", to: "/contacts", words: "annuaire carnet" },
  { title: "Journal", to: "/journal", words: "historique activite modifications claude" },
  { title: "Réglages", to: "/reglages", words: "jeton claude mot de passe utilisateurs" },
];

const norm = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Recherche globale (⌘K) : comptes, affaires, contacts, actions et pages, au clavier.
 * ↑ ↓ pour choisir, ↩ pour ouvrir, Échap pour fermer.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const pages = useMemo<Result[]>(() => {
    const q = norm(query.trim());
    return PAGES.filter((p) => !q || norm(`${p.title} ${p.words}`).includes(q)).map((p) => ({
      key: `page-${p.to}`,
      group: "Aller à",
      title: p.title,
      to: p.to,
      icon: <IconChevron />,
    }));
  }, [query]);

  // Recherche dans les données, après une courte pause de frappe.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const enc = encodeURIComponent(q);
      const [accounts, deals, contacts, actions] = await Promise.all([
        api.get<Page<Account>>(`/accounts?q=${enc}&limit=5`).catch(() => null),
        api.get<Page<Deal>>(`/deals?q=${enc}&limit=6`).catch(() => null),
        api.get<Page<Contact>>(`/contacts?q=${enc}&limit=6`).catch(() => null),
        api.get<Page<Action>>(`/actions?q=${enc}&limit=5&open=true`).catch(() => null),
      ]);
      if (cancelled) return;
      setResults([
        ...(accounts?.results ?? []).map((a) => ({
          key: `a${a.id}`,
          group: "Comptes",
          title: a.name,
          meta: [a.sector, a.open_amount ? `${compact(a.open_amount)} en cours` : null].filter(Boolean).join(" · "),
          to: `/comptes/${a.slug}`,
          icon: <IconAccounts />,
        })),
        ...(deals?.results ?? []).map((d) => ({
          key: `d${d.id}`,
          group: "Affaires",
          title: `${d.number}. ${d.title}`,
          meta: [d.account_name, d.stage_label, d.amount ? compact(d.amount) : null].filter(Boolean).join(" · "),
          to: `/affaires?affaire=${d.number}`,
          icon: <IconDeals />,
        })),
        ...(contacts?.results ?? []).map((c) => ({
          key: `c${c.id}`,
          group: "Contacts",
          title: c.name,
          meta: [c.role, c.company].filter(Boolean).join(" · "),
          to: `/contacts?contact=${c.id}`,
          icon: <IconContacts />,
        })),
        ...(actions?.results ?? []).map((a) => ({
          key: `t${a.id}`,
          group: "Actions",
          title: a.title,
          meta: [a.related_to, a.due_date ? `échéance ${a.due_date.split("-").reverse().join("/")}` : null].filter(Boolean).join(" · "),
          to: `/actions?action=${a.number}`,
          icon: <IconActions />,
        })),
      ]);
      setActive(0);
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const items = query.trim().length >= 2 ? [...results, ...pages.slice(0, 3)] : pages;

  const go = (item: Result | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  if (!open) return null;
  let lastGroup = "";
  return (
    <>
      <div className="scrim" style={{ zIndex: 70 }} onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Recherche">
        <div className="palette-input">
          <IconSearch />
          <input
            ref={input}
            value={query}
            placeholder="Rechercher un compte, une affaire, un contact, une action…"
            aria-label="Rechercher"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={items[active] ? `palette-${items[active].key}` : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <kbd>Échap</kbd>
        </div>
        <ul className="palette-results" id="palette-results" role="listbox">
          {items.length === 0 && query.trim().length >= 2 && <li className="palette-empty">Aucun résultat pour « {query.trim()} »</li>}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.key} role="presentation">
                {header && <div className="palette-group">{header}</div>}
                <button
                  type="button"
                  id={`palette-${item.key}`}
                  role="option"
                  aria-selected={index === active}
                  className={`palette-item${index === active ? " active" : ""}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                >
                  <span className="palette-icon">{item.icon}</span>
                  <span className="row-main">
                    <span className="row-title">{item.title}</span>
                    {item.meta && <span className="row-meta">{item.meta}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> pour choisir
          </span>
          <span>
            <kbd>↩</kbd> pour ouvrir
          </span>
        </div>
      </div>
    </>
  );
}
