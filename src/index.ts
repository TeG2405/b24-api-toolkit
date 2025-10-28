import type {
  ApiRecord,
  ApiRequest,
  ApiRequestList,
  Batch,
  ResponseSuccess,
  ResponseType
} from "./types.ts";
import { ResponseBatchSchema, ResponseErrorSchema, ResponseSchema } from "./schemas.ts";
import client from "./client.ts"
import buildQuery from "./build-query.ts";
import config from "./settings.ts";
import {
  chunk,
  compact,
  difference,
  mapValues,
  retry,
} from "es-toolkit";
import {
  first,
  forEach,
  get,
  isEmpty,
  join,
  keys,
  padStart,
  reduce,
  set,
  values,
  castArray, size, concat, map,
} from "es-toolkit/compat";
import { useHelpers } from "./helpers/index.ts";
import { useBatchedNoCount } from "./helpers/batched-no-count.js";
import { useReferenceNoCount } from "./helpers/reference-no-count.js";
const useApi = () => {
  const { getTail, getListResult, shouldBatchRetry, shouldCallRetry, throwError, isResponseError } = useHelpers();

  const call = async ({ method, parameters, options = {} }: ApiRequest) => {
    const settings = {
      json: parameters,
      ...options
    };
    const controller = new AbortController();
    let attempt = 0;
    return await retry(async () => {
      attempt++;
      const response = await client(method, settings);
      const body = await response.json<ResponseType>();
      if (shouldCallRetry({ response, body }) && attempt < config.retry.attempts) throw new Error("__RETRY__");
      controller.abort();
      if (isResponseError(body)) throwError(body);
      if (response.status >= 300) throw new Error(`Request failed with status code ${response.status}`);
      return ResponseSchema.parse(body);
    }, {
      retries: config.retry.attempts,
      delay: config.retry.delay,
      signal: controller.signal,
    });
  };

  //@ts-ignore
  const batch: Batch = async ({ requests, batchSize, listMethod, withPayload }) => {
    const size = batchSize || config.batchSize;
    const chunks = chunk(requests, size);
    const responses: ResponseSuccess["result"][] = [];
    const responsesWithPayload: [ResponseSuccess["result"], unknown][] = [];
    for (const chunk of chunks) {
      const width = String(chunk.length).length;
      const commands: Record<string, { cmd: string; payload?: unknown }> = reduce(chunk, (acc, curr, idx) => {
        const key = `_${padStart(String(idx), width, '0')}`;
        const cmd = join(compact([curr.method, buildQuery(curr.parameters || {})]), "?");
        const payload = get(curr, "payload");
        return set(acc, key, { cmd, payload });
      }, {});
      const parameters = {
        halt: true,
        cmd: mapValues(commands, (command) => command.cmd),
      };

      let attempt = 0;
      const controller = new AbortController();

      const result = await retry(async () => {
        attempt++;
        // TODO: здесь ошибка, нужно обработать throw из call, иначе будет попадать в ретрай
        const response = await call({ method: "batch", parameters });
        const result = ResponseBatchSchema.parse(response.result);
        const errors = result.result_error;
        const missedResultKeys = difference(keys(commands), keys(result.result));
        const missedResultTimeKeys = difference(keys(commands), keys(result.result_time));
        if (shouldBatchRetry(errors) && attempt < config.retry.attempts) throw new Error("__RETRY__");
        controller.abort();
        if (!isEmpty(errors)) throwError(ResponseErrorSchema.parse(first(values(errors))));
        if (!isEmpty(missedResultKeys)) {
          const key = String(first(missedResultKeys));
          throw new Error(`Expecting 'result' to contain result for command {{'${key}': '${ get(commands, [key, "cmd"]) }'}}.`);
        }
        if (!isEmpty(missedResultTimeKeys)) {
          const key = String(first(missedResultTimeKeys));
          throw new Error(`Expecting 'result_time' to contain result for command {{'${key}': '${get(commands, [key, "cmd"])}'}}.`);
        }
        return result
      }, {
        retries: config.retry.attempts,
        delay: config.retry.delay,
        signal: controller.signal,
      })

      forEach(commands, (item, key) => {
        const res = ResponseSchema.parse({
          result: get(result.result, key),
          time: get(result.result_time, key),
          total: get(result.result_total, key),
          next: get(result.result_next, key),
        });
        const data = listMethod ? getListResult(res.result) : res.result;
        withPayload ? responsesWithPayload.push([data, item.payload]) : responses.push(data)
      })
    }

    return withPayload ? responsesWithPayload : responses;
  }

  const listSequential = async ({ request, listSize }: { request: ApiRequest, listSize: number }) => {
    const result: unknown[] = [];
    const size = listSize || config.listSize;
    set(request, "parameters.start", 0);
    const response = await call(request);
    forEach(getListResult(response.result), (item) => result.push(item));
    const tailed = getTail({ request, response, listSize: size });

    for (const tail of tailed) {
      const res = await call(tail);
      const start = Number(tail.parameters?.start || 0);
      if (res.next && res.next != start + size) throw new Error(`Expecting next list chunk to start at ${start + size}. Got: ${res.next}`)
      forEach(getListResult(res.result), (item) => result.push(item));
    }
    return result;
  }

  const listBatched = async ({ request, listSize, batchSize }: { request: ApiRequest, listSize: number, batchSize: number }) => {
    const listSizeTotal = listSize || config.listSize;
    const batchSizeTotal = batchSize || config.batchSize;
    const result: unknown[] = [];
    set(request, "parameters.start", 0);
    const response = await call(request);
    forEach(getListResult(response.result), (item) => result.push(item));
    const tailed = getTail({ request, response, listSize: listSizeTotal });
    const batchTailed = await batch({ requests: tailed, batchSize: batchSizeTotal, listMethod: true });
    forEach(batchTailed, (item) => result.push(...castArray(item)));
    return result;
  }

  const listBatchedNoCount = async ({ request, idKey = "ID", listSize, batchSize }: { request: ApiRequestList, idKey?: string, listSize: number, batchSize: number }) => {
    const listSizeTotal = listSize || config.listSize;
    const batchSizeTotal = batchSize || config.batchSize;
    const result: unknown[] = [];
    const batchedHelper = useBatchedNoCount({ request, idKey, listSize: listSizeTotal, batchSize: batchSizeTotal });
    const boundaryRequests = [batchedHelper.headRequest(), batchedHelper.tailRequest()];
    const [ headResult, tailResult ] = await batch({ requests: boundaryRequests });
    forEach(getListResult(headResult), (item) => result.push(item));

    const bodyRequests = batchedHelper.bodyRequests({ headResult, tailResult });
    const bodyResults = await batch({ requests: bodyRequests, batchSize: batchSizeTotal, listMethod: true });
    forEach(bodyResults, (item) => result.push(...castArray(item)));
    forEach(batchedHelper.tailResults({headResult, tailResult}), (item) => result.push(item));
    return result;
  };

  const updatesBatch = async ({ bodyRequests, headRequests, referenceHelper }: { bodyRequests: ApiRequestList[], headRequests: ApiRequestList[], referenceHelper: ReturnType<typeof useReferenceNoCount> }) => {
    const result = await batch({ requests: concat(headRequests, bodyRequests), batchSize: referenceHelper.batchSize, listMethod: true, withPayload: referenceHelper.withPayload });
    return {
      bodyResults: result,
      headRequests: referenceHelper.headRequests({ bodyRequests: concat(headRequests, bodyRequests), bodyResults: result }),
    }
  };

  const referenceBatchedNoCount = async ({ request, updates, idKey = "ID", listSize, batchSize, withPayload = false }: { request: ApiRequestList, updates: Array<{filter: ApiRecord, payload?: unknown}>, idKey?: string, listSize: number, batchSize: number, withPayload?: boolean }) => {
    const listSizeTotal = listSize || config.listSize;
    const batchSizeTotal = batchSize || config.batchSize;
    const result: unknown[] = [];
    const referenceHelper = useReferenceNoCount({ request, updates, idKey, listSize: listSizeTotal, batchSize: batchSizeTotal, withPayload });
    let headRequests: ApiRequestList[] = [];
    let bodyRequests: ApiRequestList[] = [];
    for (const tailRequest of referenceHelper.tailRequests()) {
      bodyRequests.push(tailRequest);
      if (size(headRequests) + size(bodyRequests) < batchSizeTotal) {
        continue
      }
      const updates = await updatesBatch({ bodyRequests, headRequests, referenceHelper });
      bodyRequests = [];
      headRequests = updates.headRequests;
      forEach(referenceHelper.bodyResults(updates.bodyResults), (item) => result.push(item));
    }
    while (!isEmpty(headRequests) || !isEmpty(bodyRequests)) {
      const updates = await updatesBatch({ bodyRequests, headRequests, referenceHelper });
      bodyRequests = [];
      headRequests = updates.headRequests;
      forEach(referenceHelper.bodyResults(updates.bodyResults), (item) => result.push(item));
    }
    return result;
  }

  return {
    call,
    batch,
    config,
    buildQuery,
    listBatched,
    listSequential,
    listBatchedNoCount,
    referenceBatchedNoCount,
  }
};

export default useApi;
