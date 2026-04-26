// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {StreamWagePayroll} from "../src/StreamWagePayroll.sol";
import {StreamWagePayrollFactory} from "../src/StreamWagePayrollFactory.sol";

/// @notice Foundry deployment script.
/// @dev Usage examples:
///      - Deploy factory only:
///        forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
///      - Deploy payroll directly (no factory):
///        INITIAL_OWNER=0x... DEPLOY_MODE=direct forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
///      - Deploy factory and then a payroll through it:
///        INITIAL_OWNER=0x... DEPLOY_MODE=factory forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    function run() external {
        // Foundry will also inject the private key when you pass --private-key,
        // but reading from env keeps it compatible with CI/CD setups.
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address initialOwner = vm.envOr("INITIAL_OWNER", msg.sender);
        string memory mode = vm.envOr("DEPLOY_MODE", string("factory"));

        vm.startBroadcast(pk);

        if (_eq(mode, "direct")) {
            StreamWagePayroll payroll = new StreamWagePayroll(initialOwner);
            console2.log("StreamWagePayroll deployed at", address(payroll));
        } else {
            StreamWagePayrollFactory factory = new StreamWagePayrollFactory();
            console2.log(
                "StreamWagePayrollFactory deployed at",
                address(factory)
            );

            if (_eq(mode, "factory")) {
                StreamWagePayroll payrollViaFactory = factory.deployPayroll(
                    initialOwner
                );
                console2.log(
                    "StreamWagePayroll deployed at",
                    address(payrollViaFactory)
                );
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
