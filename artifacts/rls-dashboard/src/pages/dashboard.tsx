import { useState } from "react";
import { useGetStats } from "@workspace/api-client-react";
import { useRLSMutations } from "@/hooks/use-rls-api";
import { PhoneOutgoing, Users, PhoneMissed, CornerRightUp, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { data: stats, isLoading } = useGetStats({ query: { refetchInterval: 10000 } });
  const { makeCall } = useRLSMutations();

  const [callForm, setCallForm] = useState({ businessName: "", phone: "" });
  const [logs, setLogs] = useState<{msg: string, type: 'info'|'success'|'error'}[]>([{msg: 'Ready...', type: 'info'}]);

  const addLog = (msg: string, type: 'info'|'success'|'error') => {
    setLogs(prev => [...prev.slice(-10), { msg: `${new Date().toLocaleTimeString()} — ${msg}`, type }]);
  };

  const handleCall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callForm.businessName || !callForm.phone) {
      addLog("Enter business and phone", "error");
      return;
    }
    
    addLog(`Calling ${callForm.businessName}...`, "info");
    makeCall.mutate(
      { data: callForm },
      {
        onSuccess: (res) => {
          if (res.success) {
            addLog(`✓ Sarah is calling ${callForm.businessName}`, "success");
            setCallForm({ businessName: "", phone: "" });
          } else {
            addLog(`Error: ${res.error}`, "error");
          }
        },
        onError: (err) => addLog(`Error: ${err.message}`, "error")
      }
    );
  };

  if (isLoading) return <div className="text-muted-foreground animate-pulse font-mono">Loading telemetry...</div>;

  return (
    <div className="space-y-6">
      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="terminal-card">
          <h3 className="terminal-heading"><PhoneOutgoing className="w-4 h-4 text-primary" /> Total Calls</h3>
          <div className="terminal-value">{stats?.totalCalls ?? 0}</div>
        </div>
        <div className="terminal-card">
          <h3 className="terminal-heading"><Users className="w-4 h-4 text-primary" /> Transfers</h3>
          <div className="terminal-value">{stats?.transfers ?? 0}</div>
        </div>
        <div className="terminal-card">
          <h3 className="terminal-heading"><PhoneMissed className="w-4 h-4 text-primary" /> Voicemails Left</h3>
          <div className="terminal-value">{stats?.voicemails ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Call */}
        <div className="terminal-card">
          <h3 className="terminal-heading"><PhoneOutgoing className="w-4 h-4" /> Quick Call</h3>
          <form onSubmit={handleCall} className="space-y-4 mt-6">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Business Name</label>
              <input 
                className="terminal-input" 
                placeholder="e.g. Mike's Barbershop"
                value={callForm.businessName}
                onChange={e => setCallForm(prev => ({...prev, businessName: e.target.value}))}
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Phone Number</label>
              <input 
                className="terminal-input" 
                placeholder="+15551234567"
                type="tel"
                value={callForm.phone}
                onChange={e => setCallForm(prev => ({...prev, phone: e.target.value}))}
              />
            </div>
            <button 
              type="submit" 
              disabled={makeCall.isPending}
              className="terminal-btn terminal-btn-primary w-full mt-2"
            >
              {makeCall.isPending ? "Initiating..." : "Call Now"}
            </button>
          </form>

          <div className="log-container">
            {logs.map((log, i) => (
              <div key={i} className={cn(
                log.type === 'error' && "text-destructive",
                log.type === 'success' && "text-primary",
                log.type === 'info' && "text-muted-foreground"
              )}>
                {log.msg}
              </div>
            ))}
          </div>
        </div>

        {/* Stats Breakdown */}
        <div className="terminal-card flex flex-col">
          <h3 className="terminal-heading"><CornerRightUp className="w-4 h-4" /> Routing</h3>
          <div className="mb-6 p-4 bg-secondary rounded-lg border border-border">
            <div className="text-sm text-muted-foreground mb-1">Next Transfer</div>
            <div className="font-mono text-xl font-bold text-primary flex items-center gap-2">
              <CornerRightUp className="w-5 h-5" /> 
              {stats?.nextTransferTo === 'rick' ? 'Rick' : 'Vedder'}
            </div>
          </div>

          <h3 className="terminal-heading mt-2"><BarChart2 className="w-4 h-4" /> Breakdown</h3>
          <div className="space-y-0 divide-y divide-border border border-border rounded-lg bg-background">
            <div className="flex justify-between items-center p-3 text-sm">
              <span className="text-muted-foreground">Rick Transfers</span>
              <span className="font-mono text-primary font-bold">{stats?.rickTransfers ?? 0}</span>
            </div>
            <div className="flex justify-between items-center p-3 text-sm">
              <span className="text-muted-foreground">Vedder Transfers</span>
              <span className="font-mono text-primary font-bold">{stats?.vedderTransfers ?? 0}</span>
            </div>
            <div className="flex justify-between items-center p-3 text-sm">
              <span className="text-muted-foreground">No Answers</span>
              <span className="font-mono text-primary font-bold">{stats?.noAnswers ?? 0}</span>
            </div>
            <div className="flex justify-between items-center p-3 text-sm">
              <span className="text-muted-foreground">Hangups</span>
              <span className="font-mono text-primary font-bold">{stats?.hangups ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
