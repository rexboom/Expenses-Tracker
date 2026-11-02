// UI system: accessible modals, rich toasts, swipe-enabled timeline, and micro-interactions.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const icon = {
  Food: '🍜',
  Fuel: '⛽',
  Shopping: '🛍️',
  Business: '💼',
  Investment: '📈',
  University: '🎓',
  Bills: '🧾',
  Entertainment: '🎬',
  Health: '✚',
  Transport: '🚇',
  Gifts: '🎁',
  Salary: '💳',
  Gift: '🎁',
  Refund: '↩',
  Transfer: '⇄',
  Other: '•••',
};

export const accountIcons = {
  Cash: '💵',
  Wallet: '👛',
  Bank: '🏛️',
  CCP: '📮',
  Savings: '🏦',
  Business: '💼',
  Investment: '📈',
  Other: '💳',
};

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function format(amount, currency = 'DZD', short = false, decimalMode = 'auto') {
  const num = Number(amount) || 0;
  let fractionDigits = short ? 0 : 2;
  if (decimalMode === 'none') fractionDigits = 0;
  if (decimalMode === 'always2') fractionDigits = 2;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(num);
  } catch (_) {
    return `${currency} ${num.toFixed(fractionDigits)}`;
  }
}

let toastTimer = null;
export function toast(message, { type = 'info', actionText = null, onAction = null, duration = 3400 } = {}) {
  const el = $('#toast');
  if (!el) return;

  clearTimeout(toastTimer);

  const iconMap = {
    success: '✓',
    info: '✦',
    warning: '⚠',
    error: '✕',
  };

  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${iconMap[type] || '✦'}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    ${actionText ? `<button class="toast-action" type="button">${escapeHtml(actionText)}</button>` : ''}
  `;

  if (actionText && onAction) {
    const btn = el.querySelector('.toast-action');
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        el.classList.remove('show');
        onAction();
      };
    }
  }

  // Reflow trigger
  void el.offsetWidth;
  el.classList.add('show');

  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, duration);
}

export function confirmModal(title, text, confirmText = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    root.innerHTML = `
      <div class="modal-backdrop fade-in" id="active-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal scale-in">
          <h3 id="modal-title">${escapeHtml(title)}</h3>
          <p>${escapeHtml(text)}</p>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" data-no>Cancel</button>
            <button type="button" class="${danger ? 'danger-btn' : 'confirm'}" data-yes>${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>
    `;

    const close = (result) => {
      root.innerHTML = '';
      resolve(result);
    };

    const backdrop = $('#active-dialog-backdrop');
    if (backdrop) {
      backdrop.onclick = (e) => {
        if (e.target === backdrop) close(false);
      };
    }

    $('[data-no]', root).onclick = () => close(false);
    $('[data-yes]', root).onclick = () => close(true);

    const onKey = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close(false);
      }
    };
    document.addEventListener('keydown', onKey, { once: true });
  });
}

export function getTimelineGroups(transactions) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);
  const yesterdayStr = yDate.toISOString().slice(0, 10);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysStr = sevenDaysAgo.toISOString().slice(0, 10);

  const currentMonthStr = todayStr.slice(0, 7);

  const groups = {
    today: { id: 'today', title: 'Today', items: [], subtotal: 0 },
    yesterday: { id: 'yesterday', title: 'Yesterday', items: [], subtotal: 0 },
    last7: { id: 'last7', title: 'Last 7 days', items: [], subtotal: 0 },
    thisMonth: { id: 'thisMonth', title: 'This month', items: [], subtotal: 0 },
    months: {},
  };

  transactions.forEach((t) => {
    const net = t.type === 'income' ? t.amount : -t.amount;
    const d = t.date;

    if (d === todayStr) {
      groups.today.items.push(t);
      groups.today.subtotal += net;
    } else if (d === yesterdayStr) {
      groups.yesterday.items.push(t);
      groups.yesterday.subtotal += net;
    } else if (d > sevenDaysStr && d < yesterdayStr) {
      groups.last7.items.push(t);
      groups.last7.subtotal += net;
    } else if (d.startsWith(currentMonthStr)) {
      groups.thisMonth.items.push(t);
      groups.thisMonth.subtotal += net;
    } else {
      const monthKey = d.slice(0, 7);
      if (!groups.months[monthKey]) {
        const [y, m] = monthKey.split('-');
        const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
        const title = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(dateObj);
        groups.months[monthKey] = { id: `m-${monthKey}`, title, items: [], subtotal: 0 };
      }
      groups.months[monthKey].items.push(t);
      groups.months[monthKey].subtotal += net;
    }
  });

  const ordered = [];
  if (groups.today.items.length) ordered.push(groups.today);
  if (groups.yesterday.items.length) ordered.push(groups.yesterday);
  if (groups.last7.items.length) ordered.push(groups.last7);
  if (groups.thisMonth.items.length) ordered.push(groups.thisMonth);

  const sortedMonthKeys = Object.keys(groups.months).sort().reverse();
  for (const k of sortedMonthKeys) {
    ordered.push(groups.months[k]);
  }

  return ordered;
}

// Collapsed sections memory
const collapsedSectionIds = new Set();

export function renderTimeline(
  target,
  transactions,
  currency,
  {
    accountsMap = {},
    editable = true,
    onEdit,
    onDelete,
    onDuplicate,
    onSelect,
    selectedId = null,
    emptyMessage = 'No transactions here yet.',
    emptyAction = null,
    decimalMode = 'auto',
  } = {}
) {
  const el = $(target);
  if (!el) return;

  if (!transactions || !transactions.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-illustration">📂</div>
        <h4>${escapeHtml(emptyMessage)}</h4>
        <p>Record your expenses and earnings to take control of your financial flow.</p>
        ${emptyAction ? `<button class="primary-btn empty-cta" type="button">${escapeHtml(emptyAction.label)}</button>` : ''}
      </div>
    `;
    if (emptyAction && emptyAction.onClick) {
      const btn = el.querySelector('.empty-cta');
      if (btn) btn.onclick = emptyAction.onClick;
    }
    return;
  }

  const groups = getTimelineGroups(transactions);

  el.innerHTML = groups
    .map((g) => {
      const isCollapsed = collapsedSectionIds.has(g.id);
      const subtotalFormatted = (g.subtotal >= 0 ? '+' : '−') + format(Math.abs(g.subtotal), currency, true, decimalMode);
      const subtotalClass = g.subtotal >= 0 ? 'income' : 'expense';

      return `
      <section class="timeline-group ${isCollapsed ? 'collapsed' : ''}" data-group-id="${g.id}">
        <header class="timeline-header" role="button" tabindex="0" aria-expanded="${!isCollapsed}">
          <div class="timeline-header-left">
            <span class="timeline-chevron">▾</span>
            <h4>${escapeHtml(g.title)}</h4>
            <span class="timeline-count">${g.items.length}</span>
          </div>
          <div class="timeline-header-right">
            <span class="timeline-subtotal ${subtotalClass}">${subtotalFormatted}</span>
          </div>
        </header>
        <div class="timeline-items">
          ${g.items.map((t) => renderTransactionCard(t, currency, accountsMap, selectedId, editable, decimalMode)).join('')}
        </div>
      </section>
    `;
    })
    .join('');

  // Attach group accordion toggles
  $$('.timeline-header', el).forEach((header) => {
    const group = header.closest('.timeline-group');
    const gid = group.dataset.groupId;

    const toggle = () => {
      if (collapsedSectionIds.has(gid)) {
        collapsedSectionIds.delete(gid);
        group.classList.remove('collapsed');
        header.setAttribute('aria-expanded', 'true');
      } else {
        collapsedSectionIds.add(gid);
        group.classList.add('collapsed');
        header.setAttribute('aria-expanded', 'false');
      }
    };

    header.onclick = toggle;
    header.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };
  });

  // Attach transaction interactions & touch swipe
  $$('.transaction', el).forEach((card) => {
    const txId = card.dataset.id;
    const t = transactions.find((x) => x.id === txId);
    if (!t) return;

    if (onSelect) {
      card.onclick = (e) => {
        if (e.target.closest('.tx-menu') || e.target.closest('.swipe-action-btn')) return;
        onSelect(t);
      };
    }

    if (editable) {
      const menuBtn = card.querySelector('.tx-menu');
      if (menuBtn) {
        menuBtn.onclick = (e) => {
          e.stopPropagation();
          openTxActionsModal(t, currency, onEdit, onDelete, onDuplicate, decimalMode);
        };
      }

      // Swipe actions setup
      attachSwipeGestures(card, t, { onEdit, onDelete, onDuplicate });
    }
  });
}

function renderTransactionCard(t, currency, accountsMap, selectedId, editable, decimalMode) {
  const isSelected = selectedId === t.id;
  const isTransfer = t.isTransfer || t.category === 'Transfer';
  const displayIcon = isTransfer ? '⇄' : icon[t.category] || '•••';
  const accountName = accountsMap[t.accountId]?.name || 'Account';
  const sign = t.type === 'income' ? '+' : '−';
  const amountStr = `${sign}${format(t.amount, currency, false, decimalMode)}`;

  return `
    <article class="transaction ${isSelected ? 'selected' : ''}" data-id="${t.id}" tabindex="0" role="listitem">
      <div class="swipe-actions-left">
        <button type="button" class="swipe-action-btn edit-swipe" aria-label="Edit transaction">✏️</button>
      </div>
      <div class="transaction-content">
        <div class="tx-icon ${t.type} ${isTransfer ? 'transfer' : ''}">${displayIcon}</div>
        <div class="tx-info">
          <div class="tx-primary-line">
            <b class="tx-title">${escapeHtml(t.merchant || t.category)}${t.favorite ? ' <span class="fav-star">★</span>' : ''}</b>
            <strong class="tx-amount ${t.type}">${amountStr}</strong>
          </div>
          <div class="tx-meta-line">
            <span class="tx-account-badge">${escapeHtml(accountName)}</span>
            <span class="tx-date-time">${t.date}${t.time ? ' ' + t.time : ''}</span>
            ${t.tags ? `<span class="tx-tag">#${escapeHtml(t.tags)}</span>` : ''}
            ${t.recurrence ? `<span class="tx-recurrence">↻ ${escapeHtml(t.recurrence)}</span>` : ''}
            ${t.receipt ? `<span class="tx-receipt-badge" title="Receipt attached">📎</span>` : ''}
          </div>
          ${t.note ? `<div class="tx-note">${escapeHtml(t.note)}</div>` : ''}
        </div>
        ${editable ? `<button class="text-btn tx-menu" aria-label="Transaction options">•••</button>` : ''}
      </div>
      <div class="swipe-actions-right">
        <button type="button" class="swipe-action-btn dup-swipe" aria-label="Duplicate">📋</button>
        <button type="button" class="swipe-action-btn del-swipe" aria-label="Delete">🗑️</button>
      </div>
    </article>
  `;
}

// Mobile touch swipe gestures
function attachSwipeGestures(card, t, { onEdit, onDelete, onDuplicate }) {
  const content = card.querySelector('.transaction-content');
  if (!content) return;

  let startX = 0;
  let currentX = 0;
  let isSwiping = false;

  const leftEdit = card.querySelector('.edit-swipe');
  const rightDup = card.querySelector('.dup-swipe');
  const rightDel = card.querySelector('.del-swipe');

  if (leftEdit) leftEdit.onclick = (e) => { e.stopPropagation(); onEdit(t); };
  if (rightDup) rightDup.onclick = (e) => { e.stopPropagation(); onDuplicate(t); };
  if (rightDel) rightDel.onclick = (e) => { e.stopPropagation(); onDelete(t); };

  card.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    currentX = startX;
    isSwiping = true;
    content.style.transition = 'none';
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    // Bound swipe distance
    if (diff > 90) {
      content.style.transform = `translateX(${90 + (diff - 90) * 0.2}px)`;
    } else if (diff < -140) {
      content.style.transform = `translateX(${-140 + (diff + 140) * 0.2}px)`;
    } else {
      content.style.transform = `translateX(${diff}px)`;
    }
  }, { passive: true });

  card.addEventListener('touchend', () => {
    if (!isSwiping) return;
    isSwiping = false;
    content.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1)';
    const diff = currentX - startX;

    if (diff > 70) {
      // Swiped right -> edit
      content.style.transform = 'translateX(0)';
      onEdit(t);
    } else if (diff < -110) {
      // Swiped far left -> delete
      content.style.transform = 'translateX(0)';
      onDelete(t);
    } else {
      content.style.transform = 'translateX(0)';
    }
  });
}

function openTxActionsModal(t, currency, onEdit, onDelete, onDuplicate, decimalMode) {
  const root = $('#modal-root');
  const formattedAmount = format(t.amount, currency, false, decimalMode);
  const typeLabel = t.isTransfer ? 'Transfer' : t.type === 'income' ? 'Income' : 'Expense';

  root.innerHTML = `
    <div class="modal-backdrop fade-in" id="tx-modal-backdrop">
      <div class="modal scale-in">
        <div class="modal-header">
          <h3>${escapeHtml(t.merchant || t.category)}</h3>
          <span class="modal-tag ${t.type}">${typeLabel}</span>
        </div>
        <p class="modal-amount ${t.type}">${t.type === 'income' ? '+' : '−'}${formattedAmount}</p>
        <p class="modal-details">
          <span>Date: <b>${t.date} ${t.time || ''}</b></span><br>
          ${t.note ? `<span>Note: <b>${escapeHtml(t.note)}</b></span><br>` : ''}
          ${t.tags ? `<span>Tags: <b>${escapeHtml(t.tags)}</b></span>` : ''}
        </p>
        ${t.receipt ? `<div class="modal-receipt-preview"><img src="${t.receipt}" alt="Receipt"></div>` : ''}
        <div class="modal-actions-grid">
          <button type="button" class="btn-action" data-dup>📋 Duplicate</button>
          <button type="button" class="btn-action" data-edit>✏️ Edit</button>
          <button type="button" class="btn-action danger-btn" data-del>🗑️ Delete</button>
          <button type="button" class="btn-secondary" data-cancel>Cancel</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { root.innerHTML = ''; };

  $('#tx-modal-backdrop').onclick = (e) => {
    if (e.target.id === 'tx-modal-backdrop') close();
  };

  $('[data-cancel]', root).onclick = close;
  $('[data-dup]', root).onclick = async () => {
    close();
    await onDuplicate(t);
  };
  $('[data-edit]', root).onclick = () => {
    close();
    onEdit(t);
  };
  $('[data-del]', root).onclick = async () => {
    close();
    await onDelete(t);
  };
}

// Backward compatible helper for existing callers
export function renderTransactions(target, transactions, currency, options = {}) {
  renderTimeline(target, transactions, currency, options);
}
