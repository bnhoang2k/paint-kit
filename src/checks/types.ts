import type { BarConfig } from "../bar.ts";

export type CheckStatus = "pass" | "fail" | "skip" | "partial";

/** `line` is the one line the gate prints (it starts with the check's name); `measured` holds the numbers behind it. */
export type CheckResult = { name: string; status: CheckStatus; line: string; measured: Record<string, number> };

/** `bar` is null for a bare html page (checks use defaults). `control` marks a control page: no `__paint` hook. */
export type Target = { url: string; bar: BarConfig | null; control: boolean };

export type CheckOpts = {
  readyTimeout?: number;
  /** Opens the page at this detail instead of the bar's (the detail check runs relight at detail 0). */
  detail?: number;
  /**
   * Opens the page at this seed instead of the bar's first. On a bar the gate sets it for each seed in bar.json and
   * ignores a value the caller passes; on a bare page the caller's value is used.
   */
  seed?: number;
  /**
   * Opens the page in the dark colour scheme. The gate never sets it: render, palette, still, hygiene and flash look
   * at the light scheme, and banding-grain, relight, detail and text-contrast open each scheme themselves and ignore
   * it. One-off runs set it.
   */
  dark?: boolean;
};

export type Check = (target: Target, opts: CheckOpts) => Promise<CheckResult>;

/** Whether a check applies to a (non-control) page: `true`, or `{ skip: reason }`, which the gate prints as the line. */
export type Applies = (target: Target, opts: CheckOpts) => Promise<true | { skip: string }>;

/**
 * One registered check. `control` says what runs on a control page: a check function for the half that applies, or
 * `{ skip: reason }`. `applies`, when set, says whether the check applies to any other page; unset, it always does.
 * The gate decides both; a check holds no applicability logic of its own.
 */
export type CheckEntry = { name: string; run: Check; control: Check | { skip: string }; applies?: Applies };

/** The page's colour scheme (`prefers-color-scheme`). Checks that read both open the page once in each. */
export type Scheme = "light" | "dark";
export const SCHEMES = ["light", "dark"] as const;

/** One scheme's half of a check: its status, its line (no check name, no scheme label) and its own measured keys. */
export type SchemePart = { scheme: Scheme; status: CheckStatus; line: string; measured: Record<string, number> };

const RANK: Record<CheckStatus, number> = { skip: 0, pass: 1, partial: 2, fail: 3 };

/**
 * Joins a check's light and dark halves. Status: the worse half (fail over partial over pass; skip only when both
 * skip). Line: `<name>: <scheme>: <line>; <scheme>: <line>`, the worse half first, light first on a tie, so a line
 * names the failing scheme first. Measured: every key gains its half's `.light` or `.dark` suffix.
 */
export function joinSchemes(name: string, parts: SchemePart[]): CheckResult {
  const order = [...parts].sort((a, b) => RANK[b.status] - RANK[a.status]);
  const status = order[0]?.status ?? "skip";
  const measured: Record<string, number> = {};
  for (const p of parts) for (const [k, v] of Object.entries(p.measured)) measured[`${k}.${p.scheme}`] = v;
  return { name, status, line: `${name}: ${order.map((p) => `${p.scheme}: ${p.line}`).join("; ")}`, measured };
}
