import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Plus, Repeat2 } from "lucide-react";
import { pageHead } from "@/lib/head";
import { supabase } from "@/integrations/supabase/client";
import { localDate } from "@/lib/workout";
import { loadRoutine, loadWeek } from "@/lib/workout-store";
import { onOutboxChange } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import {
  MEASUREMENT_ADD, MEASURE_TYPES, METHODS, bmi, convert, gaps, groupSeries, mondayOf, parseValue, round1,
  seriesKey, steadyWeeks, typeInfo, unitsFor, type MeasureType, type MeasurementInput, type Row, type Side, type Unit,
} from "@/lib/measurements";
import { Banner, Card, PageHeader, ScreenState, SectionLabel, VoiceBlock } from "@/components/dillan/surfaces";
import { DButton } from "@/components/dillan/button";
import { Chip, DemoLabel, SaveState, StatusTag, UnknownValue } from "@/components/dillan/tags";
import { Sheet } from "@/components/dillan/overlays";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/progress")({
  head: () => pageHead("Progress", "Your objectives, steady weeks and measurements."),
  component: Progress,
});

type Tab = "goals" | "body" | "history";
type MRow = Row & { local?: "local" | "failed" };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const Skeleton = ({ h = "h-40" }: { h?: string }) => <div className={cn("animate-pulse rounded-card bg-surface-2", h)} aria-busy="true" aria-label="Loading" />;

function Progress() {
  const { user } = Route.useRouteContext();
  const outbox = useOutbox(user.id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("goals");
  const [sheet, setSheet] = useState(false);
  const today = localDate();
  const from = useMemo(() => { const d = new Date(`${mondayOf(today)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 49); return d.toISOString().slice(0, 10); }, [today]);

  const routine = useQuery({ queryKey: ["routine", user.id], queryFn: () => loadRoutine(user.id) });
  const sessions = useQuery({ queryKey: ["weeks8", user.id, from], queryFn: () => loadWeek(user.id, from, today) });
  const profile = useQuery({
    queryKey: ["profile-progress", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("days_per_week, weight_unit, length_unit").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const goals = useQuery({
    queryKey: ["goals-active", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("goals").select("id, title, user_words, priority, metric, target, target_unit, baseline_ref, is_demo")
        .eq("owner_id", user.id).eq("status", "active").is("archived_at", null).order("priority");
      if (error) throw error;
      return data ?? [];
    },
  });
  const measures = useQuery({
    queryKey: ["measurements", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("measurements").select("id, type, site, side, value, unit, observed_at, method")
        .eq("owner_id", user.id).is("archived_at", null).order("observed_at").limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // When an item syncs, read the server copy again.
  useEffect(() => onOutboxChange(() => void qc.invalidateQueries({ queryKey: ["measurements", user.id] })), [qc, user.id]);

  // Entries still on this device show right away, marked with their save word; server rows win once stored.
  const rows: MRow[] = useMemo(() => {
    const server = measures.data ?? [];
    const ids = new Set(server.map((r) => r.id));
    const local = outbox.items
      .filter((i) => i.kind === MEASUREMENT_ADD && i.status !== "synced")
      .map((i) => i.payload as MeasurementInput)
      .filter((p) => !ids.has(p.id))
      .map((p): MRow => {
        const it = outbox.items.find((i) => (i.payload as MeasurementInput)?.id === p.id)!;
        return { id: p.id, type: p.type, site: p.site, side: p.side, value: parseValue(p.enteredValue) ?? 0, unit: p.unit, observed_at: p.observedAt, method: p.method,
          local: it.status === "local" ? "local" : "failed" };
      });
    return [...server, ...local].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  }, [measures.data, outbox.items]);

  const wUnit = profile.data?.weight_unit === "kg" ? "kg" : "lb";
  const lUnit = profile.data?.length_unit === "cm" ? "cm" : "in";
  const r = routine.data;

  return (
    <div className="pb-10">
      <PageHeader title="Progress" trailing={outbox.loaded ? <SaveState state={outbox.state} count={outbox.pending + outbox.failed} onRetry={outbox.retryNow} className="mt-2" /> : undefined} />

      {r?.purpose?.trim() && <VoiceBlock className="mt-4" size="body" headline={r.purpose.trim()} source={`From your plan · v${r.versionNo}`} />}

      <div role="radiogroup" aria-label="Show" className="mt-6 grid grid-cols-3 gap-1 rounded-btn bg-surface-2 p-1 lg:max-w-[480px]">
        {(["goals", "body", "history"] as Tab[]).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tab === t} onClick={() => setTab(t)}
            className={cn("press min-h-11 rounded-[14px] px-2 text-subhead font-bold capitalize", tab === t ? "bg-surface text-text shadow-float" : "text-text-2")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "goals" && (
        <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          {goals.isPending || measures.isPending ? (
            <Skeleton />
          ) : goals.isError ? (
            <Card><ScreenState kind={navigator.onLine ? "failed" : "offline"} title="Couldn't load your goals" body="Check your connection and try again." action={{ label: "Try again", onClick: () => void goals.refetch() }} /></Card>
          ) : goals.data.length === 0 ? (
            <Card><ScreenState kind="empty" title="No goals yet" body="Goals you add in onboarding or your profile show here." /></Card>
          ) : (
            goals.data.map((g, i) => <ObjectiveCard key={g.id} goal={g} n={i + 1} of={goals.data.length} rows={rows} measuresFailed={measures.isError} />)
          )}
          <SteadyCard sessions={sessions} target={profile.data?.days_per_week ?? null} today={today} />
        </div>
      )}

      {tab === "body" && (
        <div className="mt-6">
          <DButton variant="primary" icon={<Plus className="size-5" aria-hidden />} className="lg:max-w-[360px]" onClick={() => setSheet(true)}>Add a measurement</DButton>
          <BodyList rows={rows} pending={measures.isPending} failed={measures.isError} onRetry={() => void measures.refetch()} wUnit={wUnit} lUnit={lUnit} />
        </div>
      )}

      {tab === "history" && (
        <div className="mt-2">
          <SectionLabel>Reviews</SectionLabel>
          <Card><p className="text-subhead text-text-2"><StatusTag kind="neutral" className="mr-2">Coming later</StatusTag>Past goal reviews will appear here.</p></Card>
          <SectionLabel>Decisions</SectionLabel>
          <Card><p className="text-subhead text-text-2"><StatusTag kind="neutral" className="mr-2">Coming later</StatusTag>Proposals and what you decided will appear here.</p></Card>
        </div>
      )}

      <MeasureSheet open={sheet} onClose={() => setSheet(false)} rows={rows} wUnit={wUnit} lUnit={lUnit}
        add={(p) => outbox.add(MEASUREMENT_ADD, p)} />
    </div>
  );
}

function ObjectiveCard({ goal, n, of, rows, measuresFailed }: {
  goal: { title: string; user_words: string | null; metric: string | null; target: number | null; target_unit: string | null; baseline_ref: string | null; is_demo: boolean };
  n: number; of: number; rows: MRow[]; measuresFailed: boolean;
}) {
  const metric = goal.metric?.trim().toLowerCase() ?? "";
  const series = metric ? rows.filter((r) => r.type === metric && (!r.side || r.side === "none")) : [];
  const unit = goal.target_unit ?? series.at(-1)?.unit ?? "";
  const val = (r: MRow) => round1(convert(r.value, r.unit, unit || r.unit));
  const current = series.at(-1);
  const baseline = series.find((r) => r.id === goal.baseline_ref) ?? (series.length > 1 ? series[0] : undefined);
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        {/* Improve / Maintain / Defer has no stored field yet: shown as not known, never guessed. */}
        <StatusTag kind="unknown">Level not yet known</StatusTag>
        <span className="text-footnote text-text-2">Goal {n} of {of}</span>
      </div>
      <h2 className="mt-3 text-title2 font-bold">{goal.user_words || goal.title}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
        <div>
          {current ? (
            <><p className="font-num text-[3rem] font-extrabold leading-none tabular">{val(current)}<span className="ml-1 text-title3 text-text-2">{unit}</span></p>
              <p className="mt-1 text-footnote text-text-2">{fmtDate(current.observed_at)}</p></>
          ) : <UnknownValue className="text-title2" />}
        </div>
        <p className="text-subhead text-text-2">
          from {baseline ? <><b className="font-num text-text">{val(baseline)}</b> on {fmtDate(baseline.observed_at)}</> : "—"}
          {" · "}target {goal.target != null ? <b className="font-num text-text">{goal.target}{goal.target_unit ? ` ${goal.target_unit}` : ""}</b> : "—"}
        </p>
      </div>
      {current ? (
        <Chart points={series.map((r) => ({ at: r.observed_at, v: val(r) }))} target={goal.target} className="mt-4" />
      ) : (
        <p className="mt-3 text-footnote text-text-2">
          {measuresFailed ? "Measurements load when you're online." : metric ? `No ${metric} entries yet.` : "How this goal is measured isn't set yet."}
        </p>
      )}
      {goal.is_demo && <DemoLabel className="mt-3" />}
    </Card>
  );
}

/** Raw dots, line between close observations, dotted + labeled across gaps, dashed target line. */
function Chart({ points, target, className }: { points: { at: string; v: number }[]; target: number | null; className?: string }) {
  const W = 300, H = 110, P = 10;
  const vs = points.map((p) => p.v).concat(target != null ? [target] : []);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = hi - lo || 1;
  const t0 = Date.parse(points[0]!.at), t1 = Date.parse(points.at(-1)!.at);
  const x = (at: string) => (points.length === 1 ? W / 2 : P + ((Date.parse(at) - t0) / (t1 - t0 || 1)) * (W - 2 * P));
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P - 14);
  const gapList = gaps(points.map((p) => p.at));
  const isGap = (a: string, b: string) => gapList.some((g) => g.from === a && g.to === b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("w-full overflow-visible", className)} role="img"
      aria-label={`${points.length} entries${gapList.length ? `, ${gapList.length} gap${gapList.length > 1 ? "s" : ""}` : ""}${target != null ? `, target ${target}` : ""}`}>
      {target != null && (
        <>
          <line x1={0} x2={W} y1={y(target)} y2={y(target)} className="stroke-spot" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={W} y={y(target) - 4} textAnchor="end" className="fill-spot-ink font-voice text-[11px]">target {target}</text>
        </>
      )}
      {points.slice(1).map((p, i) => {
        const a = points[i]!;
        const gap = isGap(a.at, p.at);
        return (
          <g key={p.at + i}>
            <line x1={x(a.at)} y1={y(a.v)} x2={x(p.at)} y2={y(p.v)} className={gap ? "stroke-text-3" : "stroke-text"} strokeWidth={gap ? 1.5 : 2.5} strokeDasharray={gap ? "3 4" : undefined} />
            {gap && <text x={(x(a.at) + x(p.at)) / 2} y={H} textAnchor="middle" className="fill-text-2 font-voice text-[10px]">no entry · {Math.round(gapList.find((g) => g.from === a.at)!.days / 7)} wk</text>}
          </g>
        );
      })}
      {points.map((p, i) => <circle key={i} cx={x(p.at)} cy={y(p.v)} r={5} className="fill-text" />)}
    </svg>
  );
}

function SteadyCard({ sessions, target, today }: { sessions: { data?: { local_date: string; completion: string; shortened: boolean }[]; isPending: boolean; isError: boolean }; target: number | null; today: string }) {
  if (sessions.isPending) return <Skeleton h="h-56" />;
  const known = !!sessions.data;
  const s = steadyWeeks(sessions.data ?? [], today, target);
  const rowsN = Math.max(1, ...s.cols.map((c) => c.pips.length));
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <StatusTag kind="neutral" icon={<Repeat2 className="size-3.5" aria-hidden />}>Habit</StatusTag>
        <span className="text-footnote text-text-2">{target ? `${target} sessions a week` : "Weekly target not set"}</span>
      </div>
      <h2 className="mt-3 flex flex-wrap items-center gap-2 text-title2 font-bold">
        Steady weeks {known && s.steady != null ? <span className="font-num text-text-2">{s.steady} of {s.of}</span> : <UnknownValue className="text-subhead font-normal" />}
      </h2>
      {!known ? (
        <p className="mt-3 text-footnote text-text-2">{navigator.onLine ? "Couldn't load your sessions." : "Your weeks load when you're online."}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-8 gap-1" role="list" aria-label="Last 8 weeks">
            {s.cols.map((c) => (
              <div key={c.monday} role="listitem" className="flex flex-col items-center gap-1.5" aria-label={`Week of ${c.monday}: ${c.pips.filter((p) => p === "done").length} done`}>
                {Array.from({ length: rowsN }, (_, i) => <WeekDot key={i} kind={c.pips[i]} />)}
                <span className="mt-1 text-[11px] font-bold text-text-2">{c.current ? "now" : `${Number(c.monday.slice(5, 7))}/${Number(c.monday.slice(8))}`}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-text-2">
            <span className="inline-flex items-center gap-1.5"><WeekDot kind="done" small />Done</span>
            <span className="inline-flex items-center gap-1.5"><WeekDot kind="short" small />Shortened</span>
            <span className="inline-flex items-center gap-1.5"><WeekDot kind="partial" small />Logged, not finished</span>
          </p>
        </>
      )}
    </Card>
  );
}

function WeekDot({ kind, small }: { kind?: string; small?: boolean }) {
  const base = cn("relative block overflow-hidden rounded-full", small ? "size-3.5" : "size-[26px]");
  if (kind === "done") return <span className={cn(base, "bg-text")} />;
  if (kind === "short") return <span className={cn(base, "border-2 border-text")}><span className="absolute inset-y-0 left-0 w-1/2 bg-text" /></span>;
  if (kind === "partial") return <span className={cn(base, "grid place-items-center border-2 border-text-2")}><span className="size-1/3 rounded-full bg-text-2" /></span>;
  if (kind === "planned" || kind === "empty") return <span className={cn(base, "border border-line")} />;
  return <span className={cn(base, "invisible")} />;
}

function BodyList({ rows, pending, failed, onRetry, wUnit, lUnit }: { rows: MRow[]; pending: boolean; failed: boolean; onRetry: () => void; wUnit: string; lUnit: string }) {
  const series = groupSeries(rows);
  const latest = (t: string) => series.get(`${t}||`)?.at(-1);
  const w = latest("weight"), h = latest("height");
  const b = bmi(w ?? null, h ?? null);
  return (
    <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-2">
      {failed && !rows.length ? (
        <Card className="lg:col-span-2"><ScreenState kind={navigator.onLine ? "failed" : "offline"} title="Couldn't load measurements" body="Anything you add now is saved on this device." action={{ label: "Try again", onClick: onRetry }} /></Card>
      ) : pending && !rows.length ? (
        <Skeleton h="h-28" />
      ) : !rows.length ? (
        <Card className="lg:col-span-2"><ScreenState kind="empty" title="No measurements yet" body="Add one when you want to track it. Nothing here is required." /></Card>
      ) : (
        [...series.entries()].map(([k, list]) => {
          const last = list.at(-1)!;
          const info = typeInfo(last.type);
          const unit = info?.kind === "mass" ? wUnit : lUnit;
          const sideLabel = last.side && last.side !== "none" ? ` · ${last.side}` : "";
          return (
            <Card key={k}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-headline font-bold">{info?.label ?? last.type}{last.site ? ` · ${last.site}` : ""}<span className="capitalize">{sideLabel}</span></h3>
                {last.local ? <SaveState state={last.local} /> : <span className="text-footnote text-text-2">{fmtDate(last.observed_at)}</span>}
              </div>
              <p className="mt-1 font-num text-title1 font-extrabold tabular">{round1(convert(last.value, last.unit, unit))}<span className="ml-1 text-subhead text-text-2">{unit}</span></p>
              {last.unit !== unit && <p className="text-footnote text-text-2">Entered as {last.value} {last.unit}</p>}
              {list.length > 1 && <Chart className="mt-3" target={null} points={list.map((r) => ({ at: r.observed_at, v: round1(convert(r.value, r.unit, unit)) }))} />}
            </Card>
          );
        })
      )}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-headline font-bold">BMI</h3>
          <StatusTag kind="guess" icon={false}>derived</StatusTag>
        </div>
        <p className="mt-1 font-num text-title1 font-extrabold tabular">{b != null ? b : <UnknownValue className="text-subhead" />}</p>
        <p className="mt-1 text-footnote text-text-2">Worked out from your latest weight and height. It isn't a full picture of fitness.</p>
      </Card>
    </div>
  );
}

function MeasureSheet({ open, onClose, rows, wUnit, lUnit, add }: {
  open: boolean; onClose: () => void; rows: MRow[]; wUnit: string; lUnit: string; add: (p: MeasurementInput) => Promise<unknown>;
}) {
  const [type, setType] = useState<MeasureType>("weight");
  const [side, setSide] = useState<Side>("left");
  const [site, setSite] = useState("");
  const [text, setText] = useState("");
  const [unit, setUnit] = useState<Unit>(wUnit as Unit);
  const [method, setMethod] = useState<string | null>(null);
  const [conditions, setConditions] = useState("");
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const info = typeInfo(type)!;
  useEffect(() => { setUnit((info.kind === "mass" ? wUnit : lUnit) as Unit); }, [type, wUnit, lUnit, info.kind]);

  const key = seriesKey({ type, site: type === "other" ? site.trim() || null : null, side: info.sided ? side : "none" });
  const last = rows.filter((r) => seriesKey(r) === key).at(-1);
  const value = parseValue(text);

  const save = async () => {
    if (busy.current || value === null || (type === "other" && !site.trim())) return;
    busy.current = true;
    setFailed(false);
    try {
      await add({
        id: crypto.randomUUID(), type, site: type === "other" ? site.trim() : null, side: info.sided ? side : "none",
        enteredValue: text.trim(), unit, method, conditions: conditions.trim() || null, observedAt: new Date().toISOString(),
      });
      setText(""); setConditions("");
      onClose();
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add a measurement">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">{MEASURE_TYPES.map((m) => <Chip key={m.id} selected={type === m.id} onClick={() => setType(m.id)}>{m.label}</Chip>)}</div>
        {type === "other" && (
          <label className="block text-subhead font-bold">What you're measuring
            <input value={site} onChange={(e) => setSite(e.target.value)} maxLength={60} className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-[16px] font-normal" placeholder="e.g. Calf" />
          </label>
        )}
        {info.sided && (
          <div className="flex gap-2" role="group" aria-label="Side">
            {(["left", "right"] as Side[]).map((s) => <Chip key={s} selected={side === s} onClick={() => setSide(s)} className="capitalize">{s}</Chip>)}
          </div>
        )}
        <div>
          <label htmlFor="m-value" className="text-subhead font-bold">Value</label>
          <div className="mt-1 flex items-center gap-2">
            <input id="m-value" type="text" inputMode="decimal" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)}
              className="h-14 min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 font-num text-title2 font-extrabold tabular" placeholder="—" />
            {unitsFor(type).map((u) => <Chip key={u} selected={unit === u} onClick={() => setUnit(u)}>{u}</Chip>)}
          </div>
          <p className="mt-1 text-footnote text-text-2">
            {last ? `Last: ${last.value} ${last.unit} · ${fmtDate(last.observed_at)}` : <span className="inline-flex items-center gap-2">Last: <UnknownValue /></span>}
          </p>
          {text.trim() !== "" && value === null && <p className="mt-1 text-footnote text-text">Enter a number, like 32.5.</p>}
        </div>
        <div>
          <p className="text-subhead font-bold">Method <span className="font-normal text-text-2">(optional)</span></p>
          <div className="mt-1 flex flex-wrap gap-2">{METHODS.map((m) => <Chip key={m} small selected={method === m} onClick={() => setMethod(method === m ? null : m)}>{m}</Chip>)}</div>
        </div>
        <label className="block text-subhead font-bold">Conditions <span className="font-normal text-text-2">(optional)</span>
          <input value={conditions} onChange={(e) => setConditions(e.target.value)} maxLength={120} className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-[16px] font-normal" placeholder="Morning, before food" />
        </label>
        {failed && (
          <Banner icon={<CircleAlert className="size-5 shrink-0 text-text" aria-hidden />}>
            This browser isn't keeping data between visits (private mode or storage full). That entry wasn't saved.
          </Banner>
        )}
        <DButton variant="primary" disabled={value === null || (type === "other" && !site.trim())} onClick={() => void save()}>Save</DButton>
        <p className="text-footnote text-text-2">Saved as you typed it. Units convert only on screen.</p>
      </div>
    </Sheet>
  );
}
