import { useEffect, useRef } from "react";

/**
 * Accessibility plumbing shared by every modal dialog:
 *   - moves keyboard focus into the dialog on open, and restores it to the
 *     element that had focus when the dialog closes;
 *   - traps Tab/Shift+Tab inside the dialog so focus can't wander to the
 *     (inert) page behind it;
 *   - calls `onClose` on Escape (when provided — forced-decision modals like
 *     the buy prompt pass no handler and so aren't dismissible).
 *
 * Returns a ref to spread onto the dialog container element.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose?: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Focus the first control (or the container itself) so screen readers land
    // inside the dialog instead of leaving focus on the triggering button.
    const initial = focusables()[0] ?? node;
    initial.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // Return focus to wherever it was, if that element is still around.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [onClose]);

  return ref;
}
