import { describe, it, expect } from "vitest";
import buildQuery from "./../src/build-query.ts";

describe("buildQuery", () => {
  it('Кодирует плоские пары и пробелы как "+"', () => {
    const q = buildQuery({ q: "hello world" });

    expect(q).toBe("q=hello+world");
  });

  it("Сериализует вложенные объекты и массивы", () => {
    const q = buildQuery({ user: { name: "Ann", tags: ["dev", "js"] } });
    const q1 = buildQuery({ select: ["ID", "STATUS_ID"], start: -1 });

    expect(q).toEqual(
      "user%5Bname%5D=Ann&user%5Btags%5D%5B0%5D=dev&user%5Btags%5D%5B1%5D=js",
    );
    expect(q1).toEqual("select%5B0%5D=ID&select%5B1%5D=STATUS_ID&start=-1");
  });

  it("Пропускает null/undefined", () => {
    // @ts-expect-error: специально проверяем undefined
    const q = buildQuery({ a: null, b: undefined, c: 1 });

    expect(q).toBe("c=1");
  });

  it("Корректно кодирует Date как локальную ISO со смещением", () => {
    const q = buildQuery({ at: new Date("2025-09-12") });

    expect(q.startsWith("at=")).toBe(true);

    expect(q).toBe("at=2025-09-12T00%3A00%3A00.000Z");
  });

  it("Опускает пустые массивы и объекты полностью", () => {
    // Пустые структуры не добавляют пар
    // @ts-ignore: проверяем пустой объект как значение
    const q = buildQuery({ a: [], b: {} });

    expect(q).toBe("");
  });

  it("Массив примитивов кодируется по индексам", () => {
    const q = buildQuery({ arr: [1, 2] });

    expect(q).toBe("arr%5B0%5D=1&arr%5B1%5D=2");
  });

  it('Кодирует плюс в значении как %2B, а пробел - как "+"', () => {
    const q = buildQuery({ s: "A+B C" });

    // "A+B" -> "A%2BB"; пробел -> "+"
    expect(q).toBe("s=A%2BB+C");
  });

  it("Массив объектов работает корректно", () => {
    const q = buildQuery({ items: [{ id: 1 }, { id: 2 }] });

    expect(q).toBe("items%5B0%5D%5Bid%5D=1&items%5B1%5D%5Bid%5D=2");
  });

  it("Числа и булевы значения приводятся к строкам", () => {
    const q = buildQuery({ n: 0, t: true, f: false });

    expect(q).toBe("n=0&t=true&f=false");
  });
});
