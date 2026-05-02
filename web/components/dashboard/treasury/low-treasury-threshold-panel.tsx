"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { usePayrollRole } from "@/hooks/use-payroll-role";
import { getPayrollContractConfig, payrollAbi } from "@/lib/payroll-contract";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LowTreasuryThresholdPanelProps {
  refetchTreasuryData: () => void;
}

export function LowTreasuryThresholdPanel({ refetchTreasuryData }: LowTreasuryThresholdPanelProps) {
  const [newThresholdDays, setNewThresholdDays] = useState("");
  const { isOwner, isAdmin, isConnected } = usePayrollRole();
  const contractConfig = getPayrollContractConfig();

  const { data: currentThresholdSeconds, refetch: refetchThreshold } = useReadContract({
    ...contractConfig,
    functionName: "lowTreasuryThresholdSeconds",
  });

  const currentThresholdDays = useMemo(() => {
    if (currentThresholdSeconds === undefined) return 0;
    return Number(currentThresholdSeconds) / 86400;
  }, [currentThresholdSeconds]);

  const { writeContract, data: hash, isPending: isUpdatePending, error: writeError } = useWriteContract();

  const handleUpdateThreshold = useCallback(() => {
    if (!contractConfig || newThresholdDays === "") return;
    
    const thresholdSeconds = BigInt(Math.floor(Number(newThresholdDays) * 86400));
    
    writeContract({
      address: contractConfig.address,
      abi: payrollAbi,
      functionName: "setLowTreasuryThreshold",
      args: [thresholdSeconds],
    });
  }, [contractConfig, newThresholdDays, writeContract]);

  const { isLoading: isConfirming, isSuccess: isConfirmed, error: transactionError } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isConfirmed) {
      toast({
        title: "Threshold updated",
        description: `Threshold updated to ${newThresholdDays} days.`,
      });
      setNewThresholdDays("");
      refetchThreshold();
      refetchTreasuryData();
    }
  }, [isConfirmed, newThresholdDays, refetchThreshold, refetchTreasuryData]);

  useEffect(() => {
    if (writeError || transactionError) {
      toast({
        title: "Transaction failed",
        description: writeError?.message || transactionError?.message || "Something went wrong.",
        variant: "destructive",
      });
    }
  }, [writeError, transactionError]);

  const isButtonDisabled = !isConnected || !isOwner || newThresholdDays === "" || isUpdatePending || isConfirming;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Low Treasury Threshold</CardTitle>
          <Badge variant="outline" className="bg-teal-500/10 text-teal-500 border-teal-500/20">
            Owner only
          </Badge>
        </div>
        <CardDescription>
          Workers receive a LowTreasury warning event when their individual runway drops below this threshold.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm font-medium">
          Current threshold: {currentThresholdDays} days ({currentThresholdSeconds?.toString() || "0"} seconds warnings active)
        </div>

        <div className="grid gap-2">
          <label htmlFor="threshold" className="text-sm font-medium">New threshold (days)</label>
          <div className="flex gap-2">
            <Input
              id="threshold"
              type="number"
              placeholder={currentThresholdDays.toString()}
              value={newThresholdDays}
              onChange={(e) => setNewThresholdDays(e.target.value)}
              min="0"
              step="any"
            />
            <div className="flex items-center px-3 rounded-md border border-input bg-muted text-muted-foreground text-sm">
              days
            </div>
          </div>
        </div>

        {newThresholdDays !== "" && (
          <p className="text-sm text-muted-foreground">
            Workers will be warned when runway drops below {newThresholdDays} days
          </p>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-full">
                <Button
                  onClick={handleUpdateThreshold}
                  disabled={isButtonDisabled}
                  className="w-full"
                >
                  {isUpdatePending || isConfirming ? "Updating..." : "Update Threshold"}
                </Button>
              </div>
            </TooltipTrigger>
            {!isOwner && isConnected && (
              <TooltipContent>
                <p>Only the contract owner can update this</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        <p className="text-xs text-muted-foreground italic">
          Note: Set to 0 to disable low treasury warnings entirely.
        </p>
      </CardContent>
    </Card>
  );
}
