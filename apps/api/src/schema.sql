-- Schéma du pipeline IAT. Les montants sont en FCFA (entiers), les dates au format AAAA-MM-JJ.
-- Les valeurs dérivées (montant pondéré, échéances de renouvellement, alertes, totaux) ne sont
-- pas stockées : l'API les calcule (src/domain.ts).

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Jetons personnels de l'API. « claude » : jeton du connecteur MCP, ses actions sont journalisées « via Claude ».
CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'claude' CHECK (kind IN ('claude', 'api')),
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  display_name TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('client', 'prospect', 'tender', 'partner')),
  sector TEXT,
  leadership_summary TEXT,
  contact_direction TEXT,
  contact_operational TEXT,
  contact_purchasing TEXT,
  iat_lead TEXT,
  executive_sponsor TEXT,
  health TEXT,
  satisfaction INTEGER CHECK (satisfaction BETWEEN 1 AND 5),
  last_contact TEXT,
  next_meeting TEXT,
  notes TEXT,
  has_fiche INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  project_label TEXT,
  title TEXT NOT NULL,
  solution TEXT,
  origin TEXT,
  lead TEXT,
  recurrence TEXT,
  stage TEXT NOT NULL,
  closing REAL CHECK (closing BETWEEN 0 AND 1),
  amount INTEGER,
  commission INTEGER,
  priority TEXT CHECK (priority IN ('P1', 'P2', 'P3')),
  next_step TEXT,
  due_date TEXT,
  comments TEXT,
  service TEXT,
  key_contact TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  product TEXT NOT NULL,
  vendor TEXT,
  recurrence TEXT,
  fiscal_year INTEGER,
  invoice_date TEXT,
  amount INTEGER,
  cost_of_sales INTEGER,
  commission INTEGER,
  collected INTEGER,
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS renewals (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  contract TEXT NOT NULL,
  last_invoice_date TEXT,
  last_amount INTEGER,
  history TEXT,
  due_date_override TEXT,
  status TEXT NOT NULL DEFAULT 'Non démarré',
  owner TEXT,
  last_reminder_date TEXT,
  next_action TEXT,
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  title TEXT NOT NULL,
  solution TEXT,
  priority TEXT CHECK (priority IN ('P1', 'P2', 'P3')),
  due_date TEXT,
  owner TEXT,
  action TEXT,
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  company TEXT,
  sector TEXT,
  name TEXT NOT NULL,
  role TEXT,
  profile TEXT,
  phone TEXT,
  email TEXT,
  pipeline_link TEXT,
  status TEXT,
  last_contact TEXT,
  comments TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('client_base', 'research', 'manual')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenders (
  id INTEGER PRIMARY KEY,
  organization TEXT NOT NULL,
  subject TEXT,
  reference TEXT,
  published_on TEXT,
  deadline TEXT,
  estimated_amount INTEGER,
  response_mode TEXT,
  partners TEXT,
  requirements TEXT,
  stage TEXT,
  owner TEXT,
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS solutions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  vendor TEXT,
  category TEXT,
  partnership_status TEXT,
  internal_expert TEXT,
  mastery TEXT,
  target_sectors TEXT,
  value_pitch TEXT,
  existing_clients TEXT,
  materials TEXT,
  priority TEXT CHECK (priority IN ('P1', 'P2', 'P3')),
  next_action TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY,
  solution_id INTEGER NOT NULL REFERENCES solutions(id),
  company TEXT NOT NULL,
  sector TEXT,
  contact TEXT,
  angle TEXT,
  stage TEXT,
  attack_week TEXT,
  next_action TEXT,
  owner TEXT,
  relationship_score INTEGER CHECK (relationship_score BETWEEN 0 AND 5),
  last_action_date TEXT,
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pitches (
  id INTEGER PRIMARY KEY,
  solution_id INTEGER NOT NULL REFERENCES solutions(id),
  segment TEXT NOT NULL,
  promise TEXT,
  stake TEXT,
  offer TEXT,
  hook TEXT,
  call_to_action TEXT,
  targets TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  related_to TEXT,
  account_id INTEGER REFERENCES accounts(id),
  owner TEXT,
  due_date TEXT,
  priority TEXT CHECK (priority IN ('P1', 'P2', 'P3')),
  status TEXT NOT NULL DEFAULT 'À faire',
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Journal des modifications : qui, quand, par quel canal (web, api, claude), quoi.
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  via TEXT NOT NULL CHECK (via IN ('web', 'api', 'claude', 'import')),
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  label TEXT,
  changes TEXT
);

CREATE INDEX IF NOT EXISTS deals_account ON deals(account_id);
CREATE INDEX IF NOT EXISTS invoices_account ON invoices(account_id);
CREATE INDEX IF NOT EXISTS renewals_account ON renewals(account_id);
CREATE INDEX IF NOT EXISTS contacts_account ON contacts(account_id);
CREATE INDEX IF NOT EXISTS prospects_solution ON prospects(solution_id);
CREATE INDEX IF NOT EXISTS activity_entity ON activity(entity, entity_id);
