"use client";

import { useMemo } from "react";
import { useBalance, useReadContract } from "wagmi";
import { cn, formatEth, RUNWAY_DAYS, getRunwayColor, formatRunway } from "@/lib/utils";
import { usePayrollContractConfig } from "@/lib/payroll-contract";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subLabel: string;
  warning?: string;
  valueClassName?: string;
  cardClassName?: string;
}

const StatCard = ({ title, value, subLabel, warning, valueClassName, cardClassName }: StatCardProps) => {
  const content = (
    <Card className={cn("flex-1 shadow-sm overflow-x-hidden", cardClassName)}>
      <CardHeader className="p-3 md:p-4 pb-1 md:pb-1">
        <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-4 pt-0 md:pt-0">
        <div className={cn("text-lg md:text-xl font-bold flex items-center gap-2 break-words", valueClassName)}>{value}</div>
        <p className="text-[11px] text-muted-foreground mt-1 break-words">
          {subLabel}
          {warning && <span className="block mt-1 text-red-500 font-semibold">{warning}</span>}
        </p>
      </CardContent>
    </Card>
  );

  if (title === "Runway") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help h-full">
              {content}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] p-3 rounded-xl border-border/60 shadow-xl">
            <p className="text-xs font-medium leading-relaxed">
              Estimated based on the treasury's free balance only. Does not account for pending worker claims or future funding.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
};

export function TreasuryStatCards() {
  const contractConfig = usePayrollContractConfig();
  const contractAddress = contractConfig?.address;

  // Fetch treasury balance
  const { data: balanceData, isLoading: isBalanceLoading } = useBalance({
    address: contractAddress,
    query: {
      refetchInterval: 30_000,
    }
  });
  const contractBalance = balanceData?.value || 0n;

  // Fetch treasury runway data
  const { data: treasuryRunwayData, isLoading: isTreasuryRunwayLoading } = useReadContract({
    ...contractConfig,
    functionName: "treasuryRunway",
    query: {
      refetchInterval: 30_000,
      enabled: !!contractAddress,
    },
  });

  const [totalRatePerSecond, estimatedRunwaySeconds] = useMemo(() => {
    if (treasuryRunwayData && Array.isArray(treasuryRunwayData)) {
      return [treasuryRunwayData[0] as bigint, treasuryRunwayData[1] as bigint];
    }
    return [0n, 0n];
  }, [treasuryRunwayData]);

  const oneHourMinimumReserve = totalRatePerSecond * 3600n;

  // Card 1: Balance
  const isBalanceZero = contractBalance === 0n;
  const isBelowMinimumReserve = !isBalanceZero && contractBalance < oneHourMinimumReserve;
  const balanceWarning = isBalanceZero
    ? "Empty — claims will fail"
    : isBelowMinimumReserve
    ? "Below minimum reserve"
    : undefined;
  const balanceCardClass = isBalanceZero || isBelowMinimumReserve ? "border-red-500 bg-red-50/50 dark:bg-red-950/10" : "bg-card";
  const balanceValueClass = isBalanceZero ? "text-red-500 font-extrabold" : undefined;

  // Card 2: Runway
  const runwayValue = formatRunway(estimatedRunwaySeconds, totalRatePerSecond);
  const runwaySubLabel = "From treasuryRunway()";
  const runwayColorClass = getRunwayColor(estimatedRunwaySeconds);
  
  // Requirement: Left border color coding
  let borderColor = "border-transparent";
  const days = Number(estimatedRunwaySeconds) / 86400;
  if (totalRatePerSecond > 0n) {
    if (days > 30) borderColor = "border-l-green-500";
    else if (days >= 7) borderColor = "border-l-yellow-500";
    else borderColor = "border-l-red-500";
  }

  const runwayCardClass = totalRatePerSecond !== 0n && estimatedRunwaySeconds > 0n
    ? `border-l-4 ${borderColor} bg-card`
    : "bg-card";
  
  const showRedPulseDot = runwayValue === "< 1 hour";

  // Card 3: Daily Drain
  const dailyDrainEth = totalRatePerSecond * 86400n;
  const dailyDrainValue = totalRatePerSecond === 0n ? "0 ETH/day" : `${formatEth(dailyDrainEth, 4)} ETH/day`;
  const dailyDrainSubLabel = totalRatePerSecond === 0n ? "No time-based workers" : "Active payroll drain";

  // Card 4: Safe Withdrawable
  const safeWithdrawableAmount = useMemo(() => {
    return contractBalance > oneHourMinimumReserve ? contractBalance - oneHourMinimumReserve : 0n;
  }, [contractBalance, oneHourMinimumReserve]);

  const safeWithdrawableValue = formatEth(safeWithdrawableAmount, 4);
  const safeWithdrawableSubLabel = safeWithdrawableAmount === 0n
    ? "Below the reserve floor"
    : "Above the 1-hour reserve floor";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        title="Balance"
        value={isBalanceLoading ? "Loading..." : `${formatEth(contractBalance, 4)} ETH`}
        subLabel="Current balance"
        warning={balanceWarning}
        valueClassName={balanceValueClass}
        cardClassName={balanceCardClass}
      />
      <StatCard
        title="Runway"
        value={
          isTreasuryRunwayLoading ? "Loading..." : (
            <>
              {showRedPulseDot && (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
              {runwayValue}
              {totalRatePerSecond === 0n && estimatedRunwaySeconds === 0n && (
                <span className="text-xs font-normal text-muted-foreground ml-2">(No active accrual)</span>
              )}
            </>
          )
        }
        subLabel={runwaySubLabel}
        valueClassName={runwayColorClass}
        cardClassName={runwayCardClass}
      />
      <StatCard
        title="Daily Drain"
        value={isTreasuryRunwayLoading ? "Loading..." : dailyDrainValue}
        subLabel={dailyDrainSubLabel}
        cardClassName="bg-card"
      />
      <StatCard
        title="Safe Withdrawable"
        value={isBalanceLoading || isTreasuryRunwayLoading ? "Loading..." : `${safeWithdrawableValue} ETH`}
        subLabel={safeWithdrawableSubLabel}
        cardClassName="bg-card"
      />
    </div>
  );
}
