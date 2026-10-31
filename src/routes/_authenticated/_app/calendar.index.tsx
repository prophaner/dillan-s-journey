import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage, parseCalendarSearch } from "@/v1/ui/calendar-page";

// S12 Calendar: ?month=YYYY-MM&day=YYYY-MM-DD
export const Route = createFileRoute("/_authenticated/_app/calendar/")({
  head: () => ({ meta: [{ title: "Calendar · Dillan" }] }),
  validateSearch: parseCalendarSearch,
  component: CalendarRoute,
});

function CalendarRoute() {
  const search = Route.useSearch();
  return <CalendarPage month={search.month} day={search.day} />;
}
