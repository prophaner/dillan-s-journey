// React Query hooks over useApi(). Keys start with the user id so one user's cache is never
// shown to another (sign-out also clears the whole cache).

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./client";
import type { Profile, ProfilePatch } from "./api";
import type { TemplateBody, WorkoutSessionRow, ZoneCutoffs } from "@/v1/core/types";
import { needsFinalize } from "@/v1/core/finalize";

export const qk = {
  profile: (uid: string) => ["v1", uid, "profile"] as const,
  zones: (uid: string) => ["v1", uid, "zones"] as const,
  templates: (uid: string) => ["v1", uid, "templates"] as const,
  template: (uid: string, id: string) => ["v1", uid, "template", id] as const,
  devices: (uid: string) => ["v1", uid, "devices"] as const,
  history: (uid: string) => ["v1", uid, "history"] as const,
  current: (uid: string) => ["v1", uid, "current"] as const,
  month: (uid: string, y: number, m: number) => ["v1", uid, "month", y, m] as const,
  session: (uid: string, id: string) => ["v1", uid, "session", id] as const,
  summary: (uid: string, id: string) => ["v1", uid, "summary", id] as const,
};

export function useProfile(uid: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.profile(uid), queryFn: () => api.profile.get() });
}

/**
 * Optimistic and serialized: the cache takes the patch the moment mutate() is called (so a second
 * tap on the weekly-goal stepper builds on the first), saves run one at a time in tap order, and
 * only the last one to finish writes the server's row back. A failure re-reads the profile.
 */
export function useUpdateProfile(uid: string) {
  const api = useApi();
  const qc = useQueryClient();
  const key = qk.profile(uid);
  const mutationKey = [...key, "update"] as const;
  const m = useMutation({
    mutationKey,
    scope: { id: `profile-update:${uid}` },
    mutationFn: (patch: ProfilePatch) => api.profile.update(patch),
    onSuccess: (p) => {
      if (qc.isMutating({ mutationKey }) <= 1) qc.setQueryData(key, p);
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const mutate: typeof m.mutate = (patch, opts) => {
    void qc.cancelQueries({ queryKey: key });
    qc.setQueryData<Profile>(key, (p) => (p ? applyProfilePatch(p, patch) : p));
    m.mutate(patch, opts);
  };
  return { ...m, mutate };
}

export function applyProfilePatch(p: Profile, patch: ProfilePatch): Profile {
  return {
    ...p,
    ...(patch.display_name !== undefined ? { display_name: patch.display_name.trim() } : {}),
    ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
    ...(patch.weight_unit !== undefined ? { weight_unit: patch.weight_unit } : {}),
    ...(patch.weekly_goal !== undefined ? { weekly_goal: patch.weekly_goal } : {}),
    ...(patch.complete_name_step
      ? { needs_name: !(patch.display_name ?? p.display_name).trim() }
      : {}),
  };
}

export function useZones(uid: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.zones(uid), queryFn: () => api.zones.get() });
}

export function useConfirmZones(uid: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: ZoneCutoffs) => api.zones.confirm(c),
    onSuccess: (z) => qc.setQueryData(qk.zones(uid), z),
  });
}

export function useTemplates(uid: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.templates(uid), queryFn: () => api.templates.list() });
}

export function useTemplate(uid: string, id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: qk.template(uid, id ?? "new"),
    queryFn: () => (id ? api.templates.get(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useSaveTemplate(uid: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string | null; body: TemplateBody; revision: number | null }) =>
      v.id && v.revision != null
        ? api.templates.update(v.id, v.body, v.revision)
        : api.templates.create(v.body),
    onSuccess: (t) => {
      qc.setQueryData(qk.template(uid, t.id), t);
      void qc.invalidateQueries({ queryKey: qk.templates(uid) });
    },
  });
}

export function useDevices(uid: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.devices(uid), queryFn: () => api.devices.list() });
}

export function useRevokeDevice(uid: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.devices.revoke(id),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.devices(uid) }),
  });
}

/**
 * The one unfinished session (preparing/active/paused), kept fresh by Realtime: the running-workout
 * banner and the recovery redirect read this.
 */
export function useCurrentSession(uid: string, opts: { pollMs?: number } = {}) {
  const api = useApi();
  const qc = useQueryClient();
  useEffect(
    () =>
      api.realtime.onSession(
        uid,
        (row) => {
          const cur = qc.getQueryData<WorkoutSessionRow | null>(qk.current(uid));
          if (row.state !== "ended") {
            if (!cur || cur.id !== row.id || row.revision >= cur.revision)
              qc.setQueryData(qk.current(uid), row);
          } else if (cur?.id === row.id) {
            qc.setQueryData(qk.current(uid), null);
            void qc.invalidateQueries({ queryKey: qk.history(uid) });
          }
        },
        // (Re)joined: changes made while the channel was down were not delivered.
        () => void qc.invalidateQueries({ queryKey: qk.current(uid) }),
      ),
    [api, qc, uid],
  );
  return useQuery({
    queryKey: qk.current(uid),
    queryFn: () => api.sessions.current(),
    refetchOnWindowFocus: true,
    // The TV passes a backstop poll: a visible Fire TV fires no focus/online event on a blip.
    ...(opts.pollMs ? { refetchInterval: opts.pollMs } : {}),
  });
}

/** Ended sessions for Home metrics (newest first; 5 weeks fit easily in 200). */
export function useHistory(uid: string) {
  const api = useApi();
  return useQuery({
    queryKey: qk.history(uid),
    queryFn: () => api.sessions.history({ limit: 200 }),
  });
}

export function useMonth(uid: string, y: number, m: number) {
  const api = useApi();
  return useQuery({ queryKey: qk.month(uid, y, m), queryFn: () => api.sessions.month(y, m) });
}

export function useSessionRow(uid: string, id: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.session(uid, id), queryFn: () => api.sessions.recover(id) });
}

/** The saved summary; a pending heart-rate summary is finalized on read (any viewer). */
export function useSummary(uid: string, id: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: qk.summary(uid, id),
    enabled,
    // Still finalizing (or finalize failed): check again instead of "Adding up…" forever. For
    // 2 min after End late relay readings may mark the summary dirty: re-read (and re-finalize).
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      if (d.hr_status === "pending") return 5_000;
      if (d.hr_status === "final" && Date.now() - Date.parse(d.ended_at) < 130_000) return 15_000;
      return false;
    },
    queryFn: async () => {
      const s = await api.sessions.summary(id);
      if (s && needsFinalize(s)) {
        try {
          return (await api.sessions.finalize(id)) ?? s;
        } catch {
          return s;
        }
      }
      return s;
    },
  });
}
