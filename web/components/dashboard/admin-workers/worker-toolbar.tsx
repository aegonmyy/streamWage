"use client"

import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface WorkerToolbarProps {
  search: string
  setSearch: (value: string) => void
  filter: string
  setFilter: (value: string) => void
  timelineFilter: string
  setTimelineFilter: (value: string) => void
  onAddWorker: () => void
}

export function WorkerToolbar({
  search,
  setSearch,
  filter,
  setFilter,
  timelineFilter,
  setTimelineFilter,
  onAddWorker,
}: WorkerToolbarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by address or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-xl"
        />
      </div>
      
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[140px] rounded-xl">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="low-runway">Low Runway</SelectItem>
            <SelectItem value="trigger">Trigger</SelectItem>
          </SelectContent>
        </Select>

        <Select value={timelineFilter} onValueChange={setTimelineFilter}>
          <SelectTrigger className="w-[160px] rounded-xl">
            <SelectValue placeholder="All Timelines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Timelines</SelectItem>
            <SelectItem value="Hourly">Hourly</SelectItem>
            <SelectItem value="Monthly">Monthly</SelectItem>
            <SelectItem value="Custom">Custom</SelectItem>
            <SelectItem value="Trigger">Trigger</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={onAddWorker} className="gap-2 rounded-xl h-10 px-5 shadow-sm">
          <Plus className="h-4 w-4" />
          Add Worker
        </Button>
      </div>
    </div>
  )
}
