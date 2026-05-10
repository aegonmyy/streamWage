// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Test} from "forge-std/Test.sol";
import {StreamWagePayroll} from "../src/StreamWagePayroll.sol";

contract StreamWagePayrollTest is Test {
    StreamWagePayroll internal payroll;

    address internal owner = address(0xA11CE);
    address internal admin = address(0xB0B);
    address internal worker1 = address(0x1111);
    address internal worker2 = address(0x2222);
    address internal outsider = address(0x3333);

    function setUp() public {
        payroll = _deployPayroll(owner);

        vm.prank(owner);
        payroll.setAdmin(admin, true);

        vm.deal(owner, 100 ether);
        vm.prank(owner);
        payroll.fundTreasury{value: 20 ether}();
    }

    function test_HourlyWorkerAccruesAndClaims() public {
        vm.prank(admin);
        payroll.addWorker(worker1, StreamWagePayroll.Timeline.Hourly, 1 ether, 0, "dev-hourly");

        vm.warp(block.timestamp + 2 hours + 30 minutes);

        vm.prank(worker1);
        payroll.claim();

        assertEq(worker1.balance, 2 ether);

        (,,,,, uint256 accruedWei, uint256 totalClaimedWei,,) = payroll.workers(worker1);
        assertEq(accruedWei, 0);
        assertEq(totalClaimedWei, 2 ether);
    }

    function test_MonthlyWorkerClaimsSingleInterval() public {
        vm.prank(admin);
        payroll.addWorker(worker1, StreamWagePayroll.Timeline.Monthly, 5 ether, 0, "dev-monthly");

        vm.warp(block.timestamp + 45 days);

        vm.prank(worker1);
        payroll.claim();

        assertEq(worker1.balance, 5 ether);
    }

    function test_CustomIntervalAccrual() public {
        vm.prank(admin);
        payroll.addWorker(worker1, StreamWagePayroll.Timeline.Custom, 0.5 ether, 3 days, "custom");

        vm.warp(block.timestamp + 10 days);
        assertEq(payroll.claimable(worker1), 1.5 ether);

        vm.prank(worker1);
        payroll.claim();
        assertEq(worker1.balance, 1.5 ether);
    }

    function test_TriggerWorkerGetsPaidWhenGranted() public {
        vm.prank(admin);
        payroll.addWorker(worker2, StreamWagePayroll.Timeline.Trigger, 0, 0, "milestone");

        vm.prank(admin);
        payroll.grantTriggerPayment(worker2, 3 ether);

        vm.prank(worker2);
        payroll.claim();

        assertEq(worker2.balance, 3 ether);
    }

    function test_OnlyOperatorCanManageWorkers() public {
        vm.prank(outsider);
        vm.expectRevert(StreamWagePayroll.NotOperator.selector);
        payroll.addWorker(worker1, StreamWagePayroll.Timeline.Hourly, 1 ether, 0, "nope");
    }

    function test_InsufficientTreasuryPaysPartialClaim() public {
        vm.prank(admin);
        payroll.addWorker(worker1, StreamWagePayroll.Timeline.Hourly, 50 ether, 0, "expensive");

        vm.warp(block.timestamp + 1 hours);

        vm.prank(worker1);
        payroll.claim();

        assertEq(worker1.balance, 20 ether);
        (,,,,, uint256 accruedWei, uint256 totalClaimedWei,,) = payroll.workers(worker1);
        assertEq(accruedWei, 30 ether);
        assertEq(totalClaimedWei, 20 ether);
    }

    function test_WorkerCanClaimToRecipient() public {
        vm.prank(admin);
        payroll.addWorker(worker1, StreamWagePayroll.Timeline.Hourly, 1 ether, 0, "delegate-claim");

        vm.warp(block.timestamp + 1 hours);

        vm.prank(worker1);
        payroll.claimTo(outsider);

        assertEq(outsider.balance, 1 ether);
    }

    function test_InitializeRevertsOnSecondCall() public {
        vm.expectRevert();
        payroll.initialize(owner);
    }

    function _deployPayroll(address initialOwner) internal returns (StreamWagePayroll proxyInstance) {
        StreamWagePayroll implementation = new StreamWagePayroll();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(StreamWagePayroll.initialize, (initialOwner))
        );
        proxyInstance = StreamWagePayroll(payable(address(proxy)));
    }
}
