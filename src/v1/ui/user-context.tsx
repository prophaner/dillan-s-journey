import { createContext, useContext, type ReactNode } from "react";
import type { AuthUser } from "@/v1/data/api";

const Ctx = createContext<AuthUser | null>(null);

/** The signed-in user, provided by the /_authenticated layout. */
export function UserProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export function useUser(): AuthUser {
  const u = useContext(Ctx);
  if (!u) throw new Error("useUser() outside the signed-in layout");
  return u;
}
