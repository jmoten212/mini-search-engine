import { promises as fs } from "node:fs";
import path from "node:path";

export type DocumentRecord = {
  id: number;
  title?: string;
  category?: string;
  content?: string;
};

export type InvertedIndex = Map<string, Set<number>>;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function documentText(document: DocumentRecord): string {
  return [document.title, document.category, document.content]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export function buildIndex(documents: DocumentRecord[]): InvertedIndex {
  const index: InvertedIndex = new Map();

  for (const document of documents) {
    const seenTerms = new Set(tokenize(documentText(document)));

    for (const term of seenTerms) {
      const postingList = index.get(term);

      if (postingList) {
        postingList.add(document.id);
      } else {
        index.set(term, new Set([document.id]));
      }
    }
  }

  return index;
}

export function searchIndex(index: InvertedIndex, query: string): number[] {
  const terms = tokenize(query);

  if (terms.length === 0) {
    return [];
  }

  const matchesByDocument = new Map<number, number>();

  for (const term of terms) {
    const postingList = index.get(term);

    if (!postingList) {
      continue;
    }

    for (const documentId of postingList) {
      matchesByDocument.set(documentId, (matchesByDocument.get(documentId) ?? 0) + 1);
    }
  }

  return [...matchesByDocument.entries()]
    .sort(([, leftScore], [, rightScore]) => rightScore - leftScore)
    .map(([documentId]) => documentId);
}

export async function loadDocumentsFromFolder(folderPath: string): Promise<DocumentRecord[]> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  const documents: DocumentRecord[] = [];

  for (const entry of jsonFiles) {
    const filePath = path.join(folderPath, entry.name);
    const fileContents = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(fileContents) as DocumentRecord[];
    documents.push(...parsed);
  }

  return documents;
}

export async function buildIndexFromFolder(folderPath: string): Promise<InvertedIndex> {
  const documents = await loadDocumentsFromFolder(folderPath);
  return buildIndex(documents);
}
