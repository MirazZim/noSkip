import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Cell,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, eachDayOfInterval, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Habit, HabitCompletion } from "@/hooks/useHabits";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  habits: Habit[];
  completions: HabitCompletion[];
}

function exportHabitsToCSV(habits: Habit[], completions: HabitCompletion[]) {
  try {
    // Create CSV header
    const headers = ["Date", ...habits.map(h => h.name)];
    
    // Get date range (last 90 days)
    const endDate = new Date();
    const startDate = subMonths(endDate, 3);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
    
    // Build completion map for quick lookup
    const completionMap = new Map<string, Set<string>>();
    completions.forEach(c => {
      if (!completionMap.has(c.date)) {
        completionMap.set(c.date, new Set());
      }
      completionMap.get(c.date)!.add(c.habit_id);
    });
    
    // Build CSV rows
    const rows = dateRange.map(date => {
      const dateStr = format(date, "yyyy-MM-dd");
      const completedHabits = completionMap.get(dateStr) || new Set();
      return [
        dateStr,
        ...habits.map(h => completedHabits.has(h.id) ? "✓" : "")
      ];
    });
    
    // Combine into CSV string
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    // Download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `habits-export-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("Habits exported to CSV");
  } catch (error) {
    console.error("Export failed:", error);
    toast.error("Failed to export habits");
  }
}

export function HabitAnalytics({ habits, completions }: Props) {
  // Daily completion count data (last 30 days)
  const dailyCompletionData = useMemo(() => {
    const endDate = new Date();
    const startDate = subMonths(endDate, 1);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
    
    const currentMonth = format(endDate, "MMMM");
    const previousMonth = format(startDate, "MMMM");
    
    // Build completion map: date -> count of completed habits
    const completionsByDate = new Map<string, number>();
    completions.forEach(c => {
      const count = completionsByDate.get(c.date) || 0;
      completionsByDate.set(c.date, count + 1);
    });
    
    const data = dateRange.map((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const count = completionsByDate.get(dateStr) || 0;
      const month = format(date, "MMMM");
      const isCurrentMonth = month === currentMonth;
      
      return {
        day: format(date, "d"),
        month: month,
        fullDate: format(date, "MMMM d, yyyy"),
        completions: count,
        isCurrentMonth,
      };
    });
    
    return {
      data,
      currentMonth,
      previousMonth,
    };
  }, [completions]);

  // Completion rate by habit (last 30 days)
  const completionRateData = useMemo(() => {
    const endDate = new Date();
    const startDate = subMonths(endDate, 1);
    const days = eachDayOfInterval({ start: startDate, end: endDate }).length;
    
    return habits.map(habit => {
      const habitCompletions = completions.filter(
        c => c.habit_id === habit.id && c.date >= format(startDate, "yyyy-MM-dd")
      );
      const rate = Math.round((habitCompletions.length / days) * 100);
      
      return {
        name: habit.emoji + " " + habit.name,
        rate,
      };
    }).sort((a, b) => b.rate - a.rate);
  }, [habits, completions]);

  // Monthly completion trends
  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      const monthStr = format(monthDate, "MMM");
      
      const monthCompletions = completions.filter(
        c => c.date >= format(start, "yyyy-MM-dd") && c.date <= format(end, "yyyy-MM-dd")
      );
      
      months.push({
        month: monthStr,
        completions: monthCompletions.length,
      });
    }
    return months;
  }, [completions]);

  const empty = (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <p className="text-xs text-muted-foreground">No data yet</p>
    </div>
  );

  const hasData = habits.length > 0 && completions.length > 0;

  return (
    <div className="space-y-4">
      {/* Export button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportHabitsToCSV(habits, completions)}
          disabled={!hasData}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export to CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Daily completions over time - Full width */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-border/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Activity</p>
                <p className="text-base font-black tracking-tight leading-tight">Daily Completions</p>
                <p className="text-[10px] text-muted-foreground mt-1">Last 30 days</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-semibold">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-gradient-to-b from-[hsl(142,71%,45%)] to-[hsl(142,71%,45%,0.7)]" />
                  <span className="text-muted-foreground">Current ({dailyCompletionData.currentMonth})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-gradient-to-b from-[hsl(0,72%,51%)] to-[hsl(0,72%,51%,0.7)]" />
                  <span className="text-muted-foreground">Previous ({dailyCompletionData.previousMonth})</span>
                </div>
              </div>
            </div>
          </div>

          {hasData ? (
            <div className="p-4 h-[280px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyCompletionData.data} barGap={1}>
                  <defs>
                    <linearGradient id="currentMonthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={1} />
                      <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="previousMonthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={1} />
                      <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid 
                    vertical={false} 
                    stroke="hsl(var(--border))" 
                    strokeOpacity={0.2} 
                    strokeDasharray="3 3" 
                  />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={(props) => {
                      const { x, y, payload, index } = props;
                      const dataPoint = dailyCompletionData.data[payload.index];
                      const isCurrentMonth = dataPoint?.isCurrentMonth;
                      
                      // On mobile, show every 3rd label to prevent crowding
                      // On desktop, show all labels
                      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                      const shouldShow = !isMobile || index % 3 === 0;
                      
                      if (!shouldShow) return null;
                      
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={16}
                            textAnchor="middle"
                            fill={isCurrentMonth ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)"}
                            fontSize={10}
                            fontWeight={600}
                          >
                            {payload.value}
                          </text>
                        </g>
                      );
                    }}
                    height={50}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
                    width={30}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.3, radius: 4 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-border/60 bg-card/98 backdrop-blur-sm px-3.5 py-2.5 shadow-2xl">
                          <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                            {data.fullDate}
                          </p>
                          <p className="text-base font-black text-foreground tabular-nums">
                            {data.completions} {data.completions === 1 ? 'habit' : 'habits'}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar 
                    dataKey="completions" 
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  >
                    {dailyCompletionData.data.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`}
                        fill={entry.isCurrentMonth ? "url(#currentMonthGrad)" : "url(#previousMonthGrad)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : empty}
        </div>

        {/* Other charts in a 2-column grid on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Completion rate by habit */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-border/40">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Performance</p>
            <p className="text-base font-black tracking-tight leading-tight">Completion Rate</p>
            <p className="text-[10px] text-muted-foreground mt-1">Last 30 days</p>
          </div>

          {hasData ? (
            <div className="p-4 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={completionRateData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm px-3 py-2 shadow-xl">
                          <p className="text-xs font-semibold">{payload[0].payload.name}</p>
                          <p className="text-sm font-bold text-primary tabular-nums">{payload[0].value}%</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : empty}
        </div>

        {/* Monthly completion trends - Full width */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-border/40">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Activity</p>
            <p className="text-base font-black tracking-tight leading-tight">Monthly Completions</p>
            <p className="text-[10px] text-muted-foreground mt-1">Last 6 months</p>
          </div>

          {hasData ? (
            <div className="p-4 h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <defs>
                    <linearGradient id="habitBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 600 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", radius: 6 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm px-3 py-2 shadow-xl">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">
                            {payload[0].payload.month}
                          </p>
                          <p className="text-sm font-black text-foreground tabular-nums">
                            {payload[0].value} completions
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="completions" fill="url(#habitBarGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : empty}
        </div>
        </div>
      </div>
    </div>
  );
}
