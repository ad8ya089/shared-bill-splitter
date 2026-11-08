CREATE TABLE homes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT ck_homes_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT uq_members_id UNIQUE (id),
  CONSTRAINT fk_members_home FOREIGN KEY (home_id) REFERENCES homes (id),
  CONSTRAINT ck_members_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE bills (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT uq_bills_id UNIQUE (id),
  CONSTRAINT fk_bills_home FOREIGN KEY (home_id) REFERENCES homes (id),
  CONSTRAINT ck_bills_total_positive CHECK (typeof(total_cents) = 'integer' AND total_cents > 0),
  CONSTRAINT ck_bills_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE TABLE shares (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  bill_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT,
  paid_idempotency_key TEXT,
  CONSTRAINT uq_shares_id UNIQUE (id),
  CONSTRAINT fk_shares_bill FOREIGN KEY (bill_id) REFERENCES bills (id),
  CONSTRAINT fk_shares_member FOREIGN KEY (member_id) REFERENCES members (id),
  CONSTRAINT uq_shares_bill_member UNIQUE (bill_id, member_id),
  CONSTRAINT ck_shares_amount_nonneg CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  CONSTRAINT ck_shares_paid_pair CHECK ((paid_at IS NULL) = (paid_idempotency_key IS NULL))
);
