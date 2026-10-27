# @imsergiobernal/vaia-sdk

Typed ESM client for the Vaia API. Node.js 22 or newer is the supported release
runtime. Versions are independent of the CLI.

## Install from GitHub Packages

Configure the scope in your project's `.npmrc`:

```ini
@imsergiobernal:registry=https://npm.pkg.github.com
```

Authenticate with a GitHub personal access token (classic) with `read:packages`
and access to the package. Authentication is required even for public npm
packages on GitHub Packages. Keep the token in your user configuration or an
environment variable, never in a committed file:

```sh
npm login --scope=@imsergiobernal --registry=https://npm.pkg.github.com --auth-type=legacy
npm install @imsergiobernal/vaia-sdk
```

```js
import { createClient } from '@imsergiobernal/vaia-sdk';

const client = createClient({ token: process.env.VAIA_API_TOKEN });
const studysets = await client.studysets.list();
```

## Releases

`sdk-vX.Y.Z` publishes the verified npm tarball to GitHub Packages and attaches
it with `SHA256SUMS` to the corresponding GitHub Release. CI tests that the package
can be installed and used outside this workspace without the private OpenAPI
package. See [the release procedure](../../docs/releasing.md).
