import { readFile } from "node:fs/promises";
import path from "node:path";
import { encode } from "@toon-format/toon";
import {
  ApiError,
  createClient,
  NetworkError,
  type DeleteFlashcardPayload,
  type FlashcardPage,
  type FlashcardPayload,
  type ListFlashcardsOptions,
} from "@vaia/sdk";
import { resolveConfig } from "./config.js";

export interface FlashcardIds {
  studysetId: number;
  flashcardId?: number;
}

export class CliActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly suggestion: string,
  ) {
    super(message);
    this.name = "CliActionError";
  }
}

export async function listFlashcards(
  studysetId: number,
  options: ListFlashcardsOptions = {},
  full = false,
): Promise<void> {
  assertPositiveId(studysetId, "studyset-id");
  if (options.quantity !== undefined && (!Number.isSafeInteger(options.quantity) || options.quantity <= 0)) {
    throw new CliActionError("invalid_argument", "quantity must be a positive safe integer.", "Pass a positive integer with --quantity.");
  }
  if (options.tagIds?.some((tagId) => !Number.isSafeInteger(tagId) || tagId <= 0)) {
    throw new CliActionError("invalid_argument", "tag-ids must contain positive safe integers.", "Pass comma-separated positive integers with --tag-ids.");
  }
  const client = await getAuthenticatedClient();

  try {
    const page = await client.flashcards.list(studysetId, options);
    if (!isFlashcardPage(page)) {
      throw new CliActionError(
        "invalid_api_response",
        "The API returned a response that does not match the flashcard page format.",
        `Inspect the raw response with \`vaia flashcards list ${studysetId} --full\` and check the configured API URL and token.`,
      );
    }
    writeFlashcardPage(page, studysetId, options, full);
  } catch (error) {
    throw normalizeApiError(error, "list");
  }
}

function writeFlashcardPage(
  page: FlashcardPage,
  studysetId: number,
  options: ListFlashcardsOptions,
  full: boolean,
): void {
  if (full) {
    writeToon({ page });
    return;
  }

  const nextCursor = getCursor(page.next);
  const previousCursor = getCursor(page.previous);
  let truncated = false;
  const results = page.results.map((flashcard) => {
    const answers = Array.isArray(flashcard.answer_html) ? flashcard.answer_html : [];
    const questionBlocks = Array.isArray(flashcard.question_html) ? flashcard.question_html : [];
    const question = questionBlocks
      .map((block) => isRecord(block) && typeof block.text === "string" ? block.text : "")
      .filter(Boolean)
      .join("\n");
    const isTruncated = question.length > 240;
    truncated ||= isTruncated;
    return {
      id: typeof flashcard.id === "number" ? flashcard.id : null,
      question: isTruncated ? `${question.slice(0, 240)}…` : question,
      tag_ids: flashcard.tags ?? [],
      ...(isTruncated ? { question_truncated_chars: question.length - 240 } : {}),
      answer_count: answers.length,
      rating: typeof flashcard.rating === "string" ? flashcard.rating : null,
    };
  });
  const help: string[] = [];
  if (nextCursor) {
    help.push(`Next page: ${buildNextPageCommand(studysetId, nextCursor, options)}`);
  }
  if (truncated || results.some((result) => result.answer_count > 0)) {
    help.push(`Run vaia flashcards list ${studysetId} with --full to see complete flashcard content.`);
  }

  writeToon({
    count: page.count,
    next_cursor: nextCursor,
    previous_cursor: previousCursor,
    results,
    ...(help.length ? { help } : {}),
  });
}

function getCursor(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get("cursor") ?? undefined;
  } catch {
    return undefined;
  }
}

function buildNextPageCommand(
  studysetId: number,
  cursor: string,
  options: ListFlashcardsOptions,
): string {
  const args = [`vaia flashcards list ${studysetId}`, `--cursor ${JSON.stringify(cursor)}`];
  if (options.quantity !== undefined) args.push(`--quantity ${options.quantity}`);
  if (options.search) args.push(`--search ${JSON.stringify(options.search)}`);
  if (options.ratings) args.push(`--ratings ${JSON.stringify(options.ratings.join(","))}`);
  if (options.visibility) args.push(`--visibility ${JSON.stringify(options.visibility)}`);
  if (options.createdBy) args.push(`--created-by ${JSON.stringify(options.createdBy)}`);
  if (options.order) args.push(`--order ${JSON.stringify(options.order)}`);
  if (options.tagIds?.length) args.push(`--tag-ids ${JSON.stringify(options.tagIds.join(","))}`);
  return args.join(" ");
}

export async function createFlashcard(studysetId: number, payloadPath: string): Promise<void> {
  assertPositiveId(studysetId, "studyset-id");
  const payload = await readFlashcardPayload(payloadPath);
  const client = await getAuthenticatedClient();

  try {
    await client.flashcards.create(studysetId, payload);
    writeSuccess({ operation: "flashcards.create", studyset_id: studysetId });
  } catch (error) {
    throw normalizeApiError(error, "create");
  }
}

export async function updateFlashcard(
  studysetId: number,
  flashcardId: number,
  payloadPath: string,
): Promise<void> {
  assertPositiveId(studysetId, "studyset-id");
  assertPositiveId(flashcardId, "flashcard-id");
  const payload = await readFlashcardPayload(payloadPath);
  const client = await getAuthenticatedClient();

  try {
    await client.flashcards.update(studysetId, flashcardId, payload);
    writeToon({
      result: {
        operation: "flashcards.update",
        studyset_id: studysetId,
        flashcard_id: flashcardId,
        requested_tag_ids: payload.tags,
      },
    });
  } catch (error) {
    throw normalizeApiError(error, "update");
  }
}

export async function deleteFlashcard(
  studysetId: number,
  flashcardId: number,
  payloadPath?: string,
): Promise<void> {
  assertPositiveId(studysetId, "studyset-id");
  assertPositiveId(flashcardId, "flashcard-id");
  const payload = payloadPath ? await readDeletePayload(payloadPath, flashcardId) : { id: flashcardId };
  const client = await getAuthenticatedClient();

  try {
    await client.flashcards.delete(studysetId, flashcardId, payload);
    writeSuccess({ operation: "flashcards.delete", studyset_id: studysetId, flashcard_id: flashcardId });
  } catch (error) {
    throw normalizeApiError(error, "delete");
  }
}

export function writeCliError(error: unknown): void {
  const normalized = error instanceof CliActionError
    ? error
    : new CliActionError("unexpected_error", "The Vaia operation could not be completed.", "Run `vaia --help` for available commands.");

  writeToon({
    error: {
      code: normalized.code,
      message: normalized.message,
      help: normalized.suggestion,
    },
  });
}

function assertPositiveId(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CliActionError("invalid_argument", `${name} must be a positive safe integer.`, "Pass a positive numeric identifier.");
  }
}

async function getAuthenticatedClient() {
  const config = await resolveConfig();
  if (!config.token) {
    throw new CliActionError(
      "missing_token",
      "An API token is required to manage flashcards.",
      "Set VAIA_API_TOKEN or run `vaia config set-token`.",
    );
  }

  return createClient({ baseUrl: config.baseUrl, token: config.token });
}

async function readFlashcardPayload(filePath: string): Promise<FlashcardPayload> {
  const payload = await readJsonFile(filePath);
  if (!isRecord(payload)) throw invalidPayload(filePath, "the JSON root must be an object");

  const requiredArrays = ["flashcard_image_ids", "tags", "question_html", "answer_html", "hint_html"] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(payload[key])) throw invalidPayload(filePath, `\`${key}\` must be an array`);
  }
  if (!(payload.tags as unknown[]).every((id) => Number.isSafeInteger(id) && (id as number) > 0)) {
    throw invalidPayload(filePath, "`tags` must contain positive safe tag IDs");
  }
  if (typeof payload.solution_html !== "string") {
    throw invalidPayload(filePath, "`solution_html` must be a string");
  }

  for (const key of ["question_html", "answer_html"] as const) {
    if (!(payload[key] as unknown[]).every(isHtmlOption)) {
      throw invalidPayload(filePath, `every item in \`${key}\` must contain string \`text\` and boolean \`is_correct\``);
    }
  }
  if (!(payload.flashcard_image_ids as unknown[]).every((id) => Number.isSafeInteger(id) && (id as number) >= 0)) {
    throw invalidPayload(filePath, "`flashcard_image_ids` must contain non-negative safe integers");
  }

  return payload as unknown as FlashcardPayload;
}

async function readDeletePayload(filePath: string, flashcardId: number): Promise<DeleteFlashcardPayload> {
  const payload = await readJsonFile(filePath);
  if (!isRecord(payload) || (payload.id !== undefined && payload.id !== flashcardId)) {
    throw invalidPayload(filePath, `the optional \`id\` must match flashcard-id ${flashcardId}`);
  }
  return { ...payload, id: flashcardId } as DeleteFlashcardPayload;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  let source: string;
  try {
    source = await readFile(resolvedPath, "utf8");
  } catch {
    throw new CliActionError("payload_file_error", `Could not read payload file ${JSON.stringify(filePath)}.`, "Check the file path and permissions, then retry.");
  }

  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new CliActionError("invalid_payload", `Payload file ${JSON.stringify(filePath)} is not valid JSON.`, "Fix the JSON syntax and retry.");
  }
}

function invalidPayload(filePath: string, detail: string): CliActionError {
  return new CliActionError(
    "invalid_payload",
    `Payload file ${JSON.stringify(filePath)} is invalid: ${detail}.`,
    "Review `apps/cli/examples/flashcard.json` and the matching flashcards command's `--help` output.",
  );
}

function normalizeApiError(error: unknown, operation: "list" | "create" | "update" | "delete"): CliActionError {
  if (error instanceof ApiError) {
    const suggestion = error.status === 401 || error.status === 403
      ? "Check the configured token with `vaia config show` and confirm it has permission."
      : error.status === 400
        ? operation === "list"
          ? "Check the query filters and cursor, then retry."
          : "Check the payload file against the flashcard fields required by the API."
          : operation === "list"
            ? "Check the studyset-id and query filters, then retry."
            : "Verify the studyset-id and flashcard-id, then retry.";
    return new CliActionError(
      "api_error",
      `The API rejected flashcards ${operation} (HTTP ${error.status}).`,
      suggestion,
    );
  }
  if (error instanceof NetworkError) {
    return new CliActionError(
      "network_error",
      "The API request could not be completed.",
      "Check the network and API URL with `vaia config show`.",
    );
  }
  if (error instanceof CliActionError) return error;
  if (error instanceof TypeError && operation === "list") {
    return new CliActionError(
      "invalid_api_response",
      "The API returned data that the CLI could not read as a flashcard page.",
      "Check the configured API URL and token, then inspect the response with `vaia flashcards list <studyset-id> --full`.",
    );
  }
  return new CliActionError(
    "unexpected_error",
    "The flashcard operation could not be completed.",
    "Check the CLI configuration and retry.",
  );
}

function isFlashcardPage(value: unknown): value is FlashcardPage {
  if (!isRecord(value)) return false;
  return typeof value.count === "number"
    && (value.next === null || typeof value.next === "string")
    && (value.previous === null || typeof value.previous === "string")
    && Array.isArray(value.results);
}

function isHtmlOption(value: unknown): boolean {
  return isRecord(value) && typeof value.text === "string" && typeof value.is_correct === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeSuccess(value: Record<string, string | number>): void {
  writeToon({ result: value });
}

function writeToon(value: Record<string, unknown>): void {
  console.log(encode(value));
}
