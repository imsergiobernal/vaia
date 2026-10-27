import { encode } from "@toon-format/toon";
import { ApiError, createClient, NetworkError, type StudysetTag, type StudysetTagsResponse } from "@vaia/sdk";
import { resolveConfig } from "./config.js";
import { CliActionError, writeCliError } from "./flashcards.js";

export async function createTag(
  studysetId: number,
  name: string,
  colour: number,
): Promise<void> {
  assertTagArguments(studysetId, name, colour);
  const client = await getAuthenticatedClient();
  try {
    const tag = await client.tags.create(studysetId, { name, colour });
    if (!isStudysetTag(tag) || !Number.isSafeInteger(tag.id) || tag.id <= 0) {
      throw new CliActionError(
        "invalid_api_response",
        "The tag was created, but the API response did not contain a valid tag ID.",
        `Do not retry blindly; check \`vaia tags list ${studysetId}\` before creating another tag.`,
      );
    }
    writeSuccess("tags.create", studysetId, tag.id);
  } catch (error) {
    throw normalizeTagError(error, "create");
  }
}

export async function listTags(
  studysetId: number,
  contentFilter?: "flashcards",
  full = false,
): Promise<void> {
  assertPositiveId(studysetId, "studyset-id");
  const client = await getAuthenticatedClient();
  try {
    const response: unknown = await client.tags.list(studysetId, { contentFilter });
    if (!isStudysetTagsResponse(response)) {
      throw new CliActionError(
        "invalid_api_response",
        "The API returned data that does not match the study set tags format.",
        `Check the configured API URL and inspect the response with \`vaia tags list ${studysetId} --full\`.`,
      );
    }
    if (full) {
      console.log(encode({ response }));
      return;
    }

    const sameTagLists = JSON.stringify(response.all_parent_tags) === JSON.stringify(response.studyset_tags);
    const tags = response.studyset_tags.map(compactTag);
    writeToon({
      studyset_id: studysetId,
      content_filter: contentFilter ?? null,
      all_parent_tags_count: response.all_parent_tags.length,
      untagged_items_count: response.untagged_items_count,
      tags,
      ...(!sameTagLists ? { all_parent_tags: response.all_parent_tags.map(compactTag) } : {}),
    });
  } catch (error) {
    throw normalizeTagError(error, "list");
  }
}

export async function updateTag(
  studysetId: number,
  tagId: number,
  name: string,
  colour: number,
): Promise<void> {
  assertTagArguments(studysetId, name, colour);
  assertPositiveId(tagId, "tag-id");
  const client = await getAuthenticatedClient();
  try {
    await client.tags.update(studysetId, tagId, { name, colour });
    writeSuccess("tags.update", studysetId, tagId);
  } catch (error) {
    throw normalizeTagError(error, "update");
  }
}

export async function deleteTag(studysetId: number, tagId: number): Promise<void> {
  assertPositiveId(studysetId, "studyset-id");
  assertPositiveId(tagId, "tag-id");
  const client = await getAuthenticatedClient();
  try {
    await client.tags.delete(studysetId, tagId);
    writeSuccess("tags.delete", studysetId, tagId);
  } catch (error) {
    throw normalizeTagError(error, "delete");
  }
}

function assertTagArguments(studysetId: number, name: string, colour: number): void {
  assertPositiveId(studysetId, "studyset-id");
  if (!name.trim()) {
    throw new CliActionError("invalid_argument", "name must not be empty.", "Pass a non-empty --name.");
  }
  if (!Number.isSafeInteger(colour)) {
    throw new CliActionError("invalid_argument", "colour must be a safe integer.", "Pass an integer with --colour.");
  }
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
      "An API token is required to manage tags.",
      "Set VAIA_API_TOKEN or run `vaia config set-token`.",
    );
  }
  return createClient({ baseUrl: config.baseUrl, token: config.token });
}

function normalizeTagError(error: unknown, operation: "list" | "create" | "update" | "delete"): CliActionError {
  if (error instanceof ApiError) {
    const suggestion = error.status === 401 || error.status === 403
      ? "Check the configured token with `vaia config show` and confirm it has permission."
        : error.status === 400
          ? "Check the tag name and colour, then retry."
        : operation === "list"
          ? "Check the studyset-id and content filter, then retry."
          : "Verify the studyset-id and tag-id, then retry.";
    return new CliActionError(
      "api_error",
      `The API rejected tags ${operation} (HTTP ${error.status}).`,
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
  return new CliActionError(
    "unexpected_error",
    "The tag operation could not be completed.",
    "Check the CLI configuration and retry.",
  );
}

function writeSuccess(operation: string, studysetId: number, tagId?: number): void {
  const result: Record<string, string | number> = { operation, studyset_id: studysetId };
  if (tagId !== undefined) result.tag_id = tagId;
  console.log(encode({ result }));
}

function isStudysetTag(value: unknown): value is StudysetTag {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const tag = value as Record<string, unknown>;
  return Number.isSafeInteger(tag.id)
    && typeof tag.name === "string"
    && Number.isSafeInteger(tag.colour);
}

function isStudysetTagsResponse(value: unknown): value is StudysetTagsResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  return Array.isArray(response.all_parent_tags)
    && Array.isArray(response.studyset_tags)
    && Number.isSafeInteger(response.untagged_items_count)
    && response.all_parent_tags.every(isStudysetTag)
    && response.studyset_tags.every(isStudysetTag);
}

function compactTag(tag: StudysetTagsResponse["studyset_tags"][number]): Record<string, string | number | boolean | null> {
  return {
    id: tag.id,
    name: tag.name,
    colour: tag.colour,
    flashcards_count: tag.flashcards_count ?? 0,
    partner_tag: tag.partner_tag ?? false,
  };
}

function writeToon(value: Record<string, unknown>): void {
  console.log(encode(value));
}

export { writeCliError };
