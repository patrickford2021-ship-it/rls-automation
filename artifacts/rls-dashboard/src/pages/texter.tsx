import { useGetLeads } from "@workspace/api-client-react";
import { useRLSMutations } from "@/hooks/use-rls-api";
import { MessageSquareText, Send, UserCheck, CalendarClock, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TexterPage() {
  const { data: leadsData, isLoading, refetch } = useGetLeads();
  const { testTexter } = useRLSMutations();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Info & Actions */}
      <div className="terminal-card lg:col-span-1 flex flex-col h-fit">
        <h3 className="terminal-heading"><MessageSquareText className="w-4 h-4" /> Follow-Up Texter</h3>
        
        <div className="mt-4 space-y-0 divide-y divide-border border border-border rounded-lg bg-background">
          <div className="flex justify-between items-center p-3 text-sm">
            <span className="text-muted-foreground flex items-center gap-2"><UserCheck className="w-4 h-4"/> Rick</span>
            <span className="font-mono text-foreground">(585) 738-5741</span>
          </div>
          <div className="flex justify-between items-center p-3 text-sm">
            <span className="text-muted-foreground flex items-center gap-2"><UserCheck className="w-4 h-4"/> Vedder</span>
            <span className="font-mono text-foreground">(315) 520-1443</span>
          </div>
          <div className="flex justify-between items-center p-3 text-sm">
            <span className="text-muted-foreground flex items-center gap-2"><CalendarClock className="w-4 h-4"/> Schedule</span>
            <span className="font-mono text-primary">9:30 AM EST (Mon-Fri)</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
          The texter automatically sends SMS notifications to Rick and Vedder every morning with their daily follow-up leads.
        </p>

        <button 
          onClick={() => testTexter.mutate({})}
          disabled={testTexter.isPending}
          className="terminal-btn terminal-btn-primary w-full mt-6"
        >
          <Send className="w-4 h-4 mr-2" /> 
          {testTexter.isPending ? "Sending..." : "Send Test Now"}
        </button>
      </div>

      {/* Leads List */}
      <div className="terminal-card lg:col-span-2">
        <div className="flex justify-between items-center mb-6">
          <h3 className="terminal-heading mb-0"><UserCheck className="w-4 h-4" /> Today's Follow-Ups</h3>
          <button 
            onClick={() => refetch()}
            className="terminal-btn terminal-btn-secondary !py-1.5 !px-3 !text-[10px]"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="text-primary font-mono text-sm animate-pulse">Loading CRM leads...</div>
        ) : !leadsData?.leads?.length ? (
          <div className="text-center py-12 text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg">
            No follow-ups scheduled for today.
          </div>
        ) : (
          <div className="space-y-3">
            {leadsData.leads.map((lead, i) => (
              <div key={i} className="p-4 rounded-lg bg-background border border-border hover:border-primary/30 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-medium text-sm text-foreground">{lead.name}</div>
                  <span className="font-mono text-[10px] uppercase px-2 py-1 rounded bg-secondary text-muted-foreground">
                    {lead.contactedBy}
                  </span>
                </div>
                <div className="font-mono text-xs text-primary/70 flex items-center gap-2 mb-3">
                  <Phone className="w-3 h-3" /> {lead.phone}
                </div>
                <div className="text-xs text-muted-foreground bg-card p-2 rounded border border-border/50">
                  {lead.notes || "No notes provided."}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
