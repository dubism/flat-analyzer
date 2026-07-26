import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createRoomPolicy } from '../src/roomPolicy.js';
import { createFakeStore } from '../test-support/fakeStore.js';

const TOKEN = 'test-secret-token-with-at-least-32-characters';

function testApp() {
  return createApp({
    store: createFakeStore(),
    roomPolicy: createRoomPolicy({ defaultRoomId: 'abc123' }),
    apiToken: TOKEN,
  });
}

test('health and OpenAPI are public but listing routes require bearer auth', async () => {
  const app = testApp();
  await request(app).get('/health').expect(200, { ok: true, service: 'flat-analyzer-agent-connector' });
  const openApi = await request(app).get('/openapi.json').expect(200);
  assert.equal(openApi.body.openapi, '3.1.0');
  await request(app).get('/api/v1/listings').expect(401);
});

test('REST create is idempotent and list exposes the result', async () => {
  const app = testApp();
  const body = {
    source_url: 'https://example.com/flat/42?utm_source=agent',
    name: 'Holešovice 2+kk',
    price_czk: 9_400_000,
    size_m2: 60,
    rooms: '2+kk',
    address: 'Tusarova, Praha 7',
    agent_name: 'integration test',
  };

  const created = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${TOKEN}`)
    .send(body)
    .expect(201);
  assert.equal(created.body.action, 'created');
  assert.equal(created.body.listing.price_czk, 9_400_000);

  const duplicate = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${TOKEN}`)
    .send({ ...body, source_url: 'https://example.com/flat/42/' })
    .expect(200);
  assert.equal(duplicate.body.action, 'existing');
  assert.equal(duplicate.body.listing.id, created.body.listing.id);

  const listed = await request(app)
    .get('/api/v1/listings?limit=10')
    .set('Authorization', `Bearer ${TOKEN}`)
    .expect(200);
  assert.equal(listed.body.count, 1);
  assert.equal(listed.body.listings[0].url, 'https://example.com/flat/42');
});

test('REST validates browsed listing facts', async () => {
  const app = testApp();
  const response = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${TOKEN}`)
    .send({ source_url: 'https://example.com/empty' })
    .expect(400);

  assert.equal(response.body.code, 'invalid_input');
  assert.match(response.body.error, /useful label/);
});

test('REST rejects non-HTTP source URLs as input errors', async () => {
  const app = testApp();
  const response = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${TOKEN}`)
    .send({
      source_url: 'ftp://example.com/flat',
      name: 'Unsupported URL',
      price_czk: 8_000_000,
    })
    .expect(400);

  assert.equal(response.body.code, 'invalid_input');
  assert.match(response.body.error, /http and https/);
});
