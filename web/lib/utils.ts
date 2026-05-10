import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatEther } from "viem";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatEth = (value: bigint | undefined, decimals: number = 4): string => {
  if (value === undefined) return "0.0000";
  return parseFloat(formatEther(value)).toFixed(decimals);
};

export const RUNWAY_DAYS = {
  GREEN: 30,
  YELLOW: 7,
  RED: 0, // Less than 7 days
};

export const getRunwayColor = (seconds: bigint): string => {
  const days = Number(seconds) / 86400;
  if (days > RUNWAY_DAYS.GREEN) return "text-green-500";
  if (days >= RUNWAY_DAYS.YELLOW) return "text-yellow-500";
  return "text-red-500";
};

export const formatRunway = (seconds: bigint | undefined, totalRatePerSecond: bigint | undefined): string => {
  if (totalRatePerSecond === 0n || seconds === undefined || seconds === 0n) {
    return "—";
  }
  const totalSeconds = Number(seconds);
  const hours = totalSeconds / 3600;

  if (hours > 48) {
    return `${Math.floor(hours / 24)} days`;
  } else if (hours >= 1) {
    return `${Math.floor(hours)} hours`;
  } else if (totalSeconds > 0) {
    return "< 1 hour";
  }
  return "—";
};
