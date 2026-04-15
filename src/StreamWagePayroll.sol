// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StreamWagePayroll
/// @author StreamWage
/// @notice Prefunded ETH payroll protocol with pull-based worker claims.
/// @dev Supports hourly, monthly, custom interval, and trigger-based compensation models.
contract StreamWagePayroll {
    /// @notice Available worker compensation timelines.
    enum Timeline {
        /// @notice Fixed amount accrues every 1 hour.
        Hourly,
        /// @notice Fixed amount accrues every 30 days.
        Monthly,
        /// @notice Fixed amount accrues every operator-defined interval.
        Custom,
        /// @notice No time accrual; operator manually grants payable amounts.
        Trigger
    }

    /// @notice Worker payroll configuration and accounting state.
    struct Worker {
        /// @notice Whether the worker has been registered.
        bool exists;
        /// @notice Whether the worker can currently accrue/grant new earnings.
        bool active;
        /// @notice Timeline used for accrual behavior.
        Timeline timeline;
        /// @notice Payment amount denominated in wei per accrual interval.
        uint256 amountPerIntervalWei;
        /// @notice Interval length in seconds for accrual timelines.
        uint256 intervalSeconds;
        /// @notice Earned but unclaimed balance in wei.
        uint256 accruedWei;
        /// @notice Lifetime claimed amount in wei.
        uint256 totalClaimedWei;
        /// @notice Last timestamp used for accrual accounting.
        uint64 lastAccruedAt;
        /// @notice Offchain metadata (name, role, ID, URI, etc.).
        string metadata;
    }

    /// @notice Protocol owner with full privileges.
    address public owner;
    /// @notice Operator addresses allowed to manage payroll workers.
    mapping(address => bool) public admins;
    /// @notice Worker registry and payroll state keyed by worker address.
    mapping(address => Worker) public workers;

    /// @notice Reverts when caller is not owner.
    error NotOwner();
    /// @notice Reverts when caller is not owner/admin operator.
    error NotOperator();
    /// @notice Reverts when worker does not exist.
    error InvalidWorker();
    /// @notice Reverts when worker address is already registered.
    error WorkerAlreadyExists();
    /// @notice Reverts on invalid parameter combinations.
    error InvalidConfiguration();
    /// @notice Reverts when amount is zero where non-zero is required.
    error InvalidAmount();
    /// @notice Reverts when worker has no claimable funds.
    error NoClaimableBalance();
    /// @notice Reverts when treasury cannot satisfy payout.
    error InsufficientTreasury();
    /// @notice Reverts when ETH transfer fails.
    error TransferFailed();

    /// @notice Emitted when protocol ownership changes.
    /// @param previousOwner Previous owner address.
    /// @param newOwner New owner address.
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    /// @notice Emitted when an admin operator is enabled or disabled.
    /// @param admin Admin address updated.
    /// @param enabled Whether admin is enabled.
    event AdminUpdated(address indexed admin, bool enabled);
    /// @notice Emitted when ETH is deposited into treasury.
    /// @param from Funder address.
    /// @param amount Amount funded in wei.
    event TreasuryFunded(address indexed from, uint256 amount);
    /// @notice Emitted when a worker is added.
    /// @param worker Worker address.
    /// @param timeline Timeline configuration.
    /// @param amountPerIntervalWei Amount per interval in wei.
    /// @param intervalSeconds Interval duration in seconds.
    /// @param metadata Worker metadata.
    event WorkerAdded(
        address indexed worker,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 intervalSeconds,
        string metadata
    );
    /// @notice Emitted when worker configuration is updated.
    /// @param worker Worker address.
    /// @param timeline New timeline configuration.
    /// @param amountPerIntervalWei New amount per interval in wei.
    /// @param intervalSeconds New interval duration in seconds.
    /// @param active New worker active status.
    /// @param metadata New worker metadata.
    event WorkerUpdated(
        address indexed worker,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 intervalSeconds,
        bool active,
        string metadata
    );
    /// @notice Emitted when worker active status changes.
    /// @param worker Worker address.
    /// @param active New active status.
    event WorkerStatusUpdated(address indexed worker, bool active);
    /// @notice Emitted when trigger-based payment is granted.
    /// @param worker Worker address.
    /// @param amount Amount granted in wei.
    event TriggerPaymentGranted(address indexed worker, uint256 amount);
    /// @notice Emitted when funds are claimed.
    /// @param worker Worker whose earnings were paid.
    /// @param recipient Recipient address that received ETH.
    /// @param amount Amount claimed in wei.
    event Claimed(address indexed worker, address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != owner && !admins[msg.sender]) revert NotOperator();
        _;
    }

    /// @notice Initializes protocol owner.
    /// @param initialOwner Owner address.
    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidConfiguration();
        owner = initialOwner;
        emit OwnerTransferred(address(0), initialOwner);
    }

    /// @notice Accepts direct ETH deposits into treasury.
    receive() external payable {
        emit TreasuryFunded(msg.sender, msg.value);
    }

    /// @notice Funds treasury with ETH from owner/admin.
    /// @dev Callable by operators only.
    function fundTreasury() external payable onlyOperator {
        if (msg.value == 0) revert InvalidAmount();
        emit TreasuryFunded(msg.sender, msg.value);
    }

    /// @notice Transfers ownership to a new address.
    /// @param newOwner New owner address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidConfiguration();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnerTransferred(previousOwner, newOwner);
    }

    /// @notice Enables or disables an admin operator.
    /// @param admin Admin address.
    /// @param enabled Whether the admin is enabled.
    function setAdmin(address admin, bool enabled) external onlyOwner {
        if (admin == address(0)) revert InvalidConfiguration();
        admins[admin] = enabled;
        emit AdminUpdated(admin, enabled);
    }

    /// @notice Registers a new worker payroll profile.
    /// @param workerAddr Worker wallet address.
    /// @param timeline Chosen payroll timeline type.
    /// @param amountPerIntervalWei Amount in wei per interval.
    /// @param customIntervalSeconds Custom interval when timeline is Custom.
    /// @param metadata Worker metadata blob/string.
    function addWorker(
        address workerAddr,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 customIntervalSeconds,
        string calldata metadata
    ) external onlyOperator {
        if (workerAddr == address(0)) revert InvalidConfiguration();
        if (workers[workerAddr].exists) revert WorkerAlreadyExists();

        uint256 intervalSeconds = _resolveInterval(timeline, customIntervalSeconds);
        if (timeline != Timeline.Trigger && amountPerIntervalWei == 0) revert InvalidAmount();

        workers[workerAddr] = Worker({
            exists: true,
            active: true,
            timeline: timeline,
            amountPerIntervalWei: amountPerIntervalWei,
            intervalSeconds: intervalSeconds,
            accruedWei: 0,
            totalClaimedWei: 0,
            lastAccruedAt: uint64(block.timestamp),
            metadata: metadata
        });

        emit WorkerAdded(workerAddr, timeline, amountPerIntervalWei, intervalSeconds, metadata);
    }

    /// @notice Updates worker payroll configuration while preserving accrued earnings.
    /// @param workerAddr Worker wallet address.
    /// @param timeline Updated timeline type.
    /// @param amountPerIntervalWei Updated amount per interval in wei.
    /// @param customIntervalSeconds Updated custom interval when timeline is Custom.
    /// @param active Updated active status.
    /// @param metadata Updated worker metadata.
    function updateWorker(
        address workerAddr,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 customIntervalSeconds,
        bool active,
        string calldata metadata
    ) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();

        _accrue(worker);

        uint256 intervalSeconds = _resolveInterval(timeline, customIntervalSeconds);
        if (timeline != Timeline.Trigger && amountPerIntervalWei == 0) revert InvalidAmount();

        worker.timeline = timeline;
        worker.amountPerIntervalWei = amountPerIntervalWei;
        worker.intervalSeconds = intervalSeconds;
        worker.active = active;
        worker.metadata = metadata;
        worker.lastAccruedAt = uint64(block.timestamp);

        emit WorkerUpdated(workerAddr, timeline, amountPerIntervalWei, intervalSeconds, active, metadata);
    }

    /// @notice Activates or deactivates worker accrual.
    /// @param workerAddr Worker wallet address.
    /// @param active New active status.
    function setWorkerStatus(address workerAddr, bool active) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();

        _accrue(worker);
        worker.active = active;
        worker.lastAccruedAt = uint64(block.timestamp);

        emit WorkerStatusUpdated(workerAddr, active);
    }

    /// @notice Grants claimable funds for trigger-based workers.
    /// @param workerAddr Worker wallet address.
    /// @param amountWei Amount to grant in wei.
    function grantTriggerPayment(address workerAddr, uint256 amountWei) external onlyOperator {
        if (amountWei == 0) revert InvalidAmount();
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        if (worker.timeline != Timeline.Trigger) revert InvalidConfiguration();
        if (!worker.active) revert InvalidConfiguration();

        worker.accruedWei += amountWei;
        emit TriggerPaymentGranted(workerAddr, amountWei);
    }

    /// @notice Claims caller worker's available earnings to caller.
    /// @return claimedAmount Amount paid in wei.
    function claim() external returns (uint256 claimedAmount) {
        claimedAmount = _claimTo(msg.sender, msg.sender);
    }

    /// @notice Claims caller worker's earnings to a custom recipient.
    /// @param recipient Recipient address.
    /// @return claimedAmount Amount paid in wei.
    function claimTo(address recipient) external returns (uint256 claimedAmount) {
        if (recipient == address(0)) revert InvalidConfiguration();
        claimedAmount = _claimTo(msg.sender, recipient);
    }

    /// @notice Claims a worker's earnings to a chosen recipient (operator only).
    /// @param workerAddr Worker wallet address.
    /// @param recipient Recipient address.
    /// @return claimedAmount Amount paid in wei.
    function claimFor(address workerAddr, address recipient) external onlyOperator returns (uint256 claimedAmount) {
        if (recipient == address(0)) revert InvalidConfiguration();
        claimedAmount = _claimTo(workerAddr, recipient);
    }

    /// @notice Returns current claimable amount for a worker.
    /// @param workerAddr Worker wallet address.
    /// @return Current claimable wei balance.
    function claimable(address workerAddr) external view returns (uint256) {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) return 0;

        uint256 accrued = worker.accruedWei;
        if (!worker.active || worker.timeline == Timeline.Trigger) return accrued;
        if (worker.intervalSeconds == 0) return accrued;

        uint256 elapsed = block.timestamp - uint256(worker.lastAccruedAt);
        uint256 intervals = elapsed / worker.intervalSeconds;
        if (intervals == 0) return accrued;
        return accrued + (intervals * worker.amountPerIntervalWei);
    }

    /// @dev Settles accrued funds and performs ETH transfer.
    function _claimTo(address workerAddr, address recipient) internal returns (uint256 claimedAmount) {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();

        _accrue(worker);
        claimedAmount = worker.accruedWei;
        if (claimedAmount == 0) revert NoClaimableBalance();
        if (address(this).balance < claimedAmount) revert InsufficientTreasury();

        worker.accruedWei = 0;
        worker.totalClaimedWei += claimedAmount;

        (bool ok,) = recipient.call{value: claimedAmount}("");
        if (!ok) revert TransferFailed();

        emit Claimed(workerAddr, recipient, claimedAmount);
    }

    /// @dev Accrues elapsed whole intervals into `accruedWei`.
    function _accrue(Worker storage worker) internal {
        if (!worker.active) return;
        if (worker.timeline == Timeline.Trigger) return;
        if (worker.intervalSeconds == 0) return;

        uint256 elapsed = block.timestamp - uint256(worker.lastAccruedAt);
        uint256 intervals = elapsed / worker.intervalSeconds;
        if (intervals == 0) return;

        worker.accruedWei += intervals * worker.amountPerIntervalWei;
        worker.lastAccruedAt = uint64(uint256(worker.lastAccruedAt) + (intervals * worker.intervalSeconds));
    }

    /// @dev Resolves interval seconds for timeline type.
    function _resolveInterval(Timeline timeline, uint256 customIntervalSeconds) internal pure returns (uint256) {
        if (timeline == Timeline.Hourly) return 1 hours;
        if (timeline == Timeline.Monthly) return 30 days;
        if (timeline == Timeline.Custom) {
            if (customIntervalSeconds == 0) revert InvalidConfiguration();
            return customIntervalSeconds;
        }
        if (timeline == Timeline.Trigger) return 0;
        revert InvalidConfiguration();
    }
}
