-- Schema for The Bright Fabric Care laundry management app
-- This file is applied automatically on server start (idempotent).

CREATE TABLE IF NOT EXISTS items (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  wash_iron_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  iron_only_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  bill_number    TEXT UNIQUE NOT NULL,
  customer_name  TEXT,
  block          TEXT,
  room_no        TEXT,
  mobile         TEXT,
  delivery_date  DATE,
  service_type   TEXT NOT NULL DEFAULT 'wash_iron',   -- wash_iron | iron_only
  total_amount   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  order_status   TEXT NOT NULL DEFAULT 'pending',     -- pending | ready | delivered
  payment_status TEXT NOT NULL DEFAULT 'unpaid',      -- paid | unpaid
  source         TEXT NOT NULL DEFAULT 'shop',        -- shop | block_collection
  pickup_date    DATE,
  dropback_date  DATE,
  worker_note    TEXT,
  payment_method TEXT,                                 -- cash | upi (set when paid)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced         BOOLEAN NOT NULL DEFAULT TRUE
);

-- Migration: add payment_method to orders created before this column existed.
-- CREATE TABLE ... IF NOT EXISTS above won't alter an already-existing table,
-- so this runs on every boot and is a no-op once the column is present.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_name  TEXT NOT NULL,
  rate       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  quantity   INTEGER NOT NULL DEFAULT 0,
  line_total NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  id    SERIAL PRIMARY KEY,
  key   TEXT UNIQUE NOT NULL,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
