// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {StreamWagePayroll} from "../src/StreamWagePayroll.sol";
import {StreamWagePayrollFactory} from "../src/StreamWagePayrollFactory.sol";

/// @notice Foundry deployment script.
/// @dev Usage examples:
///      - Deploy factory only:
///        DEPLOY_MODE=factory_only forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast
///      - Deploy payroll directly (no factory):
///        INITIAL_OWNER=0x... DEPLOY_MODE=direct forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast
///      - Deploy factory and then a payroll through it:
///        INITIAL_OWNER=0x... DEPLOY_MODE=factory forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast
contract Deploy is Script {
    function run() external {
        // Use vm.envUint and vm.envAddress to read from environment variables.
        // Fallback to hardcoded values if not provided (keeping existing values as defaults).
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xe83bbb5223339d634ca6f0eb5225b9a0b611e3038a6eef7a44b66cab1b3907d5));
        address initialOwner = vm.envOr("INITIAL_OWNER", address(0xF44d83F39578ca49a4d3E994b51455527946822d));
        string memory mode = vm.envOr("DEPLOY_MODE", string("factory"));

        console2.log("Deploying with mode:", mode);
        console2.log("Initial owner:", initialOwner);

        vm.startBroadcast(deployerPrivateKey);

        if (_eq(mode, "direct")) {
            StreamWagePayroll payroll = new StreamWagePayroll(initialOwner);
            console2.log("StreamWagePayroll deployed at:", address(payroll));
        } else if (_eq(mode, "factory_only")) {
            StreamWagePayrollFactory factory = new StreamWagePayrollFactory();
            console2.log("StreamWagePayrollFactory deployed at:", address(factory));
        } else {
            // Default: factory + payroll instance
            StreamWagePayrollFactory factory = new StreamWagePayrollFactory();
            console2.log("StreamWagePayrollFactory deployed at:", address(factory));

            if (_eq(mode, "factory")) {
                StreamWagePayroll payrollViaFactory = factory.deployPayroll(initialOwner);
                console2.log("StreamWagePayroll (via factory) deployed at:", address(payrollViaFactory));
            }
        }

        vm.stopBroadcast();
    }

    function _eq(
        string memory a,
        string memory b
    ) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
