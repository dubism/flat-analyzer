import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ZodError } from 'zod';
import { listingInputSchema, listInputSchema, normalizeListing } from './listingModel.js';
import { createFlatAnalyzerMcpServer } from './mcpServer.js';
import { openApiDocument } from './openapi.js';
import { RequestError } from './roomPolicy.js';

function tokenMatches(expected, actual) {
  const expectedBuffer = Buffer.from(expected || '');
  const actualBuffer = Buffer.from(actual || '');
  return expectedBuffer.length > 0
    && expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer);
}

function bearerToken(headerValue) {
  const match = String(headerValue || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function jsonRpcMethodNotAllowed(res) {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
}

function errorResponse(error) {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join(' '),
        code: 'invalid_input',
      },
    };
  }
  if (error instanceof RequestError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code },
    };
  }
  return {
    status: 500,
    body: { error: 'Unexpected connector error.', code: 'internal_error' },
  };
}

export function createApp({ store, roomPolicy, apiToken }) {
  if (!apiToken) throw new Error('FLAT_ANALYZER_API_TOKEN is not configured.');
  if (apiToken.length < 32) throw new Error('FLAT_ANALYZER_API_TOKEN must be at least 32 characters.');

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    response.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'flat-analyzer-agent-connector' });
  });
  app.get('/openapi.json', (_request, response) => {
    response.json(openApiDocument);
  });

  app.use((request, response, next) => {
    const token = bearerToken(request.get('authorization'));
    if (!tokenMatches(apiToken, token)) {
      response.set('WWW-Authenticate', 'Bearer realm="flat-analyzer"');
      response.status(401).json({ error: 'A valid bearer token is required.', code: 'unauthorized' });
      return;
    }
    next();
  });

  app.post('/api/v1/listings', async (request, response, next) => {
    try {
      const input = listingInputSchema.parse(request.body);
      const roomId = roomPolicy.resolve(input.room_id);
      const result = await store.upsert(roomId, normalizeListing(input));
      response.status(result.action === 'created' ? 201 : 200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/listings', async (request, response, next) => {
    try {
      const input = listInputSchema.parse(request.query);
      const roomId = roomPolicy.resolve(input.room_id);
      response.json(await store.list(roomId, input.limit));
    } catch (error) {
      next(error);
    }
  });

  app.post('/mcp', async (request, response) => {
    const server = createFlatAnalyzerMcpServer({ store, roomPolicy });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
      response.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('MCP request failed:', error);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error.' },
          id: null,
        });
      }
    }
  });
  app.get('/mcp', (_request, response) => jsonRpcMethodNotAllowed(response));
  app.delete('/mcp', (_request, response) => jsonRpcMethodNotAllowed(response));

  app.use((error, _request, response, _next) => {
    const { status, body } = errorResponse(error);
    if (status >= 500) console.error('API request failed:', error);
    response.status(status).json(body);
  });

  return app;
}
