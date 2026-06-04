import React, { useState, useEffect, useRef, useContext } from "react";
import {
  Search, Bell, Sun, Moon, Globe, LogOut, Command, X, GitBranch, MessageSquare, Info,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function NotifIcon({ type }) {
  if (type === "status_change") return <GitBranch className="h-4 w-4" />;
  if (type === "new_comment") return <MessageSquare className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="info">{unreadCount} new</Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs h-7">
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Bell className="h-9 w-9 opacity-30" />
              <span className="text-sm">All caught up!</span>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 30).map((n) => (
                <button
                  key={n._id}
                  onClick={() => !n.isRead && markAsRead(n._id)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors flex gap-3",
                    !n.isRead && "bg-blue-500/5"
                  )}
                >
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                    n.type === "status_change" && "bg-amber-500/15 text-amber-600",
                    n.type === "new_comment" && "bg-blue-500/15 text-blue-600",
                    (!n.type || n.type === "system") && "bg-muted text-muted-foreground"
                  )}>
                    <NotifIcon type={n.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm truncate">{n.title}</span>
                      {!n.isRead && <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                    <span className="text-[10px] text-muted-foreground mt-1 inline-block">{timeAgo(n.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ enquiries: [], bids: [], documents: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((p) => !p);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
        setResults({ enquiries: [], bids: [], documents: [] });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ enquiries: [], bids: [], documents: [] });
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(query)}`);
        setResults(res.data || { enquiries: [], bids: [], documents: [] });
        setActiveIndex(0);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const flat = [
    ...results.enquiries.map((d) => ({ type: "enquiry", data: d })),
    ...results.bids.map((d) => ({ type: "bid", data: d })),
    ...results.documents.map((d) => ({ type: "document", data: d })),
  ];

  const handleSelect = (item) => {
    setOpen(false);
    setQuery("");
    setResults({ enquiries: [], bids: [], documents: [] });
    if (item.type === "enquiry") navigate("/enquiries");
    else if (item.type === "bid") navigate("/bids");
    else if (item.type === "document") navigate("/bids");
  };

  const onKey = (e) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); setResults({ enquiries: [], bids: [], documents: [] }); }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((p) => (p + 1) % Math.max(1, flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((p) => (p - 1 + flat.length) % Math.max(1, flat.length));
    } else if (e.key === "Enter" && flat[activeIndex]) {
      handleSelect(flat[activeIndex]);
    }
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden md:flex w-64 justify-between text-muted-foreground font-normal"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" />
          Search...
        </span>
        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted">⌘K</kbd>
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 px-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-xl bg-popover border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search enquiries, bids, documents..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {flat.length === 0 && query.trim() === "" && (
            <p className="p-6 text-sm text-muted-foreground text-center">Type to search enquiries, bids, or document attachments</p>
          )}
          {flat.length === 0 && query.trim() !== "" && !loading && (
            <p className="p-6 text-sm text-muted-foreground text-center">No results for "{query}"</p>
          )}
          {results.enquiries.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">Enquiries</div>
              {results.enquiries.map((enq) => {
                const idx = flat.findIndex((f) => f.type === "enquiry" && f.data._id === enq._id);
                return (
                  <button
                    key={enq._id}
                    onClick={() => handleSelect({ type: "enquiry", data: enq })}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn("w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-accent", activeIndex === idx && "bg-accent")}
                  >
                    <div>
                      <div className="font-medium">{enq.customerName}</div>
                      <div className="text-xs text-muted-foreground">{enq.productServiceRequired}</div>
                    </div>
                    <Badge variant={enq.priority === "High" ? "destructive" : enq.priority === "Medium" ? "review" : "info"}>{enq.priority}</Badge>
                  </button>
                );
              })}
            </div>
          )}
          {results.bids.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">Bids</div>
              {results.bids.map((bid) => {
                const idx = flat.findIndex((f) => f.type === "bid" && f.data._id === bid._id);
                return (
                  <button
                    key={bid._id}
                    onClick={() => handleSelect({ type: "bid", data: bid })}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn("w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-accent", activeIndex === idx && "bg-accent")}
                  >
                    <div>
                      <div className="font-medium">{bid.bidId} · {bid.customerName}</div>
                      <div className="text-xs text-muted-foreground">Assigned: {bid.assignedEmployee || "Unassigned"}</div>
                    </div>
                    <span className="text-xs font-semibold">${Number(bid.amount).toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          )}
          {results.documents.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">Documents</div>
              {results.documents.map((doc) => {
                const idx = flat.findIndex((f) => f.type === "document" && f.data._id === doc._id);
                return (
                  <button
                    key={doc._id}
                    onClick={() => handleSelect({ type: "document", data: doc })}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn("w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-accent", activeIndex === idx && "bg-accent")}
                  >
                    <span className="font-medium">{doc.filename}</span>
                    <span className="text-xs text-muted-foreground">{doc.bidId}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="font-mono px-1 rounded bg-background">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="font-mono px-1 rounded bg-background">↵</kbd> Select</span>
          </div>
          <span>BidFlow Global Search</span>
        </div>
      </div>
    </div>
  );
}

const languages = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी" },
  { code: "gu", name: "ગુજરાતી" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "ar", name: "العربية" },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { i18n } = useTranslation();

  const initials = (user?.name || "U")
    .split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="h-full flex items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Language">
                <Globe className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Language</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {languages.map((l) => (
                <DropdownMenuItem
                  key={l.code}
                  onClick={() => i18n.changeLanguage(l.code)}
                  className={i18n.language === l.code ? "bg-accent" : ""}
                >
                  {l.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 ml-2 pl-2 pr-1 py-1 rounded-md hover:bg-accent transition-colors">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-semibold leading-tight">{user?.name}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{user?.role}</span>
                </div>
                <Avatar>
                  <AvatarFallback className="bg-gradient-to-br from-sidebar-primary to-chart-2 text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{user?.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
