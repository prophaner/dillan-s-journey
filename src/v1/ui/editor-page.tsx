import { useProfile, useTemplate, useTemplates } from "@/v1/data/queries";
import { useUser } from "./user-context";
import { WorkoutEditor } from "./workout-editor";
import { ScreenHeader } from "@/components/dillan/app-shell";
import { ScreenState } from "@/components/dillan/surfaces";

/** Loads what S06 needs, then mounts the editor once (so a restored draft isn't overwritten). */
export function EditorPage({ templateId }: { templateId: string | null }) {
  const user = useUser();
  const profile = useProfile(user.id);
  const list = useTemplates(user.id);
  const one = useTemplate(user.id, templateId);

  const loading = profile.isLoading || list.isLoading || (templateId && one.isLoading);
  if (loading) return <ScreenState kind="loading" />;
  if (profile.isError || list.isError || one.isError)
    return (
      <>
        <ScreenHeader title="Workout" back="/program" />
        <ScreenState
          kind="failed"
          title="Couldn't load this workout"
          body="Check your connection and try again."
        />
      </>
    );
  const t = templateId ? (one.data ?? null) : null;
  if (templateId && (!t || t.deleted_at))
    return (
      <>
        <ScreenHeader title="Workout" back="/program" />
        <ScreenState
          kind="empty"
          title="This workout isn't available"
          body="It may have been deleted on another device."
        />
      </>
    );
  const otherNames = (list.data ?? []).filter((x) => x.id !== templateId).map((x) => x.name);
  return (
    <WorkoutEditor
      key={templateId ?? "new"}
      userId={user.id}
      template={t}
      otherNames={otherNames}
      unit={profile.data?.weight_unit ?? "lb"}
    />
  );
}
