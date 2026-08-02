import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query from React.
 *
 * The in-game shell needs this for one thing CSS genuinely cannot do: chat is a
 * docked panel on desktop and a sheet on mobile, and it must exist exactly ONCE
 * in the tree — two mounted copies would double its unread bookkeeping and its
 * scroll effects. Everything else in the shell stays media-query CSS.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** The shell's one breakpoint: three columns at and above this width. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
