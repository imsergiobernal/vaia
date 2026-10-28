import type { GeneratedClient } from "../generated/client.js";
import { ApiError, NetworkError, unwrapResponse } from "../errors.js";

import type { components } from "../generated/schema.js";

export type FlashcardPayload = components["schemas"]["FlashcardPayload"];
export type DeleteFlashcardPayload =
  components["schemas"]["DeleteFlashcardPayload"];
export type FlashcardPage = components["schemas"]["FlashcardPage"];
export type FlashcardListItem = components["schemas"]["FlashcardListItem"];
export type MoveFlashcardsPayload = components["schemas"]["MoveFlashcardsPayload"];

export interface ListFlashcardsOptions {
  search?: string;
  ratings?: readonly string[];
  visibility?: string;
  createdBy?: string;
  order?: string;
  tagIds?: readonly number[];
  cursor?: string;
  quantity?: number;
}

export class FlashcardsResource {
  constructor(private readonly client: GeneratedClient) {}

  async list(studysetId: number, options: ListFlashcardsOptions = {}): Promise<FlashcardPage> {
    try {
      const result = await this.client.GET("/studysets/{studyset_id}/flashcards/", {
        params: {
          path: { studyset_id: studysetId },
          query: {
            search: options.search ?? "",
            ratings: options.ratings?.join(",") ?? "bad,ok,good,perfect,unrated",
            visibility: options.visibility ?? "visible",
            created_by: options.createdBy ?? "anybody",
            order: options.order ?? "anti-chronological",
            tag_ids: options.tagIds ? [...options.tagIds] : undefined,
            cursor: options.cursor,
            quantity: options.quantity ?? 20,
          },
        },
        parseAs: "text",
      });
      return await unwrapResponse<FlashcardPage>(result);
    } catch (error) {
      throwNetworkError(error);
    }
  }

  async create(studysetId: number, payload: FlashcardPayload): Promise<unknown> {
    try {
      const result = await this.client.POST("/studysets/{studyset_id}/flashcards/", {
        params: { path: { studyset_id: studysetId } },
        body: payload,
        parseAs: "text",
      });
      return await unwrapResponse(result);
    } catch (error) {
      throwNetworkError(error);
    }
  }

  async update(
    studysetId: number,
    flashcardId: number,
    payload: FlashcardPayload,
  ): Promise<unknown> {
    try {
      const result = await this.client.PATCH(
        "/studysets/{studyset_id}/flashcards/{flashcard_id}/",
        {
          params: { path: { studyset_id: studysetId, flashcard_id: flashcardId } },
          body: payload,
          parseAs: "text",
        },
      );
      return await unwrapResponse(result);
    } catch (error) {
      throwNetworkError(error);
    }
  }

  async delete(
    studysetId: number,
    flashcardId: number,
    payload?: DeleteFlashcardPayload,
  ): Promise<unknown> {
    try {
      const result = await this.client.DELETE(
        "/studysets/{studyset_id}/flashcards/{flashcard_id}/",
        {
          params: { path: { studyset_id: studysetId, flashcard_id: flashcardId } },
          body: payload,
          parseAs: "text",
        },
      );
      return await unwrapResponse(result);
    } catch (error) {
      throwNetworkError(error);
    }
  }

  async move(studysetId: number, payload: MoveFlashcardsPayload): Promise<unknown> {
    try {
      const result = await this.client.PATCH(
        "/studysets/{studyset_id}/flashcards/bulk/",
        {
          params: { path: { studyset_id: studysetId } },
          body: payload,
          parseAs: "text",
        },
      );
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
