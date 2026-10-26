import { evaluateIntent, defaultLimits } from './demo-engine.mjs';

const $ = id => document.getElementById(id);
const form = $('intent-form');
const ledger = [];

const scenarios = {
  safe: { market: 'BTC-PERP', side: 'LONG', notional: 850, leverage: 5, slippageBps: 25, markAgeSeconds: 2, dailyLoss: 80 },
  large: { market: 'BTC-PERP', side: 'LONG', notional: 3200, leverage: 5, slippageBps: 25, markAgeSeconds: 2, dailyLoss: 80 },
  stale: { market: 'ETH-PERP', side: 'SHORT', notional: 900, leverage: 4, slippageBps: 30, markAgeSeconds: 47, dailyLoss: 80 },
  loss: { market: 'SOL-PERP', side: 'LONG', notional: 700, leverage: 3, slippageBps: 20, markAgeSeconds: 2, dailyLoss: 340 },
};

function setScenario(key) {
  const scenario = scenarios[key];
  if (!scenario) return;
  Object.entries(scenario).forEach(([field, value]) => { form.elements.namedItem(field).value = String(value); });
  document.querySelectorAll('.scenario').forEach(button => {
    button.classList.toggle('active', button.dataset.scenario === key);
    button.setAttribute('aria-pressed', String(button.dataset.scenario === key));
  });
}

function limitsFromUi() {
  const number = id => Number($(id).value);
  return {
    ...defaultLimits,
    maxOrderNotional: number('limit-order'),
    maxLeverage: number('limit-leverage'),
    maxMarkAgeSeconds: number('limit-stale'),
    maxDailyLoss: number('limit-loss'),
  };
}

function getIntent() {
  const input = key => form.elements.namedItem(key).value;
  const num = key => Number(input(key));
  return { market: input('market'), side: input('side'), notional: num('notional'), leverage: num('leverage'), slippageBps: num('slippageBps'), markAgeSeconds: num('markAgeSeconds'), dailyLoss: num('dailyLoss') };
}

function renderResult(result) {
  const area = document.querySelector('.decision-area');
  area.classList.remove('block', 'resize');
  if (result.decision === 'BLOCK') area.classList.add('block');
  if (result.decision === 'RESIZE') area.classList.add('resize');
  $('decision-symbol').textContent = result.decision === 'BLOCK' ? '×' : result.decision === 'RESIZE' ? '↘' : '✓';
  $('decision-label').textContent = result.decision;
  $('decision-explanation').textContent = result.explanation;
  $('decision-reason').textContent = result.reason;
  $('decision-notional').textContent = result.decision === 'BLOCK' ? '0 USDso' : `${result.approvedNotional.toLocaleString('en-US')} USDso`;
}

function renderLedger() {
  const count = decision => ledger.filter(row => row.result.decision === decision).length;
  const fmt = value => String(value).padStart(2, '0');
  $('stat-total').textContent = fmt(ledger.length);
  $('stat-allow').textContent = fmt(count('ALLOW'));
  $('stat-resize').textContent = fmt(count('RESIZE'));
  $('stat-block').textContent = fmt(count('BLOCK'));
  const body = $('ledger-body');
  body.replaceChildren();
  for (const row of [...ledger].reverse()) {
    const tr = document.createElement('tr');
    const values = [row.time.slice(11, 19), row.intent.market, `${row.intent.side} · ${row.intent.notional} USDso`];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    const decisionTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${row.result.decision}`;
    badge.textContent = row.result.decision;
    decisionTd.append(badge);
    tr.append(decisionTd);
    const reasonTd = document.createElement('td');
    reasonTd.textContent = row.result.reason;
    tr.append(reasonTd);
    body.append(tr);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const intent = getIntent();
  const limits = limitsFromUi();
  // Visual demo only: no signer and no SDK execution in this page.
  const result = evaluateIntent(intent, limits);
  ledger.push({ time: new Date().toISOString(), intent, limits, result, execution: 'simulation-only' });
  renderResult(result);
  renderLedger();
});

document.querySelectorAll('.scenario').forEach(button => {
  button.addEventListener('click', () => setScenario(button.dataset.scenario));
});

$('export-button').addEventListener('click', () => {
  if (!ledger.length) return;
  const content = JSON.stringify({ disclaimer: 'OFFLINE SIMULATION — not a transaction record', records: ledger }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tradefirewall-simulation-ledger.json';
  a.click();
  URL.revokeObjectURL(url);
});

setScenario('safe');
