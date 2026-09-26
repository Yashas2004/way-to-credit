import { useEffect } from "react";

/**
 * Selects the type scale (see index.css). Set on <html>, not on the shell's
 * own element, so portalled modals and drawers inherit it. Comfortable is
 * the default when no shell has claimed the page.
 */
export function useDensity(density: "compact" | "comfortable") {
  useEffect(() => {
    if (density !== "compact") return;
    const root = document.documentElement;
    root.classList.add("density-compact");
    return () => {
      root.classList.remove("density-compact");
    };
  }, [density]);
}
