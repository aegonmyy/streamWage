"use client";

import { cn } from "@/lib/utils";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export interface NavItem {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
}

export function SidebarNav({
  section,
  setSection,
  items,
  highlightMap = {},
}: {
  section: string;
  setSection: (id: any) => void;
  items: NavItem[];
  highlightMap?: Record<string, boolean>;
}) {
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const active = item.id === section;
              const highlighted = highlightMap[item.id];

              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={active}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "h-auto flex-col items-start gap-1 px-4 py-3 transition-all rounded-2xl",
                      !active &&
                        highlighted &&
                        "border border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-[0.2em]",
                        active
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.eyebrow}
                    </p>
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p
                      className={cn(
                        "text-xs leading-relaxed line-clamp-2",
                        active
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.description}
                    </p>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}
