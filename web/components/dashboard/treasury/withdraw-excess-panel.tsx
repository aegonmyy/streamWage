"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { parseEther, isAddress, Address } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { cn, formatEth, getRunwayColor, formatRunway } from "@/lib/utils";
import { usePayrollContractConfig, payrollAbi } from "@/lib/payroll-contract";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WithdrawExcessPanelProps {
  contractBalance: bigint;
  totalRatePerSecond: bigint;
  refetchTreasuryData: () => void;
}

export function WithdrawExcessPanel({ contractBalance, totalRatePerSecond, refetchTreasuryData }: WithdrawExcessPanelProps) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  const { address: connectedAddress, isConnected } = useAccount();
  const contractConfig = usePayrollContractConfig();

  const { writeContract, data: hash, isPending: isWithdrawPending, error: writeError } = useWriteContract();

  const ethAmount = useMemo(() => {
    try {
      return amount ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const oneHourMinimumReserve = totalRatePerSecond * 3600n;
  const safeWithdrawableAmount = useMemo(() => {
    return contractBalance > oneHourMinimumReserve ? contractBalance - oneHourMinimumReserve : 0n;
  }, [contractBalance, oneHourMinimumReserve]);

  const isAmountValid = ethAmount > 0n && ethAmount <= safeWithdrawableAmount;
  const isRecipientValid = recipient && isAddress(recipient);

  const remainingBalance = contractBalance - ethAmount;
  const remainingRunwaySeconds = totalRatePerSecond > 0n ? remainingBalance / totalRatePerSecond : 0n;

  const handleMax = useCallback(() => {
    setAmount(formatEth(safeWithdrawableAmount, 18)); // Use high precision for max
  }, [safeWithdrawableAmount]);

  const handleUseWallet = useCallback(() => {
    if (connectedAddress) setRecipient(connectedAddress);
  }, [connectedAddress]);

  const executeWithdraw = useCallback(() => {
    if (!contractConfig || !isAmountValid || !isRecipientValid) return;
    writeContract({
      address: contractConfig.address,
      abi: payrollAbi,
      functionName: "withdrawExcess",
      args: [recipient as Address, ethAmount],
    });
    setShowConfirmDialog(false);
  }, [contractConfig, isAmountValid, isRecipientValid, recipient, ethAmount, writeContract]);

  const { isLoading: isConfirming, isSuccess: isConfirmed, error: transactionError } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isConfirmed) {
      toast({
        title: "X ETH withdrawn",
        description: `${formatEth(ethAmount, 4)} ETH withdrawn to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
      });
      setAmount("");
      refetchTreasuryData();
    }
  }, [isConfirmed, ethAmount, recipient, refetchTreasuryData]);

  useEffect(() => {
    if (writeError || transactionError) {
      toast({
        title: "Transaction failed",
        description: writeError?.message || transactionError?.message || "Something went wrong.",
        variant: "destructive",
      });
    }
  }, [writeError, transactionError]);

  const isWithdrawButtonDisabled = !isConnected || !isAmountValid || !isRecipientValid || isWithdrawPending || isConfirming;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Withdraw Excess</CardTitle>
          <CardDescription>Pull only the amount above the enforced one-hour reserve buffer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="recipient" className="text-sm font-medium">Recipient address</label>
              <button 
                onClick={handleUseWallet}
                className="text-xs text-primary hover:underline font-medium"
              >
                Use my wallet
              </button>
            </div>
            <Input
              id="recipient"
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="withdraw-amount" className="text-sm font-medium">Amount (ETH)</label>
            <div className="flex gap-2">
              <Input
                id="withdraw-amount"
                type="number"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="any"
              />
              <Button variant="outline" onClick={handleMax}>Max</Button>
            </div>
            {ethAmount > safeWithdrawableAmount && (
              <p className="text-xs text-red-500 font-medium">
                Exceeds safe withdrawable amount ({formatEth(safeWithdrawableAmount, 4)} ETH)
              </p>
            )}
          </div>

          {isAmountValid && (
            <div className="text-sm text-muted-foreground">
              Remaining after withdrawal: {formatEth(remainingBalance, 4)} ETH 
              {" "}(<span className={getRunwayColor(remainingRunwaySeconds)}>
                {formatRunway(remainingRunwaySeconds, totalRatePerSecond)} runway
              </span>)
            </div>
          )}

          <Button
            onClick={() => setShowConfirmDialog(true)}
            disabled={isWithdrawButtonDisabled}
            variant="secondary"
            className="w-full"
          >
            {isWithdrawPending || isConfirming ? "Withdrawing..." : "Withdraw Excess"}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Withdrawal</AlertDialogTitle>
            <AlertDialogDescription>
              You are withdrawing {formatEth(ethAmount, 4)} ETH to {recipient.slice(0, 6)}...{recipient.slice(-4)}. 
              Remaining treasury balance will be {formatEth(remainingBalance, 4)} ETH 
              ({formatRunway(remainingRunwaySeconds, totalRatePerSecond)} runway). 
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeWithdraw}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
