import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import ts from "typescript";

/**
 * A whole hook result must never appear in a dependency array.
 *
 * `useReadContract`, `useWaitForTransactionReceipt` and friends return a fresh object on every
 * render. Listing one in a `useEffect` dependency array makes that effect run on every render; if
 * the effect sets any state, the render loop never terminates and React eventually throws
 * "Maximum update depth exceeded" — pointing at whichever provider happened to be holding the
 * state, not at the file responsible.
 *
 * This shipped in SealForm and reached a real wallet. `react-hooks/exhaustive-deps` does not help:
 * it *requires* the identifier to be listed, because the effect genuinely uses it. The fix is
 * always to depend on the specific field or function — `existing.data`, `existing.refetch` — and
 * never on the wrapper.
 *
 * It runs the real TypeScript type checker rather than matching names, because the distinction
 * that matters is whether the value has a stable identity. `useChainId()` returns a number and is
 * perfectly safe in a dependency array; `useReadContract()` returns an object and is not. A
 * name-based rule cannot tell those apart.
 *
 * Opt out on the declaration's line with `// stable-hook-result`.
 */

const ROOTS = ["components/", "app/", "lib/"];
const OPT_OUT = "stable-hook-result";

/** React's own hooks already guarantee a stable identity, so a bare binding from one is fine. */
const STABLE_HOOKS = new Set([
  "useCallback",
  "useMemo",
  "useRef",
  "useId",
  "useContext",
  "useReducer",
  "useState",
  "useTransition",
  "useDeferredValue",
]);

const DEPS_TAKING_HOOKS = new Set(["useEffect", "useLayoutEffect", "useMemo", "useCallback"]);

/** Flags for values compared by value, which therefore have no identity to churn. */
const PRIMITIVE =
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.StringLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Void |
  ts.TypeFlags.Never;

type Offence = { file: string; line: number; name: string; hook: string };

let program: ts.Program;
let checker: ts.TypeChecker;

beforeAll(() => {
  const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("no tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
  program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  checker = program.getTypeChecker();
}, 120_000);

/** True when the type is compared by value, so its "identity" cannot change between renders. */
function isStableByValue(type: ts.Type): boolean {
  if (type.flags & PRIMITIVE) return true;
  if (type.isUnion()) return type.types.every(isStableByValue);
  return false;
}

function findOffences(source: ts.SourceFile): Offence[] {
  const text = source.getFullText();
  const lines = text.split("\n");
  const hookResults = new Map<string, string>();
  const offences: Offence[] = [];

  function hookNameOf(node: ts.Node): string | null {
    if (!ts.isCallExpression(node)) return null;
    const callee = node.expression;
    if (!ts.isIdentifier(callee)) return null;
    return /^use[A-Z]/.test(callee.text) ? callee.text : null;
  }

  function collect(node: ts.Node) {
    // A destructured result (`const { data } = useX()`) is already specific, so only a plain
    // identifier binding can hold the unstable wrapper.
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const hook = hookNameOf(node.initializer);
      if (hook && !STABLE_HOOKS.has(hook)) {
        // The opt-out is read off the declaration's whole line, not the node: a trailing
        // `// stable-hook-result` sits past the declaration's end.
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line;
        if (!(lines[line] ?? "").includes(OPT_OUT)) {
          hookResults.set(node.name.text, hook);
        }
      }
    }
    ts.forEachChild(node, collect);
  }
  collect(source);

  function check(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (DEPS_TAKING_HOOKS.has(node.expression.text)) {
        const deps = node.arguments[1];
        if (deps && ts.isArrayLiteralExpression(deps)) {
          for (const dep of deps.elements) {
            // `existing.data` is a property access and is fine. Only a bare identifier naming a
            // whole hook result is the bug.
            if (!ts.isIdentifier(dep)) continue;
            const hook = hookResults.get(dep.text);
            if (!hook) continue;
            if (isStableByValue(checker.getTypeAtLocation(dep))) continue;

            offences.push({
              file: relative(process.cwd(), source.fileName),
              line: source.getLineAndCharacterOfPosition(dep.getStart()).line + 1,
              name: dep.text,
              hook,
            });
          }
        }
      }
    }
    ts.forEachChild(node, check);
  }
  check(source);

  return offences;
}

function filesUnder(prefixes: string[]): ts.SourceFile[] {
  return program
    .getSourceFiles()
    .filter((f) => !f.isDeclarationFile)
    .filter((f) => {
      const rel = relative(process.cwd(), f.fileName);
      return prefixes.some((p) => rel.startsWith(p));
    });
}

describe("hook results in dependency arrays", () => {
  it("finds source files to check", () => {
    expect(filesUnder(ROOTS).length).toBeGreaterThan(5);
  });

  it("never lists a whole hook result as a dependency", () => {
    const report = filesUnder(ROOTS)
      .flatMap(findOffences)
      .map(
        (o) =>
          `${o.file}:${o.line} — "${o.name}" is the result of ${o.hook}(); depend on the field you use`,
      )
      .join("\n");
    expect(report).toBe("");
  });
});

describe("the check itself", () => {
  // Without this, a broken detector reports a clean codebase and nobody notices.
  it("catches the exact shape that shipped", () => {
    const fixture = filesUnder(["test/lint/__fixtures__/offending"]);
    expect(fixture).toHaveLength(1);
    const offences = findOffences(fixture[0]);
    expect(offences).toHaveLength(1);
    expect(offences[0].name).toBe("existing");
    expect(offences[0].hook).toBe("useReadContract");
  });

  it("allows a field, a destructured result, an opt-out, and a primitive hook", () => {
    const fixture = filesUnder(["test/lint/__fixtures__/clean"]);
    expect(fixture).toHaveLength(1);
    expect(findOffences(fixture[0])).toEqual([]);
  });
});
