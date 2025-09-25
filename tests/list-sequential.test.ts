import { describe, it, expect, vi } from "vitest";
import useApi from "./../src/index.ts";
import nock from "nock";
import { CODES } from "../src/types.js";
import { fill, range } from "es-toolkit";
import { ceil, divide, forEach, slice } from "es-toolkit/compat";

const mockTime = {
  "start": 1741699660.029826,
  "finish": 1741699660.111687,
  "duration": 0.08186101913452148,
  "processing": 0.0500180721282959,
  "date_start": "2025-03-11T16:27:40+03:00",
  "date_finish": "2025-03-11T16:27:40+03:00",
  "operating_reset_at": 1741700260,
  "operating": 1.8415930271148682,
};

describe("list-sequential tests", () => {
  it.each([{ total: 150, size: 50 }, { total: 155, size: 50 }, { total: 45, size: 20 }, { total: 20, size: 20 }, { total: 10, size: 20 }])
  ("sequential total: $total, size: $size", async ({ total, size }) => {
    const result = fill(Array(total), {"ID": "id", "STATUS_ID": "1"});

    forEach(range(0, total, size), (start) => {
      nock(process.env.WEBHOOK_URL || "").post('/crm.lead.list', { start }).reply(CODES.OK, {
        result: slice(result, start, start + size),
        total: total,
        time: mockTime,
        ...(start + size >= total ? {} : { next: start + size }),
      });
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const api = useApi();
    const res = await api.listSequential({ request: { method: "crm.lead.list" }, listSize: size });
    expect(fetchSpy).toHaveBeenCalledTimes(ceil(divide(total, size)));
    expect(res).toEqual(result);
  }, 30000)
});