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

    /// @notice Pending worker address migration initiated by the current worker.
    struct PendingMigration {
        /// @notice Whether a migration is currently pending.
        bool exists;
        /// @notice The proposed new address that must accept the migration.
        address newAddress;
    }

    /// @notice Protocol owner with full privileges.
    address public owner;
    /// @notice Operator addresses allowed to manage payroll workers.
    mapping(address => bool) public admins;
    /// @notice Worker registry and payroll state keyed by worker address.
    mapping(address => Worker) public workers;
    /// @notice Pending migrations keyed by current worker address.
    mapping(address => PendingMigration) public pendingMigrations;
    /// @notice Ordered list of all registered worker addresses for iteration.
    /// @dev Required because mappings are not iterable. Used by treasury runway calculations.
    address[] public workerList;
    /// @notice Runway threshold in seconds below which LowTreasury event is emitted.
    /// @dev Settable by owner. Defaults to 7 days.
    uint256 public lowTreasuryThresholdSeconds = 7 days;

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
    /// @notice Reverts when no pending migration exists.
    error NoPendingMigration();
    /// @notice Reverts when caller is not the designated new address for migration.
    error NotMigrationRecipient();
    /// @notice Reverts when a migration is already pending for this worker.
    error MigrationAlreadyPending();
    /// @notice Reverts when a withdrawal would breach the one-hour minimum payroll reserve.
    error WithdrawalExceedsSafeLimit();

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
    /// @notice Emitted when a worker initiates an address migration.
    /// @param oldAddress Current worker address initiating the migration.
    /// @param newAddress Proposed new address that must accept.
    event MigrationProposed(address indexed oldAddress, address indexed newAddress);
    /// @notice Emitted when a migration proposal is cancelled by the worker.
    /// @param oldAddress Worker address that cancelled.
    /// @param newAddress Proposed address that was rejected.
    event MigrationCancelled(address indexed oldAddress, address indexed newAddress);
    /// @notice Emitted when a migration is completed successfully.
    /// @param oldAddress Previous worker address now deleted.
    /// @param newAddress New worker address that accepted and received full state.
    event MigrationCompleted(address indexed oldAddress, address indexed newAddress);
    /// @notice Emitted per worker when their individual runway drops below the configured threshold.
    /// @dev Indexed on worker so the frontend can filter notifications per worker address.
    /// @param worker Worker address whose runway is low.
    /// @param estimatedRunwaySeconds This worker's estimated remaining funded seconds.
    event LowTreasury(address indexed worker, uint256 estimatedRunwaySeconds);
    /// @notice Emitted when the low treasury threshold is updated.
    /// @param newThresholdSeconds New threshold in seconds.
    event LowTreasuryThresholdUpdated(uint256 newThresholdSeconds);
    /// @notice Emitted when an operator withdraws excess treasury funds.
    /// @param recipient Address that received the withdrawn ETH.
    /// @param amountWei Amount withdrawn in wei.
    /// @param remainingBalance Treasury balance remaining after withdrawal.
    event ExcessWithdrawn(address indexed recipient, uint256 amountWei, uint256 remainingBalance);

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

        workerList.push(workerAddr);

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

        // Settle whole intervals earned so far under the current terms.
        _accrue(worker);

        uint256 intervalSeconds = _resolveInterval(timeline, customIntervalSeconds);
        if (timeline != Timeline.Trigger && amountPerIntervalWei == 0) revert InvalidAmount();

        // If the interval duration is changing we must settle the partial interval that has
        // accumulated since the last checkpoint â€” otherwise that remainder becomes permanently
        // misaligned under the new interval and the worker loses pro-rata earned wages.
        // We only do this when intervalSeconds is actually changing; if it stays the same
        // _accrue() already preserved the remainder correctly and no reset is needed.
        if (intervalSeconds != worker.intervalSeconds && worker.intervalSeconds > 0 && worker.active && worker.timeline != Timeline.Trigger) {
            uint256 elapsed = block.timestamp - uint256(worker.lastAccruedAt);
            uint256 remainder = elapsed % worker.intervalSeconds;
            if (remainder > 0) {
                // Pro-rata payment for the partial interval under the old rate.
                worker.accruedWei += (remainder * worker.amountPerIntervalWei) / worker.intervalSeconds;
            }
            // Safe to reset now â€” every second of earned time has been settled.
            worker.lastAccruedAt = uint64(block.timestamp);
        }
        // If interval is unchanged, do NOT touch lastAccruedAt â€” _accrue() already
        // advanced it to the correct boundary and the remainder is preserved as-is.

        worker.timeline = timeline;
        worker.amountPerIntervalWei = amountPerIntervalWei;
        worker.intervalSeconds = intervalSeconds;
        worker.active = active;
        worker.metadata = metadata;

        emit WorkerUpdated(workerAddr, timeline, amountPerIntervalWei, intervalSeconds, active, metadata);
    }

    /// @notice Activates or deactivates worker accrual.
    /// @param workerAddr Worker wallet address.
    /// @param active New active status.
    function setWorkerStatus(address workerAddr, bool active) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();

        // _accrue() already advances lastAccruedAt to the last whole interval boundary,
        // preserving the remainder. Resetting to block.timestamp here would silently
        // discard that remainder â€” so we leave lastAccruedAt untouched.
        _accrue(worker);
        worker.active = active;

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

    // --- claimFor removed intentionally ---
    // Operators should not be able to claim on behalf of workers.
    // Workers retain full autonomy over when and where their earnings are sent.

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

    // ---------------------------------------------------------------------------
    // Treasury Health
    // ---------------------------------------------------------------------------

    /// @notice Updates the runway threshold below which LowTreasury events are emitted.
    /// @dev Only callable by owner. Set to 0 to disable low treasury warnings.
    /// @param thresholdSeconds New threshold in seconds.
    function setLowTreasuryThreshold(uint256 thresholdSeconds) external onlyOwner {
        lowTreasuryThresholdSeconds = thresholdSeconds;
        emit LowTreasuryThresholdUpdated(thresholdSeconds);
    }

    /// @notice Returns the aggregate drain rate and estimated treasury runway across all active workers.
    /// @dev Pure view â€” safe to call permissionlessly by any worker or frontend at zero gas cost.
    ///      Skips inactive workers and Trigger-timeline workers since they do not continuously drain.
    /// @return totalRatePerSecond Sum of all active workers' wei drain per second.
    /// @return estimatedRunwaySeconds How many seconds the current treasury balance can sustain payroll.
    ///         Returns type(uint256).max if no workers are actively accruing (division by zero guard).
    function treasuryRunway() public view returns (uint256 totalRatePerSecond, uint256 estimatedRunwaySeconds) {
        uint256 len = workerList.length;

        for (uint256 i = 0; i < len; i++) {
            Worker storage worker = workers[workerList[i]];

            // Skip workers that do not drain the treasury continuously.
            if (!worker.active) continue;
            if (worker.timeline == Timeline.Trigger) continue;
            if (worker.intervalSeconds == 0) continue;

            // Rate per second for this worker â€” integer division, intentional truncation.
            totalRatePerSecond += worker.amountPerIntervalWei / worker.intervalSeconds;
        }

        // Guard: if no one is accruing the treasury effectively lasts forever.
        if (totalRatePerSecond == 0) return (0, type(uint256).max);

        estimatedRunwaySeconds = address(this).balance / totalRatePerSecond;
    }

    /// @notice Returns a specific worker's proportional runway given their share of the treasury drain.
    /// @dev A worker's fair share of the balance is proportional to what fraction of the total
    ///      drain rate they represent. This gives a personally meaningful runway figure rather
    ///      than a global one that ignores how many other workers are competing for the same funds.
    /// @param workerAddr Worker wallet address to query.
    /// @return estimatedRunwaySeconds Seconds of funding remaining for this specific worker.
    ///         Returns 0 if worker does not exist, is inactive, or is on Trigger timeline.
    ///         Returns type(uint256).max if worker is active but total drain rate is zero.
    function workerRunway(address workerAddr) external view returns (uint256 estimatedRunwaySeconds) {
        Worker storage worker = workers[workerAddr];

        if (!worker.exists) return 0;
        if (!worker.active) return 0;
        if (worker.timeline == Timeline.Trigger) return 0;
        if (worker.intervalSeconds == 0) return 0;

        (uint256 totalRatePerSecond,) = treasuryRunway();

        // If no one is draining the treasury this worker is effectively funded forever.
        if (totalRatePerSecond == 0) return type(uint256).max;

        uint256 workerRatePerSecond = worker.amountPerIntervalWei / worker.intervalSeconds;
        if (workerRatePerSecond == 0) return type(uint256).max;

        // Proportional share of the treasury balance belonging to this worker.
        // Calculated as: balance * (workerRate / totalRate)
        // Rearranged to avoid precision loss: (balance * workerRate) / totalRate
        uint256 workerFairShareBalance = (address(this).balance * workerRatePerSecond) / totalRatePerSecond;

        estimatedRunwaySeconds = workerFairShareBalance / workerRatePerSecond;
    }

    /// @notice Withdraws excess treasury funds that exceed the one-hour minimum payroll reserve.
    /// @dev Steps: (1) accrue all active non-Trigger workers to settle pending earnings so the
    ///      balance check reflects reality, (2) compute total drain rate and minimum reserve,
    ///      (3) revert if treasury is already underwater or withdrawal would breach the reserve,
    ///      (4) transfer and emit. Callable by operators only.
    /// @param recipient Address to receive the withdrawn ETH.
    /// @param amountWei Amount to withdraw in wei.
    function withdrawExcess(address recipient, uint256 amountWei) external onlyOperator {
        if (recipient == address(0)) revert InvalidConfiguration();
        if (amountWei == 0) revert InvalidAmount();

        uint256 len = workerList.length;
        uint256 totalRatePerSecond;

        // Step 1 & 2 â€” single loop: accrue every eligible worker and accumulate drain rate.
        // Accrual must happen first so accruedWei is fully checkpointed before the balance
        // check â€” otherwise the treasury looks artificially fuller than it truly is.
        for (uint256 i = 0; i < len; i++) {
            Worker storage w = workers[workerList[i]];

            if (!w.active) continue;
            if (w.timeline == Timeline.Trigger) continue;
            if (w.intervalSeconds == 0) continue;

            _accrue(w);
            totalRatePerSecond += w.amountPerIntervalWei / w.intervalSeconds;
        }

        // Step 3 â€” minimum reserve: one full hour of payroll for every active worker.
        uint256 minimumReserve = totalRatePerSecond * 1 hours;

        // Step 4 â€” withdrawable amount after reserving the minimum.
        // Guard against underflow first: if balance is already below the reserve
        // the treasury is underwater and no withdrawal is safe regardless of amount.
        if (address(this).balance < minimumReserve) revert WithdrawalExceedsSafeLimit();
        uint256 withdrawable = address(this).balance - minimumReserve;

        // Step 5 â€” solvency check.
        if (amountWei > withdrawable) revert WithdrawalExceedsSafeLimit();

        // Step 6 â€” transfer and emit.
        (bool ok,) = recipient.call{value: amountWei}("");
        if (!ok) revert TransferFailed();

        emit ExcessWithdrawn(recipient, amountWei, address(this).balance);
    }

    // ---------------------------------------------------------------------------
    // Worker Address Migration
    // ---------------------------------------------------------------------------

    /// @notice Step 1 â€” Current worker proposes migration to a new address.
    /// @dev Only the registered worker (msg.sender) can initiate. Stores the
    ///      proposed new address as a pending migration. The new address must
    ///      separately call acceptMigration() to prove control and complete transfer.
    /// @param newAddress The destination address that will receive full worker state.
    function proposeMigration(address newAddress) external {
        if (newAddress == address(0)) revert InvalidConfiguration();
        if (newAddress == msg.sender) revert InvalidConfiguration();

        Worker storage worker = workers[msg.sender];
        if (!worker.exists) revert InvalidWorker();

        // Prevent proposing to an address that is already a registered worker
        // to avoid colliding with an existing payroll entry.
        if (workers[newAddress].exists) revert WorkerAlreadyExists();

        // Only one pending migration per worker at a time.
        if (pendingMigrations[msg.sender].exists) revert MigrationAlreadyPending();

        pendingMigrations[msg.sender] = PendingMigration({
            exists: true,
            newAddress: newAddress
        });

        emit MigrationProposed(msg.sender, newAddress);
    }

    /// @notice Cancels a pending migration. Only callable by the worker who proposed it.
    function cancelMigration() external {
        PendingMigration storage migration = pendingMigrations[msg.sender];
        if (!migration.exists) revert NoPendingMigration();

        address proposedNew = migration.newAddress;
        delete pendingMigrations[msg.sender];

        emit MigrationCancelled(msg.sender, proposedNew);
    }

    /// @notice Step 2 â€” Proposed new address accepts the migration.
    /// @dev msg.sender must be the exact newAddress stored in the pending migration
    ///      for oldAddress. On acceptance: accrues earnings, copies full Worker state
    ///      to the new address, deletes the old entry, and clears the pending migration.
    /// @param oldAddress The current worker address that proposed the migration.
    function acceptMigration(address oldAddress) external {
        if (oldAddress == address(0)) revert InvalidConfiguration();

        PendingMigration storage migration = pendingMigrations[oldAddress];
        if (!migration.exists) revert NoPendingMigration();

        // Caller must be the exact address the worker nominated.
        if (migration.newAddress != msg.sender) revert NotMigrationRecipient();

        // Destination must not already be a registered worker.
        if (workers[msg.sender].exists) revert WorkerAlreadyExists();

        Worker storage oldWorker = workers[oldAddress];

        // Settle all pending earnings under current terms before migrating.
        _accrue(oldWorker);

        // Copy entire Worker state to new address.
        workers[msg.sender] = Worker({
            exists: true,
            active: oldWorker.active,
            timeline: oldWorker.timeline,
            amountPerIntervalWei: oldWorker.amountPerIntervalWei,
            intervalSeconds: oldWorker.intervalSeconds,
            accruedWei: oldWorker.accruedWei,
            totalClaimedWei: oldWorker.totalClaimedWei,
            lastAccruedAt: oldWorker.lastAccruedAt,
            metadata: oldWorker.metadata
        });

        // Clean up old state.
        delete workers[oldAddress];
        delete pendingMigrations[oldAddress];

        // Replace oldAddress with newAddress in workerList to keep iteration consistent.
        uint256 len = workerList.length;
        for (uint256 i = 0; i < len; i++) {
            if (workerList[i] == oldAddress) {
                workerList[i] = msg.sender;
                break;
            }
        }

        emit MigrationCompleted(oldAddress, msg.sender);
    }

    // ---------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------

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

        // Passively warn affected workers if their individual runway has dropped below threshold.
        // Loops workerList once post-claim to emit a targeted event per worker whose runway is low.
        // Each worker gets a personally meaningful warning rather than a single ambiguous global one.
        if (lowTreasuryThresholdSeconds > 0) {
            (uint256 totalRatePerSecond,) = treasuryRunway();
            if (totalRatePerSecond > 0) {
                uint256 len = workerList.length;
                uint256 bal = address(this).balance;
                for (uint256 i = 0; i < len; i++) {
                    address wAddr = workerList[i];
                    Worker storage w = workers[wAddr];
                    if (!w.active) continue;
                    if (w.timeline == Timeline.Trigger) continue;
                    if (w.intervalSeconds == 0) continue;

                    uint256 wRate = w.amountPerIntervalWei / w.intervalSeconds;
                    if (wRate == 0) continue;

                    // Proportional fair share runway for this specific worker.
                    uint256 fairShare = (bal * wRate) / totalRatePerSecond;
                    uint256 wRunway = fairShare / wRate;

                    if (wRunway < lowTreasuryThresholdSeconds) {
                        emit LowTreasury(wAddr, wRunway);
                    }
                }
            }
        }
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
