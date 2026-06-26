const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ---------- convert ? placeholders to $1, $2, ... ----------
function convert(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ---------- datetime helper: local time string ----------
function nowLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${M}-${D} ${h}:${m}:${s}`;
}

// ---------- async API matching sqlite wrapper ----------

module.exports = {
  async get(sql, params) {
    const { rows } = await pool.query(convert(sql), params || []);
    return rows[0];
  },

  async all(sql, params) {
    const { rows } = await pool.query(convert(sql), params || []);
    return rows;
  },

  async run(sql, params) {
    const result = await pool.query(convert(sql), params || []);
    return { changes: result.rowCount, lastInsertRowid: null };
  },

  async exec(sql) {
    await pool.query(sql);
  }
};

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'sales',
      displayName TEXT DEFAULT '',
      status TEXT DEFAULT '启用',
      "createdAt" TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      "pageKey" TEXT NOT NULL,
      data TEXT NOT NULL,
      operator TEXT DEFAULT '',
      "createTime" TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
      "updateTime" TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      time TEXT NOT NULL,
      operator TEXT NOT NULL,
      role TEXT NOT NULL,
      "actionType" TEXT NOT NULL,
      "objectType" TEXT NOT NULL,
      detail TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_records_pageKey ON records("pageKey");
    CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time);
  `);

  // 创建默认管理员
  const { rows } = await pool.query('SELECT COUNT(*)::int as cnt FROM users');
  if (rows[0].cnt === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query(
      'INSERT INTO users (id, username, password, role, "displayName", status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['admin', 'admin', hash, 'admin', '管理员', '启用']
    );
    console.log('[DB-PG] 默认管理员已创建: admin / admin123');
  }
}

// 替换 SQLite-specific datetime('now','localtime') 为 JS 本地时间
module.exports.nowLocal = nowLocal;

init().catch(err => {
  console.error('[DB-PG] 初始化失败:', err);
  process.exit(1);
});
