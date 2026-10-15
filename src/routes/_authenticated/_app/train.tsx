import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarCheck, List, PencilLine, Play } from "lucide-react";
import { pageHead } from "@/lib/head";
import { Card, OptionRow, PageHeader, SectionLabel, ScreenState } from "@/components/dillan/surfaces";
import { DemoLabel, StatusTag } from "@/components/dillan/tags";
import { DButton } from "@/components/dillan/button";

export const Route = createFileRoute("/_authenticated/_app/train")({
  head: () => pageHead("Train", "Resume a session, start today's, or log something you already did."),
  component: Train,
});

function Train() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Train" trailing={<DemoLabel />} />
      <Card className="mt-6 border-2 border-text">
        <StatusTag kind="waiting">In progress</StatusTag>
        <h2 className="mt-3 text-title2 font-bold">Pull + Core</h2>
        <p className="mt-1 text-subhead text-text-2">Demo session · open it to try set logging and the rest timer.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <DButton variant="primary" icon={<Play className="size-5" aria-hidden />} onClick={() => navigate({ to: "/session/$id", params: { id: "demo" } })}>
            Resume
          </DButton>
          <DButton variant="secondary">Finish here</DButton>
        </div>
      </Card>

      <SectionLabel>Other ways to train</SectionLabel>
      <div className="flex flex-col gap-3">
        <OptionRow icon={<CalendarCheck className="size-6" aria-hidden />} title="Today's session" detail="Pull + Core · 45 / 25 / 15 min" onClick={() => navigate({ to: "/today" })} />
        <OptionRow icon={<List className="size-6" aria-hidden />} title="Pick a routine" detail="Comes in Phase 1" />
        <OptionRow icon={<PencilLine className="size-6" aria-hidden />} title="Log something I already did" detail="Comes in Phase 1" />
      </div>

      <SectionLabel>Recent</SectionLabel>
      <Card>
        <ScreenState kind="empty" title="No sessions yet" body="Sessions you finish show up here." />
      </Card>
    </div>
  );
}
