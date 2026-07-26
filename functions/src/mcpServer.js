import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  listingInputSchema,
  listInputSchema,
  normalizeListing,
} from './listingModel.js';

const listingSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().nullable(),
  price_czk: z.number().nullable(),
  size_m2: z.number().nullable(),
  rooms: z.string().nullable(),
  address: z.string().nullable(),
  location: z.string().nullable(),
  created_by_agent: z.boolean(),
  updated_at: z.number().nullable(),
});

const createResultSchema = z.object({
  action: z.enum(['created', 'existing']),
  room_id: z.string(),
  listing: listingSummarySchema,
});

const listResultSchema = z.object({
  room_id: z.string(),
  count: z.number(),
  listings: z.array(listingSummarySchema),
});

function toolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolError(error) {
  return {
    isError: true,
    content: [{
      type: 'text',
      text: error instanceof Error ? error.message : 'Unexpected connector error.',
    }],
  };
}

export function createFlatAnalyzerMcpServer({ store, roomPolicy }) {
  const server = new McpServer(
    {
      name: 'flat-analyzer',
      version: '1.0.0',
    },
    {
      instructions: 'Create a listing only after browsing its real source page. Copy only facts supported by that page, put its canonical URL in source_url, and omit unknown optional fields. create_listing writes to Flat Analyzer and is idempotent by normalized source URL; retries do not create duplicates. Use list_listings to verify the result or inspect the permitted room.',
    },
  );

  server.registerTool(
    'create_listing',
    {
      title: 'Create apartment listing',
      description: 'Add one browsed apartment listing to the configured Flat Analyzer Firebase room. Requires the real source URL and at least one property fact. A repeated normalized URL returns the existing listing instead of duplicating it.',
      inputSchema: listingInputSchema,
      outputSchema: createResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const roomId = roomPolicy.resolve(input.room_id);
        const result = await store.upsert(roomId, normalizeListing(input));
        return toolResult(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'list_listings',
    {
      title: 'List apartment listings',
      description: 'List recent Flat Analyzer listings from the configured Firebase room. Results are compact and omit images, notes, and source excerpts.',
      inputSchema: listInputSchema,
      outputSchema: listResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const roomId = roomPolicy.resolve(input.room_id);
        const result = await store.list(roomId, input.limit);
        return toolResult(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
