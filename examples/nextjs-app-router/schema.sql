-- Minimal schema used by the example (SQLite / libSQL / Turso).
-- Map it onto your own tables: the package only needs what the store reads and writes.

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY,
  title        TEXT    NOT NULL,
  price_cents  INTEGER NOT NULL,
  weight_grams INTEGER,
  length_mm    INTEGER,
  width_mm     INTEGER,
  height_mm    INTEGER
);

CREATE TABLE IF NOT EXISTS orders (
  id                        INTEGER PRIMARY KEY,
  number                    TEXT    NOT NULL UNIQUE,
  -- pending | paid | processing | shipped | completed | cancelled | refunded
  status                    TEXT    NOT NULL DEFAULT 'pending',
  email                     TEXT,
  ship_first_name           TEXT,
  ship_last_name            TEXT,
  ship_company              TEXT,
  ship_street1              TEXT,
  ship_street2              TEXT,
  ship_city                 TEXT,
  ship_zip                  TEXT,
  ship_state                TEXT,
  ship_country              TEXT,
  ship_phone                TEXT,
  subtotal_cents            INTEGER NOT NULL,
  -- Chosen at checkout: "flat", "pickup" or "packlink-<serviceId>".
  shipping_option_id        TEXT,
  packlink_service_id       INTEGER,
  packlink_dropoff_point_id TEXT,
  -- The lock against paying a label twice: one shipment per order, ever.
  packlink_reference        TEXT    UNIQUE,
  packlink_status           TEXT,
  packlink_label_url        TEXT,
  tracking_number           TEXT,
  tracking_url              TEXT,
  packlink_synced_at        TEXT,
  packlink_final_at         TEXT,
  created_at                TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_lines (
  order_id   INTEGER NOT NULL REFERENCES orders (id),
  product_id INTEGER REFERENCES products (id),
  title      TEXT    NOT NULL,
  quantity   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS job_locks (
  name         TEXT PRIMARY KEY,
  locked_until TEXT NOT NULL
);

-- What the sync scans on every run.
CREATE INDEX IF NOT EXISTS orders_packlink_open
  ON orders (packlink_synced_at)
  WHERE packlink_reference IS NOT NULL AND packlink_final_at IS NULL;
