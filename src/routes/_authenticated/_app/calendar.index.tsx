import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useUser } from "@/v1/ui/user-context";
import { useProfile } from "@/v1/data/queries";
import { AvatarLink, ScreenHeader } from "@/components/dillan/app-shell";
import { Card } from "@/components/dillan/surfaces";

// S12 Calendar. Slice B placeholder; Slice C builds the month grid, day list and notes.
export const Route = createFileRoute("/_authenticated/_app/calendar")({
  head: () => ({ meta: [{ title: "Calendar · Dillan" }] }),
  component: CalendarPage,
});

function CalendarPage() {
  const user = useUser();
  const { data: profile } = useProfile(user.id);
  return (
    <>
      <ScreenHeader
        big
        title="Calendar"
        trailing={<AvatarLink name={profile?.display_name ?? ""} />}
      />
      <Card className="mt-4 flex flex-col items-center py-10 text-center">
        <CalendarDays className="size-8 text-text-2" aria-hidden />
        <p className="mt-3 text-headline font-bold">Your sessions will show here by day.</p>
        <p className="mt-1 text-subhead text-text-2">
          Each workout lands on the day it started, with its notes.
        </p>
      </Card>
    </>
  );
}
