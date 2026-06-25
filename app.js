// ============================================
// 小公司财务与客户管理系统 v2.0 - 核心逻辑
// 新增：操作日志、数据校验、角色权限、应收账款、Excel导出
// ============================================

// ---------- 数据存储结构 ----------
const STORE_KEYS = {
    'online-income': 'finance_online_income',
    'offline-income': 'finance_offline_income',
    'receivable': 'finance_receivable',
    'goods-expense': 'finance_goods_expense',
    'transport-expense': 'finance_transport_expense',
    'promotion-expense': 'finance_promotion_expense',
    'rent-expense': 'finance_rent_expense',
    'salary-expense': 'finance_salary_expense',
    'client-manage': 'client_manage',
    'potential-client': 'client_potential',
    'lost-client': 'client_lost',
    'operation-log': 'system_operation_log',
    'user-manage': 'system_users'
};

const PAGE_NAMES = {
    'dashboard': '总览仪表盘',
    'online-income': '线上结算款',
    'offline-income': '线下结算款',
    'receivable': '应收账款',
    'goods-expense': '货物支出款',
    'transport-expense': '交通支出款',
    'promotion-expense': '平台推广支出',
    'rent-expense': '房屋租金支出',
    'salary-expense': '人员工资支出',
    'client-manage': '客户管理',
    'potential-client': '潜在客户管理',
    'lost-client': '未成交客户管理',
    'operation-log': '操作日志',
    'user-manage': '用户与权限'
};

// 哪些页面需要发票号字段
const INVOICE_PAGES = ['online-income', 'offline-income', 'receivable', 'goods-expense', 'promotion-expense', 'rent-expense'];

// 当前状态
let editingId = null;
let currentModalPage = null;
let currentUser = null;

// ---------- 工具函数 ----------
function getData(pageKey) {
    const key = STORE_KEYS[pageKey];
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveData(pageKey, data) {
    const key = STORE_KEYS[pageKey];
    localStorage.setItem(key, JSON.stringify(data));
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
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
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---------- 用户与权限系统 ----------
function getUsers() {
    let users = getData('user-manage');
    // 默认管理员
    if (users.length === 0) {
        users = [
            { id: 'admin', username: 'admin', role: 'admin', displayName: '管理员', status: '启用' }
        ];
        saveData('user-manage', users);
    }
    return users;
}

function getCurrentUser() {
    if (currentUser) return currentUser;
    try {
        const saved = localStorage.getItem('current_user');
        if (saved) {
            currentUser = JSON.parse(saved);
            return currentUser;
        }
    } catch(e) {}
    return null;
}

function setCurrentUser(user) {
    currentUser = user;
    localStorage.setItem('current_user', JSON.stringify(user));
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

function getRoleName(role) {
    const map = { 'admin': '管理员', 'finance': '财务', 'sales': '客服及销售', 'viewer': '查看者' };
    return map[role] || role;
}


// 权限检查
function checkPermission(action, pageKey) {
    const user = getCurrentUser();
    if (!user) {
        alert('请先登录！\n\n提示：首次使用请先点击左侧"用户与权限"添加用户\n然后点击顶部"🔑 登录"按钮选择用户登录');
        showLoginModal();
        return false;
    }

    // 管理员有全部权限
    if (user.role === 'admin') return true;

    // 查看者只能查看
    if (user.role === 'viewer') {
        alert('您只有查看权限，无法执行此操作');
        return false;
    }

    // 财务：只能编辑账目，不能改客户
    if (user.role === 'finance') {
        if (pageKey && (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client' || pageKey === 'user-manage')) {
            alert('财务人员不能修改客户信息和用户管理');
            return false;
        }
        return true;
    }

    // 销售：只能管理客户，不能编辑财务账目
    if (user.role === 'sales') {
        if (pageKey && (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client')) {
            return true;
        }
        if (action === 'edit' || action === 'add' || action === 'delete') {
            alert('销售人员只能管理客户信息，不能编辑财务账目');
            return false;
        }
        return true;
    }

    return true;
}


// ---------- 操作日志 ----------
function addLog(actionType, objectType, detail) {
    const user = getCurrentUser();
    const log = {
        id: generateId(),
        time: new Date().toISOString(),
        operator: user ? (user.displayName || user.username) : '未登录',
        role: user ? getRoleName(user.role) : '-',
        actionType: actionType,
        objectType: objectType,
        detail: detail
    };
    let logs = getData('operation-log');
    logs.unshift(log);
    // 只保留最近500条
    if (logs.length > 500) logs = logs.slice(0, 500);
    saveData('operation-log', logs);
}

function clearLogs() {
    if (!confirm('确定要清空所有操作日志吗？')) return;
    saveData('operation-log', []);
    renderTable('operation-log');
}

// ---------- 数据校验 ----------
function validateData(pageKey, data, editingId) {
    const errors = [];

    // 1. 金额不能为负数
    if (data.amount !== undefined && data.amount !== '') {
        const amt = Number(data.amount);
        if (isNaN(amt) || amt < 0) {
            errors.push('金额不能为负数');
        }
    }

    // 2. 发票号不能重复
    if (data.invoiceNo && INVOICE_PAGES.includes(pageKey)) {
        const list = getData(pageKey);
        const dup = list.find(item => item.invoiceNo === data.invoiceNo && item.id !== editingId);
        if (dup) {
            errors.push(`发票号"${data.invoiceNo}"已存在，请勿重复录入`);
        }
    }

    // 3. 付款日期不能晚于账单日期（应收账款）
    if (pageKey === 'receivable') {
        if (data.billDate && data.payDate) {
            if (data.payDate < data.billDate) {
                errors.push('付款日期不能早于账单日期');
            }
        }
        // 已收金额不能大于应收金额
        const recvAmt = Number(data.receivedAmount) || 0;
        const totalAmt = Number(data.totalAmount) || 0;
        if (totalAmt > 0 && recvAmt > totalAmt) {
            errors.push('已收金额不能大于应收金额');
        }
    }

    return errors;
}

// ---------- 导航切换 ----------
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        const page = this.dataset.page;
        switchPage(page);
    });
});

function switchPage(page) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');

    document.getElementById('page-title').textContent = PAGE_NAMES[page] || page;

    if (page === 'dashboard') {
        renderDashboard();
    } else {
        renderTable(page);
    }
}

// ---------- 渲染表格 ----------
function renderTable(pageKey) {
    const data = getData(pageKey);
    const tbody = document.getElementById(`${pageKey}-body`);
    if (!tbody) return;

    const user = getCurrentUser();

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="20" style="text-align:center;color:#999;padding:30px;">暂无数据，点击上方按钮新增</td></tr>';
        return;
    }

    let html = '';
    data.forEach(item => {
        // 销售只能看自己的客户
        if (user && user.role === 'sales' && (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client')) {
            if (item.assignedTo && item.assignedTo !== user.username && item.assignedTo !== user.displayName) {
                return;
            }
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
                let statusText = '未收款';
                let statusClass = 'status-unpaid';
                if (received >= total && total > 0) {
                    statusText = '已收清';
                    statusClass = 'status-paid';
                } else if (received > 0) {
                    statusText = '部分收款';
                    statusClass = 'status-partial';
                }
                // 逾期判断
                if (item.payDate && new Date(item.payDate) < new Date() && balance > 0) {
                    statusText = '已逾期';
                    statusClass = 'status-overdue';
                }
                html += `<td>${escapeHtml(item.clientName || '-')}</td>
                    <td>${formatMoney(total)}</td>
                    <td>${formatMoney(received)}</td>
                    <td style="color:${balance > 0 ? '#ff4d4f' : '#52c41a'};font-weight:600;">${formatMoney(balance)}</td>
                    <td>${formatDate(item.billDate)}</td>
                    <td>${formatDate(item.payDate)}</td>
                    <td>${escapeHtml(item.invoiceNo || '-')}</td>
                    <td><span class="status-tag ${statusClass}">${statusText}</span></td>
                    <td>${escapeHtml(item.operator || '-')}</td>
                    <td>${escapeHtml(item.remark || '-')}</td>`;
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
            case 'operation-log':
                html += `<td>${formatDateTime(item.time)}</td><td>${escapeHtml(item.operator)}</td><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.actionType)}</td><td>${escapeHtml(item.objectType)}</td><td>${escapeHtml(item.detail)}</td>`;
                break;
            case 'user-manage':
                html += `<td>${escapeHtml(item.username)}</td><td><span class="role-tag role-${item.role}">${getRoleName(item.role)}</span></td><td>${escapeHtml(item.displayName || '-')}</td><td>${escapeHtml(item.status || '启用')}</td>`;
                break;
        }

        // 操作按钮
        if (pageKey !== 'operation-log') {
            let canEdit = true;
            let canDelete = true;

            // 权限检查
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

    // 应收账款汇总
    if (pageKey === 'receivable') {
        updateReceivableSummary(data);
    }
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

// ---------- 弹窗管理 ----------
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

    const data = getData(pageKey);
    const item = data.find(d => d.id === id);
    if (!item) return;

    // 销售只能编辑自己的客户
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
                { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填，用于校验重复' },
                { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
            ];
            break;
        case 'offline-income':
            fields = [
                { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
                { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
                { label: '客户/来源', type: 'text', key: 'source', value: v('source', ''), placeholder: '客户名称或来源', required: true },
                { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填，用于校验重复' },
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
                { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填，用于校验重复' },
                { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
            ];
            break;
        case 'goods-expense':
            fields = [
                { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
                { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
                { label: '货物名称', type: 'text', key: 'goodsName', value: v('goodsName', ''), placeholder: '如：原材料、商品等', required: true },
                { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填，用于校验重复' },
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
                { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填，用于校验重复' },
                { label: '备注', type: 'textarea', key: 'remark', value: v('remark', ''), placeholder: '可选' }
            ];
            break;
        case 'rent-expense':
            fields = [
                { label: '日期', type: 'date', key: 'date', value: v('date', getToday()), required: true },
                { label: '金额', type: 'number', key: 'amount', value: v('amount', ''), placeholder: '请输入金额', required: true, min: 0 },
                { label: '房屋地址', type: 'text', key: 'address', value: v('address', ''), placeholder: '房屋地址', required: true },
                { label: '发票号', type: 'text', key: 'invoiceNo', value: v('invoiceNo', ''), placeholder: '选填，用于校验重复' },
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
        case 'user-manage':
            fields = [
                { label: '用户名', type: 'text', key: 'username', value: v('username', ''), placeholder: '登录用', required: true },
                { label: '角色', type: 'select', key: 'role', value: v('role', 'sales'), options: [
                    { value: 'admin', label: '管理员' },
                    { value: 'finance', label: '财务' },
                    { value: 'sales', label: '客服及销售' },

                    { value: 'viewer', label: '查看者' }
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
            html += `<input type="${f.type}" id="form-${f.key}" value="${f.value || ''}" placeholder="${f.placeholder || ''}" ${f.type === 'number' ? 'step="0.01" min="' + (f.min !== undefined ? f.min : '') + '"' : ''}>`;
        }
        html += '<div class="error-hint"></div>';
        html += '</div>';
    });
    return html;
}

function getSalesUserOptions() {
    const users = getUsers();
    const options = [{ value: '', label: '-- 请选择 --' }];
    users.forEach(u => {
        if (u.status !== '禁用') {
            options.push({ value: u.displayName || u.username, label: (u.displayName || u.username) + ' (' + getRoleName(u.role) + ')' });
        }
    });
    return options;
}

// ---------- 保存数据 ----------
function saveModalData() {
    const pageKey = currentModalPage;
    if (!pageKey) return;

    const form = document.getElementById('modal-body');
    const inputs = form.querySelectorAll('input, select, textarea');
    const data = {};

    inputs.forEach(input => {
        const key = input.id.replace('form-', '');
        data[key] = input.value;
    });

    // 数据校验
    const errors = validateData(pageKey, data, editingId);
    if (errors.length > 0) {
        const errEl = document.getElementById('validation-errors');
        errEl.textContent = errors.join('\n');
        errEl.style.display = 'block';
        return;
    }

    // 基本验证
    if (pageKey === 'user-manage') {
        if (!data.username) { alert('请填写用户名'); return; }
    } else if (pageKey.startsWith('client') || pageKey === 'potential-client' || pageKey === 'lost-client') {
        if (!data.name) { alert('请填写客户姓名'); return; }
    } else if (pageKey === 'receivable') {
        // 应收账款使用 totalAmount 字段名
        if (data.totalAmount === '' || isNaN(Number(data.totalAmount)) || Number(data.totalAmount) < 0) {
            alert('请填写有效的应收金额');
            return;
        }
        data.totalAmount = Number(data.totalAmount);
        data.receivedAmount = Number(data.receivedAmount) || 0;
    } else {
        if (data.amount === '' || isNaN(data.amount) || Number(data.amount) < 0) {
            alert('请填写有效的金额');
            return;
        }
        data.amount = Number(data.amount);
    }

    const user = getCurrentUser();
    let list = getData(pageKey);

    if (editingId) {
        const idx = list.findIndex(d => d.id === editingId);
        if (idx !== -1) {
            const oldItem = { ...list[idx] };
            list[idx] = { ...list[idx], ...data };

            // 记录编辑日志
            const changes = [];
            for (let key in data) {
                if (String(oldItem[key]) !== String(data[key])) {
                    changes.push(`${key}: ${oldItem[key] || '空'} → ${data[key] || '空'}`);
                }
            }
            if (changes.length > 0) {
                addLog('编辑', PAGE_NAMES[pageKey], `修改记录 #${editingId}: ${changes.join('; ')}`);
            }
        }
    } else {
        data.id = generateId();
        data.createTime = new Date().toISOString();
        data.operator = user ? (user.displayName || user.username) : '未登录';
        list.unshift(data);

        addLog('新增', PAGE_NAMES[pageKey], `新增记录: ${JSON.stringify(data)}`);
    }

    saveData(pageKey, list);
    closeModal();
    renderTable(pageKey);

    if (document.getElementById('page-dashboard').classList.contains('active')) {
        renderDashboard();
    }
}

// ---------- 应收账款收款 ----------
function recordPayment(id) {
    if (!checkPermission('edit', 'receivable')) return;

    const list = getData('receivable');
    const item = list.find(d => d.id === id);
    if (!item) return;

    const total = Number(item.totalAmount) || 0;
    const received = Number(item.receivedAmount) || 0;
    const balance = total - received;

    const payAmount = prompt(`客户：${item.clientName}\n应收：¥${total.toFixed(2)}\n已收：¥${received.toFixed(2)}\n未收：¥${balance.toFixed(2)}\n\n请输入本次收款金额：`, balance.toFixed(2));
    if (payAmount === null) return;

    const payNum = Number(payAmount);
    if (isNaN(payNum) || payNum <= 0) {
        alert('请输入有效的收款金额');
        return;
    }

    const newReceived = received + payNum;
    if (newReceived > total) {
        alert(`收款金额不能超过未收余额 ¥${balance.toFixed(2)}`);
        return;
    }

    item.receivedAmount = newReceived;
    saveData('receivable', list);
    addLog('收款', '应收账款', `客户"${item.clientName}" 收款 ¥${payNum.toFixed(2)}，累计已收 ¥${newReceived.toFixed(2)}`);
    renderTable('receivable');
    if (document.getElementById('page-dashboard').classList.contains('active')) {
        renderDashboard();
    }
}

// ---------- 删除数据 ----------
function deleteItem(pageKey, id) {
    if (!checkPermission('delete', pageKey)) return;
    if (!confirm('确定要删除这条记录吗？')) return;

    let list = getData(pageKey);
    const item = list.find(d => d.id === id);
    list = list.filter(d => d.id !== id);
    saveData(pageKey, list);

    if (item) {
        addLog('删除', PAGE_NAMES[pageKey], `删除记录: ${JSON.stringify(item)}`);
    }

    renderTable(pageKey);
    if (document.getElementById('page-dashboard').classList.contains('active')) {
        renderDashboard();
    }
}

// ---------- 仪表盘 ----------
let incomeExpenseChart = null;
let expensePieChart = null;

function renderDashboard() {
    const onlineIncome = getData('online-income');
    const offlineIncome = getData('offline-income');
    const totalIncome = sumAmount(onlineIncome) + sumAmount(offlineIncome);

    const goodsExpense = getData('goods-expense');
    const transportExpense = getData('transport-expense');
    const promotionExpense = getData('promotion-expense');
    const rentExpense = getData('rent-expense');
    const salaryExpense = getData('salary-expense');
    const totalExpense = sumAmount(goodsExpense) + sumAmount(transportExpense) + sumAmount(promotionExpense) + sumAmount(rentExpense) + sumAmount(salaryExpense);

    const profit = totalIncome - totalExpense;

    const clients = getData('client-manage');
    const potentialClients = getData('potential-client');
    const lostClients = getData('lost-client');
    const totalClients = clients.length + potentialClients.length + lostClients.length;

    // 应收账款
    const receivables = getData('receivable');
    let totalReceivable = 0;
    receivables.forEach(item => {
        totalReceivable += (Number(item.totalAmount) || 0) - (Number(item.receivedAmount) || 0);
    });

    document.getElementById('total-income').textContent = formatMoney(totalIncome);
    document.getElementById('total-expense').textContent = formatMoney(totalExpense);
    document.getElementById('total-profit').textContent = formatMoney(profit);
    document.getElementById('total-clients').textContent = totalClients;
    document.getElementById('total-receivable').textContent = formatMoney(totalReceivable);

    renderIncomeExpenseChart(totalIncome, totalExpense);
    renderExpensePieChart(goodsExpense, transportExpense, promotionExpense, rentExpense, salaryExpense);
    renderRecentRecords();
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
            datasets: [{
                label: '金额',
                data: [income, expense],
                backgroundColor: ['#1890ff', '#ff4d4f'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: function(value) { return '¥' + value.toFixed(0); } }
                }
            }
        }
    });
}

function renderExpensePieChart(goods, transport, promotion, rent, salary) {
    const ctx = document.getElementById('expensePieChart').getContext('2d');
    if (expensePieChart) expensePieChart.destroy();

    const labels = ['货物支出', '交通支出', '推广支出', '租金支出', '工资支出'];
    const data = [sumAmount(goods), sumAmount(transport), sumAmount(promotion), sumAmount(rent), sumAmount(salary)];
    const colors = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96'];

    const filteredLabels = [];
    const filteredData = [];
    const filteredColors = [];
    data.forEach((v, i) => {
        if (v > 0) {
            filteredLabels.push(labels[i]);
            filteredData.push(v);
            filteredColors.push(colors[i]);
        }
    });

    if (filteredData.length === 0) {
        filteredLabels.push('暂无支出');
        filteredData.push(1);
        filteredColors.push('#e8e8e8');
    }

    expensePieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: filteredLabels,
            datasets: [{ data: filteredData, backgroundColor: filteredColors }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 12 } } }
            }
        }
    });
}

function renderRecentRecords() {
    const allRecords = [];
    const incomePages = ['online-income', 'offline-income'];
    const expensePages = ['goods-expense', 'transport-expense', 'promotion-expense', 'rent-expense', 'salary-expense'];

    incomePages.forEach(page => {
        getData(page).forEach(item => {
            allRecords.push({
                date: item.date,
                type: '收入',
                category: PAGE_NAMES[page],
                amount: Number(item.amount) || 0,
                operator: item.operator || '-',
                remark: item.remark || ''
            });
        });
    });

    expensePages.forEach(page => {
        getData(page).forEach(item => {
            allRecords.push({
                date: item.date,
                type: '支出',
                category: PAGE_NAMES[page],
                amount: Number(item.amount) || 0,
                operator: item.operator || '-',
                remark: item.remark || ''
            });
        });
    });

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
        html += `<tr>
            <td>${formatDate(r.date)}</td>
            <td style="color:${color};font-weight:600;">${r.type}</td>
            <td>${r.category}</td>
            <td style="color:${color};">${formatMoney(r.amount)}</td>
            <td>${escapeHtml(r.operator)}</td>
            <td>${escapeHtml(r.remark) || '-'}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// ---------- 登录系统 ----------
function showLoginModal() {
    const users = getUsers();
    const select = document.getElementById('login-user-select');
    select.innerHTML = '';
    users.forEach(u => {
        if (u.status !== '禁用') {
            const opt = document.createElement('option');
            opt.value = u.username;
            opt.textContent = (u.displayName || u.username) + ' (' + getRoleName(u.role) + ')';
            select.appendChild(opt);
        }
    });
    document.getElementById('login-overlay').style.display = 'flex';
}

function closeLoginModal() {
    document.getElementById('login-overlay').style.display = 'none';
}

function doLogin() {
    const username = document.getElementById('login-user-select').value;
    const users = getUsers();
    const user = users.find(u => u.username === username);
    if (user) {
        setCurrentUser(user);
        addLog('登录', '系统', `用户"${user.displayName || user.username}"登录系统`);
        closeLoginModal();
        // 刷新当前页面
        const activePage = document.querySelector('.page.active');
        if (activePage) {
            const pageId = activePage.id.replace('page-', '');
            if (pageId === 'dashboard') renderDashboard();
            else renderTable(pageId);
        }
    }
}

function logout() {
    if (currentUser) {
        addLog('退出', '系统', `用户"${currentUser.displayName || currentUser.username}"退出系统`);
    }
    currentUser = null;
    localStorage.removeItem('current_user');
    updateUserDisplay();
    // 刷新当前页面
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        const pageId = activePage.id.replace('page-', '');
        if (pageId === 'dashboard') renderDashboard();
        else renderTable(pageId);
    }
}

// ---------- 数据导入导出 ----------
function exportData() {
    const allData = {};
    Object.keys(STORE_KEYS).forEach(key => {
        allData[key] = getData(key);
    });

    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `财务客户管理系统_备份_${getToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('导出', '系统', '导出JSON备份数据');
}

function importData() {
    document.getElementById('importFile').click();
}

function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            Object.keys(STORE_KEYS).forEach(key => {
                if (data[key] && Array.isArray(data[key])) {
                    saveData(key, data[key]);
                }
            });
            alert('数据导入成功！');
            addLog('导入', '系统', '导入JSON备份数据');
            const activePage = document.querySelector('.page.active');
            if (activePage) {
                const pageId = activePage.id.replace('page-', '');
                if (pageId === 'dashboard') renderDashboard();
                else renderTable(pageId);
            }
        } catch (err) {
            alert('导入失败，请检查文件格式是否正确');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ---------- 导出Excel ----------
function exportExcel() {
    try {
        if (typeof XLSX === 'undefined') {
            alert('Excel导出库加载中，请稍后再试...');
            return;
        }

        const wb = XLSX.utils.book_new();
        const exportPages = ['online-income', 'offline-income', 'receivable', 'goods-expense', 'transport-expense', 'promotion-expense', 'rent-expense', 'salary-expense', 'client-manage', 'potential-client', 'lost-client'];

        exportPages.forEach(pageKey => {
            const data = getData(pageKey);
            if (data.length === 0) return;

            const rows = [];
            // 表头
            const headers = getExcelHeaders(pageKey);
            rows.push(headers);

            data.forEach(item => {
                const row = getExcelRow(pageKey, item);
                rows.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet(rows);
            // 设置列宽
            ws['!cols'] = getExcelColWidths(pageKey);
            XLSX.utils.book_append_sheet(wb, ws, PAGE_NAMES[pageKey].substring(0, 31));
        });

        XLSX.writeFile(wb, `财务客户管理系统_${getToday()}.xlsx`);
        addLog('导出', '系统', '导出Excel报表');
        alert('Excel导出成功！');
    } catch (err) {
        alert('Excel导出失败：' + err.message);
    }
}

function getExcelHeaders(pageKey) {
    const map = {
        'online-income': ['日期', '金额', '来源平台', '发票号', '操作人', '备注'],
        'offline-income': ['日期', '金额', '客户/来源', '发票号', '操作人', '备注'],
        'receivable': ['客户名称', '应收金额', '已收金额', '未收金额', '账单日期', '付款日期', '发票号', '状态', '操作人', '备注'],
        'goods-expense': ['日期', '金额', '货物名称', '发票号', '操作人', '备注'],
        'transport-expense': ['日期', '金额', '交通方式', '操作人', '备注'],
        'promotion-expense': ['日期', '金额', '推广平台', '发票号', '操作人', '备注'],
        'rent-expense': ['日期', '金额', '房屋地址', '发票号', '操作人', '备注'],
        'salary-expense': ['日期', '金额', '员工姓名', '操作人', '备注'],
        'client-manage': ['客户姓名', '电话', '公司', '成交金额', '跟进状态', '负责人', '备注'],
        'potential-client': ['客户姓名', '电话', '公司', '意向度', '跟进状态', '负责人', '备注'],
        'lost-client': ['客户姓名', '电话', '公司', '未成交原因', '负责人', '备注']
    };
    return map[pageKey] || [];
}

function getExcelRow(pageKey, item) {
    switch (pageKey) {
        case 'online-income': return [item.date, item.amount, item.platform, item.invoiceNo || '', item.operator || '', item.remark || ''];
        case 'offline-income': return [item.date, item.amount, item.source, item.invoiceNo || '', item.operator || '', item.remark || ''];
        case 'receivable': {
            const total = Number(item.totalAmount) || 0;
            const received = Number(item.receivedAmount) || 0;
            const balance = total - received;
            let status = '未收款';
            if (received >= total && total > 0) status = '已收清';
            else if (received > 0) status = '部分收款';
            if (item.payDate && new Date(item.payDate) < new Date() && balance > 0) status = '已逾期';
            return [item.clientName, total, received, balance, item.billDate, item.payDate || '', item.invoiceNo || '', status, item.operator || '', item.remark || ''];
        }
        case 'goods-expense': return [item.date, item.amount, item.goodsName, item.invoiceNo || '', item.operator || '', item.remark || ''];
        case 'transport-expense': return [item.date, item.amount, item.method, item.operator || '', item.remark || ''];
        case 'promotion-expense': return [item.date, item.amount, item.platform, item.invoiceNo || '', item.operator || '', item.remark || ''];
        case 'rent-expense': return [item.date, item.amount, item.address, item.invoiceNo || '', item.operator || '', item.remark || ''];
        case 'salary-expense': return [item.date, item.amount, item.employeeName, item.operator || '', item.remark || ''];
        case 'client-manage': return [item.name, item.phone || '', item.company || '', item.dealAmount || 0, item.status || '', item.assignedTo || '', item.remark || ''];
        case 'potential-client': return [item.name, item.phone || '', item.company || '', item.intention || '', item.status || '', item.assignedTo || '', item.remark || ''];
        case 'lost-client': return [item.name, item.phone || '', item.company || '', item.reason || '', item.assignedTo || '', item.remark || ''];
        default: return [];
    }
}

function getExcelColWidths(pageKey) {
    const map = {
        'online-income': [{wch:12},{wch:12},{wch:15},{wch:15},{wch:10},{wch:20}],
        'offline-income': [{wch:12},{wch:12},{wch:15},{wch:15},{wch:10},{wch:20}],
        'receivable': [{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:15},{wch:10},{wch:10},{wch:20}],
        'goods-expense': [{wch:12},{wch:12},{wch:15},{wch:15},{wch:10},{wch:20}],
        'transport-expense': [{wch:12},{wch:12},{wch:12},{wch:10},{wch:20}],
        'promotion-expense': [{wch:12},{wch:12},{wch:15},{wch:15},{wch:10},{wch:20}],
        'rent-expense': [{wch:12},{wch:12},{wch:20},{wch:15},{wch:10},{wch:20}],
        'salary-expense': [{wch:12},{wch:12},{wch:10},{wch:10},{wch:20}],
        'client-manage': [{wch:10},{wch:13},{wch:15},{wch:12},{wch:10},{wch:10},{wch:20}],
        'potential-client': [{wch:10},{wch:13},{wch:15},{wch:8},{wch:10},{wch:10},{wch:20}],
        'lost-client': [{wch:10},{wch:13},{wch:15},{wch:20},{wch:10},{wch:20}]
    };
    return map[pageKey] || [];
}

function clearAllData() {
    if (!confirm('⚠️ 确定要清空所有数据吗？此操作不可恢复！\n建议先导出备份数据。')) return;
    if (!confirm('再次确认：真的要清空所有数据吗？')) return;

    Object.keys(STORE_KEYS).forEach(key => {
        localStorage.removeItem(STORE_KEYS[key]);
    });

    const activePage = document.querySelector('.page.active');
    if (activePage) {
        const pageId = activePage.id.replace('page-', '');
        if (pageId === 'dashboard') renderDashboard();
        else renderTable(pageId);
    }
    alert('所有数据已清空');
}

// ---------- 初始化 ----------
document.addEventListener('DOMContentLoaded', function() {
    // 恢复登录状态
    const savedUser = getCurrentUser();
    if (savedUser) {
        updateUserDisplay();
    }
    renderDashboard();
});


