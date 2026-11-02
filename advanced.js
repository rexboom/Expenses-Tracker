// Advanced finance intelligence: Multi-accounts, Business mode, Savings goals,
// Manual investments, Smart local insights, and Financial Health Score (0-100).

import { getAll, get, put, remove } from './storage.js';
import { $, $$, toast, confirmModal, format, escapeHtml, accountIcons } from './ui.js';

export const DEFAULT_ACCOUNTS = [
  { name: 'Cash', kind: 'Cash', openingBalance: 0, color: '#32d7a0', icon: '💵' },
  { name: 'Wallet', kind: 'Wallet', openingBalance: 0, color: '#ff9f43', icon: '👛' },
  { name: 'Bank', kind: 'Bank', openingBalance: 0, color: '#38bdf8', icon: '🏛️' },
  { name: 'CCP', kind: 'CCP', openingBalance: 0, color: '#a855f7', icon: '📮' },
  { name: 'Savings', kind: 'Savings', openingBalance: 0, color: '#14b8a6', icon: '🏦' },
  { name: 'Business', kind: 'Business', openingBalance: 0, color: '#887aff', icon: '💼' },
];

export const GOAL_SUGGESTIONS = [
  { name: 'Emergency Fund', target: 200000, icon: '🛡️' },
  { name: 'New Laptop', target: 120000, icon: '💻' },
  { name: 'Vacation', target: 80000, icon: '✈️' },
  { name: 'Car', target: 1500000, icon: '🚗' },
  { name: 'Store Expansion', target: 500000, icon: '🏬' },
];

export const ASSET_TYPES = ['Inventory', 'Gold', 'Stocks', 'Crypto', 'Business', 'Real Estate', 'Manual asset'];

export async function deduplicateAccounts() {
  const allAccounts = await getAll('accounts');
  if (!allAccounts || !allAccounts.length) return [];

  const allTx = await getAll('transactions');
  const seen = new Map();
  const toRemove = [];
  const remap = new Map();

  for (const a of allAccounts) {
    const key = (a.name || '').trim().toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, a);
    } else {
      const primary = seen.get(key);
      toRemove.push(a);
      remap.set(a.id, primary.id);
      if (!primary.openingBalance && a.openingBalance) {
        primary.openingBalance = a.openingBalance;
        await put('accounts', primary);
      }
    }
  }

  if (toRemove.length > 0) {
    for (const t of allTx) {
      let changed = false;
      if (remap.has(t.accountId)) {
        t.accountId = remap.get(t.accountId);
        changed = true;
      }
      if (remap.has(t.transferTo)) {
        t.transferTo = remap.get(t.transferTo);
        changed = true;
      }
      if (remap.has(t.transferFrom)) {
        t.transferFrom = remap.get(t.transferFrom);
        changed = true;
      }
      if (changed) {
        await put('transactions', t);
      }
    }

    for (const d of toRemove) {
      await remove('accounts', d.id);
    }
  }

  return await getAll('accounts');
}

let ensurePromise = null;
export async function ensureDefaultAccounts() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    let existing = await deduplicateAccounts();
    if (existing && existing.length > 0) return existing;

    const created = [];
    for (let i = 0; i < DEFAULT_ACCOUNTS.length; i++) {
      const a = DEFAULT_ACCOUNTS[i];
      const item = {
        id: crypto.randomUUID(),
        name: a.name,
        kind: a.kind,
        openingBalance: a.openingBalance || 0,
        color: a.color || '#887aff',
        icon: a.icon || '💳',
        archived: false,
        order: i,
      };
      await put('accounts', item);
      created.push(item);
    }
    return created;
  })();

  try {
    return await ensurePromise;
  } finally {
    ensurePromise = null;
  }
}

export function computeAccountBalance(account, allTx) {
  let bal = Number(account.openingBalance) || 0;
  allTx.forEach((t) => {
    if (t.accountId === account.id && !t.scheduled) {
      if (t.type === 'income') bal += Number(t.amount) || 0;
      else if (t.type === 'expense') bal -= Number(t.amount) || 0;
    }
  });
  return bal;
}

export function isBusinessAccount(account) {
  if (!account) return false;
  return account.kind === 'Business' || (account.name && account.name.toLowerCase().includes('business'));
}

export function isBusinessTransaction(tx, accountsMap = {}) {
  if (tx.category === 'Business' || tx.category === 'Inventory') return true;
  if (tx.tags && tx.tags.toLowerCase().includes('business')) return true;
  const acc = accountsMap[tx.accountId];
  return acc ? isBusinessAccount(acc) : false;
}

/**
 * Filter transactions and accounts according to selected dashboard mode:
 * 'personal' | 'business' | 'combined'
 */
export function filterByMode(mode, transactions, accounts) {
  const accMap = {};
  accounts.forEach((a) => { accMap[a.id] = a; });

  if (mode === 'business') {
    const filteredAccounts = accounts.filter(isBusinessAccount);
    const filteredTx = transactions.filter((t) => isBusinessTransaction(t, accMap));
    return { accounts: filteredAccounts, transactions: filteredTx };
  }

  if (mode === 'personal') {
    const filteredAccounts = accounts.filter((a) => !isBusinessAccount(a));
    const filteredTx = transactions.filter((t) => !isBusinessTransaction(t, accMap));
    return { accounts: filteredAccounts, transactions: filteredTx };
  }

  // Combined: returns all
  return { accounts, transactions };
}

/**
 * Calculate specialized Business Cockpit Metrics
 */
export function getBusinessMetrics(transactions, accounts, investments = []) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonth = todayStr.slice(0, 7);
  const accMap = {};
  accounts.forEach((a) => { accMap[a.id] = a; });

  const bTx = transactions.filter((t) => !t.scheduled && isBusinessTransaction(t, accMap) && !t.isTransfer);
  const mTx = bTx.filter((t) => t.date.startsWith(currentMonth));

  const revenue = mTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = mTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netProfit = revenue - expenses;
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  const inventorySpend = mTx
    .filter((t) => t.type === 'expense' && (t.category === 'Inventory' || (t.tags && t.tags.toLowerCase().includes('inventory'))))
    .reduce((s, t) => s + t.amount, 0);

  const businessInvestments = investments.filter(
    (i) => i.type === 'Inventory' || i.type === 'Business' || (i.name && i.name.toLowerCase().includes('business'))
  );
  const investmentVal = businessInvestments.reduce((s, i) => s + (i.currentValue || 0), 0);

  const businessAccounts = accounts.filter(isBusinessAccount);
  const cashAvailable = businessAccounts.reduce((s, a) => s + computeAccountBalance(a, transactions), 0);

  return {
    revenue,
    expenses,
    netProfit,
    margin,
    inventorySpend,
    investmentVal,
    cashAvailable,
  };
}

/**
 * Render Multiple Accounts Carousel / Grid on Dashboard
 */
export function renderAccountsOverview(container, accounts, allTx, mode, currency, { onTransfer, onManage, onSelectAccount }) {
  if (!container) return;

  const seen = new Set();
  const uniqueActive = [];
  for (const a of accounts.filter((x) => !x.archived)) {
    const k = (a.name || '').trim().toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      uniqueActive.push(a);
    }
  }

  const visible =
    mode === 'business'
      ? uniqueActive.filter(isBusinessAccount)
      : mode === 'personal'
      ? uniqueActive.filter((a) => !isBusinessAccount(a))
      : uniqueActive;

  const title = mode === 'business' ? 'Business Accounts' : mode === 'personal' ? 'Personal Accounts' : 'All Accounts';

  container.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">${title.toUpperCase()}</p>
        <h3>${title}</h3>
      </div>
      <div class="head-actions">
        <button type="button" class="text-btn" id="transfer-money-btn">⇄ Transfer</button>
        <button type="button" class="text-btn" id="manage-accounts-btn">⚙ Manage</button>
      </div>
    </div>
    <div class="account-scroll">
      ${visible.length ? visible.map((a) => {
        const bal = computeAccountBalance(a, allTx);
        const iconChar = a.icon || accountIcons[a.kind] || '💳';
        return `
          <article class="account-card" data-account-id="${a.id}" role="button" tabindex="0">
            <div class="account-card-top">
              <span class="account-icon" style="background:${a.color}22; color:${a.color}">${iconChar}</span>
              <span class="account-kind-pill">${escapeHtml(a.kind)}</span>
            </div>
            <strong class="account-balance ${bal < 0 ? 'expense' : ''}">${format(bal, currency, false)}</strong>
            <small class="account-name">${escapeHtml(a.name)}</small>
          </article>
        `;
      }).join('') : '<div class="empty-inline">No active accounts in this view. <button type="button" id="inline-add-acc" class="text-btn">+ Create account</button></div>'}
    </div>
  `;

  const trBtn = $('#transfer-money-btn', container);
  if (trBtn) trBtn.onclick = onTransfer;

  const mgBtn = $('#manage-accounts-btn', container);
  if (mgBtn) mgBtn.onclick = onManage;

  const inlineAdd = $('#inline-add-acc', container);
  if (inlineAdd) inlineAdd.onclick = onManage;

  if (onSelectAccount) {
    $$('.account-card', container).forEach((card) => {
      card.onclick = () => {
        const aid = card.dataset.accountId;
        onSelectAccount(accounts.find((a) => a.id === aid));
      };
    });
  }
}

/**
 * Manage Accounts Modal (Create, Edit, Archive, Unarchive)
 */
export function openAccountManagerModal(accounts, allTx, currency, { onSave, onArchive, onUnarchive }) {
  const root = $('#modal-root');
  let isAdding = false;
  let editingAccount = null;

  function renderModal() {
    if (isAdding || editingAccount) {
      const a = editingAccount || {};
      root.innerHTML = `
        <div class="modal-backdrop fade-in" id="acc-backdrop">
          <form class="modal scale-in" id="acc-edit-form">
            <h3>${editingAccount ? 'Edit account' : 'New account'}</h3>
            <label>Account name
              <input id="acc-name" required value="${escapeHtml(a.name || '')}" placeholder="e.g. Daily Cash, CCP, Store Bank">
            </label>
            <label>Account type
              <select id="acc-kind">
                ${['Cash', 'Wallet', 'Bank', 'CCP', 'Savings', 'Business', 'Investment', 'Other']
                  .map((k) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${k}</option>`)
                  .join('')}
              </select>
            </label>
            <label>Opening balance
              <input id="acc-balance" type="number" step="0.01" value="${a.openingBalance ?? 0}" required>
            </label>
            <label>Card color
              <div class="color-picker-row">
                ${['#887aff', '#32d7a0', '#38bdf8', '#ff9f43', '#f43f5e', '#a855f7', '#14b8a6']
                  .map((c) => `
                    <label class="color-dot-opt">
                      <input type="radio" name="acc-color" value="${c}" ${(a.color || '#887aff') === c ? 'checked' : ''}>
                      <span style="background:${c}"></span>
                    </label>
                  `).join('')}
              </div>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn-secondary" id="acc-back-btn">Cancel</button>
              <button type="submit" class="confirm">${editingAccount ? 'Save changes' : 'Create account'}</button>
            </div>
          </form>
        </div>
      `;

      $('#acc-back-btn').onclick = () => {
        isAdding = false;
        editingAccount = null;
        renderModal();
      };

      $('#acc-edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const selectedColor = $('input[name="acc-color"]:checked')?.value || '#887aff';
        const updated = {
          id: a.id || crypto.randomUUID(),
          name: $('#acc-name').value.trim(),
          kind: $('#acc-kind').value,
          openingBalance: Number($('#acc-balance').value) || 0,
          color: selectedColor,
          icon: accountIcons[$('#acc-kind').value] || '💳',
          archived: !!a.archived,
          order: a.order ?? accounts.length,
        };
        await onSave(updated);
        root.innerHTML = '';
      };
      return;
    }

    // Default view: list all accounts with balance, edit, archive actions
    const seenActive = new Set();
    const active = [];
    for (const a of accounts.filter((x) => !x.archived)) {
      const k = (a.name || '').trim().toLowerCase();
      if (!seenActive.has(k)) {
        seenActive.add(k);
        active.push(a);
      }
    }

    const seenArch = new Set();
    const archived = [];
    for (const a of accounts.filter((x) => x.archived)) {
      const k = (a.name || '').trim().toLowerCase();
      if (!seenArch.has(k)) {
        seenArch.add(k);
        archived.push(a);
      }
    }

    root.innerHTML = `
      <div class="modal-backdrop fade-in" id="acc-backdrop">
        <div class="modal modal-lg scale-in">
          <div class="modal-header">
            <h3>Manage Accounts</h3>
            <button type="button" class="primary-small" id="btn-add-acc">+ New account</button>
          </div>
          <p class="modal-subtitle">Organize your cash, bank vaults, CCP, and business balances.</p>

          <div class="acc-list-scroll">
            <h4 class="subhead">Active accounts (${active.length})</h4>
            <div class="entity-list">
              ${active.map((a) => {
                const bal = computeAccountBalance(a, allTx);
                return `
                  <div class="account-row-item">
                    <div class="account-row-info">
                      <span class="account-icon-badge" style="background:${a.color}22; color:${a.color}">${a.icon || '💳'}</span>
                      <div>
                        <b>${escapeHtml(a.name)}</b>
                        <small>${escapeHtml(a.kind)} · ${format(bal, currency, false)}</small>
                      </div>
                    </div>
                    <div class="account-row-actions">
                      <button type="button" class="btn-text" data-edit-acc="${a.id}">Edit</button>
                      <button type="button" class="btn-text danger-text" data-arch-acc="${a.id}">Archive</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${archived.length ? `
              <h4 class="subhead" style="margin-top:16px">Archived accounts (${archived.length})</h4>
              <div class="entity-list">
                ${archived.map((a) => `
                  <div class="account-row-item muted-row">
                    <div class="account-row-info">
                      <span class="account-icon-badge">📦</span>
                      <div>
                        <b>${escapeHtml(a.name)}</b>
                        <small>Archived · ${escapeHtml(a.kind)}</small>
                      </div>
                    </div>
                    <div class="account-row-actions">
                      <button type="button" class="btn-text" data-unarch-acc="${a.id}">Restore</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="modal-actions" style="margin-top:18px">
            <button type="button" class="btn-secondary" id="btn-acc-close">Done</button>
          </div>
        </div>
      </div>
    `;

    $('#acc-backdrop').onclick = (e) => {
      if (e.target.id === 'acc-backdrop') root.innerHTML = '';
    };
    $('#btn-acc-close').onclick = () => { root.innerHTML = ''; };
    $('#btn-add-acc').onclick = () => {
      isAdding = true;
      editingAccount = null;
      renderModal();
    };

    $$('[data-edit-acc]', root).forEach((btn) => {
      btn.onclick = () => {
        editingAccount = accounts.find((a) => a.id === btn.dataset.editAcc);
        renderModal();
      };
    });

    $$('[data-arch-acc]', root).forEach((btn) => {
      btn.onclick = async () => {
        const a = accounts.find((x) => x.id === btn.dataset.archAcc);
        if (!a) return;
        const confirm = await confirmModal(`Archive ${a.name}?`, 'Transactions will stay safely in your ledger, but the account will be hidden from daily pickers.', 'Archive');
        if (confirm) {
          await onArchive(a);
          root.innerHTML = '';
        }
      };
    });

    $$('[data-unarch-acc]', root).forEach((btn) => {
      btn.onclick = async () => {
        const a = accounts.find((x) => x.id === btn.dataset.unarchAcc);
        if (a) {
          await onUnarchive(a);
          root.innerHTML = '';
        }
      };
    });
  }

  renderModal();
}

/**
 * Transfer Money Modal
 */
export function openTransferModal(accounts, currency, onTransferSuccess) {
  const seenActive = new Set();
  const active = [];
  for (const a of accounts.filter((x) => !x.archived)) {
    const k = (a.name || '').trim().toLowerCase();
    if (!seenActive.has(k)) {
      seenActive.add(k);
      active.push(a);
    }
  }

  if (active.length < 2) {
    toast('You need at least two active accounts to transfer money.', { type: 'warning' });
    return;
  }

  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop fade-in" id="transfer-backdrop">
      <form class="modal scale-in" id="transfer-form">
        <h3>Transfer money</h3>
        <p class="modal-subtitle">Move funds between accounts without affecting your income or expense stats.</p>

        <label>From account
          <select id="tr-from" required>
            ${active.map((a, i) => `<option value="${a.id}" ${i === 0 ? 'selected' : ''}>${escapeHtml(a.name)} (${a.kind})</option>`).join('')}
          </select>
        </label>

        <label>To account
          <select id="tr-to" required>
            ${active.map((a, i) => `<option value="${a.id}" ${i === 1 ? 'selected' : ''}>${escapeHtml(a.name)} (${a.kind})</option>`).join('')}
          </select>
        </label>

        <label>Amount
          <div class="amount-input">
            <span>${currency}</span>
            <input id="tr-amount" type="number" min="0.01" step="0.01" placeholder="0.00" inputmode="decimal" required>
          </div>
        </label>

        <label>Date
          <input id="tr-date" type="date" value="${new Date().toISOString().slice(0, 10)}" required>
        </label>

        <label>Transfer note
          <input id="tr-note" maxlength="100" placeholder="e.g. ATM withdrawal, CCP transfer">
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="tr-cancel">Cancel</button>
          <button type="submit" class="confirm">Complete transfer</button>
        </div>
      </form>
    </div>
  `;

  $('#transfer-backdrop').onclick = (e) => {
    if (e.target.id === 'transfer-backdrop') root.innerHTML = '';
  };
  $('#tr-cancel').onclick = () => { root.innerHTML = ''; };

  $('#transfer-form').onsubmit = async (e) => {
    e.preventDefault();
    const fromId = $('#tr-from').value;
    const toId = $('#tr-to').value;
    const amount = Number($('#tr-amount').value);
    const date = $('#tr-date').value;
    const note = $('#tr-note').value.trim();

    if (!fromId || !toId || fromId === toId) {
      toast('Please select two distinct accounts.', { type: 'warning' });
      return;
    }
    if (!amount || amount <= 0) {
      toast('Enter a positive transfer amount.', { type: 'warning' });
      return;
    }

    const fromAcc = accounts.find((a) => a.id === fromId);
    const toAcc = accounts.find((a) => a.id === toId);

    const now = new Date();
    const time = now.toTimeString().slice(0, 5);
    const [year, month] = date.split('-').map(Number);
    const linkedTxId = crypto.randomUUID();

    const baseTx = {
      date,
      time,
      month,
      year,
      category: 'Transfer',
      amount,
      paymentMethod: 'Transfer',
      isTransfer: true,
      linkedTxId,
      createdAt: now.toISOString(),
      scheduled: date > now.toISOString().slice(0, 10),
    };

    const outTx = {
      ...baseTx,
      id: crypto.randomUUID(),
      type: 'expense',
      accountId: fromId,
      merchant: `Transfer to ${toAcc.name}`,
      note: note ? `Transfer: ${note}` : `To ${toAcc.name}`,
      transferTo: toId,
    };

    const inTx = {
      ...baseTx,
      id: crypto.randomUUID(),
      type: 'income',
      accountId: toId,
      merchant: `Transfer from ${fromAcc.name}`,
      note: note ? `Transfer: ${note}` : `From ${fromAcc.name}`,
      transferFrom: fromId,
    };

    await Promise.all([put('transactions', outTx), put('transactions', inTx)]);
    root.innerHTML = '';
    toast(`Transferred ${format(amount, currency)} from ${fromAcc.name} to ${toAcc.name}`, { type: 'success' });
    if (onTransferSuccess) onTransferSuccess();
  };
}

/**
 * Phase 4: Financial Goals
 */
export function estimateGoalCompletion(goal, monthlySavings) {
  const remaining = Math.max(0, goal.target - goal.current);
  if (remaining <= 0) return { text: 'Goal achieved! 🎉', onTrack: true };

  if (goal.deadline) {
    const today = new Date();
    const deadline = new Date(goal.deadline + 'T00:00');
    const diffMonths = (deadline.getFullYear() - today.getFullYear()) * 12 + (deadline.getMonth() - today.getMonth());

    if (diffMonths <= 0) {
      return { text: 'Deadline reached', onTrack: false };
    }

    const reqMonthly = Math.round(remaining / diffMonths);
    const onTrack = monthlySavings >= reqMonthly;

    if (onTrack) {
      return { text: `On track · need ${format(reqMonthly, 'DZD', true)}/mo`, onTrack: true };
    } else {
      return { text: `Need ${format(reqMonthly, 'DZD', true)}/mo to meet deadline`, onTrack: false };
    }
  }

  // No deadline: estimate based on savings rate
  if (monthlySavings > 0) {
    const monthsNeeded = Math.ceil(remaining / monthlySavings);
    const projDate = new Date();
    projDate.setMonth(projDate.getMonth() + monthsNeeded);
    const dateFormatted = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(projDate);
    return { text: `Est. ${dateFormatted} at current pace`, onTrack: true };
  }

  return { text: 'Add regular deposits to estimate finish date', onTrack: null };
}

export function renderGoalsPanel(container, goals, allTx, currency, { onAddGoal, onUpdateGoal, onDepositGoal }) {
  if (!container) return;

  // Calculate user's average monthly savings over last 3 months
  const now = new Date();
  const past3Months = [0, 1, 2].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return d.toISOString().slice(0, 7);
  });

  const validTx = allTx.filter((t) => !t.scheduled && !t.isTransfer);
  let totalSavings = 0;
  let activeMonthCount = 0;

  past3Months.forEach((m) => {
    const mtx = validTx.filter((t) => t.date.startsWith(m));
    if (mtx.length) {
      const inc = mtx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const exp = mtx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      totalSavings += Math.max(0, inc - exp);
      activeMonthCount++;
    }
  });

  const avgMonthlySavings = activeMonthCount > 0 ? totalSavings / activeMonthCount : 0;

  container.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">FINANCIAL TARGETS</p>
        <h2>Savings Goals</h2>
      </div>
      <button type="button" class="primary-small" id="btn-new-goal">+ Add goal</button>
    </div>
    <div class="goals-list">
      ${goals.length ? goals.map((g) => {
        const pct = Math.min(100, Math.round(((g.current || 0) / Math.max(g.target, 1)) * 100));
        const est = estimateGoalCompletion(g, avgMonthlySavings);
        const color = g.color || '#32d7a0';
        const isDone = g.current >= g.target;

        return `
          <article class="goal-card glass" data-goal-id="${g.id}">
            <div class="goal-header">
              <div class="goal-title-group">
                <span class="goal-icon" style="background:${color}22; color:${color}">${g.icon || '🎯'}</span>
                <div>
                  <b class="goal-name">${escapeHtml(g.name)}</b>
                  <span class="goal-numbers">${format(g.current || 0, currency, false)} of ${format(g.target, currency, false)}</span>
                </div>
              </div>
              <div class="goal-action-btns">
                <button type="button" class="text-btn btn-deposit" data-dep-goal="${g.id}">+ Deposit</button>
                <button type="button" class="text-btn" data-edit-goal="${g.id}">Edit</button>
              </div>
            </div>

            <div class="progress ${isDone ? 'goal-done' : ''}">
              <i style="width:${pct}%; background:${color}"></i>
            </div>

            <div class="goal-footer">
              <span class="goal-pct"><b>${pct}%</b> complete</span>
              <span class="goal-est ${est.onTrack === false ? 'warn' : ''}">${escapeHtml(est.text)}</span>
            </div>
          </article>
        `;
      }).join('') : `
        <div class="empty-state">
          <div class="empty-illustration">🎯</div>
          <h4>No savings goals created</h4>
          <p>Create targets like an Emergency Fund, New Laptop, Vacation, or Store Expansion.</p>
          <button type="button" class="primary-btn" id="empty-add-goal">Create first goal</button>
        </div>
      `}
    </div>
  `;

  const addBtn = $('#btn-new-goal', container);
  if (addBtn) addBtn.onclick = onAddGoal;
  const emptyBtn = $('#empty-add-goal', container);
  if (emptyBtn) emptyBtn.onclick = onAddGoal;

  $$('[data-edit-goal]', container).forEach((btn) => {
    btn.onclick = () => {
      const g = goals.find((x) => x.id === btn.dataset.editGoal);
      if (g) onUpdateGoal(g);
    };
  });

  $$('[data-dep-goal]', container).forEach((btn) => {
    btn.onclick = () => {
      const g = goals.find((x) => x.id === btn.dataset.depGoal);
      if (g) onDepositGoal(g);
    };
  });
}

export function openGoalModal(goal, onSave, onDelete) {
  const root = $('#modal-root');
  const isEdit = !!goal;

  root.innerHTML = `
    <div class="modal-backdrop fade-in" id="goal-backdrop">
      <form class="modal scale-in" id="goal-form">
        <h3>${isEdit ? 'Edit savings goal' : 'New savings goal'}</h3>

        ${!isEdit ? `
          <div class="goal-suggestions">
            <span class="muted-label">Quick suggestions:</span>
            <div class="quick-pill-row">
              ${GOAL_SUGGESTIONS.map((s) => `
                <button type="button" class="pill-btn" data-sugg-name="${s.name}" data-sugg-target="${s.target}">
                  ${s.icon} ${s.name}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <label>Goal name
          <input id="goal-name" required value="${escapeHtml(goal?.name || '')}" placeholder="e.g. Emergency Fund">
        </label>

        <label>Target amount
          <input id="goal-target" type="number" min="1" step="0.01" required value="${goal?.target || ''}" placeholder="0.00">
        </label>

        <label>Current saved amount
          <input id="goal-current" type="number" min="0" step="0.01" required value="${goal?.current ?? 0}" placeholder="0.00">
        </label>

        <label>Target deadline (optional)
          <input id="goal-deadline" type="date" value="${goal?.deadline || ''}">
        </label>

        <div class="modal-actions">
          ${isEdit ? '<button type="button" class="btn-secondary danger-text" id="goal-delete">Delete</button>' : ''}
          <button type="button" class="btn-secondary" id="goal-cancel">Cancel</button>
          <button type="submit" class="confirm">${isEdit ? 'Save goal' : 'Create goal'}</button>
        </div>
      </form>
    </div>
  `;

  $('#goal-backdrop').onclick = (e) => {
    if (e.target.id === 'goal-backdrop') root.innerHTML = '';
  };
  $('#goal-cancel').onclick = () => { root.innerHTML = ''; };

  $$('.pill-btn', root).forEach((pill) => {
    pill.onclick = () => {
      $('#goal-name').value = pill.dataset.suggName;
      $('#goal-target').value = pill.dataset.suggTarget;
    };
  });

  if (isEdit && onDelete) {
    const delBtn = $('#goal-delete');
    if (delBtn) {
      delBtn.onclick = async () => {
        const ok = await confirmModal('Delete goal?', `Delete "${goal.name}"? Progress will be lost.`, 'Delete');
        if (ok) {
          root.innerHTML = '';
          await onDelete(goal);
        }
      };
    }
  }

  $('#goal-form').onsubmit = async (e) => {
    e.preventDefault();
    const updated = {
      id: goal?.id || crypto.randomUUID(),
      name: $('#goal-name').value.trim(),
      target: Number($('#goal-target').value) || 0,
      current: Number($('#goal-current').value) || 0,
      deadline: $('#goal-deadline').value || '',
      color: goal?.color || '#32d7a0',
      icon: goal?.icon || '🎯',
      createdAt: goal?.createdAt || new Date().toISOString(),
    };
    root.innerHTML = '';
    await onSave(updated);
  };
}

export function openGoalDepositModal(goal, accounts, currency, onDepositSuccess) {
  const root = $('#modal-root');
  const remaining = Math.max(0, goal.target - goal.current);
  const seenActive = new Set();
  const activeAccounts = [];
  for (const a of accounts.filter((x) => !x.archived)) {
    const k = (a.name || '').trim().toLowerCase();
    if (!seenActive.has(k)) {
      seenActive.add(k);
      activeAccounts.push(a);
    }
  }

  root.innerHTML = `
    <div class="modal-backdrop fade-in" id="dep-backdrop">
      <form class="modal scale-in" id="dep-form">
        <h3>Deposit to ${escapeHtml(goal.name)}</h3>
        <p class="modal-subtitle">Current: <b>${format(goal.current, currency)}</b> · Remaining: <b>${format(remaining, currency)}</b></p>

        <label>Deposit amount
          <div class="amount-input">
            <span>${currency}</span>
            <input id="dep-amount" type="number" min="0.01" step="0.01" placeholder="0.00" inputmode="decimal" required autofocus>
          </div>
        </label>

        <label>Deduct from account (optional)
          <select id="dep-account">
            <option value="">Do not create an account transaction</option>
            ${activeAccounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)} (${a.kind})</option>`).join('')}
          </select>
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="dep-cancel">Cancel</button>
          <button type="submit" class="confirm">Add funds</button>
        </div>
      </form>
    </div>
  `;

  $('#dep-backdrop').onclick = (e) => {
    if (e.target.id === 'dep-backdrop') root.innerHTML = '';
  };
  $('#dep-cancel').onclick = () => { root.innerHTML = ''; };

  $('#dep-form').onsubmit = async (e) => {
    e.preventDefault();
    const amount = Number($('#dep-amount').value);
    const accountId = $('#dep-account').value;

    if (!amount || amount <= 0) {
      toast('Enter a positive deposit amount.', { type: 'warning' });
      return;
    }

    goal.current = (goal.current || 0) + amount;
    await put('goals', goal);

    if (accountId) {
      const now = new Date();
      const tx = {
        id: crypto.randomUUID(),
        type: 'expense',
        accountId,
        category: 'Savings',
        merchant: `Goal: ${goal.name}`,
        amount,
        note: `Allocated to ${goal.name}`,
        date: now.toISOString().slice(0, 10),
        time: now.toTimeString().slice(0, 5),
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        paymentMethod: 'Transfer',
        createdAt: now.toISOString(),
      };
      await put('transactions', tx);
    }

    root.innerHTML = '';
    toast(`Deposited ${format(amount, currency)} into ${goal.name}!`, { type: 'success' });
    if (onDepositSuccess) onDepositSuccess();
  };
}

/**
 * Phase 5: Investments Tracker (No online APIs)
 */
export function renderInvestmentsPanel(container, investments, currency, { onAddAsset, onEditAsset }) {
  if (!container) return;

  const totalCost = investments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalVal = investments.reduce((s, i) => s + (Number(i.currentValue) || 0), 0);
  const totalGain = totalVal - totalCost;
  const overallRoi = totalCost > 0 ? Math.round((totalGain / totalCost) * 100) : 0;
  const isPositive = totalGain >= 0;

  container.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">PORTFOLIO & ASSETS</p>
        <h2>Investments</h2>
      </div>
      <button type="button" class="primary-small" id="btn-add-asset">+ Add asset</button>
    </div>

    <div class="portfolio-summary-card glass">
      <div class="portfolio-val-box">
        <span class="muted-label">Total Asset Value</span>
        <strong class="portfolio-headline">${format(totalVal, currency, false)}</strong>
      </div>
      <div class="portfolio-stats-row">
        <div>
          <span class="muted-label">Invested Cost</span>
          <b>${format(totalCost, currency, false)}</b>
        </div>
        <div>
          <span class="muted-label">Total Gain/Loss</span>
          <b class="${isPositive ? 'income' : 'expense'}">${isPositive ? '+' : ''}${format(totalGain, currency, false)} (${overallRoi}%)</b>
        </div>
      </div>
    </div>

    <div class="goals-list" style="margin-top:14px">
      ${investments.length ? investments.map((x) => {
        const gain = (x.currentValue || 0) - (x.amount || 0);
        const roi = x.amount > 0 ? Math.round((gain / x.amount) * 100) : 0;
        const pos = gain >= 0;

        return `
          <article class="goal-card glass" data-asset-id="${x.id}">
            <div class="goal-header">
              <div class="goal-title-group">
                <span class="account-icon-badge">📈</span>
                <div>
                  <b>${escapeHtml(x.name)}</b>
                  <small>${escapeHtml(x.type)} · Cost: ${format(x.amount, currency, false)}</small>
                </div>
              </div>
              <div class="asset-right-meta">
                <strong class="asset-curr-val">${format(x.currentValue, currency, false)}</strong>
                <span class="badge ${pos ? 'badge-income' : 'badge-expense'}">${pos ? '+' : ''}${roi}%</span>
              </div>
            </div>
            <div class="asset-footer">
              <span class="asset-gain-line ${pos ? 'income' : 'expense'}">
                ${pos ? 'Profit:' : 'Loss:'} ${pos ? '+' : ''}${format(gain, currency, false)}
              </span>
              <button type="button" class="text-btn" data-edit-asset="${x.id}">Update valuation</button>
            </div>
          </article>
        `;
      }).join('') : `
        <div class="empty-state">
          <div class="empty-illustration">💼</div>
          <h4>No investments tracked</h4>
          <p>Track your physical gold, inventory, stock funds, crypto, or business shares without connecting external accounts.</p>
          <button type="button" class="primary-btn" id="empty-add-asset">Add your first asset</button>
        </div>
      `}
    </div>
  `;

  const addBtn = $('#btn-add-asset', container);
  if (addBtn) addBtn.onclick = onAddAsset;
  const emptyBtn = $('#empty-add-asset', container);
  if (emptyBtn) emptyBtn.onclick = onAddAsset;

  $$('[data-edit-asset]', container).forEach((btn) => {
    btn.onclick = () => {
      const a = investments.find((x) => x.id === btn.dataset.editAsset);
      if (a) onEditAsset(a);
    };
  });
}

export function openInvestmentModal(asset, onSave, onDelete) {
  const root = $('#modal-root');
  const isEdit = !!asset;

  root.innerHTML = `
    <div class="modal-backdrop fade-in" id="asset-backdrop">
      <form class="modal scale-in" id="asset-form">
        <h3>${isEdit ? 'Update investment' : 'Add manual asset'}</h3>
        <p class="modal-subtitle">Private and 100% offline investment tracking.</p>

        <label>Asset name
          <input id="asset-name" required value="${escapeHtml(asset?.name || '')}" placeholder="e.g. Gold Coins, Shop Inventory, BTC, S&P 500">
        </label>

        <label>Asset type
          <select id="asset-type">
            ${ASSET_TYPES.map((t) => `<option value="${t}" ${asset?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>

        <label>Invested amount (Cost basis)
          <input id="asset-cost" type="number" min="0" step="0.01" required value="${asset?.amount ?? ''}" placeholder="0.00">
        </label>

        <label>Current valuation
          <input id="asset-val" type="number" min="0" step="0.01" required value="${asset?.currentValue ?? ''}" placeholder="0.00">
        </label>

        <label>Notes (optional)
          <input id="asset-notes" value="${escapeHtml(asset?.notes || '')}" placeholder="e.g. 50g 24k gold, 120 shirts in stock">
        </label>

        <div class="modal-actions">
          ${isEdit ? '<button type="button" class="btn-secondary danger-text" id="asset-delete">Delete</button>' : ''}
          <button type="button" class="btn-secondary" id="asset-cancel">Cancel</button>
          <button type="submit" class="confirm">${isEdit ? 'Save valuation' : 'Add asset'}</button>
        </div>
      </form>
    </div>
  `;

  $('#asset-backdrop').onclick = (e) => {
    if (e.target.id === 'asset-backdrop') root.innerHTML = '';
  };
  $('#asset-cancel').onclick = () => { root.innerHTML = ''; };

  if (isEdit && onDelete) {
    const delBtn = $('#asset-delete');
    if (delBtn) {
      delBtn.onclick = async () => {
        const ok = await confirmModal('Delete asset?', `Delete "${asset.name}" from your portfolio?`, 'Delete');
        if (ok) {
          root.innerHTML = '';
          await onDelete(asset);
        }
      };
    }
  }

  $('#asset-form').onsubmit = async (e) => {
    e.preventDefault();
    const updated = {
      id: asset?.id || crypto.randomUUID(),
      name: $('#asset-name').value.trim(),
      type: $('#asset-type').value,
      amount: Number($('#asset-cost').value) || 0,
      currentValue: Number($('#asset-val').value) || 0,
      notes: $('#asset-notes').value.trim(),
      updatedAt: new Date().toISOString(),
    };
    root.innerHTML = '';
    await onSave(updated);
  };
}

/**
 * Phase 6: Smart Local Intelligence
 */
export function generateSmartInsights(transactions, budgets, goals, mode, currency, accounts = []) {
  const insights = [];
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prevMonthDate.toISOString().slice(0, 7);

  const accMap = {};
  accounts.forEach((a) => { accMap[a.id] = a; });

  const actualTx = transactions.filter((t) => !t.scheduled && !t.isTransfer);
  const curTx = actualTx.filter((t) => t.date.startsWith(currentMonth));
  const prevTx = actualTx.filter((t) => t.date.startsWith(prevMonth));

  const curExp = curTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const prevExp = prevTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const curInc = curTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  // 1. Month-over-month trend
  if (prevExp > 0) {
    const diffPct = Math.round(((curExp - prevExp) / prevExp) * 100);
    if (diffPct <= -10) {
      insights.push({
        type: 'positive',
        icon: '📉',
        title: 'Spending Reduction',
        text: `You spent ${Math.abs(diffPct)}% less than last month. Excellent spending control!`,
      });
    } else if (diffPct >= 15) {
      insights.push({
        type: 'warning',
        icon: '📈',
        title: 'Higher Outgoing Pace',
        text: `Spending is running ${diffPct}% higher than this time last month. Check top categories.`,
      });
    }
  }

  // 2. Category level intelligence (Food, Entertainment, Fuel, etc.)
  const curCatTotals = {};
  const prevCatTotals = {};
  curTx.filter((t) => t.type === 'expense').forEach((t) => {
    curCatTotals[t.category] = (curCatTotals[t.category] || 0) + t.amount;
  });
  prevTx.filter((t) => t.type === 'expense').forEach((t) => {
    prevCatTotals[t.category] = (prevCatTotals[t.category] || 0) + t.amount;
  });

  // Food check
  if (curCatTotals.Food && prevCatTotals.Food) {
    const foodChange = Math.round(((curCatTotals.Food - prevCatTotals.Food) / prevCatTotals.Food) * 100);
    if (foodChange >= 20) {
      insights.push({
        type: 'info',
        icon: '🍜',
        title: 'Food & Dining Spike',
        text: `Food spending increased by ${foodChange}% compared to last month.`,
      });
    }
  }

  // Entertainment check
  if (curCatTotals.Entertainment && prevCatTotals.Entertainment) {
    if (curCatTotals.Entertainment >= prevCatTotals.Entertainment * 1.9) {
      insights.push({
        type: 'warning',
        icon: '🎬',
        title: 'Entertainment Spike',
        text: 'Entertainment spending has doubled compared to your previous month.',
      });
    }
  }

  // Fuel / Transport check
  if (curCatTotals.Fuel && prevCatTotals.Fuel) {
    const fuelChange = Math.round(((curCatTotals.Fuel - prevCatTotals.Fuel) / prevCatTotals.Fuel) * 100);
    if (fuelChange <= -12) {
      insights.push({
        type: 'positive',
        icon: '⛽',
        title: 'Lower Fuel Spend',
        text: `Fuel spending is ${Math.abs(fuelChange)}% lower than average. Great fuel efficiency!`,
      });
    }
  }

  // 3. Budget Trajectory (Personal accounts only)
  const totalBudget = budgets.find((b) => b.id === 'monthly-total')?.amount || 0;
  if (totalBudget > 0) {
    const day = Math.max(1, now.getDate());
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const personalCurExp = curTx
      .filter((t) => t.type === 'expense' && !isBusinessTransaction(t, accMap))
      .reduce((s, t) => s + t.amount, 0);
    const projectedSpend = (personalCurExp / day) * totalDays;

    if (projectedSpend < totalBudget * 0.9) {
      const underPct = Math.round(((totalBudget - projectedSpend) / totalBudget) * 100);
      insights.push({
        type: 'positive',
        icon: '🎯',
        title: 'Personal Budget Discipline',
        text: `You are likely to stay under your personal monthly budget by approximately ${underPct}%.`,
      });
    } else if (projectedSpend > totalBudget * 1.05) {
      const overAmt = Math.round(projectedSpend - totalBudget);
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Personal Budget Overrun Risk',
        text: `At your current daily pace, personal expenses could exceed your monthly limit by ${format(overAmt, currency, true)}.`,
      });
    }
  }

  // 4. Business Mode / Profitability Insights
  if (mode === 'business' || mode === 'combined') {
    const bExp = curTx.filter((t) => t.category === 'Business' && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const bInc = curTx.filter((t) => t.category === 'Business' && t.type === 'income').reduce((s, t) => s + t.amount, 0);
    if (bInc > bExp && bInc > 0) {
      insights.push({
        type: 'positive',
        icon: '💼',
        title: 'Business Profitability',
        text: `Business expenses generated positive savings of ${format(bInc - bExp, currency, true)} this month.`,
      });
    }
  }

  // 5. Positive Cashflow Streak
  if (curInc > curExp && curInc > 0) {
    const saved = curInc - curExp;
    const rate = Math.round((saved / curInc) * 100);
    if (rate >= 20) {
      insights.push({
        type: 'positive',
        icon: '🌱',
        title: 'High Savings Rate',
        text: `You are saving ${rate}% of your income this month (${format(saved, currency, true)} surplus).`,
      });
    }
  }

  return insights.slice(0, 4);
}

export function renderSmartInsights(container, transactions, budgets, goals, mode, currency, accounts = []) {
  if (!container) return;
  const items = generateSmartInsights(transactions, budgets, goals, mode, currency, accounts);

  if (!items.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">LOCAL INTELLIGENCE</p>
        <h3>Smart Insights</h3>
      </div>
    </div>
    <div class="insights-grid">
      ${items.map((ins) => `
        <article class="insight-card ${ins.type}">
          <span class="insight-icon">${ins.icon}</span>
          <div class="insight-content">
            <b>${escapeHtml(ins.title)}</b>
            <p>${escapeHtml(ins.text)}</p>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

/**
 * Phase 10: Financial Health Score (0-100)
 */
export function calculateHealthScore(transactions, budgets, goals, accounts = []) {
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const actualTx = transactions.filter((t) => !t.scheduled && !t.isTransfer);
  const curTx = actualTx.filter((t) => t.date.startsWith(currentMonth));

  const accMap = {};
  accounts.forEach((a) => { accMap[a.id] = a; });

  const inc = curTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = curTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const personalExp = curTx
    .filter((t) => t.type === 'expense' && !isBusinessTransaction(t, accMap))
    .reduce((s, t) => s + t.amount, 0);

  // 1. Savings Rate Factor (max 25 pts)
  let savingsScore = 12;
  const savingsRate = inc > 0 ? (inc - exp) / inc : 0;
  if (inc > 0) {
    if (savingsRate >= 0.25) savingsScore = 25;
    else if (savingsRate >= 0.15) savingsScore = 20;
    else if (savingsRate >= 0.05) savingsScore = 15;
    else if (savingsRate >= 0) savingsScore = 10;
    else savingsScore = 2;
  }

  // 2. Budget Usage Factor (max 25 pts) - strictly personal account expenses
  let budgetScore = 18;
  const totalBudget = budgets.find((b) => b.id === 'monthly-total')?.amount || 0;
  if (totalBudget > 0) {
    const day = Math.max(1, now.getDate());
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const pace = (personalExp / (totalBudget * (day / totalDays)));
    if (pace <= 0.85) budgetScore = 25;
    else if (pace <= 1.0) budgetScore = 20;
    else if (pace <= 1.15) budgetScore = 12;
    else budgetScore = 4;
  }

  // 3. Expense Stability Factor (max 15 pts)
  // Low daily variance = higher stability
  const dayCounts = {};
  curTx.filter((t) => t.type === 'expense').forEach((t) => {
    dayCounts[t.date] = (dayCounts[t.date] || 0) + t.amount;
  });
  const dailyVals = Object.values(dayCounts);
  let stabilityScore = 12;
  if (dailyVals.length > 5) {
    const avg = exp / dailyVals.length;
    const variance = dailyVals.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / dailyVals.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? stdDev / avg : 0;
    if (cv < 0.6) stabilityScore = 15;
    else if (cv < 1.0) stabilityScore = 12;
    else stabilityScore = 8;
  }

  // 4. Income Consistency Factor (max 15 pts)
  let incomeScore = 10;
  const past3Months = [0, 1, 2].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return d.toISOString().slice(0, 7);
  });
  const monthsWithIncome = past3Months.filter((m) =>
    actualTx.some((t) => t.type === 'income' && t.date.startsWith(m))
  ).length;
  if (monthsWithIncome >= 3) incomeScore = 15;
  else if (monthsWithIncome === 2) incomeScore = 12;
  else if (monthsWithIncome === 1) incomeScore = 8;
  else incomeScore = 4;

  // 5. Goal Progress Factor (max 10 pts)
  let goalScore = 5;
  if (goals.length > 0) {
    const fundedGoals = goals.filter((g) => (g.current || 0) > 0).length;
    if (fundedGoals >= goals.length) goalScore = 10;
    else if (fundedGoals > 0) goalScore = 8;
    else goalScore = 5;
  }

  // 6. Fixed Recurring Burden (max 10 pts)
  let recurringScore = 8;
  const recurringTotal = actualTx
    .filter((t) => t.recurrence && t.type === 'expense' && t.date.startsWith(currentMonth))
    .reduce((s, t) => s + t.amount, 0);
  if (inc > 0) {
    const recurringRatio = recurringTotal / inc;
    if (recurringRatio <= 0.3) recurringScore = 10;
    else if (recurringRatio <= 0.5) recurringScore = 7;
    else recurringScore = 3;
  }

  const totalScore = Math.min(100, Math.max(0, savingsScore + budgetScore + stabilityScore + incomeScore + goalScore + recurringScore));

  let tier = 'Needs attention';
  let tierColor = '#f43f5e';
  if (totalScore >= 80) {
    tier = 'Excellent';
    tierColor = '#32d7a0';
  } else if (totalScore >= 65) {
    tier = 'Good';
    tierColor = '#38bdf8';
  } else if (totalScore >= 45) {
    tier = 'Average';
    tierColor = '#ff9f43';
  }

  return {
    score: totalScore,
    tier,
    tierColor,
    factors: {
      savings: { label: 'Savings Rate', score: savingsScore, max: 25 },
      budget: { label: 'Personal Budget Usage', score: budgetScore, max: 25 },
      stability: { label: 'Expense Stability', score: stabilityScore, max: 15 },
      income: { label: 'Income Consistency', score: incomeScore, max: 15 },
      goals: { label: 'Goal Progress', score: goalScore, max: 10 },
      recurring: { label: 'Fixed Obligations', score: recurringScore, max: 10 },
    },
  };
}

export function renderHealthScore(container, transactions, budgets, goals, accounts = []) {
  if (!container) return;
  const hs = calculateHealthScore(transactions, budgets, goals, accounts);

  container.innerHTML = `
    <article class="health-score-card glass" id="health-card-trigger" role="button" tabindex="0">
      <div class="health-score-left">
        <span class="muted-label">FINANCIAL HEALTH SCORE</span>
        <div class="score-display-row">
          <strong class="health-number" style="color:${hs.tierColor}">${hs.score}</strong>
          <span class="health-max">/100</span>
          <span class="health-badge" style="background:${hs.tierColor}22; color:${hs.tierColor}">${hs.tier}</span>
        </div>
        <p class="health-summary-text">Based on savings rate, budget usage, expense stability, and goals. Tap for detailed breakdown.</p>
      </div>
      <div class="health-score-gauge">
        <svg viewBox="0 0 36 36" class="circular-chart">
          <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          <path class="circle" stroke="${hs.tierColor}" stroke-dasharray="${hs.score}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
        </svg>
      </div>
    </article>
  `;

  const card = $('#health-card-trigger', container);
  if (card) {
    card.onclick = () => openHealthScoreModal(hs);
  }
}

function openHealthScoreModal(hs) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop fade-in" id="health-backdrop">
      <div class="modal modal-lg scale-in">
        <div class="modal-header">
          <h3>Financial Health Breakdown</h3>
          <span class="badge" style="background:${hs.tierColor}22; color:${hs.tierColor}; font-size:13px; font-weight:700">${hs.tier} (${hs.score}/100)</span>
        </div>
        <p class="modal-subtitle">Your score is updated in real-time as you log transactions and maintain budgets.</p>

        <div class="health-factors-list">
          ${Object.values(hs.factors).map((f) => {
            const pct = Math.round((f.score / f.max) * 100);
            return `
              <div class="factor-row">
                <div class="factor-row-head">
                  <span>${escapeHtml(f.label)}</span>
                  <b>${f.score}/${f.max} pts</b>
                </div>
                <div class="progress"><i style="width:${pct}%; background:${hs.tierColor}"></i></div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="health-tips-card">
          <b>Actionable tips to boost your score:</b>
          <ul>
            <li>Maintain at least a 20% savings rate between monthly income and spending.</li>
            <li>Keep expenses within your monthly budget limits.</li>
            <li>Allocate regular contributions to active savings goals.</li>
          </ul>
        </div>

        <div class="modal-actions" style="margin-top:16px">
          <button type="button" class="btn-secondary" id="health-close">Close</button>
        </div>
      </div>
    </div>
  `;

  $('#health-backdrop').onclick = (e) => {
    if (e.target.id === 'health-backdrop') root.innerHTML = '';
  };
  $('#health-close').onclick = () => { root.innerHTML = ''; };
}
