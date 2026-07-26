import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app.js';
import { createRoomPolicy } from '../src/roomPolicy.js';
import { createFakeStore } from '../test-support/fakeStore.js';

const TOKEN = 'mcp-test-secret-with-at-least-32-characters';

test('Streamable HTTP MCP lists tools and creates a real Flat Analyzer offer', async (context) => {
  const app = createApp({
    store: createFakeStore(),
    roomPolicy: createRoomPolicy({ defaultRoomId: 'abc123' }),
    apiToken: TOKEN,
  });
  const httpServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => httpServer.once('listening', resolve));
  context.after(() => new Promise((resolve) => httpServer.close(resolve)));

  const address = httpServer.address();
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${address.port}/mcp`),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${TOKEN}` },
      },
    },
  );
  const client = new Client({ name: 'flat-analyzer-test', version: '1.0.0' });
  await client.connect(transport);
  context.after(() => client.close());

  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    ['create_listing', 'list_listings'],
  );

  const created = await client.callTool({
    name: 'create_listing',
    arguments: {
      source_url: 'https://example.com/mcp-flat',
      name: 'MCP test flat',
      price_czk: 7_900_000,
      size_m2: 51,
    },
  });
  assert.equal(created.isError, undefined);
  assert.equal(created.structuredContent.action, 'created');

  const listed = await client.callTool({
    name: 'list_listings',
    arguments: { limit: 10 },
  });
  assert.equal(listed.structuredContent.count, 1);
  assert.equal(listed.structuredContent.listings[0].name, 'MCP test flat');
});
