import { describe, it, expect } from "vitest";
import useApi from "./../src/index.ts";
import nock from "nock";
import { inRange, isEqual, mapValues } from "es-toolkit";
import {
  castArray,
  forEach,
  get,
  reduce, reverse,
  set,
  size,
  slice,
} from "es-toolkit/compat";
import { parse } from "qs";

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


describe("batched no count tests", () => {
  it.each([
    { total: 150, listSize: 50, batch: 1 },
    { total: 155, listSize: 50, batch: 1 },
    { total: 10, listSize: 50, batch: 50 },
    { total: 20, listSize: 20, batch: 20 },
    { total: 5500, listSize: 50, batch: 50 }
  ])
  ("batched total: $total, listSize: listSize, batch: $batch", async ({ total, listSize, batch }) => {
    const result = Array.from(Array(total), (_, idx) => ({"ID": idx, "STATUS_ID": "1"})) ;

    nock(process.env.WEBHOOK_URL || "").post('/batch').reply((_, body, cb) => {
      const commands: Record<string, string> = get(body, "cmd", {});
      const output = {};
      forEach(commands, (command, key) => {
        const [ method, query ] = command.split("?");
        const params = parse(query!);
        const isReverse = isEqual(get(params, "order.ID"), "DESC");
        const fromId = Number(get(params, "filter[>ID]", -1));
        if (size(castArray(fromId)) !== 1) return [400, { error: 'invalid filter' }];
        const toId = Number(get(params, "filter[<ID]", total));
        if (size(castArray(toId)) !== 1) return [400, { error: 'invalid filter' }];
        const data = reduce(result, (acc, item) => {
          if (fromId+1 !== toId && inRange(item["ID"], fromId+1, toId)) acc.push(item);
          return acc;
        }, [] as typeof result);

        const resultData = isReverse ? reverse(data) : data;
        set(output, key, slice(resultData, 0, listSize));
      });
      cb(null, [200, {
        result: {
          result: output,
          result_error: [],
          result_total: [],
          result_next: [],
          result_time: mapValues(output, () => mockTime),
        },
        time: mockTime,
      }])
    }).persist();

    const api = useApi();
    const res = await api.listBatchedNoCount({ request: { method: "crm.lead.list", parameters: {
      select: ["ID", "STATUS_ID"],
      filter: { ">DATE": new Date('2025-03-14') },
    } }, listSize: listSize, batchSize: batch })
    expect(res).toEqual(result);
    nock.cleanAll()
  }, 30000)
});