import type { ApiRequest, ResponseError, ResponseType } from "./types.ts";
import { ResponseBatchSchema, ResponseErrorSchema, ResponseSchema } from "./schemas.ts";
import client from "./client.ts"
import buildQuery from "./build-query.ts";
import config from "./settings.ts";
import { chunk, compact, retry, snakeCase } from "es-toolkit";
import { has, includes, join, map, padStart, reduce, set } from "es-toolkit/compat";
import type { KyResponse } from "ky";
const useApi = () => {

  const throwError = (error: ResponseError) => {
    throw new Error(`${error.error}: ${error.error_description || "no description"}`);
  }

  const isResponseError = (body: ResponseType): body is ResponseError =>
    ResponseErrorSchema.safeParse(body).success;

  const shouldRetry = ({ response, body }: { response: KyResponse, body: ResponseType }) => {
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

      if (shouldRetry({ response, body }) && attempt < config.retry.attempts) throw new Error("__RETRY__");
      controller.abort();
      if (isResponseError(body)) throwError(body);
      if (response.status >= 300) throw new Error(`Request failed with status code ${response.status}`);
      return ResponseSchema.parse(body);
    }, {
      retries: config.retry.attempts,
      delay: (attempts) => 0.5 * (2 ** (attempts - 1)) * 1000,
      signal: controller.signal,
    });
  };

  const batch = async ({ requests, batchSize, listSize, withPayload }: {requests: ApiRequest[], batchSize?: number, listSize?: number, withPayload?: boolean}) => {
    const size = batchSize || config.batchSize;
    const chunks = chunk(requests, size);
    const responses = [];
    for (const chunk of chunks) {
      const width = String(chunk.length).length;
      const keys = map(chunk, (_, idx) => `_${padStart(String(idx), width, '0')}`)
      const parameters = {
        halt: true,
        cmd: reduce(chunk, (acc, curr, idx) => {
          const key = String(keys[idx]);
          return set(acc, key, join(compact([curr.method, buildQuery(curr.parameters || {})]), "?"));
        }, {})
      };

      const result = ResponseBatchSchema.parse(await call({ method: "batch", parameters }));
      const errors = result.result.result_error;
      responses.push(map(keys, (key) => {
        if (has(result.result.result_error, key)) {
          const error = ResponseErrorSchema.parse(result.result.result_error);
          if (includes(config.retry.errors, snakeCase(error.error))) {

          }
        }
      }))
    }
  }

  return {
    call,
    buildQuery,
    config
  }
};

export default useApi;
