import { useEffect, useId, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "../hooks/useDialog";
import { waitingLabel } from "../lib/sheetQueue";

/**
 * The one modal primitive (redesign step B4a · spec §2 "Modal system").
 *
 * <600px it is a bottom sheet: drag handle, 88svh cap, scrolling body and a
 * pinned action footer that clears the home indicator. ≥600px the same markup
 * becomes a centered dialog at 420 / 560 / 720.
 *
 * Two levels:
 *   info     — scrim-dismissible, Esc closes, shows an ✕.
 *   decision — none of that. The player must answer with a button. This is
 *              deliberate: auctions and chaos events are on a server clock, and
 *              a stray backdrop tap must not silently forfeit money.
 *
 * The countdown is CSS-driven. React sets two custom properties once per
 * deadline and the browser animates the bar; a rAF loop pokes the seconds
 * readout straight into the DOM. Nothing here re-renders per tick.
 */

export type SheetLevel = "decision" | "info";
export type SheetWidth = 420 | 560 | 720;

interface SheetProps {
  level: SheetLevel;
  open: boolean;
  /** Required for level="info"; ignored for level="decision". */
  onClose?: () => void;
  title: string;
  /** Rendered next to the title — the deed sheet's zone chip, for instance. */
  titleAdornment?: ReactNode;
  maxWidth?: SheetWidth;
  /** Epoch ms the server timer expires at. Omit for untimed sheets. */
  deadline?: number | null;
  /**
   * Full duration of that timer, so the bar starts part-drained on a late join.
   * When omitted the remaining time at mount is treated as the whole bar.
   */
  countdownMs?: number | null;
  /** Decisions queued behind this one → the "N waiting" header chip. */
  waiting?: number;
  /** Pinned, non-scrolling action row. */
  footer?: ReactNode;
  /**
   * How the footer arranges its buttons: one per row (default), two side by
   * side, or a full-width lead action above a pair.
   */
  footerLayout?: "stack" | "split" | "lead";
  children: ReactNode;
}

const FOOTER_LAYOUT: Record<"stack" | "split" | "lead", string> = {
  stack: "",
  split: " v2-sh-foot-2",
  lead: " v2-sh-foot-2 v2-sh-foot-3",
};

// Body scroll lock is refcounted: an info sheet closing must not unlock the
// page while a decision sheet is still up.
let scrollLocks = 0;

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    scrollLocks += 1;
    document.body.classList.add("v2-sh-locked");
    return () => {
      scrollLocks -= 1;
      if (scrollLocks <= 0) {
        scrollLocks = 0;
        document.body.classList.remove("v2-sh-locked");
      }
    };
  }, [active]);
}

/**
 * Ticks the "12s" readout without touching React state. Writes textContent and
 * an `data-urgent` flag directly, once a second, and stops at zero.
 */
function useCountdownText(ref: React.RefObject<HTMLSpanElement>, deadline: number | null) {
  useEffect(() => {
    const node = ref.current;
    if (!node || !deadline) return;
    let raf = 0;
    let lastShown = -1;

    const paint = () => {
      const msLeft = Math.max(0, deadline - Date.now());
      const secs = Math.ceil(msLeft / 1000);
      if (secs !== lastShown) {
        lastShown = secs;
        node.textContent = secs > 0 ? `${secs}s` : "time up";
        node.dataset.urgent = secs <= 3 ? "true" : "false";
      }
      if (msLeft > 0) raf = requestAnimationFrame(paint);
    };

    paint();
    return () => cancelAnimationFrame(raf);
  }, [ref, deadline]);
}

/**
 * `open` gates the whole component rather than a branch inside it, so every
 * effect below (focus trap, scroll lock, countdown) mounts and unmounts with
 * the sheet. This matters because of the queue: a sheet can render closed while
 * it waits its turn, and useDialog only arms its trap on mount — hoisting these
 * hooks above an `if (!open)` would leave a queued-then-promoted sheet with no
 * focus trap at all.
 */
export default function Sheet(props: SheetProps) {
  if (!props.open || typeof document === "undefined") return null;
  return <SheetInner {...props} />;
}

function SheetInner({
  level,
  onClose,
  title,
  titleAdornment,
  maxWidth = 560,
  deadline = null,
  countdownMs = null,
  waiting = 0,
  footer,
  footerLayout = "stack",
  children,
}: SheetProps) {
  const titleId = useId();
  const secsRef = useRef<HTMLSpanElement>(null);
  const dismissible = level === "info" && !!onClose;

  useScrollLock(true);
  useCountdownText(secsRef, deadline);

  // Esc only for dismissible sheets — useDialog wires the key handler solely
  // when it is handed an onClose, so a decision sheet passing undefined here is
  // what makes it Esc-proof.
  const dialogRef = useDialog<HTMLDivElement>(dismissible ? onClose : undefined);

  // Countdown geometry, computed once per deadline rather than per frame:
  // where the bar starts (0–1) and how long it has left to drain.
  let barStyle: CSSProperties | undefined;
  if (deadline) {
    const msLeft = Math.max(0, deadline - Date.now());
    const total = countdownMs && countdownMs > 0 ? countdownMs : msLeft || 1;
    barStyle = {
      "--sh-cd-from": String(Math.max(0, Math.min(1, msLeft / total))),
      "--sh-cd-dur": `${msLeft}ms`,
    } as CSSProperties;
  }

  const waitingText = waitingLabel(waiting);

  return createPortal(
    <div className="v2-sh-scrim" data-level={level} onClick={dismissible ? onClose : undefined}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="v2-sh"
        data-w={maxWidth}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="v2-sh-grip" aria-hidden="true" />

        <div className="v2-sh-head">
          {deadline ? (
            // Keyed on the deadline so a re-armed timer restarts the animation
            // instead of resuming a stale one.
            <div className="v2-sh-cd" key={deadline}>
              <i className="v2-sh-cd-bar" style={barStyle} />
            </div>
          ) : null}

          <div className="v2-sh-headrow">
            <h2 className="v2-sh-title" id={titleId}>
              {title}
            </h2>
            {titleAdornment}
            <span className="v2-sh-headend">
              {deadline ? <span className="v2-sh-secs" ref={secsRef} aria-hidden="true" /> : null}
              {waitingText ? <span className="v2-sh-waiting">{waitingText}</span> : null}
              {dismissible ? (
                <button className="v2-sh-x" onClick={onClose} aria-label="Close">
                  ✕
                </button>
              ) : null}
            </span>
          </div>
        </div>

        <div className="v2-sh-body">{children}</div>

        {footer ? <div className={`v2-sh-foot${FOOTER_LAYOUT[footerLayout]}`}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
