import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { pageHead } from "@/lib/head";
import { demoToday, demoWeek, type TimeChoice } from "@/lib/demo";
import { Card, VoiceBlock } from "@/components/dillan/surfaces";
import { BlockRow, CourseStrip, TimeControl } from "@/components/dillan/plan-pieces";
import { DButton } from "@/components/dillan/button";
import { DemoLabel, StatusTag } from "@/components/dillan/tags";
import { StickyActions } from "@/components/dillan/overlays";

export const Route = createFileRoute("/_authenticated/_app/today")({
  head: () => pageHead("Today", "Today's plan, how much time you have, and where to start."),
  component: Today,
});

function Today() {
  const [time, setTime] = useState<TimeChoice>("full");
  const navigate = useNavigate();
  const d = demoToday;
  const omitted = (b: (typeof d.blocks)[number]) =>
    (time === "short" && !b.inShort) || (time === "priority" && !b.inPriority);
  const date = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="pt-6 lg:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-footnote font-bold uppercase tracking-wider text-text-2">
          {date} · {d.eyebrow}
        </p>
        <DemoLabel />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="min-w-0">
          <VoiceBlock
            className="mt-4"
            headline={d.sentence}
            source={`Dillan · based on your plan v${d.planVersion}`}
          >
            {d.body}
          </VoiceBlock>
          <div className="mt-6">
            <CourseStrip days={demoWeek} />
          </div>

          <Card className="mt-6">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-title2 font-bold">{d.routine}</h2>
              <span className="text-footnote text-text-2">est. times</span>
            </div>
            <TimeControl value={time} onChange={setTime} minutes={d.times} />
            <ul className="mt-2">
              {d.blocks.map((b) => (
                <BlockRow key={b.id} {...b} omitted={omitted(b)} />
              ))}
            </ul>
            {time !== "full" && (
              <p className="mt-1 text-footnote text-text-2">
                Why this trade: the priority block stays, because it's what moves your main goal.
              </p>
            )}
          </Card>

          <StickyActions className="mt-4 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
            <DButton
              variant="primary"
              icon={<Play className="size-5" aria-hidden />}
              className="lg:max-w-[480px]"
              onClick={() => navigate({ to: "/session/$id", params: { id: "demo" } })}
            >
              Start session
            </DButton>
          </StickyActions>
        </div>

        <aside className="mt-8 flex flex-col gap-3 lg:mt-4">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-headline font-bold">Waiting on you</h2>
              <StatusTag kind="waiting">1</StatusTag>
            </div>
            <p className="mt-1 text-subhead text-text-2">Coach proposals and Dillan's suggestions will appear here, each with its status.</p>
          </Card>
          <Card>
            <h2 className="text-headline font-bold">Six strict chin-ups</h2>
            <p className="mt-1 text-subhead text-text-2">5 of 6 · last test Oct 13</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
