import { useState } from "react";
import { useGetTraining } from "@workspace/api-client-react";
import { useRLSMutations } from "@/hooks/use-rls-api";
import { Youtube, Lightbulb, BookOpen } from "lucide-react";
import { format } from "date-fns";

export default function TrainingPage() {
  const { data: training, isLoading } = useGetTraining();
  const { addTraining } = useRLSMutations();
  const [url, setUrl] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    addTraining.mutate({ data: { url } }, {
      onSuccess: () => setUrl("")
    });
  };

  if (isLoading) return <div className="text-muted-foreground animate-pulse font-mono">Loading training data...</div>;

  return (
    <div className="space-y-6">
      {/* Add Training */}
      <div className="terminal-card">
        <h3 className="terminal-heading"><Youtube className="w-4 h-4 text-red-500" /> Add YouTube Training</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
          Paste a YouTube sales training video URL. Sarah will automatically watch it, extract the best sales techniques, and apply them to future cold calls.
        </p>
        <form onSubmit={handleAdd} className="flex gap-3 max-w-2xl">
          <input 
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            className="terminal-input flex-1"
            value={url}
            onChange={e => setUrl(e.target.value)}
            required
          />
          <button 
            type="submit" 
            disabled={addTraining.isPending}
            className="terminal-btn terminal-btn-primary"
          >
            {addTraining.isPending ? "Extracting..." : "Train Sarah"}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Videos List */}
        <div className="terminal-card flex flex-col h-fit">
          <h3 className="terminal-heading"><BookOpen className="w-4 h-4" /> Source Videos</h3>
          {!training?.videos.length ? (
            <div className="text-muted-foreground font-mono text-sm py-4">No videos added yet.</div>
          ) : (
            <div className="space-y-3 mt-2">
              {training.videos.map(v => (
                <div key={v.videoId} className="p-3 rounded-lg bg-background border border-border">
                  <div className="font-medium text-sm text-foreground mb-1">{v.title}</div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground font-mono">
                    <span>{v.channel}</span>
                    <span>{v.addedAt ? format(new Date(v.addedAt), "MMM d, yyyy") : ''}</span>
                  </div>
                  {v.techniques && (
                    <div className="mt-2 text-[10px] text-primary bg-primary/10 w-fit px-2 py-0.5 rounded border border-primary/20">
                      {v.techniques.length} techniques extracted
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Extracted Techniques */}
        <div className="terminal-card">
          <h3 className="terminal-heading"><Lightbulb className="w-4 h-4 text-yellow-500" /> Active Techniques</h3>
          {!training?.techniques.length ? (
            <div className="text-muted-foreground font-mono text-sm py-4">No techniques extracted yet.</div>
          ) : (
            <div className="space-y-3 mt-2">
              {training.techniques.map((t, i) => (
                <div key={i} className="p-3 rounded-lg bg-background border-l-2 border-l-yellow-500 border-y border-r border-border text-sm text-muted-foreground leading-relaxed">
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
