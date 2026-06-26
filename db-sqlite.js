const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'finance.db'));
db.pragma('journal_mode = WAL');

init();

// ---------- async API (wrapping sync better-sqlite3) ----------

module.exports = {
  get(sql, params) {
    return db.prepare(sql).get(...(params || []));
  },
  all(sql, params) {
    return db.prepare(sql).all(...(params || []));
  },
  run(sql, params) {
    const info = db.prepare(sql).run(...(params || []));
    return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  },
  exec(sql) {
    db.exec(sql);
  }
};

// ---------- schema ----------

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'sales',
      displayName TEXT DEFAULT '',
      status TEXT DEFAULT '启用',
      createdAt TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      pageKey TEXT NOT NULL,
      data TEXT NOT NULL,
      operator TEXT DEFAULT '',
      createTime TEXT DEFAULT (datetime('now','localtime')),
      updateTime TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      time TEXT NOT NULL,
      operator TEXT NOT NULL,
      role TEXT NOT NULL,
      actionType TEXT NOT NULL,
      objectType TEXT NOT NULL,
      detail TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_records_pageKey ON records(pageKey);
    CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time);
  `);

  // 创建默认管理员（如果还没有用户）
  const adminCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
  if (adminCount.cnt === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO users (id, username, password, role, displayName, status)
      VALUES (?, ?, ?, ?, ?, ?)`).run('admin', 'admin', hash, 'admin', '管理员', '启用');
    console.log('[DB-SQLite] 默认管理员已创建: admin / admin123');
  }
}
