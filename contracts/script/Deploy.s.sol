// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
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
        // Use environment variables for deployment credentials and configuration.
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address initialOwner = vm.envOr("INITIAL_OWNER", address(0xF44d83F39578ca49a4d3E994b51455527946822d));
        string memory mode = vm.envOr("DEPLOY_MODE", string("factory"));

        console2.log("Deploying with mode:", mode);
        console2.log("Initial owner:", initialOwner);
        console2.log("Deployer address:", vm.addr(deployerPrivateKey));

        vm.startBroadcast(deployerPrivateKey);

        if (_eq(mode, "direct")) {
            StreamWagePayroll payroll = _deployPayrollProxy(initialOwner);
            console2.log("StreamWagePayroll deployed at:", address(payroll));
            _addInitialWorker(payroll);
        } else if (_eq(mode, "factory_only")) {
            StreamWagePayrollFactory factory = new StreamWagePayrollFactory();
            console2.log("StreamWagePayrollFactory deployed at:", address(factory));
            console2.log("Beacon deployed at:", address(factory.beacon()));
        } else {
            // Default: factory + payroll instance
            StreamWagePayrollFactory factory = new StreamWagePayrollFactory();
            console2.log("StreamWagePayrollFactory deployed at:", address(factory));
            console2.log("Beacon deployed at:", address(factory.beacon()));

            if (_eq(mode, "factory")) {
                StreamWagePayroll payrollViaFactory = factory.deployPayroll(initialOwner);
                console2.log("StreamWagePayroll (via factory) deployed at:", address(payrollViaFactory));
                _addInitialWorker(payrollViaFactory);
            }
        }

        vm.stopBroadcast();
    }

    function _deployPayrollProxy(address initialOwner) internal returns (StreamWagePayroll payroll) {
        StreamWagePayroll implementation = new StreamWagePayroll();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(StreamWagePayroll.initialize, (initialOwner))
        );
        payroll = StreamWagePayroll(payable(address(proxy)));
    }

    function _addInitialWorker(StreamWagePayroll payroll) internal {
        address workerAddr = 0x92fAf43CbBEce86ab3f887B9dFef3a8604b16c4B;
        uint256 amountPerIntervalWei = 5 ether;

        console2.log("Adding initial worker:", workerAddr);
        payroll.addWorker(
            workerAddr,
            StreamWagePayroll.Timeline.Monthly,
            amountPerIntervalWei,
            0,
            "Initial worker"
        );

        console2.log("Funding payroll with 1 ETH");
        payroll.fundTreasury{value: 1 ether}();
    }

    function _eq(
        string memory a,
        string memory b
    ) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
