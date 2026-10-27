// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../contracts/TradeFirewallGate.sol";

/// @notice Deterministic LOCAL MOCK protocol-double test, NOT a fork or deployed Hideki proof.
contract LocalApprovalRegistry {
    mapping(address => mapping(address => mapping(address => mapping(bytes4 => bool)))) public grants;

    function setOperatorApprovalForPool(address pool, address operator, bytes4[] calldata selectors, bool approved) external {
        for (uint256 i; i < selectors.length; i++) {
            grants[msg.sender][pool][operator][selectors[i]] = approved;
        }
    }

    function isApprovedForPool(address owner, address pool, address operator, bytes4 selector) external view returns (bool) {
        return grants[owner][pool][operator][selector];
    }
}

contract PermissionedPool {
    LocalApprovalRegistry immutable registry;
    uint256 public calls;
    address public lastCaller;
    address public lastOwner;
    uint256 public lastQuantity;
    bytes4 public constant PLACE_ORDER_FOR = bytes4(keccak256("placeOrderFor(address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)"));

    constructor(LocalApprovalRegistry r) { registry = r; }

    function isOperatorAuthorized(address owner, address operator, bytes4 selector) external view returns (bool) {
        return registry.isApprovedForPool(owner, address(this), operator, selector);
    }

    function placeOrderFor(address owner, bool, uint64, uint256, uint256 quantity, uint64, uint8, uint8, address, uint96)
        external payable returns (bool, uint128)
    {
        if (!registry.isApprovedForPool(owner, address(this), msg.sender, PLACE_ORDER_FOR)) return (false, 0);
        lastCaller = msg.sender;
        lastOwner = owner;
        lastQuantity = quantity;
        calls++;
        return (true, uint128(calls));
    }
}

contract PermissionOwner {
    function grant(LocalApprovalRegistry registry, address pool, address operator) external {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = bytes4(keccak256("placeOrderFor(address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)"));
        registry.setOperatorApprovalForPool(pool, operator, selectors, true);
    }
}

contract LocalBot {
    function submit(TradeFirewallGate gate, TradeFirewallGate.Order calldata o) external {
        gate.submit(o);
    }

    function directPlace(PermissionedPool pool, address owner) external returns (bool, uint128) {
        return pool.placeOrderFor(owner, true, 0, 1500, 100, uint64(block.timestamp * 1e9 + 1e12), 0, 0, address(0), 0);
    }
}

contract OperatorGrantSimulationTest {
    LocalApprovalRegistry registry;
    PermissionedPool pool;
    PermissionedPool otherPool;
    PermissionOwner owner;
    LocalBot bot;
    TradeFirewallGate gate;
    bytes4 constant PLACE_ORDER_FOR = bytes4(keccak256("placeOrderFor(address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)"));

    function setUp() public {
        registry = new LocalApprovalRegistry();
        pool = new PermissionedPool(registry);
        otherPool = new PermissionedPool(registry);
        owner = new PermissionOwner();
        bot = new LocalBot();
        gate = new TradeFirewallGate(address(this), address(bot), address(owner));
        gate.configureMarket(address(pool), 100, 1_000, 2_000, true);
    }

    function order() internal view returns (TradeFirewallGate.Order memory o) {
        o = TradeFirewallGate.Order({
            pool: address(pool), isBid: true, userData: 0, price: 1500,
            quantity: 500, expireTimestampNs: uint64(block.timestamp * 1e9 + 1e12),
            orderType: 0, selfMatchingOption: 0, builder: address(0),
            builderFeeBpsTimes1k: 0, nonce: 1, deadline: block.timestamp + 100
        });
    }

    function testPersistedOwnerGrantLetsContractGateForwardButNotBotDirectly() public {
        require(!pool.isOperatorAuthorized(address(owner), address(gate), PLACE_ORDER_FOR), "premature grant");
        owner.grant(registry, address(pool), address(gate));
        require(pool.isOperatorAuthorized(address(owner), address(gate), PLACE_ORDER_FOR), "grant not persisted");
        require(!pool.isOperatorAuthorized(address(owner), address(bot), PLACE_ORDER_FOR), "bot direct grant");
        require(!otherPool.isOperatorAuthorized(address(owner), address(gate), PLACE_ORDER_FOR), "wrong pool grant");
        require(!pool.isOperatorAuthorized(address(owner), address(gate), bytes4(0xe37b444b)), "wrong selector grant");
        bot.submit(gate, order());
        require(pool.calls() == 1, "forward not accepted");
        require(pool.lastCaller() == address(gate), "bypass gate");
        require(pool.lastOwner() == address(owner), "wrong owner");
        require(pool.lastQuantity() == 100, "no clamp");
    }

    function testWithoutGrantPoolRejectsGateAndNonceRemainsUnused() public {
        try bot.submit(gate, order()) { revert("unapproved call succeeded"); }
        catch { require(!gate.usedNonces(1), "failed nonce consumed"); }
    }

    function testDirectBotOrderIsRefusedEvenAfterGateGrant() public {
        owner.grant(registry, address(pool), address(gate));
        require(pool.isOperatorAuthorized(address(owner), address(gate), PLACE_ORDER_FOR), "gate unapproved");
        require(!pool.isOperatorAuthorized(address(owner), address(bot), PLACE_ORDER_FOR), "bot mistakenly approved");
        (bool accepted, uint128 orderId) = bot.directPlace(pool, address(owner));
        require(!accepted && orderId == 0, "unapproved bot direct order accepted");
        require(pool.calls() == 0, "direct order recorded");
        bot.submit(gate, order());
        require(pool.calls() == 1 && pool.lastCaller() == address(gate), "gate route not accepted");
    }
}
