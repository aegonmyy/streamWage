// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {StreamWagePayroll} from "../../src/StreamWagePayroll.sol";
import {StreamWagePayrollHandler} from "./StreamWagePayrollHandler.sol";

contract StreamWagePayrollHarness is StdInvariant, Test {
    StreamWagePayroll internal impl;
    StreamWagePayroll internal payroll;
    StreamWagePayrollHandler internal handler;

    address internal owner = makeAddr("owner");

    function setUp() external {
        impl = new StreamWagePayroll();

        address clone = Clones.clone(address(impl));
        payroll = StreamWagePayroll(payable(clone));
        payroll.initialize(owner);

        vm.deal(owner, 10_000 ether);

        handler = new StreamWagePayrollHandler(address(payroll), owner);
        targetContract(address(handler));
    }

    function test_harnessDeploys() external view {
        assertEq(payroll.owner(), owner);
    }
}
