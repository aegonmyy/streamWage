// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StreamWagePayroll} from "./StreamWagePayroll.sol";

/// @title StreamWagePayrollFactory
/// @notice Deploys independent StreamWagePayroll instances so each customer gets their own treasury and owner.
contract StreamWagePayrollFactory {
    /// @notice Emitted when a new payroll contract is created.
    /// @param payroll Address of the deployed payroll instance.
    /// @param owner Initial owner of that instance.
    /// @param deployedBy Address that called the factory (may differ from owner).
    event PayrollDeployed(address indexed payroll, address indexed owner, address indexed deployedBy);

    /// @notice Deploys a new payroll instance with the given owner.
    /// @param initialOwner Owner of the new instance (cannot be zero).
    /// @return payroll The newly deployed contract.
    function deployPayroll(address initialOwner) external returns (StreamWagePayroll payroll) {
        payroll = new StreamWagePayroll(initialOwner);
        emit PayrollDeployed(address(payroll), initialOwner, msg.sender);
    }
}
