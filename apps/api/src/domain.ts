/**
 * Vocabulaire et règles de calcul du pipeline, repris du classeur PIPELINE_IAT_V3.xlsx.
 * Toute valeur dérivée exposée par l'API est calculée ici, jamais stockée.
 */

export const STAGES = [
  { code: "M0", label: "M0 – À qualifier", short: "À qualifier" },
  { code: "M1", label: "M1 – Besoin identifié", short: "Besoin identifié" },
  { code: "M2", label: "M2 – Cadrage / découverte", short: "Cadrage" },
  { code: "M3", label: "M3 – Offre en préparation", short: "Offre en préparation" },
  { code: "M4", label: "M4 – Offre remise", short: "Offre remise" },
  { code: "M5", label: "M5 – Négociation / signature", short: "Négociation" },
  { code: "M6", label: "M6 – Gagné", short: "Gagné" },
  { code: "LOST", label: "Perdu", short: "Perdu" },
  { code: "CLOSED", label: "Clôturé / en cessation", short: "Clôturé" },
] as const;

export type StageCode = (typeof STAGES)[number]["code"];
export const STAGE_CODES = STAGES.map((s) => s.code) as [StageCode, ...StageCode[]];
/** Étapes d'une affaire encore en cours (offres à suivre). */
export const OPEN_STAGES: StageCode[] = ["M0", "M1", "M2", "M3", "M4", "M5"];

export const ACCOUNT_KINDS = [
  { code: "client", label: "Client existant" },
  { code: "prospect", label: "Prospect" },
  { code: "tender", label: "Appel d’offres" },
  { code: "partner", label: "Partenaire / apporteur" },
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number]["code"];

export const LISTS = {
  stages: STAGES,
  account_kinds: ACCOUNT_KINDS,
  priorities: ["P1", "P2", "P3"],
  recurrences: ["Récurrent", "Ponctuel", "Mixte"],
  leads: ["Commercial IAT", "Maoula", "Direction générale", "Fadel Koloma / Salim Kone", "À confirmer"],
  health: ["Bon", "À surveiller", "À risque"],
  action_statuses: ["À faire", "En cours", "Bloqué", "Fait", "Abandonné"],
  tender_stages: ["Veille", "Go / No-go", "En préparation", "Déposé", "Gagné", "Perdu"],
  mastery: ["À former", "En cours", "Maîtrisé"],
  renewal_statuses: ["Non démarré", "Attente cotation fournisseur", "Offre envoyée", "Accord client", "Renouvelé", "Perdu"],
  contact_statuses: ["À contacter", "Contacté", "RDV obtenu", "Coordonnées à vérifier", "Ne plus contacter"],
  contact_profiles: [
    "Direction générale / métier",
    "Direction SI / digital",
    "Informatique / projets",
    "Infrastructure / réseaux",
    "Sécurité SI",
    "Achats / marchés",
    "Commercial / autre",
  ],
} as const;

/** Accepte le code (« M5 ») ou le libellé du classeur (« M5 – Négociation / signature »). */
export function normalizeStage(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const v = value.trim();
  const found = STAGES.find((s) => s.code === v.toUpperCase() || s.label === v || s.short.toLowerCase() === v.toLowerCase());
  return found ? found.code : v;
}

export function stageLabel(code: string | null | undefined): string | null {
  return STAGES.find((s) => s.code === code)?.label ?? code ?? null;
}

// ---------- Dates (jours calendaires, fuseau d'Abidjan = UTC) ----------

export function today(): string {
  return process.env.IAT_TODAY ?? new Date().toISOString().slice(0, 10);
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUTC(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Équivalent d'EDATE(date, mois) d'Excel : même jour, borné à la fin du mois. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// ---------- Valeurs dérivées ----------

type DealRow = { stage: string; amount: number | null; closing: number | null; commission: number | null; due_date: string | null };

export function dealComputed(deal: DealRow, now = today()) {
  const weighted = deal.amount != null && deal.closing != null ? Math.round(deal.amount * deal.closing) : null;
  const profitability = deal.amount && deal.commission != null ? deal.commission / deal.amount : null;
  const isOpen = OPEN_STAGES.includes(deal.stage as StageCode);
  return {
    stage_label: stageLabel(deal.stage),
    weighted_amount: weighted,
    profitability,
    is_open: isOpen,
    days_to_due: deal.due_date ? daysBetween(now, deal.due_date) : null,
    overdue: isOpen && deal.due_date != null && deal.due_date < now,
  };
}

type InvoiceRow = { amount: number | null; cost_of_sales: number | null; commission: number | null; collected: number | null };

export function invoiceComputed(invoice: InvoiceRow) {
  const amount = invoice.amount ?? 0;
  const net = invoice.amount == null ? null : amount - (invoice.commission ?? 0);
  return {
    net_revenue: net,
    margin: net == null ? null : net - (invoice.cost_of_sales ?? 0),
    balance: invoice.amount == null ? null : amount - (invoice.collected ?? 0),
  };
}

export type RenewalAlert = "Renouvelé" | "Perdu" | "Date à confirmer" | "Échu - urgent" | "À relancer (≤ 90 j)" | "À venir";

type RenewalRow = { last_invoice_date: string | null; due_date_override: string | null; status: string };

/** Règles de l'onglet Renouvellements : échéance = dernière facturation + 12 mois, relances J-90 et J-30. */
export function renewalComputed(renewal: RenewalRow, now = today()) {
  const due = renewal.due_date_override ?? (renewal.last_invoice_date ? addMonths(renewal.last_invoice_date, 12) : null);
  const daysLeft = due ? daysBetween(now, due) : null;
  let alert: RenewalAlert;
  if (renewal.status === "Renouvelé") alert = "Renouvelé";
  else if (renewal.status === "Perdu") alert = "Perdu";
  else if (!due) alert = "Date à confirmer";
  else if (daysLeft! < 0) alert = "Échu - urgent";
  else if (daysLeft! <= 90) alert = "À relancer (≤ 90 j)";
  else alert = "À venir";
  return {
    due_date: due,
    days_left: daysLeft,
    reminder_90: due ? addDays(due, -90) : null,
    reminder_30: due ? addDays(due, -30) : null,
    alert,
  };
}

type ActionRow = { due_date: string | null; status: string };

export function actionComputed(action: ActionRow, now = today()) {
  const done = action.status === "Fait" || action.status === "Abandonné";
  return {
    done,
    overdue: !done && action.due_date != null && action.due_date < now,
    days_to_due: action.due_date ? daysBetween(now, action.due_date) : null,
  };
}

export function tenderComputed(tender: { deadline: string | null }, now = today()) {
  return { days_left: tender.deadline ? daysBetween(now, tender.deadline) : null };
}
