export type StageCode = "M0" | "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "LOST" | "CLOSED";

export const STAGES: { code: StageCode; label: string; short: string }[] = [
  { code: "M0", label: "M0 – À qualifier", short: "À qualifier" },
  { code: "M1", label: "M1 – Besoin identifié", short: "Besoin identifié" },
  { code: "M2", label: "M2 – Cadrage / découverte", short: "Cadrage" },
  { code: "M3", label: "M3 – Offre en préparation", short: "Offre en préparation" },
  { code: "M4", label: "M4 – Offre remise", short: "Offre remise" },
  { code: "M5", label: "M5 – Négociation / signature", short: "Négociation" },
  { code: "M6", label: "M6 – Gagné", short: "Gagné" },
  { code: "LOST", label: "Perdu", short: "Perdu" },
  { code: "CLOSED", label: "Clôturé / en cessation", short: "Clôturé" },
];
export const FLOW_STAGES = STAGES.slice(0, 7);
export const stageShort = (code: string | null | undefined) => STAGES.find((s) => s.code === code)?.short ?? "—";

export type Account = {
  id: number;
  slug: string;
  name: string;
  display_name: string | null;
  kind: "client" | "prospect" | "tender" | "partner";
  sector: string | null;
  leadership_summary: string | null;
  contact_direction: string | null;
  contact_operational: string | null;
  contact_purchasing: string | null;
  iat_lead: string | null;
  executive_sponsor: string | null;
  health: string | null;
  satisfaction: number | null;
  last_contact: string | null;
  next_meeting: string | null;
  notes: string | null;
  has_fiche: boolean;
  deals_count: number;
  open_amount: number;
};

export type Deal = {
  id: number;
  number: number;
  account_id: number;
  account_name: string;
  account_slug: string;
  account_kind: string;
  project_label: string | null;
  title: string;
  solution: string | null;
  origin: string | null;
  lead: string | null;
  recurrence: string | null;
  stage: StageCode;
  stage_label: string;
  closing: number | null;
  amount: number | null;
  commission: number | null;
  weighted_amount: number | null;
  profitability: number | null;
  priority: "P1" | "P2" | "P3" | null;
  next_step: string | null;
  due_date: string | null;
  days_to_due: number | null;
  overdue: boolean;
  is_open: boolean;
  comments: string | null;
  service: string | null;
  key_contact: string | null;
};

export type Invoice = {
  id: number;
  account_id: number;
  account_name: string;
  product: string;
  vendor: string | null;
  recurrence: string | null;
  fiscal_year: number | null;
  invoice_date: string | null;
  amount: number | null;
  cost_of_sales: number | null;
  commission: number | null;
  collected: number | null;
  net_revenue: number | null;
  margin: number | null;
  balance: number | null;
  comments: string | null;
};

export type Renewal = {
  id: number;
  account_id: number;
  account_name: string;
  account_slug: string;
  contract: string;
  last_invoice_date: string | null;
  last_amount: number | null;
  history: string | null;
  due_date_override: string | null;
  status: string;
  owner: string | null;
  last_reminder_date: string | null;
  next_action: string | null;
  comments: string | null;
  due_date: string | null;
  days_left: number | null;
  reminder_90: string | null;
  reminder_30: string | null;
  alert: string;
};

export type Opportunity = {
  id: number;
  account_id: number;
  title: string;
  solution: string | null;
  priority: string | null;
  due_date: string | null;
  owner: string | null;
  action: string | null;
  comments: string | null;
};

export type Contact = {
  id: number;
  account_id: number | null;
  account_name: string | null;
  account_slug: string | null;
  company: string | null;
  sector: string | null;
  name: string;
  role: string | null;
  profile: string | null;
  phone: string | null;
  email: string | null;
  pipeline_link: string | null;
  status: string | null;
  last_contact: string | null;
  comments: string | null;
  source: "client_base" | "research" | "manual";
};

export type Action = {
  id: number;
  number: number;
  title: string;
  related_to: string | null;
  account_id: number | null;
  account_name: string | null;
  account_slug: string | null;
  owner: string | null;
  due_date: string | null;
  priority: string | null;
  status: string;
  comments: string | null;
  done: boolean;
  overdue: boolean;
  days_to_due: number | null;
};

export type Tender = {
  id: number;
  organization: string;
  subject: string | null;
  reference: string | null;
  published_on: string | null;
  deadline: string | null;
  days_left: number | null;
  estimated_amount: number | null;
  response_mode: string | null;
  partners: string | null;
  requirements: string | null;
  stage: string | null;
  owner: string | null;
  comments: string | null;
};

export type Solution = {
  id: number;
  name: string;
  vendor: string | null;
  category: string | null;
  partnership_status: string | null;
  internal_expert: string | null;
  mastery: string | null;
  target_sectors: string | null;
  value_pitch: string | null;
  existing_clients: string | null;
  materials: string | null;
  priority: string | null;
  next_action: string | null;
  prospects_count: number;
};

export type Prospect = {
  id: number;
  solution_id: number;
  solution_name: string;
  company: string;
  sector: string | null;
  contact: string | null;
  angle: string | null;
  stage: StageCode | null;
  attack_week: string | null;
  next_action: string | null;
  owner: string | null;
  relationship_score: number | null;
  last_action_date: string | null;
  comments: string | null;
};

export type Pitch = {
  id: number;
  solution_id: number;
  segment: string;
  promise: string | null;
  stake: string | null;
  offer: string | null;
  hook: string | null;
  call_to_action: string | null;
  targets: string | null;
};

export type Activity = {
  id: number;
  at: string;
  user_name: string | null;
  via: "web" | "api" | "claude" | "import";
  entity: string;
  entity_id: number;
  action: "create" | "update" | "delete";
  label: string | null;
  changes: Record<string, [unknown, unknown]> | Record<string, unknown> | null;
};

export type Group = {
  key: string;
  label?: string;
  count: number;
  amount: number;
  weighted_amount: number;
  commission: number;
  profitability: number | null;
  p1_count: number;
};

export type Summary = {
  as_of: string;
  pipeline: {
    deals_count: number;
    total_amount: number;
    weighted_amount: number;
    commission: number;
    profitability: number | null;
    won_amount: number;
    offers_amount: number;
    open_amount: number;
    to_qualify_count: number;
    p1_count: number;
    open_actions_count: number;
    overdue_actions_count: number;
  };
  billing: {
    years: number[];
    invoiced: number;
    collected: number;
    outstanding: number;
    collection_rate: number | null;
    recurring_annual: number;
    expired_amount: number;
    expired_count: number;
    to_remind_count: number;
  };
  contacts: { total: number; linked: number; it_leaders: number; to_verify: number; meetings: number; researched: number };
  by_stage: Group[];
  by_kind: Group[];
  by_lead: Group[];
  accounts: {
    id: number;
    slug: string;
    name: string;
    health: string | null;
    invoiced_by_year: Record<string, number>;
    outstanding: number;
    open_offers: number;
  }[];
};

export type Agenda = { as_of: string; horizon: string; actions: Action[]; renewals: Renewal[]; deals: Deal[] };

export type Me = { user: { id: number; email: string; name: string; role: string }; via: string; today: string };
