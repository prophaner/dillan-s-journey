// S06 Workout editor (handoff 4.3, flow F4). Field rules and messages come from core/validate.ts
// (twin of the SQL validator). Draft autosaves per user; Back / browser Back with unsaved changes
// opens M1 "Discard changes?" with Keep editing focused; delete is a soft delete behind M2; a
// save that lost a revision race says so and offers to load the latest version.

import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import type { LoadBasis, RepMode, Unit, WorkoutTemplate } from "@/v1/core/types";
import { errorsByPath, validateTemplate } from "@/v1/core/validate";
import { RevisionConflictError, TemplateInvalidError } from "@/v1/data/api";
import { useApi } from "@/v1/data/client";
import { qk } from "@/v1/data/queries";
import { ScreenHeader } from "@/components/dillan/app-shell";
import { DButton } from "@/components/dillan/button";
import { ConfirmDialog } from "@/components/dillan/confirm-dialog";
import { Banner } from "@/components/dillan/surfaces";
import { Field, Segmented, TextArea, TextInput } from "@/components/dillan/form-pieces";
import { useToast } from "@/components/dillan/overlays";
import { cn } from "@/lib/utils";
import {
  addExercise,
  addToSuperset,
  clearDraft,
  convertToStraight,
  draftFromTemplate,
  fieldId,
  moveExercise,
  newDraft,
  patchBlock,
  patchExercise,
  readDraft,
  removeExercise,
  sameDraft,
  setName,
  setSetType,
  supersetLetters,
  toBody,
  writeDraft,
  type Draft,
  type DraftExercise,
} from "./editor-model";

export const EDITOR_COPY = {
  noHistoryChange: "Editing or deleting a workout never changes sessions you've already logged.",
  duplicate:
    "You already have a workout with this name. That's allowed — just make sure you can tell them apart.",
  restored: "We restored changes you hadn't saved.",
  singleSuperset: "A superset needs at least two exercises next to each other.",
} as const;

type Conflict = { latest: WorkoutTemplate | null } | null;

export function WorkoutEditor({
  userId,
  template,
  otherNames,
  unit,
}: {
  userId: string;
  template: WorkoutTemplate | null;
  /** names of the user's other workouts, for the duplicate-name warning */
  otherNames: string[];
  unit: Unit;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const [baseline, setBaseline] = useState<Draft>(() =>
    template ? draftFromTemplate(template) : newDraft(unit),
  );
  const [revision, setRevision] = useState<number | null>(template?.revision ?? null);
  const [draft, setDraft] = useState<Draft>(baseline);
  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [conflict, setConflict] = useState<Conflict>(null);
  const leaving = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const templateId = template?.id ?? null;

  // Restore an autosaved draft for this workout (survives reload).
  useEffect(() => {
    const s = readDraft(userId);
    if (s && s.templateId === templateId && !sameDraft(s.draft, baseline)) {
      setDraft(s.draft);
      if (s.baseRevision != null) setRevision(s.baseRevision);
      setRestored(true);
    }
    if (!templateId) nameRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = !sameDraft(draft, baseline);

  // Autosave every change; a clean editor leaves nothing behind.
  useEffect(() => {
    if (leaving.current) return;
    if (dirty)
      writeDraft({ v: 1, userId, templateId, baseRevision: revision, draft, savedAt: Date.now() });
    else {
      const s = readDraft(userId);
      if (s && s.templateId === templateId) clearDraft(userId);
    }
  }, [draft, dirty, userId, templateId, revision]);

  // Live re-validation once the user has tried to save.
  useEffect(() => {
    if (showErrors) setErrors(errorsByPath(validateTemplate(toBody(draft))));
  }, [draft, showErrors]);

  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !leaving.current,
    withResolver: true,
    enableBeforeUnload: false, // the draft is autosaved; reload restores it
  });

  const letters = useMemo(() => supersetLetters(draft), [draft]);
  const duplicate = useMemo(() => {
    const n = draft.name.trim().toLowerCase();
    return !!n && otherNames.some((o) => o.trim().toLowerCase() === n);
  }, [draft.name, otherNames]);

  const update = (d: Draft) => {
    setDraft(d);
    setNotice(null);
  };

  const leave = (to: "/program") => {
    leaving.current = true;
    void navigate({ to });
  };

  const focusFirstError = (errs: Record<string, string>) => {
    window.setTimeout(() => {
      // first invalid field in reading order (the validator lists rest before sets)
      const els = Object.keys(errs)
        .map(
          (p) =>
            document.getElementById(fieldId(p)) ??
            (p === "blocks" ? document.getElementById("ed-add") : null),
        )
        .filter((el): el is HTMLElement => !!el)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const el = els[0];
      el?.focus();
      el?.scrollIntoView?.({ block: "center" });
    }, 0);
  };

  const finishSaved = (t: WorkoutTemplate, created: boolean) => {
    clearDraft(userId);
    qc.setQueryData(qk.template(userId, t.id), t);
    void qc.invalidateQueries({ queryKey: qk.templates(userId) });
    toast({ text: created ? "Workout saved" : "Saved" });
    leave("/program");
  };

  const save = async (opts: { asNew?: boolean } = {}) => {
    const body = toBody(draft);
    const errs = errorsByPath(validateTemplate(body));
    setShowErrors(true);
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstError(errs);
      return;
    }
    setSaving(true);
    try {
      if (templateId && revision != null && !opts.asNew) {
        finishSaved(await api.templates.update(templateId, body, revision), false);
      } else {
        finishSaved(await api.templates.create(body), true);
      }
    } catch (e) {
      if (e instanceof RevisionConflictError) setConflict({ latest: e.latest });
      else if (e instanceof TemplateInvalidError) {
        const map = errorsByPath(validateTemplate(body));
        setErrors(map);
        toast({ text: "Fix the highlighted fields to save." });
      } else toast({ text: "That didn't save. Your changes are kept on this device — try again." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!templateId || revision == null) return;
    setDeleting(true);
    try {
      await api.templates.remove(templateId, revision);
      clearDraft(userId);
      void qc.invalidateQueries({ queryKey: qk.templates(userId) });
      setAskDelete(false);
      toast({ text: "Workout deleted" });
      leave("/program");
    } catch (e) {
      setAskDelete(false);
      if (e instanceof RevisionConflictError) setConflict({ latest: e.latest });
      else toast({ text: "Nothing was deleted. Check your connection and try again." });
    } finally {
      setDeleting(false);
    }
  };

  const loadLatest = (t: WorkoutTemplate) => {
    const d = draftFromTemplate(t);
    clearDraft(userId);
    setBaseline(d);
    setDraft(d);
    setRevision(t.revision);
    setRestored(false);
    setConflict(null);
    setShowErrors(false);
    setErrors({});
    qc.setQueryData(qk.template(userId, t.id), t);
    void qc.invalidateQueries({ queryKey: qk.templates(userId) });
  };

  const err = (path: string) => (showErrors ? (errors[path] ?? null) : null);

  let position = 0;

  return (
    <>
      <ScreenHeader
        title={templateId ? "Edit workout" : "New workout"}
        onBack={() => void navigate({ to: "/program" })}
      />

      {restored && (
        <Banner
          className="mb-4"
          action={
            <DButton
              variant="quiet"
              size="sm"
              onClick={() => {
                clearDraft(userId);
                setDraft(baseline);
                setRestored(false);
              }}
            >
              Discard
            </DButton>
          }
        >
          {EDITOR_COPY.restored}
        </Banner>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        <Field
          label="Workout name"
          htmlFor={fieldId("name")}
          error={err("name")}
          help={duplicate ? EDITOR_COPY.duplicate : undefined}
        >
          <TextInput
            ref={nameRef}
            id={fieldId("name")}
            value={draft.name}
            placeholder="e.g. Upper Body A"
            autoComplete="off"
            invalid={!!err("name")}
            onChange={(e) => update(setName(draft, e.target.value))}
          />
        </Field>

        {draft.blocks.map((b, bi) => {
          if (b.type === "straight") {
            position += 1;
            return (
              <section
                key={b.id}
                className="rounded-card border border-line bg-surface p-4"
                aria-label={`Exercise ${position}`}
              >
                <CardHead
                  label={`Exercise ${position}`}
                  canUp={bi > 0}
                  canDown={bi < draft.blocks.length - 1}
                  onMove={(dir) => update(moveExercise(draft, bi, 0, dir).draft)}
                  onRemove={() => update(removeExercise(draft, bi, 0))}
                />
                <ExerciseFields
                  ex={b.exercise}
                  path={`blocks.${bi}.exercise`}
                  err={err}
                  onChange={(p) => update(patchExercise(draft, bi, 0, p))}
                  setType="straight"
                  onSetType={(t) => update(setSetType(draft, bi, 0, t, unit))}
                  counts={
                    <>
                      <NumField
                        label="Sets"
                        path={`blocks.${bi}.sets`}
                        value={b.sets}
                        err={err}
                        onChange={(v) => update(patchBlock(draft, bi, { sets: v }))}
                      />
                    </>
                  }
                  rest={
                    <NumField
                      label="Rest (s)"
                      path={`blocks.${bi}.rest_s`}
                      value={b.rest_s}
                      err={err}
                      onChange={(v) => update(patchBlock(draft, bi, { rest_s: v }))}
                    />
                  }
                />
              </section>
            );
          }
          const letter = letters[bi] ?? "?";
          const groupErr = err(`blocks.${bi}.exercises`);
          return (
            <section
              key={b.id}
              aria-label={`Superset ${letter}`}
              className="rounded-card border border-l-4 border-line border-l-spot bg-surface p-4"
            >
              <h3
                id={fieldId(`blocks.${bi}.exercises`)}
                tabIndex={-1}
                className="text-headline font-bold"
              >
                Superset {letter} · {b.rounds || "?"} rounds
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumField
                  label="Rounds"
                  path={`blocks.${bi}.rounds`}
                  value={b.rounds}
                  err={err}
                  onChange={(v) => update(patchBlock(draft, bi, { rounds: v }))}
                />
                <NumField
                  label="Rest (s)"
                  path={`blocks.${bi}.rest_s`}
                  value={b.rest_s}
                  err={err}
                  onChange={(v) => update(patchBlock(draft, bi, { rest_s: v }))}
                />
              </div>
              <p className="mt-2 text-footnote text-text-2">
                One round = one set of each exercise below, then rest {b.rest_s || "0"} s after{" "}
                {letter}
                {b.exercises.length}.
              </p>
              {(b.exercises.length < 2 || groupErr) && (
                <div
                  className="mt-3 rounded-btn bg-hold-tint p-3 text-subhead text-hold"
                  role="status"
                >
                  <p className="font-medium">{groupErr ?? EDITOR_COPY.singleSuperset}</p>
                  {b.exercises.length === 1 && (
                    <DButton
                      variant="secondary"
                      size="sm"
                      className="mt-2 bg-surface"
                      onClick={() => update(convertToStraight(draft, bi))}
                    >
                      Convert to straight sets
                    </DButton>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-col gap-3">
                {b.exercises.map((ex, mi) => {
                  position += 1;
                  return (
                    <div
                      key={ex.id}
                      className="rounded-btn border border-line p-3"
                      aria-label={`Superset ${letter}${mi + 1}`}
                      role="group"
                    >
                      <CardHead
                        label={`Superset ${letter}${mi + 1}`}
                        canUp
                        canDown
                        onMove={(dir) => {
                          const r = moveExercise(draft, bi, mi, dir);
                          update(r.draft);
                          if (r.leftGroup) setNotice(`Moved out of Superset ${r.leftGroup}.`);
                        }}
                        onRemove={() => update(removeExercise(draft, bi, mi))}
                      />
                      <ExerciseFields
                        ex={ex}
                        path={`blocks.${bi}.exercises.${mi}`}
                        err={err}
                        onChange={(p) => update(patchExercise(draft, bi, mi, p))}
                        setType="superset"
                        onSetType={(t) => update(setSetType(draft, bi, mi, t, unit))}
                      />
                    </div>
                  );
                })}
              </div>
              <DButton
                variant="outline"
                size="md"
                className="mt-3 w-full"
                icon={<Plus className="size-4" aria-hidden />}
                onClick={() => update(addToSuperset(draft, bi, unit))}
              >
                Add exercise to Superset {letter}
              </DButton>
            </section>
          );
        })}

        {notice && (
          <p role="status" className="text-subhead text-hold">
            {notice}
          </p>
        )}
        {err("blocks") && <p className="text-subhead font-medium text-hold">{err("blocks")}</p>}

        <DButton
          id="ed-add"
          variant="secondary"
          icon={<Plus className="size-5" aria-hidden />}
          onClick={() => update(addExercise(draft, unit))}
        >
          Add exercise
        </DButton>

        <div className="mt-2 border-t border-line pt-4">
          <DButton type="submit" variant="primary" loading={saving} disabled={saving}>
            Save workout
          </DButton>
          {templateId && (
            <DButton variant="quiet" className="mt-2" onClick={() => setAskDelete(true)}>
              Delete workout
            </DButton>
          )}
          <p className="mt-3 text-footnote text-text-2">{EDITOR_COPY.noHistoryChange}</p>
        </div>
      </form>

      <ConfirmDialog
        open={blocker.status === "blocked"}
        title="Discard changes?"
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        onCancel={() => blocker.reset?.()}
        onConfirm={() => {
          leaving.current = true;
          clearDraft(userId);
          blocker.proceed?.();
        }}
      >
        This workout has edits you haven't saved.
      </ConfirmDialog>

      <ConfirmDialog
        open={askDelete}
        title={`Delete "${template?.name ?? draft.name}"?`}
        cancelLabel="Cancel"
        confirmLabel="Delete workout"
        busy={deleting}
        onCancel={() => setAskDelete(false)}
        onConfirm={() => void remove()}
      >
        It disappears from Program. Sessions you already logged with it stay in Calendar exactly as
        recorded.
      </ConfirmDialog>

      <ConfirmDialog
        open={!!conflict}
        title={
          conflict?.latest && !conflict.latest.deleted_at
            ? "Changed on another device"
            : "This workout was deleted"
        }
        cancelLabel="Keep editing"
        confirmLabel={
          conflict?.latest && !conflict.latest.deleted_at
            ? "Load the latest version"
            : "Save as a new workout"
        }
        confirmVariant="secondary"
        onCancel={() => setConflict(null)}
        onConfirm={() => {
          const latest = conflict?.latest;
          if (latest && !latest.deleted_at) loadLatest(latest);
          else {
            setConflict(null);
            void save({ asNew: true });
          }
        }}
      >
        {conflict?.latest && !conflict.latest.deleted_at
          ? "Another device saved this workout after you opened it, so your save didn't go through. Loading the latest version replaces your unsaved edits here."
          : "It was deleted on another device. You can save your edits as a new workout."}
      </ConfirmDialog>
    </>
  );
}

function CardHead({
  label,
  canUp,
  canDown,
  onMove,
  onRemove,
}: {
  label: string;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const icon = "grid size-11 place-items-center rounded-full text-text-2 disabled:opacity-30";
  return (
    <div className="mb-2 flex items-center gap-1">
      <p className="min-w-0 flex-1 truncate text-footnote font-bold uppercase tracking-wider text-text-2">
        {label}
      </p>
      <button
        type="button"
        className={icon}
        aria-label={`Move ${label} up`}
        disabled={!canUp}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        className={icon}
        aria-label={`Move ${label} down`}
        disabled={!canDown}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        className="min-h-11 px-2 text-subhead font-bold text-text-2"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

function NumField({
  label,
  path,
  value,
  err,
  onChange,
  decimal,
  placeholder,
}: {
  label: string;
  path: string;
  value: string;
  err: (p: string) => string | null;
  onChange: (v: string) => void;
  decimal?: boolean;
  placeholder?: string;
}) {
  const e = err(path);
  return (
    <Field label={label} htmlFor={fieldId(path)} error={e}>
      <TextInput
        id={fieldId(path)}
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        invalid={!!e}
        className="font-num tabular"
        onChange={(ev) =>
          onChange(ev.target.value.replace(decimal ? /[^\d.,]/g : /[^\d]/g, "").slice(0, 7))
        }
      />
    </Field>
  );
}

function ExerciseFields({
  ex,
  path,
  err,
  onChange,
  setType,
  onSetType,
  counts,
  rest,
}: {
  ex: DraftExercise;
  path: string;
  err: (p: string) => string | null;
  onChange: (p: Partial<DraftExercise>) => void;
  setType: "straight" | "superset";
  onSetType: (t: "straight" | "superset") => void;
  counts?: React.ReactNode;
  rest?: React.ReactNode;
}) {
  const hasWeight = ex.weight.trim() !== "";
  const lbErr = err(`${path}.load_basis`);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" htmlFor={fieldId(`${path}.name`)} error={err(`${path}.name`)}>
        <TextInput
          id={fieldId(`${path}.name`)}
          value={ex.name}
          placeholder="e.g. Dumbbell Floor Press"
          autoComplete="off"
          invalid={!!err(`${path}.name`)}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-subhead font-bold text-text-2">Set type</span>
        <Segmented
          label="Set type"
          value={setType}
          options={[
            { value: "straight", label: "Straight sets" },
            { value: "superset", label: "Superset" },
          ]}
          onChange={onSetType}
        />
      </div>
      <div className={cn("grid gap-3", counts ? "grid-cols-2" : "grid-cols-1")}>
        {counts}
        <NumField
          label="Reps"
          path={`${path}.reps`}
          value={ex.reps}
          err={err}
          onChange={(v) => onChange({ reps: v })}
        />
      </div>
      <Segmented<RepMode>
        label="Reps count"
        value={ex.rep_mode}
        options={[
          { value: "total", label: "Total" },
          { value: "per_side", label: "Per side" },
        ]}
        onChange={(v) => onChange({ rep_mode: v })}
      />
      <div className={cn("grid gap-3", rest ? "grid-cols-2" : "grid-cols-1")}>
        <NumField
          label={`Weight (${ex.unit})`}
          path={`${path}.weight`}
          value={ex.weight}
          decimal
          placeholder="Bodyweight"
          err={err}
          onChange={(v) => onChange({ weight: v })}
        />
        {rest}
      </div>
      {hasWeight && (
        <div className="flex flex-col gap-1.5">
          <span
            className="text-subhead font-bold text-text-2"
            id={fieldId(`${path}.load_basis`) + "-label"}
          >
            Load basis
          </span>
          <div
            id={fieldId(`${path}.load_basis`)}
            tabIndex={-1}
            className={cn("rounded-btn", lbErr && "ring-2 ring-hold")}
          >
            <Segmented<LoadBasis>
              label="Load basis"
              value={ex.load_basis}
              options={[
                { value: "per_implement", label: "Per implement" },
                { value: "total_external", label: "Total load" },
              ]}
              onChange={(v) => onChange({ load_basis: v })}
            />
          </div>
          {lbErr ? (
            <p className="text-footnote font-medium text-hold">{lbErr}</p>
          ) : (
            <p className="text-footnote text-text-2">
              Per implement = each dumbbell or kettlebell. Total = the full load. So "{ex.weight}{" "}
              {ex.unit}" is never ambiguous.
            </p>
          )}
        </div>
      )}
      <Field
        label="Instructions (optional)"
        htmlFor={fieldId(`${path}.instructions`)}
        error={err(`${path}.instructions`)}
      >
        <TextArea
          id={fieldId(`${path}.instructions`)}
          value={ex.instructions}
          placeholder="Shown on screen during this exercise"
          invalid={!!err(`${path}.instructions`)}
          onChange={(e) => onChange({ instructions: e.target.value })}
        />
      </Field>
    </div>
  );
}
