import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal, Trash2, Pause, Play, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogEntry {
  ts: number;
  level: string;
  msg: string;
  data?: Record<string, unknown>;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = `${BASE}/api`;

const LEVEL_STYLE: Record<string, string> = {
  trace: "text-muted-foreground",
  debug: "text-blue-400",
  info:  "text-primary",
  warn:  "text-yellow-400",
  error: "text-red-400",
  fatal: "text-red-600 font-bold",
};

const LEVEL_BADGE: Record<string, string> = {
  trace: "bg-muted/40 text-muted-foreground",
  debug: "bg-blue-500/20 text-blue-400",
  info:  "bg-primary/20 text-primary",
  warn:  "bg-yellow-500/20 text-yellow-400",
  error: "bg-red-500/20 text-red-400",
  fatal: "bg-red-700/30 text-red-300",
};

function fmt(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
    "." + String(d.getMilliseconds()).padStart(3, "0");
}

export default function LogsPage() {
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [paused, setPaused]       = useState(false);
  const [filter, setFilter]       = useState<string>("all");
  const [search, setSearch]       = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const sinceRef   = useRef<number>(Date.now() - 60_000);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pausedRef  = useRef(paused);
  pausedRef.current = paused;

  const fetchLogs = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const res  = await fetch(`${API}/logs?since=${sinceRef.current}`);
      if (!res.ok) return;
      const data: LogEntry[] = await res.json();
      if (data.length > 0) {
        sinceRef.current = data[data.length - 1]!.ts;
        setLogs(prev => {
          const merged = [...prev, ...data];
          return merged.slice(-500); // keep last 500
        });
      }
    } catch {}
  }, []);

  // Initial load — fetch last minute of logs
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch(`${API}/logs`);
        if (!res.ok) return;
        const data: LogEntry[] = await res.json();
        if (data.length > 0) {
          sinceRef.current = data[data.length - 1]!.ts;
          setLogs(data);
        }
      } catch {}
    })();
  }, []);

  // Poll every 2 seconds
  useEffect(() => {
    const id = setInterval(fetchLogs, 2000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Detect manual scroll up — pause auto-scroll
  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const clear = () => {
    setLogs([]);
    sinceRef.current = Date.now();
  };

  const download = () => {
    const text = logs
      .map(l => `[${new Date(l.ts).toISOString()}] [${l.level.toUpperCase()}] ${l.msg}${l.data ? " " + JSON.stringify(l.data) : ""}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `rls-logs-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const FILTERS = ["all", "info", "warn", "error"];

  const visible = logs.filter(l => {
    if (filter !== "all" && l.level !== filter) return false;
    if (search) {
      const hay = (l.msg + JSON.stringify(l.data ?? "")).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
            <Terminal className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-mono font-bold text-foreground">Live Logs</h1>
            <p className="text-xs text-muted-foreground font-mono">
              {paused ? "⏸ paused" : "● live"} — {visible.length} entries
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused(p => !p)}
            className={cn(
              "terminal-btn px-3 py-1.5 gap-2 text-xs border",
              paused
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-muted/20 text-muted-foreground border-border"
            )}
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button onClick={download} className="terminal-btn px-3 py-1.5 gap-2 text-xs border bg-muted/20 text-muted-foreground border-border">
            <Download className="w-3 h-3" /> Export
          </button>
          <button onClick={clear} className="terminal-btn px-3 py-1.5 gap-2 text-xs border bg-destructive/10 text-destructive border-destructive/30">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 text-xs font-mono rounded transition-colors",
                filter === f
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search logs..."
          className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 transition-colors"
        />
        {!autoScroll && (
          <button
            onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
            className="terminal-btn px-3 py-1.5 text-xs border bg-primary/10 text-primary border-primary/30 animate-bounce"
          >
            ↓ Jump to bottom
          </button>
        )}
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="bg-card border border-border rounded-xl h-[calc(100vh-280px)] overflow-y-auto font-mono text-xs"
        style={{ minHeight: "400px" }}
      >
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Terminal className="w-10 h-10 opacity-20" />
            <p className="text-sm">No logs yet — waiting for server activity...</p>
            <p className="text-xs opacity-60">Polls every 2 seconds</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {visible.map((log, i) => (
                <tr
                  key={`${log.ts}-${i}`}
                  className={cn(
                    "border-b border-border/30 hover:bg-muted/10 transition-colors",
                    log.level === "error" || log.level === "fatal" ? "bg-red-500/5" : "",
                    log.level === "warn" ? "bg-yellow-500/5" : "",
                  )}
                >
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap align-top w-[90px]">
                    {fmt(log.ts)}
                  </td>
                  <td className="px-2 py-1.5 align-top w-[50px]">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] uppercase font-bold", LEVEL_BADGE[log.level] ?? LEVEL_BADGE["info"])}>
                      {log.level}
                    </span>
                  </td>
                  <td className={cn("px-2 py-1.5 align-top", LEVEL_STYLE[log.level] ?? "text-foreground")}>
                    {log.msg}
                    {log.data && (
                      <span className="ml-2 text-muted-foreground/70 break-all">
                        {JSON.stringify(log.data)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
