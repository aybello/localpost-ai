import { PostImage, StatusBadge } from "@/components/localpost/WorkspaceUI";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ArrowLeft, CalendarClock, Check, ImageIcon, Loader2, RefreshCw, Save, Sparkles, Trash2, Undo2, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

type EditorForm = {
  title: string;
  caption: string;
  hashtags: string;
  callToAction: string;
  tone: string;
  imageAltText: string;
  scheduledAt: string;
};

const emptyForm: EditorForm = { title: "", caption: "", hashtags: "", callToAction: "", tone: "", imageAltText: "", scheduledAt: "" };

function toLocalInput(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function splitHashtags(value: string) {
  return value
    .split(/[\s,]+/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .map(tag => (tag.startsWith("#") ? tag : `#${tag}`))
    .slice(0, 12);
}

function readableError(message: string, fallback: string) {
  const normalized = message.trim();
  return normalized.startsWith("[") || normalized.length > 240 ? fallback : normalized;
}

export default function PostEditor() {
  const [, params] = useRoute("/posts/:postId");
  const postId = params?.postId ?? "";
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const query = trpc.posts.get.useQuery(
    { postId },
    { enabled: Boolean(postId), retry: false }
  );
  const [form, setForm] = useState<EditorForm>(emptyForm);
  const [toneInstruction, setToneInstruction] = useState("");
  const [imageGuidance, setImageGuidance] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const record = query.data;
  useEffect(() => {
    if (!record) return;
    setForm({
      title: record.post.title,
      caption: record.post.caption,
      hashtags: record.post.hashtags.join(" "),
      callToAction: record.post.callToAction,
      tone: record.post.tone,
      imageAltText: record.post.imageAltText,
      scheduledAt: toLocalInput(record.post.scheduledAt),
    });
  }, [record]);

  async function refresh() {
    await Promise.all([query.refetch(), utils.posts.list.invalidate(), utils.dashboard.summary.invalidate()]);
  }

  const update = trpc.posts.update.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Post saved"); },
    onError: error => toast.error("Post could not be saved", { description: error.message }),
  });
  const regenerateCopy = trpc.posts.regenerateCopy.useMutation({
    onSuccess: async () => { await refresh(); setToneInstruction(""); toast.success("Copy updated", { description: "The topic, image, date, and status were preserved." }); },
    onError: error => toast.error("Copy could not be regenerated", { description: error.message }),
  });
  const generateImage = trpc.posts.generateImage.useMutation({
    onSuccess: async () => { await refresh(); setImageGuidance(""); toast.success("New visual created"); },
    onError: error => toast.error("Visual could not be generated", { description: error.message }),
  });
  const setStatus = trpc.posts.setStatus.useMutation({
    onSuccess: async result => { await refresh(); setRejectionReason(""); toast.success(`Post marked ${result?.post.status}`); },
    onError: error => toast.error("Status could not be changed", { description: error.message }),
  });
  const remove = trpc.posts.delete.useMutation({
    onSuccess: async () => { await utils.posts.list.invalidate(); toast.success("Post deleted"); setLocation("/calendar"); },
    onError: error => toast.error("Post could not be deleted", { description: error.message }),
  });

  function updateField<K extends keyof EditorForm>(key: K, value: EditorForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function currentFields() {
    return {
      title: form.title,
      caption: form.caption,
      hashtags: splitHashtags(form.hashtags),
      callToAction: form.callToAction,
      tone: form.tone,
      imageAltText: form.imageAltText,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt) : null,
    };
  }

  function save() {
    update.mutate({ postId, ...currentFields() });
  }

  function changeStatus(status: "draft" | "approved" | "scheduled" | "rejected", reason?: string) {
    setStatus.mutate({
      postId,
      status,
      ...currentFields(),
      rejectionReason: status === "rejected" ? reason : undefined,
    });
  }

  if (!record && (query.isPending || query.isFetching)) {
    return <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"><Skeleton className="h-[42rem] rounded-2xl" /><Skeleton className="h-[42rem] rounded-2xl" /></div>;
  }

  const queryIsNotFound = query.error?.data?.code === "NOT_FOUND";

  if (query.error && !queryIsNotFound) {
    return (
      <div className="surface-card mx-auto max-w-xl p-8 text-center sm:p-10">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertCircle className="h-5 w-5" /></div>
        <h1 className="mt-5 text-4xl">We couldn’t load this post</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{readableError(query.error.message, "This post link is invalid or the request could not be completed.")} Your calendar and saved content are unchanged.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => query.refetch()} className="rounded-xl"><RefreshCw className="h-4 w-4" /> Try again</Button>
          <Button variant="outline" onClick={() => setLocation("/calendar")} className="rounded-xl bg-card">Back to calendar</Button>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="surface-card mx-auto max-w-xl p-10 text-center">
        <h1 className="text-4xl">Post not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">It may have been removed or belong to another account.</p>
        <Button onClick={() => setLocation("/calendar")} className="mt-6 rounded-xl">Back to calendar</Button>
      </div>
    );
  }

  const { post, business, brandProfile } = record;
  const busy = update.isPending || regenerateCopy.isPending || generateImage.isPending || setStatus.isPending || remove.isPending;
  const mutationError = update.error ?? regenerateCopy.error ?? generateImage.error ?? setStatus.error ?? remove.error;

  function clearMutationErrors() {
    update.reset();
    regenerateCopy.reset();
    generateImage.reset();
    setStatus.reset();
    remove.reset();
  }

  return (
    <div className="page-enter mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <button onClick={() => setLocation("/calendar")} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to calendar</button>
          <div className="flex flex-wrap items-center gap-3"><p className="eyebrow">{business.name}</p><StatusBadge status={post.status} /><StatusBadge status={post.imageStatus} /></div>
          <h1 className="mt-3 max-w-3xl text-4xl leading-[1.02] tracking-[-0.03em] sm:text-5xl">Refine every detail before it leaves draft.</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {post.status !== "approved" && <Button onClick={() => changeStatus("approved")} disabled={busy} className="rounded-xl"><Check className="h-4 w-4" /> Approve</Button>}
          {post.status !== "draft" && <Button variant="outline" onClick={() => changeStatus("draft")} disabled={busy} className="rounded-xl bg-card"><Undo2 className="h-4 w-4" /> Return to draft</Button>}
          <Button onClick={save} disabled={busy} className="rounded-xl">{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</Button>
        </div>
      </div>

      {mutationError && (
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div><p className="text-sm font-bold text-destructive">That action didn’t finish</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{readableError(mutationError.message, "The request could not be completed.")} Your current edits are still here, so you can adjust them and try again.</p></div>
          </div>
          <Button variant="outline" onClick={clearMutationErrors} className="shrink-0 rounded-xl bg-card">Dismiss</Button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-6">
          <Card className="surface-card sticky top-8 overflow-hidden border-0">
            <div className="relative overflow-hidden bg-secondary/35">
              <PostImage src={post.imageUrl} alt={form.imageAltText || post.imageAltText} className="aspect-[4/3]" />
              {generateImage.isPending && (
                <div className="absolute inset-0 grid place-items-center bg-sidebar/80 text-sidebar-foreground backdrop-blur-sm">
                  <div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-sidebar-primary" /><p className="mt-3 text-sm font-bold">Creating a new photorealistic visual</p></div>
                </div>
              )}
            </div>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div>
                <p className="eyebrow">Image direction</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{post.imagePrompt}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="image-guidance">Regeneration guidance</Label>
                <Textarea id="image-guidance" value={imageGuidance} onChange={event => setImageGuidance(event.target.value)} placeholder="Use a wider angle, softer morning light, and fewer objects…" className="min-h-24 rounded-xl" />
              </div>
              <Button variant="outline" disabled={busy} onClick={() => generateImage.mutate({ postId, editorGuidance: imageGuidance || undefined })} className="w-full rounded-xl bg-card">
                {generateImage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} {post.imageUrl ? "Regenerate image" : "Generate image"}
              </Button>
              {post.imageError && <p className="rounded-xl bg-destructive/10 p-3 text-xs leading-5 text-destructive">{post.imageError}</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="surface-card border-0">
            <CardHeader><CardTitle className="text-3xl">Post copy</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2"><Label htmlFor="title">Internal title</Label><Input id="title" value={form.title} onChange={event => updateField("title", event.target.value)} className="h-11 rounded-xl" /></div>
              <div className="grid gap-2"><div className="flex justify-between gap-3"><Label htmlFor="caption">Caption</Label><span className="text-xs text-muted-foreground">{form.caption.length}/1,200</span></div><Textarea id="caption" value={form.caption} onChange={event => updateField("caption", event.target.value)} className="min-h-56 rounded-xl text-sm leading-7" /></div>
              <div className="grid gap-2"><Label htmlFor="hashtags">Hashtags</Label><Textarea id="hashtags" value={form.hashtags} onChange={event => updateField("hashtags", event.target.value)} className="min-h-20 rounded-xl" /></div>
              <div className="grid gap-2"><Label htmlFor="cta">Call to action</Label><Input id="cta" value={form.callToAction} onChange={event => updateField("callToAction", event.target.value)} className="h-11 rounded-xl" /></div>
              <div className="grid gap-2"><Label htmlFor="tone">Tone</Label><Input id="tone" value={form.tone} onChange={event => updateField("tone", event.target.value)} className="h-11 rounded-xl" /></div>
              <div className="grid gap-2"><Label htmlFor="alt">Image alt text</Label><Textarea id="alt" value={form.imageAltText} onChange={event => updateField("imageAltText", event.target.value)} className="min-h-20 rounded-xl" /></div>
            </CardContent>
          </Card>

          <Card className="surface-card border-0 bg-secondary/35">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></div><div><h2 className="text-2xl">Adjust with AI</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Describe the tone shift. Only the caption, hashtags, call-to-action, and tone are rewritten.</p></div></div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Input value={toneInstruction} onChange={event => setToneInstruction(event.target.value)} placeholder="More concise and neighborly" className="h-11 rounded-xl bg-card" /><Button disabled={busy || toneInstruction.trim().length < 2} onClick={() => regenerateCopy.mutate({ postId, toneInstruction })} className="h-11 rounded-xl">{regenerateCopy.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Rewrite</Button></div>
            </CardContent>
          </Card>

          <Card className="surface-card border-0">
            <CardHeader><CardTitle className="text-3xl">Schedule & status</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2"><Label htmlFor="scheduled-at">Planned publish time</Label><Input id="scheduled-at" type="datetime-local" value={form.scheduledAt} onChange={event => updateField("scheduledAt", event.target.value)} className="h-11 rounded-xl" /></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy || !form.scheduledAt} onClick={() => changeStatus("scheduled")} className="rounded-xl bg-card"><CalendarClock className="h-4 w-4" /> Mark scheduled</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="outline" disabled={busy} className="rounded-xl bg-card text-destructive hover:text-destructive"><X className="h-4 w-4" /> Reject</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Reject this post?</AlertDialogTitle><AlertDialogDescription>Add a reason so the next revision has clear direction.</AlertDialogDescription></AlertDialogHeader>
                    <Textarea value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} placeholder="Too promotional; lead with a useful customer tip…" className="min-h-24 rounded-xl" />
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={rejectionReason.trim().length < 2} onClick={() => changeStatus("rejected", rejectionReason.trim())}>Reject post</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/15 bg-destructive/5 shadow-none">
            <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><p className="text-sm font-bold">Delete this post</p><p className="mt-1 text-xs text-muted-foreground">This permanently removes the copy and stored image reference.</p></div><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="rounded-xl border-destructive/25 bg-card text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> Delete</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{post.title}”?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep post</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate({ postId })}>Delete permanently</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardContent>
          </Card>

          {brandProfile && <p className="px-1 text-xs leading-5 text-muted-foreground">Grounded in <span className="font-bold text-foreground">{brandProfile.toneKeywords.slice(0, 3).join(", ")}</span> brand guidance for {business.name}.</p>}
        </div>
      </div>
    </div>
  );
}
