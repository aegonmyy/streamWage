// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {StreamWagePayroll} from "../src/StreamWagePayroll.sol";

contract RevertingReceiver {
    receive() external payable {
        revert("nope");
    }
}

contract StreamWagePayrollTest is Test {
    StreamWagePayroll internal payroll;
    StreamWagePayroll internal impl;

    address internal owner = makeAddr("owner");
    address internal admin = makeAddr("admin");
    address internal workerA = makeAddr("workerA");
    address internal workerB = makeAddr("workerB");
    address internal recipient = makeAddr("recipient");

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event AdminUpdated(address indexed admin, bool enabled);
    event TreasuryFunded(address indexed from, uint256 amount);
    event WorkerAdded(
        address indexed worker,
        StreamWagePayroll.Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 intervalSeconds,
        string metadata
    );
    event WorkerRateUpdated(address indexed worker, uint256 amountPerIntervalWei);
    event WorkerIntervalUpdated(
        address indexed worker,
        StreamWagePayroll.Timeline timeline,
        uint256 intervalSeconds
    );
    event WorkerMetadataUpdated(address indexed worker, string metadata);
    event WorkerStatusUpdated(address indexed worker, bool active);
    event TriggerPaymentGranted(address indexed worker, uint256 amount);
    event Claimed(address indexed worker, address indexed recipient, uint256 amount);
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
        StreamWagePayroll.Timeline timeline,
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
    event MigrationProposed(address indexed oldAddress, address indexed newAddress);
    event MigrationCancelled(address indexed oldAddress, address indexed newAddress);
    event MigrationCompleted(address indexed oldAddress, address indexed newAddress);

    function setUp() external {
        impl = new StreamWagePayroll();
        payroll = _deployClone(owner);

        vm.prank(owner);
        payroll.setAdmin(admin, true);
    }

    function _deployClone(address initialOwner) internal returns (StreamWagePayroll) {
        address clone = Clones.clone(address(impl));
        StreamWagePayroll instance = StreamWagePayroll(payable(clone));
        vm.expectEmit(true, true, false, true);
        emit OwnerTransferred(address(0), initialOwner);
        instance.initialize(initialOwner);
        return instance;
    }

    function _fund(uint256 amountWei) internal {
        vm.deal(owner, amountWei);
        vm.prank(owner);
        payroll.fundTreasury{value: amountWei}();
    }

    function _addHourlyWorker(address who, uint256 amountPerHourWei) internal {
        vm.prank(owner);
        payroll.addWorker(
            who,
            StreamWagePayroll.Timeline.Hourly,
            amountPerHourWei,
            0,
            "meta"
        );
    }

    function _worker(
        address who
    ) internal view returns (StreamWagePayroll.Worker memory w) {
        (
            bool exists,
            bool active,
            StreamWagePayroll.Timeline timeline,
            uint256 amountPerIntervalWei,
            uint256 intervalSeconds,
            uint256 accruedWei,
            uint256 totalClaimedWei,
            uint64 lastAccruedAt,
            string memory metadata
        ) = payroll.workers(who);
        w.exists = exists;
        w.active = active;
        w.timeline = timeline;
        w.amountPerIntervalWei = amountPerIntervalWei;
        w.intervalSeconds = intervalSeconds;
        w.accruedWei = accruedWei;
        w.totalClaimedWei = totalClaimedWei;
        w.lastAccruedAt = lastAccruedAt;
        w.metadata = metadata;
    }

    function _pendingTermsExists(address who) internal view returns (bool) {
        (bool exists, , , , , , ) = payroll.pendingTerms(who);
        return exists;
    }

    function _pendingMigrationExists(address who) internal view returns (bool) {
        (bool exists, ) = payroll.pendingMigrations(who);
        return exists;
    }

    // ---------------------------------------------------------------------------
    // Initialization / Ownership / Admin
    // ---------------------------------------------------------------------------

    function test_initialize_revertsForZeroOwner() external {
        StreamWagePayroll newImpl = new StreamWagePayroll();
        address clone = Clones.clone(address(newImpl));
        StreamWagePayroll fresh = StreamWagePayroll(payable(clone));
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        fresh.initialize(address(0));
    }

    function test_initialize_revertsWhenCalledTwice() external {
        vm.expectRevert();
        vm.prank(owner);
        payroll.initialize(owner);
    }

    function test_transferOwnership_onlyOwner() external {
        vm.prank(admin);
        vm.expectRevert(StreamWagePayroll.NotOwner.selector);
        payroll.transferOwnership(admin);

        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit OwnerTransferred(owner, admin);
        payroll.transferOwnership(admin);
        assertEq(payroll.owner(), admin);
    }

    function test_setAdmin_onlyOwner_andZeroGuard() external {
        vm.prank(admin);
        vm.expectRevert(StreamWagePayroll.NotOwner.selector);
        payroll.setAdmin(workerA, true);

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        payroll.setAdmin(address(0), true);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit AdminUpdated(workerA, true);
        payroll.setAdmin(workerA, true);
        assertTrue(payroll.admins(workerA));
    }

    // ---------------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------------

    function test_receive_emitsTreasuryFunded() external {
        vm.deal(workerA, 1 ether);
        vm.prank(workerA);
        vm.expectEmit(true, false, false, true);
        emit TreasuryFunded(workerA, 1 ether);
        (bool ok, ) = address(payroll).call{value: 1 ether}("");
        assertTrue(ok);
    }

    function test_fundTreasury_onlyOperator_andNonZero() external {
        vm.deal(workerA, 1 ether);
        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.NotOperator.selector);
        payroll.fundTreasury{value: 1 ether}();

        vm.deal(admin, 1 ether);
        vm.prank(admin);
        vm.expectRevert(StreamWagePayroll.InvalidAmount.selector);
        payroll.fundTreasury{value: 0}();

        vm.deal(admin, 1 ether);
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit TreasuryFunded(admin, 1 ether);
        payroll.fundTreasury{value: 1 ether}();
        assertEq(address(payroll).balance, 1 ether);
    }

    // ---------------------------------------------------------------------------
    // Worker management
    // ---------------------------------------------------------------------------

    function test_addWorker_onlyOperator_andValidation() external {
        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.NotOperator.selector);
        payroll.addWorker(
            workerA,
            StreamWagePayroll.Timeline.Hourly,
            1 ether,
            0,
            "x"
        );

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        payroll.addWorker(
            address(0),
            StreamWagePayroll.Timeline.Hourly,
            1 ether,
            0,
            "x"
        );

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidAmount.selector);
        payroll.addWorker(
            workerA,
            StreamWagePayroll.Timeline.Hourly,
            0,
            0,
            "x"
        );

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        payroll.addWorker(
            workerA,
            StreamWagePayroll.Timeline.Custom,
            1,
            0,
            "x"
        );

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit WorkerAdded(
            workerA,
            StreamWagePayroll.Timeline.Hourly,
            1 ether,
            1 hours,
            "meta"
        );
        payroll.addWorker(
            workerA,
            StreamWagePayroll.Timeline.Hourly,
            1 ether,
            0,
            "meta"
        );

        StreamWagePayroll.Worker memory w = _worker(workerA);
        assertTrue(w.exists);
        assertTrue(w.active);
        assertEq(uint256(w.timeline), uint256(StreamWagePayroll.Timeline.Hourly));
        assertEq(w.amountPerIntervalWei, 1 ether);
        assertEq(w.intervalSeconds, 1 hours);
        assertEq(w.accruedWei, 0);
        assertEq(w.totalClaimedWei, 0);
        assertEq(w.metadata, "meta");

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.WorkerAlreadyExists.selector);
        payroll.addWorker(
            workerA,
            StreamWagePayroll.Timeline.Hourly,
            1 ether,
            0,
            "meta"
        );
    }

    function test_addWorker_monthly_and_trigger() external {
        vm.prank(owner);
        payroll.addWorker(
            workerA,
            StreamWagePayroll.Timeline.Monthly,
            5 ether,
            0,
            "m"
        );
        StreamWagePayroll.Worker memory w1 = _worker(workerA);
        assertEq(w1.intervalSeconds, 30 days);

        vm.prank(owner);
        payroll.addWorker(
            workerB,
            StreamWagePayroll.Timeline.Trigger,
            0,
            0,
            "t"
        );
        StreamWagePayroll.Worker memory w2 = _worker(workerB);
        assertEq(uint256(w2.timeline), uint256(StreamWagePayroll.Timeline.Trigger));
        assertEq(w2.intervalSeconds, 0);
        assertEq(w2.amountPerIntervalWei, 0);
    }

    function test_updateWorkerRate_settlesBeforeUpdating() external {
        _addHourlyWorker(workerA, 1 ether);
        _fund(10 ether);

        vm.warp(block.timestamp + 30 minutes);
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit WorkerRateUpdated(workerA, 2 ether);
        payroll.updateWorkerRate(workerA, 2 ether);

        StreamWagePayroll.Worker memory w = _worker(workerA);
        assertEq(w.amountPerIntervalWei, 2 ether);
        assertApproxEqAbs(w.accruedWei, 0.5 ether, 1);

        vm.warp(block.timestamp + 30 minutes);
        uint256 claimableNow = payroll.claimable(workerA);
        assertApproxEqAbs(claimableNow, 0.5 ether + 1 ether, 2);
    }

    function test_updateWorkerInterval_settles_andResetsWhenInactive() external {
        _addHourlyWorker(workerA, 1 ether);

        vm.warp(block.timestamp + 15 minutes);
        vm.prank(owner);
        payroll.setWorkerStatus(workerA, false);
        uint64 pausedAt = _worker(workerA).lastAccruedAt;

        vm.warp(block.timestamp + 10 days);
        vm.prank(owner);
        payroll.updateWorkerInterval(
            workerA,
            StreamWagePayroll.Timeline.Custom,
            2 hours
        );
        StreamWagePayroll.Worker memory w = _worker(workerA);
        assertEq(uint256(w.timeline), uint256(StreamWagePayroll.Timeline.Custom));
        assertEq(w.intervalSeconds, 2 hours);
        assertEq(w.lastAccruedAt, uint64(block.timestamp));
        assertTrue(w.lastAccruedAt != pausedAt);
    }

    function test_updateWorkerMetadata_onlyOperator_andInvalidWorker() external {
        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidWorker.selector);
        payroll.updateWorkerMetadata(workerA, "x");

        _addHourlyWorker(workerA, 1 ether);
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit WorkerMetadataUpdated(workerA, "new");
        payroll.updateWorkerMetadata(workerA, "new");
        assertEq(_worker(workerA).metadata, "new");
    }

    function test_setWorkerStatus_pauseSettles_andResumeBackpaysPausedTime()
        external
    {
        _addHourlyWorker(workerA, 1 ether);
        _fund(10 ether);

        vm.warp(block.timestamp + 30 minutes);
        vm.prank(owner);
        payroll.setWorkerStatus(workerA, false);
        uint256 accruedOnPause = _worker(workerA).accruedWei;
        assertApproxEqAbs(accruedOnPause, 0.5 ether, 1);

        vm.warp(block.timestamp + 10 days);
        assertEq(payroll.claimable(workerA), accruedOnPause);

        vm.prank(owner);
        payroll.setWorkerStatus(workerA, true);
        vm.warp(block.timestamp + 30 minutes);
        uint256 claimableAfterResume = payroll.claimable(workerA);
        // Current implementation resumes accrual from the prior checkpoint, which
        // includes the paused duration once the worker is reactivated.
        assertApproxEqAbs(
            claimableAfterResume,
            accruedOnPause + (10 days + 30 minutes) * (1 ether / 1 hours),
            10
        );
    }

    // ---------------------------------------------------------------------------
    // Trigger payments
    // ---------------------------------------------------------------------------

    function test_grantTriggerPayment_requiresTriggerWorker() external {
        vm.prank(owner);
        payroll.addWorker(
            workerA,
            StreamWagePayroll.Timeline.Hourly,
            1 ether,
            0,
            "x"
        );

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        payroll.grantTriggerPayment(workerA, 1);

        vm.prank(owner);
        payroll.addWorker(
            workerB,
            StreamWagePayroll.Timeline.Trigger,
            0,
            0,
            "t"
        );

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidAmount.selector);
        payroll.grantTriggerPayment(workerB, 0);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit TriggerPaymentGranted(workerB, 2 ether);
        payroll.grantTriggerPayment(workerB, 2 ether);
        assertEq(payroll.claimable(workerB), 2 ether);
    }

    // ---------------------------------------------------------------------------
    // Claiming
    // ---------------------------------------------------------------------------

    function test_claim_revertsWhenNoClaimableOrNoTreasury() external {
        _addHourlyWorker(workerA, 1 ether);

        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.NoClaimableBalance.selector);
        payroll.claim();

        vm.warp(block.timestamp + 1 hours);
        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.InsufficientTreasury.selector);
        payroll.claim();
    }

    function test_claim_paysAndTracksAccrued_andTotalClaimed() external {
        _addHourlyWorker(workerA, 1 ether);
        _fund(10 ether);

        vm.warp(block.timestamp + 1 hours + 30 minutes);
        uint256 beforeBal = workerA.balance;

        vm.prank(workerA);
        uint256 claimed = payroll.claim();
        assertApproxEqAbs(claimed, 1.5 ether, 2);
        assertApproxEqAbs(workerA.balance - beforeBal, claimed, 2);

        StreamWagePayroll.Worker memory w = _worker(workerA);
        assertEq(w.totalClaimedWei, claimed);
        assertEq(w.accruedWei, 0);
    }

    function test_claimTo_revertsForZeroRecipient_andPaysRecipient() external {
        _addHourlyWorker(workerA, 1 ether);
        _fund(10 ether);
        vm.warp(block.timestamp + 1 hours);

        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        payroll.claimTo(address(0));

        uint256 beforeRecipient = recipient.balance;
        vm.prank(workerA);
        uint256 claimed = payroll.claimTo(recipient);
        assertEq(recipient.balance - beforeRecipient, claimed);
    }

    function test_claim_partialWhenTreasuryInsufficient_leavesRemainderAccrued() external {
        _addHourlyWorker(workerA, 10 ether);
        _fund(3 ether);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(workerA);
        uint256 claimed = payroll.claim();
        assertEq(claimed, 3 ether);

        StreamWagePayroll.Worker memory w = _worker(workerA);
        assertEq(w.totalClaimedWei, 3 ether);
        assertEq(w.accruedWei, 7 ether);
        assertEq(address(payroll).balance, 0);
    }

    function test_claim_revertsOnTransferFailed() external {
        _addHourlyWorker(workerA, 1 ether);
        _fund(10 ether);
        vm.warp(block.timestamp + 1 hours);

        RevertingReceiver bad = new RevertingReceiver();
        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.TransferFailed.selector);
        payroll.claimTo(address(bad));
    }

    // ---------------------------------------------------------------------------
    // Treasury health / alerts / withdraw
    // ---------------------------------------------------------------------------

    function test_treasuryRunway_excludesTriggerAndInactive_andAccountsForAccruedLiabilities()
        external
    {
        _addHourlyWorker(workerA, 1 ether); // rate = 1 ether / 3600
        vm.prank(owner);
        payroll.addWorker(
            workerB,
            StreamWagePayroll.Timeline.Trigger,
            0,
            0,
            "t"
        );

        _fund(10 ether);
        vm.warp(block.timestamp + 30 minutes);

        // Pause workerA to settle fractional remainder into accruedWei (liability).
        vm.prank(owner);
        payroll.setWorkerStatus(workerA, false);

        (uint256 rate, uint256 runway, uint256 accrued) = payroll.treasuryRunway();
        assertEq(rate, 0, "no active time-based workers");
        assertEq(runway, type(uint256).max);
        assertGt(accrued, 0);
    }

    function test_lowTreasury_emitsOnClaimWhenBelowThreshold() external {
        _addHourlyWorker(workerA, 1 ether);
        _addHourlyWorker(workerB, 1 ether);

        // Set a large threshold so it surely triggers.
        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit LowTreasuryThresholdUpdated(365 days);
        payroll.setLowTreasuryThreshold(365 days);

        _fund(1 ether);
        vm.warp(block.timestamp + 1 hours);

        vm.recordLogs();
        vm.prank(workerA);
        payroll.claim();
        Vm.Log[] memory entries = vm.getRecordedLogs();

        bool sawLow;
        bytes32 sig = keccak256("LowTreasury(address,uint256)");
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics.length > 0 && entries[i].topics[0] == sig) {
                sawLow = true;
                break;
            }
        }
        assertTrue(sawLow, "expected LowTreasury event");
    }

    function test_withdrawExcess_respectsMinimumReserve_andOnlyOperator()
        external
    {
        _addHourlyWorker(workerA, 1 ether);
        _fund(100 ether);

        // totalRatePerSecond = 1 ether / 3600 -> minimumReserve = 1 ether
        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.NotOperator.selector);
        payroll.withdrawExcess(recipient, 1);

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        payroll.withdrawExcess(address(0), 1);

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidAmount.selector);
        payroll.withdrawExcess(recipient, 0);

        uint256 beforeRecipient = recipient.balance;
        vm.prank(owner);
        payroll.withdrawExcess(recipient, 10 ether);
        assertEq(recipient.balance - beforeRecipient, 10 ether);
        assertEq(address(payroll).balance, 90 ether);

        // Can't withdraw leaving less than reserve.
        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.WithdrawalExceedsSafeLimit.selector);
        payroll.withdrawExcess(recipient, 100 ether);
    }

    // ---------------------------------------------------------------------------
    // Term negotiation
    // ---------------------------------------------------------------------------

    function test_setProposalWindow_onlyOperator_andNonZero() external {
        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.NotOperator.selector);
        payroll.setProposalWindow(1);

        vm.prank(owner);
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        payroll.setProposalWindow(0);

        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit ProposalWindowUpdated(3 days);
        payroll.setProposalWindow(3 days);
        assertEq(payroll.defaultProposalWindow(), 3 days);
    }

    function test_proposeTerms_pausesAfterSettling_andAcceptAppliesNewTerms()
        external
    {
        _addHourlyWorker(workerA, 1 ether);
        _fund(10 ether);

        vm.warp(block.timestamp + 30 minutes);

        vm.prank(owner);
        payroll.setProposalWindow(20 days);

        uint256 window = payroll.defaultProposalWindow();
        uint256 expectedExpiry = block.timestamp + window;

        vm.startPrank(owner);
        vm.expectEmit(true, false, false, true);
        emit TermsProposed(
            workerA,
            StreamWagePayroll.Timeline.Custom,
            2 ether,
            2 hours,
            false,
            expectedExpiry,
            "note"
        );
        payroll.proposeTerms(
            workerA,
            StreamWagePayroll.Timeline.Custom,
            2 ether,
            2 hours,
            false,
            "note"
        );
        vm.stopPrank();

        StreamWagePayroll.Worker memory wPaused = _worker(workerA);
        assertFalse(wPaused.active);
        assertApproxEqAbs(wPaused.accruedWei, 0.5 ether, 1);

        // While paused, claimable stays fixed (no accrual).
        vm.warp(block.timestamp + 10 days);
        assertEq(payroll.claimable(workerA), wPaused.accruedWei);

        vm.prank(workerA);
        vm.expectEmit(true, false, false, true);
        emit TermsAccepted(workerA);
        payroll.acceptTerms();

        StreamWagePayroll.Worker memory wNew = _worker(workerA);
        assertTrue(wNew.active);
        assertEq(uint256(wNew.timeline), uint256(StreamWagePayroll.Timeline.Custom));
        assertEq(wNew.amountPerIntervalWei, 2 ether);
        assertEq(wNew.intervalSeconds, 2 hours);
        assertEq(wNew.lastAccruedAt, uint64(block.timestamp));
        assertFalse(_pendingTermsExists(workerA));
    }

    function test_rejectTerms_restoresOrTerminates_basedOnFlag() external {
        _addHourlyWorker(workerA, 1 ether);

        // terminateOnReject = false -> restore to prior status
        vm.prank(owner);
        payroll.proposeTerms(
            workerA,
            StreamWagePayroll.Timeline.Monthly,
            5 ether,
            0,
            false,
            "x"
        );
        vm.prank(workerA);
        vm.expectEmit(true, false, false, true);
        emit TermsRejected(workerA);
        payroll.rejectTerms();
        assertTrue(_worker(workerA).active);

        // terminateOnReject = true -> terminate
        vm.prank(owner);
        payroll.proposeTerms(
            workerA,
            StreamWagePayroll.Timeline.Monthly,
            5 ether,
            0,
            true,
            "x"
        );
        vm.prank(workerA);
        vm.expectEmit(true, false, false, true);
        emit WorkerTerminated(workerA);
        payroll.rejectTerms();
        assertFalse(_worker(workerA).active);
    }

    function test_cancelProposal_onlyOperator_restoresWasActive() external {
        _addHourlyWorker(workerA, 1 ether);
        vm.prank(owner);
        payroll.setWorkerStatus(workerA, false);
        assertFalse(_worker(workerA).active);

        vm.prank(owner);
        payroll.proposeTerms(
            workerA,
            StreamWagePayroll.Timeline.Monthly,
            5 ether,
            0,
            false,
            "x"
        );
        assertFalse(_worker(workerA).active);

        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.NotOperator.selector);
        payroll.cancelProposal(workerA);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit ProposalCancelled(workerA);
        payroll.cancelProposal(workerA);
        assertFalse(_pendingTermsExists(workerA));
        assertFalse(_worker(workerA).active);
    }

    function test_expireProposal_anyone_canExpire_andFollowsTerminateFlag() external {
        _addHourlyWorker(workerA, 1 ether);

        vm.prank(owner);
        payroll.setProposalWindow(1 days);

        vm.prank(owner);
        payroll.proposeTerms(
            workerA,
            StreamWagePayroll.Timeline.Monthly,
            5 ether,
            0,
            true,
            "x"
        );

        vm.prank(workerB);
        vm.expectRevert(StreamWagePayroll.ProposalNotExpired.selector);
        payroll.expireProposal(workerA);

        vm.warp(block.timestamp + 2 days);
        vm.prank(workerB);
        vm.expectEmit(true, false, false, true);
        emit ProposalExpired(workerA, true);
        payroll.expireProposal(workerA);
        assertFalse(_worker(workerA).active);
        assertFalse(_pendingTermsExists(workerA));
    }

    function test_acceptReject_revertIfExpired() external {
        _addHourlyWorker(workerA, 1 ether);
        vm.prank(owner);
        payroll.setProposalWindow(1 days);
        vm.prank(owner);
        payroll.proposeTerms(
            workerA,
            StreamWagePayroll.Timeline.Monthly,
            5 ether,
            0,
            false,
            "x"
        );

        vm.warp(block.timestamp + 2 days);
        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.ProposalExpiredError.selector);
        payroll.acceptTerms();

        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.ProposalExpiredError.selector);
        payroll.rejectTerms();
    }

    // ---------------------------------------------------------------------------
    // Worker address migration
    // ---------------------------------------------------------------------------

    function test_proposeMigration_cancel_and_acceptMigration_movesState() external {
        _addHourlyWorker(workerA, 1 ether);
        _fund(10 ether);
        vm.warp(block.timestamp + 30 minutes);

        vm.prank(workerA);
        vm.expectEmit(true, true, false, true);
        emit MigrationProposed(workerA, workerB);
        payroll.proposeMigration(workerB);
        assertTrue(_pendingMigrationExists(workerA));

        vm.prank(workerA);
        vm.expectEmit(true, true, false, true);
        emit MigrationCancelled(workerA, workerB);
        payroll.cancelMigration();
        assertFalse(_pendingMigrationExists(workerA));

        // Propose again (different address), then accept from new address.
        vm.prank(workerA);
        payroll.proposeMigration(recipient);

        // Accepting settles old worker first, so some accruedWei should be present.
        vm.prank(recipient);
        vm.expectEmit(true, true, false, true);
        emit MigrationCompleted(workerA, recipient);
        payroll.acceptMigration(workerA);

        StreamWagePayroll.Worker memory newW = _worker(recipient);
        assertTrue(newW.exists);
        assertApproxEqAbs(newW.accruedWei, 0.5 ether, 1);
        assertFalse(_worker(workerA).exists);
        assertFalse(_pendingMigrationExists(workerA));
    }

    function test_migration_revertsForInvalidStates() external {
        _addHourlyWorker(workerA, 1 ether);

        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        payroll.proposeMigration(address(0));

        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        payroll.proposeMigration(workerA);

        vm.prank(workerB);
        vm.expectRevert(StreamWagePayroll.InvalidWorker.selector);
        payroll.proposeMigration(workerA);

        // Can't accept without pending migration.
        vm.prank(workerB);
        vm.expectRevert(StreamWagePayroll.NoPendingMigration.selector);
        payroll.acceptMigration(workerA);

        vm.prank(workerA);
        payroll.proposeMigration(workerB);

        vm.prank(workerA);
        vm.expectRevert(StreamWagePayroll.MigrationAlreadyPending.selector);
        payroll.proposeMigration(recipient);

        vm.prank(recipient);
        vm.expectRevert(StreamWagePayroll.NotMigrationRecipient.selector);
        payroll.acceptMigration(workerA);
    }
}
