import { describe, it, expect } from "vitest";
import useApi from "./../src/index.ts";
import nock from "nock";
import { inRange, isEqual, mapValues, range, sortBy } from "es-toolkit";
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


describe("Reference batched no count tests", () => {
  it.each([
    { total: 150, listSize: 50, batch: 1 },
    { total: 155, listSize: 50, batch: 1 },
    { total: 10, listSize: 50, batch: 50 },
    { total: 20, listSize: 20, batch: 20 },
  ])
  ("Reference batched total: $total, listSize: listSize, batch: $batch", async ({ total, listSize, batch }) => {
    let result = [];
    for (const i of range(total)) {
      for (const j of range(total - 1)) {
        result.push({"ID": i + j * total, "ENTITY_TYPE": "deal", "ENTITY_ID": j})
      }
    }
    result = sortBy(result, ["ID"])

    nock(process.env.WEBHOOK_URL || "").post('/batch').reply((_, body, cb) => {
      const commands: Record<string, string> = get(body, "cmd", {});
      const output = {};
      forEach(commands, (command, key) => {
        const [ method, query ] = command.split("?");
        const params = parse(query!);
        const entityId = Number(get(params, "filter[=ENTITY_ID]", -1));
        const fromId = Number(get(params, "filter[>ID]", -1));
        if (size(castArray(fromId)) !== 1) return [400, { error: 'invalid filter' }];

        const data = reduce(result, (acc, item) => {
          // console.log(entityId, fromId)
          if (item["ENTITY_ID"] === entityId && item["ID"] > fromId) {acc.push(item)}
          return acc
        }, [] as typeof result)

        const cut = slice(data, 0, listSize);
        // console.log(entityId, fromId, cut,'cut')
        if (entityId === 1 || entityId === 0) {
          // console.log(slice(data, 0, 100), 'data')
        }
        set(output, key, cut);
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
    const res = await api.referenceBatchedNoCount({
      request: { method: "crm.timeline.comment.list",
      parameters: {
        select: ["ID", "ENTITY_ID"],
        filter: {"=ENTITY_TYPE": "deal"},
        }
      },
      updates: Array.from(Array(total), (_, idx) => ({"=ENTITY_ID": idx})),
      listSize: listSize,
      batchSize: batch,
    });
    // console.log(slice(result, 100, 150));
    // console.log(slice(res, 100, 150), "res");
    expect(sortBy(res, ["ID"])).toEqual(result);
    nock.cleanAll();
  }, 30000)
});