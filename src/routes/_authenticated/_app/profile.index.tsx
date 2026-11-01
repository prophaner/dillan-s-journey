import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { useApi } from "@/v1/data/client";
import { maskContact, type Profile } from "@/v1/data/api";
import { useProfile, useUpdateProfile, useZones } from "@/v1/data/queries";
import type { WorkoutSessionRow } from "@/v1/core/types";
import { useUser } from "@/v1/ui/user-context";
import { DevicesList } from "@/v1/ui/devices-list";
import { timeZoneOptions } from "@/v1/ui/timezones";
import { clearDraft } from "@/v1/ui/editor-model";
import { clearLocalUserData } from "@/v1/session/local-data";
import { ScreenHeader } from "@/components/dillan/app-shell";
import { DButton } from "@/components/dillan/button";
import { Card, ScreenState } from "@/components/dillan/surfaces";
import {
  Eyebrow,
  Field,
  Segmented,
  Stepper,
  TextInput,
  inputClass,
} from "@/components/dillan/form-pieces";
import { ConfirmDialog } from "@/components/dillan/confirm-dialog";
import { useToast } from "@/components/dillan/overlays";

// S15 Account & devices (phone/desktop): name, units, timezone, weekly goal, heart-rate strap &
// zones, devices, log out (this device), log out everywhere, delete my data, delete account.
export const Route = createFileRoute("/_authenticated/_app/profile/")({
  head: () => ({ meta: [{ title: "Profile · Dillan" }] }),
  component: ProfilePage,
});

function commandSource(): "phone" | "desktop" {
  return typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches
    ? "desktop"
    : "phone";
}

function ProfilePage() {
  const user = useUser();
  const { data: profile, isLoading, isError, refetch } = useProfile(user.id);
  if (isLoading) return <ScreenState kind="loading" />;
  if (isError || !profile)
    return (
      <>
        <ScreenHeader title="Profile" back="/" />
        <ScreenState
          kind="failed"
          title="Couldn't load your profile"
          body="Check your connection."
          action={{ label: "Try again", onClick: () => void refetch() }}
        />
      </>
    );
  return <ProfileBody profile={profile} />;
}

function ProfileBody({ profile }: { profile: Profile }) {
  const user = useUser();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const update = useUpdateProfile(user.id);
  const { data: zones } = useZones(user.id);
  const [name, setName] = useState(profile.display_name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [running, setRunning] = useState<WorkoutSessionRow | null>(null);
  /** which log out the M4 "A workout is running" dialog continues with */
  const [pendingEverywhere, setPendingEverywhere] = useState(false);
  const [askEverywhere, setAskEverywhere] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(profile.display_name), [profile.display_name]);

  const save = (patch: Parameters<typeof update.mutate>[0], ok?: string) =>
    update.mutate(patch, {
      onSuccess: () => ok && toast({ text: ok }),
      onError: () => toast({ text: "That didn't save. Try again." }),
    });

  const saveName = () => {
    const n = name.trim();
    if (n === profile.display_name) return;
    if (!n) return setNameError("Enter a name to show on the TV.");
    if (n.length > 40) return setNameError("Use 40 characters or fewer.");
    setNameError(null);
    save({ display_name: n }, "Name saved");
  };

  const signOut = async (everywhere: boolean) => {
    setBusy(true);
    clearDraft(user.id);
    await qc.cancelQueries();
    qc.clear();
    await api.auth.signOut({ everywhere });
    void navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  };

  const logOut = async (everywhere = false) => {
    // M4: never silently leave a workout running (handoff 4.2). A failed lookup is not
    // "nothing running": stop and say so instead of signing out.
    setBusy(true);
    let cur: WorkoutSessionRow | null;
    try {
      cur = await api.sessions.current();
    } catch {
      setBusy(false);
      toast({ text: "Couldn't check for a running workout. Check your connection and try again." });
      return;
    }
    setBusy(false);
    if (cur && cur.state !== "ended" && cur.state !== "preparing") {
      setPendingEverywhere(everywhere);
      return setRunning(cur);
    }
    if (cur && cur.state === "preparing") {
      await api.sessions
        .command({
          sessionId: cur.id,
          kind: "discard",
          expectedRevision: cur.revision,
          source: commandSource(),
        })
        .catch(() => null);
    }
    await signOut(everywhere);
  };

  const endThenLogOut = async () => {
    if (!running) return;
    setBusy(true);
    const r = await api.sessions
      .command({
        sessionId: running.id,
        kind: "end",
        expectedRevision: running.revision,
        source: commandSource(),
      })
      .catch(() => null);
    if (!r?.ok && r?.error !== "session_ended") {
      setBusy(false);
      toast({ text: "Couldn't end the workout. Check your connection and try again." });
      return;
    }
    setRunning(null);
    await signOut(pendingEverywhere);
  };

  const contacts = [user.email, user.phone]
    .filter((c): c is string => !!c)
    .map(maskContact)
    .join(" · ");

  return (
    <>
      <ScreenHeader title="Profile" back="/" />
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center gap-4">
            <span
              className="grid size-16 shrink-0 place-items-center rounded-full bg-surface-2 text-title1 font-bold"
              aria-hidden
            >
              {(profile.display_name.trim()[0] ?? "?").toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-title3 font-bold">{profile.display_name || "—"}</p>
              {contacts && <p className="truncate text-subhead text-text-2">{contacts}</p>}
              <p className="truncate text-subhead text-text-2">
                {profile.timezone.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          <Field
            className="mt-4"
            label="Name"
            htmlFor="profile-name"
            error={nameError}
            help="Shown on the shared TV. No surname needed."
          >
            <div className="flex gap-2">
              <TextInput
                id="profile-name"
                value={name}
                maxLength={40}
                autoComplete="nickname"
                invalid={!!nameError}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              {name.trim() !== profile.display_name && (
                <DButton variant="secondary" size="md" className="h-12 shrink-0" onClick={saveName}>
                  Save
                </DButton>
              )}
            </div>
          </Field>
        </Card>

        <Card>
          <div className="flex flex-col gap-1.5">
            <span className="text-subhead font-bold text-text-2">Units</span>
            <Segmented
              label="Units"
              value={profile.weight_unit}
              options={[
                { value: "lb", label: "Pounds (lb)" },
                { value: "kg", label: "Kilograms (kg)" },
              ]}
              onChange={(v) => v !== profile.weight_unit && save({ weight_unit: v })}
            />
          </div>
          <div className="mt-5 flex flex-col gap-1.5">
            <span className="text-subhead font-bold text-text-2">Weekly goal</span>
            <div className="flex flex-wrap items-center gap-3">
              <Stepper
                label="Weekly goal"
                value={profile.weekly_goal}
                min={1}
                max={14}
                onChange={(v) => save({ weekly_goal: v })}
              />
              <span className="text-subhead text-text-2">sessions per week</span>
            </div>
          </div>
          <Field
            className="mt-5"
            label="Timezone"
            htmlFor="profile-tz"
            help="Weeks run Monday–Sunday in this timezone."
          >
            <select
              id="profile-tz"
              aria-describedby="profile-tz-help"
              className={inputClass}
              value={profile.timezone}
              onChange={(e) => save({ timezone: e.target.value }, "Timezone saved")}
            >
              {timeZoneOptions(profile.timezone).map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
        </Card>

        <Link
          to="/profile/zones"
          className="press flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface p-4"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-headline font-bold">Heart-rate strap & zones</span>
            <span className="block text-subhead text-text-2">
              Strap not set up · Zones {zones?.confirmed_at ? "confirmed" : "not set"}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-text-2" aria-hidden />
        </Link>

        <Card>
          <Eyebrow className="mb-3">Devices signed in as you</Eyebrow>
          <DevicesList userId={user.id} />
        </Card>

        <Card>
          <DButton
            variant="secondary"
            size="md"
            className="w-full"
            icon={<LogOut className="size-4" aria-hidden />}
            loading={busy && !running && !askEverywhere}
            disabled={busy}
            onClick={() => void logOut()}
          >
            Log out
          </DButton>
          <p className="mt-2 text-footnote text-text-2">
            Log out ends this device's session. Your workouts stay in your account.
          </p>
          <DButton
            variant="quiet"
            size="md"
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => setAskEverywhere(true)}
          >
            Log out everywhere
          </DButton>
          <DButton
            variant="quiet"
            size="md"
            className="mt-2 w-full"
            onClick={() => setDeleting(true)}
          >
            Delete my data
          </DButton>
          <DButton
            variant="quiet"
            size="md"
            className="mt-2 w-full"
            onClick={() => setDeletingAccount(true)}
          >
            Delete account
          </DButton>
        </Card>
      </div>

      <ConfirmDialog
        open={!!running}
        title="A workout is running"
        cancelLabel="Cancel"
        confirmLabel="End and save, then continue"
        confirmVariant="primary"
        busy={busy}
        onCancel={() => setRunning(null)}
        onConfirm={() => void endThenLogOut()}
      >
        Ending saves everything so far. Cancel to go back to it.
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting}
        title="Delete your Dillan data?"
        cancelLabel="Cancel"
        confirmLabel="Delete my data"
        busy={busy}
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const r = await api.account.deleteMyData();
            clearDraft(user.id);
            clearLocalUserData(user.id);
            await qc.invalidateQueries({ queryKey: ["v1", user.id] });
            toast({ text: `Deleted ${r.templates} workouts and ${r.sessions} sessions` });
          } catch {
            toast({ text: "Nothing was deleted. Check your connection and try again." });
          } finally {
            setBusy(false);
            setDeleting(false);
          }
        }}
      >
        This permanently deletes your workouts, history, notes, heart-rate data, zones and TV
        approvals. Your sign-in and profile stay — use Delete account to remove those too. This
        can't be undone.
      </ConfirmDialog>

      <ConfirmDialog
        open={askEverywhere}
        title="Log out everywhere?"
        cancelLabel="Cancel"
        confirmLabel="Log out everywhere"
        busy={busy}
        onCancel={() => setAskEverywhere(false)}
        onConfirm={async () => {
          setAskEverywhere(false);
          await logOut(true);
        }}
      >
        This signs you out on every phone, computer and approved TV. Your workouts stay in your
        account.
      </ConfirmDialog>

      <ConfirmDialog
        open={deletingAccount}
        title="Delete your account?"
        cancelLabel="Cancel"
        confirmLabel="Delete account"
        busy={busy}
        onCancel={() => setDeletingAccount(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.account.deleteAccount();
          } catch {
            setBusy(false);
            setDeletingAccount(false);
            toast({ text: "Nothing was deleted. Check your connection and try again." });
            return;
          }
          clearDraft(user.id);
          clearLocalUserData(user.id);
          await qc.cancelQueries();
          qc.clear();
          void navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
        }}
      >
        This permanently deletes your account: your sign-in, name and settings, workouts, history,
        notes, heart-rate data, zones and TV approvals. Every device is signed out. This can't be
        undone.
      </ConfirmDialog>
    </>
  );
}
