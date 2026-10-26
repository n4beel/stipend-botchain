import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

function findTsxFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "__tests__" || entry === "test") continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...findTsxFiles(full));
    } else if (full.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

describe("CSS tokens", () => {
  it("defines every var(--x) without fallback used in app/ and components/", () => {
    const root = process.cwd();
    const cssPath = join(root, "app/globals.css");
    const layoutPath = join(root, "app/layout.tsx");

    const cssContent = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
    const layoutContent = existsSync(layoutPath) ? readFileSync(layoutPath, "utf8") : "";

    const defined = new Set<string>();
    for (const match of cssContent.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) {
      defined.add(match[1]);
    }
    for (const match of layoutContent.matchAll(/variable:\s*["'](--[A-Za-z0-9-]+)["']/g)) {
      defined.add(match[1]);
    }

    const files = [
      ...findTsxFiles(join(root, "components")),
      ...findTsxFiles(join(root, "app")),
    ];

    const undefinedTokens: Record<string, string[]> = {};
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(/var\((--[A-Za-z0-9-]+)\s*(,[^)]*)?\)/g)) {
        if (match[2] === undefined) {
          const token = match[1];
          if (!defined.has(token)) {
            undefinedTokens[token] = undefinedTokens[token] ?? [];
            undefinedTokens[token].push(file);
          }
        }
      }
    }

    expect(undefinedTokens).toEqual({});
  });
});
