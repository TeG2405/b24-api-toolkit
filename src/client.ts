import ky from 'ky';
import settings from "./settings.ts";

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
  hooks: {
    afterResponse: [
      async (request, options, response) => {
      // console.log((await response.json()).result.result, 'response')
      }
    ]
  },
});

export default client;
