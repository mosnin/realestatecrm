import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const source = path.resolve('integrations/cadre');
if (!existsSync(path.join(source, 'package.json'))) {
  const initialized = spawnSync('git', ['submodule', 'update', '--init', '--recursive', '--', 'integrations/cadre'], { stdio: 'inherit' });
  if (initialized.status !== 0) throw new Error('Initialize the pinned integrations/cadre submodule before building Chippi.');
}
if (process.env.CHIPPI_WORKFORCE_ENABLED !== 'true') process.exit(0);
const pnpm = process.env.CADRE_PNPM || 'pnpm';
const version = spawnSync(pnpm, ['--version'], { encoding: 'utf8' });
if (!version.stdout?.startsWith('9.')) throw new Error('Set CADRE_PNPM to pnpm 9.15.0; the Cadre lockfile must keep its own package manager.');
for (const args of [['install', '--frozen-lockfile'], ['--filter', '@rakazo/db', 'generate'], ['--filter', '@rakazo/web', 'build']]) {
  const result = spawnSync(pnpm, args, { cwd: source, stdio: 'inherit', env: { ...process.env, PATH: path.dirname(pnpm) + path.delimiter + process.env.PATH, CHIPPI_BUILD: 'true' } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const destination = path.resolve('public/workforce-assets');
cpSync(path.join(source, 'apps/web/dist'), destination, { recursive: true });
const htmlPath = path.join(destination, 'index.html');
let html = readFileSync(htmlPath, 'utf8').replace(/<title>.*?<\/title>/, '<title>Chippi Workforce</title>');
// The authenticated client uses Chippi's existing public identity assets.
html = html.replace(/<meta[^>]+(?:property="og:|name="(?:twitter:|apple-mobile-web-app-title))[^>]*>/g, '').replace(/<link[^>]+rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g, '');
writeFileSync(htmlPath, html);
