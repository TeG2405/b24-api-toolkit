import type { ApiRequest, Batch, ResponseBatch, ResponseError, ResponseSuccess, ResponseType } from "./types.ts";
import { ResponseBatchSchema, ResponseErrorSchema, ResponseSchema } from "./schemas.ts";
import client from "./client.ts"
import buildQuery from "./build-query.ts";
import config from "./settings.ts";
import { chunk, compact, difference, mapValues, retry, snakeCase } from "es-toolkit";
import {
  first,
  forEach,
  get,
  includes,
  isEmpty,
  join,
  keys,
  padStart,
  reduce,
  set,
  some,
  values
} from "es-toolkit/compat";
import type { KyResponse } from "ky";
const useApi = () => {

  const throwError = (error: ResponseError) => {
    throw new Error(`${error.error}: ${error.error_description || "no description"}`);
  }

  const isResponseError = (body: ResponseType): body is ResponseError =>
    ResponseErrorSchema.safeParse(body).success;

  const shouldCallRetry = ({ response, body }: { response: KyResponse, body: ResponseType }) => {
    if (includes(config.retry.statuses, response.status)) return true;
    return isResponseError(body) && includes(config.retry.errors, snakeCase(body.error));
  }

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


  const shouldBatchRetry = (errors: ResponseBatch['result_error']) => {
    return some(errors, (item) => {
      const error = ResponseErrorSchema.parse(item);
      return includes(config.retry.errors, snakeCase(error.error));
    });
  }
  const batch: Batch = async ({ requests, batchSize, listSize, withPayload }) => {
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
        })
        withPayload ? responsesWithPayload.push([res.result, item.payload]) : responses.push(res.result)
      })
    }

    return withPayload ? responsesWithPayload : responses;
  }

  return {
    batch,
    call,
    buildQuery,
    config
  }
};

export default useApi;
