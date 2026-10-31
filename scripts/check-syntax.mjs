#!/usr/bin/env node
/**
 * Syntax check every JavaScript file in the project.
 *
 * `node --check` per file is the cheapest possible lint: it catches typos,
 * unbalanced braces and accidental ESM/CJS mixing without pulling in ESLint.
 * Runs in parallel so a full sweep stays under a second on a small repo.
 */
import { readdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.discloner', 'coverage', 'dist', 'build'
]);

/** @type {string[]} */
const files = [];

/**
 * @param {string} dir
 */
async function walk(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.eslintrc.js') continue;
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (IGNORED_DIRS.has(entry.name)) continue;
            await walk(full);
        } else if (entry.isFile() && /\.(m?js)$/.test(entry.name)) {
            files.push(full);
        }
    }
}

/**
 * @param {string} file
 * @returns {Promise<{ file: string, ok: boolean, output: string }>}
 */
function check(file) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ['--check', file], { stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', (chunk) => { output += chunk; });
        child.stderr.on('data', (chunk) => { output += chunk; });
        child.on('error', (error) => resolve({ file, ok: false, output: error.message }));
        child.on('close', (code) => resolve({ file, ok: code === 0, output }));
    });
}

await stat(ROOT);
await walk(ROOT);

if (files.length === 0) {
    console.error('check-syntax: no JavaScript files found');
    process.exit(1);
}

const results = await Promise.all(files.map(check));
const failures = results.filter((result) => !result.ok);

for (const failure of failures) {
    console.error(`\n✖ ${path.relative(ROOT, failure.file)}`);
    console.error(failure.output.trim());
}

if (failures.length > 0) {
    console.error(`\ncheck-syntax: ${failures.length} of ${results.length} files failed`);
    process.exit(1);
}

console.log(`check-syntax: ${results.length} files OK`);
