import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareUnsignedGateDeployment } from '../../scripts/deploy/unsigned-plan.ts';

const admin = '0x1111111111111111111111111111111111111111';
const bot = '0x2222222222222222222222222222222222222222';
const owner = '0x3333333333333333333333333333333333333333';

test('constructs an unsigned deployment request without signer or network side effects', () => {
  const plan = prepareUnsignedGateDeployment({ chainId: 50383, creationBytecode: '0x60016000', administrator: admin, bot, tradingOwner: owner });
  assert.equal(plan.kind, 'UNSIGNED_DEPLOYMENT_PLAN');
  assert.equal(plan.chainId, 50383);
  assert.equal(plan.to, null);
  assert.equal(plan.value, '0x0');
  assert.equal(plan.data, `0x60016000${admin.slice(2).padStart(64, '0')}${bot.slice(2).padStart(64, '0')}${owner.slice(2).padStart(64, '0')}`);
  assert.equal(plan.readyToBroadcast, false);
  assert.equal(plan.requiresGasAndOperatorAuthorization, true);
});

test('rejects wrong chain, invalid roles, and malformed or non-deployable bytecode', () => {
  const valid = {chainId:50383, creationBytecode:'0x60016000', administrator:admin, bot, tradingOwner:owner};
  for (const input of [
    {...valid,chainId:1},
    {...valid,administrator:'0x0'},
    {...valid,bot:admin},
    {...valid,tradingOwner:'0x0000000000000000000000000000000000000000'},
    {...valid,creationBytecode:'0x'},
    {...valid,creationBytecode:'0x000'},
    {...valid,creationBytecode:'0xzz'},
  ]) assert.throws(() => prepareUnsignedGateDeployment(input));
});
