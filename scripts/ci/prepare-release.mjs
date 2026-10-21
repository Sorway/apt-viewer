import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const [candidateArg, fixtureArg] = process.argv.slice(2);
if (!candidateArg || !fixtureArg) throw new Error('Usage: node scripts/ci/prepare-release.mjs candidate fixture');
const candidate = path.resolve(candidateArg);
const fixture = path.resolve(fixtureArg);
mkdirSync(fixture, { recursive: true });
const pkg = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], { encoding: 'utf8' }));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version) || version === '0.0.0') throw new Error('A stable version above 0.0.0 is required');
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : `v${version}`;
if (!/^v?\d+\.\d+\.\d+$/.test(tag) || tag.replace(/^v/, '') !== version) throw new Error('Invalid fixture tag');
const archive = `apt-viewer-${version}.tar.gz`;
const current = path.join(fixture, 'versions', tag);
mkdirSync(current, { recursive: true });
for (const file of [archive, 'SHA256SUMS', 'install.sh', 'update.sh']) copyFileSync(path.join(candidate, file), path.join(current, file));
writeFileSync(path.join(fixture, 'latest'), tag);

// A second version exercises both sides of the update guard on the disposable runner.
const baseline = path.join(fixture, 'baseline');
mkdirSync(baseline);
execFileSync('tar', ['-xzf', path.join(candidate, archive), '--strip-components=1', '-C', baseline]);
for (const file of ['package.json', 'package-lock.json']) {
  const data = JSON.parse(readFileSync(path.join(baseline, file), 'utf8'));
  data.version = '0.0.0';
  if (data.packages?.['']) data.packages[''].version = '0.0.0';
  writeFileSync(path.join(baseline, file), JSON.stringify(data, null, 2) + '\n');
}
const older = path.join(fixture, 'versions', 'v0.0.0');
mkdirSync(older, { recursive: true });
execFileSync('tar', ['-czf', path.join(older, 'apt-viewer-0.0.0.tar.gz'), '--transform=s,^,apt-viewer/,', '-C', baseline, '.']);
for (const file of ['install.sh', 'update.sh']) copyFileSync(path.join(baseline, file), path.join(older, file));
writeFileSync(path.join(older, 'SHA256SUMS'), ['apt-viewer-0.0.0.tar.gz', 'install.sh', 'update.sh']
  .map(file => `${createHash('sha256').update(readFileSync(path.join(older, file))).digest('hex')}  ${file}\n`).join(''));
const bin = path.join(fixture, 'bin');
mkdirSync(bin);
copyFileSync('scripts/ci/curl-fixture.sh', path.join(bin, 'curl'));
execFileSync('chmod', ['0755', path.join(bin, 'curl')]);
console.log(`Release fixture ready: ${tag}`);
