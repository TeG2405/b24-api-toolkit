import type { ApiRecord } from "./types";
import qs from "qs";

/**
 * Эквивалент Python build_query на TS.
 * Разворачивает вложенные объекты/массивы в query string с "[]" нотацией,
 * кодирует через application/x-www-form-urlencoded (пробелы -> '+').
 */
export default function buildQuery(parameters: ApiRecord): string {
  return qs.stringify(parameters, { format: "RFC1738", skipNulls: true });
}
