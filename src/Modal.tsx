import { useEffect, useRef, type ReactNode } from "react";

const focusable = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]';

/** Native top-layer dialogs also make the embedding host inert.
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
 * https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
 */
export default function Modal({ children, labelledBy, describedBy, className = "", busy = false, onClose, testId, activityType }: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  busy?: boolean;
  onClose: () => void;
  testId?: string;
  activityType?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    // jsdom has no top layer; the fallback also permits isolated DOM tests.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    (dialog.querySelector<HTMLElement>("[data-initial-focus]") || dialog.querySelector<HTMLElement>(focusable) || dialog).focus();
    return () => {
      if (typeof dialog.close === "function") dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return (
    <dialog ref={ref} className={`confirm-dialog ${className}`} tabIndex={-1}
      role="dialog" aria-modal="true" aria-labelledby={labelledBy}
      aria-describedby={describedBy} aria-busy={busy || undefined} data-testid={testId} data-activity-type={activityType}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); if (!busy) onClose(); }
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(focusable))
          .filter((element) => !element.closest("[hidden]"));
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { event.preventDefault(); event.currentTarget.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
    >{children}</dialog>
  );
}
