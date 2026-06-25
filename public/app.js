// ============================================
// 小公司财务与客户管理系统 v3.0 - 服务端版
// 后端: Node.js + SQLite
// ============================================

const PAGE_NAMES = {
  'dashboard': '总览仪表盘',
  'online-income': '线上结算款', 'offline-income': '线下结算款', 'receivable': '应收账款',
  'goods-expense': '货物支出款', 'transport-expense': '交通支出款', 'promotion-expense': '平台推广支出',
  'rent-expense': '房屋租金支出', 'salary-expense': '人员工资支出',
  'client-manage': '客户管理', 'potential-client': '潜在客户管理', 'lost-client': '未成交客户管理',
  'fixed-task': '固定客户作业表',
  'operation-log': '操作日志', 'user-manage': '用户与权限'
};
const INVOICE_PAGES = ['online-income', 'offline-income', 'receivable', 'goods-expense', 'promotion-expense', 'rent-expense', 'fixed-task']; // fixed-task 不需要发票校验，但加进去无害

let editingId = null;
let currentModalPage = null;
let currentUser = null;
let incomeExpenseChart = null;
let expensePieChart = null;

// ==================== API 调用封装 ====================

const API = {
  getToken() {
    const token = localStorage.getItem('auth_token');
    const expiry = localStorage.getItem('auth_expiry');
    if (!token || !expiry) return null;
    if (Date.now() > Number(expiry)) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_expiry');
      localStorage.removeItem('auth_user');
      return null;
    }
    return token;
  },
  saveToken(token) {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_expiry', Date.now() + 23 * 60 * 60 * 1000); // 23h
  },
  async request(method, url, body) {
    const token = this.getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401 && url !== '/api/auth/login') {
        // 未授权，跳转到登录
        currentUser = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_expiry');
        localStorage.removeItem('auth_user');
        updateUserDisplay();
        showLoginModal();
        throw new Error(data.error || '登录已过期');
      }
      throw new Error(data.error || '请求失败');
    }
    return data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); }
};

// ==================== API 数据方法 ====================

async function getData(pageKey) {
  return API.get(`/api/data/${pageKey}`);
}

async function saveData(pageKey, record) {
  if (record.id && record.id.startsWith('new-')) delete record.id; // placeholder
  // 自动移出 id 字段避免重复
  const id = record.id;
  delete record.id;
  if (id && !id.startsWith('new-')) {
    await API.put(`/api/data/${pageKey}/${id}`, record);
  } else {
    await API.post(`/api/data/${pageKey}`, record);
  }
}

async function deleteItem(pageKey, id) {
  if (!confirm('确定要删除这条记录吗？')) return;
  await API.del(`/api/data/${pageKey}/${id}`);
  renderTable(pageKey);
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

// ==================== 工具函数 ====================

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatMoney(num) {
  return '¥' + Number(num).toFixed(2);
}

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function generateId() {
  return 'new-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getRoleName(role) {
  const map = { 'admin': '管理员', 'finance': '财务', 'sales': '客服及销售', 'viewer': '查看者' };
  return map[role] || role;
}

// ==================== 登录系统 ====================

function getCurrentUser() {
  if (currentUser) return currentUser;
  try {
    const saved = localStorage.getItem('auth_user');
    if (saved) { currentUser = JSON.parse(saved); return currentUser; }
  } catch (e) {}
  return null;
}

function setCurrentUser(user, token) {
  currentUser = user;
  localStorage.setItem('auth_user', JSON.stringify(user));
  if (token) API.saveToken(token);
  updateUserDisplay();
}

function updateUserDisplay() {
  const user = getCurrentUser();
  const nameEl = document.getElementById('sidebar-user-name');
  const roleEl = document.getElementById('sidebar-user-role');
  const displayEl = document.getElementById('current-user-display');

  if (user) {
    nameEl.textContent = user.displayName || user.username;
    roleEl.textContent = getRoleName(user.role);
    roleEl.className = 'user-role-badge role-' + user.role;
    displayEl.innerHTML = `当前用户：<strong>${user.displayName || user.username}</strong> (${getRoleName(user.role)})`;
  } else {
    nameEl.textContent = '未登录';
    roleEl.textContent = '-';
    roleEl.className = 'user-role-badge';
    displayEl.innerHTML = '当前用户：<strong>未登录</strong>';
  }
}

function showLoginModal() {
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('login-username').focus();
}

function closeLoginModal() {
  document.getElementById('login-overlay').style.display = 'none';
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');

  if (!username || !password) {
    errEl.textContent = '请输入用户名和密码';
    errEl.style.display = 'block';
    return;
  }

  try {
    const result = await API.post('/api/auth/login', { username, password });
    const user = result.user;
    setCurrentUser(user, result.token);
    closeLoginModal();
    const activePage = document.querySelector('.page.active');
    if (activePage) {
      const pageId = activePage.id.replace('page-', '');
      if (pageId === 'dashboard') renderDashboard();
      else renderTable(pageId);
    }
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_expiry');
  localStorage.removeItem('auth_user');
  updateUserDisplay();
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    const pageId = activePage.id.replace('page-', '');
    if (pageId === 'dashboard') renderDashboard();
    else renderTable(pageId);
  }
}

// ==================== 权限检查 ====================

function checkPermission(action, pageKey) {
  const user = getCurrentUser();
  if (!user) {
    showLoginModal();
    return false;
  }
  if (user.role === 'admin') return true;
  if (user.role === 'viewer') { alert('您只有查看权限'); return false; }
  if (user.role === 'finance') {
    if (pageKey && (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client' || pageKey === 'user-manage')) {
      alert('财务人员不能修改客户信息和用户管理');
      return false;
    }
    return true;
  }
  if (user.role === 'sales') {
    if (pageKey && (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client')) return true;
    if (action === 'edit' || action === 'add' || action === 'delete') {
      alert('销售人员只能管理客户信息');
      return false;
    }
    return true;
  }
  return true;
}

// ==================== 导航 ====================

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', function() {
    switchPage(this.dataset.page);
  });
});

function switchPage(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.getElementById('page-title').textContent = PAGE_NAMES[page] || page;
  if (page === 'dashboard') renderDashboard();
  else renderTable(page);
}

// ==================== 渲染表格 ====================

async function renderTable(pageKey) {
  let data;
  try {
    data = await getData(pageKey);
  } catch (e) {
    if (e.message === '登录已过期') return;
    return;
  }

  const tbody = document.getElementById(`${pageKey}-body`);
  if (!tbody) return;
  const user = getCurrentUser();

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="20" style="text-align:center;color:#999;padding:30px;">暂无数据，点击上方按钮新增</td></tr>';
    if (pageKey === 'receivable') updateReceivableSummary([]);
    return;
  }

  let html = '';
  data.forEach(item => {
    if (user && user.role === 'sales' && (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client')) {
      if (item.assignedTo && item.assignedTo !== user.username && item.assignedTo !== user.displayName) return;
    }

    html += '<tr>';
    switch (pageKey) {
      case 'online-income':
        html += `<td>${formatDate(item.date)}</td><td>${formatMoney(item.amount)}</td><td>${escapeHtml(item.platform || '-')}</td><td>${escapeHtml(item.invoiceNo || '-')}</td><td>${escapeHtml(item.operator || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'offline-income':
        html += `<td>${formatDate(item.date)}</td><td>${formatMoney(item.amount)}</td><td>${escapeHtml(item.source || '-')}</td><td>${escapeHtml(item.invoiceNo || '-')}</td><td>${escapeHtml(item.operator || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'receivable': {
        const total = Number(item.totalAmount) || 0;
        const received = Number(item.receivedAmount) || 0;
        const balance = total - received;
        let statusText = '未收款', statusClass = 'status-unpaid';
        if (received >= total && total > 0) { statusText = '已收清'; statusClass = 'status-paid'; }
        else if (received > 0) { statusText = '部分收款'; statusClass = 'status-partial'; }
        if (item.payDate && new Date(item.payDate) < new Date() && balance > 0) { statusText = '已逾期'; statusClass = 'status-overdue'; }
        html += `<td>${escapeHtml(item.clientName || '-')}</td>
          <td>${formatMoney(total)}</td><td>${formatMoney(received)}</td>
          <td style="color:${balance > 0 ? '#ff4d4f' : '#52c41a'};font-weight:600;">${formatMoney(balance)}</td>
          <td>${formatDate(item.billDate)}</td><td>${formatDate(item.payDate)}</td>
          <td>${escapeHtml(item.invoiceNo || '-')}</td>
          <td><span class="status-tag ${statusClass}">${statusText}</span></td>
          <td>${escapeHtml(item.operator || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      }
      case 'goods-expense':
        html += `<td>${formatDate(item.date)}</td><td>${formatMoney(item.amount)}</td><td>${escapeHtml(item.goodsName || '-')}</td><td>${escapeHtml(item.invoiceNo || '-')}</td><td>${escapeHtml(item.operator || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'transport-expense':
        html += `<td>${formatDate(item.date)}</td><td>${formatMoney(item.amount)}</td><td>${escapeHtml(item.method || '-')}</td><td>${escapeHtml(item.operator || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'promotion-expense':
        html += `<td>${formatDate(item.date)}</td><td>${formatMoney(item.amount)}</td><td>${escapeHtml(item.platform || '-')}</td><td>${escapeHtml(item.invoiceNo || '-')}</td><td>${escapeHtml(item.operator || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'rent-expense':
        html += `<td>${formatDate(item.date)}</td><td>${formatMoney(item.amount)}</td><td>${escapeHtml(item.address || '-')}</td><td>${escapeHtml(item.invoiceNo || '-')}</td><td>${escapeHtml(item.operator || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'salary-expense':
        html += `<td>${formatDate(item.date)}</td><td>${formatMoney(item.amount)}</td><td>${escapeHtml(item.employeeName || '-')}</td><td>${escapeHtml(item.operator || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'client-manage':
        html += `<td>${escapeHtml(item.name || '-')}</td><td>${escapeHtml(item.phone || '-')}</td><td>${escapeHtml(item.company || '-')}</td><td>${formatMoney(item.dealAmount || 0)}</td><td>${escapeHtml(item.status || '-')}</td><td>${escapeHtml(item.assignedTo || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'potential-client':
        html += `<td>${escapeHtml(item.name || '-')}</td><td>${escapeHtml(item.phone || '-')}</td><td>${escapeHtml(item.company || '-')}</td><td>${escapeHtml(item.intention || '-')}</td><td>${escapeHtml(item.status || '-')}</td><td>${escapeHtml(item.assignedTo || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'lost-client':
        html += `<td>${escapeHtml(item.name || '-')}</td><td>${escapeHtml(item.phone || '-')}</td><td>${escapeHtml(item.company || '-')}</td><td>${escapeHtml(item.reason || '-')}</td><td>${escapeHtml(item.assignedTo || '-')}</td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'fixed-task':
        html += `<td>${escapeHtml(item.clientName || '-')}</td><td>${formatDate(item.date)}</td><td>${escapeHtml(item.taskContent || '-')}</td><td>${escapeHtml(item.assignee || '-')}</td><td><span class="status-tag ${item.status === '已完成' ? 'status-paid' : 'status-unpaid'}">${escapeHtml(item.status || '未完成')}</span></td><td>${escapeHtml(item.remark || '-')}</td>`;
        break;
      case 'operation-log':
        html += `<td>${formatDateTime(item.time)}</td><td>${escapeHtml(item.operator)}</td><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.actionType)}</td><td>${escapeHtml(item.objectType)}</td><td>${escapeHtml(item.detail)}</td>`;
        break;
      case 'user-manage':
        html += `<td>${escapeHtml(item.username)}</td><td><span class="role-tag role-${item.role}">${getRoleName(item.role)}</span></td><td>${escapeHtml(item.displayName || '-')}</td><td>${escapeHtml(item.status || '启用')}</td>`;
        break;
    }

    if (pageKey !== 'operation-log') {
      let canEdit = true, canDelete = true;
      if (user) {
        if (user.role === 'viewer') { canEdit = false; canDelete = false; }
        if (user.role === 'finance' && (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client' || pageKey === 'user-manage')) { canEdit = false; canDelete = false; }
        if (user.role === 'sales' && !pageKey.startsWith('client') && pageKey !== 'potential-client' && pageKey !== 'lost-client') { canEdit = false; canDelete = false; }
        if (pageKey === 'user-manage' && user.role !== 'admin') { canEdit = false; canDelete = false; }
      }
      html += '<td>';
      if (pageKey === 'receivable' && canEdit) {
        html += `<button class="btn-pay" onclick="recordPayment('${item.id}')">💰 收款</button>`;
      }
      if (canEdit) {
        html += `<button class="btn-edit" onclick="editItem('${pageKey}','${item.id}')">✏️ 编辑</button>`;
      }
      if (canDelete) {
        html += `<button class="btn-delete" onclick="deleteItem('${pageKey}','${item.id}')">🗑️ 删除</button>`;
      }
      html += '</td>';
    }
    html += '</tr>';
  });
  tbody.innerHTML = html;

  if (pageKey === 'receivable') updateReceivableSummary(data);
}

function updateReceivableSummary(data) {
  let total = 0, paid = 0;
  data.forEach(item => {
    total += Number(item.totalAmount) || 0;
    paid += Number(item.receivedAmount) || 0;
  });
  document.getElementById('receivable-total').textContent = formatMoney(total);
  document.getElementById('receivable-paid').textContent = formatMoney(paid);
  document.getElementById('receivable-balance').textContent = formatMoney(total - paid);
}

// ==================== 弹窗 ====================

function showAddModal(pageKey) {
  if (!checkPermission('add', pageKey)) return;
  editingId = null;
  currentModalPage = pageKey;
  document.getElementById('modal-title').textContent = `新增${PAGE_NAMES[pageKey]}`;
  document.getElementById('modal-body').innerHTML = buildForm(pageKey, null);
  document.getElementById('modal-overlay').style.display = 'flex';
}

function editItem(pageKey, id) {
  if (!checkPermission('edit', pageKey)) return;

  getData(pageKey).then(data => {
    const item = data.find(d => d.id === id);
    if (!item) return;

    const user = getCurrentUser();
    if (user && user.role === 'sales' && (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client')) {
      if (item.assignedTo && item.assignedTo !== user.username && item.assignedTo !== user.displayName) {
        alert('您只能编辑自己负责的客户');
        return;
      }
    }

    editingId = id;
    currentModalPage = pageKey;
    document.getElementById('modal-title').textContent = `编辑${PAGE_NAMES[pageKey]}`;
    document.getElementById('modal-body').innerHTML = buildForm(pageKey, item);
    document.getElementById('modal-overlay').style.display = 'flex';
  }).catch(e => { if (e.message !== '登录已过期') alert('加载数据失败'); });
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  editingId = null;
  currentModalPage = null;
}

function buildForm(pageKey, item) {
  let fields = [];
  const v = (key, def) => item ? (item[key] !== undefined ? item[key] : def) : def;
  const user = getCurrentUser();

  switch (pageKey) {
    case 'online-income':
      fields = [
        { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
        { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
        { label: '来源平台', type: 'text', key: 'platform', value: v('platform', ''), placeholder: '如：淘宝、京东、抖音等', required: true },
        { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填' },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
      ];
      break;
    case 'offline-income':
      fields = [
        { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
        { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
        { label: '客户/来源', type: 'text', key: 'source', value: v('source', ''), placeholder: '客户名称或来源', required: true },
        { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填' },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
      ];
      break;
    case 'receivable':
      fields = [
        { label: '客户名称', type: 'text', key: 'clientName', value: v('clientName', ''), placeholder: '必填', required: true },
        { label: '应收金额', type: 'number', key: 'totalAmount', value: v('totalAmount', ''), placeholder: '应收总金额', required: true, min: 0 },
        { label: '已收金额', type: 'number', key: 'receivedAmount', value: v('receivedAmount', '0'), placeholder: '已收回款金额', min: 0 },
        { label: '账单日期', type: 'date', key: 'billDate', value: v('billDate', getToday()), required: true },
        { label: '付款日期', type: 'date', key: 'payDate', value: v('payDate', ''), placeholder: '选填，预计付款日' },
        { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填' },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
      ];
      break;
    case 'goods-expense':
      fields = [
        { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
        { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
        { label: '货物名称', type: 'text', key: 'goodsName', value: v('goodsName', ''), placeholder: '如：原材料、商品等', required: true },
        { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填' },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
      ];
      break;
    case 'transport-expense':
      fields = [
        { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
        { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
        { label: '交通方式', type: 'text', key: 'method', value: v('method', ''), placeholder: '如：打车、公交、货运等', required: true },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
      ];
      break;
    case 'promotion-expense':
      fields = [
        { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
        { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
        { label: '推广平台', type: 'text', key: 'platform', value: v('platform', ''), placeholder: '如：抖音、百度、微信等', required: true },
        { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填' },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
      ];
      break;
    case 'rent-expense':
      fields = [
        { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
        { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
        { label: '房屋地址', type: 'text', key: 'address', value: v('address', ''), placeholder: '房屋地址', required: true },
        { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填' },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
      ];
      break;
    case 'salary-expense':
      fields = [
        { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
        { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
        { label: '员工姓名', type: 'text', key: 'employeeName', value: v('employeeName', ''), placeholder: '员工姓名', required: true },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
      ];
      break;
    case 'client-manage':
      fields = [
        { label: '客户姓名', type: 'text', key: 'name', value: v('name', ''), placeholder: '必填', required: true },
        { label: '联系电话', type: 'text', key: 'phone', value: v('phone', ''), placeholder: '选填' },
        { label: '公司名称', type: 'text', key: 'company', value: v('company', ''), placeholder: '选填' },
        { label: '成交金额', type: 'number', key: 'dealAmount', value: v('dealAmount', ''), placeholder: '成交总金额', min: 0 },
        { label: '跟进状态', type: 'select', key: 'status', value: v('status', '合作中'), options: ['合作中', '已成交', '跟进中', '需回访'] },
        { label: '负责人', type: 'select', key: 'assignedTo', value: v('assignedTo', ''), options: getSalesUserOptions() },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '选填' }
      ];
      break;
    case 'potential-client':
      fields = [
        { label: '客户姓名', type: 'text', key: 'name', value: v('name', ''), placeholder: '必填', required: true },
        { label: '联系电话', type: 'text', key: 'phone', value: v('phone', ''), placeholder: '选填' },
        { label: '公司名称', type: 'text', key: 'company', value: v('company', ''), placeholder: '选填' },
        { label: '意向度', type: 'select', key: 'intention', value: v('intention', '一般'), options: ['高', '中', '一般', '低'] },
        { label: '跟进状态', type: 'select', key: 'status', value: v('status', '待跟进'), options: ['待跟进', '跟进中', '有意向', '已约谈'] },
        { label: '负责人', type: 'select', key: 'assignedTo', value: v('assignedTo', ''), options: getSalesUserOptions() },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '选填' }
      ];
      break;
    case 'lost-client':
      fields = [
        { label: '客户姓名', type: 'text', key: 'name', value: v('name', ''), placeholder: '必填', required: true },
        { label: '联系电话', type: 'text', key: 'phone', value: v('phone', ''), placeholder: '选填' },
        { label: '公司名称', type: 'text', key: 'company', value: v('company', ''), placeholder: '选填' },
        { label: '未成交原因', type: 'text', key: 'reason', value: v('reason', ''), placeholder: '如：价格原因、选择其他供应商等', required: true },
        { label: '负责人', type: 'select', key: 'assignedTo', value: v('assignedTo', ''), options: getSalesUserOptions() },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '选填' }
      ];
      break;
    case 'fixed-task':
      fields = [
        { label: '客户名称', type: 'text', key: 'clientName', value: v('clientName', ''), placeholder: '必填', required: true },
        { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
        { label: '作业内容', type: 'textarea', key: 'taskContent', value: v('taskContent', ''), placeholder: '请描述作业内容', required: true },
        { label: '负责人', type: 'text', key: 'assignee', value: v('assignee', ''), placeholder: '负责作业的人员姓名', required: true },
        { label: '状态', type: 'select', key: 'status', value: v('status', '已完成'), options: ['已完成', '未完成'] },
        { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
      ];
      break;
    case 'user-manage':
      fields = [
        { label: '用户名', type: 'text', key: 'username', value: v('username', ''), placeholder: '登录用', required: true },
        { label: '密码', type: 'password', key: 'password', value: '', placeholder: item ? '留空则不修改密码' : '必填', required: !item },
        { label: '角色', type: 'select', key: 'role', value: v('role', 'sales'), options: [
          { value: 'admin', label: '管理员' }, { value: 'finance', label: '财务' },
          { value: 'sales', label: '客服及销售' }, { value: 'viewer', label: '查看者' }
        ]},
        { label: '姓名', type: 'text', key: 'displayName', value: v('displayName', ''), placeholder: '显示名称' },
        { label: '状态', type: 'select', key: 'status', value: v('status', '启用'), options: ['启用', '禁用'] }
      ];
      break;
  }

  let html = '<div class="validation-error" id="validation-errors"></div>';
  fields.forEach(f => {
    html += '<div class="form-group">';
    html += `<label>${f.label}${f.required ? ' <span style="color:#ff4d4f;">*</span>' : ''}</label>`;
    if (f.type === 'select') {
      html += `<select id="form-${f.key}">`;
      f.options.forEach(opt => {
        const val = typeof opt === 'object' ? opt.value : opt;
        const label = typeof opt === 'object' ? opt.label : opt;
        html += `<option value="${val}" ${f.value === val ? 'selected' : ''}>${label}</option>`;
      });
      html += '</select>';
    } else if (f.type === 'textarea') {
      html += `<textarea id="form-${f.key}" placeholder="${f.placeholder || ''}">${f.value || ''}</textarea>`;
    } else {
      html += `<input type="${f.type}" id="form-${f.key}" value="${f.value || ''}" placeholder="${f.placeholder || ''}" ${f.type === 'number' ? 'step="0.01" min="' + (f.min !== undefined ? f.min : '') + '"' : ''} ${f.type === 'password' && f.value ? 'autocomplete="new-password"' : ''}>`;
    }
    html += '<div class="error-hint"></div></div>';
  });
  return html;
}

function getSalesUserOptions() {
  // 异步获取，默认返回空
  return [{ value: '', label: '-- 请选择 --' }];
}

// ==================== 保存数据 ====================

async function saveModalData() {
  const pageKey = currentModalPage;
  if (!pageKey) return;

  const form = document.getElementById('modal-body');
  const inputs = form.querySelectorAll('input, select, textarea');
  const data = {};

  inputs.forEach(input => {
    const key = input.id.replace('form-', '');
    data[key] = input.value;
  });

  // 基本验证
  if (pageKey === 'user-manage') {
    if (!data.username) { alert('请填写用户名'); return; }
  } else if (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client') {
    if (!data.name) { alert('请填写客户姓名'); return; }
  } else if (pageKey === 'receivable') {
    if (data.totalAmount === '' || isNaN(Number(data.totalAmount)) || Number(data.totalAmount) < 0) {
      alert('请填写有效的应收金额'); return;
    }
    data.totalAmount = Number(data.totalAmount);
    data.receivedAmount = Number(data.receivedAmount) || 0;
  } else {
    if (data.amount === '' || isNaN(data.amount) || Number(data.amount) < 0) {
      alert('请填写有效的金额'); return;
    }
    data.amount = Number(data.amount);
  }

  try {
    if (editingId) {
      data.id = editingId;
      await saveData(pageKey, data);
    } else {
      await saveData(pageKey, data);
    }
    closeModal();
    renderTable(pageKey);
    if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  } catch (e) {
    if (e.message !== '登录已过期') {
      alert('保存失败: ' + e.message);
    }
  }
}

// ==================== 应收账款收款 ====================

async function recordPayment(id) {
  if (!checkPermission('edit', 'receivable')) return;

  try {
    const list = await getData('receivable');
    const item = list.find(d => d.id === id);
    if (!item) return;

    const total = Number(item.totalAmount) || 0;
    const received = Number(item.receivedAmount) || 0;
    const balance = total - received;

    const payAmount = prompt(`客户：${item.clientName}\n应收：¥${total.toFixed(2)}\n已收：¥${received.toFixed(2)}\n未收：¥${balance.toFixed(2)}\n\n请输入本次收款金额：`, balance.toFixed(2));
    if (payAmount === null) return;

    const payNum = Number(payAmount);
    if (isNaN(payNum) || payNum <= 0) { alert('请输入有效的收款金额'); return; }
    if (payNum > balance) { alert(`收款金额不能超过未收余额 ¥${balance.toFixed(2)}`); return; }

    await API.post(`/api/data/receivable/${id}/pay`, { amount: payNum });
    renderTable('receivable');
    if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  } catch (e) {
    if (e.message !== '登录已过期') alert('收款失败: ' + e.message);
  }
}

// ==================== 仪表盘 ====================

async function renderDashboard() {
  try {
    const dash = await API.get('/api/dashboard');
    document.getElementById('total-income').textContent = formatMoney(dash.totalIncome);
    document.getElementById('total-expense').textContent = formatMoney(dash.totalExpense);
    document.getElementById('total-profit').textContent = formatMoney(dash.totalProfit);
    document.getElementById('total-clients').textContent = dash.totalClients;
    document.getElementById('total-receivable').textContent = formatMoney(dash.totalReceivableBalance);

    renderIncomeExpenseChart(dash.totalIncome, dash.totalExpense);
    renderExpensePieChart();
    renderRecentRecords();
  } catch (e) { if (e.message !== '登录已过期') console.error(e); }
}

function sumAmount(arr) {
  return arr.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function renderIncomeExpenseChart(income, expense) {
  const ctx = document.getElementById('incomeExpenseChart').getContext('2d');
  if (incomeExpenseChart) incomeExpenseChart.destroy();
  incomeExpenseChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['收入', '支出'],
      datasets: [{ label: '金额', data: [income, expense], backgroundColor: ['#1890ff', '#ff4d4f'], borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return '¥' + v.toFixed(0); } } } }
    }
  });
}

async function renderExpensePieChart() {
  const ctx = document.getElementById('expensePieChart').getContext('2d');
  if (expensePieChart) expensePieChart.destroy();

  const expenseKeys = ['goods-expense', 'transport-expense', 'promotion-expense', 'rent-expense', 'salary-expense'];
  const labels = ['货物支出', '交通支出', '推广支出', '租金支出', '工资支出'];
  const colors = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96'];
  const datas = [];

  for (const key of expenseKeys) {
    const rows = await getData(key);
    datas.push(sumAmount(rows));
  }

  const filteredLabels = [], filteredData = [], filteredColors = [];
  datas.forEach((v, i) => {
    if (v > 0) { filteredLabels.push(labels[i]); filteredData.push(v); filteredColors.push(colors[i]); }
  });

  if (filteredData.length === 0) {
    filteredLabels.push('暂无支出'); filteredData.push(1); filteredColors.push('#e8e8e8');
  }

  expensePieChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: filteredLabels, datasets: [{ data: filteredData, backgroundColor: filteredColors }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', font: { size: 12 } } } }
  });
}

async function renderRecentRecords() {
  const allRecords = [];
  const incomePages = ['online-income', 'offline-income'];
  const expensePages = ['goods-expense', 'transport-expense', 'promotion-expense', 'rent-expense', 'salary-expense'];

  for (const page of incomePages) {
    const rows = await getData(page);
    rows.forEach(item => {
      allRecords.push({ date: item.date, type: '收入', category: PAGE_NAMES[page], amount: Number(item.amount) || 0, operator: item.operator || '-', remark: item.remark || '' });
    });
  }

  for (const page of expensePages) {
    const rows = await getData(page);
    rows.forEach(item => {
      allRecords.push({ date: item.date, type: '支出', category: PAGE_NAMES[page], amount: Number(item.amount) || 0, operator: item.operator || '-', remark: item.remark || '' });
    });
  }

  allRecords.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const recent = allRecords.slice(0, 10);
  const tbody = document.getElementById('recent-records-body');

  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">暂无记录</td></tr>';
    return;
  }

  let html = '';
  recent.forEach(r => {
    const color = r.type === '收入' ? '#1890ff' : '#ff4d4f';
    html += `<tr><td>${formatDate(r.date)}</td><td style="color:${color};font-weight:600;">${r.type}</td><td>${r.category}</td><td style="color:${color};">${formatMoney(r.amount)}</td><td>${escapeHtml(r.operator)}</td><td>${escapeHtml(r.remark) || '-'}</td></tr>`;
  });
  tbody.innerHTML = html;
}

// ==================== 用户管理（admin） ====================

async function saveUser() {
  const form = document.getElementById('modal-body');
  const inputs = form.querySelectorAll('input, select, textarea');
  const data = {};
  inputs.forEach(input => { data[input.id.replace('form-', '')] = input.value; });

  if (!data.username) { alert('请填写用户名'); return; }

  try {
    if (editingId) {
      await API.put(`/api/users/${editingId}`, data);
    } else {
      if (!data.password) { alert('请填写密码'); return; }
      await API.post('/api/users', data);
    }
    closeModal();
    renderTable('user-manage');
  } catch (e) {
    if (e.message !== '登录已过期') alert('操作失败: ' + e.message);
  }
}

async function deleteUser(id) {
  if (!confirm('确定要删除此用户吗？')) return;
  try {
    await API.del(`/api/users/${id}`);
    renderTable('user-manage');
  } catch (e) {
    if (e.message !== '登录已过期') alert('删除失败: ' + e.message);
  }
}

// 覆盖默认的保存和删除函数
const origSaveModalData = saveModalData;
saveModalData = async function() {
  if (currentModalPage === 'user-manage') {
    await saveUser();
  } else {
    await origSaveModalData();
  }
};

const origDeleteItem = deleteItem;
deleteItem = async function(pageKey, id) {
  if (pageKey === 'user-manage') {
    await deleteUser(id);
  } else {
    await origDeleteItem(pageKey, id);
  }
};

// ==================== 操作日志 ====================

async function clearLogs() {
  if (!confirm('确定要清空所有操作日志吗？')) return;
  try {
    await API.del('/api/logs');
    renderTable('operation-log');
  } catch (e) { if (e.message !== '登录已过期') alert('操作失败'); }
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', function() {
  const savedUser = getCurrentUser();
  const token = localStorage.getItem('auth_token');
  if (savedUser && token) {
    updateUserDisplay();
    renderDashboard();
  } else {
    updateUserDisplay();
    showLoginModal();
    // 即使没登录也显示空仪表盘
    renderDashboard();
  }
});
