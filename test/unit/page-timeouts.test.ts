// Static guard: no page test may set its own timeout above 120_000 ms, because that overrides
// the testTimeout guard in vitest.pages.config.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const LIMIT = 120_000;
const root = join(__dirname, "..", "..");

const TEST_FNS = new Set(["it", "test", "describe", "suite"]); // (name, fn, timeout?) or (name, { timeout }, fn)
const HOOK_FNS = new Set(["beforeAll", "beforeEach", "afterAll", "afterEach"]); // (fn, timeout?)
const MODIFIERS_THAT_RETURN_THE_FN = new Set(["each", "for", "skipIf", "runIf"]); // `it.each(rows)` is not itself a test call
const TIMEOUT_PROPS = new Set(["timeout", "testTimeout", "hookTimeout"]);

export type Finding = { line: number; message: string };

/**
 * What the matcher recognizes (it parses the file with the TypeScript compiler, so line breaks do not matter):
 *  - a call to it / test / describe / suite, with any `.skip` `.only` `.each(rows)` `.skipIf(c)` `.runIf(c)` form in
 *    front: the third argument is the timeout; an object argument is read for `timeout`;
 *  - a call to beforeAll / beforeEach / afterAll / afterEach: the second argument is the timeout;
 *  - `vi.setTimeout(n)`, and any object property named `timeout`, `testTimeout` or `hookTimeout` anywhere
 *    (`vi.setConfig({ testTimeout })`, `{ timeout: n }`).
 * A timeout is evaluated from numeric literals, `+ - * / **`, parentheses, and names the same file binds with
 * `const NAME = ...` or a default parameter. A timeout that cannot be evaluated counts as a finding too, so nothing
 * slips by silently. It does not follow imports.
 */
export function findOverrides(text: string, fileName = "x.test.ts"): Finding[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  // Every initializer bound to a name in this file (a name may be bound more than once; all of them are checked).
  const bound = new Map<string, ts.Expression[]>();
  const bind = (name: ts.Node, init: ts.Expression | undefined) => {
    if (init && ts.isIdentifier(name)) bound.set(name.text, [...(bound.get(name.text) ?? []), init]);
  };
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n)) bind(n.name, n.initializer);
    ts.forEachChild(n, collect);
  };
  collect(sf);

  /** Every value the expression can take (a name bound twice gives two), or null when it cannot be read. */
  const evaluate = (e: ts.Expression, seen: string[] = []): number[] | null => {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) return evaluate(e.expression, seen);
    if (ts.isNumericLiteral(e)) return [Number(e.text)];
    if (ts.isPrefixUnaryExpression(e) && (e.operator === ts.SyntaxKind.PlusToken || e.operator === ts.SyntaxKind.MinusToken)) {
      const v = evaluate(e.operand, seen);
      return v && v.map((x) => (e.operator === ts.SyntaxKind.MinusToken ? -x : x));
    }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      const f = { [ts.SyntaxKind.PlusToken]: (a: number, b: number) => a + b, [ts.SyntaxKind.MinusToken]: (a: number, b: number) => a - b, [ts.SyntaxKind.AsteriskToken]: (a: number, b: number) => a * b, [ts.SyntaxKind.SlashToken]: (a: number, b: number) => a / b, [ts.SyntaxKind.AsteriskAsteriskToken]: (a: number, b: number) => a ** b }[op as number];
      const l = evaluate(e.left, seen);
      const r = evaluate(e.right, seen);
      return f && l && r ? l.flatMap((a) => r.map((b) => f(a, b))) : null;
    }
    if (ts.isIdentifier(e) && !seen.includes(e.text)) {
      const inits = bound.get(e.text);
      if (!inits) return null;
      const all = inits.map((i) => evaluate(i, [...seen, e.text]));
      return all.some((v) => v === null) ? null : all.flatMap((v) => v!);
    }
    return null;
  };

  const found: Finding[] = [];
  const check = (e: ts.Expression) => {
    const v = evaluate(e);
    if (v === null) found.push({ line: lineOf(e), message: `cannot read this timeout: ${e.getText(sf)}` });
    else if (v.some((x) => !(x <= LIMIT))) found.push({ line: lineOf(e), message: `timeout ${e.getText(sf)} = ${Math.max(...v)}` });
  };

  const chain = (e: ts.Expression): { root: string; last: string } => {
    let last = "";
    for (let c = e; ; ) {
      if (ts.isPropertyAccessExpression(c)) { last ||= c.name.text; c = c.expression; }
      else if (ts.isCallExpression(c)) { last ||= "()"; c = c.expression; }
      else if (ts.isElementAccessExpression(c)) c = c.expression;
      else return { root: ts.isIdentifier(c) ? c.text : "", last };
    }
  };

  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) {
      const name = ts.isIdentifier(n.name) || ts.isStringLiteral(n.name) ? n.name.text : "";
      if (TIMEOUT_PROPS.has(name)) check(ts.isPropertyAssignment(n) ? n.initializer : n.name);
    }
    if (ts.isCallExpression(n)) {
      const { root, last } = chain(n.expression);
      const isFn = (a: ts.Expression) => ts.isArrowFunction(a) || ts.isFunctionExpression(a);
      if (TEST_FNS.has(root) && !MODIFIERS_THAT_RETURN_THE_FN.has(last) && n.arguments[2] && !isFn(n.arguments[2])) check(n.arguments[2]);
      if (HOOK_FNS.has(root) && n.arguments[1]) check(n.arguments[1]);
      if (root === "vi" && last === "setTimeout" && n.arguments[0]) check(n.arguments[0]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found.sort((a, b) => a.line - b.line);
}

function files(): string[] {
  const pages = readdirSync(join(root, "test/pages")).filter((f) => f.endsWith(".test.ts")).map((f) => `test/pages/${f}`);
  const bars = readdirSync(join(root, "bars"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `bars/${d.name}/gate.test.ts`)
    .filter((f) => {
      try { readFileSync(join(root, f)); return true; } catch { return false; }
    });
  return [...pages, ...bars];
}

describe("page test timeouts", () => {
  it("no page test sets a timeout over 120_000", () => {
    const bad = files().flatMap((f) => findOverrides(readFileSync(join(root, f), "utf8"), f).map((o) => `${f}:${o.line} ${o.message}`));
    expect(bad).toEqual([]);
  });

  it("the matcher catches planted overrides in every form and ignores values at the limit", () => {
    // one line
    expect(findOverrides(`it("x", async () => {}, 121_000);`)).toHaveLength(1);
    // named constant, closing brace on its own line
    expect(findOverrides(`const T = 600_000;\nit("x", async () => {\n}, T);`)).toEqual([{ line: 3, message: "timeout T = 600000" }]);
    // the last argument on its own line (as test/pages/grain.test.ts does)
    expect(findOverrides(`it(\n  "x",\n  async () => {},\n  121_000,\n);`)).toEqual([{ line: 4, message: "timeout 121_000 = 121000" }]);
    // arithmetic, also through a name
    expect(findOverrides(`it("x", async () => {}, 2 * 100_000);`)).toHaveLength(1);
    expect(findOverrides(`const M = 100_000;\nit("x", async () => {}, M * 2);`)).toHaveLength(1);
    // vi.setConfig and the options-object form
    expect(findOverrides(`vi.setConfig({ testTimeout: 600_000 });`)).toHaveLength(1);
    expect(findOverrides(`it("x", { timeout: 1_200_000 }, async () => {});`)).toHaveLength(1);
    // .each, .skipIf, .only forms and hooks
    expect(findOverrides(`it.each([1])("x %s", async () => {}, 121_000);`)).toHaveLength(1);
    expect(findOverrides(`it.skipIf(!D)("x", async () => {}, 121_000);`)).toHaveLength(1);
    expect(findOverrides(`describe.only("x", () => {}, 121_000);`)).toHaveLength(1);
    expect(findOverrides(`beforeAll(async () => {}, 121_000);`)).toHaveLength(1);
    // a timeout it cannot evaluate is a finding, not a pass
    expect(findOverrides(`it("x", async () => {}, Number(process.env.T));`)[0]?.message).toMatch(/^cannot read this timeout/);
    // at or under the limit, and calls with no timeout, are fine
    expect(findOverrides(`it("x", async () => {\n}, 120_000);\nit.each([1])("y", async () => {});\nconst o = { timeout: 5000 };`)).toEqual([]);
  });
});
