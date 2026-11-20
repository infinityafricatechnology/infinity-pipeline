import { compact, fcfa, relativeDays } from "../lib/format";
import { useSpace } from "../lib/space";
import {
  FIN_CONTACT_ROLES,
  FIN_NATURES,
  FIN_SECTORS,
  FIN_STAGES,
  type FinAction,
  type FinContact,
  type FinDeal,
  PARTNER_ENTITIES,
  PARTNER_POTENTIALS,
  type Partner,
} from "../lib/types";
import { EntitySheet, type FieldSpec } from "./EntitySheet";
import { ACTION_STATUSES } from "./sheets";

type Close = { onClose: () => void };
type Draft = Record<string, unknown>;

const stageOptions = FIN_STAGES.map((s) => ({ value: s.code, label: `${s.code} · ${s.label}` }));
const num = (v: unknown) => (typeof v === "number" ? v : null);

/** Mêmes règles que l'API (domain-fin.ts) : revenu = honoraire + commission de succès ; reste à encaisser. */
export function previewRevenue(d: Draft) {
  const amount = num(d.amount);
  const rate = num(d.commission_rate);
  const fee = num(d.fee);
  const closing = num(d.closing);
  const commission = amount != null && rate != null ? Math.round(amount * rate) : null;
  const revenue = fee == null && commission == null ? null : (fee ?? 0) + (commission ?? 0);
  const won = d.stage === "F4" || d.stage === "F5";
  const feeDue = fee != null && d.stage !== "LOST" ? Math.max(0, fee - (num(d.fee_received) ?? 0)) : 0;
  const commissionDue = won && commission != null ? Math.max(0, commission - (num(d.commission_received) ?? 0)) : 0;
  return {
    commission,
    revenue,
    weighted: revenue != null && closing != null ? Math.round(revenue * closing) : null,
    outstanding: feeDue + commissionDue,
    feeDue,
    commissionDue,
    won,
  };
}

/** Fiche d'une affaire IAC ou IAF (l'espace en cours décide des routes). */
export function FinDealSheet({ deal, defaults, onClose }: { deal: FinDeal | null; defaults?: Partial<FinDeal> } & Close) {
  const space = useSpace();
  const fields: FieldSpec[] = [
    { name: "title", label: "Entreprise ou projet", wide: true, required: true, hint: "Ex. « HYBA ENTREPRISE »" },
    { name: "nature", label: "Nature", type: "suggest", options: FIN_NATURES },
    { name: "sector", label: "Domaine", type: "suggest", options: FIN_SECTORS },
    { name: "stage", label: "Étape", type: "select", options: stageOptions, required: true },
    { name: "priority", label: "Priorité", type: "int", hint: "1 = la plus prioritaire" },
    { name: "amount", label: "Montant de la demande (FCFA)", type: "amount", hint: "Capitaux ou financement recherchés" },
    { name: "due_date", label: "Closing estimé", type: "date" },
    { name: "closing", label: "Probabilité de closing", type: "percent", span2: true },
    { name: "owner", label: "Responsable", section: "Équipe" },
    { name: "apporteur", label: "Apporteur", hint: "Personne ou partenaire qui a apporté l’affaire" },
    { name: "fee", label: "Honoraire (FCFA)", type: "amount", section: "Revenus et encaissements", hint: "Forfait d’étude et de structuration" },
    { name: "commission_rate", label: "Taux de commission de succès", type: "rate", hint: "Ex. 2,5 % du montant obtenu" },
    { name: "fee_received", label: "Honoraire encaissé (FCFA)", type: "amount" },
    { name: "fee_received_at", label: "Honoraire encaissé le", type: "date" },
    { name: "commission_received", label: "Commission encaissée (FCFA)", type: "amount" },
    { name: "commission_received_at", label: "Commission encaissée le", type: "date" },
    { name: "next_step", label: "Prochaine étape", type: "textarea", section: "Suivi" },
    { name: "comments", label: "Commentaires", type: "textarea" },
  ];
  return (
    <EntitySheet
      path={`${space.code}/deals`}
      entity={`${space.code}_deal`}
      noun={{ label: "Affaire", feminine: true }}
      item={deal}
      defaults={{ stage: "F0", ...defaults }}
      fields={fields}
      derive={(name, value, draft) => {
        if (name === "stage" && value === "LOST") return { closing: 0 };
        if (name === "stage" && (value === "F4" || value === "F5")) return { closing: 1 };
        // Tout encaissé : l'affaire passe en « Encaissé ».
        if (name === "commission_received" || name === "fee_received") {
          const p = previewRevenue(draft);
          if (p.won && p.outstanding === 0 && draft.stage === "F4") return { stage: "F5" };
        }
        return undefined;
      }}
      caption={deal ? `Affaire ${space.name} n° ${deal.number}${deal.nature ? ` · ${deal.nature}` : ""}` : `Pipeline ${space.name}`}
      title={deal ? deal.title : "Nouvelle affaire"}
      computed={(draft) => {
        const p = previewRevenue(draft);
        return (
          <div className="computed sticky">
            <div>
              <span>Commission de succès</span>
              <strong className="num" title={fcfa(p.commission)}>
                {compact(p.commission)}
              </strong>
            </div>
            <div>
              <span>Revenu attendu</span>
              <strong className="num" title="Honoraire + commission de succès">
                {compact(p.revenue)}
              </strong>
            </div>
            <div>
              <span>Revenu pondéré</span>
              <strong className="num">{compact(p.weighted)}</strong>
            </div>
            <div>
              <span>Reste à encaisser</span>
              <strong className={`num${p.outstanding > 0 ? " warn-text" : ""}`} title={`Honoraire ${fcfa(p.feeDue)} · commission ${fcfa(p.commissionDue)}`}>
                {compact(p.outstanding)}
              </strong>
            </div>
            {deal?.due_date && (
              <div>
                <span>Closing estimé</span>
                <strong>{relativeDays(deal.days_to_due)}</strong>
              </div>
            )}
          </div>
        );
      }}
      onClose={onClose}
    />
  );
}

export function FinActionSheet({ action, defaults, onClose }: { action: FinAction | null; defaults?: Partial<FinAction> } & Close) {
  const space = useSpace();
  return (
    <EntitySheet
      path={`${space.code}/actions`}
      entity={`${space.code}_action`}
      noun={{ label: "Action", feminine: true }}
      item={action}
      defaults={{ status: "À faire", ...defaults }}
      fields={[
        { name: "title", label: "Action", type: "textarea", required: true },
        { name: "status", label: "Statut", type: "select", options: ACTION_STATUSES },
        { name: "priority", label: "Priorité", type: "prio" },
        { name: "due_date", label: "Échéance", type: "date" },
        { name: "owner", label: "Responsable" },
        { name: "deal_id", label: "Affaire concernée", type: "iapdeal", span2: true },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ]}
      caption={action ? `Action ${space.name} n° ${action.number}` : `Plan d’actions ${space.name}`}
      title={action ? action.title : "Nouvelle action"}
      onClose={onClose}
    />
  );
}

export function FinContactSheet({ contact, onClose }: { contact: FinContact | null } & Close) {
  const space = useSpace();
  return (
    <EntitySheet
      path={`${space.code}/contacts`}
      entity={`${space.code}_contact`}
      noun={{ label: "Contact" }}
      item={contact}
      fields={[
        { name: "name", label: "Nom", required: true },
        { name: "role", label: "Rôle", type: "select", options: FIN_CONTACT_ROLES },
        { name: "company", label: "Société / institution" },
        { name: "phone", label: "Téléphone" },
        { name: "email", label: "E-mail" },
        { name: "notes", label: "Notes", type: "textarea", hint: "Besoin, montant recherché, documents remis…" },
      ]}
      caption={contact?.role ?? `Contacts ${space.name}`}
      title={contact ? contact.name : "Nouveau contact"}
      onClose={onClose}
    />
  );
}

export function PartnerSheet({ partner, defaults, onClose }: { partner: Partner | null; defaults?: Partial<Partner> } & Close) {
  return (
    <EntitySheet
      path="groupe/partners"
      entity="partner"
      noun={{ label: "Partenaire" }}
      item={partner}
      defaults={{ entity: "Groupe", ...defaults }}
      fields={[
        { name: "name", label: "Partenaire", wide: true, required: true },
        { name: "entity", label: "Entité IAG", type: "select", options: [...PARTNER_ENTITIES], required: true },
        { name: "type", label: "Type de partenaire" },
        { name: "zone", label: "Zone / marché" },
        { name: "potential", label: "Potentiel commercial", type: "select", options: [...PARTNER_POTENTIALS] },
        { name: "priority", label: "Priorité", type: "prio" },
        { name: "relationship", label: "Niveau de relation" },
        { name: "next_action", label: "Prochaine action", type: "textarea", section: "Pilotage" },
        { name: "due_date", label: "Échéance", type: "date" },
        { name: "last_interaction", label: "Dernière interaction", type: "date" },
        { name: "iag_referent", label: "Référent IAG" },
        { name: "partner_referent", label: "Référent partenaire" },
        { name: "expertise", label: "Expertise / offre", type: "textarea", section: "Intérêt pour le groupe" },
        { name: "complementarity", label: "Complémentarité avec IAG", type: "textarea" },
        { name: "market_access", label: "Accès marché / clients", type: "textarea" },
        { name: "opportunities", label: "Opportunités conjointes", type: "textarea" },
        { name: "potential_revenue", label: "CA potentiel (FCFA)", type: "amount" },
        { name: "margin", label: "Marge / commission IAG" },
        { name: "model", label: "Modèle de partenariat", section: "Cadre" },
        { name: "legal_status", label: "Statut juridique / NDA" },
        { name: "risks", label: "Risques / dépendances", type: "textarea" },
      ]}
      caption={partner ? `Partenaire n° ${partner.number} · ${partner.entity}` : "Partenaires du groupe"}
      title={partner ? partner.name : "Nouveau partenaire"}
      onClose={onClose}
    />
  );
}
