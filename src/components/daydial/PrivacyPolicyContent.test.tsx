// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrivacyPolicyContent } from "./PrivacyPolicyContent";

afterEach(cleanup);

describe("edition-specific privacy policy", () => {
  it("describes the guest edition without claiming cloud collection or account deletion", () => {
    render(<PrivacyPolicyContent accountFeaturesEnabled={false} />);
    expect(
      screen.getByText(/Account sign-in, cloud synchronization and server push are not enabled/),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Optional account services" })).toBeNull();
    expect(screen.getByText(/This edition bundles its typefaces inside the app/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "palamutapp@gmail.com" }).getAttribute("href")).toBe(
      "mailto:palamutapp@gmail.com",
    );
    expect(screen.queryByText(/delete your account.*Settings/)).toBeNull();
  });

  it("discloses optional providers only when account features are configured", () => {
    render(<PrivacyPolicyContent accountFeaturesEnabled />);
    expect(screen.getByRole("region", { name: "Optional account services" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clerk" }).getAttribute("href")).toBe(
      "https://clerk.com/privacy",
    );
    expect(screen.getByText(/There is currently no in-app account deletion button/)).toBeTruthy();
  });
});
