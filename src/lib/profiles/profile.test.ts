import { describe, it, expect, vi, beforeEach } from "vitest";
import { readable } from "svelte/store";

const { mockGenerateId, mockGetLatest, mockByUser, mockResolveChatMode, mockUserGet } =
  vi.hoisted(() => ({
    mockGenerateId: vi.fn().mockReturnValue("thread-1"),
    mockGetLatest: vi.fn().mockReturnValue(null),
    mockByUser: vi.fn(),
    mockResolveChatMode: vi.fn().mockReturnValue("patient"),
    mockUserGet: vi.fn().mockReturnValue({ isMedical: false }),
  }));

vi.mock("$lib/utils/id", () => ({
  generateId: mockGenerateId,
}));

vi.mock("$lib/ui", () => ({
  default: {
    getLatest: mockGetLatest,
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock("$lib/user", () => ({
  default: {
    get: mockUserGet,
    subscribe: vi.fn(),
  },
}));

vi.mock("$lib/chat/store", () => ({
  resolveChatMode: mockResolveChatMode,
}));

vi.mock("$lib/documents", () => ({
  byUser: mockByUser,
  documents: { subscribe: vi.fn() },
  profileStores: {},
}));

// Import AFTER mocks are defined
import profileStore from "./profile";

describe("profiles/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateId.mockReturnValue("thread-1");
    mockGetLatest.mockReturnValue(null);
    mockResolveChatMode.mockReturnValue("patient");
    mockUserGet.mockReturnValue({ isMedical: false });
    mockByUser.mockReturnValue(readable([]));
  });

  describe("default export", () => {
    it("has a get() method", () => {
      expect(typeof profileStore.get).toBe("function");
    });

    it("has a createChatContext method", () => {
      expect(typeof profileStore.createChatContext).toBe("function");
    });

    it("has subscribe method (is a store)", () => {
      expect(typeof profileStore.subscribe).toBe("function");
    });
  });

  describe("createChatContext", () => {
    it("returns object with correct shape", () => {
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane Doe",
        true,
        "en",
        "/dashboard",
      );

      expect(ctx).toHaveProperty("mode");
      expect(ctx).toHaveProperty("currentProfileId");
      expect(ctx).toHaveProperty("language");
      expect(ctx).toHaveProperty("pageContext");
      expect(ctx).toHaveProperty("isOwnProfile");
      expect(ctx).toHaveProperty("conversationThreadId");
    });

    it("sets currentProfileId from argument", () => {
      const ctx = profileStore.createChatContext(
        "profile-xyz",
        "John",
        false,
        "de",
        "/",
      );
      expect(ctx.currentProfileId).toBe("profile-xyz");
    });

    it("sets language from argument", () => {
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "cs",
        "/",
      );
      expect(ctx.language).toBe("cs");
    });

    it("sets isOwnProfile from argument (true)", () => {
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
      );
      expect(ctx.isOwnProfile).toBe(true);
    });

    it("sets isOwnProfile from argument (false)", () => {
      const ctx = profileStore.createChatContext(
        "profile-2",
        "Bob",
        false,
        "en",
        "/",
      );
      expect(ctx.isOwnProfile).toBe(false);
    });

    it("sets pageContext.route from currentRoute", () => {
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/med/p/profile-1/documents",
      );
      expect(ctx.pageContext.route).toBe("/med/p/profile-1/documents");
    });

    it("sets pageContext.profileName from profileName", () => {
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Dr. Smith",
        false,
        "en",
        "/",
      );
      expect(ctx.pageContext.profileName).toBe("Dr. Smith");
    });

    it("uses generateId for conversationThreadId", () => {
      mockGenerateId.mockReturnValue("my-thread-id");
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
      );
      expect(ctx.conversationThreadId).toBe("my-thread-id");
    });

    it("calls resolveChatMode with isOwnProfile and isMedical", () => {
      mockUserGet.mockReturnValue({ isMedical: true });
      mockResolveChatMode.mockReturnValue("clinical");

      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        false,
        "en",
        "/",
      );
      expect(mockResolveChatMode).toHaveBeenCalledWith(false, true);
      expect(ctx.mode).toBe("clinical");
    });

    it("defaults mode to resolveChatMode result", () => {
      mockResolveChatMode.mockReturnValue("caregiver");
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        false,
        "en",
        "/",
      );
      expect(ctx.mode).toBe("caregiver");
    });

    it("includes conditions from healthData", () => {
      const healthData = {
        conditions: [
          { name: "Diabetes" },
          { name: "Hypertension" },
        ],
      };
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
        healthData,
      );
      expect(ctx.pageContext.availableData.conditions).toContain("Diabetes");
      expect(ctx.pageContext.availableData.conditions).toContain("Hypertension");
    });

    it("includes medications from healthData", () => {
      const healthData = {
        medications: [
          { name: "Metformin" },
          { name: "Lisinopril" },
        ],
      };
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
        healthData,
      );
      expect(ctx.pageContext.availableData.medications).toContain("Metformin");
      expect(ctx.pageContext.availableData.medications).toContain("Lisinopril");
    });

    it("includes vitals when height/weight signals present", () => {
      const healthData = {
        signals: {
          height: { values: [{ value: 175, unit: " cm" }] },
          weight: { values: [{ value: 70, unit: " kg" }] },
        },
      };
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
        healthData,
      );
      expect(ctx.pageContext.availableData.vitals).toContain("Height: 175 cm");
      expect(ctx.pageContext.availableData.vitals).toContain("Weight: 70 kg");
    });

    it("includes healthDocumentId in available documents when healthData provided", () => {
      const healthData = { birthDate: "1990-01-01" };
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
        healthData,
        "health-doc-id",
      );
      expect(ctx.pageContext.availableData.documents).toContain("health-doc-id");
    });

    it("includes documentsContent for health document when provided", () => {
      const healthData = {
        birthDate: "1990-01-01",
        biologicalSex: "female",
        bloodType: "A+",
        conditions: [{ name: "Asthma" }],
        medications: [{ name: "Ventolin" }],
      };
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
        healthData,
        "health-doc-id",
      );
      expect(ctx.pageContext.documentsContent).toBeDefined();
      expect(ctx.pageContext.documentsContent?.get("health-doc-id")).toMatchObject({
        birthDate: "1990-01-01",
        biologicalSex: "female",
        conditionCount: 1,
        medicationCount: 1,
      });
    });

    it("includes document from ui.getLatest when profileId matches", () => {
      mockGetLatest.mockReturnValue({
        data: {
          profileId: "profile-1",
          documentId: "doc-from-event",
          content: { title: "Report" },
        },
      });
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
      );
      expect(ctx.pageContext.availableData.documents).toContain("doc-from-event");
    });

    it("does not include ui document when profileId does not match", () => {
      mockGetLatest.mockReturnValue({
        data: {
          profileId: "other-profile",
          documentId: "doc-from-other",
          content: { title: "Other Report" },
        },
      });
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
      );
      expect(ctx.pageContext.availableData.documents).not.toContain(
        "doc-from-other",
      );
    });

    it("includes profile docs from byUser store", () => {
      const docs = [
        { id: "doc-a", content: { title: "Doc A" }, metadata: { category: "lab", tags: [] }, created_at: "2024-01-01" },
        { id: "doc-b", content: { title: "Doc B" }, metadata: { category: "imaging", tags: [] }, created_at: "2024-02-01" },
      ];
      mockByUser.mockReturnValue(readable(docs));

      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
      );
      expect(ctx.pageContext.availableData.documents).toContain("doc-a");
      expect(ctx.pageContext.availableData.documents).toContain("doc-b");
    });

    it("builds documentCatalog from profile docs", () => {
      const docs = [
        {
          id: "doc-cat-1",
          content: { title: "Blood Test" },
          metadata: { category: "lab", tags: ["CBC", "glucose"], date: "2024-03-01" },
          created_at: "2024-03-01",
        },
      ];
      mockByUser.mockReturnValue(readable(docs));

      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
      );
      expect(ctx.pageContext.documentCatalog).toBeDefined();
      expect(ctx.pageContext.documentCatalog?.[0]).toMatchObject({
        id: "doc-cat-1",
        title: "Blood Test",
        category: "lab",
        date: "2024-03-01",
      });
    });

    it("returns empty conditions and medications when healthData is undefined", () => {
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
      );
      expect(ctx.pageContext.availableData.conditions).toEqual([]);
      expect(ctx.pageContext.availableData.medications).toEqual([]);
      expect(ctx.pageContext.availableData.vitals).toEqual([]);
    });

    it("handles string conditions and medications in healthData", () => {
      const healthData = {
        conditions: ["Asthma"],
        medications: ["Aspirin"],
      };
      const ctx = profileStore.createChatContext(
        "profile-1",
        "Jane",
        true,
        "en",
        "/",
        healthData,
      );
      expect(ctx.pageContext.availableData.conditions).toContain("Asthma");
      expect(ctx.pageContext.availableData.medications).toContain("Aspirin");
    });

    it("calls byUser with the given profileId", () => {
      profileStore.createChatContext("profile-abc", "Jane", true, "en", "/");
      expect(mockByUser).toHaveBeenCalledWith("profile-abc");
    });
  });
});
