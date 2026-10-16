import { buildIndexFromFolderTfIdf, loadDocumentsFromFolder, rankDocumentsTfIdf } from "./indexer.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  const query = args.filter((arg) => arg !== "--debug").join(" ").trim();

  if (!query) {
    console.log("Usage: npm run search -- [--debug] <query>");
    process.exitCode = 1;
    return;
  }

  const folderPath = "./text-files";
  const [documents, stats] = await Promise.all([
    loadDocumentsFromFolder(folderPath),
    buildIndexFromFolderTfIdf(folderPath),
  ]);

  const rankedDocuments = rankDocumentsTfIdf(stats, query);
  const matchingDocuments = rankedDocuments
    .map(({ documentId, score }) => {
      const document = documents.find((entry) => entry.id === documentId);
      return document ? { ...document, score } : null;
    })
    .filter((document): document is NonNullable<typeof document> => Boolean(document));

  if (matchingDocuments.length === 0) {
    console.log(`No results for: ${query}`);
    return;
  }

  for (const document of matchingDocuments) {
    if (debug) {
      console.log(`${document.id}: ${document.title} (score: ${document.score.toFixed(3)})`);
    } else {
      console.log(`${document.id}: ${document.title}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});