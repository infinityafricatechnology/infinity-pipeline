import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api, type Page, useApi, useSave } from "../lib/api";
import { dateTime, full } from "../lib/format";
import type { Account, Activity, Solution } from "../lib/types";
import { IconSpark } from "./icons";
import { Prio, Segmented, Sheet, useToast } from "./ui";

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "amount" | "int" | "date" | "select" | "percent" | "prio" | "account" | "solution";
  options?: readonly string[] | { value: string; label: string }[];
  wide?: boolean;
  /** Occupe deux colonnes de la grille (sur grand écran). */
  span2?: boolean;
  hint?: string;
  required?: boolean;
  /** Titre de groupe affiché avant ce champ. */
  section?: string;
};

type Values = Record<string, unknown>;

const FIELD_LABELS: Record<string, string> = {
  stage: "étape",
  closing: "closing",
  amount: "montant",
  commission: "commission",
  priority: "priorité",
  due_date: "échéance",
  next_step: "prochaine étape",
  status: "statut",
  title: "intitulé",
  lead: "responsable",
  owner: "responsable",
  comments: "commentaires",
  health: "état de santé",
  collected: "encaissé",
};

/** Panneau d'édition générique : création (`id` nul) ou modification, avec l'historique de l'élément. */
export function EntitySheet({
  path,
  entity,
  noun,
  item,
  defaults = {},
  fields,
  caption,
  title,
  computed,
  onClose,
  deletable = true,
  derive,
  onSaved,
  children,
}: {
  path: string;
  entity: string;
  /** Nom de l'élément pour les messages : « Affaire », « Action »… (accord au féminin par `feminine`). */
  noun: { label: string; feminine?: boolean };
  item: Values | null;
  defaults?: Values;
  fields: FieldSpec[];
  caption?: ReactNode;
  title: ReactNode;
  computed?: ReactNode;
  onClose: () => void;
  deletable?: boolean;
  /** Valeurs à ajuster quand un champ change (ex. étape « Gagné » → closing 100 %). */
  derive?: (name: string, value: unknown, draft: Values) => Values | undefined;
  /** Appelé avec l'élément tel que l'API l'a enregistré (création ou modification). */
  onSaved?: (item: Values) => void;
  children?: ReactNode;
}) {
  const id = item?.id as number | undefined;
  const initial = useMemo(() => {
    const source = item ?? defaults;
    return Object.fromEntries(fields.map((f) => [f.name, source[f.name] ?? null]));
  }, [item, defaults, fields]);
  const [draft, setDraft] = useState<Values>(initial);
  const save = useSave();
  const toast = useToast();
  const e = noun.feminine ? "e" : "";

  const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => (v ?? null) !== (initial[k] ?? null)));
  const dirty = Object.keys(changed).length > 0;
  const missing = fields.filter((f) => f.required && (draft[f.name] == null || draft[f.name] === "")).map((f) => f.label);

  const set = (name: string, value: unknown) =>
    setDraft((d) => {
      const next = { ...d, [name]: value === "" ? null : value };
      return { ...next, ...(derive?.(name, next[name], next) ?? {}) };
    });

  // Fermer sans perdre une saisie par mégarde (Échap, clic à côté, Annuler).
  const requestClose = () => {
    if (dirty && !window.confirm("Abandonner les modifications non enregistrées ?")) return;
    onClose();
  };

  const submit = () => {
    if (missing.length) {
      toast(`À renseigner : ${missing.join(", ")}.`, true);
      return;
    }
    const body = id ? changed : Object.fromEntries(Object.entries(draft).filter(([, v]) => v != null));
    save.mutate(
      { method: id ? "patch" : "post", path: id ? `/${path}/${id}` : `/${path}`, body },
      {
        onSuccess: (saved) => {
          toast(id ? `${noun.label} enregistré${e}` : `${noun.label} créé${e}`);
          onSaved?.(saved as Values);
          onClose();
        },
        onError: (error) => toast(error.message, true),
      },
    );
  };

  // ⌘↩ ou Ctrl+↩ enregistre, depuis n'importe quel champ.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const remove = () => {
    if (!id || !window.confirm(`Supprimer définitivement cet élément ? L'opération reste visible dans le journal.`)) return;
    save.mutate(
      { method: "del", path: `/${path}/${id}` },
      {
        onSuccess: () => {
          toast(`${noun.label} supprimé${e}`);
          onClose();
        },
        onError: (error) => toast(error.message, true),
      },
    );
  };

  return (
    <Sheet
      caption={caption}
      title={title}
      onClose={requestClose}
      aside={id ? <History entity={entity} id={id} /> : undefined}
      footer={
        <>
          {id && deletable && (
            <button type="button" className="btn btn-plain btn-danger" onClick={remove}>
              Supprimer
            </button>
          )}
          <span className="spacer" />
          <span className="t-caption hide-sm">{dirty || !id ? "⌘↩ pour enregistrer" : ""}</span>
          <button type="button" className="btn" onClick={requestClose}>
            {dirty ? "Annuler" : "Fermer"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={(!dirty && !!id) || missing.length > 0 || save.isPending}
            title={missing.length ? `À renseigner : ${missing.join(", ")}` : undefined}
            onClick={submit}
          >
            {id ? "Enregistrer" : "Créer"}
          </button>
        </>
      }
    >
      {computed}
      <form
        className="fields"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {fields.map((f) => (
          <FieldInput key={f.name} spec={f} value={draft[f.name]} onChange={(v) => set(f.name, v)} />
        ))}
        <button type="submit" hidden />
      </form>
      {children}
    </Sheet>
  );
}

function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const inputId = `f-${spec.name}`;
  const type = spec.type ?? "text";
  let control: ReactNode;

  if (type === "textarea") {
    control = <textarea id={inputId} className="textarea" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  } else if (type === "amount" || type === "int") {
    control = (
      <input
        id={inputId}
        className="input num"
        inputMode="numeric"
        value={value == null ? "" : type === "amount" ? full(value as number) : String(value)}
        placeholder={type === "amount" ? "0 FCFA" : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          onChange(digits === "" ? null : Number(digits));
        }}
      />
    );
  } else if (type === "date") {
    control = <input id={inputId} className="input" type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  } else if (type === "percent") {
    const pct = value == null ? null : Math.round((value as number) * 100);
    control = (
      <div className={`range-row${pct == null ? " unset" : ""}`}>
        <input
          id={inputId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct ?? 0}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          aria-valuetext={pct == null ? "non renseigné" : `${pct} %`}
        />
        <span className="num">{pct == null ? "Non renseignée" : `${pct} %`}</span>
        {pct != null && (
          <button type="button" className="btn btn-plain" onClick={() => onChange(null)}>
            Effacer
          </button>
        )}
      </div>
    );
  } else if (type === "prio") {
    control = (
      <Segmented
        label={spec.label}
        value={(value as string) ?? ""}
        onChange={(v) => onChange(v || null)}
        options={[
          { value: "", label: "Aucune" },
          { value: "P1", label: <Prio value="P1" /> },
          { value: "P2", label: "P2" },
          { value: "P3", label: "P3" },
        ]}
      />
    );
  } else if (type === "account") {
    control = <AccountSelect id={inputId} value={value as number | null} onChange={onChange} />;
  } else if (type === "solution") {
    control = <SolutionSelect id={inputId} value={value as number | null} onChange={onChange} />;
  } else if (type === "select") {
    const options = (spec.options ?? []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
    const current = (value as string) ?? "";
    control = (
      <select id={inputId} className="select" value={current} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {current && !options.some((o) => o.value === current) && <option value={current}>{current}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    control = <input id={inputId} className="input" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <>
      {spec.section && <div className="fieldset-title">{spec.section}</div>}
      <div className={`field${spec.wide || type === "textarea" ? " wide" : spec.span2 ? " span-2" : ""}`}>
        {type === "prio" ? (
          <span className="label">{spec.label}</span>
        ) : (
          <label htmlFor={inputId}>
            {spec.label}
            {spec.required && <span className="required"> obligatoire</span>}
          </label>
        )}
        {control}
        {spec.hint && <span className="hint">{spec.hint}</span>}
      </div>
    </>
  );
}

const NEW_ACCOUNT = "__nouveau__";

/** Choix du compte, avec création d'un nouveau prospect sans quitter le formulaire. */
function AccountSelect({ id, value, onChange }: { id: string; value: number | null; onChange: (v: unknown) => void }) {
  const { data } = useApi<Page<Account>>("/accounts?limit=500");
  const client = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const create = async () => {
    if (!name.trim()) return;
    try {
      const account = await api.post<Account>("/accounts", { name: name.trim(), kind: "prospect" });
      await client.invalidateQueries({ queryKey: ["/accounts?limit=500"] });
      onChange(account.id);
      setCreating(false);
      setName("");
      toast(`Compte « ${account.name} » créé`);
    } catch (error) {
      toast((error as Error).message, true);
    }
  };

  if (creating) {
    return (
      <div className="inline-create">
        <input
          id={id}
          className="input"
          autoFocus
          placeholder="Nom du nouveau compte"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setCreating(false);
            }
          }}
        />
        <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => void create()}>
          Créer
        </button>
        <button type="button" className="btn btn-plain" onClick={() => setCreating(false)}>
          Annuler
        </button>
      </div>
    );
  }
  return (
    <select
      id={id}
      className="select"
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === NEW_ACCOUNT) setCreating(true);
        else onChange(e.target.value ? Number(e.target.value) : null);
      }}
    >
      <option value="">Choisir un compte</option>
      <option value={NEW_ACCOUNT}>+ Nouveau compte (prospect)…</option>
      {data?.results.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

function SolutionSelect({ id, value, onChange }: { id: string; value: number | null; onChange: (v: unknown) => void }) {
  const { data } = useApi<Page<Solution>>("/solutions?limit=500");
  return (
    <select id={id} className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Choisir une solution</option>
      {data?.results.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function ViaTag({ via }: { via: Activity["via"] }) {
  if (via === "claude")
    return (
      <span className="tag claude">
        <IconSpark />
        via Claude
      </span>
    );
  if (via === "api") return <span className="tag">via l’API</span>;
  return null;
}

function describe(changes: Activity["changes"]): string | null {
  if (!changes) return null;
  const keys = Object.keys(changes).filter((k) => Array.isArray((changes as Record<string, unknown>)[k]));
  if (!keys.length) return null;
  const names = keys.map((k) => FIELD_LABELS[k] ?? k.replace(/_/g, " ")).join(", ");
  return names.charAt(0).toUpperCase() + names.slice(1);
}

function History({ entity, id }: { entity: string; id: number }) {
  const { data } = useApi<{ results: Activity[] }>(`/activity?entity=${entity}&entity_id=${id}&limit=20`);
  return (
    <div className="history">
      <h3 className="t-headline" style={{ fontSize: 14 }}>
        Historique
      </h3>
      {data && data.results.length === 0 && <p className="t-caption">Aucune modification depuis l’import du classeur.</p>}
      <ol>
        {data?.results.map((event) => (
          <li key={event.id}>
            {event.action === "create" ? "Créé" : event.action === "delete" ? "Supprimé" : "Modifié"} par {event.user_name ?? "—"}, {dateTime(event.at)}{" "}
            <ViaTag via={event.via} />
            {event.action === "update" && <span className="change">{describe(event.changes)}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
