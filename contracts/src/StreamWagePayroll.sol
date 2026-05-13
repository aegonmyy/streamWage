// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @title StreamWagePayroll
/// @author Alameen
/// @notice Prefunded ETH payroll contract with pull-based worker claims.
/// @dev Workers accrue ETH over fixed intervals (hourly, monthly, or custom) or via
///      operator-triggered grants. All earned funds are held on-chain and claimed at
///      will. Deployed behind a minimal proxy; state is initialized via `initialize`.
contract StreamWagePayroll is Initializable {
    enum Timeline {
        Hourly,
        Monthly,
        Custom,
        Trigger
    }

    struct Worker {
        bool exists;
        bool active;
        Timeline timeline;
        uint256 amountPerIntervalWei;
        uint256 intervalSeconds;
        uint256 accruedWei;
        uint256 totalClaimedWei;
        uint64 lastAccruedAt;
        string metadata;
    }

    struct PendingMigration {
        bool exists;
        address newAddress;
    }

    struct PendingTerms {
        bool exists;
        Timeline timeline;
        uint256 amountPerIntervalWei;
        uint256 intervalSeconds;
        bool terminateOnReject;
        uint256 expiryTimestamp;
        bool wasActive;
    }

    address public owner;
    mapping(address => bool) public admins;
    mapping(address => Worker) public workers;
    mapping(address => bool) migrationAddress;
    mapping(address => PendingMigration) public pendingMigrations;
    mapping(address => PendingTerms) public pendingTerms;
    uint256 public defaultProposalWindow = 7 days;
    address[] public workerList;
    uint256 public lowTreasuryThresholdSeconds = 7 days;

    error NotOwner();
    error NotOperator();
    error InvalidWorker();
    error WorkerAlreadyExists();
    error InvalidConfiguration();
    error InvalidAmount();
    error NoClaimableBalance();
    error InsufficientTreasury();
    error TransferFailed();
    error NoPendingMigration();
    error NotMigrationRecipient();
    error MigrationAlreadyPending();
    error WithdrawalExceedsSafeLimit();
    error NoPendingProposal();
    error ProposalAlreadyPending();
    error ProposalNotExpired();
    error ProposalExpiredError();

    event OwnerTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event AdminUpdated(address indexed admin, bool enabled);
    event TreasuryFunded(address indexed from, uint256 amount);
    event WorkerAdded(
        address indexed worker,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 intervalSeconds,
        string metadata
    );
    event WorkerRateUpdated(
        address indexed worker,
        uint256 amountPerIntervalWei
    );
    event WorkerIntervalUpdated(
        address indexed worker,
        Timeline timeline,
        uint256 intervalSeconds
    );
    event WorkerMetadataUpdated(address indexed worker, string metadata);
    event WorkerStatusUpdated(address indexed worker, bool active);
    event TriggerPaymentGranted(address indexed worker, uint256 amount);
    event Claimed(
        address indexed worker,
        address indexed recipient,
        uint256 amount
    );
    event MigrationProposed(
        address indexed oldAddress,
        address indexed newAddress
    );
    event MigrationCancelled(
        address indexed oldAddress,
        address indexed newAddress
    );
    event MigrationCompleted(
        address indexed oldAddress,
        address indexed newAddress
    );
    event LowTreasury(address indexed worker, uint256 estimatedRunwaySeconds);
    event LowTreasuryThresholdUpdated(uint256 newThresholdSeconds);
    event ExcessWithdrawn(
        address indexed recipient,
        uint256 amountWei,
        uint256 remainingBalance
    );
    event ProposalWindowUpdated(uint256 newWindowSeconds);
    event TermsProposed(
        address indexed worker,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 intervalSeconds,
        bool terminateOnReject,
        uint256 expiryTimestamp,
        string proposalNote
    );
    event TermsAccepted(address indexed worker);
    event TermsRejected(address indexed worker);
    event WorkerTerminated(address indexed worker);
    event ProposalCancelled(address indexed worker);
    event ProposalExpired(address indexed worker, bool terminated);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != owner && !admins[msg.sender]) revert NotOperator();
        _;
    }

    /// @dev Locks the implementation contract so it cannot be initialized directly.
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the payroll instance and assigns the owner.
    /// @param initialOwner Address that will own this payroll instance.
    function initialize(address initialOwner) external initializer {
        if (initialOwner == address(0)) revert InvalidConfiguration();
        owner = initialOwner;
        emit OwnerTransferred(address(0), initialOwner);
    }

    /// @notice Accepts ETH sent directly to the contract and credits the treasury.
    receive() external payable {
        emit TreasuryFunded(msg.sender, msg.value);
    }

    /// @notice Deposits ETH into the treasury. Restricted to operators.
    /// @dev Reverts if no ETH is sent.
    function fundTreasury() external payable onlyOperator {
        if (msg.value == 0) revert InvalidAmount();
        emit TreasuryFunded(msg.sender, msg.value);
    }

    /// @notice Transfers contract ownership to a new address.
    /// @param newOwner Address of the incoming owner.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidConfiguration();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnerTransferred(previousOwner, newOwner);
    }

    /// @notice Grants or revokes operator (admin) privileges for an address.
    /// @param admin Target address.
    /// @param enabled True to grant, false to revoke.
    function setAdmin(address admin, bool enabled) external onlyOwner {
        if (admin == address(0)) revert InvalidConfiguration();
        admins[admin] = enabled;
        emit AdminUpdated(admin, enabled);
    }

    /// @notice Registers a new worker on this payroll.
    /// @param workerAddr Worker wallet address.
    /// @param timeline Compensation timeline type.
    /// @param amountPerIntervalWei Gross pay per interval in wei. Ignored for Trigger workers.
    /// @param customIntervalSeconds Interval length in seconds; only used when timeline is Custom.
    /// @param metadata Arbitrary off-chain metadata string (e.g. name, role).
    function addWorker(
        address workerAddr,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 customIntervalSeconds,
        string calldata metadata
    ) external onlyOperator {
        if (workerAddr == address(0)) revert InvalidConfiguration();
        if (workers[workerAddr].exists) revert WorkerAlreadyExists();
        uint256 intervalSeconds = _resolveInterval(
            timeline,
            customIntervalSeconds
        );
        if (timeline != Timeline.Trigger && amountPerIntervalWei == 0)
            revert InvalidAmount();
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
        emit WorkerAdded(
            workerAddr,
            timeline,
            amountPerIntervalWei,
            intervalSeconds,
            metadata
        );
    }

    /// @notice Updates a worker's pay rate. Settles all earned time first so the new
    ///         rate does not retroactively reprice already-worked intervals.
    /// @param workerAddr Worker wallet address.
    /// @param amountPerIntervalWei New gross pay per interval in wei.
    function updateWorkerRate(
        address workerAddr,
        uint256 amountPerIntervalWei
    ) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        if (worker.timeline != Timeline.Trigger && amountPerIntervalWei == 0)
            revert InvalidAmount();
        _settleAndReset(worker);
        worker.amountPerIntervalWei = amountPerIntervalWei;
        emit WorkerRateUpdated(workerAddr, amountPerIntervalWei);
    }

    /// @notice Updates a worker's timeline type and interval length. Settles all earned
    ///         time first so the new interval does not reprice already-worked time.
    /// @dev When the worker is inactive, `lastAccruedAt` is reset to now so the
    ///      paused gap is not counted as worked time on resume.
    /// @param workerAddr Worker wallet address.
    /// @param timeline New timeline type.
    /// @param customIntervalSeconds New interval in seconds; only used when timeline is Custom.
    function updateWorkerInterval(
        address workerAddr,
        Timeline timeline,
        uint256 customIntervalSeconds
    ) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        uint256 newIntervalSeconds = _resolveInterval(
            timeline,
            customIntervalSeconds
        );
        _settleAndReset(worker);

        // If the worker is inactive, reset lastAccruedAt to now so the paused
        // gap is not counted as worked time when the worker eventually resumes.
        if (!worker.active) {
            worker.lastAccruedAt = uint64(block.timestamp);
        }

        worker.timeline = timeline;
        worker.intervalSeconds = newIntervalSeconds;
        emit WorkerIntervalUpdated(workerAddr, timeline, newIntervalSeconds);
    }

    /// @notice Updates the off-chain metadata string for a worker.
    /// @param workerAddr Worker wallet address.
    /// @param metadata New metadata value.
    function updateWorkerMetadata(
        address workerAddr,
        string calldata metadata
    ) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        worker.metadata = metadata;
        emit WorkerMetadataUpdated(workerAddr, metadata);
    }

    /// @notice Activates or deactivates a worker's accrual.
    /// @dev On pause, earned time (including any partial interval) is settled and
    ///      `lastAccruedAt` is reset to now so the paused gap never accumulates.
    ///      On resume, `lastAccruedAt` is already current — no adjustment needed.
    /// @param workerAddr Worker wallet address.
    /// @param active New active status.
    function setWorkerStatus(
        address workerAddr,
        bool active
    ) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();

        // On pause: settle whole intervals and fractional remainder, then reset
        // lastAccruedAt so paused time is never counted as worked time.
        // On resume: lastAccruedAt is already clean — no action needed.
        if (!active) {
            _settleAndReset(worker);
        }

        worker.active = active;
        emit WorkerStatusUpdated(workerAddr, active);
    }

    /// @notice Grants a one-off payment to a Trigger-timeline worker.
    /// @param workerAddr Worker wallet address.
    /// @param amountWei Amount to credit in wei.
    function grantTriggerPayment(
        address workerAddr,
        uint256 amountWei
    ) external onlyOperator {
        if (amountWei == 0) revert InvalidAmount();
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        if (worker.timeline != Timeline.Trigger) revert InvalidConfiguration();
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
    function claimTo(
        address recipient
    ) external returns (uint256 claimedAmount) {
        if (recipient == address(0)) revert InvalidConfiguration();
        claimedAmount = _claimTo(msg.sender, recipient);
    }

    /// @notice Returns the amount a worker could claim right now, including whole
    ///         intervals elapsed since the last settlement and the pro-rata portion
    ///         of any interval currently in progress.
    /// @dev Mirrors the full projection that `_settleAndReset` applies at claim time,
    ///      so the displayed balance matches the actual payout exactly.
    ///      Multiplication is performed before division to minimise precision loss.
    /// @param workerAddr Worker wallet address.
    /// @return Total claimable balance in wei.
    function claimable(address workerAddr) external view returns (uint256) {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) return 0;
        uint256 accrued = worker.accruedWei;
        if (!worker.active || worker.timeline == Timeline.Trigger)
            return accrued;
        if (worker.intervalSeconds == 0) return accrued;
        uint256 elapsed = block.timestamp - uint256(worker.lastAccruedAt);
        uint256 intervals = elapsed / worker.intervalSeconds;
        uint256 remainder = elapsed % worker.intervalSeconds;
        return
            accrued +
            (intervals * worker.amountPerIntervalWei) +
            (remainder * worker.amountPerIntervalWei) /
            worker.intervalSeconds;
    }

    // ---------------------------------------------------------------------------
    // Treasury Health
    // ---------------------------------------------------------------------------

    /// @notice Sets the runway threshold below which a `LowTreasury` event is emitted on claim.
    /// @param thresholdSeconds Runway duration in seconds. Set to zero to disable alerts.
    function setLowTreasuryThreshold(
        uint256 thresholdSeconds
    ) external onlyOperator {
        lowTreasuryThresholdSeconds = thresholdSeconds;
        emit LowTreasuryThresholdUpdated(thresholdSeconds);
    }

    /// @notice Returns the aggregate pay rate and estimated treasury runway across all active workers.
    /// @dev Runway is calculated against free balance only — ETH already accrued to workers
    ///      is subtracted first, since it is a liability and cannot fund future accrual.
    ///      Trigger workers and workers with a zero interval contribute no rate.
    /// @return totalRatePerSecond Combined pay rate across all active time-based workers, in wei/second.
    /// @return estimatedRunwaySeconds How long the free treasury balance can sustain the current rate.
    ///         Returns `type(uint256).max` if totalRatePerSecond is zero.
    function treasuryRunway()
        public
        view
        returns (
            uint256 totalRatePerSecond,
            uint256 estimatedRunwaySeconds,
            uint256 totalAccrued
        )
    {
        uint256 len = workerList.length;

        for (uint256 i = 0; i < len; i++) {
            Worker storage worker = workers[workerList[i]];

            // Accumulate liabilities across all workers, including inactive ones —
            // their accruedWei is still owed and reduces available free balance.
            totalAccrued += worker.accruedWei;

            if (!worker.active) continue;
            if (worker.timeline == Timeline.Trigger) continue;
            if (worker.intervalSeconds == 0) continue;
            totalRatePerSecond +=
                worker.amountPerIntervalWei /
                worker.intervalSeconds;
        }

        if (totalRatePerSecond == 0)
            return (0, type(uint256).max, totalAccrued);

        // Subtract accrued liabilities before calculating runway. Guard against
        // underflow if accrued balances exceed the contract's current ETH balance.
        uint256 freeBalance = address(this).balance > totalAccrued
            ? address(this).balance - totalAccrued
            : 0;

        estimatedRunwaySeconds = freeBalance / totalRatePerSecond;
    }

    /// @notice Estimates how long the treasury can sustain a specific worker at the current rate,
    ///         based on that worker's proportional share of the free balance.
    /// @param workerAddr Worker wallet address.
    /// @return estimatedRunwaySeconds Estimated runway in seconds, or zero if the worker
    ///         is inactive, Trigger-based, or has no rate.
    function workerRunway(
        address workerAddr
    ) external view returns (uint256 estimatedRunwaySeconds) {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) return 0;
        if (!worker.active) return 0;
        if (worker.timeline == Timeline.Trigger) return 0;
        if (worker.intervalSeconds == 0) return 0;
        (uint256 totalRatePerSecond, , ) = treasuryRunway();
        if (totalRatePerSecond == 0) return type(uint256).max;
        uint256 workerRatePerSecond = worker.amountPerIntervalWei /
            worker.intervalSeconds;
        if (workerRatePerSecond == 0) return type(uint256).max;
        uint256 workerFairShareBalance = (address(this).balance *
            workerRatePerSecond) / totalRatePerSecond;
        estimatedRunwaySeconds = workerFairShareBalance / workerRatePerSecond;
    }

    /// @notice Withdraws surplus ETH from the treasury to a recipient address.
    /// @dev Settles all active workers before computing available surplus. Reverts if
    ///      the withdrawal would leave less than one hour of reserves at the current rate.
    /// @param recipient Address to receive the withdrawn ETH.
    /// @param amountWei Amount to withdraw in wei.
    function withdrawExcess(
        address recipient,
        uint256 amountWei
    ) external onlyOperator {
        if (recipient == address(0)) revert InvalidConfiguration();
        if (amountWei == 0) revert InvalidAmount();
        uint256 len = workerList.length;
        uint256 totalRatePerSecond;
        for (uint256 i = 0; i < len; i++) {
            Worker storage w = workers[workerList[i]];
            if (!w.active) continue;
            if (w.timeline == Timeline.Trigger) continue;
            if (w.intervalSeconds == 0) continue;
            _settleAndReset(w);
            totalRatePerSecond += w.amountPerIntervalWei / w.intervalSeconds;
        }
        uint256 minimumReserve = totalRatePerSecond * 1 hours;
        if (address(this).balance < minimumReserve)
            revert WithdrawalExceedsSafeLimit();
        uint256 withdrawable = address(this).balance - minimumReserve;
        if (amountWei > withdrawable) revert WithdrawalExceedsSafeLimit();
        (bool ok, ) = recipient.call{value: amountWei}("");
        if (!ok) revert TransferFailed();
        emit ExcessWithdrawn(recipient, amountWei, address(this).balance);
    }

    // ---------------------------------------------------------------------------
    // Term Negotiation
    // ---------------------------------------------------------------------------

    /// @notice Sets the default window a worker has to accept or reject proposed terms.
    /// @param durationSeconds Window duration in seconds.
    function setProposalWindow(uint256 durationSeconds) external onlyOperator {
        if (durationSeconds == 0) revert InvalidConfiguration();
        defaultProposalWindow = durationSeconds;
        emit ProposalWindowUpdated(durationSeconds);
    }

    /// @notice Proposes new payroll terms for a worker and pauses their accrual pending acceptance.
    /// @dev All earned time (including any partial interval) is settled before the worker is
    ///      paused, so no time is lost and no unpriced time bleeds into the new terms.
    /// @param workerAddr Worker wallet address.
    /// @param timeline Proposed timeline type.
    /// @param amountPerIntervalWei Proposed pay per interval in wei.
    /// @param customIntervalSeconds Proposed interval in seconds; only used when timeline is Custom.
    /// @param terminateOnReject Whether to terminate the worker if they reject or the proposal expires.
    /// @param proposalNote Operator-supplied context or reason. Emitted in the event log only; not stored on-chain.
    function proposeTerms(
        address workerAddr,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 customIntervalSeconds,
        bool terminateOnReject,
        string calldata proposalNote
    ) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        if (pendingTerms[workerAddr].exists) revert ProposalAlreadyPending();
        uint256 newIntervalSeconds = _resolveInterval(
            timeline,
            customIntervalSeconds
        );
        if (timeline != Timeline.Trigger && amountPerIntervalWei == 0)
            revert InvalidAmount();

        // Settle all earned time before pausing — whole intervals and fractional
        // remainder are both credited so no time is lost during the proposal period.
        _settleAndReset(worker);
        bool wasActive = worker.active;
        worker.active = false;
        pendingTerms[workerAddr] = PendingTerms({
            exists: true,
            timeline: timeline,
            amountPerIntervalWei: amountPerIntervalWei,
            intervalSeconds: newIntervalSeconds,
            terminateOnReject: terminateOnReject,
            expiryTimestamp: block.timestamp + defaultProposalWindow,
            wasActive: wasActive
        });
        emit TermsProposed(
            workerAddr,
            timeline,
            amountPerIntervalWei,
            newIntervalSeconds,
            terminateOnReject,
            block.timestamp + defaultProposalWindow,
            proposalNote
        );
    }

    /// @notice Worker accepts the proposed terms. Applies the new rate and interval
    ///         and resets the accrual clock from now.
    function acceptTerms() external {
        Worker storage worker = workers[msg.sender];
        if (!worker.exists) revert InvalidWorker();
        PendingTerms storage proposal = pendingTerms[msg.sender];
        if (!proposal.exists) revert NoPendingProposal();
        if (block.timestamp > proposal.expiryTimestamp)
            revert ProposalExpiredError();

        worker.timeline = proposal.timeline;
        worker.amountPerIntervalWei = proposal.amountPerIntervalWei;
        worker.intervalSeconds = proposal.intervalSeconds;
        worker.active = true;
        worker.lastAccruedAt = uint64(block.timestamp);
        delete pendingTerms[msg.sender];
        emit TermsAccepted(msg.sender);
    }

    /// @notice Worker rejects the proposed terms. Restores prior accrual or terminates
    ///         the worker depending on the `terminateOnReject` flag set by the operator.
    function rejectTerms() external {
        Worker storage worker = workers[msg.sender];
        if (!worker.exists) revert InvalidWorker();
        PendingTerms storage proposal = pendingTerms[msg.sender];
        if (!proposal.exists) revert NoPendingProposal();
        if (block.timestamp > proposal.expiryTimestamp)
            revert ProposalExpiredError();
        bool wasActive = proposal.wasActive;
        _applyRejection(
            msg.sender,
            worker,
            proposal.terminateOnReject,
            false,
            wasActive
        );
    }

    /// @notice Operator cancels a pending proposal and restores the worker to active status.
    /// @param workerAddr Worker wallet address.
    function cancelProposal(address workerAddr) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        PendingTerms storage proposal = pendingTerms[workerAddr];
        if (!proposal.exists) revert NoPendingProposal();
        delete pendingTerms[workerAddr];
        worker.active = proposal.wasActive;
        worker.lastAccruedAt = uint64(block.timestamp);
        emit ProposalCancelled(workerAddr);
    }

    /// @notice Expires a proposal that has passed its deadline. Anyone may call this.
    ///         Applies the same outcome as rejection per the `terminateOnReject` flag.
    /// @param workerAddr Worker wallet address.
    function expireProposal(address workerAddr) external {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        PendingTerms storage proposal = pendingTerms[workerAddr];
        if (!proposal.exists) revert NoPendingProposal();
        if (block.timestamp <= proposal.expiryTimestamp)
            revert ProposalNotExpired();
        bool terminated = proposal.terminateOnReject;
        bool wasActive = proposal.wasActive;
        _applyRejection(workerAddr, worker, terminated, true, wasActive);
    }

    /// @dev Applies the outcome of a proposal rejection or expiry. If `terminateOnReject`
    ///      is set, the worker is permanently deactivated; otherwise they are restored under
    ///      their prior terms. In both cases `lastAccruedAt` is reset to now.
    ///      `accruedWei` is left intact so the worker can still claim any earned balance.
    function _applyRejection(
        address workerAddr,
        Worker storage worker,
        bool terminateOnReject,
        bool emitExpiry,
        bool wasActive
    ) internal {
        if (terminateOnReject) {
            worker.active = false;
            worker.lastAccruedAt = uint64(block.timestamp);
            delete pendingTerms[workerAddr];
            if (emitExpiry) {
                emit ProposalExpired(workerAddr, true);
            } else {
                emit WorkerTerminated(workerAddr);
            }
        } else {
            worker.active = wasActive;
            worker.lastAccruedAt = uint64(block.timestamp);
            delete pendingTerms[workerAddr];
            if (emitExpiry) {
                emit ProposalExpired(workerAddr, false);
            } else {
                emit TermsRejected(workerAddr);
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Worker Address Migration
    // ---------------------------------------------------------------------------

    /// @notice Initiates a wallet migration by proposing a new address. The new address
    ///         must confirm by calling `acceptMigration`.
    /// @param newAddress The incoming replacement address.
    function proposeMigration(address newAddress) external {
        if (newAddress == address(0)) revert InvalidConfiguration();
        if (newAddress == msg.sender) revert InvalidConfiguration();
        Worker storage worker = workers[msg.sender];
        if (!worker.exists) revert InvalidWorker();
        if (workers[newAddress].exists) revert WorkerAlreadyExists();
        if (pendingMigrations[msg.sender].exists)
            revert MigrationAlreadyPending();
        if (migrationAddress[newAddress]) revert InvalidConfiguration();
        pendingMigrations[msg.sender] = PendingMigration({
            exists: true,
            newAddress: newAddress
        });
        migrationAddress[newAddress] = true;
        emit MigrationProposed(msg.sender, newAddress);
    }

    /// @notice Cancels an outgoing migration proposal initiated by the caller.
    function cancelMigration() external {
        PendingMigration storage migration = pendingMigrations[msg.sender];
        if (!migration.exists) revert NoPendingMigration();
        address proposedNew = migration.newAddress;
        delete pendingMigrations[msg.sender];
        emit MigrationCancelled(msg.sender, proposedNew);
    }

    /// @notice Completes a wallet migration. The caller becomes the worker, inheriting
    ///         the full accrual history and any unclaimed balance of the old address.
    /// @param oldAddress The address that initiated the migration.
    function acceptMigration(address oldAddress) external {
        if (oldAddress == address(0)) revert InvalidConfiguration();
        PendingMigration storage migration = pendingMigrations[oldAddress];
        if (!migration.exists) revert NoPendingMigration();
        if (migration.newAddress != msg.sender) revert NotMigrationRecipient();
        if (workers[msg.sender].exists) revert WorkerAlreadyExists();
        Worker storage oldWorker = workers[oldAddress];
        _settleAndReset(oldWorker);
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
        delete workers[oldAddress];
        delete pendingMigrations[oldAddress];
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

    /// @dev Settles earned time, then transfers the claimable balance to `recipient`.
    ///      If the treasury cannot cover the full accrued amount, the maximum available
    ///      is paid and the remainder stays in `accruedWei` for a future claim.
    ///      Emits `LowTreasury` for any worker whose runway falls below the threshold.
    function _claimTo(
        address workerAddr,
        address recipient
    ) internal returns (uint256 claimedAmount) {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        _settleAndReset(worker);
        if (worker.accruedWei == 0) revert NoClaimableBalance();
        if (address(this).balance == 0) revert InsufficientTreasury();

        // Pay up to the treasury balance. Remainder stays in accruedWei.
        claimedAmount = worker.accruedWei < address(this).balance
            ? worker.accruedWei
            : address(this).balance;

        worker.accruedWei -= claimedAmount;
        worker.totalClaimedWei += claimedAmount;
        (bool ok, ) = recipient.call{value: claimedAmount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(workerAddr, recipient, claimedAmount);
        if (lowTreasuryThresholdSeconds > 0) {
            (uint256 totalRatePerSecond, , ) = treasuryRunway();
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
                    uint256 fairShare = (bal * wRate) / totalRatePerSecond;
                    uint256 wRunway = fairShare / wRate;
                    if (wRunway < lowTreasuryThresholdSeconds) {
                        emit LowTreasury(wAddr, wRunway);
                    }
                }
            }
        }
    }

    /// @dev Settles all earned time into `accruedWei` and resets `lastAccruedAt` to now.
    ///
    ///      Phase 1 — whole intervals: credits complete intervals that have elapsed since
    ///      the last checkpoint and advances `lastAccruedAt` to the last whole-interval boundary.
    ///
    ///      Phase 2 — fractional remainder: credits the pro-rata portion of the current
    ///      in-progress interval so no earned time is lost at pause or rate-change boundaries.
    ///
    ///      After both phases `lastAccruedAt` is set to `block.timestamp`, giving subsequent
    ///      mutations a clean starting point and ensuring paused time never accumulates.
    ///
    ///      Trigger workers and inactive workers are skipped — they have no interval to settle.
    function _settleAndReset(Worker storage worker) internal {
        // Phase 1: credit whole intervals.
        if (
            worker.active &&
            worker.timeline != Timeline.Trigger &&
            worker.intervalSeconds > 0
        ) {
            uint256 elapsed = block.timestamp - uint256(worker.lastAccruedAt);
            uint256 intervals = elapsed / worker.intervalSeconds;
            if (intervals > 0) {
                worker.accruedWei += intervals * worker.amountPerIntervalWei;
                worker.lastAccruedAt = uint64(
                    uint256(worker.lastAccruedAt) +
                        (intervals * worker.intervalSeconds)
                );
            }

            // Phase 2: credit fractional remainder of the current in-progress interval.
            // lastAccruedAt is now at the last whole-interval boundary, so the remainder
            // calculation is exact.
            uint256 remainder = block.timestamp - uint256(worker.lastAccruedAt);
            if (remainder > 0) {
                worker.accruedWei +=
                    (remainder * worker.amountPerIntervalWei) /
                    worker.intervalSeconds;
            }

            worker.lastAccruedAt = uint64(block.timestamp);
        }
    }

    /// @dev Resolves the interval length in seconds for a given timeline type.
    ///      Reverts if `Custom` is specified with a zero interval or an unknown timeline is passed.
    function _resolveInterval(
        Timeline timeline,
        uint256 customIntervalSeconds
    ) internal pure returns (uint256) {
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
