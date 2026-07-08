import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Brain, Gauge, LineChart, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const pillars = [
    { icon: Gauge, title: "Command Center", desc: "Every metric that matters — P&L, win rate, profit factor, expectancy, drawdown, streaks — at a glance." },
    { icon: Brain, title: "Psychology Engine", desc: "Pre/post-trade check-ins surface patterns like 'you lose 72% when stressed'." },
    { icon: ShieldCheck, title: "Discipline Score", desc: "Rule compliance, checklist adherence, and risk violations rolled into a 0–100 score." },
    { icon: LineChart, title: "Deep Analytics", desc: "Strategy, session, and asset dashboards. Rolling performance. Heatmap calendar." },
    { icon: Target, title: "Mistake Engine", desc: "Auto-categorized mistakes with financial cost and suggested fixes. Fix the category, not the trade." },
    { icon: Sparkles, title: "AI Performance Coach", desc: "Analytical daily / weekly / monthly reviews. Findings, evidence, next action. No market calls." },
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-border/50 backdrop-blur-md sticky top-0 z-40 bg-background/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/20 border border-primary/40 grid place-items-center">
              <div className="h-3 w-3 rounded-sm bg-primary shadow-[0_0_12px_var(--primary)]" />
            </div>
            <span className="font-bold tracking-tight text-lg">TRADE OS</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--gradient-glow)" }} />
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-medium mb-6">
            <Sparkles className="h-3 w-3" /> Performance OS — not a trade journal
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            The <span className="text-primary" style={{ textShadow: "0 0 40px var(--primary)" }}>operating system</span><br />
            for professional traders.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            TRADE OS is an AI performance coach that measures discipline over luck, surfaces the exact patterns
            costing you money, and turns you into a consistently profitable trader.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">Start free <ArrowRight className="h-4 w-4" /></Button>
            </Link>
            <Link to="/dashboard">
              <Button size="lg" variant="outline">Open dashboard</Button>
            </Link>
          </div>
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
            {[
              { k: "23", v: "coach modules" },
              { k: "0", v: "market predictions" },
              { k: "100", v: "discipline score" },
              { k: "∞", v: "trades logged" },
            ].map((s) => (
              <div key={s.v} className="glow-card rounded-xl p-4">
                <div className="number-mono text-3xl text-primary">{s.k}</div>
                <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Every screen answers one question.</h2>
        <p className="text-muted-foreground mb-10">What should I do next to become a better trader?</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pillars.map((p) => (
            <div key={p.title} className="glow-card rounded-2xl p-6 hover:border-primary/40 transition-colors">
              <p.icon className="h-6 w-6 text-primary mb-4" />
              <h3 className="font-semibold text-lg mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="glow-card rounded-3xl p-10 md:p-16 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-40" style={{ background: "var(--gradient-glow)" }} />
          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight max-w-2xl">
              Discipline compounds. <span className="text-primary">Start compounding today.</span>
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl">
              Log your first trade in under 60 seconds. Get a real performance score by the end of the week.
            </p>
            <Link to="/auth" className="inline-block mt-8">
              <Button size="lg" className="gap-2">Create your account <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <div>© {new Date().getFullYear()} TRADE OS</div>
          <div className="flex gap-4">
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
            <a href="mailto:hello@tradeos.app" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
