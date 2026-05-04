"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePublicClient } from "wagmi";
import { decodeEventLog } from "viem";
import { cn, formatEth } from "@/lib/utils";
import { getPayrollContractConfig, payrollAbi, getLogsInChunks } from "@/lib/payroll-contract";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpIcon, ArrowDownRightIcon, MoveUpRightIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface TreasuryEvent {
  type: "TreasuryFunded" | "Claimed" | "ExcessWithdrawn";
  from?: string;
  worker?: string;
  recipient: string;
  amount: bigint;
  timestamp: number;
  blockNumber: bigint;
  transactionHash: string;
}

export function RecentActivityFeed() {
  const [events, setEvents] = useState<TreasuryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const contractConfig = getPayrollContractConfig();
  const publicClient = usePublicClient({ chainId: contractConfig?.chainId });
  const lastFetchedBlock = useRef<bigint>(0n);

  const fetchRecentEvents = useCallback(async (isInitial = false) => {
    if (!publicClient || !contractConfig) return;

    try {
      const currentBlock = await publicClient.getBlockNumber();
      
      // If it's the initial fetch, look back 10k blocks. 
      // Otherwise, only fetch from the last block we saw + 1.
      const fromBlock = isInitial 
        ? (currentBlock - 10000n > (contractConfig.fromBlock || 0n) 
            ? currentBlock - 10000n 
            : (contractConfig.fromBlock || 0n))
        : lastFetchedBlock.current + 1n;

      if (fromBlock > currentBlock && !isInitial) return;

      const logs = await getLogsInChunks(publicClient, {
        address: contractConfig.address,
        fromBlock,
        toBlock: currentBlock,
      });

      if (logs.length === 0) {
        if (isInitial) setIsLoading(false);
        lastFetchedBlock.current = currentBlock;
        return;
      }

      const parsedEvents: TreasuryEvent[] = [];

      for (const log of logs) {
        try {
          const decoded = decodeEventLog({
            abi: payrollAbi,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "TreasuryFunded" || decoded.eventName === "Claimed" || decoded.eventName === "ExcessWithdrawn") {
            const block = await publicClient.getBlock({ blockNumber: log.blockNumber! });
            
            if (decoded.eventName === "TreasuryFunded") {
              parsedEvents.push({
                type: "TreasuryFunded",
                from: (decoded.args as any).from,
                recipient: contractConfig.address,
                amount: (decoded.args as any).amount,
                timestamp: Number(block.timestamp),
                blockNumber: log.blockNumber!,
                transactionHash: log.transactionHash!,
              });
            } else if (decoded.eventName === "Claimed") {
              parsedEvents.push({
                type: "Claimed",
                worker: (decoded.args as any).worker,
                recipient: (decoded.args as any).recipient,
                amount: (decoded.args as any).amount,
                timestamp: Number(block.timestamp),
                blockNumber: log.blockNumber!,
                transactionHash: log.transactionHash!,
              });
            } else if (decoded.eventName === "ExcessWithdrawn") {
              parsedEvents.push({
                type: "ExcessWithdrawn",
                recipient: (decoded.args as any).recipient,
                amount: (decoded.args as any).amountWei,
                timestamp: Number(block.timestamp),
                blockNumber: log.blockNumber!,
                transactionHash: log.transactionHash!,
              });
            }
          }
        } catch (e) {
          // Skip events we can't decode
        }
      }

      setEvents(prev => {
        const combined = isInitial ? parsedEvents : [...parsedEvents, ...prev];
        // Deduplicate and sort
        const seenHashes = new Set();
        return combined
          .filter(e => {
            const key = `${e.transactionHash}-${e.type}`;
            if (seenHashes.has(key)) return false;
            seenHashes.add(key);
            return true;
          })
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 10);
      });
      
      lastFetchedBlock.current = currentBlock;
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, [publicClient, contractConfig]);

  useEffect(() => {
    fetchRecentEvents(true);

    const interval = setInterval(() => {
      fetchRecentEvents(false);
    }, 30_000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, [fetchRecentEvents]);

  const renderEvent = (event: TreasuryEvent) => {
    const isFunded = event.type === "TreasuryFunded";
    const isClaimed = event.type === "Claimed";
    
    const Icon = isFunded ? ArrowUpIcon : isClaimed ? ArrowDownRightIcon : MoveUpRightIcon;
    const iconColor = isFunded ? "text-green-500 bg-green-500/10" : isClaimed ? "text-blue-500 bg-blue-500/10" : "text-orange-500 bg-orange-500/10";

    const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    let description = "";
    if (isFunded) description = `+${formatEth(event.amount, 4)} ETH funded by ${shortAddr(event.from || "")}`;
    else if (isClaimed) description = `${shortAddr(event.worker || "")} claimed ${formatEth(event.amount, 4)} ETH`;
    else description = `${formatEth(event.amount, 4)} ETH withdrawn to ${shortAddr(event.recipient)}`;

    return (
      <div key={`${event.transactionHash}-${event.type}`} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-full", iconColor)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{description}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(event.timestamp * 1000, { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest treasury events from the contract.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8 text-sm text-muted-foreground italic">
            Loading activity...
          </div>
        ) : events.length === 0 ? (
          <div className="flex justify-center py-8 text-sm text-muted-foreground italic">
            No recent treasury activity.
          </div>
        ) : (
          <div className="flex flex-col">
            {events.map(renderEvent)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
