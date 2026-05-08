"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { parseEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { cn, formatEth, getRunwayColor, formatRunway } from "@/lib/utils";
import { usePayrollContractConfig, payrollAbi } from "@/lib/payroll-contract";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

interface FundTreasuryPanelProps {
  contractBalance: bigint;
  totalRatePerSecond: bigint;
  refetchTreasuryData: () => void;
}

export function FundTreasuryPanel({ contractBalance, totalRatePerSecond, refetchTreasuryData }: FundTreasuryPanelProps) {
  const [amount, setAmount] = useState("");
  const [isCustomAmount, setIsCustomAmount] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const { address: connectedAddress, isConnected } = useAccount();
  const contractConfig = usePayrollContractConfig();
  const publicClient = usePublicClient();

  const { writeContract, data: hash, isPending: isFundTreasuryPending, error: writeError } = useWriteContract();

  const ethAmount = useMemo(() => {
    try {
      return amount ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const handleQuickAmount = useCallback((value: string) => {
    setAmount(value);
    setIsCustomAmount(value === "");
  }, []);

  const newEstimatedRunwaySeconds = useMemo(() => {
    if (totalRatePerSecond === 0n) return 0n;
    return (contractBalance + ethAmount) / totalRatePerSecond;
  }, [contractBalance, ethAmount, totalRatePerSecond]);

  const livePreviewText = useMemo(() => {
    if (totalRatePerSecond === 0n) {
      return "After funding: runway unaffected — no active workers";
    }
    const runwayDays = Number(newEstimatedRunwaySeconds) / 86400;
    const colorClass = getRunwayColor(newEstimatedRunwaySeconds);
    return (
      <span className={colorClass}>
        After funding: estimated runway becomes {formatRunway(newEstimatedRunwaySeconds, totalRatePerSecond)}
      </span>
    );
  }, [newEstimatedRunwaySeconds, totalRatePerSecond]);

  const fundTreasury = useCallback(() => {
    if (!contractConfig || !ethAmount) return;
    writeContract({
      address: contractConfig.address,
      abi: payrollAbi,
      functionName: "fundTreasury",
      value: ethAmount,
    });
  }, [contractConfig, ethAmount, writeContract]);

  const { isLoading: isConfirming, isSuccess: isConfirmed, error: transactionError } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isConfirmed) {
      toast({
        title: "Treasury funded",
        description: `${formatEth(ethAmount, 4)} ETH added to the treasury.`, 
      });
      setAmount("");
      refetchTreasuryData();
    }
  }, [isConfirmed, ethAmount, refetchTreasuryData]);

  useEffect(() => {
    if (writeError || transactionError) {
      toast({
        title: "Transaction failed",
        description: writeError?.message || transactionError?.message || "Something went wrong.",
        variant: "destructive",
      });
    }
  }, [writeError, transactionError]);

  const isFundButtonDisabled = !isConnected || ethAmount === 0n || isFundTreasuryPending || isConfirming;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund Treasury</CardTitle>
        <CardDescription>Send ETH through the contract&apos;s fundTreasury() path.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <label htmlFor="amount" className="text-sm font-medium">Amount (ETH)</label>
          <Input
            id="amount"
            type="number"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setIsCustomAmount(true);
            }}
            ref={inputRef}
            min="0"
            step="any"
          />
          <div className="flex flex-wrap gap-2">
            {[ "0.5", "1", "5", "10"].map((val) => (
              <Button
                key={val}
                variant={amount === val && !isCustomAmount ? "default" : "outline"}
                size="sm"
                onClick={() => handleQuickAmount(val)}
              >
                {val} ETH
              </Button>
            ))}
            <Button
              variant={isCustomAmount ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIsCustomAmount(true);
                inputRef.current?.focus();
              }}
            >
              Custom
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{livePreviewText}</p>

        <Button
          onClick={fundTreasury}
          disabled={isFundButtonDisabled}
          className="w-full"
        >
          {isFundTreasuryPending || isConfirming ? "Funding..." : "Fund Treasury"}
        </Button>
      </CardContent>
    </Card>
  );
}
