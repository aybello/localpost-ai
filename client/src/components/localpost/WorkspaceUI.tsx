import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ImageIcon, Palette, Sparkles } from "lucide-react";
import React, { type ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-4xl leading-[1.02] tracking-[-0.03em] sm:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const statusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  approved: "bg-secondary text-secondary-foreground border-primary/15",
  scheduled: "bg-primary/10 text-primary border-primary/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/15",
  ready: "bg-secondary text-secondary-foreground border-primary/15",
  analyzing: "bg-accent/55 text-accent-foreground border-accent",
  error: "bg-destructive/10 text-destructive border-destructive/15",
  pending: "bg-muted text-muted-foreground border-border",
  generating: "bg-accent/55 text-accent-foreground border-accent",
  failed: "bg-destructive/10 text-destructive border-destructive/15",
  completed: "bg-secondary text-secondary-foreground border-primary/15",
  queued: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[0.65rem] font-bold capitalize ${statusStyles[status] ?? statusStyles.draft}`}>
      {status}
    </Badge>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="surface-card hairline-grid relative grid min-h-80 items-center gap-10 overflow-hidden px-6 py-10 text-center sm:px-10 lg:grid-cols-[1fr_0.78fr] lg:px-14 lg:text-left">
      <div className="relative z-10 flex flex-col items-center lg:items-start">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <h2 className="mt-5 text-3xl leading-tight sm:text-4xl">{title}</h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
        {actionLabel && onAction && (
          <Button onClick={onAction} className="mt-6 rounded-xl">
            {actionLabel}
          </Button>
        )}
      </div>
      <div className="relative mx-auto hidden h-56 w-full max-w-sm sm:block">
        <div className="absolute left-0 top-2 w-[82%] rotate-[-3deg] rounded-2xl border bg-card p-4 shadow-xl shadow-primary/8">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary"><Palette className="h-3.5 w-3.5" /> Brand cues</span>
            <span className="rounded-full bg-secondary px-2 py-1 text-[0.55rem] font-bold text-primary">Website-derived</span>
          </div>
          <div className="mt-4 space-y-2"><div className="h-2.5 w-2/3 rounded-full bg-primary/18" /><div className="h-2.5 w-full rounded-full bg-muted" /><div className="h-2.5 w-4/5 rounded-full bg-muted" /></div>
          <div className="mt-4 flex gap-2"><span className="h-8 w-8 rounded-lg bg-primary" /><span className="h-8 w-8 rounded-lg bg-accent" /><span className="h-8 w-8 rounded-lg bg-secondary" /><span className="h-8 w-8 rounded-lg bg-foreground" /></div>
        </div>
        <div className="absolute bottom-0 right-0 w-[76%] rotate-[3deg] rounded-2xl bg-sidebar p-4 text-sidebar-foreground shadow-xl shadow-primary/12">
          <div className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-sidebar-primary"><CalendarDays className="h-3.5 w-3.5" /> Monthly rhythm</div>
          <div className="mt-4 grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, index) => <span key={index} className={`aspect-square rounded-lg ${index % 3 === 0 ? "bg-sidebar-primary/85" : "bg-sidebar-accent"}`} />)}</div>
        </div>
      </div>
    </div>
  );
}

export function PostImage({
  src,
  alt,
  className = "aspect-square",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  if (src) {
    return <img src={src} alt={alt} className={`${className} w-full object-cover`} />;
  }
  return (
    <div className={`${className} hairline-grid grid w-full place-items-center bg-secondary/35 text-primary/55`}>
      <div className="flex flex-col items-center gap-2">
        <ImageIcon className="h-6 w-6" />
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em]">Visual pending</span>
      </div>
    </div>
  );
}
