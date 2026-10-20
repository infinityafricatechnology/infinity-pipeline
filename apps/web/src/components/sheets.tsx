import { Link } from "react-router";
import { useSave } from "../lib/api";
import { compact, date, fcfa, pct, relativeDays } from "../lib/format";
import { type Account, type Action, type Contact, type Deal, type Invoice, type Opportunity, type Prospect, type Renewal, STAGES, type Solution, type Tender } from "../lib/types";
import { EntitySheet, type FieldSpec } from "./EntitySheet";
import { Status, renewalTone, useToast } from "./ui";

/* Valeurs admises, alignées sur l'onglet « Listes » du classeur (GET /api/v1/lists) */
export const LEADS = ["Commercial IAT", "Fadel Koloma / Salim Kone", "Maoula", "Direction générale", "À confirmer"];
const RECURRENCES = ["Récurrent", "Ponctuel", "Mixte"];
export const ACTION_STATUSES = ["À faire", "En cours", "Bloqué", "Fait", "Abandonné"];
export const RENEWAL_STATUSES = ["Non démarré", "Attente cotation fournisseur", "Offre envoyée", "Accord client", "Renouvelé", "Perdu"];
export const CONTACT_STATUSES = ["À contacter", "Contacté", "RDV obtenu", "Coordonnées à vérifier", "Ne plus contacter"];
export const CONTACT_PROFILES = [
  "Direction générale / métier",
  "Direction SI / digital",
  "Informatique / projets",
  "Infrastructure / réseaux",
  "Sécurité SI",
  "Achats / marchés",
  "Commercial / autre",
];
export const TENDER_STAGES = ["Veille", "Go / No-go", "En préparation", "Déposé", "Gagné", "Perdu"];
export const KINDS = [
  { value: "client", label: "Client existant" },
  { value: "prospect", label: "Prospect" },
  { value: "tender", label: "Appel d’offres" },
  { value: "partner", label: "Partenaire / apporteur" },
];
const stageOptions = STAGES.map((s) => ({ value: s.code, label: s.label }));

type Close = { onClose: () => void };

export function DealSheet({ deal, defaults, onClose }: { deal: Deal | null; defaults?: Partial<Deal> } & Close) {
  const fields: FieldSpec[] = [
    { name: "title", label: "Nature de l’affaire", wide: true, required: true },
    { name: "account_id", label: "Compte", type: "account", required: true, span2: true },
    { name: "project_label", label: "Entreprise / projet affiché" },
    { name: "stage", label: "Étape", type: "select", options: stageOptions, required: true },
    { name: "priority", label: "Priorité", type: "prio" },
    { name: "closing", label: "Probabilité de signature (closing)", type: "percent" },
    { name: "amount", label: "Montant (FCFA)", type: "amount" },
    { name: "commission", label: "Commission (FCFA)", type: "amount" },
    { name: "due_date", label: "Échéance", type: "date" },
    { name: "next_step", label: "Prochaine étape", type: "textarea", section: "Suivi" },
    { name: "lead", label: "Responsable", type: "select", options: LEADS },
    { name: "solution", label: "Solution / partenaire", wide: true, section: "Contexte" },
    { name: "service", label: "Service IAT proposé", wide: true },
    { name: "origin", label: "Origine" },
    { name: "recurrence", label: "Récurrent / ponctuel", type: "select", options: RECURRENCES },
    { name: "key_contact", label: "Contact clé", type: "textarea" },
    { name: "comments", label: "Commentaires", type: "textarea" },
  ];
  return (
    <EntitySheet
      path="deals"
      entity="deal"
      noun={{ label: "Affaire", feminine: true }}
      item={deal}
      defaults={{ stage: "M0", lead: "Commercial IAT", ...defaults }}
      fields={fields}
      derive={(name, value) => {
        // Une affaire gagnée est signée à 100 %, une affaire perdue à 0 % : le pondéré suit.
        if (name === "stage" && value === "M6") return { closing: 1 };
        if (name === "stage" && value === "LOST") return { closing: 0 };
        return undefined;
      }}
      caption={
        deal ? (
          <>
            Affaire n° {deal.number} · <Link to={`/comptes/${deal.account_slug}`}>{deal.account_name}</Link>
          </>
        ) : (
          "Pipeline"
        )
      }
      title={deal ? deal.title : "Nouvelle affaire"}
      computed={
        deal && (
          <div className="computed">
            <div>
              <span>Montant pondéré</span>
              <strong className="num" title={fcfa(deal.weighted_amount)}>
                {compact(deal.weighted_amount)}
              </strong>
            </div>
            <div>
              <span>% rentabilité</span>
              <strong className="num">{pct(deal.profitability)}</strong>
            </div>
            <div>
              <span>Échéance</span>
              <strong>{deal.due_date ? relativeDays(deal.days_to_due) : "—"}</strong>
            </div>
          </div>
        )
      }
      onClose={onClose}
    />
  );
}

export function ActionSheet({ action, onClose }: { action: Action | null } & Close) {
  return (
    <EntitySheet
      path="actions"
      entity="action"
      noun={{ label: "Action", feminine: true }}
      item={action}
      defaults={{ status: "À faire", owner: "Commercial IAT" }}
      fields={[
        { name: "title", label: "Action", type: "textarea", required: true },
        { name: "status", label: "Statut", type: "select", options: ACTION_STATUSES },
        { name: "priority", label: "Priorité", type: "prio" },
        { name: "due_date", label: "Échéance", type: "date" },
        { name: "owner", label: "Responsable", type: "select", options: LEADS },
        { name: "account_id", label: "Compte concerné", type: "account" },
        { name: "related_to", label: "Lié à", hint: "Compte, solution ou sujet" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ]}
      caption={action ? `Action n° ${action.number}` : "Plan d’actions"}
      title={action ? action.title : "Nouvelle action"}
      onClose={onClose}
    />
  );
}

export function ContactSheet({ contact, defaults, onClose }: { contact: Contact | null; defaults?: Partial<Contact> } & Close) {
  return (
    <EntitySheet
      path="contacts"
      entity="contact"
      noun={{ label: "Contact" }}
      item={contact}
      defaults={{ source: "manual", status: "À contacter", ...defaults }}
      fields={[
        { name: "name", label: "Nom", required: true },
        { name: "role", label: "Fonction" },
        { name: "company", label: "Entreprise" },
        { name: "account_id", label: "Compte du pipeline", type: "account" },
        { name: "phone", label: "Téléphone" },
        { name: "email", label: "E-mail" },
        { name: "profile", label: "Profil", type: "select", options: CONTACT_PROFILES },
        { name: "status", label: "Statut", type: "select", options: CONTACT_STATUSES },
        { name: "last_contact", label: "Dernier contact", type: "date" },
        { name: "sector", label: "Secteur" },
        { name: "pipeline_link", label: "Lien avec le pipeline", wide: true },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ]}
      caption={contact?.company ?? "Contacts"}
      title={contact ? contact.name : "Nouveau contact"}
      onClose={onClose}
    />
  );
}

export function RenewalSheet({ renewal, defaults, onClose }: { renewal: Renewal | null; defaults?: Partial<Renewal> } & Close) {
  const save = useSave();
  const toast = useToast();
  const remindedToday = () => {
    if (!renewal) return;
    const today = new Date().toISOString().slice(0, 10);
    save.mutate(
      { method: "patch", path: `/renewals/${renewal.id}`, body: { last_reminder_date: today } },
      {
        onSuccess: () => {
          toast("Relance du jour enregistrée");
          onClose();
        },
        onError: (error) => toast(error.message, true),
      },
    );
  };
  return (
    <EntitySheet
      path="renewals"
      entity="renewal"
      noun={{ label: "Renouvellement" }}
      item={renewal}
      defaults={{ status: "Non démarré", ...defaults }}
      fields={[
        { name: "contract", label: "Contrat / produit", required: true },
        { name: "account_id", label: "Client", type: "account", required: true },
        { name: "status", label: "Statut du renouvellement", type: "select", options: RENEWAL_STATUSES },
        { name: "owner", label: "Porteur", type: "select", options: LEADS },
        { name: "last_invoice_date", label: "Dernière facturation", type: "date", hint: "L’échéance est calculée à + 12 mois" },
        { name: "last_amount", label: "Dernier montant facturé", type: "amount" },
        { name: "due_date_override", label: "Échéance particulière", type: "date", hint: "Seulement si elle diffère de + 12 mois" },
        { name: "last_reminder_date", label: "Date de la dernière relance", type: "date" },
        { name: "next_action", label: "Prochaine action", type: "textarea" },
        { name: "history", label: "Historique facturé", wide: true },
        { name: "comments", label: "Commentaire", type: "textarea" },
      ]}
      caption={renewal?.account_name ?? "Renouvellements"}
      title={renewal ? renewal.contract : "Nouveau renouvellement"}
      computed={
        renewal && (
          <div className="computed">
            <div>
              <span>Échéance</span>
              <strong>{date(renewal.due_date, true)}</strong>
            </div>
            <div>
              <span>Relance J-90</span>
              <strong>{date(renewal.reminder_90, true)}</strong>
            </div>
            <div>
              <span>Alerte</span>
              <strong>
                <Status tone={renewalTone(renewal.alert)}>{renewal.alert}</Status>
              </strong>
            </div>
            <div className="computed-action">
              <span>
                {renewal.last_reminder_date ? `Dernière relance le ${date(renewal.last_reminder_date, true)}` : "Aucune relance notée"}
              </span>
              <button type="button" className="btn" onClick={remindedToday} disabled={save.isPending}>
                Relancé aujourd’hui
              </button>
            </div>
          </div>
        )
      }
      onClose={onClose}
    />
  );
}

export function InvoiceSheet({ invoice, defaults, onClose }: { invoice: Invoice | null; defaults?: Partial<Invoice> } & Close) {
  return (
    <EntitySheet
      path="invoices"
      entity="invoice"
      noun={{ label: "Facture", feminine: true }}
      item={invoice}
      defaults={{ recurrence: "Récurrent", fiscal_year: new Date().getFullYear(), ...defaults }}
      fields={[
        { name: "product", label: "Produit / service", wide: true, required: true },
        { name: "account_id", label: "Client", type: "account", required: true },
        { name: "invoice_number", label: "N° de facture" },
        { name: "vendor", label: "Partenaire / éditeur" },
        { name: "fiscal_year", label: "Exercice", type: "int" },
        { name: "invoice_date", label: "Date de facturation", type: "date" },
        { name: "amount", label: "Montant facturé", type: "amount" },
        { name: "collected", label: "Encaissé", type: "amount" },
        { name: "cost_of_sales", label: "Coût des ventes", type: "amount" },
        { name: "commission", label: "Commission", type: "amount" },
        { name: "recurrence", label: "Récurrent / ponctuel", type: "select", options: RECURRENCES },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ]}
      caption={invoice?.account_name ?? "Facturation"}
      title={invoice ? invoice.product : "Nouvelle facture"}
      computed={
        invoice && (
          <div className="computed">
            <div>
              <span>CA net</span>
              <strong className="num">{compact(invoice.net_revenue)}</strong>
            </div>
            <div>
              <span>Marge</span>
              <strong className="num">{compact(invoice.margin)}</strong>
            </div>
            <div>
              <span>Solde à encaisser</span>
              <strong className="num">{compact(invoice.balance)}</strong>
            </div>
          </div>
        )
      }
      onClose={onClose}
    />
  );
}

export function OpportunitySheet({ opportunity, defaults, onClose }: { opportunity: Opportunity | null; defaults?: Partial<Opportunity> } & Close) {
  return (
    <EntitySheet
      path="opportunities"
      entity="opportunity"
      noun={{ label: "Opportunité", feminine: true }}
      item={opportunity}
      defaults={{ owner: "Commercial IAT", ...defaults }}
      fields={[
        { name: "title", label: "Opportunité", wide: true, required: true },
        { name: "account_id", label: "Compte", type: "account", required: true },
        { name: "solution", label: "Solution / partenaire" },
        { name: "priority", label: "Priorité", type: "prio" },
        { name: "due_date", label: "Échéance", type: "date" },
        { name: "owner", label: "Responsable", type: "select", options: LEADS },
        { name: "action", label: "Valeur pour le client / action à mener", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ]}
      caption="Stratégie du compte"
      title={opportunity ? opportunity.title : "Nouvelle opportunité"}
      onClose={onClose}
    />
  );
}

export function TenderSheet({ tender, onClose }: { tender: Tender | null } & Close) {
  return (
    <EntitySheet
      path="tenders"
      entity="tender"
      noun={{ label: "Appel d’offres" }}
      item={tender}
      defaults={{ stage: "Veille", owner: "Commercial IAT" }}
      fields={[
        { name: "organization", label: "Organisme", wide: true, required: true },
        { name: "subject", label: "Objet", wide: true },
        { name: "stage", label: "Étape", type: "select", options: TENDER_STAGES },
        { name: "owner", label: "Responsable", type: "select", options: LEADS },
        { name: "reference", label: "Référence" },
        { name: "estimated_amount", label: "Montant estimé", type: "amount" },
        { name: "published_on", label: "Publication", type: "date" },
        { name: "deadline", label: "Date limite de dépôt", type: "date" },
        { name: "response_mode", label: "Mode de réponse" },
        { name: "partners", label: "Partenaire(s)" },
        { name: "requirements", label: "Pièces / exigences", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ]}
      caption="Appels d’offres"
      title={tender ? tender.organization : "Nouvel appel d’offres"}
      onClose={onClose}
    />
  );
}

export function ProspectSheet({ prospect, defaults, onClose }: { prospect: Prospect | null; defaults?: Partial<Prospect> } & Close) {
  return (
    <EntitySheet
      path="prospects"
      entity="prospect"
      noun={{ label: "Prospect" }}
      item={prospect}
      defaults={{ stage: "M0", ...defaults }}
      fields={[
        { name: "company", label: "Prospect", required: true },
        { name: "solution_id", label: "Solution", type: "solution", required: true },
        { name: "sector", label: "Secteur" },
        { name: "stage", label: "Étape", type: "select", options: stageOptions },
        { name: "attack_week", label: "Semaine d’attaque", type: "date" },
        { name: "relationship_score", label: "Relation IAG (0 à 5)", type: "int" },
        { name: "owner", label: "Responsable", type: "select", options: LEADS },
        { name: "last_action_date", label: "Dernière action", type: "date" },
        { name: "contact", label: "Contact / fonction", type: "textarea" },
        { name: "angle", label: "Angle d’attaque / besoin", type: "textarea" },
        { name: "next_action", label: "Prochaine action", type: "textarea" },
        { name: "comments", label: "Commentaires", type: "textarea" },
      ]}
      caption={prospect?.solution_name ?? "Prospects"}
      title={prospect ? prospect.company : "Nouveau prospect"}
      onClose={onClose}
    />
  );
}

export function SolutionSheet({ solution, onClose, onSaved }: { solution: Solution | null; onSaved?: (s: Solution) => void } & Close) {
  return (
    <EntitySheet
      path="solutions"
      entity="solution"
      noun={{ label: "Solution", feminine: true }}
      item={solution}
      deletable={false}
      defaults={{ mastery: "À former" }}
      onSaved={(saved) => onSaved?.(saved as unknown as Solution)}
      fields={[
        { name: "name", label: "Solution", required: true },
        { name: "vendor", label: "Éditeur / partenaire" },
        { name: "category", label: "Catégorie" },
        { name: "partnership_status", label: "Statut du partenariat" },
        { name: "internal_expert", label: "Référent interne" },
        { name: "mastery", label: "Maîtrise commerciale", type: "select", options: ["À former", "En cours", "Maîtrisé"] },
        { name: "priority", label: "Priorité", type: "prio" },
        { name: "target_sectors", label: "Cibles sectorielles", wide: true },
        { name: "value_pitch", label: "Problème adressé / valeur", type: "textarea" },
        { name: "existing_clients", label: "Clients existants", wide: true },
        { name: "materials", label: "Supports disponibles", wide: true },
        { name: "next_action", label: "Prochaine action", type: "textarea" },
      ]}
      caption="Catalogue"
      title={solution ? solution.name : "Nouvelle solution"}
      onClose={onClose}
    />
  );
}

export function AccountSheet({ account, onClose }: { account: Account | null } & Close) {
  return (
    <EntitySheet
      path="accounts"
      entity="account"
      noun={{ label: "Compte" }}
      item={account}
      deletable={false}
      defaults={{ kind: "prospect" }}
      fields={[
        { name: "name", label: "Nom", required: true },
        { name: "kind", label: "Type de compte", type: "select", options: KINDS, required: true },
        { name: "display_name", label: "Nom complet" },
        { name: "sector", label: "Secteur" },
        { name: "health", label: "État de santé", type: "select", options: ["Bon", "À surveiller", "À risque"], section: "Relation" },
        { name: "satisfaction", label: "Satisfaction (1 à 5)", type: "int" },
        { name: "iat_lead", label: "Responsable IAT" },
        { name: "executive_sponsor", label: "Relation haut niveau gérée par" },
        { name: "last_contact", label: "Dernier contact", type: "date" },
        { name: "next_meeting", label: "Prochain point prévu" },
        { name: "leadership_summary", label: "Direction générale", type: "textarea", section: "Interlocuteurs" },
        { name: "contact_direction", label: "Interlocuteur direction", type: "textarea" },
        { name: "contact_operational", label: "Interlocuteur opérationnel", type: "textarea" },
        { name: "contact_purchasing", label: "Achats / marchés", type: "textarea" },
        { name: "billing_details", label: "Facturation (raison sociale, NCC, e-mail)", type: "textarea" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      caption={account ? "Fiche compte" : "Comptes"}
      title={account ? account.name : "Nouveau compte"}
      onClose={onClose}
    />
  );
}
