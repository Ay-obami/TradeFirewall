// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Narrow dreamDEX `placeOrderFor` operator interface; contracts acting
/// as operators must be approved *by the trading wallet* for each perp pool.
interface IDreamDEXPerpPool {
    function placeOrderFor(
        address owner,
        bool isBid,
        uint64 userData,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k
    ) external payable returns (bool success, uint128 orderId);
}

/// @title TradeFirewallGate — narrow on-chain size/price safety backstop
/// @notice This is **not** the whole risk engine. Dynamic leverage, mark-price,
/// margin, loss and position checks remain the guarded executor's job.
/// Never authorize the untrusted bot directly in dreamDEX's registry.
contract TradeFirewallGate {
    struct MarketLimits {
        bool enabled;
        uint256 maxQuantityRaw;
        uint256 minPriceRaw;
        uint256 maxPriceRaw;
    }

    struct Order {
        address pool;
        bool isBid;
        uint64 userData;
        uint256 price;
        uint256 quantity;
        uint64 expireTimestampNs;
        uint8 orderType;
        uint8 selfMatchingOption;
        address builder;
        uint96 builderFeeBpsTimes1k;
        uint64 nonce;
        uint256 deadline;
    }

    address public immutable administrator;
    address public immutable bot;
    address public immutable tradingOwner;
    bool public paused;

    mapping(address => MarketLimits) public markets;
    mapping(uint64 => bool) public usedNonces;

    error NotAdministrator();
    error NotBot();
    error Paused();
    error BadParameters();
    error BadMarket();
    error PriceOutOfBounds();
    error Expired();
    error Replay();
    error PoolRejected();

    event MarketConfigured(address indexed pool, bool enabled, uint256 maxQuantityRaw, uint256 minPriceRaw, uint256 maxPriceRaw);
    event PauseChanged(bool paused);
    event OrderForwarded(address indexed pool, uint64 indexed nonce, uint256 proposedQuantity, uint256 sentQuantity, uint128 orderId);

    constructor(address admin_, address bot_, address tradingOwner_) {
        if (admin_ == address(0) || bot_ == address(0) || tradingOwner_ == address(0)) revert BadParameters();
        administrator = admin_;
        bot = bot_;
        tradingOwner = tradingOwner_;
    }

    modifier onlyAdmin() {
        if (msg.sender != administrator) revert NotAdministrator();
        _;
    }

    function configureMarket(
        address pool,
        uint256 maxQuantityRaw,
        uint256 minPriceRaw,
        uint256 maxPriceRaw,
        bool enabled
    ) external onlyAdmin {
        if (pool == address(0) || maxQuantityRaw == 0 || minPriceRaw == 0 || maxPriceRaw < minPriceRaw) {
            revert BadParameters();
        }
        markets[pool] = MarketLimits(enabled, maxQuantityRaw, minPriceRaw, maxPriceRaw);
        emit MarketConfigured(pool, enabled, maxQuantityRaw, minPriceRaw, maxPriceRaw);
    }

    function setPaused(bool value) external onlyAdmin {
        paused = value;
        emit PauseChanged(value);
    }

    /// @notice Bot may *propose* a quantity. The gate clamps it independently.
    /// No general arbitrary-call functionality is exposed to the bot.
    function submit(Order calldata o) external returns (uint128 orderId, uint256 submittedQuantity) {
        if (msg.sender != bot) revert NotBot();
        if (paused) revert Paused();
        if (o.deadline < block.timestamp || o.expireTimestampNs <= block.timestamp * 1e9) revert Expired();
        if (usedNonces[o.nonce]) revert Replay();

        MarketLimits memory limits = markets[o.pool];
        if (!limits.enabled) revert BadMarket();
        if (o.quantity == 0 || o.price == 0 || o.orderType > 3 || o.selfMatchingOption > 1 ||
            o.builder != address(0) || o.builderFeeBpsTimes1k != 0) revert BadParameters();
        if (o.price < limits.minPriceRaw || o.price > limits.maxPriceRaw) revert PriceOutOfBounds();

        uint256 size = o.quantity > limits.maxQuantityRaw ? limits.maxQuantityRaw : o.quantity;
        // Mark nonce before external call; any failure reverts this state too.
        usedNonces[o.nonce] = true;

        (bool success, uint128 returnedId) = IDreamDEXPerpPool(o.pool).placeOrderFor(
            tradingOwner, o.isBid, o.userData, o.price, size,
            o.expireTimestampNs, o.orderType, o.selfMatchingOption,
            address(0), 0
        );
        if (!success) revert PoolRejected();
        emit OrderForwarded(o.pool, o.nonce, o.quantity, size, returnedId);
        return (returnedId, size);
    }
}
