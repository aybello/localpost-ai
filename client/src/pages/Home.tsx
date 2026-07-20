import { EmptyState, PageHeader, PostImage, StatusBadge } from "@/components/localpost/WorkspaceUI";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ImageIcon,
  Palette,
  Plus,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";

function formatDate(value: Date | string | null) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Home() {
  const [, setLocation] = useLocation();
  const summary = trpc.dashboard.summary.useQuery();
  const businesses = trpc.businesses.list.useQuery();

  if (summary.isLoading || businesses.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (summary.error || businesses.error) {
    return (
      <EmptyState
        title="The workspace overview could not load"
        description={`${(summary.error || businesses.error)?.message} Your saved businesses and posts are unchanged.`}
        actionLabel="Try again"
        onAction={() => void Promise.all([summary.refetch(), businesses.refetch()])}
      />
    );
  }

  if (!businesses.data?.length) {
    return (
      <div className="page-enter mx-auto max-w-6xl">
        <div className="surface-card hairline-grid relative overflow-hidden border-0 p-7 sm:p-12 lg:p-16">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-secondary/80 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="eyebrow">Your content studio is ready</p>
              <h1 className="mt-4 max-w-3xl text-5xl leading-[0.96] tracking-[-0.04em] sm:text-7xl">
                Start with the story your website already tells.
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
                Add one business, review the AI-built brand profile, and create a month of 12–16 tailored Google Business Profile posts with matching photorealistic visuals.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" onClick={() => setLocation("/onboarding")} className="h-12 rounded-xl px-6 font-bold">
                  <Sparkles className="h-4 w-4" /> Analyze a business
                </Button>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md">
              <div className="surface-card rotate-[-2deg] p-5">
                <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Brand profile</span><StatusBadge status="ready" /></div>
                <div className="mt-6 space-y-3">
                  <div className="h-3 w-2/3 rounded-full bg-primary/18" />
                  <div className="h-3 w-full rounded-full bg-muted" />
                  <div className="h-3 w-5/6 rounded-full bg-muted" />
                  <div className="mt-6 flex gap-2">{["bg-primary", "bg-accent", "bg-secondary", "bg-foreground"].map(color => <span key={color} className={`h-10 w-10 rounded-xl ${color}`} />)}</div>
                </div>
              </div>
              <div className="surface-card ml-12 mt-[-8px] rotate-[2deg] bg-sidebar p-5 text-sidebar-foreground">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sidebar-primary">Monthly plan</p>
                <div className="mt-4 grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, index) => <div key={index} className={`aspect-square rounded-lg ${index % 3 === 0 ? "bg-sidebar-primary/80" : "bg-sidebar-accent"}`} />)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const data = summary.data;
  const metrics = [
    { label: "Businesses", value: data?.businessCount ?? 0, icon: Building2, detail: "Active brand workspaces" },
    { label: "Generated posts", value: data?.postCount ?? 0, icon: CalendarDays, detail: "Across every calendar" },
    { label: "Approved", value: data?.approvedCount ?? 0, icon: CheckCircle2, detail: "Ready for scheduling" },
    { label: "Ready visuals", value: data?.readyImageCount ?? 0, icon: ImageIcon, detail: "Stored with your posts" },
  ];

  return (
    <div className="page-enter mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Workspace overview"
        title="Your local content, in rhythm."
        description="Track each brand, see what is ready, and keep the next month moving without losing editorial control."
        actions={
          <>
            <Button variant="outline" className="rounded-xl bg-card" onClick={() => setLocation("/brand")}><Palette className="h-4 w-4" /> Review brand</Button>
            <Button className="rounded-xl" onClick={() => setLocation("/calendar")}><Sparkles className="h-4 w-4" /> Generate month</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(item => (
          <Card key={item.label} className="surface-card border-0">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p><p className="mt-3 text-4xl font-extrabold tracking-[-0.04em]">{item.value}</p></div>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary"><item.icon className="h-4 w-4" /></div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="surface-card overflow-hidden border-0">
          <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
            <div><p className="eyebrow">Coming up</p><h2 className="mt-1 text-3xl">Next on the calendar</h2></div>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/calendar")}>View month <ArrowRight className="h-4 w-4" /></Button>
          </div>
          <div className="divide-y">
            {data?.upcoming.length ? data.upcoming.map(({ post, businessName }) => (
              <button key={post.id} onClick={() => setLocation(`/posts/${post.id}`)} className="grid w-full grid-cols-[72px_1fr_auto] items-center gap-4 p-4 text-left hover:bg-muted/40 sm:px-6">
                <div className="overflow-hidden rounded-xl"><PostImage src={post.imageUrl} alt={post.imageAltText} className="h-[72px]" /></div>
                <div className="min-w-0"><p className="truncate text-sm font-bold">{post.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{businessName} · {formatDate(post.scheduledAt)}</p><p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{post.caption}</p></div>
                <StatusBadge status={post.status} />
              </button>
            )) : (
              <div className="px-6 py-12 text-center"><Clock3 className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-bold">No upcoming posts yet</p><p className="mt-1 text-xs text-muted-foreground">Generate a month to fill the calendar.</p></div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="surface-card border-0 p-5 sm:p-6">
            <div className="flex items-center justify-between"><div><p className="eyebrow">AI pipeline</p><h2 className="mt-1 text-3xl">Latest runs</h2></div><Sparkles className="h-5 w-5 text-primary" /></div>
            <div className="mt-5 space-y-4">
              {data?.latestRuns.length ? data.latestRuns.map(({ run, businessName }) => (
                <div key={run.id} className="rounded-xl border bg-muted/25 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{businessName}</p><p className="mt-1 text-xs text-muted-foreground">{run.calendarMonth} · {run.generatedPostCount}/{run.targetPostCount} posts</p></div><StatusBadge status={run.status} /></div>
                  <Progress value={run.progressPercent} className="mt-3 h-1.5" />
                </div>
              )) : <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Your first generation run will appear here.</p>}
            </div>
          </div>

          <div className="surface-card bg-sidebar p-6 text-sidebar-foreground">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sidebar-primary">Brand workspaces</p>
            <div className="mt-4 space-y-2">
              {businesses.data.slice(0, 3).map(item => (
                <button key={item.business.id} onClick={() => { localStorage.setItem("localpost-active-business", item.business.id); setLocation("/brand"); }} className="flex w-full items-center justify-between rounded-xl bg-sidebar-accent/55 px-4 py-3 text-left hover:bg-sidebar-accent">
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{item.business.name}</p><p className="mt-1 text-xs text-sidebar-foreground/55">{item.business.industry} · {item.postCount} posts</p></div><ArrowRight className="h-4 w-4 text-sidebar-primary" />
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => setLocation("/onboarding")} className="mt-4 w-full rounded-xl border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><Plus className="h-4 w-4" /> Add another business</Button>
          </div>
        </section>
      </div>
    </div>
  );
}
