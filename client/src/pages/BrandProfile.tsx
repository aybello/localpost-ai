import { EmptyState, PageHeader, StatusBadge } from "@/components/localpost/WorkspaceUI";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Check, Globe2, Loader2, Palette, RefreshCw, Save, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type ColorEvidenceView = {
  color: string;
  source: string;
  confidence: "high" | "medium" | "low";
  score: number;
};

type BrandForm = {
  brandSummary: string;
  brandVoice: string;
  toneKeywords: string;
  brandColors: string;
  messagingThemes: string;
  audienceInsights: string;
  audienceSegments: string;
  services: string;
  keywords: string;
  keyDifferentiators: string;
  visualStyle: string;
  imageGuidance: string;
  contentPillars: string;
  avoidTopics: string;
};

const emptyForm: BrandForm = {
  brandSummary: "",
  brandVoice: "",
  toneKeywords: "",
  brandColors: "",
  messagingThemes: "",
  audienceInsights: "",
  audienceSegments: "",
  services: "",
  keywords: "",
  keyDifferentiators: "",
  visualStyle: "",
  imageGuidance: "",
  contentPillars: "",
  avoidTopics: "",
};

function join(values: string[]) {
  return values.join(", ");
}

function split(value: string) {
  return value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function readColorEvidence(metadata: Record<string, unknown> | undefined): ColorEvidenceView[] {
  const raw = metadata?.colorEvidence;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (
      typeof value.color !== "string" ||
      !/^#[0-9A-Fa-f]{6}$/.test(value.color) ||
      typeof value.source !== "string" ||
      !["high", "medium", "low"].includes(String(value.confidence)) ||
      typeof value.score !== "number"
    ) {
      return [];
    }
    return [{
      color: value.color.toUpperCase(),
      source: value.source,
      confidence: value.confidence as ColorEvidenceView["confidence"],
      score: value.score,
    }];
  });
}

function colorSourceLabel(source: string): string {
  return source
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ListField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} onChange={event => onChange(event.target.value)} className="min-h-24 rounded-xl" />
      <p className="text-xs leading-5 text-muted-foreground">{hint ?? "Separate items with commas or new lines."}</p>
    </div>
  );
}

export default function BrandProfile() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const businesses = trpc.businesses.list.useQuery();
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem("localpost-active-business") ?? "");
  const selectedBusinessInput = useMemo(() => ({ businessId: selectedId }), [selectedId]);
  const selectedBusiness = trpc.businesses.get.useQuery(selectedBusinessInput, {
    enabled: Boolean(selectedId),
  });
  const [form, setForm] = useState<BrandForm>(emptyForm);

  useEffect(() => {
    if (!selectedId && businesses.data?.[0]) {
      setSelectedId(businesses.data[0].business.id);
      localStorage.setItem("localpost-active-business", businesses.data[0].business.id);
    }
  }, [businesses.data, selectedId]);

  const record = businesses.data?.find(item => item.business.id === selectedId);
  const profile = record?.brandProfile;

  useEffect(() => {
    if (!profile) return;
    setForm({
      brandSummary: profile.brandSummary,
      brandVoice: profile.brandVoice,
      toneKeywords: join(profile.toneKeywords),
      brandColors: join(profile.brandColors),
      messagingThemes: join(profile.messagingThemes),
      audienceInsights: profile.audienceInsights,
      audienceSegments: join(profile.audienceSegments),
      services: join(profile.services),
      keywords: join(profile.keywords),
      keyDifferentiators: join(profile.keyDifferentiators),
      visualStyle: profile.visualStyle,
      imageGuidance: profile.imageGuidance,
      contentPillars: join(profile.contentPillars),
      avoidTopics: join(profile.avoidTopics),
    });
  }, [profile]);

  const colors = useMemo(() => split(form.brandColors).filter(color => /^#[0-9A-Fa-f]{6}$/.test(color)), [form.brandColors]);
  const colorEvidence = useMemo(
    () => readColorEvidence(selectedBusiness.data?.latestAnalysis?.sourceMetadata),
    [selectedBusiness.data?.latestAnalysis?.sourceMetadata]
  );
  const evidenceByColor = useMemo(
    () => new Map(colorEvidence.map(item => [item.color, item])),
    [colorEvidence]
  );

  const save = trpc.brand.update.useMutation({
    onSuccess: async () => {
      await utils.businesses.list.invalidate();
      toast.success("Brand profile saved", { description: "Future posts will use this edited source of truth." });
    },
    onError: error => toast.error("Profile could not be saved", { description: error.message }),
  });

  const reanalyze = trpc.businesses.reanalyze.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.businesses.list.invalidate(),
        utils.businesses.get.invalidate({ businessId: selectedId }),
      ]);
      toast.success("Brand analysis refreshed");
    },
    onError: error => toast.error("Re-analysis failed", { description: error.message }),
  });

  function update<K extends keyof BrandForm>(key: K, value: BrandForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function saveProfile() {
    if (!record || !profile) return;
    const brandColors = split(form.brandColors).filter(color => /^#[0-9A-Fa-f]{6}$/.test(color));
    if (!brandColors.length) {
      toast.error("Add at least one valid six-digit hex color", { description: "Example: #176B5B" });
      return;
    }
    save.mutate({
      businessId: record.business.id,
      brandSummary: form.brandSummary,
      brandVoice: form.brandVoice,
      toneKeywords: split(form.toneKeywords),
      brandColors,
      messagingThemes: split(form.messagingThemes),
      audienceInsights: form.audienceInsights,
      audienceSegments: split(form.audienceSegments),
      services: split(form.services),
      keywords: split(form.keywords),
      keyDifferentiators: split(form.keyDifferentiators),
      visualStyle: form.visualStyle,
      imageGuidance: form.imageGuidance,
      contentPillars: split(form.contentPillars),
      avoidTopics: split(form.avoidTopics),
      isConfirmed: true,
    });
  }

  if (businesses.isLoading) {
    return <div className="space-y-5"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-[34rem] rounded-2xl" /></div>;
  }

  if (businesses.error) {
    return (
      <EmptyState
        title="The brand workspace could not load"
        description={`${businesses.error.message} Your saved data is unchanged.`}
        actionLabel="Try again"
        onAction={() => void businesses.refetch()}
      />
    );
  }

  if (!businesses.data?.length) {
    return (
      <EmptyState
        title="Your brand profile starts with a website"
        description="Add a business and LocalPost AI will prepare an editable voice, audience, palette, and content foundation."
        actionLabel="Analyze a business"
        onAction={() => setLocation("/onboarding")}
      />
    );
  }

  if (!record || !profile) {
    return (
      <EmptyState
        title="Brand analysis is not ready"
        description="Choose another business or run the onboarding analysis again."
        actionLabel="Add a business"
        onAction={() => setLocation("/onboarding")}
      />
    );
  }

  return (
    <div className="page-enter mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Brand source of truth"
        title="Make the AI sound like you."
        description="Review what the website analysis found. Every future caption and image prompt is grounded in this editable profile."
        actions={
          <>
            <Button variant="outline" onClick={() => reanalyze.mutate({ businessId: record.business.id })} disabled={reanalyze.isPending} className="rounded-xl bg-card">
              {reanalyze.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-analyze site
            </Button>
            <Button onClick={saveProfile} disabled={save.isPending} className="rounded-xl">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Globe2 className="h-4 w-4" /></div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{record.business.name}</p>
            <a href={record.business.websiteUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted-foreground hover:text-primary">{record.business.websiteUrl}</a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={profile.isConfirmed ? "approved" : record.business.status} />
          <select
            aria-label="Select business"
            value={selectedId}
            onChange={event => {
              setSelectedId(event.target.value);
              localStorage.setItem("localpost-active-business", event.target.value);
            }}
            className="h-10 max-w-56 rounded-xl border bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
          >
            {businesses.data.map(item => <option key={item.business.id} value={item.business.id}>{item.business.name}</option>)}
          </select>
        </div>
      </div>

      {(save.error || reanalyze.error) && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/8 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-bold text-destructive">The latest brand update was not applied</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{(save.error || reanalyze.error)?.message} Your current edits remain available so you can adjust them or retry.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-6">
          <Card className="surface-card border-0">
            <CardHeader><CardTitle className="text-3xl">Voice & positioning</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="summary">Brand summary</Label>
                <Textarea id="summary" value={form.brandSummary} onChange={event => update("brandSummary", event.target.value)} className="min-h-32 rounded-xl" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="voice">Brand voice</Label>
                <Textarea id="voice" value={form.brandVoice} onChange={event => update("brandVoice", event.target.value)} className="min-h-28 rounded-xl" />
              </div>
              <ListField id="tone-keywords" label="Tone keywords" value={form.toneKeywords} onChange={value => update("toneKeywords", value)} />
              <ListField id="messaging-themes" label="Messaging themes" value={form.messagingThemes} onChange={value => update("messagingThemes", value)} />
            </CardContent>
          </Card>

          <Card className="surface-card border-0">
            <CardHeader><CardTitle className="text-3xl">Audience & offer</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="audience">Audience insights</Label>
                <Textarea id="audience" value={form.audienceInsights} onChange={event => update("audienceInsights", event.target.value)} className="min-h-28 rounded-xl" />
              </div>
              <ListField id="segments" label="Audience segments" value={form.audienceSegments} onChange={value => update("audienceSegments", value)} />
              <ListField id="services" label="Services or offers" value={form.services} onChange={value => update("services", value)} />
              <ListField id="differentiators" label="Key differentiators" value={form.keyDifferentiators} onChange={value => update("keyDifferentiators", value)} />
              <ListField id="keywords" label="Keywords" value={form.keywords} onChange={value => update("keywords", value)} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="surface-card border-0 overflow-hidden">
            <div className="hairline-grid bg-secondary/45 p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Palette className="h-5 w-5" /></div>
                <span className="text-xs font-bold text-muted-foreground">AI confidence {profile.confidenceScore}%</span>
              </div>
              <h2 className="mt-7 text-3xl">Visual direction</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">These cues shape every photorealistic prompt.</p>
            </div>
            <CardContent className="space-y-6 p-6">
              <div className="grid gap-2">
                <Label htmlFor="colors">Brand colors</Label>
                <Input id="colors" value={form.brandColors} onChange={event => update("brandColors", event.target.value)} className="h-11 rounded-xl font-mono text-xs" />
                <p className="text-xs leading-5 text-muted-foreground">
                  Website colors include their extraction source and confidence. Unlabeled values may be AI suggestions or your own edits.
                </p>
                <div className="grid gap-2 pt-1 sm:grid-cols-2">
                  {colors.map(rawColor => {
                    const color = rawColor.toUpperCase();
                    const evidence = evidenceByColor.get(color);
                    return (
                      <div key={color} className="flex items-center gap-3 rounded-xl border bg-background/70 p-2.5">
                        <div
                          className="h-10 w-10 shrink-0 rounded-lg border shadow-sm"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold">{color}</p>
                          {evidence ? (
                            <div className="mt-0.5 text-[11px] leading-4">
                              <p className="font-semibold capitalize text-primary">
                                {evidence.confidence} confidence
                              </p>
                              <p
                                className="truncate text-muted-foreground"
                                title={`Website · ${colorSourceLabel(evidence.source)}`}
                              >
                                Website · {colorSourceLabel(evidence.source)}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">Suggested or edited</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="visual-style">Visual style</Label>
                <Textarea id="visual-style" value={form.visualStyle} onChange={event => update("visualStyle", event.target.value)} className="min-h-28 rounded-xl" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="image-guidance">Image guidance</Label>
                <Textarea id="image-guidance" value={form.imageGuidance} onChange={event => update("imageGuidance", event.target.value)} className="min-h-32 rounded-xl" />
              </div>
            </CardContent>
          </Card>

          <Card className="surface-card border-0">
            <CardHeader><CardTitle className="text-3xl">Content guardrails</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <ListField id="pillars" label="Content pillars" value={form.contentPillars} onChange={value => update("contentPillars", value)} />
              <ListField id="avoid" label="Topics to avoid" value={form.avoidTopics} onChange={value => update("avoidTopics", value)} hint="Add sensitive, off-brand, or irrelevant themes." />
            </CardContent>
          </Card>

          <div className="surface-card bg-sidebar p-6 text-sidebar-foreground">
            <div className="flex items-center gap-2 text-sidebar-primary"><Check className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.14em]">Your review matters</span></div>
            <h3 className="mt-4 text-3xl">Ready to shape a month?</h3>
            <p className="mt-2 text-sm leading-6 text-sidebar-foreground/65">Save this profile first, then create 12–16 varied posts for your next calendar.</p>
            <Button onClick={() => setLocation("/calendar")} className="mt-5 w-full rounded-xl bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
              <Sparkles className="h-4 w-4" /> Open content calendar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
