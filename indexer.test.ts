import { describe, it, expect } from "vitest";
import { buildIndexTfIdf, searchIndexTfIdf, type DocumentRecord } from "./indexer.js";

describe("TF-IDF search", () => {
  it("ranks documents by relevance instead of simple match count", () => {
    const documents: DocumentRecord[] = [
      { id: 1, title: "Rare concept", content: "banana banana banana" },
      { id: 2, title: "Common topic", content: "fruit fruit fruit banana" },
      { id: 3, title: "Unrelated", content: "apple apple apple" },
    ];

    const stats = buildIndexTfIdf(documents);
    const results = searchIndexTfIdf(stats, "banana");

    expect(results).toEqual([1, 2]);
    expect(results[0]).toBe(1);
    expect(results[1]).toBe(2);
  });
});
