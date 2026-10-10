import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Capacitor writes Windows separators into Swift string literals during sync.
// Keep this generated package usable on both Windows and the macOS build host.
const packagePath = fileURLToPath(new URL("../ios/App/CapApp-SPM/Package.swift", import.meta.url));
const source = readFileSync(packagePath, "utf8");
const normalized = source.replace(
  /path: "([^"]+)"/g,
  (_match, path) => `path: "${path.replaceAll("\\", "/")}"`,
);
if (normalized !== source) writeFileSync(packagePath, normalized);
console.log("iOS Swift package paths use portable separators.");
