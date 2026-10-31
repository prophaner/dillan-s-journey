import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Play, Settings } from "lucide-react";
import { pageHead } from "@/lib/head";
import { demoToday, demoWeek, type TimeChoice } from "@/lib/demo";
import { DButton } from "@/components/dillan/button";
import { Chip, SaveState, StatusTag, UnknownValue } from "@/components/dillan/tags";
import { Banner, Card, OptionRow, PageHeader, ScreenState, SectionLabel, VoiceBlock } from "@/components/dillan/surfaces";
import { BlockRow, CourseStrip, TimeControl } from "@/components/dillan/plan-pieces";
import { NumericInput, RestTimer, SetPips } from "@/components/dillan/training-pieces";
import { InstallPrompt, Sheet, UpdateBanner, useToast } from "@/components/dillan/overlays";
import { SpotMark } from "@/components/dillan/spot-mark";

export const Route = createFileRoute("/_authenticated/_app/dev/components")({
  head: () => pageHead("Components", "Dillan's shared building blocks."),
  component: Components,
});

function Components() {
  const [t, setT] = useState<TimeChoice>("short");
  const [n, setN] = useState(35);
  const [sheet, setSheet] = useState(false);
  const toast = useToast();
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Phase 0" title="Components" />

      <SectionLabel>Buttons (only one orange per real screen)</SectionLabel>
      <div className="flex flex-col gap-3">
        <DButton variant="primary" icon={<Play className="size-5" aria-hidden />}>Start session</DButton>
        <DButton variant="primary" loading>Saving</DButton>
        <DButton variant="secondary">Finish here</DButton>
        <DButton variant="quiet" size="md">I'm not sure yet</DButton>
      </div>

      <SectionLabel>Chips</SectionLabel>
      <div className="flex flex-wrap gap-2">
        <Chip selected>Tired</Chip><Chip>Short on time</Chip><Chip small>Filter</Chip>
      </div>

      <SectionLabel>Status tags</SectionLabel>
      <div className="flex flex-wrap gap-2">
        <StatusTag kind="done">Applied</StatusTag>
        <StatusTag kind="waiting">Waiting on you</StatusTag>
        <StatusTag kind="priority" icon={false}>Main goal</StatusTag>
        <StatusTag kind="neutral">Draft</StatusTag>
        <StatusTag kind="guess">Dillan's guess</StatusTag>
        <StatusTag kind="failed">Didn't save</StatusTag>
        <StatusTag kind="reviewing">Dillan is reviewing</StatusTag>
        <UnknownValue />
      </div>

      <SectionLabel>Save state</SectionLabel>
      <div className="flex flex-col gap-2">
        <SaveState state="synced" /><SaveState state="local" count={3} /><SaveState state="failed" count={1} onRetry={() => {}} />
      </div>

      <SectionLabel>Cards and Dillan's voice</SectionLabel>
      <div className="flex flex-col gap-3">
        <Card><VoiceBlock size="body" headline="Two weeks to your review. Rows are up a notch; nothing to change yet." source="From: sessions Oct 8–14" /></Card>
        <Card variant="proposal"><StatusTag kind="waiting">Waiting on you</StatusTag><p className="mt-2 font-bold">Proposal card</p></Card>
        <Card variant="guess"><StatusTag kind="guess">Dillan's guess</StatusTag><p className="mt-2 font-bold">Guess card</p></Card>
      </div>

      <SectionLabel>Time control, block rows, the Course</SectionLabel>
      <Card>
        <TimeControl value={t} onChange={setT} minutes={demoToday.times} />
        <ul className="mt-2">{demoToday.blocks.map((b) => <BlockRow key={b.id} {...b} omitted={t === "short" ? !b.inShort : t === "priority" ? !b.inPriority : false} />)}</ul>
      </Card>
      <div className="mt-4"><CourseStrip days={[...demoWeek.slice(0, 5), { day: "S", kind: "missed" }, demoWeek[6]!]} /></div>

      <SectionLabel>Set card pieces</SectionLabel>
      <Card className="flex flex-col gap-5">
        <SetPips total={3} done={[1]} current={2} />
        <NumericInput label="Per dumbbell" unit="lb" decimal step={5} value={n} onChange={setN} last={null} />
      </Card>

      <SectionLabel>Rest timer</SectionLabel>
      <RestTimer remainingMs={47000} totalMs={90000} />

      <SectionLabel>Option row, banners</SectionLabel>
      <div className="flex flex-col gap-3">
        <OptionRow icon={<Settings className="size-6" aria-hidden />} title="Option row" detail="With detail line" />
        <Banner>You're offline. Sets save on this device.</Banner>
        <InstallPrompt onInstall={() => {}} onLater={() => {}} />
        <UpdateBanner onUpdate={() => {}} />
      </div>

      <SectionLabel>Sheet and toast</SectionLabel>
      <div className="flex gap-2">
        <DButton variant="secondary" size="md" onClick={() => setSheet(true)}>Open sheet</DButton>
        <DButton variant="secondary" size="md" onClick={() => toast({ text: "Set removed", undo: () => {} })}>Show toast</DButton>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="A sheet"><p className="text-body text-text-2">Focus stays in here until you close it.</p></Sheet>

      <SectionLabel>States</SectionLabel>
      <div className="grid gap-3 md:grid-cols-2">
        {(["empty", "loading", "offline", "failed"] as const).map((k) => <Card key={k}><ScreenState kind={k} /></Card>)}
      </div>

      <SectionLabel>Spot mark</SectionLabel>
      <div className="flex items-end gap-4 text-text"><SpotMark size={24} /><SpotMark size={48} /><SpotMark size={72} animate /></div>
    </div>
  );
}
