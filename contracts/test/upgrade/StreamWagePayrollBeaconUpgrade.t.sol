// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {StreamWagePayroll} from "../../src/StreamWagePayroll.sol";
import {StreamWagePayrollFactory} from "../../src/StreamWagePayrollFactory.sol";
import {StreamWagePayrollV2} from "../../src/StreamWagePayrollV2.sol";

contract StreamWagePayrollBeaconUpgradeTest is Test {
    StreamWagePayrollFactory internal factory;

    address internal owner = address(0xA11CE);
    address internal admin = address(0xB0B);
    address internal worker = address(0x1111);
    address internal outsider = address(0x3333);

    function setUp() public {
        factory = new StreamWagePayrollFactory();
    }

    function test_OnlyBeaconOwnerCanUpgrade() public {
        StreamWagePayrollV2 nextImplementation = new StreamWagePayrollV2();
        UpgradeableBeacon beacon = factory.beacon();

        vm.prank(outsider);
        vm.expectRevert();
        beacon.upgradeTo(address(nextImplementation));
    }

    function test_UpgradePreservesStateForExistingProxy() public {
        StreamWagePayroll payroll = factory.deployPayroll(owner);

        vm.prank(owner);
        payroll.setAdmin(admin, true);

        vm.deal(owner, 20 ether);
        vm.prank(owner);
        payroll.fundTreasury{value: 10 ether}();

        vm.prank(admin);
        payroll.addWorker(worker, StreamWagePayroll.Timeline.Hourly, 2 ether, 0, "engineer");

        vm.warp(block.timestamp + 2 hours);

        uint256 claimableBefore = payroll.claimable(worker);
        assertEq(claimableBefore, 4 ether);
        assertEq(payroll.owner(), owner);
        assertTrue(payroll.admins(admin));

        StreamWagePayrollV2 nextImplementation = new StreamWagePayrollV2();
        factory.beacon().upgradeTo(address(nextImplementation));

        StreamWagePayrollV2 upgraded = StreamWagePayrollV2(payable(address(payroll)));

        assertEq(upgraded.version(), 2);
        assertEq(upgraded.owner(), owner);
        assertTrue(upgraded.admins(admin));
        assertEq(upgraded.claimable(worker), claimableBefore);

        (
            bool existsAfter,
            bool activeAfter,
            StreamWagePayroll.Timeline timelineAfter,
            uint256 amountAfter,
            uint256 intervalAfter,
            uint256 accruedAfter,
            uint256 claimedAfter,
            ,
            string memory metadataAfter
        ) = upgraded.workers(worker);

        assertTrue(existsAfter);
        assertTrue(activeAfter);
        assertEq(uint256(timelineAfter), uint256(StreamWagePayroll.Timeline.Hourly));
        assertEq(amountAfter, 2 ether);
        assertEq(intervalAfter, 1 hours);
        assertEq(accruedAfter, 0);
        assertEq(claimedAfter, 0);
        assertEq(metadataAfter, "engineer");

        vm.prank(owner);
        upgraded.setPayrollLabel("v2-live");
        assertEq(upgraded.payrollLabel(), "v2-live");

        vm.prank(worker);
        upgraded.claim();
        assertEq(worker.balance, 4 ether);
    }

    function test_NewDeploymentsUseUpgradedImplementation() public {
        StreamWagePayrollV2 nextImplementation = new StreamWagePayrollV2();
        factory.beacon().upgradeTo(address(nextImplementation));

        StreamWagePayrollV2 payroll = StreamWagePayrollV2(payable(address(factory.deployPayroll(owner))));

        assertEq(payroll.version(), 2);

        vm.prank(owner);
        payroll.setPayrollLabel("fresh-v2");
        assertEq(payroll.payrollLabel(), "fresh-v2");
    }
}
