import * as z from "zod";

export const ResponseTimeSchema = z.object({
  start: z.float64(),
  finish: z.float64(),
  duration: z.float64(),
  processing: z.float64(),
  date_start: z.iso.datetime({ offset: true }),
  date_finish: z.iso.datetime({ offset: true }),
  operating_reset_at: z.float64(),
  operating: z.float64(),
})

export const ResponseSchema = z.object({
  result: z.unknown(),
  time: ResponseTimeSchema,
  total: z.number().optional(),
  next: z.number().optional(),
})

export const ResponseErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
})

export const ResponseBatchSchema = z.object({
  result: z.object({
    result: z.record(z.string(), z.unknown()),
    result_error: z.union([z.record(z.string(), ResponseErrorSchema), z.tuple([])]),
    result_total: z.union([z.record(z.string(), z.number()), z.tuple([])]),
    result_next: z.union([z.record(z.string(), z.number()), z.tuple([])]),
    result_time: z.union([z.record(z.string(), ResponseTimeSchema), z.tuple([])]),
  }),
  time: ResponseTimeSchema,
  total: z.number().optional(),
  next: z.number().optional(),
})

