import type { ApiRecord, ResponseType } from "./types.js";
import client from "./client.ts"
import buildQuery from "./build-query.ts";
import config from "./settings.ts";
import type { Options } from "ky";
import { retry, snakeCase } from "es-toolkit";
import { includes } from "es-toolkit/compat";
const useApi = () => {

  const throwError = (error: {error: string, error_description?: string}) => {
    throw new Error(`${error.error}: ${error.error_description || "no description"}`);
  }
  const call = async ({ method, parameters, options = {} }: {method: string, parameters?: ApiRecord, options?: Options}) => {
    const settings = {
      searchParams: buildQuery(parameters || {}),
      ...options
    };
    const result = await client(method, settings);
    const body = await result.json<ResponseType>();

    if (body.error && includes(config.retry.errors, snakeCase(body.error))) {
      const result = await retry(async () => {
        const res = await client(method, settings);
        const body = await res.json<ResponseType>();
        if (body.error) throwError(body);
        return body;
      }, {
        retries: config.retry.attempts,
        delay: (attempts) => 0.5 * (2 ** (attempts - 1)) * 1000
      });
      return result
    } else if (body.error) throwError(body);
    return body;
  };

  return {
    call,
    buildQuery,
    config
  }
};

export default useApi;
