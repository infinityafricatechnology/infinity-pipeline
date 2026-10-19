import { type FormEvent, useState } from "react";
import { IconCheck, IconPlus } from "../components/icons";
import { Pagination, usePaged } from "../components/Pagination";
import { ActionSheet, LEADS } from "../components/sheets";
import { Due, Empty, FilterSelect, Loading, Prio, Search, useToast } from "../components/ui";
import { type Page, qs, useApi, useSave } from "../lib/api";
import { useDeepLink } from "../lib/deeplink";
import type { Action } from "../lib/types";

const GROUPS: { key: string; label: string; test: (a: Action) => boolean }[] = [
  { key: "late", label: "En retard", test: (a) => a.overdue },
  { key: "week", label: "Cette semaine", test: (a) => !a.done && !a.overdue && a.days_to_due != null && a.days_to_due <= 7 },
  { key: "later", label: "Plus tard", test: (a) => !a.done && a.days_to_due != null && a.days_to_due > 7 },
  { key: "none", label: "Sans échéance", test: (a) => !a.done && a.due_date == null },
];

export function ActionsPage() {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [open, setOpen] = useState<Action | null>(null);
  // Les actions ajoutées restent en tête tant qu'on est sur la page : on voit tout de suite ce qu'on vient de créer.
  const [justAdded, setJustAdded] = useState<number[]>([]);
  const clearLink = useDeepLink<Action>("action", (n) => `/actions?number=${n}`, setOpen);
  const { data, isLoading } = useApi<Page<Action>>(`/actions${qs({ q, owner, priority, limit: 500 })}`, { keepPrevious: true });
  const actions = data?.results ?? [];
  const done = actions.filter((a) => a.done);
  const filterKey = `${q}|${owner}|${priority}`;
  // La liste est triée par l'API (retards et échéances proches d'abord) ; les groupes se forment dans chaque page.
  const added = justAdded.map((id) => actions.find((a) => a.id === id)).filter((a): a is Action => !!a && !a.done);
  const paged = usePaged(
    actions.filter((a) => !a.done && !justAdded.includes(a.id)),
    filterKey,
  );
  const donePaged = usePaged(done, filterKey);

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1 className="t-title">Plan d’actions</h1>
          <p className="lede">
            {actions.length - done.length} actions ouvertes, dont {actions.filter((a) => a.overdue).length} en retard. Cochez une action pour la marquer comme
            faite.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Rechercher une action" />
        <FilterSelect label="Responsable" value={owner} onChange={setOwner} options={LEADS} />
        <FilterSelect label="Priorité" value={priority} onChange={setPriority} options={["P1", "P2", "P3"]} />
      </div>

      <div className="group" style={{ marginBottom: 24 }}>
        <QuickAdd onCreated={(id) => setJustAdded((ids) => [id, ...ids])} />
      </div>

      {added.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="group-label">
            <span>Ajoutées à l’instant</span>
            <span className="num">{added.length}</span>
          </div>
          <div className="group">
            {added.map((a) => (
              <ActionRow key={`${a.id}-${a.done}`} action={a} onOpen={() => setOpen(a)} />
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <Loading />
      ) : (
        <>
          {GROUPS.map((g) => {
            const items = paged.items.filter(g.test);
            if (!items.length) return null;
            return (
              <div key={g.key} style={{ marginBottom: 24 }}>
                <div className="group-label">
                  <span style={g.key === "late" ? { color: "var(--red)" } : undefined}>{g.label}</span>
                  <span className="num">{items.length}</span>
                </div>
                <div className="group">
                  {items.map((a) => (
                    <ActionRow key={`${a.id}-${a.done}`} action={a} onOpen={() => setOpen(a)} />
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ marginBottom: 24 }}>
            <Pagination page={paged.page} total={paged.total} onChange={paged.setPage} noun="actions ouvertes" />
          </div>
          {actions.length === done.length && done.length === 0 && (
            <div className="group">
              <Empty title="Aucune action">Ajoutez la première avec le champ ci-dessus.</Empty>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <button type="button" className="btn btn-plain" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                {showDone ? "Masquer" : "Afficher"} les {done.length} actions terminées
              </button>
              {showDone && (
                <div className="group" style={{ marginTop: 8 }}>
                  {donePaged.items.map((a) => (
                    <ActionRow key={`${a.id}-${a.done}`} action={a} onOpen={() => setOpen(a)} />
                  ))}
                </div>
              )}
              {showDone && <Pagination page={donePaged.page} total={donePaged.total} onChange={donePaged.setPage} noun="actions terminées" />}
            </div>
          )}
        </>
      )}
      {open && (
        <ActionSheet
          action={open}
          onClose={() => {
            setOpen(null);
            clearLink();
          }}
        />
      )}
    </div>
  );
}

export function ActionRow({ action, onOpen }: { action: Action; onOpen: () => void }) {
  const save = useSave();
  const toast = useToast();
  const [checked, setChecked] = useState(action.done);
  const toggle = () => {
    const next = !checked;
    const previous = action.status;
    setChecked(next);
    save.mutate(
      { method: "patch", path: `/actions/${action.id}`, body: { status: next ? "Fait" : "À faire" } },
      {
        onSuccess: () =>
          toast(next ? "Action faite" : "Action rouverte", false, {
            label: "Annuler",
            onClick: () => save.mutate({ method: "patch", path: `/actions/${action.id}`, body: { status: previous } }),
          }),
        onError: (error) => {
          setChecked(!next);
          toast(error.message, true);
        },
      },
    );
  };
  const meta = [action.related_to, action.owner].filter(Boolean).join(" · ");
  return (
    <div className={`row${checked ? " done" : ""}`} style={{ cursor: "default" }}>
      <button type="button" className={`check${checked ? " on" : ""}`} onClick={toggle} aria-pressed={checked} aria-label={checked ? "Rouvrir l’action" : "Marquer comme faite"}>
        <IconCheck />
      </button>
      <button type="button" className="row-main" onClick={onOpen} style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
        <span className="row-title" style={{ display: "block", whiteSpace: "normal" }}>
          {action.title}
        </span>
        <span className="row-meta" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Due date={action.due_date} days={action.days_to_due} done={checked} />
          {meta && <span>{meta}</span>}
          {action.status !== "À faire" && action.status !== "Fait" && <span>{action.status}</span>}
        </span>
      </button>
      <span className="row-aside">
        <Prio value={action.priority} />
      </span>
    </div>
  );
}

function QuickAdd({ onCreated }: { onCreated: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("");
  const save = useSave();
  const toast = useToast();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    save.mutate(
      {
        method: "post",
        path: "/actions",
        body: { title: title.trim(), status: "À faire", owner: "Commercial IAT", due_date: due || undefined, priority: priority || undefined },
      },
      {
        onSuccess: (created) => {
          setTitle("");
          setDue("");
          setPriority("");
          onCreated((created as Action).id);
          toast("Action ajoutée");
        },
        onError: (error) => toast(error.message, true),
      },
    );
  };
  // Entrée valide depuis n'importe quel champ (le champ date ne le fait pas de lui-même).
  const submitOnEnter = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.closest("form")?.requestSubmit();
    }
  };
  return (
    <form className="quick-add" onSubmit={submit}>
      <span className="plus">
        <IconPlus width={18} />
      </span>
      <label className="visually-hidden" htmlFor="quick-add">
        Nouvelle action
      </label>
      <input id="quick-add" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle action, puis Entrée" />
      {title && (
        <>
          <label className="visually-hidden" htmlFor="quick-add-due">
            Échéance
          </label>
          <input id="quick-add-due" className="input quick-add-date" type="date" value={due} onChange={(e) => setDue(e.target.value)} onKeyDown={submitOnEnter} />
          <select
            className="select quick-add-prio"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            onKeyDown={submitOnEnter}
            aria-label="Priorité"
          >
            <option value="">Priorité</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <button className="btn btn-primary" disabled={save.isPending}>
            Ajouter
          </button>
        </>
      )}
    </form>
  );
}
