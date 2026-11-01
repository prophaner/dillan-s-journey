import { createFileRoute } from "@tanstack/react-router";
import { useUser } from "@/v1/ui/user-context";
import { DevicesList } from "@/v1/ui/devices-list";
import { ScreenHeader } from "@/components/dillan/app-shell";

// S15 devices: TVs approved for this account, each removable (revoke_device_grant).
export const Route = createFileRoute("/_authenticated/_app/profile/devices")({
  head: () => ({ meta: [{ title: "Devices · Dillan" }] }),
  component: DevicesPage,
});

function DevicesPage() {
  const user = useUser();
  return (
    <>
      <ScreenHeader title="Devices signed in as you" back="/profile" />
      <p className="mb-4 text-subhead text-text-2">
        A TV locks itself after 15 minutes without activity, except during a workout. Removing a TV
        signs it out of your account right away.
      </p>
      <DevicesList userId={user.id} />
    </>
  );
}
