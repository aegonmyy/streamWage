// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {StreamWagePayroll} from "./StreamWagePayroll.sol";

/// @title StreamWagePayrollFactory
/// @notice Deploys independent StreamWagePayroll beacon proxies so each customer gets isolated state.
contract StreamWagePayrollFactory {
    StreamWagePayroll public immutable implementation;
    UpgradeableBeacon public immutable beacon;

    /// @notice Emitted when a new payroll contract is created.
    /// @param payroll Address of the deployed payroll instance.
    /// @param owner Initial owner of that instance.
    /// @param deployedBy Address that called the factory (may differ from owner).
    event PayrollDeployed(address indexed payroll, address indexed owner, address indexed deployedBy);

    constructor() {
        implementation = new StreamWagePayroll();
        beacon = new UpgradeableBeacon(address(implementation), msg.sender);
    }

    /// @notice Deploys a new payroll instance with the given owner.
    /// @param initialOwner Owner of the new instance (cannot be zero).
    /// @return payroll The newly deployed contract.
    function deployPayroll(address initialOwner) external returns (StreamWagePayroll payroll) {
        BeaconProxy proxy = new BeaconProxy(
            address(beacon),
            abi.encodeCall(StreamWagePayroll.initialize, (initialOwner))
        );
        payroll = StreamWagePayroll(payable(address(proxy)));
        emit PayrollDeployed(address(payroll), initialOwner, msg.sender);
    }
}
