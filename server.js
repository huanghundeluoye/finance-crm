const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { generateToken, authMiddleware, requireRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3457;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== 工具函数 ====================

function now() {
  const d = new Date();
  const y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${M}-${D} ${h}:${m}:${s}`;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function getRoleName(role) {
  const map = { admin: '管理员', finance: '财务', sales: '客服及销售', viewer: '查看者' };
  return map[role] || role;
}

function getPageName(key) {
  const map = {
    'online-income': '线上结算款', 'offline-income': '线下结算款', 'receivable': '应收账款',
    'goods-expense': '货物支出款', 'transport-expense': '交通支出款', 'promotion-expense': '平台推广支出',
    'rent-expense': '房屋租金支出', 'salary-expense': '人员工资支出',
    'client-manage': '客户管理', 'potential-client': '潜在客户管理', 'lost-client': '未成交客户管理',
    'fixed-task': '固定客户作业表'
  };
  return map[key] || key;
}

// ==================== 认证 ====================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (user.status === '禁用') {
    return res.status(403).json({ error: '该账号已被禁用' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName }
  });
});

// ==================== 用户管理 ====================

app.get('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const users = await db.all('SELECT id, username, role, displayName, status, createdAt FROM users ORDER BY createdAt');
  res.json(users);
});

app.post('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const { username, password, role, displayName, status } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const id = makeId();
  const hash = bcrypt.hashSync(password, 10);
  await db.run(
    'INSERT INTO users (id, username, password, role, displayName, status) VALUES (?, ?, ?, ?, ?, ?)',
    [id, username, hash, role || 'sales', displayName || '', status || '启用']
  );

  await addLog(req, '新增', '用户与权限', `新增用户: ${username} (${role})`);
  res.json({ success: true });
});

app.put('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { username, password, role, displayName, status } = req.body;

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    await db.run(
      'UPDATE users SET username = ?, password = ?, role = ?, displayName = ?, status = ? WHERE id = ?',
      [username, hash, role, displayName, status, req.params.id]
    );
  } else {
    await db.run(
      'UPDATE users SET username = ?, role = ?, displayName = ?, status = ? WHERE id = ?',
      [username, role, displayName, status, req.params.id]
    );
  }

  await addLog(req, '编辑', '用户与权限', `修改用户: ${username}`);
  res.json({ success: true });
});

app.delete('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.id === 'admin') return res.status(400).json({ error: '不能删除默认管理员' });

  await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
  await addLog(req, '删除', '用户与权限', `删除用户: ${user.username}`);
  res.json({ success: true });
});

// ==================== 数据 CRUD ====================

const ALLOWED_PAGES = [
  'online-income', 'offline-income', 'receivable',
  'goods-expense', 'transport-expense', 'promotion-expense',
  'rent-expense', 'salary-expense',
  'client-manage', 'potential-client', 'lost-client',
  'fixed-task'
];

app.get('/api/data/:pageKey', authMiddleware, async (req, res) => {
  const { pageKey } = req.params;
  if (!ALLOWED_PAGES.includes(pageKey)) return res.status(400).json({ error: '无效的页面' });

  const rows = await db.all('SELECT * FROM records WHERE pageKey = ? ORDER BY createTime DESC', [pageKey]);
  const data = rows.map(row => ({ ...JSON.parse(row.data), id: row.id, operator: row.operator }));
  res.json(data);
});

app.post('/api/data/:pageKey', authMiddleware, async (req, res) => {
  const { pageKey } = req.params;
  if (!ALLOWED_PAGES.includes(pageKey)) return res.status(400).json({ error: '无效的页面' });

  const id = makeId();
  const data = { ...req.body, id };

  // 校验应收账款
  if (pageKey === 'receivable') {
    const totalAmt = Number(data.totalAmount) || 0;
    const recvAmt = Number(data.receivedAmount) || 0;
    if (totalAmt > 0 && recvAmt > totalAmt) {
      return res.status(400).json({ error: '已收金额不能大于应收金额' });
    }
  }

  const operator = req.user.displayName || req.user.username;
  await db.run(
    'INSERT INTO records (id, pageKey, data, operator) VALUES (?, ?, ?, ?)',
    [id, pageKey, JSON.stringify(data), operator]
  );

  await addLog(req, '新增', getPageName(pageKey), '新增记录');
  res.json({ success: true, id });
});

app.put('/api/data/:pageKey/:id', authMiddleware, async (req, res) => {
  const { pageKey, id } = req.params;
  if (!ALLOWED_PAGES.includes(pageKey)) return res.status(400).json({ error: '无效的页面' });

  const existing = await db.get('SELECT * FROM records WHERE id = ? AND pageKey = ?', [id, pageKey]);
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  // 校验应收账款
  if (pageKey === 'receivable') {
    const totalAmt = Number(req.body.totalAmount) || 0;
    const recvAmt = Number(req.body.receivedAmount) || 0;
    if (totalAmt > 0 && recvAmt > totalAmt) {
      return res.status(400).json({ error: '已收金额不能大于应收金额' });
    }
  }

  const newData = { ...JSON.parse(existing.data), ...req.body, id };
  await db.run(
    'UPDATE records SET data = ?, updateTime = ? WHERE id = ?',
    [JSON.stringify(newData), now(), id]
  );

  await addLog(req, '编辑', getPageName(pageKey), `编辑记录 #${id}`);
  res.json({ success: true });
});

app.delete('/api/data/:pageKey/:id', authMiddleware, async (req, res) => {
  const { pageKey, id } = req.params;
  if (!ALLOWED_PAGES.includes(pageKey)) return res.status(400).json({ error: '无效的页面' });

  const existing = await db.get('SELECT * FROM records WHERE id = ? AND pageKey = ?', [id, pageKey]);
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  await db.run('DELETE FROM records WHERE id = ?', [id]);
  await addLog(req, '删除', getPageName(pageKey), `删除记录 #${id}`);
  res.json({ success: true });
});

// 应收账款：收款
app.post('/api/data/receivable/:id/pay', authMiddleware, async (req, res) => {
  const existing = await db.get('SELECT * FROM records WHERE id = ? AND pageKey = ?', [req.params.id, 'receivable']);
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  const data = JSON.parse(existing.data);
  const total = Number(data.totalAmount) || 0;
  const received = Number(data.receivedAmount) || 0;
  const balance = total - received;
  const payAmount = Number(req.body.amount) || 0;

  if (payAmount <= 0) return res.status(400).json({ error: '请输入有效的收款金额' });
  if (payAmount > balance) return res.status(400).json({ error: `收款金额不能超过未收余额 ¥${balance.toFixed(2)}` });

  data.receivedAmount = received + payAmount;
  await db.run(
    'UPDATE records SET data = ?, updateTime = ? WHERE id = ?',
    [JSON.stringify(data), now(), req.params.id]
  );

  await addLog(req, '收款', '应收账款', `客户"${data.clientName}" 收款 ¥${payAmount.toFixed(2)}，累计已收 ¥${data.receivedAmount.toFixed(2)}`);
  res.json({ success: true });
});

// ==================== 仪表盘 ====================

app.get('/api/dashboard', authMiddleware, async (req, res) => {
  const incomeKeys = ['online-income', 'offline-income'];
  const expenseKeys = ['goods-expense', 'transport-expense', 'promotion-expense', 'rent-expense', 'salary-expense'];

  let totalIncome = 0, totalExpense = 0;

  for (const key of incomeKeys) {
    const rows = await db.all('SELECT data FROM records WHERE pageKey = ?', [key]);
    rows.forEach(r => { totalIncome += Number(JSON.parse(r.data).amount) || 0; });
  }

  for (const key of expenseKeys) {
    const rows = await db.all('SELECT data FROM records WHERE pageKey = ?', [key]);
    rows.forEach(r => { totalExpense += Number(JSON.parse(r.data).amount) || 0; });
  }

  const clientCount = (await db.get('SELECT COUNT(*) as cnt FROM records WHERE pageKey = ?', ['client-manage'])).cnt;
  const potentialCount = (await db.get('SELECT COUNT(*) as cnt FROM records WHERE pageKey = ?', ['potential-client'])).cnt;
  const lostCount = (await db.get('SELECT COUNT(*) as cnt FROM records WHERE pageKey = ?', ['lost-client'])).cnt;

  let totalReceivableBalance = 0;
  const recvRows = await db.all('SELECT data FROM records WHERE pageKey = ?', ['receivable']);
  recvRows.forEach(r => {
    const d = JSON.parse(r.data);
    totalReceivableBalance += (Number(d.totalAmount) || 0) - (Number(d.receivedAmount) || 0);
  });

  res.json({
    totalIncome,
    totalExpense,
    totalProfit: totalIncome - totalExpense,
    totalClients: clientCount + potentialCount + lostCount,
    totalReceivableBalance
  });
});

// ==================== 操作日志 ====================

app.get('/api/logs', authMiddleware, async (req, res) => {
  const logs = await db.all('SELECT * FROM logs ORDER BY time DESC LIMIT 500');
  res.json(logs);
});

app.delete('/api/logs', authMiddleware, requireRole('admin'), async (req, res) => {
  await db.run('DELETE FROM logs');
  res.json({ success: true });
});

// ==================== 工具函数 ====================

async function addLog(req, actionType, objectType, detail) {
  const id = makeId();
  const user = req.user;
  await db.run(
    'INSERT INTO logs (id, time, operator, role, actionType, objectType, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, now(), user ? (user.displayName || user.username) : '未登录', user ? getRoleName(user.role) : '-',
     actionType, objectType, detail]
  );
}

// ==================== 启动 ====================

app.listen(PORT, () => {
  console.log(`[Server] 财务与客户管理系统已启动: http://localhost:${PORT}`);
  console.log(`[Server] 默认管理员: admin / admin123`);
});
