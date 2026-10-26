/** Pure ABI constructor encoding. Does not load wallet material or send a transaction. */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CREATION_BYTECODE = /^0x(?:[0-9a-fA-F]{2}){2,}$/;
const ZERO = '0x0000000000000000000000000000000000000000';

type Input = {
  chainId: number;
  creationBytecode: string;
  administrator: string;
  bot: string;
  tradingOwner: string;
};

function validateAddress(value: string, name: string): string {
  if (typeof value !== 'string' || !ADDRESS.test(value) || value.toLowerCase() === ZERO) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }
  return value;
}

/**
 * Encodes TradeFirewallGate(address,address,address) constructor arguments.
 * Input bytecode must come from a trusted build of the exact audited contract;
 * this function does not prove its provenance, estimate gas, or verify privileges.
 */
export function prepareUnsignedGateDeployment(input: Input) {
  if (input.chainId !== 50383) throw new Error('WRONG_CHAIN');
  if (typeof input.creationBytecode !== 'string' ||
      !CREATION_BYTECODE.test(input.creationBytecode) ||
      /^0x0+$/i.test(input.creationBytecode)) throw new Error('INVALID_CREATION_BYTECODE');
  const admin = validateAddress(input.administrator, 'administrator');
  const bot = validateAddress(input.bot, 'bot');
  const owner = validateAddress(input.tradingOwner, 'trading_owner');
  if (admin.toLowerCase() === bot.toLowerCase()) throw new Error('BOT_MUST_NOT_BE_ADMINISTRATOR');

  const encode = (address: string) => address.slice(2).padStart(64, '0').toLowerCase();
  return Object.freeze({
    kind: 'UNSIGNED_DEPLOYMENT_PLAN' as const,
    chainId: 50383 as const,
    to: null,
    value: '0x0' as const,
    data: `0x${input.creationBytecode.slice(2)}${encode(admin)}${encode(bot)}${encode(owner)}`,
    administrator: admin,
    bot,
    tradingOwner: owner,
    readyToBroadcast: false as const,
    requiresGasAndOperatorAuthorization: true as const,
  });
}
