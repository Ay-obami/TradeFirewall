const validDecisions = new Set(['ALLOW', 'RESIZE', 'BLOCK']);

export function buildSimulationEvidence(ledger) {
  if (!Array.isArray(ledger)) throw new TypeError('Expected an array of simulation records');
  for (const row of ledger) {
    if (row?.execution !== 'simulation-only') throw new Error('Only simulation-only records can be exported');
    if (!validDecisions.has(row?.result?.decision)) throw new Error('Invalid policy decision in record');
    if (!row.intent || !row.limits || typeof row.time !== 'string') throw new Error('Incomplete simulation record');
  }
  const records = structuredClone(ledger);
  const count = decision => records.filter(row => row.result.decision === decision).length;
  return {
    schema: 'tradefirewall.offline-evidence.v1',
    mode: 'OFFLINE_SIMULATION',
    proofType: 'POLICY_EVALUATION_ONLY',
    disclaimer: 'This artifact demonstrates local policy decisions only. It is not a wallet signature, network observation, order receipt, or transaction proof.',
    networkExecution: false,
    walletSigned: false,
    transactionHashes: [],
    summary: { total: records.length, allowed: count('ALLOW'), resized: count('RESIZE'), blocked: count('BLOCK') },
    records,
  };
}
