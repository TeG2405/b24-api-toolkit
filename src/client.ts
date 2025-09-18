import ky from 'ky';
import settings from "./settings.ts";

const client = ky.extend({
  method: "post",
  prefixUrl: settings.webhookUrl,
  timeout: settings.httpTimeout,
  retry: {
    limit: settings.retry.attempts,
    statusCodes: settings.retry.statuses,
    methods: settings.retry.methods,
  },
});

export default client;
