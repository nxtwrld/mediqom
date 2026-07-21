import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockIsNativePlatform, mockGetApiBaseUrl, mockGetClient } = vi.hoisted(() => ({
  mockIsNativePlatform: vi.fn().mockReturnValue(false),
  mockGetApiBaseUrl: vi.fn().mockReturnValue(""),
  mockGetClient: vi.fn().mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}));

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("$lib/config/platform", () => ({
  isNativePlatform: mockIsNativePlatform,
  getApiBaseUrl: mockGetApiBaseUrl,
}));
vi.mock("$lib/supabase", () => ({
  getClient: mockGetClient,
}));

import { apiFetch, apiGet, apiPost, apiPut, apiDelete, ApiError } from "./client";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(status: number, body = "Error") {
  return new Response(body, { status });
}

describe("api/client", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNativePlatform.mockReturnValue(false);
    mockGetApiBaseUrl.mockReturnValue("");
    fetchSpy = vi.fn().mockResolvedValue(makeOkResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── apiFetch ──────────────────────────────────────────────────────────────

  describe("apiFetch", () => {
    it("calls fetch with the given endpoint", async () => {
      await apiFetch("/v1/test");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/test",
        expect.objectContaining({}),
      );
    });

    it("uses custom fetchFn when provided", async () => {
      const customFetch = vi.fn().mockResolvedValue(makeOkResponse({}));
      await apiFetch("/v1/test", { fetch: customFetch });
      expect(customFetch).toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("prepends base URL from getApiBaseUrl for relative paths", async () => {
      mockGetApiBaseUrl.mockReturnValue("https://api.example.com");
      await apiFetch("/v1/test");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/v1/test",
        expect.anything(),
      );
    });

    it("uses absolute URL as-is when provided", async () => {
      await apiFetch("https://external.example.com/v1/test");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://external.example.com/v1/test",
        expect.anything(),
      );
    });

    it("includes credentials: include on web platform", async () => {
      mockIsNativePlatform.mockReturnValue(false);
      await apiFetch("/v1/test");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: "include" }),
      );
    });

    it("includes credentials: omit on native platform", async () => {
      mockIsNativePlatform.mockReturnValue(true);
      await apiFetch("/v1/test");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: "omit" }),
      );
    });

    it("adds Authorization header on native platform with valid session", async () => {
      mockIsNativePlatform.mockReturnValue(true);
      mockGetClient.mockReturnValue({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: "token-abc" } },
          }),
        },
      });
      await apiFetch("/v1/test");
      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer token-abc");
    });

    it("does not add Authorization header on web platform", async () => {
      mockIsNativePlatform.mockReturnValue(false);
      await apiFetch("/v1/test");
      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers as Headers;
      expect(headers.get("Authorization")).toBeNull();
    });

    it("does not add Authorization header when skipAuth=true", async () => {
      mockIsNativePlatform.mockReturnValue(true);
      await apiFetch("/v1/test", { skipAuth: true });
      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers as Headers;
      expect(headers.get("Authorization")).toBeNull();
    });

    it("sets Content-Type: application/json for string body without content-type", async () => {
      await apiFetch("/v1/test", { method: "POST", body: '{"key":"val"}' });
      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers as Headers;
      expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("aborts request after timeout", async () => {
      fetchSpy.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      );
      await expect(apiFetch("/v1/test", { timeout: 10 })).rejects.toThrow();
    });

    it("no timeout when timeout=0", async () => {
      // Should resolve normally without aborting
      fetchSpy.mockResolvedValue(makeOkResponse({}));
      await expect(apiFetch("/v1/test", { timeout: 0 })).resolves.toBeDefined();
    });

    it("forwards additional fetch options", async () => {
      await apiFetch("/v1/test", { method: "DELETE", headers: { "X-Custom": "val" } });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  // ── apiGet ────────────────────────────────────────────────────────────────

  describe("apiGet", () => {
    it("calls apiFetch with GET method", async () => {
      fetchSpy.mockResolvedValue(makeOkResponse({ data: "result" }));
      const result = await apiGet("/v1/resource");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/resource",
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual({ data: "result" });
    });

    it("throws ApiError on non-ok response", async () => {
      fetchSpy.mockResolvedValue(makeErrorResponse(404, "Not Found"));
      await expect(apiGet("/v1/missing")).rejects.toBeInstanceOf(ApiError);
    });

    it("ApiError has the correct status code", async () => {
      fetchSpy.mockResolvedValue(makeErrorResponse(403, "Forbidden"));
      try {
        await apiGet("/v1/forbidden");
      } catch (err) {
        expect((err as ApiError).status).toBe(403);
      }
    });
  });

  // ── apiPost ───────────────────────────────────────────────────────────────

  describe("apiPost", () => {
    it("calls apiFetch with POST method and JSON body", async () => {
      fetchSpy.mockResolvedValue(makeOkResponse({ created: true }));
      const result = await apiPost("/v1/resource", { name: "test" });
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/resource",
        expect.objectContaining({ method: "POST", body: '{"name":"test"}' }),
      );
      expect(result).toEqual({ created: true });
    });

    it("sends POST without body when data is undefined", async () => {
      fetchSpy.mockResolvedValue(makeOkResponse({}));
      await apiPost("/v1/resource");
      const [, options] = fetchSpy.mock.calls[0];
      expect(options.body).toBeUndefined();
    });

    it("throws ApiError on non-ok response", async () => {
      fetchSpy.mockResolvedValue(makeErrorResponse(500, "Server Error"));
      await expect(apiPost("/v1/resource", {})).rejects.toBeInstanceOf(ApiError);
    });
  });

  // ── apiPut ────────────────────────────────────────────────────────────────

  describe("apiPut", () => {
    it("calls apiFetch with PUT method", async () => {
      fetchSpy.mockResolvedValue(makeOkResponse({ updated: true }));
      await apiPut("/v1/resource/1", { name: "new" });
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/resource/1",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    it("throws ApiError on failure", async () => {
      fetchSpy.mockResolvedValue(makeErrorResponse(404));
      await expect(apiPut("/v1/resource/1")).rejects.toBeInstanceOf(ApiError);
    });
  });

  // ── apiDelete ─────────────────────────────────────────────────────────────

  describe("apiDelete", () => {
    it("calls apiFetch with DELETE method", async () => {
      fetchSpy.mockResolvedValue(makeOkResponse({ deleted: true }));
      await apiDelete("/v1/resource/1");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/resource/1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("throws ApiError on failure", async () => {
      fetchSpy.mockResolvedValue(makeErrorResponse(403));
      await expect(apiDelete("/v1/resource/1")).rejects.toBeInstanceOf(ApiError);
    });
  });

  // ── ApiError ──────────────────────────────────────────────────────────────

  describe("ApiError", () => {
    it("stores status and message", () => {
      const err = new ApiError(404, "Not Found", "body text");
      expect(err.status).toBe(404);
      expect(err.message).toBe("Not Found");
      expect(err.body).toBe("body text");
      expect(err.name).toBe("ApiError");
    });

    it("isUnauthorized is true for 401", () => {
      expect(new ApiError(401, "").isUnauthorized).toBe(true);
      expect(new ApiError(403, "").isUnauthorized).toBe(false);
    });

    it("isForbidden is true for 403", () => {
      expect(new ApiError(403, "").isForbidden).toBe(true);
      expect(new ApiError(401, "").isForbidden).toBe(false);
    });

    it("isNotFound is true for 404", () => {
      expect(new ApiError(404, "").isNotFound).toBe(true);
      expect(new ApiError(403, "").isNotFound).toBe(false);
    });

    it("isServerError is true for 5xx", () => {
      expect(new ApiError(500, "").isServerError).toBe(true);
      expect(new ApiError(503, "").isServerError).toBe(true);
      expect(new ApiError(404, "").isServerError).toBe(false);
    });

    it("is an instance of Error", () => {
      expect(new ApiError(500, "error")).toBeInstanceOf(Error);
    });
  });
});
