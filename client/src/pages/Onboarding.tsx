import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Globe2,
  Loader2,
  MapPin,
  MessageCircle,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const steps = [
  { label: "Business", icon: Building2 },
  { label: "Brand cues", icon: MessageCircle },
  { label: "Review", icon: ScanSearch },
];

const industries = [
  "Home services",
  "Health & wellness",
  "Professional services",
  "Food & hospitality",
  "Retail",
  "Beauty & personal care",
  "Real estate",
  "Automotive",
  "Education",
  "Other",
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    websiteUrl: "",
    industry: "",
    city: "",
    state: "",
    country: "United States",
    tonePreference: "Warm, credible, and clear",
    differentiators: "",
  });

  const differentiators = useMemo(
    () =>
      form.differentiators
        .split(/[\n,]/)
        .map(value => value.trim())
        .filter(Boolean)
        .slice(0, 10),
    [form.differentiators]
  );

  const onboard = trpc.businesses.onboard.useMutation({
    onSuccess: result => {
      localStorage.setItem("localpost-active-business", result.businessId);
      toast.success("Brand profile created", {
        description: "Review the analysis before generating your first content month.",
      });
      setLocation("/brand");
    },
    onError: error => toast.error("Analysis could not be completed", { description: error.message }),
  });

  const canContinue =
    step === 0
      ? form.name.trim().length >= 2 &&
        form.websiteUrl.trim().length >= 4 &&
        form.industry.trim().length >= 2
      : true;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function submit() {
    onboard.mutate({
      name: form.name,
      websiteUrl: form.websiteUrl,
      industry: form.industry,
      tonePreference: form.tonePreference || null,
      keyDifferentiators: differentiators,
      city: form.city || null,
      state: form.state || null,
      country: form.country,
    });
  }

  if (onboard.isPending) {
    return (
      <div className="page-enter mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <Card className="surface-card w-full overflow-hidden border-0">
          <CardContent className="p-8 sm:p-12">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-secondary text-primary">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <p className="eyebrow mt-8 text-center">Building your brand profile</p>
            <h1 className="mt-3 text-center text-4xl leading-tight sm:text-5xl">Reading the signals that make you distinct.</h1>
            <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-6 text-muted-foreground">
              We’re safely reading public website content, identifying your voice and visual cues, then validating a structured brand profile.
            </p>
            <div className="mx-auto mt-9 max-w-lg space-y-4">
              {[
                [Globe2, "Website evidence", "Extracting visible copy, metadata, and color signals"],
                [ScanSearch, "Brand analysis", "Mapping voice, audience, themes, services, and differentiators"],
                [Sparkles, "Content foundation", "Preparing image and post guidance for your review"],
              ].map(([Icon, title, detail], index) => (
                <div key={String(title)} className="flex items-start gap-4 rounded-xl border bg-card/75 p-4">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className={`h-4 w-4 ${index === 0 ? "animate-pulse" : ""}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{String(title)}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(detail)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-enter mx-auto max-w-5xl">
      <button
        onClick={() => setLocation("/")}
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to overview
      </button>

      <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="surface-card h-fit overflow-hidden border-0 bg-sidebar p-6 text-sidebar-foreground lg:sticky lg:top-8 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">Guided setup</p>
          <h1 className="mt-4 text-4xl leading-[1.02]">Turn your website into a content-ready brand.</h1>
          <p className="mt-4 text-sm leading-6 text-sidebar-foreground/65">
            Add the essentials. LocalPost AI will extract the deeper signals and give you full editing control before anything is generated.
          </p>

          <div className="mt-9 space-y-2">
            {steps.map((item, index) => {
              const complete = index < step;
              const active = index === step;
              return (
                <div
                  key={item.label}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 ${active ? "bg-sidebar-accent" : ""}`}
                >
                  <div
                    className={`grid h-9 w-9 place-items-center rounded-lg border ${
                      complete || active
                        ? "border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground"
                        : "border-sidebar-border text-sidebar-foreground/45"
                    }`}
                  >
                    {complete ? <Check className="h-4 w-4" /> : <item.icon className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                      Step {index + 1}
                    </p>
                    <p className="text-sm font-bold">{item.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <Card className="surface-card border-0">
          <CardContent className="p-6 sm:p-9">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Step {step + 1} of 3</p>
                <h2 className="mt-2 text-3xl sm:text-4xl">
                  {step === 0 ? "Tell us about the business" : step === 1 ? "Add the human context" : "Ready for analysis"}
                </h2>
              </div>
              <span className="text-xs font-bold text-muted-foreground">{Math.round(((step + 1) / 3) * 100)}%</span>
            </div>
            <Progress value={((step + 1) / 3) * 100} className="mt-5 h-1.5" />

            {step === 0 && (
              <div className="mt-8 space-y-6">
                <div className="grid gap-2">
                  <Label htmlFor="business-name">Business name</Label>
                  <Input id="business-name" value={form.name} onChange={event => update("name", event.target.value)} placeholder="Harbor & Pine Dental" className="h-11 rounded-xl" autoFocus />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="website">Website URL</Label>
                  <div className="relative">
                    <Globe2 className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input id="website" value={form.websiteUrl} onChange={event => update("websiteUrl", event.target.value)} placeholder="https://yourbusiness.com" className="h-11 rounded-xl pl-10" />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">Only public website content is read. Local or private network addresses are blocked.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input id="industry" value={form.industry} onChange={event => update("industry", event.target.value)} placeholder="Start typing or choose a suggestion" list="industry-options" className="h-11 rounded-xl" />
                  <datalist id="industry-options">
                    {industries.map(industry => <option value={industry} key={industry} />)}
                  </datalist>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2 sm:col-span-1">
                    <Label htmlFor="city">City</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input id="city" value={form.city} onChange={event => update("city", event.target.value)} placeholder="Austin" className="h-11 rounded-xl pl-10" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="state">State / region</Label>
                    <Input id="state" value={form.state} onChange={event => update("state", event.target.value)} placeholder="Texas" className="h-11 rounded-xl" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="country">Country</Label>
                    <Input id="country" value={form.country} onChange={event => update("country", event.target.value)} className="h-11 rounded-xl" />
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="mt-8 space-y-6">
                <div className="grid gap-2">
                  <Label htmlFor="tone">Preferred tone</Label>
                  <Input id="tone" value={form.tonePreference} onChange={event => update("tonePreference", event.target.value)} placeholder="Warm, credible, and clear" className="h-11 rounded-xl" autoFocus />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {["Warm & credible", "Bright & conversational", "Expert & reassuring", "Bold & energetic"].map(tone => (
                      <button key={tone} type="button" onClick={() => update("tonePreference", tone)} className="rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/35 hover:text-primary">
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="differentiators">Key differentiators</Label>
                  <Textarea id="differentiators" value={form.differentiators} onChange={event => update("differentiators", event.target.value)} placeholder={"Locally owned for two generations\nSame-day appointments\nEco-conscious materials"} className="min-h-36 rounded-xl" />
                  <p className="text-xs leading-5 text-muted-foreground">Add up to 10 items, separated by commas or new lines. Leave blank if the website explains them well.</p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="mt-8 space-y-4">
                {[
                  [Building2, "Business", form.name, form.industry],
                  [Globe2, "Website", form.websiteUrl, [form.city, form.state, form.country].filter(Boolean).join(", ")],
                  [MessageCircle, "Brand direction", form.tonePreference || "Let AI infer the tone", differentiators.length ? `${differentiators.length} differentiator${differentiators.length === 1 ? "" : "s"} supplied` : "Use website evidence"],
                ].map(([Icon, label, value, detail]) => (
                  <div key={String(label)} className="flex items-start gap-4 rounded-xl border bg-muted/25 p-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{String(label)}</p>
                      <p className="mt-1 truncate text-sm font-bold">{String(value)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{String(detail)}</p>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-primary/15 bg-secondary/55 p-4 text-sm leading-6 text-secondary-foreground">
                  <span className="font-bold">Next:</span> AI will analyze the public site and prepare an editable profile. Nothing is published automatically.
                </div>
              </div>
            )}

            {onboard.error && (
              <div role="alert" className="mt-7 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/8 p-4 text-left">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-bold text-destructive">Analysis needs another try</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{onboard.error.message} Your entries are still here; review the website URL or details and submit again.</p>
                </div>
              </div>
            )}

            <div className="mt-9 flex items-center justify-between border-t pt-6">
              <Button variant="ghost" onClick={() => step === 0 ? setLocation("/") : setStep(current => current - 1)} className="rounded-xl">
                <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
              </Button>
              {step < 2 ? (
                <Button disabled={!canContinue} onClick={() => setStep(current => current + 1)} className="rounded-xl">
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={submit} className="rounded-xl">
                  <Sparkles className="h-4 w-4" /> Analyze my brand
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
