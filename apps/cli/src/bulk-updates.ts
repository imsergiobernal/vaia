import { readFile } from "node:fs/promises";
import path from "node:path";
import { encode } from "@toon-format/toon";
import { ApiError, createClient, NetworkError, type FlashcardPayload } from "@imsergiobernal/vaia-sdk";
import { resolveConfig } from "./config.js";

interface BulkUpdate {
  flashcardId: number;
  payload: FlashcardPayload;
}

export async function bulkUpdateFlashcards(
  studysetId: number,
  payloadPath: string,
  concurrency: number,
  dryRun = false,
): Promise<void> {
  if (!Number.isSafeInteger(studysetId) || studysetId <= 0) throw new Error("studyset-id must be a positive integer.");
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("concurrency must be an integer from 1 to 16.");
  }
  const resolvedPath = path.resolve(process.cwd(), payloadPath);
  const root: unknown = JSON.parse(await readFile(resolvedPath, "utf8"));
  if (!isRecord(root) || !Array.isArray(root.updates)) throw new Error("Payload must contain an updates array.");
  const updates = root.updates.map((entry, index) => parseUpdate(entry, index));
  const seenIds = new Set<number>();
  for (const update of updates) {
    if (seenIds.has(update.flashcardId)) throw new Error(`Payload repeats flashcard ${update.flashcardId}.`);
    seenIds.add(update.flashcardId);
  }
  if (dryRun) {
    console.log(encode({ result: { operation: "flashcards.bulk-update", studyset_id: studysetId, requested: updates.length, dry_run: true } }));
    return;
  }

  const config = await resolveConfig();
  if (!config.token) throw new Error("No Vaia token is configured; run `vaia config show` to check the CLI configuration.");
  const client = createClient({ baseUrl: config.baseUrl, token: config.token });
  const failures: Array<{ flashcard_id: number; error: string }> = [];
  let nextIndex = 0;
  let completed = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= updates.length) return;
      const update = updates[index];
      let error: unknown;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await client.flashcards.update(studysetId, update.flashcardId, update.payload);
          error = undefined;
          break;
        } catch (caught) {
          error = caught;
          const retryable = caught instanceof NetworkError || (caught instanceof ApiError && (caught.status === 429 || caught.status >= 500));
          if (!retryable || attempt === 4) break;
          await delay(Math.min(500 * 2 ** attempt, 8000));
        }
      }
      if (error !== undefined) {
        const reason = error instanceof ApiError ? `HTTP ${error.status}` : error instanceof NetworkError ? "network error" : "unexpected error";
        failures.push({ flashcard_id: update.flashcardId, error: reason });
      }
      completed += 1;
      if (completed % 500 === 0 || completed === updates.length) {
        process.stderr.write(`Updated ${completed}/${updates.length} flashcards; ${failures.length} failed.\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, updates.length) }, () => worker()));
  console.log(encode({
    result: {
      operation: "flashcards.bulk-update",
      studyset_id: studysetId,
      requested: updates.length,
      updated: updates.length - failures.length,
      failed: failures.length,
      failures,
    },
  }));
  if (failures.length > 0) process.exitCode = 1;
}

function parseUpdate(value: unknown, index: number): BulkUpdate {
  if (!isRecord(value) || !Number.isSafeInteger(value.flashcard_id) || (value.flashcard_id as number) <= 0) {
    throw new Error(`updates[${index}] must contain a positive flashcard_id.`);
  }
  const payload = value.payload;
  if (!isRecord(payload)) throw new Error(`updates[${index}].payload must be an object.`);
  for (const key of ["flashcard_image_ids", "tags", "question_html", "answer_html", "hint_html"] as const) {
    if (!Array.isArray(payload[key])) throw new Error(`updates[${index}].payload.${key} must be an array.`);
  }
  if (!(payload.flashcard_image_ids as unknown[]).every((id) => Number.isSafeInteger(id) && (id as number) >= 0)) {
    throw new Error(`updates[${index}].payload.flashcard_image_ids must contain non-negative integers.`);
  }
  if (!(payload.tags as unknown[]).every((id) => Number.isSafeInteger(id) && (id as number) > 0)) {
    throw new Error(`updates[${index}].payload.tags must contain positive tag IDs.`);
  }
  if (!(payload.question_html as unknown[]).every(isHtmlOption) || !(payload.answer_html as unknown[]).every(isHtmlOption)) {
    throw new Error(`updates[${index}] question_html and answer_html items must contain text and is_correct.`);
  }
  if (typeof payload.solution_html !== "string") throw new Error(`updates[${index}].payload.solution_html must be a string.`);
  return { flashcardId: value.flashcard_id as number, payload: payload as unknown as FlashcardPayload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHtmlOption(value: unknown): boolean {
  return isRecord(value) && typeof value.text === "string" && typeof value.is_correct === "boolean";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
