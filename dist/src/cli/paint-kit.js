#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PLAYWRIGHT_MISSING, closeBrowsers, playwrightOrNull } from "../checks/harness.js";
import { UsageError, gate } from "../checks/gate.js";
import { REPO_ROOT } from "../checks/root.js";
import { makeSheet } from "../checks/sheet.js";
const USAGE = `paint-kit: paint web surfaces in WebGL2.

usage: paint-kit <command>

Commands:
  gate <bar-folder | page.html>   run every check on one bar or page
  gate --all                      run every bars/* and controls/*
  sheet <bar-folder | page.html> --out <png>
                                  one image: seeds 1-3 x light/dark x detail 0, 0.5, 1 x two key lights

Exit: 0 passed, 1 failed or partial, 2 usage.
`;
function usage(msg) {
    if (msg)
        console.error(`paint-kit: ${msg}\n`);
    console.error(USAGE);
    process.exit(2);
}
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "gate") {
    if (rest.length !== 1)
        usage("gate takes one target or --all");
    if ((await playwrightOrNull()) === null) {
        console.error(PLAYWRIGHT_MISSING);
        process.exit(2);
    }
    const targets = [];
    if (rest[0] === "--all") {
        for (const group of ["bars", "controls"]) {
            const dir = path.join(REPO_ROOT, group);
            if (!existsSync(dir))
                continue;
            for (const name of readdirSync(dir).sort()) {
                const d = path.join(dir, name);
                if (statSync(d).isDirectory() && existsSync(path.join(d, "index.html")))
                    targets.push(d);
            }
        }
        if (targets.length === 0)
            console.log("nothing to gate: no bars/* or controls/* with an index.html");
    }
    else
        targets.push(rest[0]);
    let code = 0;
    try {
        for (const t of targets) {
            const r = await gate(t);
            if (targets.length > 1 || rest[0] === "--all")
                console.log(`\n${path.relative(REPO_ROOT, t)}`);
            for (const l of r.lines)
                console.log(l);
            console.log(r.verdict);
            if (r.verdict !== "passed")
                code = 1;
        }
    }
    catch (e) {
        await closeBrowsers();
        if (e instanceof UsageError)
            usage(e.message);
        console.error(`paint-kit: ${e.message}`);
        process.exit(2);
    }
    await closeBrowsers();
    process.exit(code);
}
if (cmd === "sheet") {
    const outAt = rest.indexOf("--out");
    if (rest.length !== 3 || outAt !== 1 || rest[2] === undefined)
        usage("sheet takes <target> --out <png>");
    if ((await playwrightOrNull()) === null) {
        console.error(PLAYWRIGHT_MISSING);
        process.exit(2);
    }
    try {
        const r = await makeSheet(rest[0], rest[2]);
        console.log(`wrote ${rest[2]}: ${r.cells} cells, ${r.width}x${r.height}`);
    }
    catch (e) {
        await closeBrowsers();
        if (e instanceof UsageError)
            usage(e.message);
        console.error(`paint-kit: ${e.message}`);
        process.exit(2);
    }
    await closeBrowsers();
    process.exit(0);
}
usage(cmd === undefined ? undefined : `unknown or unimplemented command "${cmd}"`);
