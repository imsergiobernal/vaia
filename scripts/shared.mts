import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Component = 'cli' | 'sdk';

export interface ReleaseRef {
  component: Component;
  version: string;
  tag: string;
  manifest: string;
}

export interface WorkingDirectoryOptions {
  cwd?: string;
}

export interface PullRequestRef {
  ref: string;
  sha: string;
  repo: { full_name: string };
}

export interface PullRequest {
  number: number;
  state: string;
  merged: boolean;
  body?: string | null;
  base: PullRequestRef;
  head: PullRequestRef;
}

export interface ReleaseNotesContext {
  number: number;
  component: Component;
  version: string;
  changelog: string;
  baseRef: string;
  baseSha: string;
  headRef: string;
  headSha: string;
  candidateSha: string;
  bodyHash: string;
  previousTag: string | null;
}

export type GitHubRequest = (method: 'GET' | 'PATCH', path: string, body?: { body: string }) => Promise<unknown>;

export interface GitHubOptions extends WorkingDirectoryOptions {
  env?: NodeJS.ProcessEnv;
  request?: GitHubRequest;
}

export const parseJson: (source: string) => unknown = JSON.parse;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPullRequestRef(value: unknown): value is PullRequestRef {
  return isRecord(value) && typeof value.ref === 'string' && typeof value.sha === 'string' &&
    isRecord(value.repo) && typeof value.repo.full_name === 'string';
}

export function isPullRequest(value: unknown): value is PullRequest {
  return isRecord(value) && typeof value.number === 'number' && typeof value.state === 'string' &&
    typeof value.merged === 'boolean' && (value.body == null || typeof value.body === 'string') &&
    isPullRequestRef(value.base) && isPullRequestRef(value.head);
}

export function isMainModule(url: string): boolean {
  return Boolean(process.argv[1]) && url === pathToFileURL(resolve(process.argv[1])).href;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}
