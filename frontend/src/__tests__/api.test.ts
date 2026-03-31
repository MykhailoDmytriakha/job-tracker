import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

// Import after mock is set up
import { tasksApi, boardApi, dashboardApi, ApiError } from "../api";

describe("API client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("tasksApi.list", () => {
    it("fetches tasks with no params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 1, title: "Test" }]),
      });
      const result = await tasksApi.list();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/tasks/",
        expect.objectContaining({ headers: { "Content-Type": "application/json" } })
      );
      expect(result).toEqual([{ id: 1, title: "Test" }]);
    });

    it("passes query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await tasksApi.list({ status: "open", search: "test" });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("status=open"),
        expect.any(Object)
      );
    });
  });

  describe("tasksApi.create", () => {
    it("sends POST with task data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1, title: "New task" }),
      });
      const result = await tasksApi.create({ title: "New task" }, 1);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/tasks/",
        expect.objectContaining({ method: "POST" })
      );
      expect(result.title).toBe("New task");
    });
  });

  describe("tasksApi.update", () => {
    it("sends PUT with changes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1, status: "done" }),
      });
      await tasksApi.update(1, { status: "done" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/tasks/1",
        expect.objectContaining({ method: "PUT" })
      );
    });
  });

  describe("tasksApi.delete", () => {
    it("sends DELETE", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      await tasksApi.delete(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/tasks/1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("error handling", () => {
    it("throws ApiError on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: "Conflict",
        text: () => Promise.resolve('{"detail":"Cannot close"}'),
      });
      await expect(tasksApi.update(1, { status: "done" })).rejects.toThrow(ApiError);
    });

    it("ApiError contains status and body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: "Unprocessable",
        text: () => Promise.resolve('{"detail":"Validation error"}'),
      });
      try {
        await tasksApi.update(1, { status: "waiting" });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(422);
        expect((e as ApiError).body).toContain("Validation error");
      }
    });
  });

  describe("dependency methods", () => {
    it("addDependency sends correct payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      await tasksApi.addDependency(2, 1);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe("http://localhost:8000/api/tasks/2/dependencies");
      expect(JSON.parse(call[1].body)).toEqual({ depends_on_id: 1 });
    });

    it("removeDependency sends DELETE", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      await tasksApi.removeDependency(2, 1);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/tasks/2/dependencies/1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("checklist methods", () => {
    it("addChecklistItem sends POST", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1, text: "Step 1", is_done: false }),
      });
      await tasksApi.addChecklistItem(1, "Step 1", 0);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe("http://localhost:8000/api/tasks/1/checklist");
      expect(JSON.parse(call[1].body)).toEqual({ text: "Step 1", position: 0 });
    });

    it("updateChecklistItem sends PUT", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1, is_done: true }),
      });
      await tasksApi.updateChecklistItem(1, 5, { is_done: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/tasks/1/checklist/5",
        expect.objectContaining({ method: "PUT" })
      );
    });
  });

  describe("chain", () => {
    it("getChain fetches chain data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ nodes: [], edges: [], total: 0 }),
      });
      const result = await tasksApi.getChain(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/tasks/1/chain",
        expect.any(Object)
      );
      expect(result.nodes).toEqual([]);
    });
  });

  describe("board and dashboard", () => {
    it("boardApi.get fetches board", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ columns: [] }),
      });
      const result = await boardApi.get();
      expect(result.columns).toEqual([]);
    });

    it("dashboardApi.get fetches dashboard", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            stats: { total_open: 0, waiting: 0, overdue: 0, blocked: 0, recurring: 0 },
            overdue: [],
            waiting: [],
            recurring: [],
            recent: [],
          }),
      });
      const result = await dashboardApi.get();
      expect(result.stats.total_open).toBe(0);
    });
  });
});
