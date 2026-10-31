// "Devices signed in as you" (S15): this device plus approved TVs, each TV removable (M8).
// Remove calls revoke_device_grant, which deletes the TV's auth session server-side (D9).

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { useDevices, useRevokeDevice } from "@/v1/data/queries";
import type { DeviceGrantRow } from "@/v1/core/types";
import { DButton, dButton } from "@/components/dillan/button";
import { ConfirmDialog } from "@/components/dillan/confirm-dialog";
import { useToast } from "@/components/dillan/overlays";
import { cn } from "@/lib/utils";

export function DevicesList({ userId }: { userId: string }) {
  const { data: grants, isLoading, isError, refetch } = useDevices(userId);
  const revoke = useRevokeDevice(userId);
  const toast = useToast();
  const [removing, setRemoving] = useState<DeviceGrantRow | null>(null);
  const row =
    "flex min-h-14 items-center gap-3 rounded-btn border border-line bg-surface px-4 py-3";

  return (
    <div className="flex flex-col gap-2">
      <div className={row}>
        <div className="min-w-0 flex-1">
          <p className="font-bold">This device</p>
          <p className="text-footnote text-text-2">Active now</p>
        </div>
      </div>
      {isLoading && <p className="px-1 text-subhead text-text-2">Loading devices…</p>}
      {isError && (
        <p className="px-1 text-subhead text-hold">
          Couldn't load your devices.{" "}
          <button
            type="button"
            className="min-h-11 font-bold underline"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </p>
      )}
      {grants?.map((g) => (
        <div key={g.id} className={row}>
          <div className="min-w-0 flex-1">
            <p className="break-words font-bold">{g.label}</p>
            <p className="text-footnote text-text-2">
              Approved · last used{" "}
              {formatDistanceToNowStrict(new Date(g.last_seen_at), { addSuffix: true })}
            </p>
          </div>
          <DButton
            variant="quiet"
            size="md"
            className="shrink-0 px-3"
            onClick={() => setRemoving(g)}
          >
            Remove
          </DButton>
        </div>
      ))}
      {grants && grants.length === 0 && (
        <p className="px-1 text-subhead text-text-2">
          No TV approved yet. Start on the TV, then enter its code.
        </p>
      )}
      <Link
        to="/approve-tv"
        search={{ code: undefined }}
        className={cn(dButton({ variant: "outline", size: "md" }), "mt-1 w-full")}
      >
        Approve a TV
      </Link>
      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.label ?? "this TV"}?`}
        cancelLabel="Cancel"
        confirmLabel="Remove"
        busy={revoke.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          revoke.mutate(removing.id, {
            onSuccess: (ok) =>
              toast({ text: ok ? `${removing.label} removed` : "That TV was already removed" }),
            onError: () => toast({ text: "Couldn't remove the TV. Try again." }),
            onSettled: () => setRemoving(null),
          });
        }}
      >
        The TV is signed out of your account right away. It needs a new approval to show your
        workouts again.
      </ConfirmDialog>
    </div>
  );
}
