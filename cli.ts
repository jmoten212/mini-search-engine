import { buildIndexFromFolder, loadDocumentsFromFolder, searchIndex } from "./indexer.js";

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();

  if (!query) {
    console.log("Usage: npm run search -- <query>");
    process.exitCode = 1;
    return;
  }

  const folderPath = "./text-files";
  const [documents, index] = await Promise.all([
    loadDocumentsFromFolder(folderPath),
    buildIndexFromFolder(folderPath),
  ]);

  const matchingIds = searchIndex(index, query);
  const matchingDocuments = matchingIds
    .map((id) => documents.find((document) => document.id === id))
    .filter((document): document is NonNullable<typeof document> => Boolean(document));

  if (matchingDocuments.length === 0) {
    console.log(`No results for: ${query}`);
    return;
  }

  for (const document of matchingDocuments) {
    console.log(`${document.id}: ${document.title}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});