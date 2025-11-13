import { describe, it, expect, vi } from "vitest";
import useApi from "./../src/index.ts";
import nock from "nock";
import { CODES } from "../src/types.js";

const mockTime = {
  start: 1741699660.029826,
  finish: 1741699660.111687,
  duration: 0.08186101913452148,
  processing: 0.0500180721282959,
  date_start: "2025-03-11T16:27:40+03:00",
  date_finish: "2025-03-11T16:27:40+03:00",
  operating_reset_at: 1741700260,
  operating: 1.8415930271148682,
};
const mockProfile = {
  ID: "12",
  ADMIN: false,
  NAME: "First",
  LAST_NAME: "Last",
  PERSONAL_GENDER: "",
  TIME_ZONE: "",
  TIME_ZONE_OFFSET: 10800,
};
const mockLeads = [
  { ID: "38945", STATUS_ID: "1" },
  { ID: "43595", STATUS_ID: "1" },
];

describe("Batch tests", () => {
  it("Обычный запрос", async () => {
    const result = [mockProfile, { items: mockLeads }, [{ ID: "1", NAME: "Main department", SORT: 500, UF_HEAD: "1" }]];
    nock(process.env.WEBHOOK_URL || "")
      .post("/batch", {
        halt: true,
        cmd: {
          _0: "profile",
          _1: "crm.lead.list?select%5B0%5D=ID&select%5B1%5D=STATUS_ID&start=-1",
          _2: "department.get?ID=1",
        },
      })
      .reply(CODES.OK, {
        result: {
          result: {
            _0: mockProfile,
            _1: { items: mockLeads },
            _2: [{ ID: "1", NAME: "Main department", SORT: 500, UF_HEAD: "1" }],
          },
          result_error: [],
          result_total: { _1: 2, _2: 1 },
          result_next: [],
          result_time: { _0: mockTime, _1: mockTime, _2: mockTime },
        },
        time: mockTime,
      });

    const api = useApi();
    const response = await api.batch({
      requests: [
        { method: "profile" },
        {
          method: "crm.lead.list",
          parameters: { select: ["ID", "STATUS_ID"], start: -1 },
        },
        { method: "department.get", parameters: { ID: 1 } },
      ],
    });
    expect(response).toEqual(result);
  }, 30000);

  it("Запрос с ошибкой", async () => {
    nock(process.env.WEBHOOK_URL || "")
      .post("/batch", {
        halt: true,
        cmd: {
          _0: "profile",
          _1: "telephony.externalLine.get",
          _2: "department.get?ID=1",
        },
      })
      .reply(CODES.OK, {
        result: {
          result: {
            _0: mockProfile,
          },
          result_error: {
            _1: { error: "insufficient_scope", error_description: "" },
          },
          result_total: [],
          result_next: [],
          result_time: { _0: mockTime },
        },
        time: mockTime,
      });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const api = useApi();
    await expect(
      async () =>
        await api.batch({
          requests: [{ method: "profile" }, { method: "telephony.externalLine.get" }, { method: "department.get", parameters: { ID: 1 } }],
        }),
    ).rejects.toThrowError(`insufficient_scope: no description`);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it("Запрос с ошибкой и ретраем", async () => {
    const api = useApi();
    nock(process.env.WEBHOOK_URL || "")
      .post("/batch", {
        halt: true,
        cmd: {
          _0: "profile",
          _1: "telephony.externalLine.get",
          _2: "department.get?ID=1",
        },
      })
      .times(api.config.retry.attempts)
      .reply(CODES.OK, {
        result: {
          result: {
            _0: mockProfile,
          },
          result_error: {
            _1: { error: "operation_time_limit", error_description: "" },
          },
          result_total: [],
          result_next: [],
          result_time: { _0: mockTime },
        },
        time: mockTime,
      });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      async () =>
        await api.batch({
          requests: [{ method: "profile" }, { method: "telephony.externalLine.get" }, { method: "department.get", parameters: { ID: 1 } }],
        }),
    ).rejects.toThrowError(`operation_time_limit: no description`);
    expect(fetchSpy).toHaveBeenCalledTimes(api.config.retry.attempts);
  }, 30000);

  it("Успешный запрос с ошибкой, ретраем по коду ошибки и получения ответа", async () => {
    const attempts = 3;
    const result = [mockProfile, { items: mockLeads }, [{ ID: "1", NAME: "Main department", SORT: 500, UF_HEAD: "1" }]];
    nock(process.env.WEBHOOK_URL || "")
      .post("/batch", {
        halt: true,
        cmd: {
          _0: "profile",
          _1: "crm.lead.list?select%5B0%5D=ID&select%5B1%5D=STATUS_ID&start=-1",
          _2: "department.get?ID=1",
        },
      })
      .times(attempts)
      .reply(CODES.OK, {
        result: {
          result: {
            _0: mockProfile,
          },
          result_error: {
            _1: { error: "operation_time_limit", error_description: "" },
          },
          result_total: [],
          result_next: [],
          result_time: { _0: mockTime },
        },
        time: mockTime,
      });
    nock(process.env.WEBHOOK_URL || "")
      .post("/batch", {
        halt: true,
        cmd: {
          _0: "profile",
          _1: "crm.lead.list?select%5B0%5D=ID&select%5B1%5D=STATUS_ID&start=-1",
          _2: "department.get?ID=1",
        },
      })
      .reply(CODES.OK, {
        result: {
          result: {
            _0: mockProfile,
            _1: { items: mockLeads },
            _2: [{ ID: "1", NAME: "Main department", SORT: 500, UF_HEAD: "1" }],
          },
          result_error: [],
          result_total: { _1: 2, _2: 1 },
          result_next: [],
          result_time: { _0: mockTime, _1: mockTime, _2: mockTime },
        },
        time: mockTime,
      });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const api = useApi();
    const response = await api.batch({
      requests: [
        { method: "profile" },
        {
          method: "crm.lead.list",
          parameters: { select: ["ID", "STATUS_ID"], start: -1 },
        },
        { method: "department.get", parameters: { ID: 1 } },
      ],
    });
    expect(response).toEqual(result);
    expect(fetchSpy).toHaveBeenCalledTimes(attempts + 1);
  }, 30000);

  it("Запрос с ошибкой из за недостающего ключа в result", async () => {
    nock(process.env.WEBHOOK_URL || "")
      .post("/batch", {
        halt: true,
        cmd: {
          _0: "profile",
          _1: "crm.lead.list?select%5B0%5D=ID&select%5B1%5D=STATUS_ID&start=-1",
          _2: "department.get?ID=1",
        },
      })
      .reply(CODES.OK, {
        result: {
          result: {
            _0: mockProfile,
            _2: [{ ID: "1", NAME: "Main department", SORT: 500, UF_HEAD: "1" }],
          },
          result_error: [],
          result_total: { _1: 2, _2: 1 },
          result_next: [],
          result_time: { _0: mockTime, _1: mockTime, _2: mockTime },
        },
        time: mockTime,
      });

    const api = useApi();
    await expect(
      async () =>
        await api.batch({
          requests: [
            { method: "profile" },
            {
              method: "crm.lead.list",
              parameters: { select: ["ID", "STATUS_ID"], start: -1 },
            },
            { method: "department.get", parameters: { ID: 1 } },
          ],
        }),
    ).rejects.toThrowError(`Expecting 'result' to contain result for command {{'_1': 'crm.lead.list?select%5B0%5D=ID&select%5B1%5D=STATUS_ID&start=-1'}}.`);
  }, 30000);

  it("Запрос с ошибкой из за недостающего ключа в result_time", async () => {
    nock(process.env.WEBHOOK_URL || "")
      .post("/batch", {
        halt: true,
        cmd: {
          _0: "profile",
          _1: "crm.lead.list?select%5B0%5D=ID&select%5B1%5D=STATUS_ID&start=-1",
          _2: "department.get?ID=1",
        },
      })
      .reply(CODES.OK, {
        result: {
          result: {
            _0: mockProfile,
            _1: { items: mockLeads },
            _2: [{ ID: "1", NAME: "Main department", SORT: 500, UF_HEAD: "1" }],
          },
          result_error: [],
          result_total: { _1: 2, _2: 1 },
          result_next: [],
          result_time: { _0: mockTime, _2: mockTime },
        },
        time: mockTime,
      });

    const api = useApi();
    await expect(
      async () =>
        await api.batch({
          requests: [
            { method: "profile" },
            {
              method: "crm.lead.list",
              parameters: { select: ["ID", "STATUS_ID"], start: -1 },
            },
            { method: "department.get", parameters: { ID: 1 } },
          ],
        }),
    ).rejects.toThrowError(`Expecting 'result_time' to contain result for command {{'_1': 'crm.lead.list?select%5B0%5D=ID&select%5B1%5D=STATUS_ID&start=-1'}}.`);
  }, 30000);

  it("Запрос с payload", async () => {
    const result = [
      [mockProfile, 1],
      [{ items: mockLeads }, 2],
      [[{ ID: "1", NAME: "Main department", SORT: 500, UF_HEAD: "1" }], 3],
    ];
    nock(process.env.WEBHOOK_URL || "")
      .post("/batch", {
        halt: true,
        cmd: {
          _0: "profile",
          _1: "crm.lead.list?select%5B0%5D=ID&select%5B1%5D=STATUS_ID&start=-1",
          _2: "department.get?ID=1",
        },
      })
      .reply(CODES.OK, {
        result: {
          result: {
            _0: mockProfile,
            _1: { items: mockLeads },
            _2: [{ ID: "1", NAME: "Main department", SORT: 500, UF_HEAD: "1" }],
          },
          result_error: [],
          result_total: { _1: 2, _2: 1 },
          result_next: [],
          result_time: { _0: mockTime, _1: mockTime, _2: mockTime },
        },
        time: mockTime,
      });

    const api = useApi();
    const response = await api.batch({
      requests: [
        { method: "profile", payload: 1 },
        {
          method: "crm.lead.list",
          parameters: { select: ["ID", "STATUS_ID"], start: -1 },
          payload: 2,
        },
        { method: "department.get", parameters: { ID: 1 }, payload: 3 },
      ],
      withPayload: true,
    });
    expect(response).toEqual(result);
  }, 30000);
});
