import { describe, it, expect, vi } from "vitest";
import useApi from "./../src/index.ts";
import nock from "nock";
import { CODES } from "../src/types.js";

const mockTime = {
  "start": 1741699660.029826,
  "finish": 1741699660.111687,
  "duration": 0.08186101913452148,
  "processing": 0.0500180721282959,
  "date_start": "2025-03-11T16:27:40+03:00",
  "date_finish": "2025-03-11T16:27:40+03:00",
  "operating_reset_at": 1741700260,
  "operating": 1.8415930271148682,
};

const mockProfile = {
  "ID": "12",
  "ADMIN": false,
  "NAME": "First",
  "LAST_NAME": "Last",
  "PERSONAL_GENDER": "",
  "TIME_ZONE": "",
  "TIME_ZONE_OFFSET": 10800,
};

const mockLeads  = [{"ID": "38945", "STATUS_ID": "1"}, {"ID": "43595", "STATUS_ID": "1"}];

describe("Call tests", () => {
  it("Обычный запрос", async () => {
    const response = {
      result: mockProfile,
      time: mockTime,
    };
    nock(process.env.WEBHOOK_URL || "").post('/profile').reply(CODES.OK, response);

    const api = useApi();
    const result = await api.call({method: "profile"});
    expect(result).toEqual(response);
    });

  it("Запрос списка", async () => {
    const response = {
      result: mockLeads,
      next: 3,
      total: 10,
      time: mockTime,
    };
    const parameters = {
      select: ["ID", "STATUS_ID"],
      filter: {">DATE_CREATE": new Date().toString()},
    }
    nock(process.env.WEBHOOK_URL || "").post('/crm.lead.list', parameters).reply(CODES.OK, response);

    const api = useApi();
    const result = await api.call({method: "crm.lead.list", parameters});
    expect(result).toEqual(response);
    });

  it("Запрос с ошибкой", async () => {
    nock(process.env.WEBHOOK_URL || "").post('/profile').reply(CODES.NOT_EXTENDED, {});

    const api = useApi();
    await expect(async() => await api.call({method: "profile"}))
      .rejects.toThrowError(`Request failed with status code ${CODES.NOT_EXTENDED}`);
    });

  it("Запрос с ошибкой и ретраем по статусу", async () => {
    nock(process.env.WEBHOOK_URL || "").post('/profile').reply(CODES.TOO_MANY_REQUESTS, {}).persist();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const api = useApi();

    await expect(async() => await api.call({method: "profile"}))
      .rejects.toThrowError(`Request failed with status code ${CODES.TOO_MANY_REQUESTS}`);
    expect(fetchSpy).toHaveBeenCalledTimes(api.config.retry.attempts);
  }, 30000);

  it("Успешный запрос с ошибкой", async () => {
    nock(process.env.WEBHOOK_URL || "").post('/profile').reply(CODES.OK, {
      error: "ACCESS_DENIED",
      error_description: "Method is blocked due to operation time limit.",
    }).persist();

    const api = useApi();
    await expect(async() => await api.call({method: "profile"}))
      .rejects.toThrowError(`ACCESS_DENIED: Method is blocked due to operation time limit.`);
  });

  it("Успешный запрос с ошибкой и ретраем по коду ошибки", async () => {
    nock(process.env.WEBHOOK_URL || "").post('/profile').reply(CODES.OK, {
      error: "OPERATION_TIME_LIMIT",
      error_description: "Method is blocked due to operation time limit.",
    }).persist();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const api = useApi();
    await expect(async() => await api.call({method: "profile"}))
      .rejects.toThrowError(`OPERATION_TIME_LIMIT: Method is blocked due to operation time limit.`);
    expect(fetchSpy).toHaveBeenCalledTimes(api.config.retry.attempts);
  }, 30000);

  it("Запрос с ошибкой и ретраем по коду ошибки", async () => {
    nock(process.env.WEBHOOK_URL || "").post('/profile').reply(CODES.FORBIDDEN, {
      error: "OPERATION_TIME_LIMIT",
      error_description: "Method is blocked due to operation time limit.",
    }).persist();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const api = useApi();
    await expect(async() => await api.call({method: "profile"}))
      .rejects.toThrowError(`OPERATION_TIME_LIMIT: Method is blocked due to operation time limit.`);
    expect(fetchSpy).toHaveBeenCalledTimes(api.config.retry.attempts);
  }, 30000);

  it("Успешный запрос с ошибкой, ретраем по коду ошибки и получения ответа", async () => {
    const attempts = 3;
    nock(process.env.WEBHOOK_URL || "").post('/profile').times(attempts).reply(CODES.OK, {
      error: "OPERATION_TIME_LIMIT",
      error_description: "Method is blocked due to operation time limit.",
    });
    nock(process.env.WEBHOOK_URL || "").post('/profile').reply(CODES.OK, {
      result: mockProfile,
      time: mockTime,
    }).persist();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const api = useApi();
    const result = await api.call({method: "profile"});
    expect(result).toEqual({
      result: mockProfile,
      time: mockTime,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(attempts + 1);
  }, 30000);
})
