import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export function openLifeDatabase(filename=':memory:') {
  if(filename !== ':memory:') mkdirSync(dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS life_accounts (
      id TEXT PRIMARY KEY,
      coins INTEGER NOT NULL DEFAULT 0 CHECK(coins >= 0),
      mood REAL NOT NULL, satiety REAL NOT NULL, boredom REAL NOT NULL, hydration REAL NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS life_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES life_accounts(id),
      item_id TEXT NOT NULL, uses_left INTEGER NOT NULL CHECK(uses_left>0),
      last_used_at INTEGER NOT NULL DEFAULT 0, acquired_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS life_inventory_owner ON life_inventory(account_id,item_id);
    CREATE TABLE IF NOT EXISTS life_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES life_accounts(id),
      item_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
      unit_price INTEGER NOT NULL CHECK(unit_price>=0),
      total INTEGER NOT NULL CHECK(total>=0), ordered_at INTEGER NOT NULL,
      actor_type TEXT NOT NULL CHECK(actor_type IN ('human','ai'))
    );
    CREATE INDEX IF NOT EXISTS life_orders_owner_time ON life_orders(account_id,ordered_at);
    CREATE TABLE IF NOT EXISTS life_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES life_accounts(id),
      delta INTEGER NOT NULL, after_balance INTEGER NOT NULL CHECK(after_balance>=0),
      source TEXT NOT NULL, source_ref TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(account_id,source,source_ref)
    );
    CREATE TABLE IF NOT EXISTS life_ops (
      account_id TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
      response TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(account_id,request_key)
    );
    CREATE TABLE IF NOT EXISTS life_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL,
      type TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS life_events_account ON life_events(account_id,id);
  `);
  return db;
}
