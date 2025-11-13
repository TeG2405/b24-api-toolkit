# b24api — README

Этот пакет предоставляет удобную обёртку над REST API Bitrix24 с поддержкой:
- единичных вызовов (`call`)
- пакетных запросов (`batch`)
- постраничного получения списков двумя способами (`listSequential`, `listBatched`)
- высокопроизводительных выборок без общего счётчика (`listBatchedNoCount`)
- выборок по ссылочным обновлениям без общего счётчика (`referenceBatchedNoCount`)

Вся внешняя функциональность экспортируется фабрикой `useApi` из файла `src/index.ts`.

## Установка

```bash
npm install b24api
# или
pnpm add b24api
# или
yarn add b24api
```

## Быстрый старт

```ts
import useApi from "b24api";

const api = useApi();

// Простой вызов метода Bitrix24
const deal = await api.call({
  method: "crm.deal.get",
  parameters: { id: 123 },
});

console.log(deal.result); // Тело ответа Bitrix24, валидация пройдена
```

## Конфигурация

`useApi` возвращает объект `config`, который содержит настройки по умолчанию:

- `config.batchSize` — размер одного батча при `batch` и связанных методах.
- `config.listSize` — размер страницы (параметр `start`) при постраничных запросах.
- `config.retry` — стратегия повторных попыток: `{ attempts, delay }`.

Настройки читаются из `src/settings.ts`. Вы можете переопределить их перед использованием пакета (подробности зависят от реализации `settings.ts`).

## API

Все методы ниже доступны через объект, возвращаемый `useApi()`.

### 1) call

Единичный вызов REST метода с автоматической валидацией ответа (через Zod‑схемы) и стратегией ретраев для временных ошибок.

```ts
const response = await api.call({
  method: "crm.contact.list",
  parameters: { filter: { ACTIVE: "Y" }, select: ["ID", "NAME"] },
  options: { /* дополнительные опции fetch, если поддерживаются клиентом */ },
});

// Структура ответа соответствует `ResponseSchema`
console.log(response.result);
```

Особенности:
- Повторные попытки выполняются согласно `config.retry` при срабатывании `shouldCallRetry` (см. `helpers`).
- Ошибки Bitrix24 (формат `error`, `error_description`) пробрасываются исключением после парсинга через `ResponseErrorSchema`.

### 2) batch

Формирует и выполняет пакетный запрос `batch` с автоматическим разбиением на чанки.

```ts
const responses = await api.batch({
  requests: [
    { method: "crm.deal.get", parameters: { id: 1 } },
    { method: "crm.deal.get", parameters: { id: 2 } },
  ],
  // Необязательно:
  batchSize: 50,
  listMethod: false, // если true — результат будет обработан как список (см. getListResult)
});

// responses: массив результатов в том же порядке, что и входные запросы
```

Поддержка полезной нагрузки:

```ts
const responsesWithPayload = await api.batch({
  requests: [
    { method: "crm.deal.get", parameters: { id: 10 }, payload: { localId: "A" } },
    { method: "crm.deal.get", parameters: { id: 20 }, payload: { localId: "B" } },
  ],
  withPayload: true,
});

// [ [result10, {localId: 'A'}], [result20, {localId: 'B'}] ]
```

Внутри метод:
- собирает команды `cmd` формата `method?query`; `query` строится через `buildQuery`;
- повторяет батч при частичных ошибках согласно `shouldBatchRetry`;
- валидирует структуру `result`, `result_time`, `result_total`, `result_next`.

### 3) listSequential

Последовательная пагинация: делает первый вызов, затем пошагово запрашивает хвостовые страницы до конца.

```ts
const items = await api.listSequential({
  request: { method: "crm.deal.list", parameters: { filter: {}, select: ["ID"] } },
  listSize: 50, // опционально, по умолчанию config.listSize
});
```

Особенности:
- Контролирует корректность `next` (ожидается `start + listSize`).
- Использует `helpers.getListResult` для извлечения массива элементов из ответа.

### 4) listBatched

Постраничная выборка, но хвостовые страницы запрашиваются батчами для ускорения.

```ts
const items = await api.listBatched({
  request: { method: "crm.contact.list", parameters: { filter: {}, select: ["ID", "NAME"] } },
  listSize: 100,
  batchSize: 50,
});
```

### 5) listBatchedNoCount

Высокопроизводительная выборка без опоры на общий счётчик, с разнесением на «голову/тело/хвост» множества запросов.

```ts
const items = await api.listBatchedNoCount({
  request: { method: "crm.deal.list", parameters: { filter: {}, select: ["ID", "TITLE"] } },
  idKey: "ID",     // опционально, ключ уникальности
  listSize: 100,     // опционально
  batchSize: 50,     // опционально
});
```

Использует вспомогательный модуль `useBatchedNoCount` для построения батч‑запросов.

### 6) referenceBatchedNoCount

Отбор записей по ссылочным обновлениям: вы задаёте набор «обновлений» (фильтров), а метод собирает соответствующие элементы без общего счётчика, батчами.

```ts
const updates = [
  { filter: { CATEGORY_ID: 2 }, payload: { category: 2 } },
  { filter: { CATEGORY_ID: 3 }, payload: { category: 3 } },
];

const results = await api.referenceBatchedNoCount({
  request: { method: "crm.deal.list", parameters: { select: ["ID", "CATEGORY_ID"] } },
  updates,
  idKey: "ID",
  listSize: 100,
  batchSize: 50,
  withPayload: true, // чтобы получить к каждому результату исходный payload
});

// results — массив элементов (или пар [элемент, payload], если withPayload=true)
```

Метод использует `useReferenceNoCount` и под капотом многократно вызывает `batch` порциями, пока не будут обработаны все «хвостовые» запросы.

### 7) buildQuery

Сервис для сборки строки запроса из объекта параметров, используемый, в частности, в `batch` при формировании `cmd`.

```ts
import { buildQuery } from "b24api";

const q = buildQuery({ filter: { ID: 1 }, select: ["ID", "TITLE"] });
// "filter[ID]=1&select[]=ID&select[]=TITLE"
```

### 8) config

Объект текущих настроек, о которых сказано выше. Его можно читать и (если предусмотрено реализацией) модифицировать до выполнения запросов.

## Обработка ошибок

- HTTP‑ошибки (код >= 300) выбрасываются исключением.
- Ошибки формата Bitrix24 (`error`, `error_description`) детектируются и пробрасываются.
- Ретраи выполняются только для условий, определённых `shouldCallRetry`/`shouldBatchRetry`.

## Замечание по ретраям в batch

В коде `src/index.ts` отмечен TODO: «здесь ошибка, нужно обработать throw из call, иначе будет попадать в ретрай». Это означает, что если `call("batch")` выбрасывает не ретраибл‑ошибку, текущая логика может посчитать её причиной для повторной попытки. Учитывайте это, если вы расширяете обработку ошибок.

## Примеры сценариев

Получить все сделки последовательно:

```ts
const deals = await api.listSequential({
  request: { method: "crm.deal.list", parameters: { filter: {}, select: ["ID", "TITLE"] } },
  listSize: 50,
});
```

Получить контакты быстрее батчами:

```ts
const contacts = await api.listBatched({
  request: { method: "crm.contact.list", parameters: { filter: {}, select: ["ID", "NAME"] } },
  listSize: 100,
  batchSize: 50,
});
```

Сопоставить результаты с локальным контекстом:

```ts
const out = await api.batch({
  requests: ids.map((id) => ({ method: "crm.deal.get", parameters: { id }, payload: { id } })),
  withPayload: true,
});

for (const [deal, { id }] of out) {
  // можно связать ответ с исходным id
}
```

## Тесты

В проекте используются `vitest`. Для запуска тестов:

```bash
npm test
```

## Требования

- Node.js 18+

## Лицензия

MIT
