import { useGetTranscripts } from "@workspace/api-client-react";
import { FileText, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function TranscriptsPage() {
  const { data: transcripts, isLoading, refetch } = useGetTranscripts();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return <div className="text-muted-foreground animate-pulse font-mono">Loading transcripts...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Call Transcripts</h2>
          <p className="text-sm text-muted-foreground mt-1 font-mono">
            {transcripts?.length || 0} calls recorded
          </p>
        </div>
        <button onClick={() => refetch()} className="terminal-btn terminal-btn-secondary">
          Refresh
        </button>
      </div>

      {!transcripts?.length ? (
        <div className="terminal-card text-center py-16 text-muted-foreground font-mono">
          No transcripts available yet.
        </div>
      ) : (
        <div className="space-y-4">
          {transcripts.map((t) => {
            const isTransferred = t.outcome === "transferred";
            const isExpanded = expandedId === t.id;

            return (
              <div key={t.id} className="terminal-card !p-0 overflow-hidden">
                {/* Header */}
                <div 
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                >
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{t.businessName}</h4>
                    <div className="flex items-center gap-3 mt-1 font-mono text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {format(new Date(t.createdAt), "MMM d, h:mm a")}</span>
                      {t.duration && <span>{t.duration}s</span>}
                    </div>
                  </div>
                  
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[10px] uppercase font-bold tracking-wider w-fit",
                    isTransferred ? "bg-primary/10 text-primary border-primary/20" : "bg-destructive/10 text-destructive border-destructive/20"
                  )}>
                    {isTransferred ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {isTransferred ? `Transferred ${t.transferredTo ? `to ${t.transferredTo}` : ''}` : t.outcome.replace('_', ' ')}
                  </div>
                </div>

                {/* Transcript Body */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border bg-background"
                    >
                      <div className="p-4 max-h-[400px] overflow-y-auto space-y-4 font-mono text-xs">
                        {!t.transcript?.length ? (
                          <div className="text-muted-foreground italic">No dialog recorded.</div>
                        ) : (
                          t.transcript.map((line, i) => {
                            const isSarah = line.speaker === "SARAH";
                            return (
                              <div key={i} className="flex flex-col gap-1">
                                <span className={cn(
                                  "font-bold uppercase tracking-wider",
                                  isSarah ? "text-primary" : "text-foreground"
                                )}>
                                  {line.speaker}
                                </span>
                                <span className="text-muted-foreground leading-relaxed">
                                  {line.text}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
