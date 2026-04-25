// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StreamWagePayroll} from "../src/StreamWagePayroll.sol";
import {StreamWagePayrollFactory} from "../src/StreamWagePayrollFactory.sol";

contract StreamWagePayrollFactoryTest is Test {
    StreamWagePayrollFactory internal factory;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        factory = new StreamWagePayrollFactory();
    }

    function test_DeployPayroll_SetsOwnerAndEmits() public {
        uint256 nonce = vm.getNonce(address(factory));
        address predicted = vm.computeCreateAddress(address(factory), nonce);

        vm.expectEmit(true, true, true, true);
        emit StreamWagePayrollFactory.PayrollDeployed(predicted, alice, bob);

        vm.prank(bob);
        StreamWagePayroll payroll = factory.deployPayroll(alice);

        assertEq(address(payroll), predicted);
        assertEq(payroll.owner(), alice);
    }

    function test_DeployPayroll_TwoInstancesIndependent() public {
        StreamWagePayroll p1 = factory.deployPayroll(alice);
        StreamWagePayroll p2 = factory.deployPayroll(bob);

        assertTrue(address(p1) != address(p2));
        assertEq(p1.owner(), alice);
        assertEq(p2.owner(), bob);
    }

    function test_DeployPayroll_RevertsOnZeroOwner() public {
        vm.expectRevert(StreamWagePayroll.InvalidConfiguration.selector);
        factory.deployPayroll(address(0));
    }
}
