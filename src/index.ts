import type { ApiRequest, ResponseError, ResponseType } from "./types.ts";
import { ResponseErrorSchema, ResponseSchema } from "./schemas.ts";
import client from "./client.ts"
import buildQuery from "./build-query.ts";
import config from "./settings.ts";
import { retry, snakeCase } from "es-toolkit";
import { includes } from "es-toolkit/compat";
import type { KyResponse } from "ky";
const useApi = () => {

  const throwError = (error: ResponseError) => {
    throw new Error(`${error.error}: ${error.error_description || "no description"}`);
  }

  const isResponseError = (body: ResponseType): body is ResponseError =>
    ResponseErrorSchema.safeParse(body).success;

  const isRetryable = ({ response, body }: { response: KyResponse, body: ResponseType }) => {
    if (includes(config.retry.statuses, response.status)) return true;
    return isResponseError(body) && includes(config.retry.errors, snakeCase(body.error));

  }
  const call = async ({ method, parameters, options = {} }: ApiRequest) => {
    const settings = {
      json: parameters,
      ...options
    };
    const response = await client(method, settings);
    const body = await response.json<ResponseType>();

    if (isRetryable({ response, body })) {
      return await retry(async () => {
        const res = await client(method, settings);
        const body = await res.json<ResponseType>();
        if (isResponseError(body)) throwError(body);
        if (res.status >= 300) throw new Error(`Request failed with status code ${res.status}`);
        return ResponseSchema.parse(body);
      }, {
        retries: config.retry.attempts,
        delay: (attempts) => 0.5 * (2 ** (attempts - 1)) * 1000
      });
    } else if (isResponseError(body)) throwError(body);
    if (response.status >= 300) throw new Error(`Request failed with status code ${response.status}`);
    return ResponseSchema.parse(body);
  };

  return {
    call,
    buildQuery,
    config
  }
};

export default useApi;
