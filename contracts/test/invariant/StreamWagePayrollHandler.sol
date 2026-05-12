// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StreamWagePayroll} from "../../src/StreamWagePayroll.sol";

contract StreamWagePayrollHandler is Test {
    StreamWagePayroll internal payroll;
    address internal owner;

    mapping(address => bool) internal knownWorker;
    mapping(address => bool) internal triggerWorker;
    mapping(address => bool) internal hasProposal;
    mapping(address => uint256) internal proposalTimestamp;
    mapping(address => bool) internal hasPendingMigration;
    mapping(address => address) internal proposedMigrationTarget;
    mapping(address => bool) internal reservedMigrationTarget;

    address[] internal workers;
    address[] internal workersWithProposals;
    address[] internal workersWithMigrations;

    uint256 private constant MAX_RATE = 5000 ether;
    uint256 private constant MIN_RATE = 1e15; // 0.001 ETH
    uint256 private constant MAX_INTERVAL = 365 days;

    constructor(address payroll_, address owner_) {
        payroll = StreamWagePayroll(payable(payroll_));
        owner = owner_;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _boundRate(uint256 rateWei) internal pure returns (uint256) {
        if (rateWei == 0) return MIN_RATE;
        return bound(rateWei, MIN_RATE, MAX_RATE);
    }

    function _boundInterval(
        StreamWagePayroll.Timeline timeline,
        uint256 customIntervalSeconds
    ) internal pure returns (uint256) {
        if (timeline == StreamWagePayroll.Timeline.Custom) {
            return bound(customIntervalSeconds, 1, MAX_INTERVAL);
        }
        return 0;
    }

    function _pickWorker(uint256 seed) internal view returns (address) {
        if (workers.length == 0) return address(0);
        return workers[seed % workers.length];
    }

    function _removeAddress(address[] storage arr, uint256 idx) internal {
        uint256 last = arr.length - 1;
        if (idx != last) arr[idx] = arr[last];
        arr.pop();
    }

    function _ensureTreasuryCoversAccrued() internal {
        (, , uint256 totalAccrued) = payroll.treasuryRunway();
        uint256 bal = address(payroll).balance;
        if (bal < totalAccrued) {
            vm.deal(address(payroll), totalAccrued);
        }
    }

    function _isExistingWorker(address who) internal view returns (bool) {
        (bool exists, , , , , , , , ) = payroll.workers(who);
        return exists;
    }

    // -------------------------------------------------------------------------
    // Operators / Treasury
    // -------------------------------------------------------------------------

    function fundTreasury(uint256 amountWei) public {
        amountWei = bound(amountWei, 0.01 ether, 50 ether);
        vm.deal(owner, owner.balance + amountWei);
        vm.prank(owner);
        payroll.fundTreasury{value: amountWei}();
    }

    function setProposalWindow(uint256 durationSeconds) external {
        durationSeconds = bound(durationSeconds, 1, 30 days);
        vm.prank(owner);
        payroll.setProposalWindow(durationSeconds);
    }

    // -------------------------------------------------------------------------
    // Worker lifecycle
    // -------------------------------------------------------------------------

    function addWorker(
        address workerAddr,
        StreamWagePayroll.Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 customIntervalSeconds,
        string calldata metadata
    ) external {
        if (workerAddr == address(0)) return;
        if (knownWorker[workerAddr]) return;
        if (_isExistingWorker(workerAddr)) {
            knownWorker[workerAddr] = true;
            return;
        }

        if (timeline == StreamWagePayroll.Timeline.Trigger) {
            amountPerIntervalWei = 0;
            customIntervalSeconds = 0;
        } else {
            amountPerIntervalWei = _boundRate(amountPerIntervalWei);
            customIntervalSeconds = _boundInterval(timeline, customIntervalSeconds);
        }

        vm.prank(owner);
        try
            payroll.addWorker(
                workerAddr,
                timeline,
                amountPerIntervalWei,
                customIntervalSeconds,
                metadata
            )
        {
            knownWorker[workerAddr] = true;
            workers.push(workerAddr);
            if (timeline == StreamWagePayroll.Timeline.Trigger) {
                triggerWorker[workerAddr] = true;
            }
        } catch {
            // ignore fuzz-invalid combos (e.g. Custom with 0 interval if bound changes)
        }
    }

    function updateWorkerRate(uint256 seed, uint256 amountPerIntervalWei) external {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return;

        // Trigger workers may be set to 0; time-based workers must be non-zero.
        if (triggerWorker[workerAddr]) {
            amountPerIntervalWei = bound(amountPerIntervalWei, 0, MAX_RATE);
        } else {
            amountPerIntervalWei = _boundRate(amountPerIntervalWei);
        }

        vm.prank(owner);
        try payroll.updateWorkerRate(workerAddr, amountPerIntervalWei) {} catch {}
    }

    function updateWorkerInterval(
        uint256 seed,
        StreamWagePayroll.Timeline timeline,
        uint256 customIntervalSeconds
    ) external {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return;

        customIntervalSeconds = _boundInterval(timeline, customIntervalSeconds);
        vm.prank(owner);
        try payroll.updateWorkerInterval(workerAddr, timeline, customIntervalSeconds) {} catch {}
    }

    function updateWorkerMetadata(uint256 seed, string calldata metadata) external {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return;
        vm.prank(owner);
        try payroll.updateWorkerMetadata(workerAddr, metadata) {} catch {}
    }

    function setWorkerStatus(uint256 seed, bool active) external {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return;
        vm.prank(owner);
        try payroll.setWorkerStatus(workerAddr, active) {} catch {}
    }

    function grantTriggerPayment(uint256 seed, uint256 amountWei) external {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return;
        if (!triggerWorker[workerAddr]) return;
        amountWei = bound(amountWei, MIN_RATE, MAX_RATE);
        vm.prank(owner);
        try payroll.grantTriggerPayment(workerAddr, amountWei) {} catch {}
    }

    // -------------------------------------------------------------------------
    // Claims / Time
    // -------------------------------------------------------------------------

    function warp(uint256 secondsForward) external {
        secondsForward = bound(secondsForward, 1, 30 days);
        vm.warp(block.timestamp + secondsForward);
    }

    function claim(uint256 seed) external returns (uint256 claimedAmount) {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return 0;

        _ensureTreasuryCoversAccrued();

        vm.prank(workerAddr);
        try payroll.claim() returns (uint256 amt) {
            return amt;
        } catch {
            return 0;
        }
    }

    function claimTo(uint256 seed, address recipient) external returns (uint256 claimedAmount) {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return 0;
        if (recipient == address(0)) return 0;

        _ensureTreasuryCoversAccrued();

        vm.prank(workerAddr);
        try payroll.claimTo(recipient) returns (uint256 amt) {
            return amt;
        } catch {
            return 0;
        }
    }

    function claimable(address workerAddr) external view returns (uint256) {
        return payroll.claimable(workerAddr);
    }

    function treasuryRunway()
        external
        view
        returns (
            uint256 totalRatePerSecond,
            uint256 estimatedRunwaySeconds,
            uint256 totalAccrued
        )
    {
        return payroll.treasuryRunway();
    }

    function workerRunway(uint256 seed) external view returns (uint256) {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return 0;
        return payroll.workerRunway(workerAddr);
    }

    // -------------------------------------------------------------------------
    // Term negotiation
    // -------------------------------------------------------------------------

    function proposeTerms(
        uint256 seed,
        StreamWagePayroll.Timeline timeline,
        uint256 amountPerIntervalWei,
        uint256 customIntervalSeconds,
        bool terminateOnReject,
        string calldata proposalNote
    ) external {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return;
        if (hasProposal[workerAddr]) return;

        if (timeline == StreamWagePayroll.Timeline.Trigger) {
            amountPerIntervalWei = 0;
            customIntervalSeconds = 0;
        } else {
            amountPerIntervalWei = _boundRate(amountPerIntervalWei);
            customIntervalSeconds = _boundInterval(timeline, customIntervalSeconds);
        }

        vm.prank(owner);
        try
            payroll.proposeTerms(
                workerAddr,
                timeline,
                amountPerIntervalWei,
                customIntervalSeconds,
                terminateOnReject,
                proposalNote
            )
        {
            hasProposal[workerAddr] = true;
            proposalTimestamp[workerAddr] = block.timestamp;
            workersWithProposals.push(workerAddr);
        } catch {}
    }

    function acceptTerms(uint256 seed) external {
        if (workersWithProposals.length == 0) return;
        address workerAddr = workersWithProposals[seed % workersWithProposals.length];

        vm.prank(workerAddr);
        try payroll.acceptTerms() {
            hasProposal[workerAddr] = false;
            proposalTimestamp[workerAddr] = 0;
            _removeProposalWorker(workerAddr);
        } catch {}
    }

    function rejectTerms(uint256 seed) external {
        if (workersWithProposals.length == 0) return;
        address workerAddr = workersWithProposals[seed % workersWithProposals.length];

        vm.prank(workerAddr);
        try payroll.rejectTerms() {
            hasProposal[workerAddr] = false;
            proposalTimestamp[workerAddr] = 0;
            _removeProposalWorker(workerAddr);
        } catch {}
    }

    function cancelProposal(uint256 seed) external {
        if (workersWithProposals.length == 0) return;
        address workerAddr = workersWithProposals[seed % workersWithProposals.length];

        vm.prank(owner);
        try payroll.cancelProposal(workerAddr) {
            hasProposal[workerAddr] = false;
            proposalTimestamp[workerAddr] = 0;
            _removeProposalWorker(workerAddr);
        } catch {}
    }

    function expireProposal(uint256 seed, address caller) external {
        if (workersWithProposals.length == 0) return;
        address workerAddr = workersWithProposals[seed % workersWithProposals.length];

        vm.prank(caller);
        try payroll.expireProposal(workerAddr) {
            hasProposal[workerAddr] = false;
            proposalTimestamp[workerAddr] = 0;
            _removeProposalWorker(workerAddr);
        } catch {}
    }

    function _removeProposalWorker(address workerAddr) internal {
        uint256 len = workersWithProposals.length;
        for (uint256 i = 0; i < len; i++) {
            if (workersWithProposals[i] == workerAddr) {
                _removeAddress(workersWithProposals, i);
                return;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Address migration
    // -------------------------------------------------------------------------

    function proposeMigration(uint256 seed, address newAddress) external {
        address workerAddr = _pickWorker(seed);
        if (workerAddr == address(0)) return;
        if (newAddress == address(0) || newAddress == workerAddr) return;
        if (hasPendingMigration[workerAddr]) return;
        if (reservedMigrationTarget[newAddress]) return;
        if (knownWorker[newAddress] || _isExistingWorker(newAddress)) return;

        vm.prank(workerAddr);
        try payroll.proposeMigration(newAddress) {
            hasPendingMigration[workerAddr] = true;
            proposedMigrationTarget[workerAddr] = newAddress;
            reservedMigrationTarget[newAddress] = true;
            workersWithMigrations.push(workerAddr);
        } catch {}
    }

    function cancelMigration(uint256 seed) external {
        if (workersWithMigrations.length == 0) return;
        address workerAddr = workersWithMigrations[seed % workersWithMigrations.length];
        address newAddress = proposedMigrationTarget[workerAddr];

        vm.prank(workerAddr);
        try payroll.cancelMigration() {
            hasPendingMigration[workerAddr] = false;
            proposedMigrationTarget[workerAddr] = address(0);
            reservedMigrationTarget[newAddress] = false;
            _removeMigrationWorker(workerAddr);
        } catch {}
    }

    function acceptMigration(uint256 seed) external {
        if (workersWithMigrations.length == 0) return;
        address oldAddress = workersWithMigrations[seed % workersWithMigrations.length];
        address newAddress = proposedMigrationTarget[oldAddress];
        if (newAddress == address(0)) return;

        vm.prank(newAddress);
        try payroll.acceptMigration(oldAddress) {
            hasPendingMigration[oldAddress] = false;
            proposedMigrationTarget[oldAddress] = address(0);
            reservedMigrationTarget[newAddress] = false;
            knownWorker[newAddress] = true;
            workers.push(newAddress);
            _removeMigrationWorker(oldAddress);
        } catch {}
    }

    function _removeMigrationWorker(address workerAddr) internal {
        uint256 len = workersWithMigrations.length;
        for (uint256 i = 0; i < len; i++) {
            if (workersWithMigrations[i] == workerAddr) {
                _removeAddress(workersWithMigrations, i);
                return;
            }
        }
    }
}

