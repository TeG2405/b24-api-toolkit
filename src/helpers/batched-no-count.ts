import type { ApiRequest, ApiRequestList, ListParameters, ResponseSuccess } from "../types.js";
import { forEach, get, has, map, max, min, set } from "es-toolkit/compat";
import { cloneDeep, forEachRight, range } from "es-toolkit";
import { useHelpers } from "./index.js";


const useBatchedNoCount = ({ request, idKey, listSize, batchSize }: { request: ApiRequestList, idKey: string, listSize: number, batchSize: number }) => {
  const { getListResult } = useHelpers();
  const filter = get(request, "parameters.filter");
  if (request.parameters && request.parameters.order) throw new Error("Ordering parameters are reserved in `listBatchedNoCount` method.");
  const idFrom = `>${idKey}`;
  const idTo = `<${idKey}`;
  if (filter && (has(filter, idFrom) || has(filter, idTo))) throw new Error(`Filter parameters "${idFrom}" and "${idTo}" are reserved in "listBatchedNoCount" method.`);

  const headRequest = () => {
    const cloneRequest = cloneDeep(request);
    set(cloneRequest, "parameters.start", -1);
    set(cloneRequest, "parameters.order", {"ID": "ASC"});
    return cloneRequest;
  };

  const tailRequest = () => {
    const cloneRequest = cloneDeep(request);
    set(cloneRequest, "parameters.start", -1);
    set(cloneRequest, "parameters.order", {"ID": "DESC"});
    return cloneRequest;
  };

  const bodyRequests = ({ headResult, tailResult }: { headResult: ResponseSuccess["result"], tailResult: ResponseSuccess["result"] }) => {
    const headList = getListResult(headResult);
    const tailList = getListResult(tailResult);
    const maxHeadId = max(map(map(headList, idKey), (item) => Number(item)));
    const minTailId = min(map(map(tailList, idKey), (item) => Number(item)));
    const result: Array<typeof request> = [];
    if ((maxHeadId && minTailId) && maxHeadId < minTailId) {
      forEach(range(maxHeadId, minTailId, listSize), (start) => {
        const bodyRequest = headRequest();
        set(bodyRequest, ["parameters", "filter", idFrom], start);
        set(bodyRequest, ["parameters", "filter", idTo], min([start + listSize + 1, minTailId]));
        result.push(bodyRequest);
      })
    }
    return result;
  };

  const tailResults = ({ headResult, tailResult }: { headResult: ResponseSuccess["result"], tailResult: ResponseSuccess["result"] }) => {
    const headList = getListResult(headResult);
    const tailList = getListResult(tailResult);
    const result: unknown[] = [];
    const maxHeadId = max(map(map(headList, idKey), (item) => Number(item)));
    forEachRight(tailList, (item) => {
      const itemId = Number(get(item, idKey));
      if (maxHeadId && itemId > maxHeadId) result.push(item)
    })
    return result;
  };

  return {
    headRequest,
    tailRequest,
    tailResults,
    bodyRequests,
  }
};

export { useBatchedNoCount }