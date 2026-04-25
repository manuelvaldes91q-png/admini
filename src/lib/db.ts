let rawDb: any;
let isBun = typeof (globalThis as any).Bun !== 'undefined';

function getRawDb() {
  if (rawDb) return rawDb;

  if (isBun) {
    console.log('Running in Bun environment. Using bun:sqlite adapter.');
    // @ts-ignore
    const { Database } = require('bun:sqlite');
    rawDb = new Database('isp_manager.db', { create: true });
  } else {
    console.log('Running in Node environment. Using better-sqlite3.');
    const Database = require('better-sqlite3');
    rawDb = new Database('isp_manager.db');
  }
  return rawDb;
}

// Compatibility wrapper
const db = {
  prepare: (sql: string) => {
    const rdb = getRawDb();
    const stmt = isBun ? rdb.query(sql) : rdb.prepare(sql);
    return {
      get: (...args: any[]) => isBun ? stmt.get(...args) : stmt.get(...args),
      all: (...args: any[]) => isBun ? stmt.all(...args) : stmt.all(...args),
      run: (...args: any[]) => {
        if (isBun) {
          return stmt.run(...args);
        } else {
          return stmt.run(...args);
        }
      }
    };
  },
  exec: (sql: string) => isBun ? getRawDb().run(sql) : getRawDb().exec(sql)
};

export function initDB() {
  const rdb = getRawDb(); // Ensure DB is initialized
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
