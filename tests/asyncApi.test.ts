import { describe, it, expect, vi, beforeEach } from "vitest";

const settings = {
  webhookUrl: "https://example.bitrix24.ru/rest/1/secret/",
  batchSize: 3,
  listSize: 2,
  retryAttempts: 3,
  retryDelay: 10,
  retryBackoffBase: 2,
  retryStatuses: [429, 500, 502, 503, 504]
};

function makeClient(mockFetch: any) {
  return new AsyncBitrix24({
    settings,
    fetchImpl: mockFetch,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  });
}

describe("AsyncBitrix24.call", () => {
  it("returns result", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { ok: true } })
    });
    const client = makeClient(mockFetch);
    const result = await client.call({ method: "crm.lead.get", parameters: { id: 10 } });
    expect(result).toEqual({ ok: true });
  });

  it("retries on retryable status", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: "SERVICE_UNAVAILABLE" })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: { success: true } })
      });
    const client = makeClient(mockFetch);
    const result = await client.call({ method: "test.ping" });
    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("AsyncBitrix24.batch", () => {
  it("batches requests preserving order", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          result: { _0: { a: 1 }, _1: { b: 2 } },
          result_error: {},
          result_time: { _0: 1, _1: 1 },
          result_total: {},
          result_next: {}
        }
      })
    });
    const client = makeClient(mockFetch);
    const reqs: Request[] = [{ method: "a.method" }, { method: "b.method" }];
    const collected: any[] = [];
    for await (const r of client.batch(reqs)) {
      collected.push(r);
    }
    expect(collected).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("withPayload yields tuples", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          result: { _0: [1, 2] },
          result_error: {},
          result_time: { _0: 1 },
          result_total: {},
          result_next: {}
        }
      })
    });
    const client = makeClient(mockFetch);
    const input = [[{ method: "list.method" }, { meta: 42 }]] as any;
    const out: any[] = [];
    for await (const v of client.batch(input, { listMethod: true, withPayload: true })) {
      out.push(v);
    }
    expect(out).toEqual([[[1, 2], { meta: 42 }]]);
  });
});

describe("AsyncBitrix24.list_sequential", () => {
  it("iterates over pages", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: [{ id: 1 }, { id: 2 }], total: 4, next: 2 })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: [{ id: 3 }, { id: 4 }], total: 4, next: null })
      });
    const client = makeClient(mockFetch);
    const ids: number[] = [];
    for await (const item of client.list_sequential({ method: "crm.item.list" })) {
      ids.push(item.id);
    }
    expect(ids).toEqual([1, 2, 3, 4]);
  });
});

describe("AsyncBitrix24.list_batched_no_count", () => {
  it("returns merged items (simplified boundary test)", async () => {
    // boundary batch: head ASC + tail DESC
    const mockFetch = vi.fn()
      // batch boundary
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            result: {
              _0: [{ ID: 1 }, { ID: 2 }],
              _1: [{ ID: 10 }, { ID: 9 }]
            },
            result_error: {},
            result_time: { _0: 1, _1: 1 },
            result_total: {},
            result_next: {}
          }
        })
      })
      // body batch (пример одного промежуточного запроса)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            result: { _0: [{ ID: 3 }, { ID: 4 }] },
            result_error: {},
            result_time: { _0: 1 },
            result_total: {},
            result_next: {}
          }
        })
      });

    const client = makeClient(mockFetch);
    const items: number[] = [];
    for await (const it of client.list_batched_no_count({ method: "crm.deal.list", parameters: { filter: {}, select: [] } })) {
      items.push(it.ID);
    }
    // head: 1,2 ; body: 3,4 ; tail_results: > maxHeadId (maxHeadId=2) из tail (10,9) => 10,9
    expect(items).toEqual([1, 2, 3, 4, 10, 9]);
  });
});