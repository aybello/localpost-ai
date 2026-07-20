import { EmptyState, PageHeader, PostImage, StatusBadge } from "@/components/localpost/WorkspaceUI";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getCalendarViewState } from "@/lib/calendar-state";
import { batchImageIds, selectRetryableImageIds } from "@/lib/post-images";
import { trpc } from "@/lib/trpc";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function toCalendarMonth(date: Date) {
  return format(date, "yyyy-MM");
}

export default function ContentCalendar() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem("localpost-active-business") ?? "");
  const [targetCount, setTargetCount] = useState(14);
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number; failures: number } | null>(null);

  const businesses = trpc.businesses.list.useQuery();

  useEffect(() => {
    if (!selectedId && businesses.data?.[0]) {
      setSelectedId(businesses.data[0].business.id);
      localStorage.setItem("localpost-active-business", businesses.data[0].business.id);
    }
  }, [businesses.data, selectedId]);

  const calendarMonth = toCalendarMonth(month);
  const posts = trpc.posts.list.useQuery(
    { businessId: selectedId || undefined, calendarMonth },
    { enabled: Boolean(selectedId) }
  );
  const imageMutation = trpc.posts.generateImage.useMutation();

  async function createImages(postIds: string[]) {
    setImageProgress({ done: 0, total: postIds.length, failures: 0 });
    let done = 0;
    let failures = 0;
    for (const batch of batchImageIds(postIds)) {
      const results = await Promise.allSettled(
        batch.map(postId => imageMutation.mutateAsync({ postId }))
      );
      done += batch.length;
      failures += results.filter(result => result.status === "rejected").length;
      setImageProgress({ done, total: postIds.length, failures });
    }
    await Promise.all([
      utils.posts.list.invalidate(),
      utils.dashboard.summary.invalidate(),
      utils.businesses.list.invalidate(),
    ]);
    setImageProgress(null);
    if (failures) {
      toast.warning("The content month is ready", {
        description: `${postIds.length - failures} visuals were created. ${failures} can be retried from their post editor.`,
      });
    } else {
      toast.success("Your content month is ready", {
        description: `Created ${postIds.length} posts with matching visuals.`,
      });
    }
  }

  const generate = trpc.generation.createMonthlyPlan.useMutation({
    onSuccess: async result => {
      await utils.posts.list.invalidate();
      await createImages(result.posts.map(post => post.id));
    },
    onError: error => toast.error("The month could not be generated", { description: error.message }),
  });

  const selectedBusiness = businesses.data?.find(item => item.business.id === selectedId);
  const calendarViewState = getCalendarViewState({
    businessesLoading: businesses.isLoading,
    businessesError: Boolean(businesses.error),
    businessCount: businesses.data?.length ?? 0,
    hasBrandProfile: Boolean(selectedBusiness?.brandProfile),
    postsLoading: Boolean(selectedId) && posts.isLoading,
    postsError: Boolean(posts.error),
    postCount: posts.data?.length ?? 0,
  });
  const actionError = generate.error ?? imageMutation.error;
  const pendingImageIds = selectRetryableImageIds(posts.data ?? []);
  const monthAlreadyPlanned = Boolean(posts.data?.length);
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month]
  );

  const postsByDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof posts.data>>();
    for (const item of posts.data ?? []) {
      if (!item.scheduledAt) continue;
      const key = format(new Date(item.scheduledAt), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [posts.data]);

  if (calendarViewState === "businesses-loading") {
    return <div className="space-y-6"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-[40rem] rounded-2xl" /></div>;
  }

  if (calendarViewState === "businesses-error") {
    return (
      <div className="surface-card mx-auto max-w-xl p-8 text-center sm:p-10">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertCircle className="h-5 w-5" /></div>
        <h1 className="mt-5 text-4xl">We couldn’t load your calendar</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Your saved businesses and posts are unchanged. Retry the workspace request when you’re ready.</p>
        <Button onClick={() => businesses.refetch()} className="mt-6 rounded-xl"><RefreshCw className="h-4 w-4" /> Try again</Button>
      </div>
    );
  }

  if (calendarViewState === "businesses-empty") {
    return (
      <EmptyState
        title="Add a brand before building a calendar"
        description="The monthly planner needs a reviewed business and brand profile to create grounded captions and visuals."
        actionLabel="Analyze a business"
        onAction={() => setLocation("/onboarding")}
      />
    );
  }

  const busy = generate.isPending || Boolean(imageProgress);

  return (
    <div className="page-enter mx-auto max-w-[1500px]">
      <PageHeader
        eyebrow="Monthly content plan"
        title="A clear view of what comes next."
        description="Generate 12–16 varied GBP posts, review each caption and visual, then move drafts through approval and scheduling."
        actions={
          <Button variant="outline" className="rounded-xl bg-card" onClick={() => setLocation("/brand")}>
            <ArrowLeft className="h-4 w-4" /> Review brand
          </Button>
        }
      />

      {busy && (
        <Card className="surface-card mb-6 overflow-hidden border-0 bg-sidebar text-sidebar-foreground">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-bold">
                    {generate.isPending ? "Writing and quality-checking the month" : "Creating photorealistic visuals"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-sidebar-foreground/60">
                    {generate.isPending
                      ? "GPT‑5.5 is building distinct topics, captions, hashtags, calls-to-action, and image direction."
                      : `${imageProgress?.done ?? 0} of ${imageProgress?.total ?? 0} images complete${imageProgress?.failures ? ` · ${imageProgress.failures} to retry` : ""}.`}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-sidebar-primary">
                {generate.isPending ? "Planning" : `${Math.round(((imageProgress?.done ?? 0) / Math.max(1, imageProgress?.total ?? 1)) * 100)}%`}
              </span>
            </div>
            <Progress
              value={generate.isPending ? 28 : ((imageProgress?.done ?? 0) / Math.max(1, imageProgress?.total ?? 1)) * 100}
              className="mt-4 h-1.5 bg-sidebar-accent"
            />
          </CardContent>
        </Card>
      )}

      {actionError && (
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div><p className="text-sm font-bold text-destructive">That calendar action didn’t finish</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Your saved month is unchanged. You can dismiss this message and retry generation or any pending visuals.</p></div>
          </div>
          <Button variant="outline" onClick={() => { generate.reset(); imageMutation.reset(); }} className="shrink-0 rounded-xl bg-card">Dismiss</Button>
        </div>
      )}

      <div className="surface-card mb-6 flex flex-col gap-4 border-0 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            aria-label="Select business"
            value={selectedId}
            disabled={busy}
            onChange={event => {
              setSelectedId(event.target.value);
              localStorage.setItem("localpost-active-business", event.target.value);
            }}
            className="h-11 min-w-52 rounded-xl border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"
          >
            {(businesses.data ?? []).map(item => <option key={item.business.id} value={item.business.id}>{item.business.name}</option>)}
          </select>
          <div className="flex items-center rounded-xl border bg-background p-1">
            <button disabled={busy} onClick={() => setMonth(current => subMonths(current, 1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <div className="min-w-36 text-center text-sm font-bold">{format(month, "MMMM yyyy")}</div>
            <button disabled={busy} onClick={() => setMonth(current => addMonths(current, 1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            Posts
            <select value={targetCount} disabled={busy} onChange={event => setTargetCount(Number(event.target.value))} className="h-10 rounded-xl border bg-background px-3 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-ring">
              {[12, 13, 14, 15, 16].map(count => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
          {pendingImageIds.length > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              className="h-11 rounded-xl bg-card"
              onClick={() => void createImages(pendingImageIds)}
            >
              <ImageIcon className="h-4 w-4" /> Create {pendingImageIds.length} visual{pendingImageIds.length === 1 ? "" : "s"}
            </Button>
          )}
          <Button
            disabled={busy || posts.isLoading || !selectedBusiness?.brandProfile || monthAlreadyPlanned}
            className="h-11 rounded-xl"
            onClick={() => generate.mutate({ businessId: selectedId, calendarMonth, targetPostCount: targetCount })}
          >
            <Sparkles className="h-4 w-4" /> {monthAlreadyPlanned ? "Month planned" : `Generate ${format(month, "MMMM")}`}
          </Button>
        </div>
      </div>

      {calendarViewState === "brand-required" ? (
        <EmptyState
          title="This business needs a brand profile"
          description="Finish website analysis and review the extracted brand direction before generating a month."
          actionLabel="Open brand profile"
          onAction={() => setLocation("/brand")}
        />
      ) : calendarViewState === "posts-loading" ? (
        <Skeleton className="h-[42rem] rounded-2xl" />
      ) : calendarViewState === "posts-error" ? (
        <div className="surface-card p-8 text-center sm:p-10">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertCircle className="h-5 w-5" /></div>
          <h2 className="mt-5 text-3xl">This month couldn’t be loaded</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Your selected business, month, and saved posts are unchanged. Retry this month’s request without leaving the calendar.</p>
          <Button onClick={() => posts.refetch()} className="mt-6 rounded-xl"><RefreshCw className="h-4 w-4" /> Retry month</Button>
        </div>
      ) : calendarViewState === "posts-empty" ? (
        <EmptyState
          title={`No posts in ${format(month, "MMMM")}`}
          description={`Generate ${targetCount} brand-matched posts with captions, hashtags, calls-to-action, scheduled dates, and photorealistic visual concepts.`}
          actionLabel={busy ? undefined : `Generate ${targetCount} posts`}
          onAction={busy ? undefined : () => generate.mutate({ businessId: selectedId, calendarMonth, targetPostCount: targetCount })}
        />
      ) : (
        <>
          <div className="surface-card hidden overflow-hidden border-0 md:block">
            <div className="grid grid-cols-7 border-b bg-muted/35">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <div key={day} className="px-3 py-3 text-center text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map(day => {
                const dayPosts = postsByDay.get(format(day, "yyyy-MM-dd")) ?? [];
                return (
                  <div key={day.toISOString()} className={`min-h-36 border-b border-r p-2 last:border-r-0 ${isSameMonth(day, month) ? "bg-card" : "bg-muted/20"}`}>
                    <div className={`mb-2 text-right text-xs font-bold ${isSameMonth(day, month) ? "text-foreground" : "text-muted-foreground/45"}`}>{format(day, "d")}</div>
                    <div className="space-y-2">
                      {dayPosts.slice(0, 2).map(post => (
                        <button key={post.id} onClick={() => setLocation(`/posts/${post.id}`)} className="flex w-full items-center gap-2 rounded-xl border bg-background p-1.5 text-left shadow-sm hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg"><PostImage src={post.imageUrl} alt={post.imageAltText} className="h-10" /></div>
                          <div className="min-w-0 flex-1"><p className="truncate text-[0.7rem] font-bold">{post.title}</p><div className="mt-1 flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${post.status === "scheduled" ? "bg-primary" : post.status === "approved" ? "bg-emerald-500" : post.status === "rejected" ? "bg-destructive" : "bg-muted-foreground/55"}`} /><span className="text-[0.58rem] capitalize text-muted-foreground">{post.status}</span></div></div>
                        </button>
                      ))}
                      {dayPosts.length > 2 && <p className="px-2 text-[0.62rem] font-bold text-primary">+{dayPosts.length - 2} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {(posts.data ?? []).map(post => (
              <button key={post.id} onClick={() => setLocation(`/posts/${post.id}`)} className="surface-card flex w-full items-center gap-4 border-0 p-3 text-left">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl"><PostImage src={post.imageUrl} alt={post.imageAltText} className="h-20" /></div>
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-xs font-bold text-primary">{post.scheduledAt ? format(new Date(post.scheduledAt), "MMM d") : "Unscheduled"}</span><StatusBadge status={post.status} /></div><p className="mt-2 truncate text-sm font-bold">{post.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{post.caption}</p></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {(posts.data ?? []).length} posts</span>
            <span className="flex items-center gap-2"><ImageIcon className="h-4 w-4" /> {(posts.data ?? []).filter(post => post.imageStatus === "ready").length} visuals ready</span>
            <span className="flex items-center gap-2"><StatusBadge status="draft" /> <StatusBadge status="approved" /> <StatusBadge status="scheduled" /></span>
          </div>
        </>
      )}
    </div>
  );
}
