"use client";

import { useMemo } from "react";
import { formatEther } from "viem";
import { usePayrollAdminData, AdminWorkerRecord } from "@/hooks/use-payroll-admin-data";
import { formatEth, getRunwayColor, formatRunway, cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function WorkerDrainBreakdownTable() {
  const { data: adminData, isLoading } = usePayrollAdminData();

  const activeTimeWorkers = useMemo(() => {
    const workers = Array.isArray(adminData?.workers) ? adminData.workers : [];
    return workers
      .filter((w) => w.status === "active" && w.timeline !== "Trigger")
      .map((worker) => {
        const ratePerSecond = worker.amountPerIntervalWei / (worker.intervalSeconds || 1n);
        const dailyDrainWei = ratePerSecond * 86400n;
        const totalDrainRate = adminData?.totalRatePerSecondWei || 1n;
        const drainPercentage = (Number(ratePerSecond) / Number(totalDrainRate)) * 100;

        return {
          ...worker,
          ratePerSecond,
          dailyDrainWei,
          drainPercentage,
        };
      })
      .sort((a, b) => Number(a.runwaySeconds) - Number(b.runwaySeconds));
  }, [adminData]);

  if (isLoading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Payroll Drain Breakdown</CardTitle>
          <CardDescription>Loading worker data...</CardDescription>
        </CardHeader>
        <CardContent className="h-40 flex items-center justify-center">
          <div className="text-muted-foreground animate-pulse">Fetching active workers...</div>
        </CardContent>
      </Card>
    );
  }

  if (activeTimeWorkers.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Payroll Drain Breakdown</CardTitle>
          <CardDescription>Active workers contributing to treasury drain, ordered by individual runway.</CardDescription>
        </CardHeader>
        <CardContent className="h-40 flex flex-col items-center justify-center text-center">
          <p className="text-muted-foreground italic">No active time-based workers.</p>
          <p className="text-muted-foreground italic text-sm">Treasury is not currently being drained.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Payroll Drain Breakdown</CardTitle>
        <CardDescription>Active workers contributing to treasury drain, ordered by individual runway.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Worker</TableHead>
              <TableHead>Timeline</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Drain per Day</TableHead>
              <TableHead>Individual Runway</TableHead>
              <TableHead className="text-right">% of Drain</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeTimeWorkers.map((worker) => (
              <TableRow key={worker.address}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{worker.name || "Unnamed"}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {worker.address.slice(0, 6)}...{worker.address.slice(-4)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-normal">
                    {worker.timeline}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {formatEth(worker.amountPerIntervalWei, 4)} ETH / {worker.timeline === "Custom" ? `${worker.intervalSeconds}s` : worker.timeline.toLowerCase().replace('ly', '')}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">
                    {formatEth(worker.dailyDrainWei, 4)} ETH/day
                  </span>
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn("font-medium cursor-help", getRunwayColor(worker.runwaySeconds))}>
                          {formatRunway(worker.runwaySeconds, worker.ratePerSecond)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] p-3 rounded-xl border-border/60 shadow-xl">
                        <p className="text-xs font-medium leading-relaxed">
                          Estimated based on the treasury's free balance only. Does not account for pending worker claims or future funding.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm text-muted-foreground">
                    {worker.drainPercentage.toFixed(1)}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
