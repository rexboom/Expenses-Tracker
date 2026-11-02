// Main Application Controller: Unified State, Offline Routing, Keyboard Shortcuts,
// Advanced Search Parser, and Comprehensive Personal/Business Finance Management.

import {
  initDB,
  getAll,
  get,
  put,
  remove,
  clearAll,
  replaceAll,
  createAutoBackup,
  restoreAutoBackup,
  getAutoBackupInfo,
  getExportPayload,
} from './storage.js';

import {
  $,
  $$,
  toast,
  confirmModal,
  format,
  escapeHtml,
  renderTimeline,
} from './ui.js';

import { renderCharts } from './charts.js';

import {
  ensureDefaultAccounts,
  computeAccountBalance,
  filterByMode,
  isBusinessTransaction,
  getBusinessMetrics,
  renderAccountsOverview,
  openAccountManagerModal,
  openTransferModal,
  renderGoalsPanel,
  openGoalModal,
  openGoalDepositModal,
  renderInvestmentsPanel,
  openInvestmentModal,
  renderHealthScore,
  renderSmartInsights,
} from './advanced.js';

// Constants
const EXPENSE_CATEGORIES = [
  'Food',
  'Fuel',
  'Shopping',
  'Business',
  'Inventory',
  'Investment',
  'University',
  'Bills',
  'Entertainment',
  'Health',
  'Transport',
  'Gifts',
  'Other',
];

const INCOME_CATEGORIES = [
  'Salary',
  'Business',
  'Gift',
  'Investment',
  'Refund',
  'Other',
];

const ONE_DAY_MS = 86400000;

// Central Application State
let tx = [];
let budgets = [];
let accounts = [];
let goals = [];
let investments = [];

let settings = {
  currency: 'DZD',
  decimalMode: 'auto',
  theme: 'dark',
  accent: 'indigo',
  language: 'en',
  favoriteCategories: [],
  dashboardMode: 'personal',
  onboardingCompleted: false,
};

let currentTxType = 'expense';
let editingTx = null;
let lastDeletedTx = null;
let selectedTxId = null;
let activeSearchQuery = '';

// Helper date utilities
const today = () => new Date().toISOString().slice(0, 10);
const monthString = () => today().slice(0, 7);

function money(num, short = false) {
  return format(num, settings.currency, short, settings.decimalMode);
}

function parseTxParts(date = new Date()) {
  const d = new Date(date);
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 5),
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * App Bootstrapping
 */
async function boot() {
  try {
    await initDB();

    // Load settings
    const storedSettings = await get('settings', 'app');
    if (storedSettings?.value) {
      settings = { ...settings, ...storedSettings.value };
    }

    // Apply theme and accent
    applyThemeAndAccent();

    // Ensure initial default accounts exist
    await ensureDefaultAccounts();

    // Load dataset
    await reloadData();

    // Consolidate legacy budgets & recurring series
    await consolidateBudgets();
    await materializeRecurring();

    // Check onboarding
    if (!settings.onboardingCompleted) {
      showOnboardingModal();
    }

    // Bind all event handlers
    bindEvents();
    bindKeyboardShortcuts();
    setupNetworkStatusMonitoring();

    // Initial render
    renderAll();
  } catch (err) {
    console.error('Fatal initialization error:', err);
    toast('Error initializing Ledger storage: ' + err.message, { type: 'error' });
  }
}

async function reloadData() {
  [tx, budgets, accounts, goals, investments] = await Promise.all([
    getAll('transactions'),
    getAll('budgets'),
    getAll('accounts'),
    getAll('goals'),
    getAll('investments'),
  ]);

  // Clean in-memory duplicate accounts by name if any exist
  const seenAcc = new Set();
  const cleanedAccounts = [];
  for (const a of accounts) {
    const k = (a.name || '').trim().toLowerCase();
    if (!seenAcc.has(k)) {
      seenAcc.add(k);
      cleanedAccounts.push(a);
    }
  }
  accounts = cleanedAccounts;
}

async function saveSettings() {
  await put('settings', { key: 'app', value: settings });
}

function applyThemeAndAccent() {
  document.documentElement.dataset.theme = settings.theme || 'dark';
  document.documentElement.dataset.accent = settings.accent || 'indigo';

  const themeEl = $('#theme');
  if (themeEl) themeEl.value = settings.theme || 'dark';

  const currEl = $('#currency');
  if (currEl) currEl.value = settings.currency || 'DZD';

  const decEl = $('#decimal-mode');
  if (decEl) decEl.value = settings.decimalMode || 'auto';

  const currSym = $('#currency-symbol');
  if (currSym) currSym.textContent = settings.currency || 'DZD';

  $$('.accent-dot').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.accent === settings.accent);
  });
}

function setPage(pageId) {
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === pageId));
  $$('[data-page]').forEach((b) => b.classList.toggle('active', b.dataset.page === pageId));

  const pageTitle = $('#page-title');
  const pageKicker = $('#page-kicker');

  const titles = {
    dashboard: 'Financial Overview',
    history: 'Transactions',
    add: editingTx ? 'Edit Transaction' : 'New Transaction',
    analytics: 'Analytics & Assets',
    budget: 'Budgets & Goals',
    settings: 'Preferences',
  };

  const kickers = {
    dashboard: 'YOUR FINANCES',
    history: 'TIMELINE',
    add: editingTx ? 'UPDATE RECORD' : 'LOG TRANSACTION',
    analytics: 'FINANCIAL INTELLIGENCE',
    budget: 'MONTHLY LIMITS',
    settings: 'CUSTOMIZATION',
  };

  if (pageTitle) pageTitle.textContent = titles[pageId] || 'Ledger';
  if (pageKicker) pageKicker.textContent = kickers[pageId] || 'LEDGER';

  if (pageId === 'analytics') {
    requestAnimationFrame(() => renderCharts(tx, accounts, investments));
  }
}

/**
 * Master Render
 */
function renderAll() {
  renderCategoryPicker();
  renderAccountPicker();
  renderDashboard();
  renderHistory();
  renderBudgetsAndGoals();
  renderAnalytics();
  renderQuickAdd();
  updateBackupStatusUI();
}

/**
 * Phase 2 & 3: Multi-Accounts & Business Mode Dashboard
 */
function renderDashboard() {
  const mode = settings.dashboardMode || 'personal';

  // Update active state on segmented buttons
  $$('.dashboard-mode button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  const { transactions: modeTx, accounts: modeAccounts } = filterByMode(mode, tx, accounts);
  const actualTx = modeTx.filter((t) => !t.scheduled && !t.isTransfer);
  const mActual = actualTx.filter((t) => t.date.startsWith(monthString()));

  const balanceCardLabel = $('#balance-label');
  const balanceEl = $('#balance');
  const incomeEl = $('#income');
  const expensesEl = $('#expenses');
  const incomeLabel = $('#income-label');
  const expenseLabel = $('#expense-label');

  if (mode === 'business') {
    // Specialized Business Cockpit
    const bMetrics = getBusinessMetrics(tx, accounts, investments);

    if (balanceCardLabel) balanceCardLabel.textContent = 'Business cash available';
    if (balanceEl) balanceEl.textContent = money(bMetrics.cashAvailable, false);
    if (incomeEl) incomeEl.textContent = money(bMetrics.revenue);
    if (expensesEl) expensesEl.textContent = money(bMetrics.expenses);
    if (incomeLabel) incomeLabel.textContent = 'revenue';
    if (expenseLabel) expenseLabel.textContent = 'biz expense';

    // Update Metric Grid for Business
    $('#metric-1-lbl').textContent = 'Net profit';
    $('#today-spend').textContent = `${bMetrics.netProfit >= 0 ? '+' : ''}${money(bMetrics.netProfit)} (${bMetrics.margin}%)`;
    $('#metric-1-sub').textContent = 'this month';

    $('#metric-2-lbl').textContent = 'Inventory spend';
    $('#month-spend').textContent = money(bMetrics.inventorySpend);
    $('#metric-2-sub').textContent = 'stock purchases';

    $('#metric-3-lbl').textContent = 'Biz investment';
    $('#savings-rate').textContent = money(bMetrics.investmentVal);
    $('#metric-3-sub').textContent = 'capital assets';
  } else {
    // Personal or Combined
    const totalLiquid = modeAccounts.reduce((sum, a) => sum + computeAccountBalance(a, tx), 0);
    const monthInc = mActual.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthExp = mActual.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const todayExp = actualTx.filter((t) => t.type === 'expense' && t.date === today()).reduce((s, t) => s + t.amount, 0);

    if (balanceCardLabel) balanceCardLabel.textContent = mode === 'combined' ? 'Total net liquidity' : 'Personal balance';
    if (balanceEl) balanceEl.textContent = money(totalLiquid, false);
    if (incomeEl) incomeEl.textContent = money(monthInc);
    if (expensesEl) expensesEl.textContent = money(monthExp);
    if (incomeLabel) incomeLabel.textContent = 'income';
    if (expenseLabel) expenseLabel.textContent = 'spent';

    // Standard metric grid
    $('#metric-1-lbl').textContent = 'Today';
    $('#today-spend').textContent = money(todayExp);
    $('#metric-1-sub').textContent = 'spent today';

    $('#metric-2-lbl').textContent = 'This month';
    $('#month-spend').textContent = money(monthExp);
    $('#metric-2-sub').textContent = 'outgoing';

    const savingsRate = monthInc > 0 ? Math.round(((monthInc - monthExp) / monthInc) * 100) : 0;
    $('#metric-3-lbl').textContent = 'Savings';
    $('#savings-rate').textContent = monthInc > 0 ? `${savingsRate}%` : '—';
    $('#metric-3-sub').textContent = 'this month';
  }

  // Prediction calculation
  const mExpenses = mActual.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const mIncome = mActual.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const p = calculatePrediction(mExpenses, mIncome, modeTx);
  $('#prediction').textContent = money(p.projectedExpense);
  $('#prediction-confidence').textContent = `${p.confidence} confidence · Pace ${money(p.dailyPace)}/day`;

  // Largest expense
  const bigExpense = [...mActual.filter((t) => t.type === 'expense')].sort((a, b) => b.amount - a.amount)[0];
  $('#largest-expense').textContent = bigExpense ? money(bigExpense.amount) : '—';
  $('#largest-expense-label').textContent = bigExpense ? (bigExpense.merchant || bigExpense.category) : 'No expenses this month';

  // Accounts Overview Strip
  const accContainer = $('#account-overview');
  renderAccountsOverview(accContainer, accounts, tx, mode, settings.currency, {
    onTransfer: () => openTransferModal(accounts, settings.currency, handleTxChange),
    onManage: () => openAccountManagerModal(accounts, tx, settings.currency, {
      onSave: async (updated) => {
        await put('accounts', updated);
        await reloadData();
        renderAll();
        toast('Account saved', { type: 'success' });
      },
      onArchive: async (a) => {
        a.archived = true;
        await put('accounts', a);
        await reloadData();
        renderAll();
        toast(`Archived ${a.name}`, { type: 'info' });
      },
      onUnarchive: async (a) => {
        a.archived = false;
        await put('accounts', a);
        await reloadData();
        renderAll();
        toast(`Restored ${a.name}`, { type: 'success' });
      },
    }),
    onSelectAccount: (acc) => {
      // Quick filter history by this account
      $('#search').value = `account:${acc.name.toLowerCase()}`;
      setPage('history');
      renderHistory();
    },
  });

  // Health Score & Smart Insights
  renderHealthScore($('#health-score'), tx, budgets, goals, accounts);
  renderSmartInsights($('#smart-insights'), tx, budgets, goals, mode, settings.currency, accounts);

  // Compact Budgets
  renderCompactBudget('#dashboard-budgets');

  // Upcoming scheduled
  const upcoming = tx
    .filter((t) => t.scheduled && t.date > today())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  const accMap = {};
  accounts.forEach((a) => { accMap[a.id] = a; });

  renderTimeline('#upcoming-list', upcoming, settings.currency, {
    accountsMap: accMap,
    editable: true,
    onEdit: handleEditTx,
    onDelete: handleDeleteTx,
    onDuplicate: handleDuplicateTx,
    emptyMessage: 'No upcoming scheduled payments.',
    decimalMode: settings.decimalMode,
  });

  // Recent activity
  const recent = [...actualTx]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  renderTimeline('#recent-list', recent, settings.currency, {
    accountsMap: accMap,
    editable: true,
    onEdit: handleEditTx,
    onDelete: handleDeleteTx,
    onDuplicate: handleDuplicateTx,
    emptyMessage: 'No recent transactions.',
    decimalMode: settings.decimalMode,
  });
}

function calculatePrediction(mExpenses, mIncome, modeTx) {
  const now = new Date();
  const currentDay = Math.max(1, now.getDate());
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyPace = mExpenses / currentDay;
  const projectedExpense = dailyPace * totalDays;

  const uniqueDays = new Set(modeTx.map((t) => t.date)).size;
  const confidence = uniqueDays >= 14 ? 'High' : uniqueDays >= 5 ? 'Medium' : 'Building';

  return { projectedExpense, dailyPace, confidence };
}

/**
 * Phase 7 & 8: History Timeline & Advanced Search Operator Parser
 */
export function parseSearchQuery(query) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const filters = {
    keywords: [],
    merchant: null,
    tag: null,
    category: null,
    account: null,
    minAmount: null,
    maxAmount: null,
    exactAmount: null,
    type: null,
    favorite: false,
    period: null,
  };

  for (let token of tokens) {
    const lower = token.toLowerCase();

    if (lower === 'fav' || lower === 'favorite') {
      filters.favorite = true;
      continue;
    }
    if (lower === 'income' || lower === 'expense' || lower === 'transfer') {
      filters.type = lower;
      continue;
    }
    if (['today', 'yesterday', 'this-week', 'this-month', 'last-month'].includes(lower)) {
      filters.period = lower;
      continue;
    }
    if (['cash', 'bank', 'ccp', 'wallet', 'savings', 'business'].includes(lower)) {
      filters.account = lower;
      continue;
    }

    if (lower.startsWith('merchant:') || lower.startsWith('m:')) {
      filters.merchant = lower.replace(/^(?:merchant:|m:)/, '');
      continue;
    }
    if (lower.startsWith('tag:') || lower.startsWith('>tag:') || lower.startsWith('t:')) {
      filters.tag = lower.replace(/^(?:>tag:|tag:|t:)/, '');
      continue;
    }
    if (lower.startsWith('category:') || lower.startsWith('c:')) {
      filters.category = lower.replace(/^(?:category:|c:)/, '');
      continue;
    }
    if (lower.startsWith('account:') || lower.startsWith('a:')) {
      filters.account = lower.replace(/^(?:account:|a:)/, '');
      continue;
    }

    const gtMatch = lower.match(/^(?:amount>|>)([\d.]+)/);
    if (gtMatch) {
      filters.minAmount = parseFloat(gtMatch[1]);
      continue;
    }
    const ltMatch = lower.match(/^(?:amount<|<)([\d.]+)/);
    if (ltMatch) {
      filters.maxAmount = parseFloat(ltMatch[1]);
      continue;
    }
    const eqMatch = lower.match(/^(?:amount:|=|amount=)([\d.]+)/);
    if (eqMatch) {
      filters.exactAmount = parseFloat(eqMatch[1]);
      continue;
    }

    filters.keywords.push(lower);
  }

  return filters;
}

function renderHistory() {
  const searchInput = $('#search');
  const query = searchInput ? searchInput.value.trim() : '';
  const parsed = parseSearchQuery(query);

  const filterType = $('#filter-type')?.value || '';
  const filterCat = $('#filter-category')?.value || '';
  const filterMo = $('#filter-month')?.value || '';
  const filterYr = $('#filter-year')?.value || '';
  const sortMode = $('#sort')?.value || 'newest';

  const accMap = {};
  accounts.forEach((a) => { accMap[a.id] = a; });

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);
  const yesterdayStr = yDate.toISOString().slice(0, 10);
  const sevenDaysAgoStr = new Date(Date.now() - 7 * ONE_DAY_MS).toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = prevMonthDate.toISOString().slice(0, 7);

  // Filter actual non-scheduled transactions
  let list = tx.filter((t) => !t.scheduled);

  list = list.filter((t) => {
    // 1. Dropdown Filters
    if (filterType && t.type !== filterType) return false;
    if (filterCat && t.category !== filterCat) return false;
    if (filterMo && String(t.month) !== filterMo) return false;
    if (filterYr && String(t.year) !== filterYr) return false;

    // 2. Operator Filters
    if (parsed.favorite && !t.favorite) return false;
    if (parsed.type && t.type !== parsed.type) return false;
    if (parsed.minAmount !== null && t.amount < parsed.minAmount) return false;
    if (parsed.maxAmount !== null && t.amount > parsed.maxAmount) return false;
    if (parsed.exactAmount !== null && Math.abs(t.amount - parsed.exactAmount) > 0.01) return false;

    if (parsed.merchant && !(t.merchant && t.merchant.toLowerCase().includes(parsed.merchant))) return false;
    if (parsed.tag && !(t.tags && t.tags.toLowerCase().includes(parsed.tag))) return false;
    if (parsed.category && !(t.category && t.category.toLowerCase().includes(parsed.category))) return false;

    if (parsed.account) {
      const acc = accMap[t.accountId];
      const accName = acc ? acc.name.toLowerCase() : '';
      const accKind = acc ? acc.kind.toLowerCase() : '';
      const pAcc = (t.paymentMethod || '').toLowerCase();
      if (!accName.includes(parsed.account) && !accKind.includes(parsed.account) && !pAcc.includes(parsed.account)) {
        return false;
      }
    }

    if (parsed.period) {
      if (parsed.period === 'today' && t.date !== todayStr) return false;
      if (parsed.period === 'yesterday' && t.date !== yesterdayStr) return false;
      if (parsed.period === 'this-week' && (t.date < sevenDaysAgoStr || t.date > todayStr)) return false;
      if (parsed.period === 'this-month' && !t.date.startsWith(currentMonthStr)) return false;
      if (parsed.period === 'last-month' && !t.date.startsWith(prevMonthStr)) return false;
    }

    // 3. Keyword search
    if (parsed.keywords.length) {
      const haystack = `${t.category} ${t.merchant || ''} ${t.note || ''} ${t.tags || ''} ${t.amount} ${t.paymentMethod || ''} ${accMap[t.accountId]?.name || ''}`.toLowerCase();
      for (const kw of parsed.keywords) {
        if (!haystack.includes(kw)) return false;
      }
    }

    return true;
  });

  // Sort
  list.sort((a, b) => {
    if (sortMode === 'oldest') return a.createdAt.localeCompare(b.createdAt);
    if (sortMode === 'highest') return b.amount - a.amount;
    if (sortMode === 'lowest') return a.amount - b.amount;
    return b.createdAt.localeCompare(a.createdAt); // newest
  });

  renderFilterDropdowns();

  renderTimeline('#history-list', list, settings.currency, {
    accountsMap: accMap,
    editable: true,
    selectedId: selectedTxId,
    onSelect: (item) => {
      selectedTxId = selectedTxId === item.id ? null : item.id;
      renderHistory();
    },
    onEdit: handleEditTx,
    onDelete: handleDeleteTx,
    onDuplicate: handleDuplicateTx,
    emptyMessage: query ? 'No matching transactions found.' : 'No transactions recorded yet.',
    emptyAction: query
      ? {
          label: 'Clear search filters',
          onClick: () => {
            if (searchInput) searchInput.value = '';
            $$('.pill-filter').forEach((p) => p.classList.toggle('active', p.dataset.pill === ''));
            renderHistory();
          },
        }
      : {
          label: '+ Add your first transaction',
          onClick: () => setPage('add'),
        },
    decimalMode: settings.decimalMode,
  });
}

function renderFilterDropdowns() {
  const catSelect = $('#filter-category');
  const moSelect = $('#filter-month');
  const yrSelect = $('#filter-year');
  if (!catSelect || !moSelect || !yrSelect) return;

  const currentCat = catSelect.value;
  const currentMo = moSelect.value;
  const currentYr = yrSelect.value;

  const cats = [...new Set(tx.map((t) => t.category))].filter(Boolean).sort();
  const years = [...new Set(tx.map((t) => t.year))].filter(Boolean).sort((a, b) => b - a);

  catSelect.innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  moSelect.innerHTML = '<option value="">All months</option>' + Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2024, i, 1);
    const mName = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(d);
    return `<option value="${i + 1}">${mName}</option>`;
  }).join('');
  yrSelect.innerHTML = '<option value="">All years</option>' + years.map((y) => `<option value="${y}">${y}</option>`).join('');

  catSelect.value = currentCat;
  moSelect.value = currentMo;
  yrSelect.value = currentYr;
}

/**
 * Transaction Form & Pickers
 */
function renderCategoryPicker() {
  const catEl = $('#category');
  if (!catEl) return;
  const prevVal = catEl.value;

  const baseList = currentTxType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const counts = {};
  tx.forEach((t) => { counts[t.category] = (counts[t.category] || 0) + 1; });

  const favs = settings.favoriteCategories || [];
  const sorted = [...baseList].sort((a, b) => {
    const aFav = favs.includes(a) ? 1 : 0;
    const bFav = favs.includes(b) ? 1 : 0;
    if (bFav !== aFav) return bFav - aFav;
    return (counts[b] || 0) - (counts[a] || 0);
  });

  catEl.innerHTML = '<option value="" disabled selected>Select category</option>' +
    sorted.map((c) => `<option value="${escapeHtml(c)}">${favs.includes(c) ? '★ ' : ''}${escapeHtml(c)}</option>`).join('');

  if (sorted.includes(prevVal)) catEl.value = prevVal;
}

function renderAccountPicker() {
  const accEl = $('#account');
  if (!accEl) return;
  const prevVal = accEl.value;

  const seen = new Set();
  const uniqueActive = [];
  for (const a of accounts) {
    if (a.archived) continue;
    const nameKey = (a.name || '').trim().toLowerCase();
    if (!nameKey || seen.has(nameKey)) continue;
    seen.add(nameKey);
    uniqueActive.push(a);
  }

  accEl.innerHTML =
    '<option value="" disabled selected>Select account</option>' +
    uniqueActive
      .map((a) => `<option value="${a.id}">${escapeHtml(a.name)} (${escapeHtml(a.kind)})</option>`)
      .join('');

  if (uniqueActive.some((a) => a.id === prevVal)) {
    accEl.value = prevVal;
  } else if (uniqueActive.length > 0) {
    accEl.value = uniqueActive[0].id;
  }
}

function renderQuickAdd() {
  const container = $('#quick-buttons');
  if (!container) return;

  const actualTx = tx.filter((t) => !t.scheduled && !t.isTransfer);
  const map = {};

  actualTx.forEach((t) => {
    const k = `${t.category}|${t.amount}|${t.merchant || ''}`;
    map[k] = map[k] || { count: 0, tx: t };
    map[k].count++;
  });

  const frequent = Object.values(map)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((x) => x.tx);

  if (!frequent.length) {
    container.innerHTML = '<span class="muted">Frequent transactions will appear here for 1-tap logging.</span>';
    return;
  }

  container.innerHTML = frequent.map((t) => `
    <button type="button" class="quick-pill-btn" data-quick-id="${t.id}">
      ${escapeHtml(t.merchant || t.category)} · ${money(t.amount, true)}
    </button>
  `).join('');

  $$('[data-quick-id]', container).forEach((btn) => {
    btn.onclick = () => {
      const orig = tx.find((x) => x.id === btn.dataset.quickId);
      if (orig) handleDuplicateTx(orig);
    };
  });
}

/**
 * Add / Edit Form Submission
 */
async function handleTransactionSubmit(e) {
  e.preventDefault();
  const amount = Number($('#amount').value);
  const accountId = $('#account').value;
  const category = $('#category').value;

  if (!accountId || !category || !amount || amount <= 0) {
    toast('Please choose an account, category, and enter a valid positive amount.', { type: 'warning' });
    return;
  }

  const receiptFile = $('#receipt')?.files?.[0];
  let receiptData = editingTx?.receipt || '';
  if (receiptFile) {
    receiptData = await readImageAsDataUrl(receiptFile);
  }

  const baseParts = editingTx ? { date: editingTx.date, time: editingTx.time, month: editingTx.month, year: editingTx.year, createdAt: editingTx.createdAt } : parseTxParts();

  const record = {
    id: editingTx?.id || crypto.randomUUID(),
    type: currentTxType,
    accountId,
    category,
    amount,
    merchant: $('#merchant').value.trim(),
    paymentMethod: $('#payment-method').value,
    note: $('#note').value.trim(),
    tags: $('#tags').value.trim(),
    recurrence: $('#recurrence').value,
    favorite: $('#favorite').checked,
    receipt: receiptData,
    scheduled: false,
    ...baseParts,
  };

  await put('transactions', record);
  editingTx = null;
  e.target.reset();

  // Reset form segmented button
  currentTxType = 'expense';
  $$('#transaction-form .segmented button').forEach((b) => {
    b.classList.toggle('active', b.dataset.type === 'expense');
  });

  await materializeRecurring();
  await handleTxChange();

  toast('Transaction saved successfully', { type: 'success' });
  setPage('dashboard');
}

function readImageAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function handleEditTx(t) {
  editingTx = t;
  currentTxType = t.type;

  $$('#transaction-form .segmented button').forEach((b) => {
    b.classList.toggle('active', b.dataset.type === currentTxType);
  });

  renderCategoryPicker();
  renderAccountPicker();

  $('#account').value = t.accountId || '';
  $('#category').value = t.category || '';
  $('#amount').value = t.amount || '';
  $('#merchant').value = t.merchant || '';
  $('#payment-method').value = t.paymentMethod || 'Cash';
  $('#note').value = t.note || '';
  $('#tags').value = t.tags || '';
  $('#recurrence').value = t.recurrence || '';
  $('#favorite').checked = !!t.favorite;

  setPage('add');
}

async function handleDuplicateTx(t) {
  const copy = {
    ...t,
    id: crypto.randomUUID(),
    ...parseTxParts(),
    scheduled: false,
    seriesId: undefined,
  };
  await put('transactions', copy);
  toast(`Duplicated ${t.merchant || t.category}`, { type: 'success' });
  await handleTxChange();
}

async function handleDeleteTx(t) {
  const confirmed = await confirmModal(
    'Delete transaction?',
    `Are you sure you want to remove ${t.merchant || t.category} (${money(t.amount)})?`,
    'Delete',
    true
  );
  if (!confirmed) return;

  // Handle linked transfer deletion
  if (t.linkedTxId) {
    const paired = tx.find((x) => x.linkedTxId === t.linkedTxId && x.id !== t.id);
    if (paired) {
      await remove('transactions', paired.id);
    }
  }

  await remove('transactions', t.id);
  lastDeletedTx = t;

  toast(`Deleted ${t.merchant || t.category}`, {
    type: 'info',
    actionText: 'Undo',
    onAction: async () => {
      if (lastDeletedTx) {
        await put('transactions', lastDeletedTx);
        lastDeletedTx = null;
        await handleTxChange();
        toast('Transaction restored', { type: 'success' });
      }
    },
  });

  await handleTxChange();
}

async function handleTxChange() {
  await reloadData();
  await createAutoBackup();
  renderAll();
}

/**
 * Phase 4 & Budgets Management
 */
function renderCompactBudget(target) {
  const el = $(target);
  if (!el) return;

  const b = budgets.find((x) => x.id === 'monthly-total');
  if (!b) {
    el.innerHTML = '<div class="empty-inline">No personal monthly limit set. <button type="button" class="text-btn" data-page="budget">+ Set limit</button></div>';
    const btn = el.querySelector('[data-page="budget"]');
    if (btn) btn.onclick = () => setPage('budget');
    return;
  }

  const accMap = {};
  accounts.forEach((a) => { accMap[a.id] = a; });

  // Only personal account expenses count towards the monthly limit (business excluded)
  const personalTx = tx.filter(
    (t) => !t.scheduled && !t.isTransfer && t.type === 'expense' && t.date.startsWith(monthString()) && !isBusinessTransaction(t, accMap)
  );
  const used = personalTx.reduce((s, t) => s + t.amount, 0);
  const pct = Math.min(100, Math.round((used / Math.max(b.amount, 1)) * 100));
  const remaining = Math.max(0, b.amount - used);
  const colorClass = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : pct >= 50 ? 'half' : '';

  el.innerHTML = `
    <article class="budget-item glass">
      <div class="budget-row">
        <b>Monthly Limit (Personal only)</b>
        <span>${pct}% used</span>
      </div>
      <div class="progress ${colorClass}"><i style="width:${pct}%"></i></div>
      <div class="budget-meta">
        ${money(used)} of ${money(b.amount)} · ${money(remaining)} remaining (business excluded)
      </div>
    </article>
  `;
}

function renderBudgetsAndGoals() {
  const budgetList = $('#budget-list');
  const b = budgets.find((x) => x.id === 'monthly-total');

  if (budgetList) {
    if (!b) {
      budgetList.innerHTML = `
        <div class="empty-state">
          <div class="empty-illustration">▥</div>
          <h4>No personal spending limits set</h4>
          <p>Set a monthly budget that caps your personal expenses (business excluded).</p>
          <button type="button" class="primary-btn" id="empty-add-budget">Set personal monthly limit</button>
        </div>
      `;
      const btn = $('#empty-add-budget', budgetList);
      if (btn) btn.onclick = () => openBudgetModal(null);
    } else {
      const accMap = {};
      accounts.forEach((a) => { accMap[a.id] = a; });

      // Only personal account expenses count towards the monthly limit (business excluded)
      const personalTx = tx.filter(
        (t) => !t.scheduled && !t.isTransfer && t.type === 'expense' && t.date.startsWith(monthString()) && !isBusinessTransaction(t, accMap)
      );
      const used = personalTx.reduce((s, t) => s + t.amount, 0);
      const pct = Math.min(100, Math.round((used / Math.max(b.amount, 1)) * 100));
      const remaining = Math.max(0, b.amount - used);
      const colorClass = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : pct >= 50 ? 'half' : '';

      budgetList.innerHTML = `
        <article class="budget-item glass">
          <div class="budget-row">
            <b>Personal Monthly Spending Limit</b>
            <button type="button" class="text-btn" id="edit-budget-btn">Edit limit</button>
          </div>
          <div class="progress ${colorClass}"><i style="width:${pct}%"></i></div>
          <div class="budget-meta">
            ${money(used)} spent of ${money(b.amount)} · ${pct}% utilized · ${money(remaining)} remaining
            <br><small style="color:var(--muted); font-size:11px; margin-top:4px; display:inline-block">Covers personal accounts only. Business transactions are excluded.</small>
          </div>
        </article>
      `;

      const editBtn = $('#edit-budget-btn', budgetList);
      if (editBtn) editBtn.onclick = () => openBudgetModal(b);
    }
  }

  // Render Goals panel
  renderGoalsPanel($('#goals-panel'), goals, tx, settings.currency, {
    onAddGoal: () => openGoalModal(null, async (newGoal) => {
      await put('goals', newGoal);
      await handleTxChange();
      toast('Savings goal created', { type: 'success' });
    }),
    onUpdateGoal: (g) => openGoalModal(g, async (updated) => {
      await put('goals', updated);
      await handleTxChange();
      toast('Savings goal updated', { type: 'success' });
    }, async (toDelete) => {
      await remove('goals', toDelete.id);
      await handleTxChange();
      toast('Goal deleted', { type: 'info' });
    }),
    onDepositGoal: (g) => openGoalDepositModal(g, accounts, settings.currency, handleTxChange),
  });
}

function openBudgetModal(existing) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop fade-in" id="b-backdrop">
      <form class="modal scale-in" id="b-form">
        <h3>${existing ? 'Edit' : 'Set'} personal monthly budget</h3>
        <p class="modal-subtitle">One unified monthly limit covering personal expenses only. Business expenses are excluded.</p>

        <label>Personal monthly spending cap
          <div class="amount-input">
            <span>${settings.currency}</span>
            <input id="b-amount" type="number" min="0.01" step="0.01" inputmode="decimal" required value="${existing?.amount || ''}" placeholder="0.00" autofocus>
          </div>
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="b-cancel">Cancel</button>
          <button type="submit" class="confirm">Save budget</button>
        </div>
      </form>
    </div>
  `;

  $('#b-backdrop').onclick = (e) => {
    if (e.target.id === 'b-backdrop') root.innerHTML = '';
  };
  $('#b-cancel').onclick = () => { root.innerHTML = ''; };

  $('#b-form').onsubmit = async (e) => {
    e.preventDefault();
    const amount = Number($('#b-amount').value);
    if (!amount || amount <= 0) {
      toast('Enter a positive monthly budget amount.', { type: 'warning' });
      return;
    }
    await put('budgets', { id: 'monthly-total', amount, period: 'monthly' });
    root.innerHTML = '';
    await handleTxChange();
    toast('Monthly budget saved', { type: 'success' });
  };
}

async function consolidateBudgets() {
  const all = await getAll('budgets');
  if (all.some((b) => b.id === 'monthly-total') || !all.length) return;
  const total = all.reduce((s, b) => s + b.amount, 0);
  await put('budgets', { id: 'monthly-total', amount: total, period: 'monthly' });
  for (const b of all) {
    if (b.id !== 'monthly-total') await remove('budgets', b.id);
  }
}

/**
 * Phase 13: Analytics & Reports
 */
function renderAnalytics() {
  const mActual = tx.filter((t) => !t.scheduled && !t.isTransfer && t.date.startsWith(monthString()));
  const inc = mActual.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = mActual.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = inc - exp;
  const savingsRate = inc > 0 ? Math.round((net / inc) * 100) : 0;
  const big = [...mActual.filter((t) => t.type === 'expense')].sort((a, b) => b.amount - a.amount)[0];

  const now = new Date();
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevStr = prevDate.toISOString().slice(0, 7);
  const prevExp = tx.filter((t) => !t.scheduled && !t.isTransfer && t.type === 'expense' && t.date.startsWith(prevStr)).reduce((s, t) => s + t.amount, 0);
  const diffPct = prevExp > 0 ? Math.round(((exp - prevExp) / prevExp) * 100) : 0;

  const reportTitle = $('#report-title');
  if (reportTitle) {
    reportTitle.textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(now);
  }

  const report = $('#report');
  if (report) {
    report.innerHTML = `
      <div><span>Total income</span><strong>${money(inc)}</strong></div>
      <div><span>Total spent</span><strong>${money(exp)}</strong></div>
      <div><span>Net savings</span><strong class="${net >= 0 ? 'income' : 'expense'}">${net >= 0 ? '+' : ''}${money(net)}</strong></div>
      <div><span>Savings rate</span><strong>${savingsRate}%</strong></div>
      <div><span>Largest expense</span><strong>${big ? money(big.amount) : '—'}</strong></div>
      <div><span>Daily average</span><strong>${money(exp / Math.max(1, now.getDate()))}</strong></div>
      <small>${mActual.length} transactions · ${diffPct >= 0 ? '+' : ''}${diffPct}% vs last month</small>
    `;
  }

  const stats = $('#stats');
  if (stats) {
    const expenses = tx.filter((t) => !t.scheduled && !t.isTransfer && t.type === 'expense');
    const counts = {};
    expenses.forEach((t) => { counts[t.category] = (counts[t.category] || 0) + 1; });
    const topCat = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || '—';
    const favCount = tx.filter((t) => !t.scheduled && t.favorite).length;

    stats.innerHTML = [
      ['Average purchase', money(expenses.length ? exp / expenses.length : 0)],
      ['Total transactions', tx.filter((t) => !t.scheduled).length],
      ['Top category', topCat],
      ['Favorites', favCount],
    ].map((x) => `
      <article class="metric-card glass">
        <span>${escapeHtml(x[0])}</span>
        <strong>${x[1]}</strong>
      </article>
    `).join('');
  }

  // Render Investments Panel
  renderInvestmentsPanel($('#investments-panel'), investments, settings.currency, {
    onAddAsset: () => openInvestmentModal(null, async (asset) => {
      await put('investments', asset);
      await handleTxChange();
      toast('Asset added to portfolio', { type: 'success' });
    }),
    onEditAsset: (asset) => openInvestmentModal(asset, async (updated) => {
      await put('investments', updated);
      await handleTxChange();
      toast('Valuation updated', { type: 'success' });
    }, async (toDelete) => {
      await remove('investments', toDelete.id);
      await handleTxChange();
      toast('Asset removed', { type: 'info' });
    }),
  });
}

/**
 * Phase 12: Settings & Backups
 */
function updateBackupStatusUI() {
  const statusEl = $('#backup-status-text');
  if (!statusEl) return;
  const info = getAutoBackupInfo();
  if (info && info.timestamp) {
    const d = new Date(info.timestamp);
    statusEl.textContent = `Active · Last snapshot ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${info.txCount} tx)`;
  } else {
    statusEl.textContent = 'Active · Automatic snapshots on every change';
  }
}

async function handleDataAction(action) {
  if (action === 'export-json') {
    const payload = await getExportPayload();
    downloadFile(
      `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
    toast('JSON backup exported', { type: 'success' });
    return;
  }

  if (action === 'export-csv') {
    const cols = ['date', 'time', 'type', 'category', 'merchant', 'paymentMethod', 'amount', 'note', 'tags', 'favorite', 'recurrence'];
    const rows = [cols.join(',')];
    tx.forEach((t) => {
      const line = cols.map((c) => `"${String(t[c] ?? '').replace(/"/g, '""')}"`).join(',');
      rows.push(line);
    });
    downloadFile(
      `ledger-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.join('\n'),
      'text/csv'
    );
    toast('CSV exported', { type: 'success' });
    return;
  }

  if (action === 'import') {
    $('#import-file')?.click();
    return;
  }

  if (action === 'clear') {
    const confirmed = await confirmModal(
      'Clear all financial data?',
      'This will irreversibly delete all transactions, budgets, accounts, goals, and assets on this device.',
      'Clear everything',
      true
    );
    if (!confirmed) return;

    await clearAll();
    settings = {
      currency: 'DZD',
      decimalMode: 'auto',
      theme: 'dark',
      accent: 'indigo',
      language: 'en',
      favoriteCategories: [],
      dashboardMode: 'personal',
      onboardingCompleted: false,
    };
    await saveSettings();
    await ensureDefaultAccounts();
    await handleTxChange();
    toast('All data cleared', { type: 'info' });
  }
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

/**
 * Phase 14: Onboarding Walkthrough
 */
function showOnboardingModal() {
  const root = $('#modal-root');
  let step = 0;

  const slides = [
    {
      title: 'Welcome to Ledger',
      icon: '🛡️',
      headline: 'Offline-first, 100% Private Personal Finance',
      text: 'Ledger stores all your financial records locally on your device in IndexedDB. No cloud trackers, no AI APIs, and no telemetry.',
    },
    {
      title: 'Multi-Accounts & Business Mode',
      icon: '💼',
      headline: 'Separate Personal and Business Cash Flows',
      text: 'Manage Cash, Bank, CCP, and Savings accounts. Switch instantly to Business Mode to monitor Revenue, Net Profit, and Inventory.',
    },
    {
      title: 'Budgets & Savings Goals',
      icon: '🎯',
      headline: 'Reach Targets with Smart Predictions',
      text: 'Set a unified monthly budget and create savings goals (Emergency Fund, Laptop, Vacation) with real-time estimated completion dates.',
    },
    {
      title: 'Local Financial Intelligence',
      icon: '📈',
      headline: 'Smart Insights & Cash Flow Analytics',
      text: 'Get automated spending comparisons, anomaly detection, weekday spending distributions, and a 0-100 Financial Health Score.',
    },
    {
      title: 'Reliable Offline Storage',
      icon: '💾',
      headline: 'Automatic Backups & Easy Exports',
      text: 'Your transactions are automatically snapshotted locally. Export JSON or CSV anytime and install Ledger as a PWA on your phone or desktop.',
    },
  ];

  function renderSlide() {
    const s = slides[step];
    root.innerHTML = `
      <div class="modal-backdrop fade-in" id="onboarding-backdrop">
        <div class="modal modal-lg scale-in onboarding-modal">
          <div class="onboarding-step-indicator">
            ${slides.map((_, i) => `<span class="dot ${i === step ? 'active' : ''}"></span>`).join('')}
          </div>

          <div class="onboarding-illustration">${s.icon}</div>
          <h3 class="onboarding-title">${s.title}</h3>
          <h4 class="onboarding-headline">${s.headline}</h4>
          <p class="onboarding-desc">${s.text}</p>

          <div class="modal-actions onboarding-actions">
            <button type="button" class="btn-secondary" id="onb-skip">Skip tour</button>
            <div class="onb-nav">
              ${step > 0 ? '<button type="button" class="btn-secondary" id="onb-prev">Previous</button>' : ''}
              <button type="button" class="confirm" id="onb-next">${step === slides.length - 1 ? 'Get Started' : 'Next →'}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    $('#onb-skip').onclick = finish;
    const prevBtn = $('#onb-prev');
    if (prevBtn) prevBtn.onclick = () => { step--; renderSlide(); };
    $('#onb-next').onclick = () => {
      if (step < slides.length - 1) {
        step++;
        renderSlide();
      } else {
        finish();
      }
    };
  }

  async function finish() {
    root.innerHTML = '';
    settings.onboardingCompleted = true;
    await saveSettings();
  }

  renderSlide();
}

/**
 * Phase 9: Keyboard Shortcuts Cheatsheet
 */
function showKeyboardShortcutsModal() {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop fade-in" id="shortcuts-backdrop">
      <div class="modal modal-lg scale-in">
        <div class="modal-header">
          <h3>Keyboard Shortcuts</h3>
          <span class="badge badge-income">Desktop Power</span>
        </div>
        <p class="modal-subtitle">Navigate and manage Ledger without touching your mouse.</p>

        <div class="shortcuts-grid">
          <div class="shortcut-row">
            <kbd>Ctrl</kbd> + <kbd>N</kbd>
            <span>New transaction</span>
          </div>
          <div class="shortcut-row">
            <kbd>Ctrl</kbd> + <kbd>F</kbd>
            <span>Focus Search & Timeline</span>
          </div>
          <div class="shortcut-row">
            <kbd>Ctrl</kbd> + <kbd>D</kbd>
            <span>Duplicate selected transaction</span>
          </div>
          <div class="shortcut-row">
            <kbd>Ctrl</kbd> + <kbd>Z</kbd>
            <span>Undo last deletion</span>
          </div>
          <div class="shortcut-row">
            <kbd>Delete</kbd> / <kbd>Backspace</kbd>
            <span>Delete selected transaction</span>
          </div>
          <div class="shortcut-row">
            <kbd>↑</kbd> / <kbd>↓</kbd>
            <span>Navigate transaction cards</span>
          </div>
          <div class="shortcut-row">
            <kbd>Enter</kbd>
            <span>Edit highlighted transaction</span>
          </div>
          <div class="shortcut-row">
            <kbd>Escape</kbd>
            <span>Close modal or clear selection</span>
          </div>
          <div class="shortcut-row">
            <kbd>?</kbd>
            <span>Show this cheatsheet</span>
          </div>
        </div>

        <div class="modal-actions" style="margin-top:20px">
          <button type="button" class="btn-secondary" id="shortcuts-close">Got it</button>
        </div>
      </div>
    </div>
  `;

  $('#shortcuts-backdrop').onclick = (e) => {
    if (e.target.id === 'shortcuts-backdrop') root.innerHTML = '';
  };
  $('#shortcuts-close').onclick = () => { root.innerHTML = ''; };
}

/**
 * Materialize Recurring Transactions
 */
function advanceRecurringDate(d, recurrence) {
  const date = new Date(d);
  if (recurrence === 'daily') date.setDate(date.getDate() + 1);
  if (recurrence === 'weekly') date.setDate(date.getDate() + 7);
  if (recurrence === 'monthly') date.setMonth(date.getMonth() + 1);
  if (recurrence === 'yearly') date.setFullYear(date.getFullYear() + 1);
  return date;
}

async function materializeRecurring() {
  const all = await getAll('transactions');
  const horizon = new Date(Date.now() + 45 * ONE_DAY_MS).toISOString().slice(0, 10);
  const recurringSources = all.filter((t) => t.recurrence && !t.scheduled && !t.seriesId);

  for (const src of recurringSources) {
    let d = new Date(`${src.date}T00:00`);
    for (let i = 0; i < 400; i++) {
      d = advanceRecurringDate(d, src.recurrence);
      const dateStr = d.toISOString().slice(0, 10);
      if (dateStr > horizon) break;

      const alreadyExists = all.some((t) => t.seriesId === src.id && t.date === dateStr);
      if (!alreadyExists) {
        const copy = {
          ...src,
          id: crypto.randomUUID(),
          ...parseTxParts(d),
          seriesId: src.id,
          scheduled: dateStr > today(),
        };
        await put('transactions', copy);
        all.push(copy);
      }
    }
  }
}

/**
 * Event Bindings
 */
function bindEvents() {
  // Navigation
  $$('[data-page]').forEach((btn) => {
    btn.onclick = () => setPage(btn.dataset.page);
  });
  $('#fab').onclick = () => setPage('add');

  // Dashboard mode buttons (Personal, Business, Combined)
  $$('.dashboard-mode button').forEach((btn) => {
    btn.onclick = async () => {
      settings.dashboardMode = btn.dataset.mode;
      await saveSettings();
      renderDashboard();
    };
  });

  // Transaction form type toggle
  $$('#transaction-form .segmented button').forEach((btn) => {
    btn.onclick = () => {
      currentTxType = btn.dataset.type;
      $$('#transaction-form .segmented button').forEach((x) => x.classList.toggle('active', x === btn));
      renderCategoryPicker();
    };
  });

  // Pin selected category
  $('#pin-category').onclick = async () => {
    const c = $('#category').value;
    if (!c) {
      toast('Select a category first to pin.', { type: 'warning' });
      return;
    }
    const pins = settings.favoriteCategories || [];
    settings.favoriteCategories = pins.includes(c) ? pins.filter((x) => x !== c) : [...pins, c];
    await saveSettings();
    renderCategoryPicker();
    $('#category').value = c;
    toast(pins.includes(c) ? `Unpinned ${c}` : `Pinned ${c} to top`, { type: 'success' });
  };

  // Form submit
  $('#transaction-form').onsubmit = handleTransactionSubmit;

  // Search & history filters
  const searchInput = $('#search');
  if (searchInput) {
    let searchTimer = null;
    searchInput.oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        renderHistory();
      }, 140);
    };
  }

  // Quick Search Pill Filters
  $$('.pill-filter').forEach((btn) => {
    btn.onclick = () => {
      $$('.pill-filter').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.pill;
      if (searchInput) {
        searchInput.value = val;
        renderHistory();
      }
    };
  });

  ['#filter-type', '#filter-category', '#filter-month', '#filter-year', '#sort'].forEach((sel) => {
    const el = $(sel);
    if (el) el.onchange = renderHistory;
  });

  $('#filter-toggle').onclick = () => {
    $('#filters')?.classList.toggle('hidden');
  };

  // Budgets
  $('#new-budget').onclick = () => openBudgetModal(budgets.find((b) => b.id === 'monthly-total'));

  // Export PDF Report
  $('#export-report').onclick = () => {
    document.body.classList.add('print-report');
    window.print();
    document.body.classList.remove('print-report');
  };

  // Settings: Currency, Theme, Decimals, Accents
  $('#currency').onchange = async (e) => {
    settings.currency = e.target.value;
    await saveSettings();
    applyThemeAndAccent();
    renderAll();
    toast(`Currency updated to ${settings.currency}`, { type: 'success' });
  };

  $('#decimal-mode').onchange = async (e) => {
    settings.decimalMode = e.target.value;
    await saveSettings();
    renderAll();
    toast('Decimal format updated', { type: 'success' });
  };

  $('#theme').onchange = async (e) => {
    settings.theme = e.target.value;
    await saveSettings();
    applyThemeAndAccent();
  };

  $$('.accent-dot').forEach((btn) => {
    btn.onclick = async () => {
      settings.accent = btn.dataset.accent;
      await saveSettings();
      applyThemeAndAccent();
      toast(`Accent theme updated`, { type: 'success' });
    };
  });

  // Settings Data Actions
  $$('[data-action]').forEach((btn) => {
    btn.onclick = () => handleDataAction(btn.dataset.action);
  });

  // Backup & Restore
  $('#btn-backup-now').onclick = async () => {
    await createAutoBackup();
    updateBackupStatusUI();
    toast('Local snapshot backup created', { type: 'success' });
  };

  $('#btn-restore-auto').onclick = async () => {
    try {
      const confirmed = await confirmModal(
        'Restore from auto-backup?',
        'This will replace your current data with the latest local automatic backup.',
        'Restore'
      );
      if (!confirmed) return;
      await restoreAutoBackup();
      await handleTxChange();
      toast('Restored from automatic backup', { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };

  $('#import-file').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.transactions)) {
        throw new Error('Not a valid Ledger JSON backup');
      }
      await replaceAll(parsed);
      await reloadData();
      await materializeRecurring();
      renderAll();
      toast('Backup imported successfully', { type: 'success' });
    } catch (err) {
      toast('Invalid backup file: ' + err.message, { type: 'error' });
    }
    e.target.value = '';
  };

  $('#btn-replay-tour').onclick = () => showOnboardingModal();
  $('#btn-show-shortcuts').onclick = () => showKeyboardShortcutsModal();
  $('#shortcuts-btn').onclick = () => showKeyboardShortcutsModal();
}

/**
 * Phase 9: Keyboard Shortcuts
 */
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrl = isMac ? e.metaKey : e.ctrlKey;
    const tag = (e.target.tagName || '').toLowerCase();
    const isInput = tag === 'input' || tag === 'select' || tag === 'textarea';

    // Escape: close modal
    if (e.key === 'Escape') {
      const modalRoot = $('#modal-root');
      if (modalRoot && modalRoot.children.length > 0) {
        modalRoot.innerHTML = '';
        return;
      }
      if (selectedTxId) {
        selectedTxId = null;
        renderHistory();
        return;
      }
    }

    // Ctrl + N: New transaction
    if (ctrl && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      editingTx = null;
      setPage('add');
      setTimeout(() => $('#amount')?.focus(), 80);
      return;
    }

    // Ctrl + F: Search
    if (ctrl && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setPage('history');
      setTimeout(() => {
        const s = $('#search');
        if (s) { s.focus(); s.select(); }
      }, 80);
      return;
    }

    // Ctrl + Z: Undo deletion
    if (ctrl && e.key.toLowerCase() === 'z' && lastDeletedTx) {
      e.preventDefault();
      await put('transactions', lastDeletedTx);
      lastDeletedTx = null;
      await handleTxChange();
      toast('Transaction restored', { type: 'success' });
      return;
    }

    // Shift + / or ?: Help
    if (!isInput && e.key === '?') {
      e.preventDefault();
      showKeyboardShortcutsModal();
      return;
    }

    // Shortcuts when not actively typing in an input
    if (!isInput) {
      // Ctrl + D: Duplicate selected
      if (ctrl && e.key.toLowerCase() === 'd') {
        if (selectedTxId) {
          e.preventDefault();
          const target = tx.find((t) => t.id === selectedTxId);
          if (target) await handleDuplicateTx(target);
          return;
        }
      }

      // Delete: Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTxId) {
          e.preventDefault();
          const target = tx.find((t) => t.id === selectedTxId);
          if (target) await handleDeleteTx(target);
          return;
        }
      }

      // Arrow keys to navigate transactions in history
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const actualItems = tx.filter((t) => !t.scheduled);
        if (!actualItems.length) return;

        e.preventDefault();
        const currentIndex = actualItems.findIndex((t) => t.id === selectedTxId);

        let nextIndex = 0;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex >= 0 && currentIndex < actualItems.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : actualItems.length - 1;
        }

        selectedTxId = actualItems[nextIndex]?.id || null;
        renderHistory();

        // Scroll selected card into view
        const selectedCard = document.querySelector(`.transaction[data-id="${selectedTxId}"]`);
        if (selectedCard) {
          selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
      }

      // Enter to edit highlighted card
      if (e.key === 'Enter' && selectedTxId) {
        e.preventDefault();
        const target = tx.find((t) => t.id === selectedTxId);
        if (target) handleEditTx(target);
        return;
      }
    }
  });
}

function setupNetworkStatusMonitoring() {
  const badge = $('#offline-badge');
  const updateStatus = () => {
    if (!badge) return;
    if (navigator.onLine) {
      badge.classList.add('hidden');
    } else {
      badge.classList.remove('hidden');
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', boot);
