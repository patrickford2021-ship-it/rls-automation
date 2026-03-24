import { useGetLearnings, useGetStats, useGetCallbacks } from "@workspace/api-client-react";
import { BrainCircuit, CornerRightUp, CalendarClock, Trophy } from "lucide-react";
import { format } from "date-fns";

export default function SarahAIPage() {
  const { data: learnings, isLoading: lLoading } = useGetLearnings();
  const { data: stats, isLoading: sLoading } = useGetStats();
  const { data: callbacks, isLoading: cLoading } = useGetCallbacks();

  if (lLoading || sLoading || cLoading) {
    return <div className="text-muted-foreground animate-pulse font-mono">Loading Sarah's brain...</div>;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* AI Learnings */}
      <div className="terminal-card xl:col-span-2">
        <h3 className="terminal-heading"><BrainCircuit className="w-4 h-4 text-primary" /> Learned from Real Calls</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Sarah analyzes every successful transfer and extracts winning techniques automatically.
          These insights are fed back into her system prompt for future calls.
        </p>

        <div className="flex items-center gap-4 mb-6 font-mono text-xs text-primary/70">
          <div className="px-3 py-1.5 rounded bg-primary/10 border border-primary/20">
            {learnings?.totalAnalyzed || 0} Calls Analyzed
          </div>
          {learnings?.lastUpdated && (
            <div>Last updated: {format(new Date(learnings.lastUpdated), "MMM d, h:mm a")}</div>
          )}
        </div>

        {!learnings?.insights.length ? (
          <div className="text-muted-foreground font-mono text-sm py-8 border border-dashed border-border rounded-lg text-center">
            No learnings yet — make some calls to generate data!
          </div>
        ) : (
          <div className="space-y-3">
            {learnings.insights.map((insight, i) => (
              <div key={i} className="p-4 rounded-lg bg-background border-l-2 border-l-primary border-y border-r border-border text-sm text-foreground flex gap-3">
                <Trophy className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span className="leading-relaxed text-muted-foreground">{insight}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6 xl:col-span-1">
        {/* Round Robin Stats */}
        <div className="terminal-card">
          <h3 className="terminal-heading"><CornerRightUp className="w-4 h-4" /> Round Robin</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-background rounded-lg p-3 border border-border">
              <div className="text-[10px] uppercase font-mono text-muted-foreground mb-1">Rick</div>
              <div className="text-2xl font-mono font-bold text-primary">{stats?.rickTransfers || 0}</div>
            </div>
            <div className="bg-background rounded-lg p-3 border border-border">
              <div className="text-[10px] uppercase font-mono text-muted-foreground mb-1">Vedder</div>
              <div className="text-2xl font-mono font-bold text-primary">{stats?.vedderTransfers || 0}</div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground border-t border-border pt-4">
            Next transfer goes to: <span className="font-mono text-primary font-bold uppercase ml-1">{stats?.nextTransferTo === 'rick' ? 'Rick' : 'Vedder'}</span>
          </div>
        </div>

        {/* Scheduled Callbacks */}
        <div className="terminal-card">
          <h3 className="terminal-heading"><CalendarClock className="w-4 h-4 text-blue-400" /> Scheduled Callbacks</h3>
          
          {!callbacks?.length ? (
            <div className="text-muted-foreground font-mono text-xs py-4 text-center">
              No callbacks scheduled.
            </div>
          ) : (
            <div className="space-y-3 mt-4">
              {callbacks.map(c => (
                <div key={c.id} className="p-3 rounded-lg bg-background border border-border">
                  <div className="font-medium text-sm text-foreground">{c.businessName}</div>
                  <div className="font-mono text-xs text-primary/70 my-1">{c.phone}</div>
                  <div className="text-[10px] text-muted-foreground flex justify-between mt-2 pt-2 border-t border-border/50">
                    <span>{c.requestedTime}</span>
                    <span className="uppercase text-foreground">{c.repName}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
