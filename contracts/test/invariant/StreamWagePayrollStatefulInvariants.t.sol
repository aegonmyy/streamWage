// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {StreamWagePayroll} from "../../src/StreamWagePayroll.sol";

contract StreamWagePayrollHandler is Test {
    StreamWagePayroll internal immutable payroll;

    address internal immutable owner;
    address internal immutable admin;
    address[] internal workers;
    uint256 internal totalFunded;

    constructor(StreamWagePayroll _payroll, address _owner, address _admin, address[] memory _workers, uint256 initialFunded) {
        payroll = _payroll;
        owner = _owner;
        admin = _admin;
        workers = _workers;
        totalFunded = initialFunded;
    }

    function warpTime(uint256 jumpSeconds) external {
        jumpSeconds = bound(jumpSeconds, 0, 30 days);
        vm.warp(block.timestamp + jumpSeconds);
    }

    function fundTreasury(uint256 amountWei) external {
        amountWei = bound(amountWei, 1 wei, 3 ether);
        vm.deal(owner, owner.balance + amountWei);
        vm.prank(owner);
        payroll.fundTreasury{value: amountWei}();
        totalFunded += amountWei;
    }

    function grantTrigger(uint256 amountWei) external {
        amountWei = bound(amountWei, 1 wei, 2 ether);
        vm.prank(admin);
        payroll.grantTriggerPayment(workers[3], amountWei);
    }

    function setWorkerActive(uint8 workerSeed, bool active) external {
        uint256 workerIndex = uint256(workerSeed) % workers.length;
        vm.prank(admin);
        payroll.setWorkerStatus(workers[workerIndex], active);
    }

    function workerClaim(uint8 workerSeed) external {
        uint256 workerIndex = uint256(workerSeed) % workers.length;
        address worker = workers[workerIndex];
        uint256 claimableAmount = payroll.claimable(worker);
        if (claimableAmount == 0 || claimableAmount > address(payroll).balance) return;

        vm.prank(worker);
        payroll.claim();
    }

    function workerClaimTo(uint8 workerSeed, uint8 recipientSeed) external {
        uint256 workerIndex = uint256(workerSeed) % workers.length;
        uint256 recipientIndex = uint256(recipientSeed) % workers.length;
        address worker = workers[workerIndex];
        address recipient = workers[recipientIndex];
        uint256 claimableAmount = payroll.claimable(worker);
        if (claimableAmount == 0 || claimableAmount > address(payroll).balance) return;

        vm.prank(worker);
        payroll.claimTo(recipient);
    }

    function getWorkers() external view returns (address[] memory) {
        return workers;
    }

    function getTotalFunded() external view returns (uint256) {
        return totalFunded;
    }
}

contract StreamWagePayrollStatefulInvariants is StdInvariant, Test {
    StreamWagePayroll internal payroll;
    StreamWagePayrollHandler internal handler;

    address internal owner = address(0xA11CE);
    address internal admin = address(0xB0B);
    address internal hourlyWorker = address(0x1111);
    address internal monthlyWorker = address(0x2222);
    address internal customWorker = address(0x3333);
    address internal triggerWorker = address(0x4444);

    function setUp() public {
        vm.prank(owner);
        payroll = new StreamWagePayroll(owner);

        vm.prank(owner);
        payroll.setAdmin(admin, true);

        vm.deal(owner, 1_000 ether);
        vm.prank(owner);
        payroll.fundTreasury{value: 100 ether}();

        vm.prank(admin);
        payroll.addWorker(hourlyWorker, StreamWagePayroll.Timeline.Hourly, 0.25 ether, 0, "hourly");
        vm.prank(admin);
        payroll.addWorker(monthlyWorker, StreamWagePayroll.Timeline.Monthly, 3 ether, 0, "monthly");
        vm.prank(admin);
        payroll.addWorker(customWorker, StreamWagePayroll.Timeline.Custom, 0.5 ether, 2 days, "custom");
        vm.prank(admin);
        payroll.addWorker(triggerWorker, StreamWagePayroll.Timeline.Trigger, 0, 0, "trigger");

        address[] memory workerList = new address[](4);
        workerList[0] = hourlyWorker;
        workerList[1] = monthlyWorker;
        workerList[2] = customWorker;
        workerList[3] = triggerWorker;

        handler = new StreamWagePayrollHandler(payroll, owner, admin, workerList, 100 ether);
        targetContract(address(handler));
    }

    function invariant_TreasuryAccountingConserved() public view {
        address[] memory workerList = handler.getWorkers();
        uint256 totalClaimed;
        for (uint256 i = 0; i < workerList.length; i++) {
            (, , , , , , uint256 claimedWei, , ) = payroll.workers(workerList[i]);
            totalClaimed += claimedWei;
        }

        assertEq(totalClaimed + address(payroll).balance, handler.getTotalFunded());
    }

    function invariant_ClaimableNeverBelowAccrued() public view {
        address[] memory workerList = handler.getWorkers();
        for (uint256 i = 0; i < workerList.length; i++) {
            (, bool active, StreamWagePayroll.Timeline timeline, , , uint256 accruedWei, , , ) =
                payroll.workers(workerList[i]);
            uint256 claimableWei = payroll.claimable(workerList[i]);

            assertGe(claimableWei, accruedWei);
            if (!active || timeline == StreamWagePayroll.Timeline.Trigger) {
                assertEq(claimableWei, accruedWei);
            }
        }
    }

    function invariant_OwnerRemainsUnchanged() public view {
        assertEq(payroll.owner(), owner);
    }
}
