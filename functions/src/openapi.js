export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Flat Analyzer Listing API',
    version: '1.0.0',
    description: 'Create idempotent apartment listings from facts collected by a browsing agent.',
  },
  servers: [{ url: '.' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/v1/listings': {
      post: {
        operationId: 'createListing',
        summary: 'Create a listing from browsed source data',
        description: 'Creates a listing or returns the existing listing when the normalized source URL is already present.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ListingInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'The listing already existed.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateResult' } } },
          },
          201: {
            description: 'The listing was created.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateResult' } } },
          },
          400: { $ref: '#/components/responses/Error' },
          401: { $ref: '#/components/responses/Error' },
          403: { $ref: '#/components/responses/Error' },
        },
      },
      get: {
        operationId: 'listListings',
        summary: 'List recent listings',
        parameters: [
          {
            name: 'room_id',
            in: 'query',
            schema: { type: 'string' },
            description: 'Optional when a default room is configured.',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        ],
        responses: {
          200: {
            description: 'Compact listing summaries.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ListResult' } } },
          },
          401: { $ref: '#/components/responses/Error' },
          403: { $ref: '#/components/responses/Error' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
    responses: {
      Error: {
        description: 'Request error.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                code: { type: 'string' },
              },
              required: ['error', 'code'],
            },
          },
        },
      },
    },
    schemas: {
      ListingInput: {
        type: 'object',
        additionalProperties: false,
        required: ['source_url'],
        properties: {
          room_id: { type: 'string', description: 'Optional when a default room is configured.' },
          source_url: { type: 'string', format: 'uri' },
          name: { type: 'string', maxLength: 160 },
          price_czk: { type: 'integer', minimum: 1 },
          size_m2: { type: 'number', exclusiveMinimum: 0 },
          rooms: { type: 'string' },
          floor: { type: 'string' },
          address: { type: 'string' },
          location: { type: 'string' },
          balcony_m2: { type: 'number', minimum: 0 },
          has_balcony: { type: 'boolean' },
          cellar_m2: { type: 'number', minimum: 0 },
          has_cellar: { type: 'boolean' },
          parking: { type: 'string', enum: ['none', 'dedicated', 'garage', 'lift', 'street', 'other'] },
          building: { type: 'string', enum: ['brick', 'panel', 'mixed', 'other'] },
          energy_rating: { type: 'string' },
          notes: { type: 'string', maxLength: 4000 },
          image_url: { type: 'string', format: 'uri' },
          source_title: { type: 'string' },
          source_excerpt: { type: 'string', maxLength: 2000 },
          observed_at: { type: 'string', format: 'date-time' },
          agent_name: { type: 'string' },
          subjective_ratings: {
            type: 'object',
            additionalProperties: false,
            properties: {
              vibe: { type: 'number', minimum: 1, maximum: 10 },
              location: { type: 'number', minimum: 1, maximum: 10 },
              light_views: { type: 'number', minimum: 1, maximum: 10 },
              layout: { type: 'number', minimum: 1, maximum: 10 },
              renovation: { type: 'number', minimum: 1, maximum: 10 },
              noise: { type: 'number', minimum: 1, maximum: 10 },
            },
          },
        },
      },
      ListingSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          url: { type: ['string', 'null'], format: 'uri' },
          price_czk: { type: ['number', 'null'] },
          size_m2: { type: ['number', 'null'] },
          rooms: { type: ['string', 'null'] },
          address: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          created_by_agent: { type: 'boolean' },
          updated_at: { type: ['number', 'null'] },
        },
        required: ['id', 'name', 'url', 'price_czk', 'size_m2', 'rooms', 'address', 'location', 'created_by_agent', 'updated_at'],
      },
      CreateResult: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['created', 'existing'] },
          room_id: { type: 'string' },
          listing: { $ref: '#/components/schemas/ListingSummary' },
        },
        required: ['action', 'room_id', 'listing'],
      },
      ListResult: {
        type: 'object',
        properties: {
          room_id: { type: 'string' },
          count: { type: 'integer' },
          listings: {
            type: 'array',
            items: { $ref: '#/components/schemas/ListingSummary' },
          },
        },
        required: ['room_id', 'count', 'listings'],
      },
    },
  },
};
