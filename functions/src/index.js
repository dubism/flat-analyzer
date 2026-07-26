import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './app.js';
import { createFirebaseListingStore } from './firebaseStore.js';
import { createRoomPolicy } from './roomPolicy.js';

const apiToken = defineSecret('FLAT_ANALYZER_API_TOKEN');
let app;

export const agentConnector = onRequest(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [apiToken],
  },
  (request, response) => {
    if (!app) {
      app = createApp({
        store: createFirebaseListingStore(),
        roomPolicy: createRoomPolicy({
          defaultRoomId: process.env.FLAT_ANALYZER_DEFAULT_ROOM_ID,
          allowedRoomIds: process.env.FLAT_ANALYZER_ALLOWED_ROOM_IDS,
        }),
        apiToken: apiToken.value(),
      });
    }
    return app(request, response);
  },
);
