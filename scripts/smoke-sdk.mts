// Copied to an isolated consumer by the verify-sdk action before execution.
import assert from 'node:assert/strict';
import { createClient } from '@imsergiobernal/vaia-sdk';

let requests = 0;
const client = createClient({
  baseUrl: 'https://sdk-smoke.invalid',
  token: 'smoke-test',
  fetch: async (input, init) => {
    const request = new Request(input, init);
    requests += 1;
    assert.equal(new URL(request.url).pathname, '/studysets/');
    assert.equal(new URL(request.url).searchParams.get('is_archived'), 'false');
    assert.equal(request.headers.get('Authorization'), 'Token smoke-test');
    return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });
  },
});

assert.deepEqual(await client.studysets.list(), { results: [] });
assert.equal(requests, 1);
console.log('Packed SDK imports and executes a request without workspace dependencies.');
