// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title StreamWagePayroll
/// @author StreamWage
/// @notice Prefunded ETH payroll protocol with pull-based worker claims.
/// @dev Supports hourly, monthly, custom interval, and trigger-based compensation models.
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
    }

    address public owner;
    mapping(address => bool) public admins;
    mapping(address => Worker) public workers;
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

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event AdminUpdated(address indexed admin, bool enabled);
    event TreasuryFunded(address indexed from, uint256 amount);
    event WorkerAdded(
        address indexed worker,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 intervalSeconds,
        string metadata
    );
    event WorkerRateUpdated(address indexed worker, uint256 amountPerIntervalWei);
    event WorkerIntervalUpdated(address indexed worker, Timeline timeline, uint256 intervalSeconds);
    event WorkerMetadataUpdated(address indexed worker, string metadata);
    event WorkerStatusUpdated(address indexed worker, bool active);
    event TriggerPaymentGranted(address indexed worker, uint256 amount);
    event Claimed(address indexed worker, address indexed recipient, uint256 amount);
    event MigrationProposed(address indexed oldAddress, address indexed newAddress);
    event MigrationCancelled(address indexed oldAddress, address indexed newAddress);
    event MigrationCompleted(address indexed oldAddress, address indexed newAddress);
    event LowTreasury(address indexed worker, uint256 estimatedRunwaySeconds);
    event LowTreasuryThresholdUpdated(uint256 newThresholdSeconds);
    event ExcessWithdrawn(address indexed recipient, uint256 amountWei, uint256 remainingBalance);
    event ProposalWindowUpdated(uint256 newWindowSeconds);
    event TermsProposed(
        address indexed worker,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 intervalSeconds,
        bool terminateOnReject,
        uint256 expiryTimestamp,
        string proposalNote  // *** NEW — operator context, stored in log only not in struct ***
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

    /// @dev Locks the implementation contract so only proxies can initialize state.
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes payroll ownership for a freshly deployed instance.
    /// @param initialOwner Owner of the payroll instance.
    function initialize(address initialOwner) external initializer {
        if (initialOwner == address(0)) revert InvalidConfiguration();
        owner = initialOwner;
        emit OwnerTransferred(address(0), initialOwner);
    }

    receive() external payable {
        emit TreasuryFunded(msg.sender, msg.value);
    }

    function fundTreasury() external payable onlyOperator {
        if (msg.value == 0) revert InvalidAmount();
        emit TreasuryFunded(msg.sender, msg.value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidConfiguration();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnerTransferred(previousOwner, newOwner);
    }

    function setAdmin(address admin, bool enabled) external onlyOwner {
        if (admin == address(0)) revert InvalidConfiguration();
        admins[admin] = enabled;
        emit AdminUpdated(admin, enabled);
    }

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

    function updateWorkerRate(address workerAddr, uint256 amountPerIntervalWei) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        if (worker.timeline != Timeline.Trigger && amountPerIntervalWei == 0) revert InvalidAmount();
        _settleAndReset(worker);
        worker.amountPerIntervalWei = amountPerIntervalWei;
        emit WorkerRateUpdated(workerAddr, amountPerIntervalWei);
    }

    /// @notice Updates the worker's timeline type and interval duration.
    /// @dev *** CHANGED ***
    /// Added reset of lastAccruedAt when worker is inactive to prevent
    /// the paused gap from carrying over as worked time on resume.
    function updateWorkerInterval(
        address workerAddr,
        Timeline timeline,
        uint256 customIntervalSeconds
    ) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        uint256 newIntervalSeconds = _resolveInterval(timeline, customIntervalSeconds);
        _settleAndReset(worker);

        // *** CHANGED ***
        // If worker is inactive, reset lastAccruedAt to now so the paused
        // gap is not counted as worked time when the worker eventually resumes.
        if (!worker.active) {
            worker.lastAccruedAt = uint64(block.timestamp);
        }

        worker.timeline = timeline;
        worker.intervalSeconds = newIntervalSeconds;
        emit WorkerIntervalUpdated(workerAddr, timeline, newIntervalSeconds);
    }

    function updateWorkerMetadata(address workerAddr, string calldata metadata) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        worker.metadata = metadata;
        emit WorkerMetadataUpdated(workerAddr, metadata);
    }

    /// @notice Activates or deactivates worker accrual.
    /// @dev *** CHANGED ***
    /// Previously _accrue() only was called, leaving lastAccruedAt at the
    /// old pause timestamp. This caused the entire paused duration to be
    /// counted as worked time on the next _accrue() call after resume.
    ///
    /// Now on pause: _settleAndReset() settles whole intervals + fractional
    /// remainder and resets lastAccruedAt to now — no earned time is lost
    /// and no paused time accumulates.
    ///
    /// On resume: lastAccruedAt is already at pause timestamp (recent) so
    /// accrual starts cleanly from that point forward. No reset needed.
    /// @param workerAddr Worker wallet address.
    /// @param active New active status.
    function setWorkerStatus(address workerAddr, bool active) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();

        // *** CHANGED ***
        // On pause: settle whole intervals + fractional remainder,
        // reset lastAccruedAt to now so paused time is never counted.
        // On resume: lastAccruedAt is already clean — no action needed.
        if (!active) {
            _settleAndReset(worker);
        }

        worker.active = active;
        emit WorkerStatusUpdated(workerAddr, active);
    }

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

    function setLowTreasuryThreshold(uint256 thresholdSeconds) external onlyOwner {
        lowTreasuryThresholdSeconds = thresholdSeconds;
        emit LowTreasuryThresholdUpdated(thresholdSeconds);
    }

    /// *** CHANGED ***
    /// Previously used raw address(this).balance for runway calculation,
    /// overstating available funds by including ETH already owed to workers
    /// as accruedWei. Now subtracts total accrued across all workers first
    /// so runway reflects only ETH that is actually free to fund future accrual.
    function treasuryRunway() public view returns (uint256 totalRatePerSecond, uint256 estimatedRunwaySeconds) {
        uint256 len = workerList.length;
        uint256 totalAccrued; // *** NEW — tracks ETH already owed to workers ***

        for (uint256 i = 0; i < len; i++) {
            Worker storage worker = workers[workerList[i]];

            // *** NEW — accumulate already-owed balances across all workers,
            // including inactive ones — their accruedWei is still a liability. ***
            totalAccrued += worker.accruedWei;

            if (!worker.active) continue;
            if (worker.timeline == Timeline.Trigger) continue;
            if (worker.intervalSeconds == 0) continue;
            totalRatePerSecond += worker.amountPerIntervalWei / worker.intervalSeconds;
        }

        if (totalRatePerSecond == 0) return (0, type(uint256).max);

        // *** CHANGED ***
        // Subtract already-owed accrued balances from balance before
        // calculating runway — that ETH is spoken for and cannot fund
        // future accrual. Guard against underflow if accrued > balance.
        uint256 freeBalance = address(this).balance > totalAccrued
            ? address(this).balance - totalAccrued
            : 0;

        estimatedRunwaySeconds = freeBalance / totalRatePerSecond;
    }

    function workerRunway(address workerAddr) external view returns (uint256 estimatedRunwaySeconds) {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) return 0;
        if (!worker.active) return 0;
        if (worker.timeline == Timeline.Trigger) return 0;
        if (worker.intervalSeconds == 0) return 0;
        (uint256 totalRatePerSecond,) = treasuryRunway();
        if (totalRatePerSecond == 0) return type(uint256).max;
        uint256 workerRatePerSecond = worker.amountPerIntervalWei / worker.intervalSeconds;
        if (workerRatePerSecond == 0) return type(uint256).max;
        uint256 workerFairShareBalance = (address(this).balance * workerRatePerSecond) / totalRatePerSecond;
        estimatedRunwaySeconds = workerFairShareBalance / workerRatePerSecond;
    }

    function withdrawExcess(address recipient, uint256 amountWei) external onlyOperator {
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
        if (address(this).balance < minimumReserve) revert WithdrawalExceedsSafeLimit();
        uint256 withdrawable = address(this).balance - minimumReserve;
        if (amountWei > withdrawable) revert WithdrawalExceedsSafeLimit();
        (bool ok,) = recipient.call{value: amountWei}("");
        if (!ok) revert TransferFailed();
        emit ExcessWithdrawn(recipient, amountWei, address(this).balance);
    }

    // ---------------------------------------------------------------------------
    // Term Negotiation
    // ---------------------------------------------------------------------------

    function setProposalWindow(uint256 durationSeconds) external onlyOperator {
        if (durationSeconds == 0) revert InvalidConfiguration();
        defaultProposalWindow = durationSeconds;
        emit ProposalWindowUpdated(durationSeconds);
    }

    /// @notice Operator proposes new payroll terms for a worker.
    /// @dev *** CHANGED ***
    /// Previously used _accrue() then set active = false, leaving
    /// lastAccruedAt at the old boundary — same dangerous gap as setWorkerStatus.
    /// Now uses _settleAndReset() so fractional remainder is paid out
    /// and lastAccruedAt is clean before the proposal period begins.
    function proposeTerms(
        address workerAddr,
        Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 customIntervalSeconds,
        bool terminateOnReject,
        string calldata proposalNote  // *** NEW — operator context/reason, emitted in log only ***
    ) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        if (pendingTerms[workerAddr].exists) revert ProposalAlreadyPending();
        uint256 newIntervalSeconds = _resolveInterval(timeline, customIntervalSeconds);
        if (timeline != Timeline.Trigger && amountPerIntervalWei == 0) revert InvalidAmount();

        // *** CHANGED ***
        // Was: _accrue(worker) only.
        // Now: _settleAndReset() — settles whole intervals + fractional
        // remainder, resets lastAccruedAt to now before pausing.
        _settleAndReset(worker);

        worker.active = false;
        pendingTerms[workerAddr] = PendingTerms({
            exists: true,
            timeline: timeline,
            amountPerIntervalWei: amountPerIntervalWei,
            intervalSeconds: newIntervalSeconds,
            terminateOnReject: terminateOnReject,
            expiryTimestamp: block.timestamp + defaultProposalWindow
        });
        emit TermsProposed(
            workerAddr,
            timeline,
            amountPerIntervalWei,
            newIntervalSeconds,
            terminateOnReject,
            block.timestamp + defaultProposalWindow,
            proposalNote  // *** NEW — passed through to event, not stored in struct ***
        );
    }

    /// @notice Worker accepts the proposed terms.
    /// @dev *** CHANGED ***
    /// Fractional settlement removed — already handled by _settleAndReset()
    /// at proposeTerms time. lastAccruedAt is already clean.
    /// New terms applied and lastAccruedAt reset to now for clean accrual start.
    function acceptTerms() external {
        Worker storage worker = workers[msg.sender];
        if (!worker.exists) revert InvalidWorker();
        PendingTerms storage proposal = pendingTerms[msg.sender];
        if (!proposal.exists) revert NoPendingProposal();
        if (block.timestamp > proposal.expiryTimestamp) revert ProposalExpiredError();

        // *** CHANGED ***
        // Fractional settlement removed — already handled cleanly
        // by _settleAndReset() at proposeTerms time.
        worker.timeline = proposal.timeline;
        worker.amountPerIntervalWei = proposal.amountPerIntervalWei;
        worker.intervalSeconds = proposal.intervalSeconds;
        worker.active = true;
        worker.lastAccruedAt = uint64(block.timestamp);
        delete pendingTerms[msg.sender];
        emit TermsAccepted(msg.sender);
    }

    function rejectTerms() external {
        Worker storage worker = workers[msg.sender];
        if (!worker.exists) revert InvalidWorker();
        PendingTerms storage proposal = pendingTerms[msg.sender];
        if (!proposal.exists) revert NoPendingProposal();
        if (block.timestamp > proposal.expiryTimestamp) revert ProposalExpiredError();
        _applyRejection(msg.sender, worker, proposal.terminateOnReject, false);
    }

    function cancelProposal(address workerAddr) external onlyOperator {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        PendingTerms storage proposal = pendingTerms[workerAddr];
        if (!proposal.exists) revert NoPendingProposal();
        delete pendingTerms[workerAddr];
        worker.active = true;
        worker.lastAccruedAt = uint64(block.timestamp);
        emit ProposalCancelled(workerAddr);
    }

    function expireProposal(address workerAddr) external {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        PendingTerms storage proposal = pendingTerms[workerAddr];
        if (!proposal.exists) revert NoPendingProposal();
        if (block.timestamp <= proposal.expiryTimestamp) revert ProposalNotExpired();
        bool terminated = proposal.terminateOnReject;
        _applyRejection(workerAddr, worker, terminated, true);
    }

    /// @dev *** CHANGED ***
    /// Fractional settlement removed from both branches — already handled
    /// cleanly by _settleAndReset() at proposeTerms time. lastAccruedAt
    /// is reset to now in all paths for a clean checkpoint.
    function _applyRejection(
        address workerAddr,
        Worker storage worker,
        bool terminateOnReject,
        bool emitExpiry
    ) internal {
        if (terminateOnReject) {
            // *** CHANGED ***
            // Fractional settlement removed — already handled by _settleAndReset()
            // at proposeTerms time. Worker permanently deactivated.
            // accruedWei intentionally left intact — worker can still claim.
            worker.active = false;
            worker.lastAccruedAt = uint64(block.timestamp);
            delete pendingTerms[workerAddr];
            if (emitExpiry) {
                emit ProposalExpired(workerAddr, true);
            } else {
                emit WorkerTerminated(workerAddr);
            }
        } else {
            // *** CHANGED ***
            // Fractional settlement removed — already handled by _settleAndReset()
            // at proposeTerms time. Worker restored under original terms.
            worker.active = true;
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

    function proposeMigration(address newAddress) external {
        if (newAddress == address(0)) revert InvalidConfiguration();
        if (newAddress == msg.sender) revert InvalidConfiguration();
        Worker storage worker = workers[msg.sender];
        if (!worker.exists) revert InvalidWorker();
        if (workers[newAddress].exists) revert WorkerAlreadyExists();
        if (pendingMigrations[msg.sender].exists) revert MigrationAlreadyPending();
        pendingMigrations[msg.sender] = PendingMigration({
            exists: true,
            newAddress: newAddress
        });
        emit MigrationProposed(msg.sender, newAddress);
    }

    function cancelMigration() external {
        PendingMigration storage migration = pendingMigrations[msg.sender];
        if (!migration.exists) revert NoPendingMigration();
        address proposedNew = migration.newAddress;
        delete pendingMigrations[msg.sender];
        emit MigrationCancelled(msg.sender, proposedNew);
    }

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

    /// @dev Settles accrued funds and performs ETH transfer.
    /// *** CHANGED ***
    /// Previously reverted with InsufficientTreasury if accruedWei > treasury balance,
    /// permanently blocking the worker from claiming anything until the treasury was
    /// topped up to cover the full amount — even if only 1 wei short.
    ///
    /// Now claims the maximum amount the treasury can currently cover:
    ///   claimedAmount = min(accruedWei, treasury balance)
    ///
    /// The unpaid remainder stays in accruedWei and is claimable later once
    /// the treasury is refunded. Worker is never permanently stuck.
    /// InsufficientTreasury error is kept for the zero balance edge case only.
    function _claimTo(address workerAddr, address recipient) internal returns (uint256 claimedAmount) {
        Worker storage worker = workers[workerAddr];
        if (!worker.exists) revert InvalidWorker();
        _settleAndReset(worker);
        if (worker.accruedWei == 0) revert NoClaimableBalance();
        if (address(this).balance == 0) revert InsufficientTreasury();

        // *** CHANGED ***
        // Claim the lesser of accruedWei and treasury balance.
        // Remainder stays in accruedWei — worker can claim it later.
        claimedAmount = worker.accruedWei < address(this).balance
            ? worker.accruedWei
            : address(this).balance;

        worker.accruedWei -= claimedAmount;
        worker.totalClaimedWei += claimedAmount;
        (bool ok,) = recipient.call{value: claimedAmount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(workerAddr, recipient, claimedAmount);
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
        worker.lastAccruedAt = uint64(
            uint256(worker.lastAccruedAt) + (intervals * worker.intervalSeconds)
        );
    }

    /// @dev *** NEW FUNCTION ***
    /// Settles whole intervals via _accrue(), then pays out the fractional
    /// remainder for the partial interval the worker was mid-way through,
    /// then resets lastAccruedAt to block.timestamp.
    ///
    /// Called before state changes that should lock in all earned time to ensure:
    /// 1. No earned time is lost — fractional remainder is paid pro-rata.
    /// 2. Subsequent mutations do not retroactively reprice already-earned time.
    ///
    /// For pause flows, the reset checkpoint also ensures no paused time is
    /// counted as worked time on resume.
    ///
    /// Only applies to active time-based workers. Trigger timeline and inactive
    /// workers are skipped — no interval to settle.
    function _settleAndReset(Worker storage worker) internal {
        _accrue(worker); // settle whole intervals first

        // Fractional settlement — only for active time-based workers.
        // _accrue() must run first so lastAccruedAt is at the last
        // whole interval boundary before we calculate the remainder.
        if (
            worker.active &&
            worker.timeline != Timeline.Trigger &&
            worker.intervalSeconds > 0
        ) {
            uint256 elapsed = block.timestamp - uint256(worker.lastAccruedAt);
            uint256 remainder = elapsed % worker.intervalSeconds;
            if (remainder > 0) {
                worker.accruedWei += (remainder * worker.amountPerIntervalWei)
                                     / worker.intervalSeconds;
            }
            // Reset checkpoint to now — paused time will not be counted
            // as worked time when the worker resumes.
            worker.lastAccruedAt = uint64(block.timestamp);
        }
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
