import { describe, it, expect } from "vitest";
import useApi from "./../src/index.ts";
import nock from "nock";
import { CODES } from "../src/types.js";
import { range } from "es-toolkit";
import {
  ceil,
  divide,
  forEach,
  min,
  padStart,
  set,
  slice,
} from "es-toolkit/compat";

const mockTime = {
  start: 1741699660.029826,
  finish: 1741699660.111687,
  duration: 0.08186101913452148,
  processing: 0.0500180721282959,
  date_start: "2025-03-11T16:27:40+03:00",
  date_finish: "2025-03-11T16:27:40+03:00",
  operating_reset_at: 1741700260,
  operating: 1.8415930271148682,
};

describe("list-batched tests", () => {
  it.each([
    { total: 150, listSize: 50, batch: 1 },
    { total: 155, listSize: 50, batch: 1 },
    { total: 10, listSize: 50, batch: 50 },
    { total: 20, listSize: 20, batch: 20 },
    { total: 5500, listSize: 50, batch: 50 },
  ])(
    "batched total: $total, listSize: listSize, batch: $batch",
    async ({ total, listSize, batch }) => {
      const result = Array.from(Array(total), (_, idx) => ({
        ID: idx,
        STATUS_ID: "1",
      }));
      nock(process.env.WEBHOOK_URL || "")
        .post("/crm.lead.list", { start: 0 })
        .reply(CODES.OK, {
          result: slice(result, 0, listSize),
          total: total,
          time: mockTime,
        });

      forEach(range(listSize, total, listSize * batch), (batchStart) => {
        const maxChunks = ceil(divide(total - batchStart, batch));
        const commands = {};
        const results = {};
        const times = {};

        forEach(range(Number(min([batch, maxChunks]))), (chunk) => {
          const width = String(min([batch, maxChunks])).length;
          const start = batchStart + chunk * listSize;
          const key = `_${padStart(String(chunk), width, "0")}`;
          set(commands, key, `crm.lead.list?start=${start}`);
          set(results, key, slice(result, start, start + listSize));
          set(times, key, mockTime);
        });

        nock(process.env.WEBHOOK_URL || "")
          .post("/batch", { halt: true, cmd: commands })
          .reply(CODES.OK, {
            result: {
              result: results,
              result_error: [],
              result_total: [],
              result_next: [],
              result_time: times,
            },
            total: total,
            time: mockTime,
          });
      });
      const api = useApi();
      const res = await api.listBatched({
        request: { method: "crm.lead.list" },
        listSize: listSize,
        batchSize: batch,
      });
      expect(res).toEqual(result);
    },
    30000,
  );
});
