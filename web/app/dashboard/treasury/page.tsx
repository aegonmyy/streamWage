"use client";

import { useMemo, useCallback } from "react";
import { useBalance, useReadContract } from "wagmi";
import { TreasuryPageHeader } from "@/components/dashboard/treasury/treasury-page-header";
import { TreasuryStatCards } from "@/components/dashboard/treasury/treasury-stat-cards";
import { TreasuryActionsActivity } from "@/components/dashboard/treasury/treasury-actions-activity";
import { WorkerDrainBreakdownTable } from "@/components/dashboard/treasury/worker-drain-breakdown";
import { usePayrollContractConfig } from "@/lib/payroll-contract";

export default function TreasuryPage() {
  const contractConfig = usePayrollContractConfig();
  const contractAddress = contractConfig?.address;

  // Fetch treasury balance
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: contractAddress,
    query: {
      refetchInterval: 30_000,
      enabled: !!contractAddress,
    },
  });
  const contractBalance = balanceData?.value || 0n;

  // Fetch treasury runway data
  const { data: treasuryRunwayData, refetch: refetchTreasuryRunway } = useReadContract({
    ...contractConfig,
    functionName: "treasuryRunway",
    query: {
      refetchInterval: 30_000,
      enabled: !!contractAddress,
    },
  });

  const [estimatedRunwaySeconds, totalRatePerSecond] = useMemo(() => {
    if (treasuryRunwayData && Array.isArray(treasuryRunwayData)) {
      return [treasuryRunwayData[0] as bigint, treasuryRunwayData[1] as bigint];
    }
    return [0n, 0n];
  }, [treasuryRunwayData]);

  const refetchTreasuryData = useCallback(() => {
    refetchBalance();
    refetchTreasuryRunway();
  }, [refetchBalance, refetchTreasuryRunway]);

  return (
    <>
      <TreasuryPageHeader />
      <TreasuryStatCards />
      <TreasuryActionsActivity
        contractBalance={contractBalance}
        totalRatePerSecond={totalRatePerSecond}
        refetchTreasuryData={refetchTreasuryData}
      />
      <WorkerDrainBreakdownTable />
    </>
  );
}
