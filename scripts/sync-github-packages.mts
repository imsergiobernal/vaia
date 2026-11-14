import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { errorMessage, isMainModule, isRecord, parseJson } from './shared.mts';

const components = [
  { name: '@imsergiobernal/vaia-cli', prefix: 'cli-v' },
  { name: '@imsergiobernal/vaia-sdk', prefix: 'sdk-v' },
];

export function versionsToPublish(
  tags: string[], prefix: string, npmVersions: Record<string, unknown>, githubVersions: Record<string, unknown>,
) {
  return tags.flatMap((tag) => {
    if (!tag.startsWith(prefix)) return [];
    const version = tag.slice(prefix.length);
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return [];
    const npmVersion = npmVersions[version];
    if (!npmVersion) return [];
    const integrity = isRecord(npmVersion) && isRecord(npmVersion.dist) ? npmVersion.dist.integrity : undefined;
    if (typeof integrity !== 'string' || !integrity.startsWith('sha512-')) {
      throw new Error(`npm does not provide SHA-512 integrity for ${tag}`);
    }
    const githubVersion = githubVersions[version];
    if (githubVersion && (!isRecord(githubVersion) || !isRecord(githubVersion.dist) || githubVersion.dist.integrity !== integrity)) {
      throw new Error(`The published GitHub package differs from npm for ${tag}`);
    }
    return githubVersion ? [] : [{ tag, version, integrity }];
  });
}

async function metadata(registry: string, name: string, token?: string): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${registry}/${encodeURIComponent(name)}`, { headers });
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`${registry} returned HTTP ${response.status} for ${name}`);
  const data: unknown = await response.json();
  if (!isRecord(data) || !isRecord(data.versions)) {
    throw new Error(`${registry} returned invalid metadata for ${name}`);
  }
  return data.versions;
}

export async function syncPackages() {
  const token = process.env.NODE_AUTH_TOKEN;
  if (!token) throw new Error('NODE_AUTH_TOKEN is required for GitHub Packages');
  const tags = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' }).trim().split('\n');
  const directory = mkdtempSync(join(tmpdir(), 'vaia-github-packages-'));

  try {
    for (const component of components) {
      const npm = await metadata('https://registry.npmjs.org', component.name);
      const github = await metadata('https://npm.pkg.github.com', component.name, token);
      const pending = versionsToPublish(tags, component.prefix, npm, github);

      for (const release of pending) {
        execFileSync('git', ['merge-base', '--is-ancestor', `${release.tag}^{commit}`, 'origin/main']);
        const output = execFileSync('npm', [
          'pack', `${component.name}@${release.version}`, '--registry=https://registry.npmjs.org',
          '--pack-destination', directory, '--json', '--ignore-scripts',
        ], { cwd: directory, encoding: 'utf8' });
        const packed = parseJson(output);
        if (!Array.isArray(packed) || !isRecord(packed[0]) || typeof packed[0].filename !== 'string') {
          throw new Error(`npm pack returned invalid output for ${component.name}@${release.version}`);
        }
        const filename = packed[0].filename;
        const archive = join(directory, filename);
        const integrity = `sha512-${createHash('sha512').update(readFileSync(archive)).digest('base64')}`;
        if (integrity !== release.integrity) throw new Error(`Integrity mismatch for ${component.name}@${release.version}`);
        execFileSync('npm', [
          'publish', archive, '--registry=https://npm.pkg.github.com', '--ignore-scripts',
        ], { cwd: directory, stdio: 'inherit' });
        console.log(`Published ${component.name}@${release.version} to GitHub Packages`);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (isMainModule(import.meta.url)) {
  syncPackages().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
