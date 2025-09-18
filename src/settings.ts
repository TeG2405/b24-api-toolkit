import dotenv from 'dotenv'
import { CODES, type Config } from "./types.ts";

dotenv.config({ path: '../.env.local' })



const config: Config = {
  webhookUrl: process.env.WEBHOOK_URL || '',
  loggerName: "b24api",
  httpTimeout: 30000,
  retry: {
    attempts: 5,
    delay: 5000,
    backoff: 2,
    errors: ["query_limit_exceeded", "operation_time_limit"],
    statuses: [
      CODES.LOCKED,
      CODES.TOO_EARLY,
      CODES.BAD_GATEWAY,
      CODES.TOO_MANY_REQUESTS,
      CODES.SERVICE_UNAVAILABLE,
      CODES.INSUFFICIENT_STORAGE,
      CODES.INTERNAL_SERVER_ERROR,
    ],
    methods: ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'],
  },
  listSize: 50,
  batchsize: 50,
}

export default config;