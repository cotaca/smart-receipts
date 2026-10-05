import { readFileSync } from "fs";
import path from "path";
import { expect, it } from "vitest";

// Browsers parse an SVG favicon as strict XML and silently fall back to
// favicon.ico on any error -- e.g. a double hyphen inside a comment.
it("icon.svg is well-formed XML", () => {
  const svg = readFileSync(path.join(import.meta.dirname, "icon.svg"), "utf8");
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
});
