# @imsergiobernal/vaia-sdk

Typed ESM client for the Vaia API. Node.js 22 or newer is the supported release
runtime. Versions are independent of the CLI.

## Install from npm

The SDK is a public npm package; installation does not require authentication:

```sh
npm install @imsergiobernal/vaia-sdk
```

If you previously used GitHub Packages, update your user configuration and any
project `.npmrc` that overrides this scope:

```sh
npm config set @imsergiobernal:registry https://registry.npmjs.org --location=user
```

```js
import { createClient } from '@imsergiobernal/vaia-sdk';

// Set VAIA_API_TOKEN in the environment before running this example.
const client = createClient({ token: process.env.VAIA_API_TOKEN });
const studysets = await client.studysets.list();
```

## Configuration

Pass a raw Vaia API token as `token`; the client sends it as
`Authorization: Token <token>`.

The default API base URL is `https://prod.studysmarter.de`. Override it with the
`baseUrl` option in `createClient()`. The SDK does not automatically read
`VAIA_API_TOKEN`, `VAIA_API_URL`, or the CLI's saved configuration. To use both
environment variables explicitly:

```js
const client = createClient({
  token: process.env.VAIA_API_TOKEN,
  baseUrl: process.env.VAIA_API_URL,
});
```

## Releases

`sdk-vX.Y.Z` stages the verified npm tarball for manual approval with 2FA and
attaches it with `SHA256SUMS` to a draft GitHub Release. Approve the SDK in npm
before staging a CLI release that depends on it, then publish the SDK's GitHub
Release draft with **Set as latest release** disabled. The SDK release workflow
tests that the package can be installed and used outside this workspace without the private OpenAPI
package. See [the release procedure](../../docs/releasing.md).
