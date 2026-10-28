import type { GeneratedClient } from "../generated/client.js";
import { ApiError, NetworkError, unwrapResponse } from "../errors.js";
import type { components } from "../generated/schema.js";

export type StudysetSubset = components["schemas"]["StudysetSubset"];
export type Studyset = components["schemas"]["Studyset"];
export type StudysetList = components["schemas"]["StudysetList"];

export interface ListSubsetsOptions {
  includeProgress?: boolean;
}

export interface ListStudysetsOptions {
  isArchived?: boolean;
}

export class StudysetsResource {
  constructor(private readonly client: GeneratedClient) {}

  async list(options: ListStudysetsOptions = {}): Promise<StudysetList> {
    try {
      const result = await this.client.GET("/studysets/", {
        headers: { Accept: "application/json; version=2.0" },
        params: {
          query: { is_archived: options.isArchived ?? false },
        },
        parseAs: "text",
      });
      return await unwrapResponse<StudysetList>(result);
    } catch (error) {
      if (error instanceof ApiError || error instanceof NetworkError) throw error;
      throw new NetworkError(error);
    }
  }

  async listSubsets(
    studysetId: number,
    options: ListSubsetsOptions = {},
  ): Promise<StudysetSubset[]> {
    try {
      const result = await this.client.GET("/studysets/{studyset_id}/subsets/", {
        headers: { Accept: "application/json; version=2.0" },
        params: {
          path: { studyset_id: studysetId },
          query: { include_progress: options.includeProgress ?? true },
        },
        parseAs: "text",
      });
      return await unwrapResponse<StudysetSubset[]>(result);
    } catch (error) {
      if (error instanceof ApiError || error instanceof NetworkError) throw error;
      throw new NetworkError(error);
    }
  }
}
