import { evaluateIntent, defaultLimits, demoScenarios, walkthroughCases } from './demo-engine.mjs';
import { buildSimulationEvidence } from './evidence-export.mjs';

const $ = id => document.getElementById(id);
const form = $('intent-form');
const ledger = [];

function setScenario(key) {
  const scenario = demoScenarios[key];
  if (!scenario) return;
  Object.entries(scenario).forEach(([field, value]) => { form.elements.namedItem(field).value = String(value); });
  document.querySelectorAll('.scenario').forEach(button => {
    button.classList.toggle('active', button.dataset.scenario === key);
    button.setAttribute('aria-pressed', String(button.dataset.scenario === key));
  });
}

function evaluateCurrentIntent(limitsOverride) {
  const intent = getIntent();
  const limits = limitsOverride ?? limitsFromUi();
  // Visual demo only: no signer and no SDK execution in this page.
  const result = evaluateIntent(intent, limits);
  ledger.push({ time: new Date().toISOString(), intent, limits, result, execution: 'simulation-only' });
  renderResult(result);
  renderLedger();
  $('export-button').disabled = false;
  return result;
}

function limitsFromUi() {
  const number = id => Number($(id).value);
  return {
    ...defaultLimits,
    maxOrderNotional: number('limit-order'),
    maxPositionNotional: number('limit-position'),
    maxLeverage: number('limit-leverage'),
    maxMarkAgeSeconds: number('limit-stale'),
    maxDailyLoss: number('limit-loss'),
  };
}

function getIntent() {
  const input = key => form.elements.namedItem(key).value;
  const num = key => Number(input(key));
  return { market: input('market'), side: input('side'), notional: num('notional'), leverage: num('leverage'), slippageBps: num('slippageBps'), markAgeSeconds: num('markAgeSeconds'), dailyLoss: num('dailyLoss'), positionNotional: num('positionNotional'), equity: num('equity') };
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
    const approvedTd = document.createElement('td');
    approvedTd.textContent = `${row.result.approvedNotional.toLocaleString('en-US')} USDso`;
    tr.append(approvedTd);
    const reasonTd = document.createElement('td');
    reasonTd.textContent = row.result.reasons.join(', ') || row.result.reason;
    tr.append(reasonTd);
    body.append(tr);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const result = evaluateCurrentIntent();
  $('walkthrough-status').textContent = `Single simulated intent: ${result.decision} (${result.reason}). No order sent.`;
});

document.querySelectorAll('.scenario').forEach(button => {
  button.addEventListener('click', () => {
    setScenario(button.dataset.scenario);
    $('walkthrough-status').textContent = 'Preset loaded. Select Evaluate trade intent to run this simulated case.';
  });
});

$('walkthrough-button').addEventListener('click', () => {
  const outcomes = [];
  for (const key of walkthroughCases) {
    setScenario(key);
    const result = evaluateCurrentIntent(defaultLimits);
    outcomes.push(`${key}: ${result.decision} (${result.reason})`);
  }
  $('walkthrough-status').textContent = `Four simulated cases recorded — ${outcomes.join(' · ')}. All blocked orders have approved notional 0. No wallet signing or network execution.`;
  $('activity').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('export-button').addEventListener('click', () => {
  if (!ledger.length) return;
  const content = JSON.stringify(buildSimulationEvidence(ledger), null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tradefirewall-offline-policy-evidence.json';
  a.click();
  // Give the browser time to start the download before releasing its blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

setScenario('safe');
