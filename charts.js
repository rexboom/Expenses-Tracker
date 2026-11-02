// Dependency-free, high-performance HTML5 Canvas chart suite.
// Offline-first, retina-sharp, responsive, and theme-adaptive.

const PALETTE = [
  '#887aff', // Violet / Brand
  '#32d7a0', // Mint / Emerald
  '#38bdf8', // Sky / Azure
  '#ff9f43', // Amber / Orange
  '#f43f5e', // Rose / Red
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#eab308', // Gold
  '#6366f1', // Indigo
];

function getThemeColors() {
  const isLight = document.documentElement.dataset.theme === 'light';
  return {
    grid: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.07)',
    text: isLight ? '#72798b' : '#8f96a8',
    axis: isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)',
    tooltipBg: isLight ? '#ffffff' : '#1c202b',
  };
}

function initCanvas(id, desiredHeight = 190) {
  const c = document.getElementById(id);
  if (!c) return null;

  const box = c.getBoundingClientRect();
  const parent = c.parentElement;
  const parentWidth = parent ? parent.getBoundingClientRect().width : 320;
  const width = Math.max(box.width || parentWidth - 32, 280);
  const height = desiredHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  c.width = Math.floor(width * dpr);
  c.height = Math.floor(height * dpr);
  c.style.width = `${width}px`;
  c.style.height = `${height}px`;

  const ctx = c.getContext('2d');
  ctx.resetTransform?.();
  ctx.scale(dpr, dpr);
  return { ctx, width, height };
}

function formatShortNum(v) {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'k';
  return Math.round(v).toString();
}

/**
 * Modern Line / Area Chart
 */
export function drawLineChart(id, values, labels, options = {}) {
  const env = initCanvas(id, options.height || 190);
  if (!env) return;
  const { ctx, width: w, height: h } = env;
  const theme = getThemeColors();

  ctx.clearRect(0, 0, w, h);
  if (!values || !values.length) {
    drawEmptyNotice(ctx, w, h, 'No data for this timeframe');
    return;
  }

  const color = options.color || '#887aff';
  const padTop = 24;
  const padBottom = 28;
  const padLeft = 36;
  const padRight = 16;
  const usableW = w - padLeft - padRight;
  const usableH = h - padTop - padBottom;

  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  // Background Gridlines
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  const gridRows = 3;
  for (let i = 0; i <= gridRows; i++) {
    const y = padTop + (usableH / gridRows) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    const labelVal = maxVal - (range / gridRows) * i;
    ctx.fillStyle = theme.text;
    ctx.font = '10px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatShortNum(labelVal), padLeft - 6, y + 3);
  }

  // Calculate points
  const points = values.map((v, i) => {
    const px = values.length === 1 ? padLeft + usableW / 2 : padLeft + (i / (values.length - 1)) * usableW;
    const py = padTop + usableH - ((v - minVal) / range) * usableH;
    return { x: px, y: py };
  });

  // Area Fill with Gradient
  const gradient = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(1, color + '05');

  ctx.beginPath();
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else {
      // Smooth bezier curves
      const prev = points[i - 1];
      const cx = (prev.x + pt.x) / 2;
      ctx.bezierCurveTo(cx, prev.y, cx, pt.y, pt.x, pt.y);
    }
  });
  ctx.lineTo(points[points.length - 1].x, padTop + usableH);
  ctx.lineTo(points[0].x, padTop + usableH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Stroke Line
  ctx.beginPath();
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else {
      const prev = points[i - 1];
      const cx = (prev.x + pt.x) / 2;
      ctx.bezierCurveTo(cx, prev.y, cx, pt.y, pt.x, pt.y);
    }
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Points & Labels
  points.forEach((pt, i) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = theme.tooltipBg;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (labels && labels[i]) {
      ctx.fillStyle = theme.text;
      ctx.font = '10px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i].slice(0, 6), pt.x, h - 8);
    }
  });
}

/**
 * Modern Bar Chart with Rounded Caps
 */
export function drawBarChart(id, values, labels, options = {}) {
  const env = initCanvas(id, options.height || 190);
  if (!env) return;
  const { ctx, width: w, height: h } = env;
  const theme = getThemeColors();

  ctx.clearRect(0, 0, w, h);
  if (!values || !values.length) {
    drawEmptyNotice(ctx, w, h, 'No data available');
    return;
  }

  const padTop = 20;
  const padBottom = 26;
  const padLeft = 36;
  const padRight = 12;
  const usableW = w - padLeft - padRight;
  const usableH = h - padTop - padBottom;

  const maxVal = Math.max(...values, 1);
  const count = values.length;
  const barWidth = Math.min(Math.max(usableW / count * 0.58, 8), 38);
  const gap = usableW / count;

  // Background Gridlines
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  const gridRows = 3;
  for (let i = 0; i <= gridRows; i++) {
    const y = padTop + (usableH / gridRows) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    const labelVal = maxVal - (maxVal / gridRows) * i;
    ctx.fillStyle = theme.text;
    ctx.font = '10px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatShortNum(labelVal), padLeft - 6, y + 3);
  }

  // Draw Bars
  values.forEach((v, i) => {
    const barHeight = Math.max((v / maxVal) * usableH, 3);
    const x = padLeft + gap * i + (gap - barWidth) / 2;
    const y = padTop + usableH - barHeight;
    const barColor = options.colors ? options.colors[i % options.colors.length] : PALETTE[i % PALETTE.length];

    ctx.fillStyle = barColor;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, barWidth, barHeight, [6, 6, 2, 2]);
    } else {
      ctx.rect(x, y, barWidth, barHeight);
    }
    ctx.fill();

    // X Axis Label
    if (labels && labels[i]) {
      ctx.fillStyle = theme.text;
      ctx.font = '10px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const labelText = labels[i].length > 7 ? labels[i].slice(0, 6) + '…' : labels[i];
      ctx.fillText(labelText, x + barWidth / 2, h - 8);
    }
  });
}

/**
 * Donut / Pie Category Chart
 */
export function drawDonutChart(id, dataMap, options = {}) {
  const env = initCanvas(id, options.height || 210);
  if (!env) return;
  const { ctx, width: w, height: h } = env;
  const theme = getThemeColors();

  ctx.clearRect(0, 0, w, h);
  const entries = Object.entries(dataMap || {}).filter(([, val]) => val > 0);

  if (!entries.length) {
    drawEmptyNotice(ctx, w, h, 'No category expenses recorded');
    return;
  }

  const total = entries.reduce((s, [, v]) => s + v, 0);
  const centerX = Math.min(w * 0.36, 120);
  const centerY = h / 2;
  const radius = Math.min(centerX - 16, centerY - 16);
  const innerRadius = radius * 0.62;

  let startAngle = -Math.PI / 2;

  entries.forEach(([label, value], i) => {
    const sliceAngle = (value / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;
    const color = PALETTE[i % PALETTE.length];

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    startAngle = endAngle;
  });

  // Center total text
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 13px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatShortNum(total), centerX, centerY + 4);

  // Legend on right
  const legendX = centerX + radius + 24;
  const itemHeight = Math.min(18, (h - 20) / Math.max(entries.length, 1));

  entries.slice(0, 7).forEach(([label, value], i) => {
    const itemY = 24 + i * itemHeight;
    const pct = Math.round((value / total) * 100);
    const color = PALETTE[i % PALETTE.length];

    // Color dot
    ctx.beginPath();
    ctx.arc(legendX, itemY - 3, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Text
    ctx.fillStyle = theme.text;
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left';
    const text = `${label} (${pct}%)`;
    ctx.fillText(text.length > 16 ? text.slice(0, 15) + '…' : text, legendX + 10, itemY);
  });
}

/**
 * Clustered Dual Bar Chart (e.g. Income vs Expenses)
 */
export function drawCompareBars(id, series1, series2, labels, s1Name = 'Income', s2Name = 'Expense') {
  const env = initCanvas(id, 190);
  if (!env) return;
  const { ctx, width: w, height: h } = env;
  const theme = getThemeColors();

  ctx.clearRect(0, 0, w, h);
  if (!series1.length && !series2.length) {
    drawEmptyNotice(ctx, w, h, 'No comparison data');
    return;
  }

  const padTop = 26;
  const padBottom = 26;
  const padLeft = 36;
  const padRight = 12;
  const usableW = w - padLeft - padRight;
  const usableH = h - padTop - padBottom;

  const maxVal = Math.max(...series1, ...series2, 1);
  const count = labels.length;
  const groupWidth = usableW / count;
  const singleBarW = Math.min(groupWidth * 0.35, 18);

  // Legend at top
  ctx.font = '10px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = '#32d7a0';
  ctx.fillRect(w - 130, 8, 8, 8);
  ctx.fillStyle = theme.text;
  ctx.fillText(s1Name, w - 116, 15);

  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(w - 70, 8, 8, 8);
  ctx.fillStyle = theme.text;
  ctx.fillText(s2Name, w - 56, 15);

  // Background Gridlines
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padTop + (usableH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    const val = maxVal - (maxVal / 3) * i;
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'right';
    ctx.fillText(formatShortNum(val), padLeft - 6, y + 3);
  }

  // Draw paired bars
  labels.forEach((lbl, i) => {
    const v1 = series1[i] || 0;
    const v2 = series2[i] || 0;
    const bh1 = Math.max((v1 / maxVal) * usableH, 2);
    const bh2 = Math.max((v2 / maxVal) * usableH, 2);

    const gx = padLeft + groupWidth * i;
    const x1 = gx + (groupWidth - singleBarW * 2 - 4) / 2;
    const x2 = x1 + singleBarW + 4;

    // Bar 1: Income
    ctx.fillStyle = '#32d7a0';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x1, padTop + usableH - bh1, singleBarW, bh1, [4, 4, 1, 1]);
    else ctx.rect(x1, padTop + usableH - bh1, singleBarW, bh1);
    ctx.fill();

    // Bar 2: Expense
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x2, padTop + usableH - bh2, singleBarW, bh2, [4, 4, 1, 1]);
    else ctx.rect(x2, padTop + usableH - bh2, singleBarW, bh2);
    ctx.fill();

    // X Axis Label
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.fillText(lbl, gx + groupWidth / 2, h - 8);
  });
}

function drawEmptyNotice(ctx, w, h, text) {
  const theme = getThemeColors();
  ctx.fillStyle = theme.text;
  ctx.font = '12px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2);
}

/**
 * Master render function called when opening Analytics or data changes.
 */
let resizeListenerAttached = false;
let lastRenderData = null;

export function renderCharts(allTx, accounts = [], investments = []) {
  lastRenderData = { allTx, accounts, investments };

  if (!resizeListenerAttached) {
    resizeListenerAttached = true;
    window.addEventListener('resize', () => {
      if (lastRenderData) {
        requestAnimationFrame(() => renderCharts(lastRenderData.allTx, lastRenderData.accounts, lastRenderData.investments));
      }
    });
  }

  // Filter out transfers from general expense / income charts
  const actualTx = allTx.filter((t) => !t.scheduled && !t.isTransfer && t.category !== 'Transfer');
  const expenses = actualTx.filter((t) => t.type === 'expense');
  const income = actualTx.filter((t) => t.type === 'income');

  // 1. Category Chart (Donut / Pie breakdown)
  const categoryTotals = {};
  expenses.forEach((t) => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });
  drawDonutChart('category-chart', categoryTotals);

  // 2. Monthly Spending Bars
  const monthsMap = {};
  actualTx.forEach((t) => {
    const k = t.date.slice(0, 7);
    monthsMap[k] = monthsMap[k] || { income: 0, expense: 0 };
    if (t.type === 'income') monthsMap[k].income += t.amount;
    else monthsMap[k].expense += t.amount;
  });

  const sortedMonths = Object.keys(monthsMap).sort().slice(-6);
  const monthLabels = sortedMonths.map((m) => {
    const [, monthNum] = m.split('-');
    const d = new Date(2024, parseInt(monthNum, 10) - 1, 1);
    return new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d);
  });

  drawBarChart('monthly-chart', sortedMonths.map((k) => monthsMap[k].expense), monthLabels, {
    colors: ['#887aff', '#ff9f43', '#38bdf8', '#f43f5e', '#32d7a0', '#a855f7'],
  });

  // 3. Cash Flow & Income vs Expenses
  drawCompareBars(
    'compare-chart',
    sortedMonths.map((k) => monthsMap[k].income),
    sortedMonths.map((k) => monthsMap[k].expense),
    monthLabels,
    'Income',
    'Spent'
  );

  // 4. Net Cash Flow Trend Line
  const netFlowValues = sortedMonths.map((k) => monthsMap[k].income - monthsMap[k].expense);
  if (document.getElementById('cashflow-chart')) {
    drawLineChart('cashflow-chart', netFlowValues, monthLabels, { color: '#32d7a0' });
  }

  // 5. Balance Progression Over Time
  let runningBalance = 0;
  const dateOrdered = [...actualTx].sort((a, b) => a.date.localeCompare(b.date));
  const balancePoints = dateOrdered.map((t) => {
    runningBalance += t.type === 'income' ? t.amount : -t.amount;
    return runningBalance;
  });
  const balanceLabels = dateOrdered.map((t) => t.date.slice(5));
  drawLineChart('balance-chart', balancePoints.slice(-25), balanceLabels.slice(-25), { color: '#38bdf8' });

  // 6. Savings Rate Trend
  const savingsRates = sortedMonths.map((k) => {
    const inc = monthsMap[k].income;
    if (!inc) return 0;
    return Math.max(0, Math.round(((inc - monthsMap[k].expense) / inc) * 100));
  });
  drawLineChart('savings-chart', savingsRates, monthLabels, { color: '#32d7a0' });

  // 7. Spending by Weekday
  const weekdays = Array(7).fill(0);
  expenses.forEach((t) => {
    const day = new Date(`${t.date}T00:00`).getDay();
    weekdays[day] += t.amount;
  });
  drawBarChart('weekday-chart', weekdays, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], {
    colors: ['#ff9f43', '#38bdf8', '#887aff', '#32d7a0', '#a855f7', '#f43f5e', '#ec4899'],
  });

  // 8. Time of Day Spending Distribution
  const timeOfDay = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  expenses.forEach((t) => {
    const hour = t.time ? parseInt(t.time.split(':')[0], 10) : 14;
    if (hour >= 6 && hour < 12) timeOfDay.Morning += t.amount;
    else if (hour >= 12 && hour < 18) timeOfDay.Afternoon += t.amount;
    else if (hour >= 18 && hour < 22) timeOfDay.Evening += t.amount;
    else timeOfDay.Night += t.amount;
  });
  if (document.getElementById('time-of-day-chart')) {
    drawBarChart(
      'time-of-day-chart',
      Object.values(timeOfDay),
      ['Morning (6-12)', 'Afternoon (12-6)', 'Evening (6-10)', 'Night (10-6)'],
      { colors: ['#ff9f43', '#38bdf8', '#887aff', '#6366f1'] }
    );
  }

  // 9. Largest Purchases
  const largest = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 6);
  drawBarChart(
    'purchases-chart',
    largest.map((t) => t.amount),
    largest.map((t) => t.merchant || t.category),
    { colors: ['#f43f5e', '#ff9f43', '#887aff', '#38bdf8', '#32d7a0', '#a855f7'] }
  );

  // 10. Top Merchants Spending Breakdown
  const merchantTotals = {};
  expenses.forEach((t) => {
    const m = (t.merchant || 'Unspecified').trim();
    merchantTotals[m] = (merchantTotals[m] || 0) + t.amount;
  });
  const topMerchants = Object.entries(merchantTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (document.getElementById('merchants-chart')) {
    drawBarChart(
      'merchants-chart',
      topMerchants.map(([, amt]) => amt),
      topMerchants.map(([m]) => m),
      { colors: ['#887aff', '#38bdf8', '#32d7a0', '#ff9f43', '#f43f5e'] }
    );
  }

  // 11. Payment Method Breakdown
  const paymentTotals = {};
  actualTx.forEach((t) => {
    const p = t.paymentMethod || 'Cash';
    paymentTotals[p] = (paymentTotals[p] || 0) + t.amount;
  });
  if (document.getElementById('payment-chart')) {
    drawDonutChart('payment-chart', paymentTotals);
  }

  // 12. Net Worth Trend (Liquid Accounts + Manual Investments)
  if (document.getElementById('networth-chart')) {
    const totalLiquid = accounts.reduce((sum, a) => {
      const txSum = allTx
        .filter((t) => t.accountId === a.id && !t.scheduled)
        .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
      return sum + (a.openingBalance || 0) + txSum;
    }, 0);
    const totalInvestments = investments.reduce((s, i) => s + (i.currentValue || 0), 0);
    const netWorth = totalLiquid + totalInvestments;

    // Show single current net worth or 6-month simulation
    drawBarChart(
      'networth-chart',
      [totalLiquid, totalInvestments, netWorth],
      ['Liquid Cash', 'Investments', 'Total Net Worth'],
      { colors: ['#38bdf8', '#ff9f43', '#32d7a0'] }
    );
  }

  // 13. Calendar Spending Heatmap (Last 35 days)
  const heatmapEl = document.getElementById('heatmap');
  if (heatmapEl) {
    const heat = {};
    expenses.forEach((t) => {
      heat[t.date] = (heat[t.date] || 0) + t.amount;
    });
    const maxDay = Math.max(...Object.values(heat), 1);
    const nowMs = Date.now();
    heatmapEl.innerHTML = Array.from({ length: 35 }, (_, i) => {
      const d = new Date(nowMs - (34 - i) * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const val = heat[dateStr] || 0;
      const opacity = val > 0 ? (0.2 + (0.8 * val) / maxDay).toFixed(2) : '0.08';
      const label = `${dateStr}: ${Math.round(val)}`;
      return `<i title="${label}" style="opacity:${opacity}" data-date="${dateStr}"></i>`;
    }).join('');
  }
}
