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
  documentLengths: Map<number, number>;
  averageDocumentLength: number;
};

export type Bm25Options = {
  k1?: number;
  b?: number;
};

const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

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

export function buildIndexBm25(documents: DocumentRecord[]): IndexStats {
  const index: InvertedIndex = new Map();
  const termFrequencies: TermFrequencyMap = new Map();
  const documentFrequency: DocumentFrequency = new Map();
  const documentLengths = new Map<number, number>();
  let totalLength = 0;

  for (const document of documents) {
    const tokens = tokenize(documentText(document));
    const counts = new Map<string, number>();

    for (const term of tokens) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }

    for (const term of counts.keys()) {
      const postingList = index.get(term) ?? new Set<number>();

      postingList.add(document.id);
      index.set(term, postingList);

      documentFrequency.set(
        term,
        (documentFrequency.get(term) ?? 0) + 1
      );
    }

    termFrequencies.set(document.id, counts);
    documentLengths.set(document.id, tokens.length);
    totalLength += tokens.length;
  }

  const averageDocumentLength = documents.length === 0 ? 0 : totalLength / documents.length;

  return { index, termFrequencies, documentFrequency, documentLengths, averageDocumentLength };
}

export function computeBm25Idf(documentCount: number, totalDocuments: number): number {
  return Math.log(1 + (totalDocuments - documentCount + 0.5) / (documentCount + 0.5));
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

export function rankDocumentsBm25(
  stats: IndexStats,
  query: string,
  { k1 = DEFAULT_K1, b = DEFAULT_B }: Bm25Options = {}
): RankedDocument[] {
  const uniqueTerms = [...new Set(tokenize(query))];

  if (uniqueTerms.length === 0) {
    return [];
  }

  const scores = new Map<number, number>();
  const totalDocuments = stats.termFrequencies.size;

  for (const term of uniqueTerms) {
    const postingList = stats.index.get(term);
    if (!postingList) {
      continue;
    }

    const idf = computeBm25Idf(stats.documentFrequency.get(term) ?? 0, totalDocuments);

    for (const documentId of postingList) {
      const frequency = stats.termFrequencies.get(documentId)?.get(term) ?? 0;
      const documentLength = stats.documentLengths.get(documentId) ?? 0;
      const lengthRatio = stats.averageDocumentLength === 0 ? 0 : documentLength / stats.averageDocumentLength;
      const tf = (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * lengthRatio));

      scores.set(documentId, (scores.get(documentId) ?? 0) + idf * tf);
    }
  }

  return [...scores.entries()]
    .sort(([, leftScore], [, rightScore]) => rightScore - leftScore)
    .map(([documentId, score]) => ({ documentId, score }));
}

export function searchIndexBm25(stats: IndexStats, query: string, options?: Bm25Options): number[] {
  return rankDocumentsBm25(stats, query, options).map(({ documentId }) => documentId);
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

export async function buildIndexFromFolderBm25(folderPath: string): Promise<IndexStats> {
  const documents = await loadDocumentsFromFolder(folderPath);
  return buildIndexBm25(documents);
}
