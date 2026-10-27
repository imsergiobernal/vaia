import { encode } from "@toon-format/toon";
import {
  ApiError,
  createClient,
  NetworkError,
  type StudysetList,
  type StudysetSubset,
} from "@vaia/sdk";
import { resolveConfig } from "./config.js";
import { CliActionError } from "./flashcards.js";

export async function fetchSubsets(
  studysetId: number,
  includeProgress = true,
): Promise<StudysetSubset[]> {
  if (!Number.isSafeInteger(studysetId) || studysetId <= 0) {
    throw new CliActionError(
      "invalid_argument",
      "studyset-id must be a positive safe integer.",
      "Pass a positive numeric study set ID.",
    );
  }

  const config = await resolveConfig();
  if (!config.token) {
    throw new CliActionError(
      "missing_token",
      "An API token is required to list study set subsets.",
      "Set VAIA_API_TOKEN or run `vaia config set-token`.",
    );
  }

  try {
    const client = createClient({ baseUrl: config.baseUrl, token: config.token });
    return await client.studysets.listSubsets(studysetId, { includeProgress });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new CliActionError(
        "api_error",
        `The API rejected the subsets request (HTTP ${error.status}).`,
        error.status === 401 || error.status === 403
          ? "Check the configured token with `vaia config show` and confirm it has permission."
          : "Check the studyset-id and retry.",
      );
    }
    if (error instanceof NetworkError) {
      throw new CliActionError(
        "network_error",
        "Could not reach the Vaia API.",
        "Check the API URL and network connection, then retry.",
      );
    }
    throw error;
  }
}

export async function fetchStudysets(isArchived = false): Promise<StudysetList> {
  const config = await resolveConfig();
  if (!config.token) {
    throw new CliActionError(
      "missing_token",
      "An API token is required to list studysets.",
      "Set VAIA_API_TOKEN or run `vaia config set-token`.",
    );
  }

  try {
    const client = createClient({ baseUrl: config.baseUrl, token: config.token });
    return await client.studysets.list({ isArchived });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new CliActionError(
        "api_error",
        `The API rejected the studysets request (HTTP ${error.status}).`,
        error.status === 401 || error.status === 403
          ? "Check the configured token with `vaia config show` and confirm it has permission."
          : "Check the API URL and retry.",
      );
    }
    if (error instanceof NetworkError) {
      throw new CliActionError(
        "network_error",
        "Could not reach the Vaia API.",
        "Check the API URL and network connection, then retry.",
      );
    }
    throw error;
  }
}

export async function listStudysets(isArchived = false, full = false): Promise<void> {
  const response = await fetchStudysets(isArchived);
  const studysets = full
    ? response.results
    : response.results.map((studyset) => ({
        id: studyset.id,
        name: studyset.name,
        flashcard_count: studyset.flashcard_count,
        subtopic_count: studyset.subtopic_count,
        shared: studyset.shared,
        archived: studyset.archived,
      }));

  console.log(encode({
    count: studysets.length,
    counts: response.counts,
    studysets,
    ...(studysets.length === 0 ? { message: "No studysets found." } : {}),
  }));
}

export async function listSubsets(
  studysetId: number,
  includeProgress = true,
  full = false,
): Promise<void> {
  const subsets = await fetchSubsets(studysetId, includeProgress);
  const records = full
    ? subsets
    : subsets.map((subset) => ({
        id: subset.id,
        name: subset.name,
        parent_studyset_id: subset.parent_studyset_id,
        flashcard_count: subset.flashcard_count,
        ...(includeProgress
          ? {
              flashcard_unseen_count: subset.flashcard_unseen_count,
              flashcard_learned_count: subset.learned_count,
            }
          : {}),
        type: subset.type,
        archived: subset.archived,
      }));

  console.log(encode({
    studyset_id: studysetId,
    count: records.length,
    subsets: records,
    ...(records.length === 0 ? { message: "No subsets found for this study set." } : {}),
  }));
}
