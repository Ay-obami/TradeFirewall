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
}
