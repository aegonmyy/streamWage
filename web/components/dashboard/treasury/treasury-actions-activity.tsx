"use client";

import { FundTreasuryPanel } from "./fund-treasury-panel";
import { WithdrawExcessPanel } from "./withdraw-excess-panel";
import { LowTreasuryThresholdPanel } from "./low-treasury-threshold-panel";
import { RecentActivityFeed } from "./recent-activity-feed";

interface TreasuryActionsActivityProps {
  contractBalance: bigint;
  totalRatePerSecond: bigint;
  refetchTreasuryData: () => void;
}

export function TreasuryActionsActivity({ contractBalance, totalRatePerSecond, refetchTreasuryData }: TreasuryActionsActivityProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left Column: Funding & Withdrawal actions */}
      <div className="flex flex-col gap-6">
        <FundTreasuryPanel
          contractBalance={contractBalance}
          totalRatePerSecond={totalRatePerSecond}
          refetchTreasuryData={refetchTreasuryData}
        />
        <WithdrawExcessPanel
          contractBalance={contractBalance}
          totalRatePerSecond={totalRatePerSecond}
          refetchTreasuryData={refetchTreasuryData}
        />
        <LowTreasuryThresholdPanel
          refetchTreasuryData={refetchTreasuryData}
        />
      </div>

      {/* Right Column: Recent Activity Feed */}
      <div className="flex flex-col h-full">
        <RecentActivityFeed />
      </div>
    </div>
  );
}
