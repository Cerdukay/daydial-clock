import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

const HIDE_SETTLE_TIMEOUT_MS = 320;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/**
 * End the active WebView input session before unmounting a form route.
 *
 * Android can retain an inactive InputConnection when a focused input is
 * removed while the IME hide animation is still running. Repeating that cycle
 * eventually congests WebView's input and drawing queues. Blur first, ask the
 * native keyboard plugin to hide the IME, and wait briefly for its did-hide
 * signal before allowing navigation to unmount the editor.
 */
export async function dismissVirtualKeyboard(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (!Capacitor.isNativePlatform()) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return;
  }

  let didHide = false;
  const handle = await Keyboard.addListener("keyboardDidHide", () => {
    didHide = true;
  }).catch(() => null);

  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

  try {
    await Keyboard.hide();
  } catch {
    // The DOM blur above remains the safe fallback if a native bridge call fails.
  }

  for (let waited = 0; !didHide && waited < HIDE_SETTLE_TIMEOUT_MS; waited += 16) {
    await delay(16);
  }

  await handle?.remove().catch(() => undefined);
}
