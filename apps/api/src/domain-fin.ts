/**
 * Vocabulaire et règles d'IAC (mobilisation de capitaux) et d'IAF (financement), repris du classeur
 * PIPELINE GROUPE IAC IAF.xlsx. Les deux filiales suivent le même modèle, chacune dans ses propres tables
 * (`iac_deals`, `iaf_deals`…). Les valeurs dérivées sont calculées ici, jamais stockées.
 *
 * Une affaire rapporte deux revenus : l'honoraire (forfait facturé au client pour l'étude et la
 * structuration) et la commission de succès (montant obtenu × taux), chacun suivi jusqu'à l'encaissement.
 */
import { daysBetween, today } from "./domain.ts";
import type { FinSpace } from "./spaces.ts";

export const FIN_STAGES = [
  { code: "F0", label: "Prospection", short: "Prospection" },
  { code: "F1", label: "Étude de faisabilité / documents", short: "Étude" },
  { code: "F2", label: "Mandat signé", short: "Mandat signé" },
  { code: "F3", label: "Structuration / dossier transmis", short: "Structuration" },
  { code: "F4", label: "Financement obtenu, à recouvrer", short: "À recouvrer" },
  { code: "F5", label: "Encaissé", short: "Encaissé" },
  { code: "LOST", label: "Perdu", short: "Perdu" },
] as const;

export type FinStageCode = (typeof FIN_STAGES)[number]["code"];
export const FIN_STAGE_CODES = FIN_STAGES.map((s) => s.code) as [FinStageCode, ...FinStageCode[]];
/** En cours : de la prospection jusqu'au recouvrement. */
export const FIN_OPEN_STAGES: FinStageCode[] = ["F0", "F1", "F2", "F3", "F4"];
/** Financement obtenu : commission de succès acquise (à recouvrer ou encaissée). */
export const FIN_WON_STAGES: FinStageCode[] = ["F4", "F5"];

export const FIN_SPACE_INFO: Record<FinSpace, { name: string; full_name: string; activity: string }> = {
  iac: { name: "IAC", full_name: "Infinity Africa Capital", activity: "mobilisation de capitaux" },
  iaf: { name: "IAF", full_name: "Infinity Africa Finance", activity: "financement" },
};

export const FIN_LISTS = {
  stages: FIN_STAGES,
  natures: [
    "Mobilisation de capitaux",
    "Levée de fonds Dette",
    "Levée de fonds Equity",
    "Leasing",
    "Restructuration",
    "Cession de parts",
    "Acquisition d'équipements",
    "Création de fonds d'investissement",
    "Financement de projet",
    "À définir",
  ],
  sectors: [
    "Agro Alimentaire",
    "Agro Industrie",
    "BTP",
    "Biométane",
    "Éducation",
    "Énergie",
    "Hydrocarbures",
    "Import / Export",
    "Industrie",
    "Logistique",
    "Microfinance",
    "Minier",
    "Santé",
    "Transport",
  ],
  contact_roles: ["Dirigeant client", "Banque / bailleur", "Investisseur", "Partenaire", "Conseil", "Autre"],
  priorities: ["P1", "P2", "P3"],
  action_statuses: ["À faire", "En cours", "Bloqué", "Fait", "Abandonné"],
} as const;

/** Accepte le code (« F2 ») ou le libellé (« Mandat signé »), sans tenir compte de la casse. */
export function normalizeFinStage(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const v = value.trim().toLowerCase();
  const found = FIN_STAGES.find((s) => s.code.toLowerCase() === v || s.label.toLowerCase() === v || s.short.toLowerCase() === v);
  return found ? found.code : value.trim();
}

export function finStageLabel(code: string | null | undefined): string | null {
  return FIN_STAGES.find((s) => s.code === code)?.label ?? code ?? null;
}

export type FinDealRow = {
  stage: string;
  amount: number | null;
  closing: number | null;
  fee: number | null;
  fee_received: number | null;
  commission_rate: number | null;
  commission_received: number | null;
  due_date: string | null;
};

export function finDealCommission(deal: Pick<FinDealRow, "amount" | "commission_rate">): number | null {
  return deal.amount != null && deal.commission_rate != null ? Math.round(deal.amount * deal.commission_rate) : null;
}

const positive = (n: number) => (n > 0 ? n : 0);

export function finDealComputed(deal: FinDealRow, now = today()) {
  const commission = finDealCommission(deal);
  const isOpen = FIN_OPEN_STAGES.includes(deal.stage as FinStageCode);
  const won = FIN_WON_STAGES.includes(deal.stage as FinStageCode);
  const revenue = deal.fee == null && commission == null ? null : (deal.fee ?? 0) + (commission ?? 0);
  // Honoraire : dû dès qu'il est fixé (sauf affaire perdue) ; commission : due une fois le financement obtenu.
  const feeOutstanding = deal.fee != null && deal.stage !== "LOST" ? positive(deal.fee - (deal.fee_received ?? 0)) : 0;
  const commissionOutstanding = won && commission != null ? positive(commission - (deal.commission_received ?? 0)) : 0;
  return {
    stage_label: finStageLabel(deal.stage),
    commission,
    revenue,
    weighted_amount: deal.amount != null && deal.closing != null ? Math.round(deal.amount * deal.closing) : null,
    weighted_commission: commission != null && deal.closing != null ? Math.round(commission * deal.closing) : null,
    weighted_revenue: revenue != null && deal.closing != null ? Math.round(revenue * deal.closing) : null,
    received: (deal.fee_received ?? 0) + (deal.commission_received ?? 0),
    fee_outstanding: feeOutstanding,
    commission_outstanding: commissionOutstanding,
    outstanding: feeOutstanding + commissionOutstanding,
    is_open: isOpen,
    is_won: won,
    days_to_due: deal.due_date ? daysBetween(now, deal.due_date) : null,
    overdue: isOpen && deal.due_date != null && deal.due_date < now,
  };
}

/** Tables d'une filiale IAC / IAF (même structure, préfixe différent). */
export function finSchema(space: FinSpace): string {
  return `
CREATE TABLE IF NOT EXISTS ${space}_deals (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  nature TEXT,
  sector TEXT,
  owner TEXT,
  apporteur TEXT,
  stage TEXT NOT NULL DEFAULT 'F0',
  closing REAL CHECK (closing BETWEEN 0 AND 1),
  due_date TEXT,
  amount INTEGER,
  fee INTEGER,
  fee_received INTEGER,
  fee_received_at TEXT,
  commission_rate REAL CHECK (commission_rate BETWEEN 0 AND 1),
  commission_received INTEGER,
  commission_received_at TEXT,
  priority INTEGER,
  next_step TEXT,
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ${space}_contacts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  company TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ${space}_actions (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  deal_id INTEGER REFERENCES ${space}_deals(id) ON DELETE SET NULL,
  owner TEXT,
  due_date TEXT,
  priority TEXT CHECK (priority IN ('P1', 'P2', 'P3')),
  status TEXT NOT NULL DEFAULT 'À faire',
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ${space}_actions_deal ON ${space}_actions(deal_id);
`;
}

// ---------- Partenaires du Groupe ----------

export const PARTNER_LISTS = {
  entities: ["Groupe", "IAT", "IAP", "IAC", "IAF"],
  potentials: ["Élevé", "Moyen", "Faible"],
  priorities: ["P1", "P2", "P3"],
} as const;

export const PARTNER_SCHEMA = `
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  entity TEXT NOT NULL DEFAULT 'Groupe',
  name TEXT NOT NULL,
  type TEXT,
  zone TEXT,
  expertise TEXT,
  complementarity TEXT,
  market_access TEXT,
  potential TEXT CHECK (potential IN ('Élevé', 'Moyen', 'Faible')),
  model TEXT,
  relationship TEXT,
  legal_status TEXT,
  iag_referent TEXT,
  partner_referent TEXT,
  opportunities TEXT,
  potential_revenue INTEGER,
  margin TEXT,
  last_interaction TEXT,
  next_action TEXT,
  due_date TEXT,
  priority TEXT CHECK (priority IN ('P1', 'P2', 'P3')),
  risks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function partnerComputed(p: { due_date: string | null }, now = today()) {
  return {
    days_to_due: p.due_date ? daysBetween(now, p.due_date) : null,
    overdue: p.due_date != null && p.due_date < now,
  };
}
