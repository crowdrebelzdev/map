"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type SetHeaderSlot = (content: ReactNode) => void;

const HeaderSlotContentContext = createContext<ReactNode>(null);
const HeaderSlotSetterContext = createContext<SetHeaderSlot | null>(null);

/** Wraps the events layout so a deeply nested page (e.g. the operational map) can
 * render something into the shared NavBar header without NavBar knowing about it. */
export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  return (
    <HeaderSlotSetterContext.Provider value={setContent}>
      <HeaderSlotContentContext.Provider value={content}>{children}</HeaderSlotContentContext.Provider>
    </HeaderSlotSetterContext.Provider>
  );
}

export function useHeaderSlotContent() {
  return useContext(HeaderSlotContentContext);
}

/** Renders `content` into the page header for as long as the calling component is mounted. */
export function useHeaderSlot(content: ReactNode) {
  const setContent = useContext(HeaderSlotSetterContext);
  useEffect(() => {
    setContent?.(content);
    return () => setContent?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setContent, content]);
}
