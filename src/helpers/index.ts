import type { ApiRequest, ResponseBatch, ResponseError, ResponseSuccess, ResponseType } from "../types.js";
import { cloneDeep, isPlainObject, range, snakeCase } from "es-toolkit";
import config from "../settings.js";
import { ResponseErrorSchema } from "../schemas.js";
import { first, get, includes, isEmpty, keys, map, set, size, some } from "es-toolkit/compat";
import type { KyResponse } from "ky";


const useHelpers = () => {

  const throwError = (error: ResponseError) => {
    throw new Error(`${error.error}: ${error.error_description || "no description"}`);
  }

  const isResponseError = (body: ResponseType): body is ResponseError =>
    ResponseErrorSchema.safeParse(body).success;

  const shouldCallRetry = ({ response, body }: { response: KyResponse, body: ResponseType }) => {
    if (includes(config.retry.statuses, response.status)) return true;
    return isResponseError(body) && includes(config.retry.errors, snakeCase(body.error));
  }

  const shouldBatchRetry = (errors: ResponseBatch['result_error']) => {
    return some(errors, (item) => {
      const error = ResponseErrorSchema.parse(item);
      return includes(config.retry.errors, snakeCase(error.error));
    });
  }

  const getListResult = (result: unknown) => {
    if (!Array.isArray(result) && !isPlainObject(result)) throw new Error(`Expecting 'result' to be a 'list' or a 'dict'. Got: ${result}`);
    if (Array.isArray(result)) return isEmpty(result) ? [] : result;
    const clues = keys(result);
    if (isEmpty(clues)) return [];
    if (size(clues) !== 1) throw new Error(`If 'result' is a 'dict', expecting single item. Got: ${result}`);
    const value = get(result, String(first(clues)));
    if (!Array.isArray(value)) throw new TypeError(`If 'result' is a 'dict', expecting single item to be a 'list'. Got: ${result}`);
    return value;
  }

  const getTail = ({ request, response, listSize }: {request: ApiRequest, response: ResponseSuccess, listSize: number}) => {
    if (response.next && response.next != listSize) throw new Error(`Expecting list chunk size to be ${listSize}}. Got: ${response.next}`)
    const total = response.total || 0;
    return map(range(listSize, total, listSize), (start, idx) => {
      const req = cloneDeep(request);
      return set(req, "parameters.start", start);
    })
  }

  return {
    throwError,
    isResponseError,
    shouldCallRetry,
    shouldBatchRetry,
    getListResult,
    getTail,
  }
};

export { useHelpers };