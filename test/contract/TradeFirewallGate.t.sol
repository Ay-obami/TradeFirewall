// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../contracts/TradeFirewallGate.sol";

contract RecordingPerpPool {
    address public lastCaller;
    address public lastOwner;
    uint256 public lastQuantity;
    uint256 public calls;

    function placeOrderFor(
        address owner, bool, uint64, uint256, uint256 quantity,
        uint64, uint8, uint8, address, uint96
    ) external payable returns (bool, uint128) {
        lastCaller = msg.sender;
        lastOwner = owner;
        lastQuantity = quantity;
        calls++;
        return (true, uint128(calls));
    }
}

contract UntrustedBot {
    function submit(TradeFirewallGate gate, TradeFirewallGate.Order calldata o) external {
        gate.submit(o);
    }
}

/// @notice A compromised bot also controls the approved pool contract.
contract ReenteringPerpPool {
    TradeFirewallGate public gate;
    TradeFirewallGate.Order private nested;
    bool public reentrySucceeded;
    uint256 public calls;

    function setGate(TradeFirewallGate g) external { gate = g; }
    function setNested(TradeFirewallGate.Order calldata o) external { nested = o; }
    function submitAsBot(TradeFirewallGate.Order calldata o) external { gate.submit(o); }

    function placeOrderFor(
        address, bool, uint64, uint256, uint256,
        uint64, uint8, uint8, address, uint96
    ) external payable returns (bool, uint128) {
        calls++;
        try gate.submit(nested) { reentrySucceeded = true; }
        catch { reentrySucceeded = false; }
        return (true, uint128(calls));
    }
}

contract RejectingPerpPool {
    function placeOrderFor(
        address, bool, uint64, uint256, uint256,
        uint64, uint8, uint8, address, uint96
    ) external payable returns (bool, uint128) { return (false, 0); }
}

contract TradeFirewallGateTest {
    TradeFirewallGate gate;
    RecordingPerpPool pool;
    UntrustedBot bot;
    address owner = address(0xBEEF);

    function setUp() public {
        bot = new UntrustedBot();
        pool = new RecordingPerpPool();
        gate = new TradeFirewallGate(address(this), address(bot), owner);
        gate.configureMarket(address(pool), 100, 1_000, 2_000, true);
    }

    function order(uint256 quantity, uint64 nonce) internal view returns (TradeFirewallGate.Order memory o) {
        o = TradeFirewallGate.Order({
            pool: address(pool), isBid: true, userData: 0, price: 1500,
            quantity: quantity, expireTimestampNs: uint64(block.timestamp * 1e9 + 1e12),
            orderType: 0, selfMatchingOption: 0, builder: address(0),
            builderFeeBpsTimes1k: 0, nonce: nonce, deadline: block.timestamp + 100
        });
    }

    function testOversizeOrderIsClampedBeforePoolSeesIt() public {
        bot.submit(gate, order(1000, 1));
        require(pool.lastQuantity() == 100, "not clamped");
        require(pool.lastCaller() == address(gate), "bypass");
        require(pool.lastOwner() == owner, "owner changed");
    }

    function testReplayRejected() public {
        bot.submit(gate, order(50, 1));
        try bot.submit(gate, order(50, 1)) { revert("replay allowed"); }
        catch { require(pool.calls() == 1, "replay hit pool"); }
    }

    function testPriceOutsideBoundsRejected() public {
        TradeFirewallGate.Order memory o = order(50, 1);
        o.price = 2_001;
        try bot.submit(gate, o) { revert("bad price allowed"); }
        catch { require(pool.calls() == 0, "bad price hit pool"); }
    }

    function testUnauthorizedCallerRejected() public {
        try gate.submit(order(50, 1)) { revert("unauthorized allowed"); }
        catch { require(pool.calls() == 0, "caller hit pool"); }
    }

    function testPauseRejected() public {
        gate.setPaused(true);
        try bot.submit(gate, order(50, 1)) { revert("paused allowed"); }
        catch { require(pool.calls() == 0, "paused hit pool"); }
    }

    function testExpiredOrderRejected() public {
        TradeFirewallGate.Order memory o = order(50, 1);
        o.deadline = block.timestamp - 1;
        try bot.submit(gate, o) { revert("expired allowed"); }
        catch { require(pool.calls() == 0, "expired hit pool"); }
    }

    function testBuilderFeeRejected() public {
        TradeFirewallGate.Order memory o = order(50, 1);
        o.builderFeeBpsTimes1k = 1;
        try bot.submit(gate, o) { revert("builder fee allowed"); }
        catch { require(pool.calls() == 0, "builder fee hit pool"); }
    }

    function testDifferentNoncesCannotEvadeCumulativeMarketBudget() public {
        bot.submit(gate, order(70, 1));
        bot.submit(gate, order(70, 2));
        require(pool.calls() == 2, "second order missing");
        require(pool.lastQuantity() == 30, "aggregate budget bypassed");
        require(gate.consumedQuantityRaw(address(pool)) == 100, "budget accounting wrong");
        try bot.submit(gate, order(1, 3)) { revert("exhausted budget accepted"); }
        catch { require(pool.calls() == 2, "exhausted budget reached pool"); }
    }

    function testReconfigurationDoesNotSilentlyResetBudget() public {
        bot.submit(gate, order(90, 1));
        gate.configureMarket(address(pool), 100, 1_000, 2_000, true);
        bot.submit(gate, order(50, 2));
        require(pool.lastQuantity() == 10, "reconfiguration reset allowance");
    }

    function testAdministratorCanExplicitlyRenewMarketAllowance() public {
        bot.submit(gate, order(100, 1));
        gate.renewMarketAllowance(address(pool));
        bot.submit(gate, order(50, 2));
        require(pool.lastQuantity() == 50, "admin renewal rejected");
    }

    function testZeroQuantityRejectedBeforePoolCall() public {
        try bot.submit(gate, order(0, 1)) { revert("zero order accepted"); }
        catch { require(pool.calls() == 0, "zero order hit pool"); }
    }

    function testInvalidPoolWithNoContractCannotConsumeNonce() public {
        address nonexistentPool = address(0x12345);
        gate.configureMarket(nonexistentPool, 100, 1_000, 2_000, true);
        TradeFirewallGate.Order memory o = order(50, 44);
        o.pool = nonexistentPool;
        try bot.submit(gate, o) { revert("EOA accepted as pool"); }
        catch { require(!gate.usedNonces(44), "failed call consumed nonce"); }
    }

    function testMaliciousPoolCannotReenterWithFreshNonce() public {
        ReenteringPerpPool evil = new ReenteringPerpPool();
        TradeFirewallGate guarded = new TradeFirewallGate(address(this), address(evil), owner);
        evil.setGate(guarded);
        guarded.configureMarket(address(evil), 100, 1_000, 2_000, true);
        guarded.setMarketGrossLimit(address(evil), 500);
        TradeFirewallGate.Order memory outer = order(10, 21);
        outer.pool = address(evil);
        TradeFirewallGate.Order memory inner = order(10, 22);
        inner.pool = address(evil);
        evil.setNested(inner);
        evil.submitAsBot(outer);
        require(evil.calls() == 1, "malicious pool executed nested order");
        require(!evil.reentrySucceeded(), "fresh nonce bypassed call stack guard");
        require(!guarded.usedNonces(22), "rejected reentry consumed nonce");
    }

    function testRejectedPoolOrderRollsBackNonceAndGrossAllowance() public {
        RejectingPerpPool rejecting = new RejectingPerpPool();
        gate.configureMarket(address(rejecting), 100, 1_000, 2_000, true);
        TradeFirewallGate.Order memory o = order(40, 40);
        o.pool = address(rejecting);
        try bot.submit(gate, o) { revert("rejected pool order accepted"); }
        catch {
            require(!gate.usedNonces(40), "rejected pool consumed nonce");
            require(gate.consumedQuantityRaw(address(rejecting)) == 0, "rejected pool consumed quota");
        }
    }
}
