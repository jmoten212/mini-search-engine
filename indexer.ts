import { promises as fs } from "node:fs";
import path from "node:path";

export type DocumentRecord = {
  id: number;
  title?: string;
  category?: string;
  content?: string;
};

export type InvertedIndex = Map<string, Set<number>>;
export type DocumentFrequency = Map<string, number>;
export type TermFrequencyMap = Map<number, Map<string, number>>;

export type IndexStats = {
  index: InvertedIndex;
  termFrequencies: TermFrequencyMap;
  documentFrequency: DocumentFrequency;
};

export type RankedDocument = {
  documentId: number;
  score: number;
};

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

export function buildIndexTfIdf(documents: DocumentRecord[]): IndexStats {
  const index: InvertedIndex = new Map();
  const termFrequencies: TermFrequencyMap = new Map();
  const documentFrequency: DocumentFrequency = new Map();

  for (const document of documents) {
    const tokens = tokenize(documentText(document));
    const counts = new Map<string, number>();

    for (const term of tokens) {
      counts.set(term, (counts.get(term) ?? 0) + 1);

      const postingList = index.get(term);
      if (postingList) {
        postingList.add(document.id);
      } else {
        index.set(term, new Set([document.id]));
      }

      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }

    termFrequencies.set(document.id, counts);
  }

  return { index, termFrequencies, documentFrequency };
}

export function computeIdf(documentFrequency: DocumentFrequency, totalDocuments: number): Map<string, number> {
  const idf = new Map<string, number>();

  for (const [term, documentCount] of documentFrequency.entries()) {
    const score = Math.log((totalDocuments + 1) / (documentCount + 1)) + 1;
    idf.set(term, score);
  }

  return idf;
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

export function rankDocumentsTfIdf(stats: IndexStats, query: string): RankedDocument[] {
  const terms = tokenize(query);
  const uniqueTerms = [...new Set(terms)];

  if (uniqueTerms.length === 0) {
    return [];
  }

  const scores = new Map<number, number>();
  const idfValues = computeIdf(stats.documentFrequency, stats.termFrequencies.size);

  for (const term of uniqueTerms) {
    const postingList = stats.index.get(term);
    if (!postingList) {
      continue;
    }

    const idf = idfValues.get(term) ?? 0;

    for (const documentId of postingList) {
      const termCounts = stats.termFrequencies.get(documentId) ?? new Map();
      const rawFrequency = termCounts.get(term) ?? 0;
      const tf = rawFrequency === 0 ? 0 : 1 + Math.log(rawFrequency);

      scores.set(documentId, (scores.get(documentId) ?? 0) + tf * idf);
    }
  }

  return [...scores.entries()]
    .sort(([, leftScore], [, rightScore]) => rightScore - leftScore)
    .map(([documentId, score]) => ({ documentId, score }));
}

export function searchIndexTfIdf(stats: IndexStats, query: string): number[] {
  return rankDocumentsTfIdf(stats, query).map(({ documentId }) => documentId);
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

export async function buildIndexFromFolderTfIdf(folderPath: string): Promise<IndexStats> {
  const documents = await loadDocumentsFromFolder(folderPath);
  return buildIndexTfIdf(documents);
}
