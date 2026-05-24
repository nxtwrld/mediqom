import { describe, it, expect } from "vitest";
import { LinkType } from "./common.types.d";
import { getAllLinkedItems, getItem } from "./common.utils";

describe("getAllLinkedItems", () => {
  it("returns empty array (implementation pending)", async () => {
    const item: any = { type: LinkType.Report, data: { uid: "r1" } };
    const result = await getAllLinkedItems(item);
    expect(result).toEqual([]);
  });

  it("returns empty array with simple=false", async () => {
    const item: any = { type: LinkType.Contact, data: { uid: "c1" } };
    const result = await getAllLinkedItems(item, false);
    expect(result).toEqual([]);
  });
});

describe("getItem", () => {
  it("returns undefined for Focus type (stub)", async () => {
    const result = await getItem({ uid: "u1", type: LinkType.Focus });
    expect(result).toBeUndefined();
  });

  it("returns undefined for Question type (stub)", async () => {
    const result = await getItem({ uid: "u2", type: LinkType.Question });
    expect(result).toBeUndefined();
  });

  it("returns undefined for Contact type (stub)", async () => {
    const result = await getItem({ uid: "u3", type: LinkType.Contact });
    expect(result).toBeUndefined();
  });

  it("returns undefined for Report type (stub)", async () => {
    const result = await getItem({ uid: "u4", type: LinkType.Report });
    expect(result).toBeUndefined();
  });

  it("returns undefined for unknown/unhandled type", async () => {
    const result = await getItem({ uid: "u5", type: "unknown" as any });
    expect(result).toBeUndefined();
  });
});
