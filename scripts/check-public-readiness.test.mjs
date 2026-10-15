import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPublicFile } from "./check-public-readiness.mjs";

test("operator secrets, signing and generated outputs cannot be published", () => {
  for (const path of [
    ".env",
    "server/.env.production",
    ".apple-signing/key.p8",
    "android/keystore.properties",
    "release/app.aab",
    ".gplay/config.json",
    "qa-home.png",
    "test-results/.last-run.json",
    "docs/app-store-submission-draft.md",
  ]) {
    assert.equal(checkPublicFile(path, Buffer.from("{}"))[0].kind, "local-only-path", path);
  }
});

test("real credential patterns are reported without their values", () => {
  const token = ["ghp", "A".repeat(36)].join("_");
  const result = checkPublicFile("src/example.ts", Buffer.from(`line one\n${token}`));
  assert.deepEqual(result, [{ path: "src/example.ts", kind: "github-token", line: 2 }]);
  assert.ok(!JSON.stringify(result).includes(token));
});

test("public client configuration and demonstrable env placeholders are allowed", () => {
  const publicText =
    "VITE_CLERK_PUBLISHABLE_KEY=pk_test_example\nVITE_FIREBASE_API_KEY=AIza_public_client_config";
  assert.deepEqual(checkPublicFile(".env.example", Buffer.from(publicText)), []);
  assert.deepEqual(
    checkPublicFile(
      "server/.env.example",
      Buffer.from("DATABASE_URL=postgresql://<user>:<password>@<host>/<db>"),
    ),
    [],
  );
  assert.deepEqual(checkPublicFile("public/icon.png", Buffer.from([0, 1, 2])), []);
});
