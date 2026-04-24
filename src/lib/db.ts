import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('isp_manager.db');

export function initDB() {
  // Option to reset app via ENV
  if (process.env.RESET_APP === 'true') {
    console.log('RESET_APP=true detected. Clearing database...');
    db.exec(`
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS clients;
      DROP TABLE IF EXISTS plans;
    `);
  }

  // Config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mac TEXT,
      ip TEXT,
      plan_id TEXT,
      status TEXT DEFAULT 'active', -- active, inactive
      total_bytes TEXT DEFAULT '0',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      download_limit TEXT NOT NULL, -- e.g. 5M, 10M
      upload_limit TEXT NOT NULL,
      price REAL
    );

    -- Insert default admin settings if not exist
    INSERT OR IGNORE INTO settings (key, value) VALUES ('mt_host', '');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('mt_port', '8728');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('mt_user', '');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('mt_pass', '');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('mt_interface', 'SALIDA');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('tg_token', '');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('tg_chat_id', '');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_user', 'admin');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_pass', 'admin123');
  `);

  // Default plans
  const planCount = db.prepare('SELECT count(*) as count FROM plans').get() as { count: number };
  if (planCount.count === 0) {
    const insert = db.prepare('INSERT INTO plans (id, name, download_limit, upload_limit, price) VALUES (?, ?, ?, ?, ?)');
    insert.run('1', 'Plan 5MB', '5M', '1M', 20);
    insert.run('2', 'Plan 10MB', '10M', '2M', 35);
    insert.run('3', 'Plan 20MB', '20M', '5M', 60);
  }
}

export default db;
