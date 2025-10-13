import type { ApiRecord, ApiRequestList } from "../types.js";
import { useHelpers } from "./index.js";
import { forEach, get, has, map, max, set, size } from "es-toolkit/compat";
import { cloneDeep, compact, flatten, merge, zip } from "es-toolkit";

const useReferenceNoCount = ({ request, updates, idKey, listSize, batchSize, withPayload }: { request: ApiRequestList, updates: Array<ApiRecord>, idKey: string, listSize: number, batchSize: number, withPayload: boolean }) => {
  const filter = get(request, "parameters.filter");
  if (request.parameters && request.parameters.order) throw new Error("Ordering parameters are reserved in `referenceBatchedNoCount` method.");
  const idFrom = `>${idKey}`;
  const idTo = `<${idKey}`;
  if (filter && has(filter, idFrom)) throw new Error(`Filter parameter "${idFrom}" is reserved in "referenceBatchedNoCount" method.`);

  const tailRequests = () => {
    return map(updates, (item) => {
      if (has(item, idFrom)) throw new Error(`Filter parameters ${idFrom} is reserved in "referenceBatchedNoCount" method.`);
      const cloneRequest = cloneDeep(request);
      set(cloneRequest, "parameters.filter", merge(get(cloneRequest, "parameters.filter", {}), item));
      set(cloneRequest, "parameters.start", -1);
      set(cloneRequest, "parameters.order", { "ID": "ASC" });
      return cloneRequest;
    })
  };

  const headRequests = ({ bodyRequests, bodyResults }: { bodyRequests: ApiRequestList[], bodyResults: unknown[]}) => {
    const result: ApiRequestList[] = [];
    // if (size(bodyRequests) !== size(bodyResults)) throw new Error(`Expecting body requests and results to be the same size. Got: ${size(bodyRequests)} requests and ${size(bodyResults)} results.`);
    forEach(zip(bodyRequests, bodyResults), ([ bodyRequest, bodyResult ]) => {
      if (size(bodyResult) === listSize ) {
        // console.log(bodyResult, 'body result')
        const maxId = max(map(map(bodyResult, idKey), (item) => Number(item)));
        const headRequest = cloneDeep(bodyRequest);
        set(headRequest, ["parameters", "filter", idFrom], maxId);
        // TODO: headRequest иногда undefined непонятно почему, продебажить
        // console.log(headRequest, 'headRequest');
        result.push(headRequest);
      }
    });
    return compact(result);
  };

  const bodyResults = (results: unknown[]) => {
    return flatten(results);
  };

  return {
    listSize,
    batchSize,
    withPayload,
    tailRequests,
    headRequests,
    bodyResults,
  }

}

export { useReferenceNoCount };