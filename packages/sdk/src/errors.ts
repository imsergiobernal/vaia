export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly url: string;

  constructor(options: {
    status: number;
    body: unknown;
    url: string;
    message?: string;
  }) {
    super(options.message ?? `API request failed with status ${options.status}`);
    this.name = "ApiError";
    this.status = options.status;
    this.body = options.body;
    this.url = options.url;
  }
}

export class NetworkError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("The API request could not be completed");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export async function unwrapResponse<T>(result: {
  data?: unknown;
  error?: unknown;
  response: Response;
}): Promise<T> {
  if (!result.response.ok) {
    throw new ApiError({
      status: result.response.status,
      body: result.error,
      url: result.response.url,
    });
  }

  return decodeUnknownResponse(result.data) as T;
}

function decodeUnknownResponse(data: unknown): unknown {
  if (typeof data !== "string") return data;
  if (data.length === 0) return undefined;

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}
