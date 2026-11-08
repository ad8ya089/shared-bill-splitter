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
