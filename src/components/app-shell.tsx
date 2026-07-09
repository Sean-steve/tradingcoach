import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Award, BarChart3, BookOpen, Brain, Gauge, LayoutDashboard, LineChart, LogOut, PlusCircle, Repeat, Settings, ShieldCheck, Sparkles, Target, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const nav: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { to: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { to: "/trades", label: "Trade Journal", icon: BookOpen },
  { to: "/trades/new", label: "Log Trade", icon: PlusCircle },
  { to: "/import", label: "CSV Import", icon: Upload },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/psychology", label: "Psychology", icon: Brain },
  { to: "/discipline", label: "Discipline", icon: ShieldCheck },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/habits", label: "Habits", icon: Repeat },
  { to: "/forecast", label: "Forecast", icon: LineChart },
  { to: "/rewards", label: "Rewards", icon: Award },
  { to: "/coach", label: "AI Coach", icon: Sparkles },
  { to: "/score", label: "Performance", icon: Gauge },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-border/50 bg-sidebar/60 backdrop-blur-md flex flex-col sticky top-0 h-screen">
        <Link to="/dashboard" className="flex items-center gap-2 px-5 h-16 border-b border-border/50">
          <div className="h-8 w-8 rounded-md bg-primary/20 border border-primary/40 grid place-items-center">
            <div className="h-3 w-3 rounded-sm bg-primary shadow-[0_0_12px_var(--primary)]" />
          </div>
          <span className="font-bold tracking-tight">TRADE OS</span>
        </Link>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                to={item.to as any}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border/50">
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}