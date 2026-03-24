import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, ListOrdered, MessageSquareText, 
  FileText, GraduationCap, BrainCircuit, Activity, Power, ScrollText
} from "lucide-react";
import { useGetSarahStatus } from "@workspace/api-client-react";
import { useRLSMutations } from "@/hooks/use-rls-api";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/queue", label: "Queue", icon: ListOrdered },
  { path: "/texter", label: "Texter", icon: MessageSquareText },
  { path: "/transcripts", label: "Transcripts", icon: FileText },
  { path: "/training", label: "Training", icon: GraduationCap },
  { path: "/sarah", label: "Sarah AI", icon: BrainCircuit },
  { path: "/logs", label: "Logs", icon: ScrollText },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: sarahStatus } = useGetSarahStatus();
  const { enableSarah, disableSarah } = useRLSMutations();

  const isSarahOn = sarahStatus?.sarahEnabled ?? false;

  const toggleSarah = () => {
    if (isSarahOn) disableSarah.mutate({});
    else enableSarah.mutate({});
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-mono font-bold text-lg leading-tight tracking-tight text-foreground">RLS</h1>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Automation Hub</p>
            </div>
          </div>

          <button
            onClick={toggleSarah}
            disabled={enableSarah.isPending || disableSarah.isPending}
            className={cn(
              "terminal-btn px-4 py-2 gap-2 border transition-all duration-300",
              isSarahOn 
                ? "bg-primary/10 text-primary border-primary/30 animate-pulse-glow" 
                : "bg-destructive/10 text-destructive border-destructive/30"
            )}
          >
            <Power className="w-4 h-4" />
            {isSarahOn ? "SARAH ON" : "SARAH OFF"}
          </button>
        </div>

        {/* Navigation */}
        <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto no-scrollbar">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-4 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
