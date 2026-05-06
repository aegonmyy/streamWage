// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Test} from "forge-std/Test.sol";
import {StreamWagePayroll} from "../../src/StreamWagePayroll.sol";

contract StreamWagePayrollStatelessInvariants is Test {
    StreamWagePayroll internal payroll;

    address internal owner = address(0xA11CE);
    address internal admin = address(0xB0B);
    address internal hourlyWorker = address(0x1111);
    address internal monthlyWorker = address(0x2222);
    address internal customWorker = address(0x3333);
    address internal triggerWorker = address(0x4444);

    function setUp() public {
        payroll = _deployPayroll(owner);

        vm.prank(owner);
        payroll.setAdmin(admin, true);

        vm.deal(owner, 200 ether);
        vm.prank(owner);
        payroll.fundTreasury{value: 100 ether}();

        vm.prank(admin);
        payroll.addWorker(hourlyWorker, StreamWagePayroll.Timeline.Hourly, 1 ether, 0, "hourly");

        vm.prank(admin);
        payroll.addWorker(monthlyWorker, StreamWagePayroll.Timeline.Monthly, 10 ether, 0, "monthly");

        vm.prank(admin);
        payroll.addWorker(customWorker, StreamWagePayroll.Timeline.Custom, 2 ether, 2 days, "custom");

        vm.prank(admin);
        payroll.addWorker(triggerWorker, StreamWagePayroll.Timeline.Trigger, 0, 0, "trigger");
    }

    function invariant_IntervalsMatchTimelineConfiguration() public view {
        (
            ,
            ,
            StreamWagePayroll.Timeline t1,
            ,
            uint256 i1,
            ,
            ,
            ,
            
        ) = payroll.workers(hourlyWorker);
        assertEq(uint256(t1), uint256(StreamWagePayroll.Timeline.Hourly));
        assertEq(i1, 1 hours);

        (
            ,
            ,
            StreamWagePayroll.Timeline t2,
            ,
            uint256 i2,
            ,
            ,
            ,
            
        ) = payroll.workers(monthlyWorker);
        assertEq(uint256(t2), uint256(StreamWagePayroll.Timeline.Monthly));
        assertEq(i2, 30 days);

        (
            ,
            ,
            StreamWagePayroll.Timeline t3,
            ,
            uint256 i3,
            ,
            ,
            ,
            
        ) = payroll.workers(customWorker);
        assertEq(uint256(t3), uint256(StreamWagePayroll.Timeline.Custom));
        assertEq(i3, 2 days);

        (
            ,
            ,
            StreamWagePayroll.Timeline t4,
            ,
            uint256 i4,
            ,
            ,
            ,
            
        ) = payroll.workers(triggerWorker);
        assertEq(uint256(t4), uint256(StreamWagePayroll.Timeline.Trigger));
        assertEq(i4, 0);
    }

    function invariant_ClaimableRespectsAccruedLowerBound() public view {
        _assertClaimableAtLeastAccrued(hourlyWorker);
        _assertClaimableAtLeastAccrued(monthlyWorker);
        _assertClaimableAtLeastAccrued(customWorker);
        _assertClaimableAtLeastAccrued(triggerWorker);
    }

    function invariant_TriggerWorkerClaimableEqualsAccrued() public view {
        (, , , , , uint256 accrued, , , ) = payroll.workers(triggerWorker);
        assertEq(payroll.claimable(triggerWorker), accrued);
    }

    function _assertClaimableAtLeastAccrued(address worker) internal view {
        (, bool active, StreamWagePayroll.Timeline timeline, , , uint256 accrued, , , ) = payroll.workers(worker);
        uint256 claimableAmount = payroll.claimable(worker);

        assertGe(claimableAmount, accrued);
        if (!active || timeline == StreamWagePayroll.Timeline.Trigger) {
            assertEq(claimableAmount, accrued);
        }
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
