import { createGeneratedClient } from "./generated/client.js";
import { FlashcardsResource } from "./resources/flashcards.js";
import { StudysetsResource } from "./resources/studysets.js";
import { TagsResource } from "./resources/tags.js";

export const DEFAULT_BASE_URL = "https://prod.studysmarter.de";

export interface VaiaClientOptions {
  /** API origin. Defaults to the server declared in the OpenAPI document. */
  baseUrl?: string;
  /** Raw token value; sent as `Authorization: Token <token>`. */
  token?: string;
  /** Additional headers applied to every request. */
  headers?: HeadersInit;
  /** Custom fetch implementation, useful for proxies and tests. */
  fetch?: typeof fetch;
}

export class VaiaClient {
  readonly flashcards: FlashcardsResource;
  readonly studysets: StudysetsResource;
  readonly tags: TagsResource;

  constructor(options: VaiaClientOptions = {}) {
    const headers = new Headers(options.headers);
    if (options.token) {
      headers.set("Authorization", `Token ${options.token}`);
    }

    const client = createGeneratedClient({
      baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
      fetch: options.fetch,
      headers,
    });

    this.flashcards = new FlashcardsResource(client);
    this.studysets = new StudysetsResource(client);
    this.tags = new TagsResource(client);
  }
}

export function createClient(options?: VaiaClientOptions): VaiaClient {
  return new VaiaClient(options);
}
