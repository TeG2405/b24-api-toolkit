import ky from "ky";
import settings from "./settings";

const client = ky.extend({
  method: "post",
  prefixUrl: settings.webhookUrl,
  timeout: settings.httpTimeout,
  throwHttpErrors: false,
  retry: {
    limit: settings.retry.attempts,
    statusCodes: settings.retry.statuses,
    methods: settings.retry.methods,
  },
});

export default client;
