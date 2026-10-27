import assert from 'node:assert/strict';
import test from 'node:test';
import {createMarginBankAbiAttestor} from '../../src/account-state/bank-abi-attestation.ts';

const BANK='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const IMPL='0x78c989c9c5cd2ed68b4486373c0e4b118c8f1d5c';
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const CODEHASH='0xa13b05632ba2719745c4a6ec0651ab454f2cacca9966e585d3175db687bc5c66';
const HASH='0x'+'a'.repeat(64);
const addrword='0x'+IMPL.slice(2).padStart(64,'0');
const fixture=(override?:(method:string,params:unknown[])=>unknown)=>{
  const requests:Array<{method:string;params:unknown[]}>=[];
  const rpc=async(method:string,params:unknown[])=>{
    requests.push({method,params});
    const replaced=override?.(method,params);
    if(replaced!==undefined)return replaced;
    if(method==='eth_chainId')return '0xc4cf';
    if(method==='eth_getBlockByNumber')return {number:'0x64',hash:HASH,timestamp:'0x100'};
    if(method==='eth_getStorageAt')return addrword;
    if(method==='eth_getCode')return '0x6001';
    throw Error(`unexpected ${method}`);
  };
  return {requests,rpc,attestor:createMarginBankAbiAttestor({rpc,keccak256:(code:string)=>{
    assert.equal(code,'0x6001');return CODEHASH;
  }})};
};

test('attests deployed MarginBank EIP-1967 implementation and runtime hash at one block',async()=>{
  const {requests,attestor}=fixture();
  const result=await attestor.read({blockNumber:100n});
  assert.equal(result.marginBank,BANK);
  assert.equal(result.implementation,IMPL);
  assert.equal(result.codeHash,CODEHASH);
  assert.equal(result.blockNumber,100n);
  assert.equal(result.riskExecutable,false);
  assert.deepEqual(requests.find(x=>x.method==='eth_getStorageAt')?.params,[BANK,SLOT,'0x64']);
  assert.deepEqual(requests.find(x=>x.method==='eth_getCode')?.params,[IMPL,'0x64']);
});

test('rejects unrecognized proxy upgrade, codehash mismatch or malformed proxy storage',async()=>{
  await assert.rejects(fixture(m=>m==='eth_getStorageAt'?'0x'+'0'.repeat(24)+'1'.repeat(40):undefined).attestor.read({blockNumber:100n}),/IMPLEMENTATION_MISMATCH/);
  await assert.rejects(createMarginBankAbiAttestor({rpc:fixture().rpc,keccak256:()=> '0x'+'b'.repeat(64)}).read({blockNumber:100n}),/CODEHASH_MISMATCH/);
  await assert.rejects(fixture(m=>m==='eth_getStorageAt'?'0x1234':undefined).attestor.read({blockNumber:100n}),/INVALID_IMPLEMENTATION_SLOT/);
});

test('wrong chain, reorg and invalid selector fail closed',async()=>{
  await assert.rejects(fixture(m=>m==='eth_chainId'?'0x1':undefined).attestor.read({blockNumber:100n}),/WRONG_CHAIN/);
  let blocks=0;
  await assert.rejects(fixture(m=>{
    if(m==='eth_getBlockByNumber')return {number:'0x64',hash:'0x'+(++blocks===1?'a':'b').repeat(64),timestamp:'0x100'};
  }).attestor.read({blockNumber:100n}),/REORG_DETECTED/);
  await assert.rejects(fixture().attestor.read({blockNumber:-1n}),/INVALID_BLOCK/);
});
