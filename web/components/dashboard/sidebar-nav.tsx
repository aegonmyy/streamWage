"use client";

import { cn } from "@/lib/utils";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export interface NavItem {
  id: string;
  label: string;
  description: string;
  icon: any;
}

export function SidebarNav({
  section,
  setSection,
  items,
  highlightMap = {},
  activeClassName = "bg-primary/10 text-primary",
}: {
  section: string;
  setSection: (id: any) => void;
  items: NavItem[];
  highlightMap?: Record<string, boolean>;
  activeClassName?: string;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const active = item.id === section;
              const highlighted = highlightMap[item.id];
              const Icon = item.icon;

              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={active}
                    onClick={() => {
                      setSection(item.id);
                      setOpenMobile(false);
                    }}
                    tooltip={item.label}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-all rounded-2xl group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                      active
                        ? activeClassName
                        : "hover:bg-muted",
                      !active &&
                        highlighted &&
                        "border border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
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
