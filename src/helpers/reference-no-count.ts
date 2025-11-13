import type { ApiRecord, ApiRequestList } from "../types";
import { forEach, get, has, map, max, set, size } from "es-toolkit/compat";
import { cloneDeep, compact, flatten, isNotNil, merge, zip } from "es-toolkit";

const useReferenceNoCount = ({
  request,
  updates,
  idKey,
  listSize,
  batchSize,
  withPayload,
}: {
  request: ApiRequestList;
  updates: Array<{ filter: ApiRecord; payload?: unknown }>;
  idKey: string;
  listSize: number;
  batchSize: number;
  withPayload: boolean;
}) => {
  const filter = get(request, "parameters.filter");
  if (request.parameters && request.parameters.order) throw new Error("Ordering parameters are reserved in `referenceBatchedNoCount` method.");
  const idFrom = `>${idKey}`;
  if (filter && has(filter, idFrom)) throw new Error(`Filter parameter "${idFrom}" is reserved in "referenceBatchedNoCount" method.`);

  const tailRequests = () => {
    return map(updates, (item) => {
      if (has(item.filter, idFrom)) throw new Error(`Filter parameters ${idFrom} is reserved in "referenceBatchedNoCount" method.`);
      const cloneRequest = cloneDeep(request);
      set(cloneRequest, "parameters.filter", merge(get(cloneRequest, "parameters.filter", {}), item.filter));
      set(cloneRequest, "parameters.start", -1);
      set(cloneRequest, "parameters.order", { ID: "ASC" });
      if (isNotNil(item.payload)) set(cloneRequest, "payload", item.payload);
      return cloneRequest;
    });
  };

  const headRequests = ({ bodyRequests, bodyResults }: { bodyRequests: ApiRequestList[]; bodyResults: unknown[] | [unknown[], unknown[]] }) => {
    const result: ApiRequestList[] = [];
    forEach(zip(bodyRequests, bodyResults), ([bodyRequest, bodyResult]) => {
      let payload;
      if (withPayload) {
        [bodyResult, payload] = bodyResult as unknown[];
      }
      if (size(bodyResult as unknown[]) === listSize) {
        const maxId = max(map(map(bodyResult as unknown[], idKey), (item) => Number(item)));
        const headRequest = cloneDeep(bodyRequest);
        set(headRequest, ["parameters", "filter", idFrom], maxId);
        // TODO: headRequest иногда undefined непонятно почему, продебажить
        if (isNotNil(payload)) set(headRequest, "payload", payload);
        result.push(headRequest);
      }
    });
    return compact(result);
  };

  const bodyResults = (results: unknown[]) => {
    if (withPayload) return results;
    return flatten(results);
  };

  return {
    listSize,
    batchSize,
    withPayload,
    tailRequests,
    headRequests,
    bodyResults,
  };
};

export { useReferenceNoCount };
