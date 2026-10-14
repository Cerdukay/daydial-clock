# Public repository preparation

This preparation does not change GitHub visibility or rewrite published history.
Public source remains proprietary unless its owner explicitly changes licensing.

## Completed review (2026-10-14)

- Fetched reachable history: 24 commits, 446 unique Git blobs, 370 text blobs screened. No recognized private credential found. Four URL matches were Google Fonts stylesheet URLs, not login credentials.
- 22 indexed QA screenshots visually reviewed; only guest/demo/test content. Their indexed hashes match the reviewed files, and these are the 22 reachable historical root QA image blobs.
- 168 historical reminder jobs all stop before database access because DATABASE_URL is missing. Their logs do not establish a past customer-data leak.
- 28 existing iOS job logs screened and 11 Actions artifact ZIPs hash-matched and recursively inspected. No private signing key, P12, keystore or service-account file found. An IPA's embedded distribution provisioning profile is not its private signing key.
- Local Apple signing files are ignored and not indexed. Android signing files and release packages are excluded too.
- Public-safe reminder diagnostics now emit counts and fixed error codes; no account/event/reminder IDs, push-token suffixes or raw provider/DB/auth exceptions.

## Before publishing

1. Keep .env values, .apple-signing, keystores, .gplay account configuration, private operator notes, QA dumps and test outputs local. Ignore rules do not remove already tracked files or historical copies.
2. Run `npm run test:public` and `npm run check:public` after staging the intended source changes. This is a bounded pattern/path check, not a guarantee for every possible credential format.
3. Apply the curated preparation changes to the actual GitHub default and iOS release branches; do not push unrelated dirty-worktree changes. No force push, history rewrite or blanket `git add .`.
4. Verify the `ios-testflight` environment accepts only the release branch and, if available, requires an owner review. Leave the reminder workflow manual-only. Never enable `pull_request_target` execution of untrusted source with signing secrets.
5. Decide whether unreleased IPA/simulator artifacts and old logs should be visible. Current artifacts expire automatically after seven days (2026-10-17 through 2026-10-20). Do not delete them or alter access without a separate explicit decision.
6. Confirm the visibility change separately. Public access exposes all retained branches/history and readable CI output; hiding the repository later cannot revoke copies.

## Boundaries and limitations

No credential was used to test its validity. No workflow was dispatched, paid minutes used, artifacts deleted, or visibility changed. Binary executables/video, arbitrary encodings, deleted refs/old workflow attempts, live secret values and environment approval settings are not exhaustively audited. GitHub secrets are a separate store; public Firebase/Clerk configuration and service endpoints are not automatically privileged credentials.

Private App Store submission/release notes stay ignored because they contain operator contact information. GitHub history must remain intact for Lovable. A discovered historical credential would require revocation/rotation before any publication, not merely adding an ignore rule.
