import type { ReactNode } from "react";
import { Card, PageHeader, ScreenState } from "./surfaces";

/** Phase 0 placeholder: real shell, honest empty state. */
export function PlaceholderPage({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div>
      <PageHeader title={title} />
      <Card className="mt-6">
        <ScreenState kind="empty" body={body} />
      </Card>
      {children}
    </div>
  );
}
