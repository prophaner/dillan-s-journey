import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useUser } from "@/v1/ui/user-context";
import { useConfirmZones, useProfile, useZones } from "@/v1/data/queries";
import { S14_COPY } from "@/v1/core/hr-views";
import { StrapCard } from "@/v1/ui/strap-card";
import { ZonesEditor } from "@/v1/ui/zones-editor";
import { ScreenHeader } from "@/components/dillan/app-shell";
import { Card, ScreenState } from "@/components/dillan/surfaces";
import { useToast } from "@/components/dillan/overlays";

// S14 "Heart-rate strap & zones" (h10-design 6). Card 1: the strap as the relay reports it
// (strap-card.tsx; this screen never uses Bluetooth). Card 2: the zones editor.
export const Route = createFileRoute("/_authenticated/_app/profile/zones")({
  head: () => ({ meta: [{ title: "Heart-rate strap & zones · Dillan" }] }),
  component: ZonesPage,
});

function ZonesPage() {
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: config, isLoading, isError, refetch } = useZones(user.id);
  const confirm = useConfirmZones(user.id);
  const profile = useProfile(user.id);

  return (
    <>
      <ScreenHeader title="Heart-rate strap & zones" back="/profile" />
      <StrapCard userId={user.id} userName={profile.data?.display_name ?? ""} />

      <section className="mt-4" aria-labelledby="zones-h">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="zones-h" className="text-title3 font-bold">
              Heart-rate zones
            </h2>
            {config?.confirmed_at ? (
              <span className="shrink-0 whitespace-nowrap rounded-chip bg-steady-tint px-3 py-1 text-footnote font-bold text-steady">
                Confirmed
              </span>
            ) : (
              <span className="shrink-0 whitespace-nowrap rounded-chip bg-hold-tint px-3 py-1 text-footnote font-bold text-hold">
                Not set
              </span>
            )}
          </div>
          {!config?.confirmed_at && (
            <p className="mb-3 text-subhead text-text-2">
              Zones are five BPM ranges you define. Until you confirm them, Dillan shows BPM only
              and never guesses a zone.
            </p>
          )}
          {isLoading ? (
            <ScreenState kind="loading" />
          ) : isError ? (
            <ScreenState
              kind="failed"
              title="Couldn't load your zones"
              body="Check your connection."
              action={{ label: "Try again", onClick: () => void refetch() }}
            />
          ) : (
            <ZonesEditor
              config={config ?? null}
              busy={confirm.isPending}
              onConfirm={(c) =>
                confirm.mutate(c, {
                  onSuccess: () => {
                    toast({ text: "Zones confirmed" });
                    void navigate({ to: "/profile" });
                  },
                  onError: () => toast({ text: "Zones didn't save. Try again." }),
                })
              }
            />
          )}
          <p className="mt-3 text-footnote text-text-2">{S14_COPY.zonesFootnote}</p>
        </Card>
      </section>
    </>
  );
}
