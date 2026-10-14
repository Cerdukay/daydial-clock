import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function checkPublicFile(path, contents) {
  const problems = [];
  const localOnly =
    /(^|\/)(?:\.apple-signing|\.gplay|test-results|playwright-report|blob-report|qa|release|build|node_modules)(\/|$)|^qa-.*\.(png|txt)$|^\.claude\/scheduled_tasks\.lock$|^docs\/(?:private\/|app-store-(?:release-plan|submission-draft)\.md$)/i;
  const signing =
    /\.(?:p8|p12|pem|key|dpapi|jks|keystore|mobileprovision|ipa|apk|aab|xcarchive|xcresult)$/i;
  const env = /(^|\/)\.env(?:\.|$)/.test(path) && !/\.example$/.test(path);
  if (
    localOnly.test(path) ||
    signing.test(path) ||
    env ||
    /(^|\/)keystore\.properties$/.test(path)
  ) {
    problems.push({ path, kind: "local-only-path" });
  }
  if (!contents || contents.includes(0)) return problems;
  const text = contents.toString("utf8");
  const patterns = [
    ["private-key", /-{5}BEGIN (?:[A-Z0-9 ]* )?PRIVATE KEY-{5}/g],
    ["encoded-private-key", /LS0tLS1CRUdJTi[A-Za-z0-9+/=]{40,}/g],
    ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
    ["aws-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    [
      "private-api-key",
      /\b(?:sk_live_[A-Za-z0-9]{15,}|sk_test_[A-Za-z0-9]{15,}|sk-proj-[A-Za-z0-9_-]{20,})\b/g,
    ],
    [
      "credential-url",
      /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>:@]+:[^\s"'<>@]+@[^\s"'<>]+/g,
    ],
    ["service-account-private-key", /"private_key"\s*:\s*"[^"\r\n]{20,}"/g],
  ];
  for (const [kind, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      // Report only the rule/location, never the matched value or source line.
      problems.push({ path, kind, line: text.slice(0, match.index).split("\n").length });
    }
  }
  return problems;
}

export function checkPublicRepository(root = process.cwd()) {
  const entries = execFileSync("git", ["-C", root, "ls-files", "--stage", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d+) ([a-f0-9]+) (\d)\t(.*)$/s.exec(entry);
      if (!match || match[3] !== "0") throw new Error("Unmerged/invalid Git index");
      return { mode: match[1], oid: match[2], path: match[4] };
    });
  if (entries.some((entry) => entry.mode === "160000")) {
    throw new Error("Embedded repository/submodule needs a separate publication audit");
  }
  // Check indexed bytes too: a cleaned working file can still have a staged secret.
  const indexed = execFileSync("git", ["-C", root, "cat-file", "--batch"], {
    input: entries.map((entry) => entry.oid).join("\n") + "\n",
    maxBuffer: 64 * 1024 * 1024,
  });
  let offset = 0;
  const problems = entries.flatMap(({ path }) => {
    const headerEnd = indexed.indexOf(10, offset);
    const header = indexed.subarray(offset, headerEnd).toString("utf8").split(" ");
    const size = Number(header[2]);
    if (headerEnd < 0 || header[1] !== "blob" || !Number.isSafeInteger(size)) {
      throw new Error("Invalid Git blob response");
    }
    const data = indexed.subarray(headerEnd + 1, headerEnd + 1 + size);
    offset = headerEnd + size + 2;
    const stagedProblems = checkPublicFile(path, data).map((problem) => ({
      ...problem,
      source: "index",
    }));
    try {
      return stagedProblems.concat(
        checkPublicFile(path, readFileSync(resolve(root, path))).map((problem) => ({
          ...problem,
          source: "working-tree",
        })),
      );
    } catch {
      return stagedProblems.concat({ path, kind: "unreadable-tracked-file" });
    }
  });
  return { filesChecked: entries.length, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = checkPublicRepository();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.problems.length ? 1 : 0;
  } catch {
    console.error("Public-readiness check failed; verify Git and the working directory.");
    process.exitCode = 1;
  }
}
