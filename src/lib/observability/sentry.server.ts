import * as Sentry from '@sentry/nextjs';
import { sentryOptions, scrubUrl } from './sentry-options';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    ...sentryOptions(dsn),
    beforeSend(event) {
      if (event.request) {
        event.request.url = scrubUrl(event.request.url);
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
        }
      }
      return event;
    },
  });
}
