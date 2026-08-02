"use client";

import { useEffect, useState } from "react";

/** True only after the first client-side render has committed — used to avoid a
 * hydration mismatch when a component's initial render depends on browser-only state
 * (e.g. localStorage-backed theme/locale). There's no way to know this during render
 * itself, so this can't be computed without an effect. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- inherent to the hydration-guard pattern, see comment above
  useEffect(() => setMounted(true), []);
  return mounted;
}
