import createClient from "openapi-fetch";

import type { paths } from "./schema.js";

export function createGeneratedClient(options: {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
}) {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    headers: options.headers,
  });
}

export type GeneratedClient = ReturnType<typeof createGeneratedClient>;
