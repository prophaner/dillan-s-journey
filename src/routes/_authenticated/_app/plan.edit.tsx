import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, CircleAlert, Link2, Plus, Trash2, Unlink } from "lucide-react";
import { pageHead } from "@/lib/head";
import { localPhrase } from "@/lib/device";
import { deleteDraft, loadDraft, saveDraft } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import { loadRoutine, planDraftKey } from "@/lib/workout-store";
import { DEFAULT_TRANSITION_SECONDS, type PlanSnapshot, type Prescription } from "@/lib/workout";
import { estimateMinutes } from "@/lib/time-plan";
import {
  PRIORITY_LABEL, ROUTINE_SAVE, diffPlans, groupWithNext, move, newBlock, problems, toBlocks, toEdit, ungroup,
  type BlockPriority, type EditBlock, type RoutineSavePayload,
} from "@/lib/plan";
import { Banner, Card, ScreenState, SectionLabel } from "@/components/dillan/surfaces";
import { useToast } from "@/components/dillan/overlays";
import { DButton } from "@/components/dillan/button";
import { Chip, DemoLabel, StatusTag } from "@/components/dillan/tags";
import { BlockDot } from "@/components/dillan/plan-pieces";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/plan/edit")({
  head: () => pageHead("Edit routine", "Change sets, reps, load, rest and grouping, then save it as a new version."),
  component: Editor,
});

interface PlanDraft { baseVersionId: string; blocks: EditBlock[]; reason: string }

function Editor() {
  const { user } = Route.useRouteContext();
  const routine = useQuery({ queryKey: ["routine", user.id], queryFn: () => loadRoutine(user.id) });
  if (routine.isPending) return <div className="mt-10 h-64 animate-pulse rounded-card bg-surface-2" aria-busy="true" aria-label="Loading" />;
  if (routine.isError) return <Card className="mt-10"><ScreenState kind={navigator.onLine ? "failed" : "offline"} title="Couldn't load your routine" body="Check your connection and try again." action={{ label: "Try again", onClick: () => void routine.refetch() }} /></Card>;
  if (!routine.data) return <Card className="mt-10"><ScreenState kind="empty" title="No routine to edit" body="Add one in onboarding first." /></Card>;
  return <EditorBody uid={user.id} base={routine.data} />;
}

function EditorBody({ uid, base }: { uid: string; base: PlanSnapshot }) {
  const outbox = useOutbox(uid);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [blocks, setBlocks] = useState<EditBlock[]>(() => toEdit(base));
  const [reason, setReason] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const busy = useRef(false);
  const unit = base.blocks[0]?.prescriptions[0]?.unit ?? "lb";
  const nextNo = base.versionNo + 1;

  // Draft survives reloads and offline; it belongs to the version it was started from.
  useEffect(() => {
    void loadDraft<PlanDraft>(planDraftKey(uid)).then((d) => {
      if (d && d.baseVersionId === base.templateVersionId) { setBlocks(d.blocks); setReason(d.reason); }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [uid, base.templateVersionId]);

  const baseBlocks = base.blocks;
  const next = useMemo(() => toBlocks(blocks), [blocks]);
  const changes = useMemo(() => diffPlans(baseBlocks, next), [baseBlocks, next]);
  const errs = problems(blocks);
  const est = useMemo(() => {
    const s = { ...base, blocks: next };
    return { full: estimateMinutes(s, "full"), short: estimateMinutes(s, "short"), priority: estimateMinutes(s, "priority") };
  }, [base, next]);

  const update = (fn: (b: EditBlock[]) => EditBlock[]) => {
    setBlocks((prev) => {
      const out = fn(prev);
      saveDraft(planDraftKey(uid), { baseVersionId: base.templateVersionId, blocks: out, reason } satisfies PlanDraft)
        .then(() => setStorageFailed(false)).catch(() => setStorageFailed(true));
      return out;
    });
  };
  const setBlock = (i: number, patch: Partial<EditBlock>) => update((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const setPres = (i: number, pi: number, patch: Partial<Prescription>) =>
    update((bs) => bs.map((b, j) => (j === i ? { ...b, prescriptions: b.prescriptions.map((p, q) => (q === pi ? { ...p, ...patch } : p)) } : b)));
  const setPriority = (i: number, pr: BlockPriority) =>
    update((bs) => bs.map((b, j) => (j === i ? { ...b, priority: pr } : pr === "priority" && b.priority === "priority" ? { ...b, priority: "main" } : b)));

  const save = useCallback(async () => {
    if (busy.current || errs.length || !changes.length) return;
    busy.current = true;
    setSaving(true);
    try {
      const payload: RoutineSavePayload = {
        id: crypto.randomUUID(), routineId: base.routineId, baseVersionId: base.templateVersionId, baseVersionNo: base.versionNo,
        title: base.title, purpose: base.purpose ?? null, isDemo: base.isDemo, reason: reason.trim() || null, blocks: next,
      };
      await outbox.add(ROUTINE_SAVE, payload);
      await deleteDraft(planDraftKey(uid)).catch(() => undefined);
      await qc.invalidateQueries({ queryKey: ["routine", uid] });
      toast({ text: `Saved as v${nextNo} · ${localPhrase()}` });
      void navigate({ to: "/plan" });
    } catch {
      setStorageFailed(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [errs.length, changes.length, base, reason, next, outbox, uid, qc, nextNo, navigate]);

  const discard = async () => {
    await deleteDraft(planDraftKey(uid)).catch(() => undefined);
    setBlocks(toEdit(base));
    setReason("");
    void navigate({ to: "/plan" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const addExercise = () => {
    if (!newName.trim()) return;
    update((bs) => [...bs, newBlock(newName, unit)]);
    setNewName("");
  };

  if (!loaded) return <div className="mt-10 h-64 animate-pulse rounded-card bg-surface-2" aria-busy="true" aria-label="Loading" />;

  return (
    <div className="pb-10">
      <header className="pt-6 lg:pt-10">
        <Link to="/plan" className="inline-flex min-h-11 items-center gap-1 text-subhead font-medium text-text-2"><ChevronLeft className="size-4" aria-hidden />Plan</Link>
        <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-title1 font-bold leading-tight">Editing {base.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusTag kind="waiting">Draft of v{nextNo}</StatusTag>
              {base.isDemo && <DemoLabel />}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:w-auto">
            <DButton variant="primary" size="md" className="w-full sm:w-auto" disabled={saving || !!errs.length || !changes.length} onClick={() => void save()}>Save as v{nextNo}</DButton>
            <DButton variant="quiet" size="md" className="w-full sm:w-auto" onClick={() => void discard()}>Discard draft</DButton>
          </div>
        </div>
      </header>

      <Banner className="mt-4">Saving creates version {nextNo}. Sessions you've already done keep version {base.versionNo} exactly as it was.</Banner>
      {storageFailed && (
        <Banner className="mt-3" icon={<CircleAlert className="size-5 shrink-0 text-text" aria-hidden />}>
          This browser isn't keeping data between visits (private mode or storage full). Your edits stay while this tab is open.
        </Banner>
      )}

      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="flex flex-col gap-3">
          {blocks.length === 0 && <Card><ScreenState kind="empty" title="No exercises" body="Add one below to save a version." /></Card>}
          {blocks.map((b, i) => (
            <BlockCard key={b.key} b={b} i={i} last={i === blocks.length - 1}
              onMove={(d) => update((bs) => move(bs, i, d))}
              onGroup={() => update((bs) => groupWithNext(bs, i))}
              onUngroup={() => update((bs) => ungroup(bs, i))}
              onRemove={() => update((bs) => bs.filter((_, j) => j !== i))}
              onRemoveExercise={(pi) => update((bs) => bs.map((x, j) => (j === i ? { ...x, prescriptions: x.prescriptions.filter((_, q) => q !== pi) } : x)).filter((x) => x.prescriptions.length))}
              setBlock={(p) => setBlock(i, p)} setPres={(pi, p) => setPres(i, pi, p)} setPriority={(p) => setPriority(i, p)} />
          ))}
          <Card>
            <label htmlFor="new-ex" className="text-subhead font-bold">Add an exercise</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input id="new-ex" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="e.g. Romanian deadlift"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExercise(); } }}
                className="h-12 min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 text-[16px]" />
              <DButton variant="outline" size="md" icon={<Plus className="size-4" aria-hidden />} disabled={!newName.trim()} onClick={addExercise}>Add</DButton>
            </div>
            <p className="mt-2 text-footnote text-text-2">Matched to the exercise library by name; otherwise saved as your own exercise.</p>
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <p className="text-footnote font-bold uppercase tracking-wider text-text-2">Dillan's check</p>
            <p className="mt-2 text-subhead text-text-2"><StatusTag kind="neutral" className="mr-2">Coming with Dillan</StatusTag>A check against your goals, limitations and equipment.</p>
          </Card>
          <Card>
            <p className="text-footnote font-bold uppercase tracking-wider text-text-2">What changed from v{base.versionNo}</p>
            {changes.length ? (
              <ul className="mt-2 flex flex-col gap-1.5 text-subhead">
                {changes.map((c) => <li key={c} className="flex gap-2"><span aria-hidden className="text-text-3">•</span><span>{c}</span></li>)}
              </ul>
            ) : <p className="mt-2 text-subhead text-text-2">Nothing yet.</p>}
            <label className="mt-4 block text-subhead font-bold">Why <span className="font-normal text-text-2">(optional)</span>
              <input value={reason} maxLength={300} onChange={(e) => { setReason(e.target.value); void saveDraft(planDraftKey(uid), { baseVersionId: base.templateVersionId, blocks, reason: e.target.value }).catch(() => setStorageFailed(true)); }}
                className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-[16px] font-normal" placeholder="Knee felt better with fewer reps" />
            </label>
            {errs.length > 0 && <ul className="mt-3 text-footnote text-text">{errs.map((e) => <li key={e} className="flex gap-1.5"><CircleAlert className="size-4 shrink-0" aria-hidden />{e}</li>)}</ul>}
          </Card>
          <Card>
            <p className="text-footnote font-bold uppercase tracking-wider text-text-2">Time estimate</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              {(["full", "short", "priority"] as const).map((c) => (
                <div key={c} className="rounded-btn bg-surface-2 p-2">
                  <dd className="font-num text-title2 font-extrabold tabular">{est[c] || "—"}</dd>
                  <dt className="text-footnote text-text-2">{c === "full" ? "Full" : c === "short" ? "Short" : "Priority only"}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-footnote text-text-2">Minutes, estimated from sets, rest and setup.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function BlockCard({ b, i, last, onMove, onGroup, onUngroup, onRemove, onRemoveExercise, setBlock, setPres, setPriority }: {
  b: EditBlock; i: number; last: boolean;
  onMove: (d: -1 | 1) => void; onGroup: () => void; onUngroup: () => void; onRemove: () => void; onRemoveExercise: (pi: number) => void;
  setBlock: (p: Partial<EditBlock>) => void; setPres: (pi: number, p: Partial<Prescription>) => void; setPriority: (p: BlockPriority) => void;
}) {
  const sup = b.blockType === "superset";
  const kind = b.priority === "priority" ? "priority" : b.priority === "optional" ? "optional" : "required";
  return (
    <Card className={cn(sup && "border-l-4 border-l-spot")}>
      <div className="flex items-start gap-3">
        <BlockDot kind={kind} />
        <div className="min-w-0 flex-1">
          <p className="text-footnote font-bold uppercase tracking-wider text-text-2">Block {i + 1}{sup ? " · Superset" : ""}</p>
          <div role="radiogroup" aria-label={`Block ${i + 1} priority`} className="mt-2 flex flex-wrap gap-1.5">
            {(["main", "priority", "optional"] as BlockPriority[]).map((p) => (
              <Chip key={p} small role="radio" aria-checked={b.priority === p} selected={b.priority === p} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</Chip>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconBtn label="Move up" disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp className="size-4" /></IconBtn>
          <IconBtn label="Move down" disabled={last} onClick={() => onMove(1)}><ArrowDown className="size-4" /></IconBtn>
          <IconBtn label="Remove block" onClick={onRemove}><Trash2 className="size-4" /></IconBtn>
        </div>
      </div>

      {sup && (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-3">
          <NumField label="Rounds" value={b.rounds} onChange={(v) => setBlock({ rounds: v ?? 1 })} />
          <NumField label="Rest between (s)" value={b.prescriptions[0]?.transition_seconds ?? null} hint={`default ${DEFAULT_TRANSITION_SECONDS} s`}
            onChange={(v) => setBlock({ prescriptions: b.prescriptions.map((p, q) => (q < b.prescriptions.length - 1 ? { ...p, transition_seconds: v } : p)) })} />
          <NumField label="Round rest (s)" value={b.restSeconds} onChange={(v) => setBlock({ restSeconds: v })} />
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {b.prescriptions.map((p, pi) => (
          <li key={pi} className="rounded-btn border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-headline font-bold">
                {sup && <span className="mr-1.5 font-num text-text-2">{String.fromCharCode(65 + pi)}</span>}
                {p.exercise_id ? <Link to="/plan/exercise/$id" params={{ id: p.exercise_id }} className="underline decoration-line underline-offset-4">{p.name}</Link> : p.name}
              </p>
              {sup && <IconBtn label={`Remove ${p.name}`} onClick={() => onRemoveExercise(pi)}><Trash2 className="size-4" /></IconBtn>}
            </div>
            <div className={cn("mt-3 grid grid-cols-2 gap-3", sup ? "lg:grid-cols-2" : "lg:grid-cols-4")}>
              {!sup && <NumField label="Sets" value={p.sets ?? null} onChange={(v) => setPres(pi, { sets: v })} />}
              <NumField label="Reps" value={p.reps ?? null} onChange={(v) => setPres(pi, { reps: v })} />
              <NumField label={`Load (${p.unit ?? "lb"})`} decimal value={p.load ?? null} onChange={(v) => setPres(pi, { load: v })} />
              {!sup && <NumField label="Rest (s)" value={b.restSeconds} onChange={(v) => setBlock({ restSeconds: v })} />}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        {sup ? (
          <DButton variant="outline" size="sm" icon={<Unlink className="size-4" aria-hidden />} onClick={onUngroup}>Ungroup</DButton>
        ) : !last ? (
          <DButton variant="outline" size="sm" icon={<Link2 className="size-4" aria-hidden />} onClick={onGroup}>Group with next</DButton>
        ) : null}
      </div>
    </Card>
  );
}

function IconBtn({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className="press grid size-11 place-items-center rounded-btn text-text-2 disabled:opacity-40" {...rest}>
      {children}
    </button>
  );
}

/** Text input with a numeric keyboard (never type="number"). Empty = not set. */
function NumField({ label, value, onChange, decimal, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; decimal?: boolean; hint?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    const parsed = text.trim() === "" ? null : Number(text.replace(",", "."));
    if (parsed !== value) setText(value === null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bad = text.trim() !== "" && !(decimal ? /^\d+([.,]\d+)?$/ : /^\d+$/).test(text.trim());
  return (
    <label className="block text-footnote font-bold text-text-2">{label}
      <input type="text" inputMode={decimal ? "decimal" : "numeric"} autoComplete="off" value={text} placeholder="—" aria-invalid={bad || undefined}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === "") onChange(null);
          else if ((decimal ? /^\d+([.,]\d+)?$/ : /^\d+$/).test(t.trim())) onChange(Number(t.trim().replace(",", ".")));
        }}
        className={cn("mt-1 h-12 w-full rounded-btn border bg-surface px-3 font-num text-[16px] font-bold tabular text-text", bad ? "border-text" : "border-line")} />
      {hint && <span className="mt-1 block font-normal">{hint}</span>}
    </label>
  );
}
