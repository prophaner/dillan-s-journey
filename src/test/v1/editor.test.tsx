import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setApiForTests } from "@/v1/data/client";
import { createMockApi } from "@/v1/data/mock-api";
import { MOCK_LUIS, seedMockDb } from "@/v1/data/mock-fixtures";
import { UserProvider } from "@/v1/ui/user-context";
import { EditorPage } from "@/v1/ui/editor-page";
import {
  draftKey,
  newDraft,
  patchExercise,
  readDraft,
  setName,
  writeDraft,
} from "@/v1/ui/editor-model";
import { EDITOR_COPY } from "@/v1/ui/workout-editor";
import { ToastProvider } from "@/components/dillan/overlays";

type Api = ReturnType<typeof createMockApi>;
let api: Api;

beforeEach(async () => {
  localStorage.clear();
  api = createMockApi({ storage: null, db: seedMockDb() });
  await api.auth.verifyOtp("email", "luis@example.com", "123456");
  setApiForTests(api);
});

afterEach(() => {
  cleanup();
  setApiForTests(null);
  localStorage.clear();
});

function renderAt(entries: string[], browser = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = { id: MOCK_LUIS, email: "luis@example.com", phone: null };
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <UserProvider user={user}>
            <Outlet />
          </UserProvider>
        </ToastProvider>
      </QueryClientProvider>
    ),
  });
  const program = createRoute({
    getParentRoute: () => root,
    path: "/program",
    component: () => <p>Program list</p>,
  });
  const add = createRoute({
    getParentRoute: () => root,
    path: "/program/new",
    component: () => <EditorPage templateId={null} />,
  });
  const edit = createRoute({
    getParentRoute: () => root,
    path: "/program/$id",
    component: function Edit() {
      const { id } = edit.useParams();
      return <EditorPage templateId={id} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([program, add, edit]),
    history: browser ? createBrowserHistory() : createMemoryHistory({ initialEntries: entries }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement;

describe("S06 workout editor", () => {
  it("opens new with Name focused and one blank exercise; empty Save focuses Name with the error (acceptance 12)", async () => {
    renderAt(["/program/new"]);
    const name = await screen.findByLabelText("Workout name");
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(screen.getAllByText(/^Exercise \d$/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(await screen.findByText("Give this workout a name.")).toBeInTheDocument();
    expect(screen.getByText("Exercise needs a name.")).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name).toHaveAttribute("aria-invalid", "true");
  });

  it("uses the core field rules and messages", async () => {
    renderAt(["/program/new"]);
    await screen.findByLabelText("Workout name");
    fireEvent.change(byId("ed-name"), { target: { value: "Legs" } });
    fireEvent.change(byId("ed-blocks.0.exercise.name"), { target: { value: "Squat" } });
    fireEvent.change(byId("ed-blocks.0.sets"), { target: { value: "25" } });
    fireEvent.change(byId("ed-blocks.0.exercise.reps"), { target: { value: "0" } });
    fireEvent.change(byId("ed-blocks.0.rest_s"), { target: { value: "700" } });
    fireEvent.change(byId("ed-blocks.0.exercise.weight"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(await screen.findByText("Whole number, 1 to 20.")).toBeInTheDocument();
    expect(screen.getByText("Whole number, 1 to 200.")).toBeInTheDocument();
    expect(screen.getByText("Seconds, 0 to 600.")).toBeInTheDocument();
    expect(screen.getByText("Choose Per implement or Total load.")).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(byId("ed-blocks.0.sets")));
    // fixing a field clears its error live
    fireEvent.change(byId("ed-blocks.0.sets"), { target: { value: "4" } });
    expect(screen.queryByText("Whole number, 1 to 20.")).toBeNull();
  });

  it("warns (but allows) a duplicate workout name", async () => {
    renderAt(["/program/new"]);
    await screen.findByLabelText("Workout name");
    fireEvent.change(byId("ed-name"), { target: { value: "  upper body a " } });
    expect(screen.getByText(EDITOR_COPY.duplicate)).toBeInTheDocument();
  });

  it("saves a superset: Set type → Superset joins a new member; rounds and rest live on the group", async () => {
    const router = renderAt(["/program/new"]);
    await screen.findByLabelText("Workout name");
    fireEvent.change(byId("ed-name"), { target: { value: "Arms" } });
    fireEvent.change(byId("ed-blocks.0.exercise.name"), { target: { value: "Curl" } });
    fireEvent.click(screen.getByRole("radio", { name: "Superset" }));
    expect(await screen.findByText("Superset A · 3 rounds")).toBeInTheDocument();
    fireEvent.change(byId("ed-blocks.0.exercises.1.name"), { target: { value: "Press" } });
    fireEvent.change(byId("ed-blocks.0.exercises.1.weight"), { target: { value: "20" } });
    fireEvent.click(screen.getAllByRole("radio", { name: "Per implement" })[0]!);
    fireEvent.change(byId("ed-blocks.0.rounds"), { target: { value: "4" } });
    fireEvent.change(byId("ed-blocks.0.rest_s"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(await screen.findByText("Program list")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/program");
    const saved = (await api.templates.list()).find((t) => t.name === "Arms")!;
    expect(saved.blocks).toHaveLength(1);
    const b = saved.blocks[0]!;
    expect(b.type).toBe("superset");
    if (b.type === "superset") {
      expect(b.rounds).toBe(4);
      expect(b.rest_s).toBe(90);
      expect(b.exercises.map((e) => e.name)).toEqual(["Curl", "Press"]);
      expect(b.exercises[0]!.weight).toBeNull();
      expect(b.exercises[1]).toMatchObject({ weight: 20, load_basis: "per_implement", unit: "lb" });
    }
    expect(localStorage.getItem(draftKey(MOCK_LUIS))).toBeNull();
  });

  it("superset member labels are never truncated (acceptance 36)", async () => {
    renderAt(["/program/new"]);
    await screen.findByLabelText("Workout name");
    fireEvent.click(screen.getByRole("radio", { name: "Superset" }));
    const label = await screen.findByText("Superset A1");
    expect(label.className).not.toMatch(/truncate|text-ellipsis/);
    expect(label.parentElement?.className).toMatch(/flex-wrap/);
  });

  it("a missing load basis focuses a named radio that carries the error", async () => {
    renderAt(["/program/new"]);
    await screen.findByLabelText("Workout name");
    fireEvent.change(byId("ed-name"), { target: { value: "Legs" } });
    fireEvent.change(byId("ed-blocks.0.exercise.name"), { target: { value: "Squat" } });
    fireEvent.change(byId("ed-blocks.0.exercise.weight"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await screen.findByText("Choose Per implement or Total load.");
    await waitFor(() => expect(document.activeElement?.getAttribute("role")).toBe("radio"));
    const group = document.activeElement!.closest('[role="radiogroup"]')!;
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleName("Load basis");
    const err = document.getElementById(group.getAttribute("aria-describedby")!);
    expect(err).toHaveTextContent("Choose Per implement or Total load.");
  });

  it("inputs only point aria-describedby at help or error text that exists", async () => {
    renderAt(["/program/new"]);
    await screen.findByLabelText("Workout name");
    for (const el of document.querySelectorAll("[aria-describedby]"))
      for (const id of el.getAttribute("aria-describedby")!.split(" "))
        expect(document.getElementById(id), id).not.toBeNull();
  });

  it("Discard on a restored draft takes the current revision (no false conflict on save)", async () => {
    const [t] = await api.templates.list();
    writeDraft({
      v: 1,
      userId: MOCK_LUIS,
      templateId: t!.id,
      baseRevision: t!.revision,
      draft: setName(newDraft("lb"), "Old draft"),
      savedAt: Date.now(),
    });
    // saved on another device after the draft was written
    await api.templates.update(t!.id, { name: "Newer", blocks: t!.blocks }, t!.revision);
    renderAt([`/program/${t!.id}`]);
    expect(await screen.findByText(EDITOR_COPY.restored)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(byId("ed-name").value).toBe("Newer"));
    fireEvent.change(byId("ed-name"), { target: { value: "Newer 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(await screen.findByText("Program list")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((await api.templates.get(t!.id))?.name).toBe("Newer 2");
  });

  it("autosaves the draft per user and restores it after a reload", async () => {
    renderAt(["/program/new"]);
    await screen.findByLabelText("Workout name");
    fireEvent.change(byId("ed-name"), { target: { value: "Push day" } });
    const stored = readDraft(MOCK_LUIS);
    expect(stored?.templateId).toBeNull();
    expect(stored?.draft.name).toBe("Push day");
    cleanup();

    renderAt(["/program/new"]);
    expect(await screen.findByText(EDITOR_COPY.restored)).toBeInTheDocument();
    expect(byId("ed-name").value).toBe("Push day");
  });

  it("restores a draft of an existing workout only for that workout", async () => {
    const [t] = await api.templates.list();
    let d = setName(newDraft("lb"), "Changed elsewhere");
    d = patchExercise(d, 0, 0, { name: "Row" });
    writeDraft({
      v: 1,
      userId: MOCK_LUIS,
      templateId: t!.id,
      baseRevision: t!.revision,
      draft: d,
      savedAt: Date.now(),
    });
    renderAt([`/program/${t!.id}`]);
    expect(await screen.findByText(EDITOR_COPY.restored)).toBeInTheDocument();
    expect(byId("ed-name").value).toBe("Changed elsewhere");
    cleanup();
    renderAt(["/program/new"]);
    await screen.findByLabelText("Workout name");
    expect(screen.queryByText(EDITOR_COPY.restored)).toBeNull();
  });

  it("Back with unsaved changes asks Discard changes? with Keep editing focused (acceptance 16)", async () => {
    // real browser history so Back arrives as popstate, like the phone's Back button
    window.history.replaceState(null, "", "/program");
    const router = renderAt([], true);
    await screen.findByText("Program list");
    await act(async () => {
      await router.navigate({ to: "/program/new" });
    });
    await screen.findByLabelText("Workout name");
    fireEvent.change(byId("ed-name"), { target: { value: "Half done" } });
    await act(async () => {
      window.history.back();
    });
    const dialog = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    expect(dialog).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(byId("ed-name").value).toBe("Half done");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("alertdialog", { name: "Discard changes?" });
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByText("Program list")).toBeInTheDocument();
    expect(readDraft(MOCK_LUIS)).toBeNull();
  });

  it("another device saved first: says so and loads the latest version", async () => {
    const [t] = await api.templates.list();
    renderAt([`/program/${t!.id}`]);
    await screen.findByDisplayValue(t!.name);
    // another device saves a new revision
    await api.templates.update(
      t!.id,
      { name: "Renamed on TV phone", blocks: t!.blocks },
      t!.revision,
    );
    fireEvent.change(byId("ed-name"), { target: { value: "My edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Changed on another device" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load the latest version" }));
    await waitFor(() => expect(byId("ed-name").value).toBe("Renamed on TV phone"));
    fireEvent.change(byId("ed-name"), { target: { value: "Final" } });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(await screen.findByText("Program list")).toBeInTheDocument();
    expect((await api.templates.get(t!.id))?.name).toBe("Final");
  });

  it('soft-deletes behind Delete "{name}"? with Cancel focused', async () => {
    const [t] = await api.templates.list();
    renderAt([`/program/${t!.id}`]);
    await screen.findByDisplayValue(t!.name);
    fireEvent.click(screen.getByRole("button", { name: "Delete workout" }));
    await screen.findByRole("alertdialog", { name: `Delete "${t!.name}"?` });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    const confirm = screen.getAllByRole("button", { name: "Delete workout" }).at(-1)!;
    fireEvent.click(confirm);
    expect(await screen.findByText("Program list")).toBeInTheDocument();
    expect((await api.templates.get(t!.id))?.deleted_at).toBeTruthy();
  });
});
