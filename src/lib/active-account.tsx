import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const KEY = "trade-os:active-account";

type Ctx = { activeId: string | null; setActive: (id: string) => void };
const AccountCtx = createContext<Ctx>({ activeId: null, setActive: () => {} });

export function ActiveAccountProvider({ children, defaultId }: { children: ReactNode; defaultId?: string | null }) {
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return defaultId ?? null;
    return localStorage.getItem(KEY) || defaultId || null;
  });
  useEffect(() => {
    if (!activeId && defaultId) setActiveId(defaultId);
  }, [defaultId, activeId]);
  const value = useMemo<Ctx>(() => ({
    activeId,
    setActive: (id: string) => {
      localStorage.setItem(KEY, id);
      setActiveId(id);
    },
  }), [activeId]);
  return <AccountCtx.Provider value={value}>{children}</AccountCtx.Provider>;
}

export function useActiveAccountId() {
  return useContext(AccountCtx);
}