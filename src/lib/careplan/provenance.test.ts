import { describe, it, expect } from "vitest";
import { resolveProvenance, providerLabel } from "./provenance";

describe("providerLabel", () => {
  it("combines title and name", () => {
    expect(providerLabel({ title: "Dr.", name: "Novák" })).toBe("Dr. Novák");
  });
  it("is empty for no provider", () => {
    expect(providerLabel(undefined)).toBe("");
  });
});

describe("resolveProvenance", () => {
  it("document path with a quote", () => {
    const r = resolveProvenance({
      sourceDocumentId: "doc1",
      sourceQuote: "Repeat HbA1c in 3 months",
      sourceProvider: { title: "Dr.", name: "Novák" },
      documentTitle: "GP visit",
      date: "2026-03-14",
    });
    expect(r.path).toBe("document");
    expect(r.copyKey).toBe("careplan.provenance.document-quote");
    expect(r.values).toMatchObject({
      provider: "Dr. Novák",
      quote: "Repeat HbA1c in 3 months",
      title: "GP visit",
      date: "2026-03-14",
    });
    expect(r.link).toEqual({ kind: "document", id: "doc1" });
    expect(r.conflict).toBe(false);
  });

  it("document path without a quote degrades gracefully (no fabrication)", () => {
    const r = resolveProvenance({
      sourceDocumentId: "doc1",
      documentTitle: "Lab",
      date: "2026-03-14",
    });
    expect(r.copyKey).toBe("careplan.provenance.document");
    expect(r.values).toEqual({ title: "Lab", date: "2026-03-14" });
    expect(r.link).toEqual({ kind: "document", id: "doc1" });
  });

  it("treats a whitespace-only quote as no quote", () => {
    const r = resolveProvenance({
      sourceDocumentId: "doc1",
      sourceQuote: "   ",
    });
    expect(r.copyKey).toBe("careplan.provenance.document");
  });

  it("chat path", () => {
    const r = resolveProvenance({
      sourceMessageId: "msg9",
      date: "2026-03-14",
    });
    expect(r.path).toBe("chat");
    expect(r.copyKey).toBe("careplan.provenance.chat");
    expect(r.link).toEqual({ kind: "chat", id: "msg9" });
  });

  it("user path when neither source is present", () => {
    const r = resolveProvenance({ date: "2026-03-14" });
    expect(r.path).toBe("user");
    expect(r.copyKey).toBe("careplan.provenance.user");
    expect(r.link).toBeUndefined();
  });

  it("document id takes precedence over a message id", () => {
    const r = resolveProvenance({
      sourceDocumentId: "doc1",
      sourceMessageId: "msg9",
    });
    expect(r.path).toBe("document");
  });

  it("flags conflict when the parent contradicts", () => {
    const r = resolveProvenance({
      sourceDocumentId: "doc1",
      contradicting: true,
    });
    expect(r.conflict).toBe(true);
  });
});
