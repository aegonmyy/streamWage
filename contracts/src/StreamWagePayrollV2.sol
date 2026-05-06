// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StreamWagePayroll} from "./StreamWagePayroll.sol";

contract StreamWagePayrollV2 is StreamWagePayroll {
    string public payrollLabel;

    function version() external pure returns (uint256) {
        return 2;
    }

    function setPayrollLabel(string calldata newLabel) external onlyOwner {
        payrollLabel = newLabel;
    }
}
