// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("route blew up");
  return <p>screen content</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React re-logs the caught error; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("shows the fallback when a child throws", () => {
    render(
      <ErrorBoundary resetKey="/auth">
        <Boom explode />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.queryByText("screen content")).toBeNull();
  });

  it("clears the error when resetKey changes, so navigating away recovers", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/auth">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();

    rerender(
      <ErrorBoundary resetKey="/">
        <Boom explode={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("screen content")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("keeps the fallback while resetKey stays the same", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/auth">
        <Boom explode />
      </ErrorBoundary>,
    );

    rerender(
      <ErrorBoundary resetKey="/auth">
        <Boom explode={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });
});
