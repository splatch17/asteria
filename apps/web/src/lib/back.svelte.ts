/**
 * Android and browser back for the app's layers (#176), over lib/back-stack.ts: one history entry
 * per sheet, line or screen open; back closes the one on top.
 */
import { BACK_STATE, BackStack } from "./back-stack";

let stack: BackStack | null = null;

function backStack(): BackStack {
  if (stack) return stack;
  stack = new BackStack(history);
  const s = stack;
  addEventListener("popstate", () => s.onPop());
  // A reload while layers were open leaves their entries: step back over them first, so that
  // back does not seem to do nothing.
  const depth = (history.state as Record<string, unknown> | null)?.[BACK_STATE];
  if (typeof depth === "number" && depth > 0) s.rewind(depth);
  return s;
}

/**
 * In a component's script: while `isOpen()` holds, the layer `id` has a history entry, and back
 * calls `close` (which must make `isOpen()` false). Closed any other way, the entry is taken back.
 */
export function historyLayer(id: string, isOpen: () => boolean, close: () => void): void {
  $effect(() => {
    if (!isOpen()) return;
    const s = backStack();
    s.open(id, close);
    return () => s.closed(id);
  });
}
