import { compact, fcfa, pct, relativeDays } from "../lib/format";
import {
  COMMISSION_POLICY,
  IAP_CONTACT_ROLES,
  IAP_NATURES,
  IAP_PEOPLE,
  IAP_STAGES,
  type IapAction,
  type IapContact,
  type IapDeal,
} from "../lib/types";
import { EntitySheet, type FieldSpec } from "./EntitySheet";
import { ACTION_STATUSES } from "./sheets";

type Close = { onClose: () => void };
type Draft = Record<string, unknown>;

const stageOptions = IAP_STAGES.map((s) => ({ value: s.code, label: `${s.code} · ${s.label}` }));
const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/** Même règle que l'API (domain-iap.ts) : 5 % apport, 10 % closing, 15 % si même personne. */
export function previewSplit(d: Draft) {
  const amount = d.amount as number | null;
  const rate = d.commission_rate as number | null;
  const expected = amount != null && rate != null ? Math.round(amount * rate) : null;
  const received = d.commission_received as number | null;
  const base = received ?? expected;
  const apporteur = ((d.apporteur as string) ?? "").trim();
  const closeur = ((d.closeur as string) ?? "").trim();
  const share = (person: string, role: string, r: number) => ({ person, role, rate: r, amount: base == null ? null : Math.round(base * r) });
  const shares =
    apporteur && closeur && fold(apporteur) === fold(closeur)
      ? [share(apporteur, "Apport + closing", COMMISSION_POLICY.combined)]
      : [
          ...(apporteur ? [share(apporteur, "Apport", COMMISSION_POLICY.apport)] : []),
          ...(closeur ? [share(closeur, "Closing", COMMISSION_POLICY.closing)] : []),
        ];
  return { expected, base, estimated: received == null, shares };
}

export function IapDealSheet({ deal, defaults, onClose }: { deal: IapDeal | null; defaults?: Partial<IapDeal> } & Close) {
  const fields: FieldSpec[] = [
    { name: "title", label: "Bien ou projet", wide: true, required: true, hint: "Ex. « Villa 800m² 7ème tranche »" },
    { name: "nature", label: "Nature", type: "suggest", options: IAP_NATURES },
    { name: "stage", label: "Étape", type: "select", options: stageOptions, required: true },
    { name: "amount", label: "Montant / prix (FCFA)", type: "amount" },
    { name: "commission_rate", label: "Taux de commission IAP", type: "rate", hint: "Ex. 2,5 % ; 7 % ; 10 % pour une location" },
    { name: "closing", label: "Probabilité de conclusion (closing)", type: "percent", span2: true },
    { name: "due_date", label: "Closing estimé", type: "date" },
    { name: "apporteur", label: "Apporteur", type: "suggest", options: IAP_PEOPLE, section: "Commissionnement", hint: "Part apport : 5 % de la commission perçue" },
    { name: "closeur", label: "Closeur", type: "suggest", options: IAP_PEOPLE, hint: "Part closing : 10 % ; 15 % au total si c’est l’apporteur" },
    { name: "commission_received", label: "Commission perçue par IAP (FCFA)", type: "amount", hint: "Base de calcul des parts, une fois encaissée" },
    { name: "received_at", label: "Encaissée le", type: "date" },
    { name: "apport_paid_at", label: "Part apport versée le", type: "date" },
    { name: "closing_paid_at", label: "Part closing versée le", type: "date" },
    { name: "next_step", label: "Prochaine étape", type: "textarea", section: "Suivi" },
    { name: "client", label: "Client (acquéreur / locataire)" },
    { name: "owner", label: "Propriétaire" },
    { name: "partner", label: "Agence ou apporteur du client" },
    { name: "comments", label: "Commentaires", type: "textarea" },
  ];
  return (
    <EntitySheet
      path="iap/deals"
      entity="iap_deal"
      noun={{ label: "Affaire", feminine: true }}
      item={deal}
      defaults={{ stage: "P0", ...defaults }}
      fields={fields}
      derive={(name, value) => {
        // Une affaire conclue l'est à 100 %, une affaire perdue à 0 % : le pondéré suit.
        if (name === "stage" && value === "P5") return { closing: 1 };
        if (name === "stage" && value === "LOST") return { closing: 0 };
        return undefined;
      }}
      caption={deal ? `Affaire IAP n° ${deal.number}${deal.nature ? ` · ${deal.nature}` : ""}` : "Pipeline IAP"}
      title={deal ? deal.title : "Nouvelle affaire"}
      computed={(draft) => {
        const split = previewSplit(draft);
        const closing = draft.closing as number | null;
        const amount = draft.amount as number | null;
        return (
          <div className="computed sticky">
            <div>
              <span>Commission attendue</span>
              <strong className="num" title={fcfa(split.expected)}>
                {compact(split.expected)}
              </strong>
            </div>
            <div>
              <span>Commission pondérée</span>
              <strong className="num">{split.expected != null && closing != null ? compact(Math.round(split.expected * closing)) : "—"}</strong>
            </div>
            <div>
              <span>Montant pondéré</span>
              <strong className="num">{amount != null && closing != null ? compact(Math.round(amount * closing)) : "—"}</strong>
            </div>
            {deal && (
              <div>
                <span>Closing estimé</span>
                <strong>{deal.due_date ? relativeDays(deal.days_to_due) : "—"}</strong>
              </div>
            )}
            <div className="computed-split">
              <span>
                Répartition {split.estimated ? "estimée sur la commission attendue" : "sur la commission perçue"}
                {split.base != null ? ` (${fcfa(split.base)})` : ""}
              </span>
              {split.shares.length === 0 ? (
                <em>Renseignez l’apporteur et le closeur pour calculer les parts.</em>
              ) : (
                <ul>
                  {split.shares.map((s) => (
                    <li key={s.role}>
                      <b>{s.person}</b>
                      <i>
                        {s.role} · {pct(s.rate)}
                      </i>
                      <strong className="num">{s.amount == null ? "—" : fcfa(s.amount)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      }}
      onClose={onClose}
    />
  );
}

export function IapActionSheet({ action, defaults, onClose }: { action: IapAction | null; defaults?: Partial<IapAction> } & Close) {
  return (
    <EntitySheet
      path="iap/actions"
      entity="iap_action"
      noun={{ label: "Action", feminine: true }}
      item={action}
      defaults={{ status: "À faire", ...defaults }}
      fields={[
        { name: "title", label: "Action", type: "textarea", required: true },
        { name: "status", label: "Statut", type: "select", options: ACTION_STATUSES },
        { name: "priority", label: "Priorité", type: "prio" },
        { name: "due_date", label: "Échéance", type: "date" },
        { name: "owner", label: "Responsable", type: "suggest", options: IAP_PEOPLE },
        { name: "deal_id", label: "Affaire concernée", type: "iapdeal", span2: true },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ]}
      caption={action ? `Action IAP n° ${action.number}` : "Plan d’actions IAP"}
      title={action ? action.title : "Nouvelle action"}
      onClose={onClose}
    />
  );
}

export function IapContactSheet({ contact, onClose }: { contact: IapContact | null } & Close) {
  return (
    <EntitySheet
      path="iap/contacts"
      entity="iap_contact"
      noun={{ label: "Contact" }}
      item={contact}
      fields={[
        { name: "name", label: "Nom", required: true },
        { name: "role", label: "Rôle", type: "select", options: IAP_CONTACT_ROLES },
        { name: "company", label: "Société / agence" },
        { name: "phone", label: "Téléphone" },
        { name: "email", label: "E-mail" },
        { name: "notes", label: "Notes", type: "textarea", hint: "Recherche, budget, biens présentés…" },
      ]}
      caption={contact?.role ?? "Contacts IAP"}
      title={contact ? contact.name : "Nouveau contact"}
      onClose={onClose}
    />
  );
}
