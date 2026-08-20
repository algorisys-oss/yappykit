#!/usr/bin/env node
/**
 * Publish a clean, deployable copy of this repo to the public OSS mirror.
 *
 * WHY A MIRROR AND NOT A BRANCH. This working repo carries the things that
 * help build the product but are not the product: the agent guide, the
 * vendored skills under .claude, the engineering-loop system prompt, and the
 * internal brief in docs/ with its revenue plans and unresolved risks. The
 * public repo is the deployment source, so it gets the code that builds the
 * site and nothing else.
 *
 * The mirror also gets its OWN history. Most commits here carry co-author
 * trailers, so replaying them would republish exactly what this script exists
 * to leave behind. Each publish is instead one commit describing the release.
 *
 * WHAT MAKES THIS SAFE. Publishing is one-way and public, so the script
 * refuses to run on a dirty tree and, unless told otherwise, only publishes a
 * tree that typechecks, passes its tests and builds. A mirror that does not
 * build is worse than a stale one: Cloudflare deploys from it.
 *
 *   node scripts/publish-oss.mjs --dry-run      # show the manifest, touch nothing
 *   node scripts/publish-oss.mjs -m "Add word generator"
 *   node scripts/publish-oss.mjs --skip-verify  # only when you just ran them
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIRROR_REMOTE = 'https://github.com/algorisys-oss/yappykit.git';
/** Kept out of the repo itself; see .gitignore. */
const WORKDIR = path.join(ROOT, '.publish');

/**
 * Paths that never reach the public mirror, matched against the repo-relative
 * path as a whole entry or a directory prefix.
 *
 * Everything else that git tracks ships, which is the safe default direction:
 * a new source file is published automatically, while anything secret has to
 * be named here. Add to this list when you add a new kind of internal file.
 */
const EXCLUDE = [
  'CLAUDE.md',        // agent guide
  'LOOP.md',          // agent system prompt
  '.claude',          // vendored agents, skills and settings
  '.impeccable',      // design-hook cache
  'docs',             // internal brief: monetization, open questions, risks
  'spike',            // scratch experiments, kept for our own reference
  'ar.png',           // stray screenshot
  'README.md',        // replaced by README.oss.md, below
];

/** Written into the mirror as its README, since ours links into docs/. */
const PUBLIC_README = 'README.oss.md';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipVerify = args.includes('--skip-verify');
const msgFlag = args.indexOf('-m');
const message = msgFlag >= 0 ? args[msgFlag + 1] : null;

const run = (cmd, cmdArgs, cwd = ROOT) =>
  execFileSync(cmd, cmdArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const runLoud = (cmd, cmdArgs, cwd = ROOT) =>
  execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit' });

const die = (why) => {
  console.error(`\n  publish aborted: ${why}\n`);
  process.exit(1);
};

// ── 1. Refuse to publish a tree that is not the one you tested ────────────
// A dry run writes nothing, so it stays available while you are mid-change.
if (!dryRun && run('git', ['status', '--porcelain'])) {
  die('the working tree has uncommitted changes. Commit or stash them first, so\n' +
      '  the published copy matches a commit you can point at.');
}

const sha = run('git', ['rev-parse', '--short', 'HEAD']);
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

// ── 2. The mirror is the deployment source, so it must build ──────────────
if (!skipVerify && !dryRun) {
  console.log('  verifying (typecheck, tests, build)...');
  for (const script of ['typecheck', 'test', 'build']) {
    try {
      runLoud('npm', ['run', script]);
    } catch {
      die(`\`npm run ${script}\` failed. The mirror deploys to production; it does\n` +
          '  not get to be broken.');
    }
  }
}

// ── 3. Work out what ships ────────────────────────────────────────────────
const tracked = run('git', ['ls-files']).split('\n').filter(Boolean);
const isExcluded = (file) =>
  EXCLUDE.some((entry) => file === entry || file.startsWith(`${entry}/`));

// The submodule is a gitlink, not a file: it needs the commit it points at,
// restored into the mirror's index by hand further down. Cloudflare clones it
// at build time, which is why the mirror must carry the pointer.
const SUBMODULE = 'vendor/zen-ui';
const submoduleSha = run('git', ['rev-parse', `HEAD:${SUBMODULE}`]);

// PUBLIC_README is excluded under its own name because it is published as
// README.md; shipping both would put two READMEs in the mirror.
const manifest = tracked.filter(
  (f) => !isExcluded(f) && f !== SUBMODULE && f !== PUBLIC_README,
);
const dropped = tracked.filter((f) => isExcluded(f) || f === PUBLIC_README);

if (!existsSync(path.join(ROOT, PUBLIC_README))) {
  die(`${PUBLIC_README} is missing. The mirror needs a README that does not link\n` +
      '  into docs/, which is not published.');
}

console.log(`\n  source    ${branch} @ ${sha}`);
console.log(`  mirror    ${MIRROR_REMOTE}`);
console.log(`  publishing ${manifest.length} files, holding back ${dropped.length}`);
console.log(`  submodule ${SUBMODULE} @ ${submoduleSha.slice(0, 12)}`);

if (dryRun) {
  const top = (files) => [...new Set(files.map((f) => f.split('/')[0]))].sort();
  console.log(`\n  ships:  ${top(manifest).join(', ')}`);
  console.log(`  holds:  ${top(dropped).join(', ')}`);
  console.log(`\n  ${PUBLIC_README} will be published as README.md`);
  console.log('\n  dry run, nothing written.\n');
  process.exit(0);
}

// ── 4. Get a checkout of the mirror ───────────────────────────────────────
if (!existsSync(path.join(WORKDIR, '.git'))) {
  rmSync(WORKDIR, { recursive: true, force: true });
  mkdirSync(path.dirname(WORKDIR), { recursive: true });
  console.log('\n  cloning the mirror...');
  try {
    runLoud('git', ['clone', MIRROR_REMOTE, WORKDIR], ROOT);
  } catch {
    die(`could not clone ${MIRROR_REMOTE}.\n` +
        '  Create it first:  gh repo create algorisys-oss/yappykit --public');
  }
} else {
  console.log('\n  refreshing the mirror checkout...');
  run('git', ['fetch', 'origin'], WORKDIR);
  const head = run('git', ['symbolic-ref', '--short', 'HEAD'], WORKDIR);
  try {
    run('git', ['reset', '--hard', `origin/${head}`], WORKDIR);
  } catch {
    // A mirror with no commits yet has no origin/<branch> to reset to.
  }
  run('git', ['clean', '-fdx'], WORKDIR);
}

// ── 5. Replace the mirror's contents wholesale ────────────────────────────
// Deleting first is what makes a removal here propagate: syncing only the
// files that exist would leave a file behind forever once we stopped
// publishing it.
for (const entry of readdirSync(WORKDIR)) {
  if (entry === '.git') continue;
  rmSync(path.join(WORKDIR, entry), { recursive: true, force: true });
}

for (const file of manifest) {
  const dest = path.join(WORKDIR, file);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(path.join(ROOT, file), dest);
}

cpSync(path.join(ROOT, PUBLIC_README), path.join(WORKDIR, 'README.md'));

// The mirror builds from source and never commits build output, same as here.
writeFileSync(
  path.join(WORKDIR, '.gitignore'),
  `${run('git', ['show', 'HEAD:.gitignore'])}\n`,
  'utf8',
);

// ── 6. Commit, restoring the submodule pointer into the index ─────────────
run('git', ['add', '-A'], WORKDIR);
run('git', ['update-index', '--add', '--cacheinfo', `160000,${submoduleSha},${SUBMODULE}`], WORKDIR);

if (!run('git', ['status', '--porcelain'], WORKDIR)) {
  console.log('\n  the mirror already matches this commit. Nothing to publish.\n');
  process.exit(0);
}

const subject = message ?? `Publish ${sha}`;
const body = `Built from the source repository at ${sha}.`;
run('git', ['commit', '-m', subject, '-m', body], WORKDIR);

console.log('\n  pushing...');
try {
  runLoud('git', ['push', 'origin', 'HEAD'], WORKDIR);
} catch {
  die('push failed. Check you have write access to algorisys-oss.');
}

const pushed = run('git', ['rev-parse', '--short', 'HEAD'], WORKDIR);
console.log(`\n  published ${sha} as ${pushed}`);
console.log('  Cloudflare Pages will pick it up and deploy.\n');
