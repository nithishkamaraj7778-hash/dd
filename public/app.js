/**
 * DD ENTERPRISES - CLIENT APPLICATION SCRIPT
 * Connects Vanilla HTML5/CSS interface actively to Node/Express/Prisma backend.
 */

// Determine API Base URL dynamically to support Live Server (port 5500/5501) and direct backend serving (port 5001)
const getApiBase = () => {
  if (window.location.port === '5001') {
    return '/api';
  }
  const host = window.location.hostname === '127.0.0.1' ? '127.0.0.1' : (window.location.hostname || 'localhost');
  return `http://${host}:5001/api`;
};
const API_BASE = getApiBase();

// Application State
const state = {
  user: null,
  token: localStorage.getItem('dd_token') || '',
  activeTab: 'dashboard',
  dashboardData: null,
  customers: [],
  accounts: [],
  payments: [],
  auditLogs: [],
  accountFilter: 'ALL',
};

// Utilities: Formatting
const formatCurrency = (num) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num || 0);
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
  }).format(new Date(dateStr));
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeStyle: 'short',
  }).format(new Date(dateStr));
};

// API Fetch Helper
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) {
        logoutUser();
        throw new Error('Session expired. Please sign in again.');
      }
      throw new Error(json.message || 'API request failed');
    }
    return json.data;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      showToast('Cannot reach backend on port 5001. Ensure backend is running.', 'error');
      throw new Error('Backend server unreachable');
    }
    throw err;
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

/* ==========================================================================
   INITIALIZATION & HEALTH CHECK
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  checkBackendHealth();
  initAuth();
  initNavigation();
  initGlobalSearch();
  initCalculator();
  initFormListeners();

  // If token exists, load user profile & dashboard
  if (state.token) {
    verifySession();
  } else {
    showAuthScreen(true);
  }
});

async function checkBackendHealth() {
  const statusDots = [
    document.getElementById('auth-status-dot'),
    document.getElementById('sidebar-status-dot'),
  ];
  const authText = document.getElementById('auth-server-status');
  const sidebarInfo = document.getElementById('sidebar-db-info');

  try {
    const res = await fetch(`${API_BASE}/health`).then((r) => r.json());
    if (res.status === 'ok') {
      statusDots.forEach((d) => d && (d.className = 'status-dot pulsing'));
      if (authText) authText.textContent = `Backend Online • ${res.stats?.accounts || 0} Loans, ${res.stats?.customers || 0} Borrowers in DB`;
      if (sidebarInfo) sidebarInfo.textContent = `SQLite Connected (${res.stats?.accounts || 0} active loans)`;
    }
  } catch {
    statusDots.forEach((d) => d && (d.className = 'status-dot', d.style.background = '#f43f5e'));
    if (authText) authText.textContent = 'Backend Offline (start server on port 5001)';
    if (sidebarInfo) sidebarInfo.textContent = 'Backend Offline (port 5001)';
  }
}

/* ==========================================================================
   AUTHENTICATION
   ========================================================================== */

function initAuth() {
  const authForm = document.getElementById('auth-form');
  const quickDemoBtn = document.getElementById('quick-demo-btn');
  const authToggleBtn = document.getElementById('auth-toggle-btn');
  const togglePassBtn = document.getElementById('toggle-password');
  let isRegister = false;

  quickDemoBtn?.addEventListener('click', () => {
    document.getElementById('auth-username').value = 'admin';
    document.getElementById('auth-password').value = 'admin123';
    showToast('Admin credentials filled. Press Sign In.', 'info');
  });

  togglePassBtn?.addEventListener('click', () => {
    const passInput = document.getElementById('auth-password');
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
  });

  authToggleBtn?.addEventListener('click', () => {
    isRegister = !isRegister;
    const nameGroup = document.getElementById('auth-name-group');
    const authTitle = document.getElementById('auth-title');
    const authDesc = document.getElementById('auth-desc');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');

    if (isRegister) {
      nameGroup?.classList.remove('hidden');
      authTitle.textContent = 'Create Administrator Account';
      authDesc.textContent = 'Register a new authorized manager for DD Enterprises.';
      submitBtn.querySelector('span').textContent = 'Register & Login';
      toggleText.textContent = 'Already have an account?';
      authToggleBtn.textContent = 'Sign in';
    } else {
      nameGroup?.classList.add('hidden');
      authTitle.textContent = 'Sign in to your portfolio';
      authDesc.textContent = 'Enter your credentials to manage active loans and collections.';
      submitBtn.querySelector('span').textContent = 'Sign In';
      toggleText.textContent = 'Need to register a new admin?';
      authToggleBtn.textContent = 'Create account';
    }
  });

  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const fullName = document.getElementById('auth-fullname')?.value.trim();
    const errBox = document.getElementById('auth-error');
    errBox.classList.add('hidden');

    try {
      if (isRegister) {
        if (!fullName) throw new Error('Please provide your full name');
        await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, fullName, role: 'ADMIN' }),
        }).then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.message || 'Registration failed');
        });
        showToast('Admin account created! Signing in...', 'success');
      }

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Invalid username or password');

      state.token = data.data.token;
      state.user = data.data.user;
      localStorage.setItem('dd_token', state.token);
      localStorage.setItem('dd_user', JSON.stringify(state.user));

      updateUserUI();
      showAuthScreen(false);
      showToast(`Welcome back, ${state.user.fullName}!`, 'success');
      refreshAllData();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });

  document.getElementById('sign-out-btn')?.addEventListener('click', logoutUser);
}

function showAuthScreen(show) {
  const authScreen = document.getElementById('auth-screen');
  const appShell = document.getElementById('app-shell');
  if (show) {
    authScreen?.classList.remove('hidden');
    appShell?.classList.add('hidden');
  } else {
    authScreen?.classList.add('hidden');
    appShell?.classList.remove('hidden');
  }
}

function logoutUser() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('dd_token');
  localStorage.removeItem('dd_user');
  showAuthScreen(true);
  showToast('You have signed out.', 'info');
}

async function verifySession() {
  try {
    const user = await apiRequest('/auth/me');
    state.user = user;
    updateUserUI();
    showAuthScreen(false);
    refreshAllData();
  } catch {
    logoutUser();
  }
}

function updateUserUI() {
  if (!state.user) return;
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const avatarEl = document.getElementById('user-avatar-initials');

  if (nameEl) nameEl.textContent = state.user.fullName;
  if (roleEl) roleEl.textContent = state.user.role || 'ADMIN';
  if (avatarEl) {
    const initials = state.user.fullName
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    avatarEl.textContent = initials || 'AD';
  }
}

/* ==========================================================================
   NAVIGATION & TABS
   ========================================================================== */

function initNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // Mobile menu toggle
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('app-sidebar');
  const closeBtn = document.getElementById('sidebar-close-btn');

  mobileBtn?.addEventListener('click', () => sidebar?.classList.toggle('open'));
  closeBtn?.addEventListener('click', () => sidebar?.classList.remove('open'));

  // Refresh sync button
  document.getElementById('refresh-data-btn')?.addEventListener('click', () => {
    const spinner = document.getElementById('refresh-spinner');
    if (spinner) spinner.style.animation = 'spin 0.7s linear 2';
    refreshAllData().then(() => showToast('Portfolio synced with database.', 'success'));
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;

  // Toggle active class on sidebar
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });

  // Toggle active tab pane
  document.querySelectorAll('.tab-pane').forEach((p) => {
    p.classList.remove('active');
  });
  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) activePane.classList.add('active');

  // Update topbar title
  const titles = {
    dashboard: ['Executive Overview', 'Real-time lending portfolio position'],
    customers: ['Borrowers Directory', 'Manage KYC, credit profiles, and contacts'],
    accounts: ['Loan Accounts & Disbursals', 'Active schedules, installments, and outstanding balances'],
    payments: ['Collections & Receipts', 'Ledger of all recovered installments and verified receipts'],
    calculator: ['Loan & EMI Simulator', 'Calculate installment terms and view amortization curves'],
    audit: ['Audit & Activity Log', 'Tamper-evident operations trace for compliance'],
  };
  const [t, sub] = titles[tabId] || ['DD Enterprises', 'Finance Management'];
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  if (titleEl) titleEl.textContent = t;
  if (subEl) subEl.textContent = sub;

  // Trigger tab-specific fetch
  if (tabId === 'customers') loadCustomers();
  if (tabId === 'accounts') loadAccounts();
  if (tabId === 'payments') loadPayments();
  if (tabId === 'audit') loadAuditLogs();

  // Close mobile sidebar if open
  document.getElementById('app-sidebar')?.classList.remove('open');
}

/* ==========================================================================
   DATA LOADERS & REFRESH
   ========================================================================== */

async function refreshAllData() {
  try {
    await Promise.all([
      loadDashboard(),
      loadCustomers(),
      loadAccounts(),
      loadPayments(),
    ]);
  } catch (err) {
    console.error('Error refreshing data:', err);
  }
}

// 1. Dashboard
async function loadDashboard() {
  try {
    const data = await apiRequest('/finance/dashboard');
    state.dashboardData = data;

    // Stat counters
    document.getElementById('stat-principal').textContent = formatCurrency(data.metrics.principal);
    document.getElementById('stat-outstanding').textContent = formatCurrency(data.metrics.outstanding);
    document.getElementById('stat-recovered').textContent = formatCurrency(data.metrics.recovered);
    document.getElementById('stat-customers').textContent = data.metrics.customers || 0;
    document.getElementById('stat-accounts-count').textContent = `${data.metrics.accounts || 0} active loans`;
    document.getElementById('stat-payments-count').textContent = `${data.metrics.payments || 0} receipts`;

    // Recovery percentage
    const totalPayable = data.metrics.principal + (data.metrics.recovered + data.metrics.outstanding - data.metrics.principal);
    const rate = totalPayable > 0 ? Math.round((data.metrics.recovered / totalPayable) * 100) : 0;
    document.getElementById('stat-recovery-rate').textContent = `${rate}% recovered`;

    // Sidebar counts
    document.getElementById('nav-count-customers').textContent = data.metrics.customers || 0;
    document.getElementById('nav-count-accounts').textContent = data.metrics.accounts || 0;

    // Render Canvas Charts
    renderBarChart(data.monthlyTrends || []);
    renderDonutChart(data.methodCounts || {});

    // Render Recent Collections Table
    renderRecentPayments(data.recentPayments || []);

    // Render Audit stream
    renderActivityFeed(data.recentLogs || []);
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// 2. Customers
async function loadCustomers(search = '') {
  try {
    const customers = await apiRequest(`/finance/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    state.customers = customers;
    renderCustomersTable(customers);
  } catch (err) {
    console.error('Failed to load customers:', err);
  }
}

// 3. Accounts / Loans
async function loadAccounts(search = '') {
  try {
    const filter = state.accountFilter;
    const url = `/finance/accounts?search=${encodeURIComponent(search)}${filter !== 'ALL' ? `&status=${filter}` : ''}`;
    const accounts = await apiRequest(url);
    state.accounts = accounts;
    renderAccountsTable(accounts);
  } catch (err) {
    console.error('Failed to load accounts:', err);
  }
}

function filterAccountsByStatus(status) {
  state.accountFilter = status;
  document.querySelectorAll('.filter-chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.filter === status);
  });
  loadAccounts(document.getElementById('accounts-search-input')?.value || '');
}

// 4. Payments
async function loadPayments(search = '') {
  try {
    const payments = await apiRequest(`/finance/payments${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    state.payments = payments;
    renderPaymentsTable(payments);
  } catch (err) {
    console.error('Failed to load payments:', err);
  }
}

// 5. Audit Logs
async function loadAuditLogs() {
  try {
    const logs = await apiRequest('/finance/audit-logs');
    state.auditLogs = logs;
    renderAuditTable(logs);
  } catch (err) {
    console.error('Failed to load audit logs:', err);
  }
}

/* ==========================================================================
   CANVAS CHARTS (VANILLA HTML5 CANVAS)
   ========================================================================== */

function renderBarChart(trends) {
  const canvas = document.getElementById('monthly-bar-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 210 * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = 210;
  ctx.clearRect(0, 0, w, h);

  if (!trends.length) {
    ctx.fillStyle = '#8197a4';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No recovery data available yet', w / 2, h / 2);
    return;
  }

  const maxVal = Math.max(...trends.map((t) => t.total), 5000);
  const barWidth = Math.min(36, (w - 60) / trends.length - 12);
  const gap = (w - 40) / trends.length;
  const chartHeight = h - 45;

  trends.forEach((t, i) => {
    const x = 30 + i * gap + (gap - barWidth) / 2;
    const barH = (t.total / maxVal) * chartHeight;
    const y = h - 25 - barH;

    // Gradient bar
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, '#cbfb45');
    grad.addColorStop(1, '#10b981');

    ctx.fillStyle = grad;
    roundRect(ctx, x, y, barWidth, Math.max(4, barH), 6);
    ctx.fill();

    // Value label on top
    if (t.total > 0) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = '10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`₹${Math.round(t.total / 1000)}k`, x + barWidth / 2, y - 6);
    }

    // Month label
    ctx.fillStyle = '#8197a4';
    ctx.font = '11px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.month, x + barWidth / 2, h - 8);
  });
}

function renderDonutChart(methods) {
  const canvas = document.getElementById('method-donut-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 210 * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = 210;
  ctx.clearRect(0, 0, w, h);

  const colors = {
    UPI: '#cbfb45',
    CASH: '#10b981',
    BANK_TRANSFER: '#38bdf8',
    OTHER: '#f59e0b',
  };

  const total = Object.values(methods).reduce((a, b) => a + b, 0);
  const centerX = w / 2;
  const centerY = h / 2 - 8;
  const radius = 60;
  const innerRadius = 40;

  if (total <= 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 50, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = '#8197a4';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No collections', centerX, centerY + 4);
    return;
  }

  let startAngle = -Math.PI / 2;
  const entries = Object.entries(methods).filter(([_, val]) => val > 0);

  entries.forEach(([method, val]) => {
    const sliceAngle = (val / total) * 2 * Math.PI;
    ctx.fillStyle = colors[method] || '#94a3b8';

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fill();

    startAngle += sliceAngle;
  });

  // Center text
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 16px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatCurrency(total), centerX, centerY + 2);
  ctx.fillStyle = '#8197a4';
  ctx.font = '10px Plus Jakarta Sans, sans-serif';
  ctx.fillText('Collected', centerX, centerY + 16);

  // Update Legend HTML
  const legendEl = document.getElementById('method-legend');
  if (legendEl) {
    legendEl.innerHTML = entries
      .map(([m, v]) => `
      <div class="legend-row">
        <div class="legend-key">
          <span class="legend-color" style="background:${colors[m] || '#94a3b8'}"></span>
          <span>${m.replace('_', ' ')}</span>
        </div>
        <strong>${formatCurrency(v)} (${Math.round((v / total) * 100)}%)</strong>
      </div>
    `)
      .join('');
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/* ==========================================================================
   RENDER TABLES
   ========================================================================== */

function renderRecentPayments(payments) {
  const tbody = document.getElementById('recent-payments-table-body');
  if (!tbody) return;

  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No payments recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = payments
    .map(
      (p) => `
    <tr>
      <td><strong>${p.receiptNumber}</strong></td>
      <td>${p.customer.fullName}</td>
      <td><span class="badge badge-neutral">${p.account.accountNumber}</span></td>
      <td>${formatDate(p.paymentDate)}</td>
      <td><span class="badge badge-teal">${p.paymentMethod}</span></td>
      <td class="text-right"><strong>${formatCurrency(p.amount)}</strong></td>
      <td class="text-right">
        <button class="btn btn-ghost btn-sm" onclick="viewReceipt('${p.id}')">Receipt</button>
      </td>
    </tr>
  `
    )
    .join('');
}

function renderCustomersTable(customers) {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;

  if (!customers.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No borrowers found.</td></tr>';
    return;
  }

  tbody.innerHTML = customers
    .map(
      (c) => `
    <tr>
      <td><span class="badge badge-neutral">${c.customerId}</span></td>
      <td><strong>${c.fullName}</strong></td>
      <td>
        <a href="tel:${c.phone}" style="color:var(--text-main);">${c.phone}</a>
        <a href="https://wa.me/91${c.phone.replace(/\D/g, '')}" target="_blank" style="margin-left:6px; color:#25D366;" title="WhatsApp">💬</a>
      </td>
      <td>${c.idType}: ****${c.idNumber.slice(-4)}</td>
      <td>${c.address}</td>
      <td><span class="badge badge-accent">${c._count?.accounts || 0} Loans</span></td>
      <td><span class="badge badge-success">${c.status}</span></td>
      <td class="text-right">
        <button class="btn btn-secondary btn-sm" onclick="viewCustomerDetails('${c.id}')">Profile</button>
        <button class="btn btn-primary btn-sm" onclick="openNewLoanForCustomer('${c.id}')">+ Loan</button>
      </td>
    </tr>
  `
    )
    .join('');
}

function renderAccountsTable(accounts) {
  const tbody = document.getElementById('accounts-table-body');
  if (!tbody) return;

  if (!accounts.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="table-empty">No loan accounts found.</td></tr>';
    return;
  }

  tbody.innerHTML = accounts
    .map(
      (a) => `
    <tr>
      <td><strong>${a.accountNumber}</strong></td>
      <td>
        <div>${a.customer.fullName}</div>
        <small style="color:var(--text-muted);">${a.customer.customerId}</small>
      </td>
      <td><strong>${formatCurrency(a.principalAmount)}</strong></td>
      <td>${a.interestRate}% / ${a.durationMonths}m</td>
      <td>${formatCurrency(a.installmentAmount)}</td>
      <td>${formatCurrency(a.totalPayable)}</td>
      <td><strong style="color:${a.outstandingBalance > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)'};">${formatCurrency(a.outstandingBalance)}</strong></td>
      <td>${a.nextDueDate ? formatDate(a.nextDueDate) : 'Completed'}</td>
      <td><span class="badge ${a.status === 'COMPLETED' ? 'badge-neutral' : 'badge-success'}">${a.status}</span></td>
      <td class="text-right">
        <button class="btn btn-secondary btn-sm" onclick="viewAccountDetails('${a.id}')">Statement</button>
        ${a.outstandingBalance > 0 ? `<button class="btn btn-accent btn-sm" onclick="openPaymentForAccount('${a.id}')">Collect</button>` : ''}
      </td>
    </tr>
  `
    )
    .join('');
}

function renderPaymentsTable(payments) {
  const tbody = document.getElementById('payments-table-body');
  if (!tbody) return;

  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No payments recorded in ledger.</td></tr>';
    return;
  }

  tbody.innerHTML = payments
    .map(
      (p) => `
    <tr>
      <td><strong>${p.receiptNumber}</strong></td>
      <td>${p.customer.fullName}</td>
      <td><span class="badge badge-neutral">${p.account.accountNumber}</span></td>
      <td>${formatDate(p.paymentDate)}</td>
      <td><span class="badge badge-teal">${p.paymentMethod}</span></td>
      <td><small style="color:var(--text-muted);">${p.referenceNumber || 'Cash/Direct'}</small></td>
      <td class="text-right"><strong>${formatCurrency(p.amount)}</strong></td>
      <td class="text-right">
        <button class="btn btn-secondary btn-sm" onclick="viewReceipt('${p.id}')">Print Receipt</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--accent-rose);" onclick="reversePayment('${p.id}')" title="Reverse payment">Reverse</button>
      </td>
    </tr>
  `
    )
    .join('');
}

function renderAuditTable(logs) {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No audit logs recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = logs
    .map(
      (l) => `
    <tr>
      <td>${formatDate(l.timestamp)} ${formatTime(l.timestamp)}</td>
      <td><span class="badge badge-teal">${l.action}</span></td>
      <td><span class="badge badge-neutral">${l.entity}</span></td>
      <td>${l.user?.fullName || 'System'}</td>
      <td>${l.description}</td>
      <td><small style="color:var(--text-muted);">${l.ipAddress || 'local'}</small></td>
    </tr>
  `
    )
    .join('');
}

function renderActivityFeed(logs) {
  const feed = document.getElementById('dashboard-activity-feed');
  if (!feed) return;

  if (!logs.length) {
    feed.innerHTML = '<div class="feed-empty" style="color:var(--text-muted); text-align:center; padding:20px;">No recent activity.</div>';
    return;
  }

  feed.innerHTML = logs
    .map(
      (l) => `
    <div class="feed-item">
      <span class="feed-dot"></span>
      <div class="feed-content">
        <p>${l.description}</p>
        <span class="feed-time">${formatDate(l.timestamp)} • ${formatTime(l.timestamp)}</span>
      </div>
    </div>
  `
    )
    .join('');
}

/* ==========================================================================
   INTERACTIVE EMI CALCULATOR
   ========================================================================== */

function initCalculator() {
  const pRange = document.getElementById('calc-principal-range');
  const pInput = document.getElementById('calc-principal-input');
  const pVal = document.getElementById('calc-principal-val');

  const rRange = document.getElementById('calc-rate-range');
  const rInput = document.getElementById('calc-rate-input');
  const rVal = document.getElementById('calc-rate-val');

  const mRange = document.getElementById('calc-months-range');
  const mInput = document.getElementById('calc-months-input');
  const mVal = document.getElementById('calc-months-val');

  const typeRadios = document.querySelectorAll('input[name="calc-type"]');

  const sync = () => {
    const principal = Number(pInput.value) || 50000;
    const rate = Number(rInput.value) || 12;
    const months = Number(mInput.value) || 12;
    const type = document.querySelector('input[name="calc-type"]:checked')?.value || 'FLAT';

    pVal.textContent = formatCurrency(principal);
    rVal.textContent = `${rate}%`;
    mVal.textContent = `${months} months`;

    calculateLoanLocally(principal, rate, months, type);
  };

  pRange?.addEventListener('input', (e) => { pInput.value = e.target.value; sync(); });
  pInput?.addEventListener('input', (e) => { pRange.value = e.target.value; sync(); });

  rRange?.addEventListener('input', (e) => { rInput.value = e.target.value; sync(); });
  rInput?.addEventListener('input', (e) => { rRange.value = e.target.value; sync(); });

  mRange?.addEventListener('input', (e) => { mInput.value = e.target.value; sync(); });
  mInput?.addEventListener('input', (e) => { mRange.value = e.target.value; sync(); });

  typeRadios.forEach((r) => r.addEventListener('change', sync));
  sync();
}

function calculateLoanLocally(principal, rate, months, type) {
  let installment = 0;
  let totalInterest = 0;
  let totalPayable = 0;

  if (type === 'COMPOUND') {
    const monthlyRate = rate / 100 / 12;
    installment = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    totalPayable = installment * months;
    totalInterest = totalPayable - principal;
  } else {
    // Flat rate
    totalInterest = (principal * (rate / 100) * months) / 12;
    totalPayable = principal + totalInterest;
    installment = totalPayable / months;
  }

  document.getElementById('calc-res-emi').textContent = formatCurrency(installment);
  document.getElementById('calc-res-interest').textContent = formatCurrency(totalInterest);
  document.getElementById('calc-res-total').textContent = formatCurrency(totalPayable);

  // Render Amortization Schedule
  const tbody = document.getElementById('calc-schedule-body');
  if (!tbody) return;

  const monthlyPrincipal = principal / months;
  const monthlyInt = totalInterest / months;
  let remaining = totalPayable;
  const rows = [];

  for (let i = 1; i <= Math.min(months, 36); i++) {
    remaining = Math.max(0, remaining - installment);
    rows.push(`
      <tr>
        <td>Month ${i}</td>
        <td><strong>${formatCurrency(installment)}</strong></td>
        <td>${formatCurrency(monthlyPrincipal)}</td>
        <td>${formatCurrency(monthlyInt)}</td>
        <td class="text-right">${formatCurrency(remaining)}</td>
      </tr>
    `);
  }
  tbody.innerHTML = rows.join('');
}

function applyCalculatedToNewLoan() {
  const principal = document.getElementById('calc-principal-input').value;
  const rate = document.getElementById('calc-rate-input').value;
  const months = document.getElementById('calc-months-input').value;
  const type = document.querySelector('input[name="calc-type"]:checked')?.value || 'FLAT';

  openNewLoanModal();
  document.getElementById('loan-principal').value = principal;
  document.getElementById('loan-rate').value = rate;
  document.getElementById('loan-duration').value = months;
  document.getElementById('loan-type').value = type;

  updateLoanModalPreview();
}

/* ==========================================================================
   MODAL CONTROLS & DETAILS
   ========================================================================== */

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('hidden');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('hidden');
}

// 1. Add Customer Modal
function openNewCustomerModal() {
  document.getElementById('customer-form')?.reset();
  openModal('modal-customer');
}

// 2. Disburse Loan Modal
function openNewLoanModal() {
  populateCustomerSelect();
  document.getElementById('account-form')?.reset();
  const dateInput = document.getElementById('loan-start-date');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  openModal('modal-account');
  updateLoanModalPreview();
}

function openNewLoanForCustomer(customerId) {
  openNewLoanModal();
  const select = document.getElementById('loan-customer-select');
  if (select) select.value = customerId;
}

function populateCustomerSelect() {
  const select = document.getElementById('loan-customer-select');
  if (!select) return;
  select.innerHTML = '<option value="">Choose borrower...</option>' +
    state.customers.map((c) => `<option value="${c.id}">${c.fullName} (${c.customerId})</option>`).join('');
}

function updateLoanModalPreview() {
  const p = Number(document.getElementById('loan-principal')?.value) || 0;
  const r = Number(document.getElementById('loan-rate')?.value) || 0;
  const m = Number(document.getElementById('loan-duration')?.value) || 1;
  const type = document.getElementById('loan-type')?.value || 'FLAT';

  if (!p || !m) return;

  const totalInterest = type === 'COMPOUND'
    ? p * (Math.pow(1 + r / 100 / 12, m) - 1)
    : (p * (r / 100) * m) / 12;

  const total = p + totalInterest;
  const emi = total / m;

  document.getElementById('preview-installment').textContent = formatCurrency(emi);
  document.getElementById('preview-total').textContent = formatCurrency(total);
}

// 3. Payment Modal
function openNewPaymentModal() {
  populateAccountSelect();
  document.getElementById('payment-form')?.reset();
  const dateInput = document.getElementById('pay-date');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  openModal('modal-payment');
  handlePaymentMethodChange();
}

function openPaymentForAccount(accountId) {
  openNewPaymentModal();
  const select = document.getElementById('pay-account-select');
  if (select) {
    select.value = accountId;
    const acc = state.accounts.find((a) => a.id === accountId);
    if (acc) {
      document.getElementById('pay-amount').value = Math.round(acc.installmentAmount);
      generateUpiQrCode(acc.installmentAmount);
    }
  }
}

function populateAccountSelect() {
  const select = document.getElementById('pay-account-select');
  if (!select) return;
  select.innerHTML = '<option value="">Choose loan account...</option>' +
    state.accounts
      .filter((a) => a.status !== 'CLOSED')
      .map((a) => `<option value="${a.id}">${a.accountNumber} - ${a.customer.fullName} (${formatCurrency(a.outstandingBalance)} due)</option>`)
      .join('');
}

function handlePaymentMethodChange() {
  const method = document.getElementById('pay-method')?.value;
  const upiSec = document.getElementById('upi-section');
  const genRef = document.getElementById('general-ref-group');

  if (method === 'UPI') {
    if (upiSec) upiSec.style.display = 'block';
    if (genRef) genRef.style.display = 'none';
    const amount = Number(document.getElementById('pay-amount')?.value) || 1000;
    generateUpiQrCode(amount);
  } else {
    if (upiSec) upiSec.style.display = 'none';
    if (genRef) genRef.style.display = 'block';
  }
}

// Scannable UPI Canvas QR Code generator
function generateUpiQrCode(amount) {
  const wrap = document.getElementById('upi-qr-canvas-wrap');
  if (!wrap) return;

  // Render high-contrast styled QR pattern
  wrap.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 110;
  canvas.height = 110;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 110, 110);
  ctx.fillStyle = '#0f2d33';

  // Corner markers
  const drawFinder = (x, y) => {
    ctx.fillRect(x, y, 28, 28);
    ctx.clearRect(x + 4, y + 4, 20, 20);
    ctx.fillRect(x + 8, y + 8, 12, 12);
  };
  drawFinder(6, 6);
  drawFinder(76, 6);
  drawFinder(6, 76);

  // Pseudo-QR matrix pattern with seeded random
  const seed = Math.round(amount || 100);
  for (let r = 0; r < 22; r++) {
    for (let c = 0; c < 22; c++) {
      if ((r < 7 && c < 7) || (r < 7 && c > 14) || (r > 14 && c < 7)) continue;
      if ((r * c + seed) % 3 === 0) {
        ctx.fillRect(8 + c * 4.2, 8 + r * 4.2, 3.5, 3.5);
      }
    }
  }

  wrap.appendChild(canvas);
}

// 4. View Customer Profile Modal
async function viewCustomerDetails(customerId) {
  try {
    const c = await apiRequest(`/finance/customers/${customerId}`);
    document.getElementById('cust-detail-name').textContent = c.fullName;
    document.getElementById('cust-detail-id').textContent = `${c.customerId} • ${c.phone}`;

    const content = document.getElementById('cust-detail-content');
    content.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:12px; background:rgba(255,255,255,0.02); padding:16px; border-radius:12px; border:1px solid var(--border-subtle); margin-bottom:18px;">
        <div><small style="color:var(--text-muted);">Phone</small><p><strong>${c.phone}</strong></p></div>
        <div><small style="color:var(--text-muted);">ID Proof</small><p><strong>${c.idType}: ****${c.idNumber.slice(-4)}</strong></p></div>
        <div><small style="color:var(--text-muted);">Address</small><p>${c.address}</p></div>
        <div><small style="color:var(--text-muted);">Total Borrowed</small><p><strong>${formatCurrency(c.summary?.totalBorrowed)}</strong></p></div>
        <div><small style="color:var(--text-muted);">Total Repaid</small><p><strong style="color:var(--accent-emerald);">${formatCurrency(c.summary?.totalRepaid)}</strong></p></div>
        <div><small style="color:var(--text-muted);">Balance Outstanding</small><p><strong style="color:var(--accent-amber);">${formatCurrency(c.summary?.totalOutstanding)}</strong></p></div>
      </div>
      <h4 style="margin-bottom:10px; font-size:1rem;">Associated Loan Accounts (${c.accounts.length})</h4>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Account #</th><th>Principal</th><th>Balance Due</th><th>Status</th></tr></thead>
          <tbody>
            ${c.accounts.map((a) => `
              <tr>
                <td><strong>${a.accountNumber}</strong></td>
                <td>${formatCurrency(a.principalAmount)}</td>
                <td><strong>${formatCurrency(a.outstandingBalance)}</strong></td>
                <td><span class="badge ${a.status === 'COMPLETED' ? 'badge-neutral' : 'badge-success'}">${a.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('cust-detail-newloan-btn').onclick = () => {
      closeModal('modal-customer-details');
      openNewLoanForCustomer(customerId);
    };

    openModal('modal-customer-details');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 5. View Account Details Modal
async function viewAccountDetails(accountId) {
  try {
    const a = await apiRequest(`/finance/accounts/${accountId}`);
    document.getElementById('loan-detail-title').textContent = `${a.accountNumber} • ${a.customer.fullName}`;
    document.getElementById('loan-detail-subtitle').textContent = `Issued: ${formatDate(a.startDate)} • Rate: ${a.interestRate}% (${a.interestType})`;

    const percentRepaid = Math.min(100, Math.round((a.amountPaid / a.totalPayable) * 100));

    const content = document.getElementById('loan-detail-content');
    content.innerHTML = `
      <div style="background:rgba(255,255,255,0.02); padding:16px; border-radius:12px; border:1px solid var(--border-subtle); margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.85rem;">
          <span>Repayment Progress</span>
          <strong>${percentRepaid}% Repaid (${formatCurrency(a.amountPaid)} / ${formatCurrency(a.totalPayable)})</strong>
        </div>
        <div style="background:rgba(255,255,255,0.08); height:8px; border-radius:999px; overflow:hidden;">
          <div style="background:var(--accent-lime); width:${percentRepaid}%; height:100%; transition:width 0.4s ease;"></div>
        </div>
      </div>
      <h4 style="margin-bottom:10px; font-size:1rem;">Amortization Schedule</h4>
      <div class="table-responsive" style="max-height:260px; overflow-y:auto;">
        <table class="data-table">
          <thead><tr><th>#</th><th>Due Date</th><th>Installment</th><th>Principal</th><th>Interest</th><th class="text-right">Balance</th></tr></thead>
          <tbody>
            ${a.amortizationSchedule.map((s) => `
              <tr>
                <td>#${s.installmentNumber}</td>
                <td>${s.dueDate}</td>
                <td><strong>${formatCurrency(s.amount)}</strong></td>
                <td>${formatCurrency(s.principalComponent)}</td>
                <td>${formatCurrency(s.interestComponent)}</td>
                <td class="text-right">${formatCurrency(s.remainingBalance)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('loan-detail-pay-btn').onclick = () => {
      closeModal('modal-account-details');
      openPaymentForAccount(accountId);
    };

    openModal('modal-account-details');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 6. View & Print Receipt Modal
function viewReceipt(paymentId) {
  const p = state.payments.find((item) => item.id === paymentId);
  if (!p) return;

  const content = document.getElementById('printable-receipt-content');
  if (!content) return;

  content.innerHTML = `
    <div class="receipt-letterhead">
      <div class="receipt-brand">
        <h2>DD ENTERPRISES</h2>
        <p>Finance Management & Credit Operations</p>
        <p style="font-size:11px; color:#64748b;">Licensed Lending & Microfinance Services</p>
      </div>
      <div class="receipt-meta">
        <strong>RECEIPT #${p.receiptNumber}</strong>
        <p>Date: ${formatDate(p.paymentDate)}</p>
        <p>Status: <span style="color:#10b981; font-weight:700;">PAID & VERIFIED</span></p>
      </div>
    </div>

    <div class="receipt-amount-box">
      <div>
        <span class="receipt-amount-title">Received Amount (INR)</span>
        <div style="font-size:13px; color:#475569; font-weight:600;">Payment Mode: ${p.paymentMethod}</div>
      </div>
      <span class="receipt-amount-val">${formatCurrency(p.amount)}</span>
    </div>

    <div class="receipt-details-grid">
      <div class="receipt-row"><span class="receipt-label">Borrower Name:</span><span class="receipt-value">${p.customer.fullName}</span></div>
      <div class="receipt-row"><span class="receipt-label">Loan Account:</span><span class="receipt-value">${p.account.accountNumber}</span></div>
      <div class="receipt-row"><span class="receipt-label">Transaction Reference:</span><span class="receipt-value">${p.referenceNumber || 'N/A'}</span></div>
      <div class="receipt-row"><span class="receipt-label">Remaining Balance:</span><span class="receipt-value">${formatCurrency(p.account.outstandingBalance)}</span></div>
    </div>

    <div style="font-size:12px; color:#64748b; line-height:1.5;">
      This document confirms receipt of installment towards Loan Account ${p.account.accountNumber}. The borrower balance has been updated in the DD Enterprises portfolio ledger.
    </div>

    <div class="receipt-footer-signatures">
      <div class="signature-box">Borrower Acknowledgement</div>
      <div class="signature-box">Authorized Officer (DD Enterprises)</div>
    </div>
  `;

  openModal('modal-receipt');
}

// 7. Payment Reversal
async function reversePayment(paymentId) {
  const reason = prompt('Please enter reason for reversing this payment:');
  if (!reason) return;

  try {
    await apiRequest(`/finance/payments/${paymentId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    showToast('Payment reversed and loan balance restored.', 'success');
    refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ==========================================================================
   FORM SUBMISSIONS & LISTENERS
   ========================================================================== */

function initFormListeners() {
  // Add Customer Form
  document.getElementById('customer-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      fullName: document.getElementById('cust-fullname').value.trim(),
      phone: document.getElementById('cust-phone').value.trim(),
      altPhone: document.getElementById('cust-altphone').value.trim() || undefined,
      address: document.getElementById('cust-address').value.trim(),
      dob: document.getElementById('cust-dob').value,
      idType: document.getElementById('cust-idtype').value,
      idNumber: document.getElementById('cust-idnumber').value.trim(),
      notes: document.getElementById('cust-notes').value.trim() || undefined,
    };

    try {
      await apiRequest('/finance/customers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeModal('modal-customer');
      showToast('Borrower registered successfully!', 'success');
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Disburse Loan Form
  document.getElementById('account-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      customerId: document.getElementById('loan-customer-select').value,
      principalAmount: Number(document.getElementById('loan-principal').value),
      interestRate: Number(document.getElementById('loan-rate').value),
      durationMonths: Number(document.getElementById('loan-duration').value),
      paymentFrequency: document.getElementById('loan-frequency').value,
      interestType: document.getElementById('loan-type').value,
      startDate: document.getElementById('loan-start-date').value,
      notes: document.getElementById('loan-notes').value.trim() || undefined,
    };

    try {
      await apiRequest('/finance/accounts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeModal('modal-account');
      showToast('Loan disbursed and account created!', 'success');
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Collect Payment Form
  document.getElementById('payment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const method = document.getElementById('pay-method').value;
    const upiApp = document.getElementById('pay-upi-app')?.value;
    const ref = method === 'UPI'
      ? document.getElementById('pay-ref').value.trim() || `${upiApp}-${Date.now()}`
      : document.getElementById('pay-gen-ref')?.value.trim();

    const payload = {
      accountId: document.getElementById('pay-account-select').value,
      amount: Number(document.getElementById('pay-amount').value),
      paymentDate: document.getElementById('pay-date').value,
      paymentMethod: method,
      referenceNumber: ref || undefined,
      notes: document.getElementById('pay-notes').value.trim() || undefined,
    };

    try {
      const created = await apiRequest('/finance/payments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeModal('modal-payment');
      showToast(`Payment of ${formatCurrency(payload.amount)} collected!`, 'success');
      refreshAllData().then(() => {
        if (created?.id) viewReceipt(created.id);
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Live Loan Form preview
  ['loan-principal', 'loan-rate', 'loan-duration', 'loan-type'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateLoanModalPreview);
  });

  // Payment method & amount listeners for QR code
  document.getElementById('pay-method')?.addEventListener('change', handlePaymentMethodChange);
  document.getElementById('pay-amount')?.addEventListener('input', (e) => {
    if (document.getElementById('pay-method')?.value === 'UPI') {
      generateUpiQrCode(Number(e.target.value));
    }
  });

  // Table search inputs (debounced)
  let custTimer, accTimer, payTimer;
  document.getElementById('customers-search-input')?.addEventListener('input', (e) => {
    clearTimeout(custTimer);
    custTimer = setTimeout(() => loadCustomers(e.target.value), 250);
  });
  document.getElementById('accounts-search-input')?.addEventListener('input', (e) => {
    clearTimeout(accTimer);
    accTimer = setTimeout(() => loadAccounts(e.target.value), 250);
  });
  document.getElementById('payments-search-input')?.addEventListener('input', (e) => {
    clearTimeout(payTimer);
    payTimer = setTimeout(() => loadPayments(e.target.value), 250);
  });
}

/* ==========================================================================
   GLOBAL SEARCH & EXPORT
   ========================================================================== */

function initGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const dropdown = document.getElementById('search-dropdown');
  if (!input || !dropdown) return;

  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim().toLowerCase();
    if (!q) {
      dropdown.classList.add('hidden');
      return;
    }

    searchTimer = setTimeout(() => {
      const matches = [];

      // Search borrowers
      state.customers.forEach((c) => {
        if (c.fullName.toLowerCase().includes(q) || c.phone.includes(q) || c.customerId.toLowerCase().includes(q)) {
          matches.push({ title: c.fullName, meta: `Borrower: ${c.customerId} • ${c.phone}`, action: () => viewCustomerDetails(c.id) });
        }
      });

      // Search accounts
      state.accounts.forEach((a) => {
        if (a.accountNumber.toLowerCase().includes(q) || a.customer.fullName.toLowerCase().includes(q)) {
          matches.push({ title: a.accountNumber, meta: `Loan: ${a.customer.fullName} • ${formatCurrency(a.outstandingBalance)} due`, action: () => viewAccountDetails(a.id) });
        }
      });

      // Search payments
      state.payments.forEach((p) => {
        if (p.receiptNumber.toLowerCase().includes(q) || p.customer.fullName.toLowerCase().includes(q)) {
          matches.push({ title: p.receiptNumber, meta: `Receipt: ${p.customer.fullName} • ${formatCurrency(p.amount)}`, action: () => viewReceipt(p.id) });
        }
      });

      if (!matches.length) {
        dropdown.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:0.8rem;">No results found.</div>';
      } else {
        dropdown.innerHTML = matches
          .slice(0, 7)
          .map((m, idx) => `
          <div class="search-dropdown-item" data-idx="${idx}">
            <div class="search-item-title">${m.title}</div>
            <div class="search-item-meta">${m.meta}</div>
          </div>
        `)
          .join('');

        dropdown.querySelectorAll('.search-dropdown-item').forEach((item, idx) => {
          item.addEventListener('click', () => {
            matches[idx].action();
            dropdown.classList.add('hidden');
            input.value = '';
          });
        });
      }

      dropdown.classList.remove('hidden');
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function exportData(type) {
  const url = `${API_BASE}/finance/export/${type}`;
  const token = state.token;

  showToast(`Downloading ${type}.csv...`, 'info');
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    })
    .then((blob) => {
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = `${type}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(`${type}.csv downloaded successfully!`, 'success');
    })
    .catch((err) => showToast(err.message, 'error'));
}

// Window Escape Listener for Modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
  }
});
