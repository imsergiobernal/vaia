import * as p from "@clack/prompts";
import {
  createFlashcard,
  deleteFlashcard,
  listFlashcards,
  updateFlashcard,
  writeCliError,
} from "../flashcards.js";
import {
  configFilePath,
  readStoredConfig,
  resolveConfig,
  writeStoredConfig,
} from "../config.js";
import { fetchStudysets, fetchSubsets } from "../studysets.js";

interface StudysetLocation {
  id: number;
  label: string;
}

export async function runMenu(): Promise<void> {
  p.intro("Vaia CLI");

  while (true) {
    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "studysets", label: "Browse study sets" },
        { value: "show", label: "Show configuration" },
        { value: "url", label: "Set API URL" },
        { value: "token", label: "Set API token" },
        { value: "exit", label: "Exit" },
      ],
    });

    if (p.isCancel(action) || action === "exit") break;
    if (action === "studysets") {
      await browseStudysets();
    }
    if (action === "show") await showConfiguration();
    if (action === "url") await setApiUrl();
    if (action === "token") await setApiToken();
  }

  p.outro("Done.");
}

async function browseStudysets(): Promise<void> {
  let response;
  try {
    response = await fetchStudysets();
  } catch (error) {
    writeCliError(error);
    return;
  }

  if (response.results.length === 0) {
    p.note("No active study sets found.", "Study sets");
    return;
  }

  const selectedStudyset = await p.select({
    message: "Choose a study set",
    maxItems: 12,
    options: [
      ...response.results.map((studyset) => ({
        value: String(studyset.id),
        label: `${studyset.name} (${studyset.id}) · ${studyset.flashcard_count ?? 0} flashcards`,
      })),
      { value: "back", label: "Back to main menu" },
    ],
  });

  if (p.isCancel(selectedStudyset) || selectedStudyset === "back") return;
  const studyset = response.results.find((item) => String(item.id) === selectedStudyset);
  if (studyset) await browseStudyset(studyset.id, studyset.name);
}

async function browseStudyset(initialId: number, initialName?: string): Promise<void> {
  const locations: StudysetLocation[] = [{
    id: initialId,
    label: initialName ? `${initialName} (${initialId})` : `Study set ${initialId}`,
  }];

  while (locations.length > 0) {
    const current = locations.at(-1)!;
    const action = await p.select({
      message: current.label,
      options: [
        { value: "flashcards", label: "Flashcards" },
        { value: "subsets", label: "Subsets" },
        { value: "back", label: locations.length > 1 ? "Back to parent study set" : "Back to main menu" },
      ],
    });

    if (p.isCancel(action) || action === "back") {
      locations.pop();
      continue;
    }
    if (action === "flashcards") await manageFlashcards(current.id);
    if (action === "subsets") {
      let subsets;
      try {
        subsets = await fetchSubsets(current.id);
      } catch (error) {
        writeCliError(error);
        continue;
      }

      if (subsets.length === 0) {
        p.note("No subsets found for this study set.", "Subsets");
        continue;
      }

      const selectedSubset = await p.select({
        message: `Subsets of ${current.label}`,
        options: [
          ...subsets.map((subset) => ({
            value: String(subset.id),
            label: `${subset.name ?? "Unnamed subset"} (${subset.id})`,
          })),
          { value: "back", label: "Back to study set" },
        ],
      });

      if (p.isCancel(selectedSubset) || selectedSubset === "back") continue;
      const subset = subsets.find((item) => String(item.id) === selectedSubset);
      if (subset) {
        locations.push({
          id: subset.id,
          label: `${subset.name ?? "Unnamed subset"} (${subset.id})`,
        });
      }
    }
  }
}

async function manageFlashcards(studysetId: number): Promise<void> {
  while (true) {
    const action = await p.select({
      message: `Flashcards in study set ${studysetId}`,
      options: [
        { value: "list", label: "List a page of flashcards" },
        { value: "create", label: "Create flashcard" },
        { value: "update", label: "Update flashcard" },
        { value: "delete", label: "Delete flashcard" },
        { value: "back", label: "Back to study set" },
      ],
    });

    if (p.isCancel(action) || action === "back") return;
    if (action === "list") {
      const cursor = await p.text({
        message: "Cursor from previous page (leave empty for first page)",
        placeholder: "Optional cursor",
      });
      if (!p.isCancel(cursor)) {
        await runAction(() => listFlashcards(studysetId, { cursor: cursor.trim() || undefined }));
      }
      continue;
    }
    if (action === "create") {
      const payloadPath = await promptPayloadPath();
      if (payloadPath) await runAction(() => createFlashcard(studysetId, payloadPath));
      continue;
    }

    const flashcardId = await promptId("Flashcard ID");
    if (flashcardId === undefined) continue;
    if (action === "delete") {
      const confirmed = await p.confirm({
        message: `Delete flashcard ${flashcardId} from study set ${studysetId}?`,
      });
      if (!p.isCancel(confirmed) && confirmed) {
        await runAction(() => deleteFlashcard(studysetId, flashcardId));
      }
      continue;
    }

    const payloadPath = await promptPayloadPath();
    if (payloadPath) await runAction(() => updateFlashcard(studysetId, flashcardId, payloadPath));
  }
}

async function promptId(message: string): Promise<number | undefined> {
  const value = await p.text({
    message,
    validate(input) {
      const id = Number(input);
      if (!Number.isSafeInteger(id) || id <= 0) return "Enter a positive safe integer.";
    },
  });
  if (p.isCancel(value)) return undefined;
  return Number(value);
}

async function promptPayloadPath(): Promise<string | undefined> {
  const filePath = await p.text({
    message: "Path to flashcard JSON payload",
    placeholder: "./flashcard.json",
    validate(value) {
      if (!value.trim()) return "Enter a payload file path.";
    },
  });
  return p.isCancel(filePath) ? undefined : filePath.trim();
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    writeCliError(error);
  }
}

async function showConfiguration(): Promise<void> {
  const config = await resolveConfig();
  p.note(
    [
      `API URL: ${config.baseUrl} (${config.baseUrlSource})`,
      `API token: ${config.token ? "configured (••••••)" : "not configured"}${config.tokenSource ? ` (${config.tokenSource})` : ""}`,
      `Config file: ${configFilePath}`,
    ].join("\n"),
    "Effective configuration",
  );
}

async function setApiUrl(): Promise<void> {
  const currentConfig = await readStoredConfig();
  const url = await p.text({
    message: "API base URL",
    placeholder: "https://app.vaia.com",
    initialValue: currentConfig.baseUrl,
    validate(value) {
      try {
        const parsedUrl = new URL(value);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return "Use an HTTP or HTTPS URL.";
        }
      } catch {
        return "Enter a valid URL.";
      }
    },
  });
  if (p.isCancel(url)) return;
  await writeStoredConfig({ ...currentConfig, baseUrl: url.replace(/\/+$/, "") });
  p.log.success("API URL saved. VAIA_API_URL, when set, still takes precedence.");
}

async function setApiToken(): Promise<void> {
  const currentConfig = await readStoredConfig();
  const token = await p.password({ message: "API token" });
  if (p.isCancel(token)) return;
  if (!token.trim()) {
    p.log.error("The API token cannot be empty.");
    return;
  }
  await writeStoredConfig({ ...currentConfig, token: token.trim() });
  p.log.success("API token saved locally. VAIA_API_TOKEN, when set, still takes precedence.");
}
