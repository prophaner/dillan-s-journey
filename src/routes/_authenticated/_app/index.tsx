import { createFileRoute, Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useUser } from "@/v1/ui/user-context";
import { useProfile, useTemplates } from "@/v1/data/queries";
import { AvatarLink, ScreenHeader } from "@/components/dillan/app-shell";
import { dButton } from "@/components/dillan/button";
import { Card } from "@/components/dillan/surfaces";
import { Eyebrow } from "@/components/dillan/form-pieces";
import { SpotMark } from "@/components/dillan/spot-mark";
import { cn } from "@/lib/utils";

// S04 Home. Slice B placeholder: greeting, Workout Now and the empty progress card.
// Slice C adds week metrics, the trend, the live-data card and the running-workout banner.
export const Route = createFileRoute("/_authenticated/_app/")({
  head: () => ({ meta: [{ title: "Home · Dillan" }] }),
  component: HomePage,
});

function HomePage() {
  const user = useUser();
  const { data: profile } = useProfile(user.id);
  const { data: templates } = useTemplates(user.id);
  const name = profile?.display_name ?? "";
  const hasTemplates = (templates?.length ?? 0) > 0;
  return (
    <>
      <ScreenHeader big title={name ? `Hi, ${name}` : "Hi"} trailing={<AvatarLink name={name} />} />
      <Link
        to="/program"
        className={cn(dButton({ variant: "primary", size: "lg" }), "mt-4 h-16 text-title3")}
      >
        <Play className="size-5 fill-current" aria-hidden />
        Workout Now
      </Link>
      <Card className="mt-4">
        <Eyebrow>This week · Mon–Sun</Eyebrow>
        <div className="flex flex-col items-center py-6 text-center">
          <SpotMark size={40} className="text-text" />
          <p className="mt-3 text-headline font-bold">Your first workout starts your progress.</p>
          <p className="mt-1 text-subhead text-text-2">
            Weekly sessions and active minutes will show here.
          </p>
          {!hasTemplates && (
            <Link
              to="/program/new"
              className={cn(dButton({ variant: "secondary", size: "md" }), "mt-5")}
            >
              Create your first workout
            </Link>
          )}
        </div>
      </Card>
    </>
  );
}
