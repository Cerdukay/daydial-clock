import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

if (process.argv[2] === "select") {
  const inventory = JSON.parse(
    execFileSync("xcrun", ["simctl", "list", "--json"], { encoding: "utf8" }),
  );
  const runtime = inventory.runtimes
    .filter((r) => r.isAvailable && /^iOS /.test(r.name) && Number(r.version.split(".")[0]) >= 26)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
  // Apple's required primary iPhone slot uses the large display set.
  const phone = ["iPhone 16 Pro Max", "iPhone 17 Pro Max", "iPhone 15 Pro Max"]
    .map((name) => inventory.devicetypes.find((d) => d.name === name))
    .find(Boolean);
  const tablet = inventory.devicetypes.find((d) => /^iPad Pro 13-inch/.test(d.name));
  if (!runtime || !phone || !tablet)
    throw new Error("Required iOS 26+ iPhone/iPad simulator types unavailable");
  console.log([runtime.identifier, phone.identifier, tablet.identifier].join("\t"));
  process.exit(0);
}
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() && !entry.name.endsWith(".xcresult")
      ? files(join(path, entry.name))
      : entry.isFile()
        ? [join(path, entry.name)]
        : [],
  );
}
function jpegSize(data) {
  if (data.readUInt16BE(0) !== 0xffd8) throw new Error("Not a JPEG");
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset++] !== 0xff) throw new Error("Invalid JPEG marker");
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = data.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2].includes(marker))
      return { height: data.readUInt16BE(offset + 3), width: data.readUInt16BE(offset + 5) };
    if (length < 2) throw new Error("Invalid JPEG segment");
    offset += length;
  }
  throw new Error("Missing JPEG frame");
}
if (process.argv[2] !== "verify" || !process.argv[3])
  throw new Error("Use select or verify <directory>");
const root = process.argv[3];
const screenshots = files(root)
  .filter((path) => /\.(jpe?g)$/i.test(path))
  .map((path) => {
    const bytes = readFileSync(path);
    const size = jpegSize(bytes);
    const family = path.includes("iphone-attachments") ? "iphone" : "ipad";
    const accepted = family === "iphone" ? ["1320x2868", "1290x2796"] : ["2064x2752", "2048x2732"];
    if (!accepted.includes(`${size.width}x${size.height}`))
      throw new Error(`Unsupported ${family} size: ${JSON.stringify(size)}`);
    return {
      file: relative(root, path),
      family,
      ...size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
for (const family of ["iphone", "ipad"]) {
  if (screenshots.filter((s) => s.family === family).length < 6)
    throw new Error(`Missing full ${family} screenshot set`);
}
const provenance = {
  sourceCommit: process.env.GITHUB_SHA,
  baseProductCommit: "87c692989cf821ff2ff8f7684d0a6da771635173",
  capture: "XCUIScreen on real iOS Simulator; no web viewport or composited UI",
  screenshots,
};
writeFileSync(join(root, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
console.log(JSON.stringify(provenance, null, 2));
