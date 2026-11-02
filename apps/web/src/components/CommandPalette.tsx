import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { api, type Page } from "../lib/api";
import { compact } from "../lib/format";
import { equivalentPath, SPACES, type SpaceCode, useSpace } from "../lib/space";
import type { Account, Action, Contact, Deal, IapAction, IapContact, IapDeal } from "../lib/types";
import { IconAccounts, IconActions, IconChevron, IconContacts, IconDeals, IconSearch, IconSwitch } from "./icons";
import { NAV } from "./nav";

type Result = { key: string; group: string; title: string; meta?: string; to: string; icon: React.ReactNode };

const norm = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Recherche globale (⌘K) : comptes, affaires, contacts, actions et pages, au clavier.
 * ↑ ↓ pour choisir, ↩ pour ouvrir, Échap pour fermer.
 */
export function CommandPalette({ open, onClose, spaces }: { open: boolean; onClose: () => void; spaces: SpaceCode[] }) {
  const space = useSpace();
  const location = useLocation();
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
    const pages = NAV[space.code].flatMap((p) => [{ title: p.label, to: p.to, words: p.words }, ...(p.extra ?? []).map((e) => ({ title: e.label, ...e }))]);
    const switches: Result[] = spaces
      .filter((code) => code !== space.code)
      .map((code) => SPACES[code])
      .filter((s) => !q || norm(`espace changer basculer ${s.name} ${s.fullName} ${s.tagline}`).includes(q))
      .map((s) => ({
        key: `space-${s.code}`,
        group: "Espaces",
        title: `Passer à l’espace ${s.name}`,
        meta: s.fullName,
        to: equivalentPath(location.pathname, s.code),
        icon: <IconSwitch />,
      }));
    return [
      ...switches,
      ...pages
        .filter((p) => !q || norm(`${p.title} ${p.words}`).includes(q))
        .map((p) => ({ key: `page-${p.to}`, group: `Aller à · ${space.name}`, title: p.title, to: p.to, icon: <IconChevron /> })),
    ];
  }, [query, space, spaces, location.pathname]);

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
      if (space.code === "iap") {
        const [deals, contacts, actions] = await Promise.all([
          api.get<Page<IapDeal>>(`/iap/deals?q=${enc}&limit=8`).catch(() => null),
          api.get<Page<IapContact>>(`/iap/contacts?q=${enc}&limit=6`).catch(() => null),
          api.get<Page<IapAction>>(`/iap/actions?q=${enc}&limit=5&open=true`).catch(() => null),
        ]);
        if (cancelled) return;
        setResults([
          ...(deals?.results ?? []).map((d) => ({
            key: `d${d.id}`,
            group: "Affaires IAP",
            title: `${d.number}. ${d.title}`,
            meta: [d.apporteur, d.stage_label, d.amount ? compact(d.amount) : null].filter(Boolean).join(" · "),
            to: `/iap/affaires?affaire=${d.number}`,
            icon: <IconDeals />,
          })),
          ...(contacts?.results ?? []).map((c) => ({
            key: `c${c.id}`,
            group: "Contacts IAP",
            title: c.name,
            meta: [c.role, c.company].filter(Boolean).join(" · "),
            to: `/iap/contacts?contact=${c.id}`,
            icon: <IconContacts />,
          })),
          ...(actions?.results ?? []).map((a) => ({
            key: `t${a.id}`,
            group: "Actions IAP",
            title: a.title,
            meta: [a.deal_title, a.due_date ? `échéance ${a.due_date.split("-").reverse().join("/")}` : null].filter(Boolean).join(" · "),
            to: `/iap/actions?action=${a.number}`,
            icon: <IconActions />,
          })),
        ]);
        setActive(0);
        return;
      }
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
          to: `/iat/comptes/${a.slug}`,
          icon: <IconAccounts />,
        })),
        ...(deals?.results ?? []).map((d) => ({
          key: `d${d.id}`,
          group: "Affaires",
          title: `${d.number}. ${d.title}`,
          meta: [d.account_name, d.stage_label, d.amount ? compact(d.amount) : null].filter(Boolean).join(" · "),
          to: `/iat/affaires?affaire=${d.number}`,
          icon: <IconDeals />,
        })),
        ...(contacts?.results ?? []).map((c) => ({
          key: `c${c.id}`,
          group: "Contacts",
          title: c.name,
          meta: [c.role, c.company].filter(Boolean).join(" · "),
          to: `/iat/contacts?contact=${c.id}`,
          icon: <IconContacts />,
        })),
        ...(actions?.results ?? []).map((a) => ({
          key: `t${a.id}`,
          group: "Actions",
          title: a.title,
          meta: [a.related_to, a.due_date ? `échéance ${a.due_date.split("-").reverse().join("/")}` : null].filter(Boolean).join(" · "),
          to: `/iat/actions?action=${a.number}`,
          icon: <IconActions />,
        })),
      ]);
      setActive(0);
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, space.code]);

  const items = query.trim().length >= 2 ? [...results, ...pages.slice(0, 4)] : pages;

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
            placeholder={space.code === "iap" ? "Rechercher un bien, un commercial, un contact, une action…" : "Rechercher un compte, une affaire, un contact, une action…"}
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
