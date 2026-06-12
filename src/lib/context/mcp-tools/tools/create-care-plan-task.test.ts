import { describe, it, expect, vi, beforeEach } from "vitest";
import { readable } from "svelte/store";

const { mockAddUserTask, mockLogNamespace } = vi.hoisted(() => ({
  mockAddUserTask: vi.fn(),
  mockLogNamespace: vi.fn(),
}));

vi.mock("$lib/careplan/store", () => ({ addUserTask: mockAddUserTask }));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: mockLogNamespace.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// BaseMedicalTool peer imports.
vi.mock("$lib/user", () => ({
  default: {
    subscribe: vi.fn((cb: (v: any) => void) => { cb(null); return () => {}; }),
    getId: vi.fn(() => null),
  },
}));
vi.mock("$lib/profiles", () => ({
  profiles: { subscribe: vi.fn((cb: any) => { cb([]); return () => {}; }) },
}));
vi.mock("$lib/documents", () => ({
  byUser: vi.fn(() => readable([])),
  getDocument: vi.fn().mockResolvedValue(null),
}));

import { CreateCarePlanTaskTool } from "./create-care-plan-task";

describe("CreateCarePlanTaskTool", () => {
  const tool = new CreateCarePlanTaskTool();
  beforeEach(() => mockAddUserTask.mockReset());

  it("exposes a mutating-task tool definition", () => {
    const def = tool.getToolDefinition();
    expect(def.name).toBe("createCarePlanTask");
    expect(def.inputSchema.required).toEqual(
      expect.arrayContaining(["itemId", "text", "category", "priority"]),
    );
  });

  it("adds a task and returns its summary", async () => {
    mockAddUserTask.mockResolvedValue({ id: "t1", text: "Call your doctor", status: "pending" });
    const result = await tool.execute(
      { itemId: "i1", text: "Call your doctor", category: "follow_up", priority: "routine", sourceMessageId: "m9" },
      "p1",
    );
    expect(mockAddUserTask).toHaveBeenCalledWith(
      "p1",
      "i1",
      { text: "Call your doctor", category: "follow_up", priority: "routine", timeframeNormalized: undefined },
      { sourceMessageId: "m9" },
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Call your doctor");
  });

  it("errors when required params are missing", async () => {
    const result = await tool.execute({ itemId: "i1" }, "p1");
    expect(result.isError).toBe(true);
    expect(mockAddUserTask).not.toHaveBeenCalled();
  });

  it("errors when the item does not exist", async () => {
    mockAddUserTask.mockResolvedValue(null);
    const result = await tool.execute(
      { itemId: "ghost", text: "x", category: "follow_up", priority: "routine" },
      "p1",
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});

describe("createCarePlanTask security policy", () => {
  it("is registered as mutating and requires ownership", async () => {
    const { mcpSecurityService } = await import("../security-audit");
    // The policy map is private; validate behaviour: a mutating tool with no
    // user is denied by the auth gate.
    const denied = await mcpSecurityService.validateAccess(
      "createCarePlanTask",
      { user: undefined as any, profileId: "p1" },
    );
    expect(denied.allowed).toBe(false);
  });
});
