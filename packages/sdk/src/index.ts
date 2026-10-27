export { createClient, DEFAULT_BASE_URL, VaiaClient } from "./client.js";
export type { VaiaClientOptions } from "./client.js";
export { ApiError, NetworkError } from "./errors.js";
export {
  FlashcardsResource,
  type DeleteFlashcardPayload,
  type FlashcardListItem,
  type FlashcardPage,
  type FlashcardPayload,
  type ListFlashcardsOptions,
  type MoveFlashcardsPayload,
} from "./resources/flashcards.js";
export {
  StudysetsResource,
  type ListStudysetsOptions,
  type ListSubsetsOptions,
  type Studyset,
  type StudysetList,
  type StudysetSubset,
} from "./resources/studysets.js";
export {
  TagsResource,
  type ListStudysetTagsOptions,
  type StudysetTag,
  type StudysetTagPayload,
  type StudysetTagsResponse,
} from "./resources/tags.js";
export type { components, paths } from "./generated/schema.js";
