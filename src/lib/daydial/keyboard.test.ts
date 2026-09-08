// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  addListener: vi.fn(),
  hide: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock("@capacitor/keyboard", () => ({
  Keyboard: {
    addListener: mocks.addListener,
    hide: mocks.hide,
  },
}));

import { dismissVirtualKeyboard } from "./keyboard";

describe("dismissVirtualKeyboard", () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReset().mockReturnValue(false);
    mocks.addListener.mockReset();
    mocks.hide.mockReset();
    mocks.remove.mockReset().mockImplementation(async () => undefined);
    document.body.replaceChildren();
  });

  it("blurs the active input without calling native APIs on the web", async () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    await dismissVirtualKeyboard();

    expect(document.activeElement).not.toBe(input);
    expect(mocks.hide).not.toHaveBeenCalled();
  });

  it("waits for Android keyboard dismissal and removes its listener", async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    let notifyDidHide: (() => void) | undefined;
    mocks.addListener.mockImplementation(async (_eventName, listener: () => void) => {
      notifyDidHide = listener;
      return { remove: mocks.remove };
    });
    mocks.hide.mockImplementation(async () => notifyDidHide?.());

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    await dismissVirtualKeyboard();

    expect(document.activeElement).not.toBe(input);
    expect(mocks.hide).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
});
