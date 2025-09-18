/**
 * Эквивалент Python build_query на TS.
 * Разворачивает вложенные объекты/массивы в query string с "[]" нотацией,
 * кодирует через application/x-www-form-urlencoded (пробелы -> '+').
 */
import type { ApiRecord, ApiValue } from "./types.js";


// TODO: Переписано "в тупую" для TS, проверить возможность оптимизации
//  https://www.npmjs.com/package/qs
export default function buildQuery(
  parameters: ApiRecord,
  path = "%s"
): string {
  const parts: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(parameters)) {
    // Python версия скипает только None; в JS чаще ожидают null/undefined:
    if (rawValue === null || rawValue === undefined) continue;

    let value: ApiValue = rawValue;
    const keyStr = String(rawKey);

    // Массивы -> объект с индексами (как dict(enumerate(...)) в Python)
    if (Array.isArray(value)) {
      const indexed: ApiRecord = Object.fromEntries(
        value.map((v, i) => [i, v])
      );
      const sub = buildQuery(indexed, `${path.replace("%s", keyStr)}[%s]`);
      if (sub) parts.push(sub);
      continue;
    }

    // Объект (не Date) -> рекурсия
    if (isPlainObject(value)) {
      const sub = buildQuery(
        value as ApiRecord,
        `${path.replace("%s", keyStr)}[%s]`
      );
      if (sub) parts.push(sub);
      continue;
    }

    // Листовые значения
    const encodedKey = formEncode(path.replace("%s", keyStr));
    const encodedVal = formEncode(
      value instanceof Date ? toLocalIsoWithOffset(value) : String(value)
    );
    parts.push(`${encodedKey}=${encodedVal}`);
  }

  return parts.join("&");
}

/** Эмуляция urllib.parse.quote_plus: encodeURIComponent + пробелы -> '+' */
function formEncode(s: string): string {
  return encodeURIComponent(s).replace(/%20/g, "+");
}

/** Проверка на "обычный объект" (исключая Date и пр.) */
function isPlainObject(v: unknown): v is ApiRecord {
  return (
    typeof v === "object" &&
    v !== null &&
    !(v instanceof Date) &&
    !Array.isArray(v)
  );
}

/**
 * Локальная ISO-строка со смещением, как у Python .astimezone().isoformat()
 * Пример: 2025-09-12T10:15:30.123+02:00
 */
function toLocalIsoWithOffset(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");

  const tzMin = -d.getTimezoneOffset(); // минуты смещения от UTC
  const sign = tzMin >= 0 ? "+" : "-";
  const hh = pad(Math.floor(Math.abs(tzMin) / 60));
  const mm = pad(Math.abs(tzMin) % 60);
  const offset = `${sign}${hh}:${mm}`;

  // Локальное "тело" даты/времени:
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const min = pad(d.getMinutes());
  const sec = pad(d.getSeconds());
  const ms = String(d.getMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day}T${hour}:${min}:${sec}.${ms}${offset}`;
}