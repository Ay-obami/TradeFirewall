import assert from 'node:assert/strict';
import test from 'node:test';
import {convertVerifiedPerformanceToUsd6} from '../../src/account-state/policy-units.ts';

const collateral='0x1111111111111111111111111111111111111111';
const quote={chainId:50383,collateralAddress:collateral,collateralDecimals:18,
  collateralPriceUsd6:1_000_000n,asOfBlock:300n,
  provenance:'INDEPENDENT_ORACLE_COLLATERAL_QUOTE'};

test('converts 18-decimal collateral to USD6 with conservative rounding',()=>{
  const got=convertVerifiedPerformanceToUsd6({chainId:50383,accountBlock:300n,
    expectedCollateralAddress:collateral,equityRaw:1_234_567_890_123_456_789n,
    dailyPnlRaw:-1_000_000_000_000_001n,quote});
  assert.equal(got.equityUsd6,'1234567');
  assert.equal(got.dailyPnlUsd6,'-1001');
  assert.equal(got.riskExecutable,false);
});

test('does not fabricate profits or ignore fractional losses',()=>{
  const got=convertVerifiedPerformanceToUsd6({chainId:50383,accountBlock:300n,
    expectedCollateralAddress:collateral,equityRaw:1_000_000_000_000_000_000n,
    dailyPnlRaw:-1n,quote});
  assert.equal(got.dailyPnlUsd6,'-1');
});

test('rejects stale oracle prices, wrong tokens, wrong chain, malformed values and missing proof',()=>{
  const base={chainId:50383,accountBlock:300n,expectedCollateralAddress:collateral,
    equityRaw:1_000_000_000_000_000_000n,dailyPnlRaw:-1n,quote};
  assert.throws(()=>convertVerifiedPerformanceToUsd6({...base,quote:{...quote,asOfBlock:299n}}),/STALE_COLLATERAL_PRICE/);
  assert.throws(()=>convertVerifiedPerformanceToUsd6({...base,quote:{...quote,collateralAddress:'0x2222222222222222222222222222222222222222'}}),/COLLATERAL_MISMATCH/);
  assert.throws(()=>convertVerifiedPerformanceToUsd6({...base,quote:{...quote,chainId:1}}),/WRONG_CHAIN/);
  assert.throws(()=>convertVerifiedPerformanceToUsd6({...base,quote:{...quote,provenance:'MODEL_ESTIMATE'}}),/UNVERIFIED_COLLATERAL_PRICE/);
  assert.throws(()=>convertVerifiedPerformanceToUsd6({...base,quote:{...quote,collateralPriceUsd6:0n}}),/INVALID_COLLATERAL_PRICE/);
  assert.throws(()=>convertVerifiedPerformanceToUsd6({...base,quote:{...quote,collateralDecimals:37}}),/INVALID_DECIMALS/);
});
