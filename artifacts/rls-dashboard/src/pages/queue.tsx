import { useState } from "react";
import { useGetQueue } from "@workspace/api-client-react";
import { useRLSMutations } from "@/hooks/use-rls-api";
import { ListPlus, Play, Pause, Trash2, ListFilter, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function QueuePage() {
  const { data: queue, isLoading } = useGetQueue({ 
    query: { 
      // Poll every 3 seconds if active
      refetchInterval: (query) => query.state.data?.active ? 3000 : 10000 
    } 
  });
  const { addToQueue, startQueue, pauseQueue, resumeQueue, clearQueue } = useRLSMutations();

  const [leadsInput, setLeadsInput] = useState("");
  const [log, setLog] = useState<{msg: string, type: 'info'|'success'|'error'}>({msg: 'Paste leads above...', type: 'info'});

  const handleAdd = () => {
    if (!leadsInput.trim()) {
      setLog({ msg: "Paste leads first", type: "error" });
      return;
    }
    
    const lines = leadsInput.split('\n').map(l => l.trim()).filter(Boolean);
    const parsedLeads = lines.map(line => {
      const [name, phone] = line.split(',').map(p => p.trim());
      return { name: name || "Unknown", phone: phone || "" };
    }).filter(l => l.phone);

    if (!parsedLeads.length) {
      setLog({ msg: "No valid leads. Format: Name, Phone", type: "error" });
      return;
    }

    addToQueue.mutate(
      { data: { leads: parsedLeads } },
      {
        onSuccess: (res) => {
          if (res.success) {
            setLog({ msg: `✓ Added ${res.added} leads`, type: "success" });
            setLeadsInput("");
          } else {
            setLog({ msg: `Error: ${res.error}`, type: "error" });
          }
        }
      }
    );
  };

  if (isLoading) return <div className="text-muted-foreground animate-pulse font-mono">Loading queue...</div>;

  const total = queue?.items.length || 0;
  const done = (queue?.completed || 0) + (queue?.failed || 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isActive = queue?.active;
  const isPaused = queue?.paused;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-primary/20 text-primary border-primary/30';
      case 'calling': return 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse';
      case 'failed': return 'bg-destructive/20 text-destructive border-destructive/30';
      default: return 'bg-secondary text-muted-foreground border-border';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Add Leads */}
      <div className="terminal-card lg:col-span-1 flex flex-col">
        <h3 className="terminal-heading"><ListPlus className="w-4 h-4" /> Add to Queue</h3>
        <div className="mt-4 flex-1 flex flex-col gap-4">
          <div className="space-y-2 flex-1 flex flex-col">
            <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Format: Business Name, Phone
            </label>
            <textarea
              className="terminal-input flex-1 min-h-[200px] resize-none font-mono text-sm leading-relaxed"
              placeholder={"Mike's Barbershop, +15551234567\nLegacy HVAC, +15559876543"}
              value={leadsInput}
              onChange={(e) => setLeadsInput(e.target.value)}
            />
          </div>
          <button 
            onClick={handleAdd}
            disabled={addToQueue.isPending}
            className="terminal-btn terminal-btn-secondary w-full"
          >
            {addToQueue.isPending ? "Adding..." : "➕ Add to Queue"}
          </button>
          
          <div className={cn(
            "p-3 rounded-lg border font-mono text-xs mt-2",
            log.type === 'error' ? "bg-destructive/10 border-destructive/20 text-destructive" :
            log.type === 'success' ? "bg-primary/10 border-primary/20 text-primary" :
            "bg-secondary border-border text-muted-foreground"
          )}>
            {log.msg}
          </div>
        </div>
      </div>

      {/* Queue Manager */}
      <div className="terminal-card lg:col-span-2">
        <h3 className="terminal-heading"><ListFilter className="w-4 h-4" /> Queue Execution</h3>
        
        {/* Controls */}
        <div className="flex flex-wrap gap-3 mt-6 mb-8">
          {!isActive || isPaused ? (
            <button 
              onClick={() => isActive ? resumeQueue.mutate({}) : startQueue.mutate({})}
              disabled={startQueue.isPending || resumeQueue.isPending || total === 0}
              className="terminal-btn terminal-btn-primary flex-1 sm:flex-none"
            >
              <Play className="w-4 h-4 mr-2" /> {isActive ? "Resume" : "Start"}
            </button>
          ) : (
            <button 
              onClick={() => pauseQueue.mutate({})}
              disabled={pauseQueue.isPending}
              className="terminal-btn bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 border border-yellow-500/30 flex-1 sm:flex-none"
            >
              <Pause className="w-4 h-4 mr-2" /> Pause
            </button>
          )}
          
          <button 
            onClick={() => { if(confirm("Clear queue?")) clearQueue.mutate({}) }}
            disabled={clearQueue.isPending || total === 0}
            className="terminal-btn terminal-btn-danger flex-1 sm:flex-none"
          >
            <Trash2 className="w-4 h-4 mr-2" /> Clear
          </button>
        </div>

        {/* Progress */}
        <div className="mb-6 bg-secondary/50 rounded-xl p-4 border border-border">
          <div className="flex justify-between font-mono text-xs mb-3">
            <div className="flex items-center gap-2">
              {isActive && !isPaused && <Activity className="w-3 h-3 text-primary animate-pulse" />}
              <span className={cn(isActive && !isPaused ? "text-primary" : "text-muted-foreground")}>
                {total ? (isActive ? (isPaused ? "⏸ Paused" : "▶ Running") : "Idle") : "No active queue"}
                {total > 0 && ` — ${done}/${total}`}
              </span>
            </div>
            <span className="text-primary font-bold">{total > 0 ? `${pct}%` : ""}</span>
          </div>
          <div className="h-2 w-full bg-background rounded-full overflow-hidden border border-border">
            <div 
              className="h-full bg-primary transition-all duration-500 relative"
              style={{ width: `${pct}%` }}
            >
              {isActive && !isPaused && (
                <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" />
              )}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          <AnimatePresence>
            {!queue?.items.length ? (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-center py-10 text-muted-foreground font-mono text-sm">
                Queue is empty. Add leads to begin.
              </motion.div>
            ) : (
              queue.items.map((item, idx) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                >
                  <div className="flex items-center gap-4">
                    <div className="font-mono text-xs text-muted-foreground w-6">{idx + 1}.</div>
                    <div>
                      <div className="font-medium text-sm text-foreground">{item.name}</div>
                      <div className="font-mono text-xs text-primary/70">{item.phone}</div>
                    </div>
                  </div>
                  <span className={cn(
                    "font-mono text-[10px] uppercase px-2 py-1 rounded-full border tracking-wider font-bold",
                    getStatusColor(item.status)
                  )}>
                    {item.status}
                  </span>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
