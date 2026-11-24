#!/usr/bin/env node
// Build the demo site's live player (live-demo-site skill) into OUT: the page
// (../portal/index.html), ONE self-hosted player.js bundling src/main.mjs, every
// feature script, the project's demo.config.mjs and what they import (Testing
// Library, user-event, the project's own helpers), and player-notices.txt with
// the licence of every package inside the bundle (listed from the bundle's own
// inputs, not by hand).
//
//   node player/build.mjs --features=../features --config=../demo.config.mjs --out=DIR
//
// The project's build step adds the rest of the site beside it: the photo the
// scripts attach (config.photo), the app's mark and font, and, with video mode,
// video.html + manifest.json + the videos.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));

/** `virtual:features` = every fNN-*.mjs in the folder, in order;
 *  `virtual:demo-config` = the project's adapter. */
const virtuals = (featuresDir, configFile) => ({
  name: 'demo-virtuals',
  setup(b) {
    b.onResolve({ filter: /^virtual:demo-config$/ }, () => ({ path: configFile }));
    b.onResolve({ filter: /^virtual:features$/ }, () => ({ path: 'features', namespace: 'demo' }));
    b.onLoad({ filter: /^features$/, namespace: 'demo' }, () => {
      const files = readdirSync(featuresDir).filter((f) => /^f\d\d-.*\.mjs$/.test(f)).sort();
      const lines = files.map((f, i) => `import * as m${i} from ${JSON.stringify(join(featuresDir, f))};`);
      lines.push(`export const FEATURES = [${files.map((f, i) => `{ id: ${JSON.stringify(f.replace(/\.mjs$/, ''))}, mod: m${i} }`).join(', ')}];`);
      return { contents: lines.join('\n'), resolveDir: featuresDir, loader: 'js' };
    });
  },
});

/** Node-only helpers a feature may share with a Node recorder (a fixture path
 *  through node:path / node:url): plain string versions are enough in the
 *  browser, where setInputFiles attaches the site's own photo instead. */
const nodeShims = {
  name: 'node-shims',
  setup(b) {
    b.onResolve({ filter: /^node:(path|url)$/ }, (a) => ({ path: a.path, namespace: 'shim' }));
    b.onLoad({ filter: /.*/, namespace: 'shim' }, (a) => ({
      loader: 'js',
      contents: a.path === 'node:path'
        ? `export const dirname = (p) => String(p).replace(/\\/[^/]*$/, '');
           export const join = (...p) => p.join('/');
           export const resolve = (...p) => p.join('/');`
        : `export const fileURLToPath = (u) => String(u).replace(/^file:\\/\\//, '');`,
    }));
  },
};

function notices(metafile) {
  const pkgs = new Map();
  for (const input of Object.keys(metafile.inputs)) {
    const m = input.match(/^(.*node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+))\//);
    if (!m) continue;
    const dir = resolve(HERE, m[1]);
    if (pkgs.has(dir)) continue;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
    pkgs.set(dir, { name: pkg.name, version: pkg.version, license: pkg.license, text: file ? readFileSync(join(dir, file), 'utf8').trim() : '' });
  }
  const list = [...pkgs.values()].sort((a, b) => a.name.localeCompare(b.name));
  const head = 'Demo site - player.js\nOpen-source packages bundled into player.js, with their licences.\n';
  return [head, ...list.map((p) => `${'='.repeat(72)}\n${p.name} ${p.version} (${p.license})\n${'='.repeat(72)}\n${p.text || `(no licence file in the package; licence: ${p.license})`}\n`)].join('\n');
}

export async function build({ features, config, out, page = join(HERE, '../portal/index.html') }) {
  for (const [what, p] of [['features', features], ['config', config], ['page', page]]) {
    if (!p || !existsSync(p)) throw new Error(`build: ${what} not found: ${p}`);
  }
  mkdirSync(out, { recursive: true });
  const r = await esbuild.build({
    entryPoints: [join(HERE, 'src/main.mjs')],
    bundle: true, format: 'esm', target: ['chrome110', 'firefox115', 'safari16'], minify: true,
    legalComments: 'none', metafile: true, charset: 'utf8', absWorkingDir: HERE,
    outfile: join(out, 'player.js'), plugins: [virtuals(resolve(features), resolve(config)), nodeShims], logLevel: 'warning',
  });
  writeFileSync(join(out, 'player-notices.txt'), notices(r.metafile));
  copyFileSync(page, join(out, 'index.html'));
  return r;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = (n) => process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const out = resolve(opt('out') ?? join(HERE, 'dist'));
  await build({ features: opt('features') && resolve(opt('features')), config: opt('config') && resolve(opt('config')), out, page: opt('page') && resolve(opt('page')) });
  console.log(`${out}: index.html + player.js (${(readFileSync(join(out, 'player.js')).length / 1024).toFixed(0)} kB) + player-notices.txt`);
}
