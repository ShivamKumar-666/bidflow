import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, ExternalLink, Inbox } from "lucide-react";
import api from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const priorityColors = {
  High: "bg-rose-500 text-white",
  Medium: "bg-amber-500 text-white",
  Low: "bg-blue-500 text-white",
};

const priorityBadge = { High: "destructive", Medium: "warning", Low: "info" };

export default function CalendarView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const monthRef = useRef(null);
  const yearRef = useRef(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  useEffect(() => {
    const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    api.get(`/bids/calendar?month=${monthStr}`)
      .then((r) => {
        setEvents(r.data || []);
      })
      .catch((err) => {
        console.error("Calendar API error:", err);
      });
  }, [currentYear, currentMonth]);

  useEffect(() => {
    api.get("/bids/calendar")
      .then((r) => {
        const sorted = (r.data || [])
          .filter((b) => b.status !== "Order Received" && b.status !== "Rejected")
          .sort((a, b) => new Date(a.submissionDate) - new Date(b.submissionDate));
        setUpcoming(sorted.slice(0, 10));
      })
      .catch((err) => {
        console.error("Upcoming deadlines API error:", err);
      });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (monthRef.current && !monthRef.current.contains(e.target)) {
        setShowMonthPicker(false);
      }
      if (yearRef.current && !yearRef.current.contains(e.target)) {
        setShowYearPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInPrev = new Date(currentYear, currentMonth, 0).getDate();

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, current: false, key: `p${i}` });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, current: true, key: `c${i}` });
  }
  while (cells.length < 42) {
    cells.push({ day: cells.length - daysInMonth - firstDay + 1, current: false, key: `n${cells.length}` });
  }

  const today = new Date();
  const isToday = (day, current) => {
    if (!current) return false;
    return day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
  };

  const dateStr = (day, current) => {
    if (!current) return null;
    return `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const eventsByDate = events.reduce((acc, e) => {
    let dateKey = e.submissionDate;
    if (dateKey && dateKey.includes("T")) {
      dateKey = dateKey.split("T")[0];
    }
    if (dateKey) {
      (acc[dateKey] = acc[dateKey] || []).push(e);
    }
    return acc;
  }, {});

  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CalendarIcon className="h-7 w-7" />
          {t("calendar.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Visualize bid submission deadlines across your pipeline.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentYear, currentMonth - 1, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentYear, currentMonth + 1, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative" ref={monthRef}>
                  <button
                    type="button"
                    onClick={() => { setShowMonthPicker(!showMonthPicker); setShowYearPicker(false); }}
                    className="text-xl font-bold tracking-tight hover:text-primary transition-colors px-2 py-1 rounded"
                  >
                    {monthNames[currentMonth]}
                  </button>
                  {showMonthPicker && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-48 rounded-md border bg-popover text-popover-foreground shadow-md p-2 grid grid-cols-3 gap-1">
                      {monthNames.map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => { setCurrentDate(new Date(currentYear, i, 1)); setShowMonthPicker(false); }}
                          className={cn(
                            "text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors",
                            i === currentMonth && "bg-primary text-primary-foreground"
                          )}
                        >
                          {m.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative" ref={yearRef}>
                  <button
                    type="button"
                    onClick={() => { setShowYearPicker(!showYearPicker); setShowMonthPicker(false); }}
                    className="text-xl font-bold tracking-tight hover:text-primary transition-colors px-2 py-1 rounded"
                  >
                    {currentYear}
                  </button>
                  {showYearPicker && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-32 rounded-md border bg-popover text-popover-foreground shadow-md p-2 grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                      {years.map((y) => (
                        <button
                          key={y}
                          type="button"
                          onClick={() => { setCurrentDate(new Date(y, currentMonth, 1)); setShowYearPicker(false); }}
                          className={cn(
                            "text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors",
                            y === currentYear && "bg-primary text-primary-foreground"
                          )}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="w-24" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {weekdays.map((d) => (
                <div key={d} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center py-2">
                  {d}
                </div>
              ))}
              {cells.map((cell) => {
                const date = dateStr(cell.day, cell.current);
                const dayEvents = date ? eventsByDate[date] || [] : [];
                const hasEvents = dayEvents.length > 0;
                return (
                  <div
                    key={cell.key}
                    className={cn(
                      "min-h-24 rounded-md border p-1.5 text-xs transition-colors",
                      cell.current ? "bg-card" : "bg-muted/20 text-muted-foreground/50",
                      isToday(cell.day, cell.current) && "ring-2 ring-primary",
                      hasEvents && "border-primary/50 bg-primary/5",
                      hasEvents && cell.current && "cursor-pointer hover:bg-accent/30"
                    )}
                  >
                    <div className={cn(
                      "font-semibold mb-1",
                      isToday(cell.day, cell.current) && "text-primary",
                      hasEvents && !isToday(cell.day, cell.current) && "text-primary"
                    )}>
                      {cell.day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 2).map((e) => (
                        <button
                          key={e._id}
                          onClick={() => setSelected(e)}
                          className={cn(
                            "w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate",
                            priorityColors[e.priority]
                          )}
                        >
                          {e.customerName}: ${Number(e.amount).toLocaleString()}
                        </button>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 2} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
            <CardDescription>Next 10 active submissions</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="text-center py-8">
                <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No upcoming deadlines</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((bid) => (
                  <button
                    key={bid._id}
                    onClick={() => setSelected(bid)}
                    className="w-full text-left p-2.5 rounded-lg border hover:border-primary transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold truncate">{bid.customerName}</span>
                      <Badge variant={priorityBadge[bid.priority] || "secondary"} className="text-[10px] flex-shrink-0">
                        {bid.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{bid.productServiceRequired}</p>
                    <div className="flex items-center justify-between mt-1.5 text-xs">
                      <span className="text-muted-foreground">{bid.submissionDate}</span>
                      <span className="font-semibold">${Number(bid.amount).toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="font-mono text-xs text-muted-foreground">{selected?.bidId}</div>
            <DialogTitle>{selected?.customerName}</DialogTitle>
            <DialogDescription>{selected?.productServiceRequired}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Priority</div>
              <Badge variant={priorityBadge[selected?.priority] || "secondary"}>{selected?.priority}</Badge>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Amount</div>
              <div className="font-bold text-lg">${Number(selected?.amount).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Due</div>
              <div>{selected?.submissionDate}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Status</div>
              <Badge variant="info">{selected?.status}</Badge>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Assigned</div>
              <div>{selected?.assignedEmployee || "Unassigned"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">AI Prediction</div>
              <div className="font-bold text-emerald-600 mb-1">{selected?.aiPrediction}%</div>
              <Progress value={selected?.aiPrediction} className="h-1.5" />
            </div>
          </div>
          {selected?.remarks && (
            <>
              <Separator />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Remarks</div>
                <p className="text-sm">{selected.remarks}</p>
              </div>
            </>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            <Button onClick={() => { setSelected(null); navigate("/bids"); }}>
              <ExternalLink className="h-4 w-4" />
              Manage Bid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
