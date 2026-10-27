import { pathToFileURL } from 'node:url';
import path from 'node:path';

const HEX_QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const METHODS = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber']);

/** Keyless, read-only RPC transport. Neither endpoint nor raw RPC errors are logged. */
export function createHealthRpc(endpoint, fetcher = fetch) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('HTTPS_REQUIRED');
  return async (method, params) => {
    if (!METHODS.has(method)) throw Error('READ_ONLY_METHOD_ONLY');
    const response = await fetcher(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error('RPC_HTTP_FAILURE');
    const body = await response.json();
    if (!body || body.error || body.result === undefined) throw Error('RPC_RESULT_FAILURE');
    return body.result;
  };
}

function quantity(value) {
  if (typeof value !== 'string' || !HEX_QUANTITY.test(value)) throw Error('INVALID_RPC_QUANTITY');
  return BigInt(value);
}

/** Observability only. Healthy RPC != authenticated risk data or trading authorization. */
export async function assessRpcHealth(rpc, { nowSec = Math.floor(Date.now() / 1000), maxAgeSec = 30 } = {}) {
  const base = { mode: 'READ_ONLY_RPC_HEALTH', chainId: null, blockNumber: null, healthy: false, readyForTrading: false };
  try {
    if (!Number.isSafeInteger(nowSec) || nowSec < 0 || !Number.isSafeInteger(maxAgeSec) || maxAgeSec < 1) throw Error('BAD_CONFIG');
    const chainId = quantity(await rpc('eth_chainId', []));
    if (chainId !== 50383n) return { ...base, reason: 'WRONG_CHAIN' };
    const number = quantity(await rpc('eth_blockNumber', []));
    const raw = await rpc('eth_getBlockByNumber', [`0x${number.toString(16)}`, false]);
    if (!raw || typeof raw !== 'object' || quantity(raw.number) !== number || !HASH.test(raw.hash)) throw Error('INVALID_BLOCK');
    const blockSec = quantity(raw.timestamp);
    if (blockSec > BigInt(nowSec) || BigInt(nowSec) - blockSec > BigInt(maxAgeSec))
      return { ...base, chainId: 50383, blockNumber: number.toString(), reason: 'STALE_OR_FUTURE_BLOCK' };
    return { ...base, chainId: 50383, blockNumber: number.toString(), healthy: true, reason: 'RPC_REACHABLE_AND_HEAD_FRESH' };
  } catch {
    return { ...base, reason: 'RPC_UNAVAILABLE_OR_MALFORMED' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const endpoint = process.env.TRADEFIREWALL_PUBLIC_RPC_URL;
  if (!endpoint) {
    process.stderr.write('Health check requires TRADEFIREWALL_PUBLIC_RPC_URL (public HTTPS endpoint).\n');
    process.exitCode = 2;
  } else {
    try {
      const report = await assessRpcHealth(createHealthRpc(endpoint));
      process.stdout.write(JSON.stringify(report) + '\n');
      if (!report.healthy) process.exitCode = 1;
    } catch {
      process.stderr.write('Health check configuration invalid; endpoint withheld.\n');
      process.exitCode = 2;
    }
  }
}
