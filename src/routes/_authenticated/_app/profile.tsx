import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dumbbell, Plus, Trash2, Undo2 } from "lucide-react";
import { pageHead } from "@/lib/head";
import { supabase } from "@/integrations/supabase/client";
import { onOutboxChange, removeIfLocal, rewriteUnsent } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import { profileKey, queueRowUpdate, useProfileRow } from "@/lib/use-profile";
import {
  DAY_SHORT, EXPERIENCE, EXPERIENCE_LABEL, INSERT_EQUIPMENT, LIMITATION_LABEL, LIMITATION_STATUSES, UPDATE_EQUIPMENT,
  UPDATE_LIMITATION, UPDATE_PROFILE, overlay, splitContext, weekOrder, type EquipmentAdd,
} from "@/lib/profile";
import { Banner, Card, PageHeader, ScreenState, SectionLabel } from "@/components/dillan/surfaces";
import { Chip, DemoLabel, StatusTag, UnknownValue } from "@/components/dillan/tags";
import { DButton } from "@/components/dillan/button";
import { useToast } from "@/components/dillan/overlays";
import { UnitsControl } from "@/components/dillan/profile-pieces";

export const Route = createFileRoute("/_authenticated/_app/profile")({
  head: () => pageHead("Profile", "Equipment, limitations, availability, experience, units and time zone."),
  component: Profile,
});

const Skeleton = () => <div className="h-32 animate-pulse rounded-card bg-surface-2" aria-busy="true" aria-label="Loading" />;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const ORIGIN: Record<string, string> = { onboarding: "You, onboarding", session: "You, during a session", settings: "You, in Profile", coach_note: "Coach note" };

function Profile() {
  const { user } = Route.useRouteContext();
  const uid = user.id;
  const outbox = useOutbox(uid);
  const qc = useQueryClient();
  const toast = useToast();
  const [writeFailed, setWriteFailed] = useState(false);
  const profile = useProfileRow(uid);
  const equipment = useQuery({
    queryKey: ["equipment", uid],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipment_items").select("id, type, label, detail, quantity, available, is_demo, version, archived_at")
        .eq("owner_id", uid).is("archived_at", null).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const limitations = useQuery({
    queryKey: ["limitations", uid],
    queryFn: async () => {
      const { data, error } = await supabase.from("limitations")
        .select("id, category, location, side, context, status, origin, created_at, version, archived_at, limitation_links(exercise_id, exercises(name))")
        .eq("owner_id", uid).is("archived_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  // A synced write means the stored row (and its version) changed: read it again.
  useEffect(() => onOutboxChange(() => {
    void qc.invalidateQueries({ queryKey: profileKey(uid) });
    void qc.invalidateQueries({ queryKey: ["equipment", uid] });
    void qc.invalidateQueries({ queryKey: ["limitations", uid] });
  }), [qc, uid]);

  const run = async (f: () => Promise<unknown>) => {
    try { setWriteFailed(false); await f(); } catch { setWriteFailed(true); }
  };
  const kick = () => void outbox.syncNow();
  const p = profile.data;
  const setProfile = (patch: Record<string, unknown>) => p && run(() => queueRowUpdate(uid, outbox.add, UPDATE_PROFILE, p, patch, kick));
  const profView = p ? overlay([p], outbox.items, UPDATE_PROFILE)[0]! : null;

  const eqRows = overlay(equipment.data ?? [], outbox.items, UPDATE_EQUIPMENT, INSERT_EQUIPMENT)
    .filter((e) => !(e as { archived?: boolean }).archived);
  const pendingInsert = (id: string) => outbox.items.find((i) => i.kind === INSERT_EQUIPMENT && i.status === "local" && (i.payload as EquipmentAdd).id === id);
  const setEquipment = (row: { id: string; version?: number }, patch: Record<string, unknown>) => run(async () => {
    const ins = pendingInsert(row.id);
    if (ins) {
      // Not stored yet: change the add itself (or take it back).
      if (patch.archived) { await removeIfLocal(ins.localId); return; }
      await rewriteUnsent(uid, (i) => i.localId === ins.localId ? { ...i, payload: { ...(i.payload as EquipmentAdd), ...patch } } : null);
      return;
    }
    if (typeof row.version !== "number") return;
    await queueRowUpdate(uid, outbox.add, UPDATE_EQUIPMENT, { id: row.id, version: row.version }, patch, kick);
  });
  const removeEquipment = (row: { id: string; version?: number; label: string | null; type: string }) => {
    void setEquipment(row, { archived: true }).then(() => toast({
      text: `${row.label ?? row.type} removed`,
      undo: () => void setEquipment(row, { archived: false }),
    }));
  };

  const [newGear, setNewGear] = useState("");
  const addGear = () => {
    const label = newGear.trim();
    if (!label) return;
    const payload: EquipmentAdd = { id: crypto.randomUUID(), type: "other", label, detail: null, quantity: 1, available: true };
    void run(async () => { await outbox.add(INSERT_EQUIPMENT, payload); setNewGear(""); });
  };

  const limRows = overlay(limitations.data ?? [], outbox.items, UPDATE_LIMITATION).filter((l) => !(l as { archived?: boolean }).archived);
  const setLimitation = (row: { id: string; version: number }, patch: Record<string, unknown>) =>
    run(() => queueRowUpdate(uid, outbox.add, UPDATE_LIMITATION, row, patch, kick));

  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const loadFailed = (q: { isError: boolean; refetch: () => unknown }, what: string) =>
    <Card><ScreenState kind={offline ? "offline" : "failed"} title={`Couldn't load ${what}`} body={offline ? "Open Profile online once to see this." : "Check your connection and try again."} action={{ label: "Try again", onClick: () => void q.refetch() }} /></Card>;

  return (
    <div className="pb-10">
      <PageHeader title="Profile" eyebrow="You" />
      {writeFailed && <Banner className="mt-4" action={<DButton size="sm" variant="secondary" onClick={() => setWriteFailed(false)}>Try again</DButton>}>That didn't save. This browser isn't keeping data between visits (private mode or storage full).</Banner>}

      <SectionLabel>Equipment</SectionLabel>
      {equipment.isPending ? <Skeleton /> : equipment.isError ? loadFailed(equipment, "your equipment") : (
        <Card>
          {eqRows.length === 0 ? (
            <ScreenState kind="empty" title="No equipment yet" body="Add what you train with. Dillan only plans with what's here and available." />
          ) : (
            <ul className="divide-y divide-line">
              {eqRows.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Dumbbell className="size-5 shrink-0 text-text-2" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-headline font-bold">{e.label ?? e.type}</p>
                    <p className="text-footnote text-text-2">{e.detail || <UnknownValue />}</p>
                    {e.is_demo && <DemoLabel className="mt-1" />}
                  </div>
                  <label className="flex items-center gap-2 text-subhead">
                    <input type="checkbox" className="size-5 accent-[var(--color-text)]" checked={e.available}
                      onChange={(ev) => void setEquipment(e, { available: ev.target.checked })} />
                    {e.available ? "Available" : "Not available"}
                  </label>
                  <button type="button" aria-label={`Remove ${e.label ?? e.type}`} className="press grid size-11 place-items-center rounded-btn text-text-2" onClick={() => removeEquipment(e)}>
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="mt-3 flex flex-col gap-2 min-[400px]:flex-row" onSubmit={(ev) => { ev.preventDefault(); addGear(); }}>
            <label className="sr-only" htmlFor="new-gear">New equipment</label>
            <input id="new-gear" value={newGear} onChange={(ev) => setNewGear(ev.target.value)} placeholder="e.g. Kettlebell 16 kg" maxLength={80}
              className="h-12 min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 text-[16px]" />
            <DButton type="submit" size="md" variant="secondary" disabled={!newGear.trim()} icon={<Plus className="size-4" aria-hidden />}>Add</DButton>
          </form>
        </Card>
      )}

      <SectionLabel>Limitations</SectionLabel>
      {limitations.isPending ? <Skeleton /> : limitations.isError ? loadFailed(limitations, "your limitations") : limRows.length === 0 ? (
        <Card><ScreenState kind="empty" title="Nothing noted" body="Anything you mark with “Something feels off” shows up here with its date." /></Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {limRows.map((l) => <LimitationCard key={l.id} l={l} onChange={(patch) => setLimitation(l, patch)}
            onRemove={() => { void setLimitation(l, { archived: true }).then(() => toast({ text: "Limitation removed", undo: () => void setLimitation(l, { archived: false, status: l.status === "active" ? "pending" : l.status }) })); }} />)}
        </ul>
      )}

      <SectionLabel>Availability</SectionLabel>
      {profile.isPending ? <Skeleton /> : profile.isError || !profView ? loadFailed(profile, "your profile") : (
        <Card className="flex flex-col gap-5">
          <div>
            <p className="text-headline font-bold">Days per week</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} selected={profView.days_per_week === n} onClick={() => setProfile({ days_per_week: n })}>{n}</Chip>)}
              <Chip selected={profView.days_per_week === null} onClick={() => setProfile({ days_per_week: null })}>Not sure</Chip>
            </div>
          </div>
          <div>
            <p className="text-headline font-bold">Training days</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {weekOrder(profView.week_start).map((d) => {
                const days = profView.training_days ?? [];
                const on = days.includes(d);
                return <Chip key={d} small selected={on} onClick={() => {
                  const next = on ? days.filter((x) => x !== d) : [...days, d].sort();
                  setProfile({ training_days: next.length ? next : null });
                }}>{DAY_SHORT[d]}</Chip>;
              })}
            </div>
            {!profView.training_days?.length && <p className="mt-2"><UnknownValue /></p>}
          </div>
          <div>
            <p className="text-headline font-bold">Typical session</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[20, 30, 45, 60, 75, 90].map((n) => <Chip key={n} selected={profView.session_minutes === n} onClick={() => setProfile({ session_minutes: n })}>{n} min</Chip>)}
              <Chip selected={profView.session_minutes === null} onClick={() => setProfile({ session_minutes: null })}>Not sure</Chip>
            </div>
          </div>
          <div>
            <p className="text-headline font-bold">Week starts on</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 0, 6].map((d) => <Chip key={d} selected={(profView.week_start ?? 1) === d} onClick={() => setProfile({ week_start: d })}>{DAY_SHORT[d]}</Chip>)}
            </div>
            {profView.week_start === null && <p className="mt-1 text-footnote text-text-2">Monday until you choose.</p>}
          </div>
        </Card>
      )}

      <SectionLabel>Experience</SectionLabel>
      {profView && (
        <Card>
          <div className="flex flex-wrap gap-2">
            {EXPERIENCE.map((x) => <Chip key={x} selected={profView.experience === x} onClick={() => setProfile({ experience: x })}>{EXPERIENCE_LABEL[x]}</Chip>)}
          </div>
          {profView.experience === null && <p className="mt-2"><UnknownValue /></p>}
          <p className="mt-2 text-footnote text-text-2">Helps Dillan explain things at the right level. It's never used to pick your loads.</p>
        </Card>
      )}

      <SectionLabel>Units</SectionLabel>
      <UnitsControl uid={uid} />

      <SectionLabel>Time zone</SectionLabel>
      {profView && <TimezoneCard value={profView.timezone} onChange={(tz) => setProfile({ timezone: tz })} />}
    </div>
  );
}

type Lim = { id: string; version: number; location: string | null; side: string | null; category: string; context: string | null; status: string; origin: string | null; created_at: string; pending?: boolean; note?: string;
  limitation_links: { exercise_id: string | null; exercises: { name: string } | null }[] };

function LimitationCard({ l, onChange, onRemove }: { l: Lim; onChange: (patch: Record<string, unknown>) => void; onRemove: () => void }) {
  const stored = splitContext(l.context);
  const shownNote = l.note ?? stored.note;
  const [note, setNote] = useState(shownNote);
  useEffect(() => setNote(shownNote), [shownNote]);
  const exercises = l.limitation_links.map((k) => k.exercises?.name).filter(Boolean);
  const title = [l.location ? l.location[0]!.toUpperCase() + l.location.slice(1) : null, l.side && l.side !== "none" ? `(${l.side})` : null].filter(Boolean).join(" ") || "Something felt off";
  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-headline font-bold">{title}</p>
            <p className="text-footnote text-text-2">{ORIGIN[l.origin ?? ""] ?? "You"} · {fmtDate(l.created_at)}</p>
            <p className="mt-1 text-subhead">{exercises.length ? `Linked: ${exercises.join(", ")}` : <span className="inline-flex items-center gap-2">Linked exercise: <UnknownValue /></span>}</p>
          </div>
          <StatusTag kind={l.status === "resolved" ? "done" : l.status === "pending" || l.status === "active" ? "waiting" : "neutral"}>{LIMITATION_LABEL[l.status] ?? l.status}</StatusTag>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Status">
          {LIMITATION_STATUSES.map((s) => <Chip key={s} small selected={l.status === s} onClick={() => onChange({ status: s })}>{LIMITATION_LABEL[s]}</Chip>)}
        </div>
        <label className="mt-3 block text-footnote font-bold text-text-2">Note
          <textarea value={note} maxLength={280} rows={2} onChange={(e) => setNote(e.target.value)}
            onBlur={() => { if (note.trim() !== shownNote.trim()) onChange({ note: note.trim() }); }}
            className="mt-1 w-full rounded-btn border border-line bg-surface p-3 text-[16px] font-normal text-text" />
        </label>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-footnote text-text-2">A dated note, not a diagnosis.</p>
          <DButton variant="quiet" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={onRemove}>Remove</DButton>
        </div>
      </Card>
    </li>
  );
}

function TimezoneCard({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [device, "UTC"];
  return (
    <Card>
      <label className="block text-headline font-bold">Time zone
        <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 h-12 w-full rounded-btn border border-line bg-surface px-3 text-[16px] font-normal">
          {[...new Set([value, ...zones])].map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </select>
      </label>
      <p className="mt-2 text-footnote text-text-2">Sessions are dated by the day where you train.</p>
      {device && device !== value && (
        <DButton className="mt-3" variant="secondary" size="sm" icon={<Undo2 className="size-4" aria-hidden />} onClick={() => onChange(device)}>Use this device's ({device.replace(/_/g, " ")})</DButton>
      )}
    </Card>
  );
}
