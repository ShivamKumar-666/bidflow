import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, MessageSquare, FileText, CalendarDays,
  BarChart3, Activity, User, Shield, Sparkles, Store,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const navConfig = [
  { to: "/dashboard", icon: LayoutDashboard, key: "sidebar.dashboard", roles: ["Admin", "Company", "Sales Executive", "Bidder"] },
  { to: "/enquiries", icon: MessageSquare, key: "sidebar.enquiries", roles: ["Admin", "Company", "Sales Executive"] },
  { to: "/bids", icon: FileText, key: "sidebar.bids", roles: ["Admin", "Company", "Sales Executive", "Bidder"] },
  { to: "/calendar", icon: CalendarDays, key: "sidebar.calendar" },
  { to: "/profile", icon: User, key: "sidebar.profile" },
  { to: "/audit-logs", icon: Activity, key: "sidebar.auditLogs", roles: ["Admin", "Company", "Sales Executive", "Bidder"] },
];

const marketplaceNav = { to: "/marketplace", icon: Store, key: "sidebar.marketplace" };

const adminNav = [
  { to: "/reports", icon: BarChart3, key: "sidebar.reports" },
];

export function Sidebar() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:z-30 border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-chart-2 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm tracking-tight">BidFlow</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Bid Intelligence</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <ul className="space-y-1">
          {navConfig.filter((item) => !item.roles || item.roles.includes(user?.role)).map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(item.key)}</span>
                </NavLink>
              </li>
            );
          })}

          {(user?.role === "Bidder" || user?.role === "Admin" || user?.role === "Company") && (
            <li>
              <NavLink
                to={marketplaceNav.to}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  )
                }
              >
                <marketplaceNav.icon className="h-4 w-4" />
                <span>{t(marketplaceNav.key, "Marketplace")}</span>
              </NavLink>
            </li>
          )}

          {user?.role === "Admin" && (
            <>
              <li className="pt-4 pb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Administration
              </li>
              {adminNav.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                        )
                      }
                    >
                      <Icon className="h-4 w-4" />
                      <span>{t(item.key)}</span>
                    </NavLink>
                  </li>
                );
              })}
            </>
          )}
        </ul>
      </nav>

      {user?.role === "Admin" && (
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <Shield className="h-4 w-4 text-sidebar-primary" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold">{t("sidebar.adminPrivileges")}</span>
              <span className="text-[10px] text-muted-foreground">Full system access</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export function MobileSidebar() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <div className="grid grid-cols-5 gap-1 px-2 py-1">
        {navConfig.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 rounded-md text-[10px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-primary")} />
              <span className="truncate max-w-full">{t(item.key)}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
