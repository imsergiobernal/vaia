import type { GeneratedClient } from "../generated/client.js";
import { ApiError, NetworkError, unwrapResponse } from "../errors.js";
import type { components } from "../generated/schema.js";

export type StudysetTagPayload = components["schemas"]["StudysetTagPayload"];
export type StudysetTag = components["schemas"]["StudysetTag"];
export type StudysetTagsResponse = components["schemas"]["StudysetTagsResponse"];

export interface ListStudysetTagsOptions {
  contentFilter?: "flashcards";
}

export class TagsResource {
  constructor(private readonly client: GeneratedClient) {}

  async list(
    studysetId: number,
    options: ListStudysetTagsOptions = {},
  ): Promise<StudysetTagsResponse> {
    try {
      const result = await this.client.GET("/studysets/{studyset_id}/tags/", {
        params: {
          path: { studyset_id: studysetId },
          query: { content_filter: options.contentFilter },
        },
        parseAs: "text",
      });
      return await unwrapResponse<StudysetTagsResponse>(result);
    } catch (error) {
      throwNetworkError(error);
    }
  }

  async create(studysetId: number, payload: StudysetTagPayload): Promise<StudysetTag> {
    try {
      const result = await this.client.POST("/studysets/{studyset_id}/tags/", {
        params: { path: { studyset_id: studysetId } },
        body: payload,
        parseAs: "text",
      });
      return await unwrapResponse<StudysetTag>(result);
    } catch (error) {
      throwNetworkError(error);
    }
  }

  async update(
    studysetId: number,
    tagId: number,
    payload: StudysetTagPayload,
  ): Promise<unknown> {
    try {
      const result = await this.client.PATCH("/studysets/{studyset_id}/tags/{tag_id}/", {
        params: { path: { studyset_id: studysetId, tag_id: tagId } },
        body: payload,
        parseAs: "text",
      });
      return await unwrapResponse(result);
    } catch (error) {
      throwNetworkError(error);
    }
  }

  async delete(studysetId: number, tagId: number): Promise<unknown> {
    try {
      const result = await this.client.DELETE("/studysets/{studyset_id}/tags/{tag_id}/", {
        params: { path: { studyset_id: studysetId, tag_id: tagId } },
        parseAs: "text",
      });
      return await unwrapResponse(result);
    } catch (error) {
      throwNetworkError(error);
    }
  }
}

function throwNetworkError(error: unknown): never {
  if (error instanceof ApiError || error instanceof NetworkError) {
    throw error;
  }

  throw new NetworkError(error);
}
