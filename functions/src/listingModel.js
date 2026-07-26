import { createHash } from 'node:crypto';
import { z } from 'zod';

const ROOM_ID_PATTERN = /^[a-z0-9_-]{4,64}$/;
const TRACKING_PARAM_PATTERN = /^(utm_.+|fbclid|gclid|gad_source)$/i;

const optionalText = (max) => z.string().trim().max(max).optional();
const positiveNumber = z.coerce.number().positive().finite().optional();
const rating = z.coerce.number().min(1).max(10).finite().optional();
const httpUrl = z.url().max(2048).refine(
  (value) => ['http:', 'https:'].includes(new URL(value).protocol),
  'Only http and https URLs are supported.',
);

export const subjectiveRatingsSchema = z.object({
  vibe: rating,
  location: rating,
  light_views: rating,
  layout: rating,
  renovation: rating,
  noise: rating,
}).strip().optional();

export const listingInputSchema = z.object({
  room_id: z.string().trim().toLowerCase().regex(ROOM_ID_PATTERN).optional(),
  source_url: httpUrl,
  name: optionalText(160),
  price_czk: z.coerce.number().int().positive().max(1_000_000_000).optional(),
  size_m2: positiveNumber,
  rooms: optionalText(32),
  floor: optionalText(32),
  address: optionalText(240),
  location: optionalText(120),
  balcony_m2: z.coerce.number().min(0).finite().optional(),
  has_balcony: z.boolean().optional(),
  cellar_m2: z.coerce.number().min(0).finite().optional(),
  has_cellar: z.boolean().optional(),
  parking: z.enum(['none', 'dedicated', 'garage', 'lift', 'street', 'other']).optional(),
  building: z.enum(['brick', 'panel', 'mixed', 'other']).optional(),
  energy_rating: optionalText(16),
  notes: optionalText(4000),
  image_url: httpUrl.optional(),
  source_title: optionalText(300),
  source_excerpt: optionalText(2000),
  observed_at: z.iso.datetime({ offset: true }).optional(),
  agent_name: optionalText(120),
  subjective_ratings: subjectiveRatingsSchema,
}).strip().superRefine((value, context) => {
  if (!value.name && !value.address && !value.source_title) {
    context.addIssue({
      code: 'custom',
      path: ['name'],
      message: 'Provide name, address, or source_title so the listing has a useful label.',
    });
  }

  const hasPropertyFact = [
    value.price_czk,
    value.size_m2,
    value.rooms,
    value.floor,
    value.address,
    value.location,
  ].some((item) => item !== undefined && item !== '');

  if (!hasPropertyFact) {
    context.addIssue({
      code: 'custom',
      path: ['source_url'],
      message: 'Provide at least one property fact in addition to the source URL.',
    });
  }
});

export const roomInputSchema = z.object({
  room_id: z.string().trim().toLowerCase().regex(ROOM_ID_PATTERN).optional(),
}).strip();

export const listInputSchema = roomInputSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function normalizeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http and https listing URLs are supported.');
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM_PATTERN.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

function cleanText(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\s+/g, ' ').trim();
}

function offerIdForUrl(url) {
  const digest = createHash('sha256').update(url).digest('hex').slice(0, 20);
  return `agent_${digest}`;
}

function colorForKey(key) {
  const bytes = createHash('sha256').update(key).digest();
  const hue = ((bytes[0] << 8) + bytes[1]) % 360;
  const saturation = 58 + (bytes[2] % 18);
  const lightness = 42 + (bytes[3] % 12);

  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - chroma / 2;
  const sectors = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ];
  const [red, green, blue] = sectors[Math.floor(hue / 60)];
  const toHex = (channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`.toUpperCase();
}

function mapRatings(ratings = {}) {
  return {
    Vibe: ratings.vibe ?? 5,
    Location: ratings.location ?? 5,
    'Light/Views': ratings.light_views ?? 5,
    Layout: ratings.layout ?? 5,
    Renovation: ratings.renovation ?? 5,
    Noise: ratings.noise ?? 5,
  };
}

function mapParking(value) {
  return {
    none: 'None',
    dedicated: 'Dedicated',
    garage: 'Garage',
    lift: 'Parking Lift',
    street: 'Street',
    other: 'Other',
  }[value];
}

function mapBuilding(value) {
  return {
    brick: 'Brick',
    panel: 'Panel',
    mixed: 'Mixed',
    other: 'Other',
  }[value];
}

function addIfPresent(target, key, value) {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
}

export function normalizeListing(rawInput, now = Date.now()) {
  const input = listingInputSchema.parse(rawInput);
  const url = normalizeUrl(input.source_url);
  const data = { URL: url };

  addIfPresent(data, 'PRICE', input.price_czk);
  addIfPresent(data, 'SIZE', input.size_m2);
  addIfPresent(data, 'ROOMS', cleanText(input.rooms));
  addIfPresent(data, 'FLOOR', cleanText(input.floor));
  addIfPresent(data, 'ADDRESS', cleanText(input.address));
  addIfPresent(data, 'LOCATION', cleanText(input.location));

  if (input.has_balcony !== false) {
    addIfPresent(data, 'BALCONY', input.balcony_m2 ?? (input.has_balcony ? 1 : undefined));
  }
  if (input.has_cellar !== false) {
    addIfPresent(data, 'CELLAR', input.cellar_m2 ?? (input.has_cellar ? 1 : undefined));
  }
  addIfPresent(data, 'PARKING', mapParking(input.parking));
  addIfPresent(data, 'BUILDING', mapBuilding(input.building));
  addIfPresent(data, 'ENERGY', cleanText(input.energy_rating)?.toUpperCase());

  const observedAt = input.observed_at ? Date.parse(input.observed_at) : now;
  const name = cleanText(input.name)
    || cleanText(input.address)
    || cleanText(input.source_title)
    || 'Imported listing';

  return {
    id: offerIdForUrl(url),
    name,
    data,
    subjectiveRatings: mapRatings(input.subjective_ratings),
    notes: input.notes?.trim() || '',
    image: input.image_url || null,
    source: {
      kind: 'agent-browser',
      url,
      title: cleanText(input.source_title) || null,
      excerpt: cleanText(input.source_excerpt) || null,
      observedAt,
      submittedAt: now,
      submittedBy: cleanText(input.agent_name) || 'ChatGPT/Codex agent',
    },
  };
}

function asOfferArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean);
  return [];
}

function existingByUrl(offers, sourceUrl) {
  return offers.find((offer) => {
    try {
      return normalizeUrl(offer?.data?.URL) === sourceUrl;
    } catch {
      return false;
    }
  });
}

export function mergeListingIntoRoom(currentRoom, normalizedListing, operationId, now = Date.now()) {
  const room = currentRoom && typeof currentRoom === 'object' ? currentRoom : {};
  const offers = asOfferArray(room.offers);
  const existing = existingByUrl(offers, normalizedListing.data.URL);

  if (existing) {
    return {
      room,
      result: {
        action: 'existing',
        offer: existing,
      },
    };
  }

  const manualOrder = offers.reduce(
    (highest, offer) => Math.max(highest, Number(offer?.manualOrder) || 0),
    -1,
  ) + 1;
  const offer = {
    ...normalizedListing,
    color: colorForKey(normalizedListing.id),
    featured: true,
    manualOrder,
    sold: false,
    updatedAt: now,
    source: {
      ...normalizedListing.source,
      operationId,
    },
  };

  return {
    room: {
      ...room,
      offers: [...offers, offer],
      meta: room.meta || {},
      updatedAt: now,
    },
    result: {
      action: 'created',
      offer,
    },
  };
}

export function compactOffer(offer) {
  const updatedAt = Number(offer.updatedAt);

  return {
    id: String(offer.id || ''),
    name: String(offer.name || 'Untitled listing'),
    url: typeof offer.data?.URL === 'string' ? offer.data.URL : null,
    price_czk: priceNumber(offer.data?.PRICE),
    size_m2: sizeNumber(offer.data?.SIZE),
    rooms: offer.data?.ROOMS == null ? null : String(offer.data.ROOMS),
    address: offer.data?.ADDRESS == null ? null : String(offer.data.ADDRESS),
    location: offer.data?.LOCATION == null ? null : String(offer.data.LOCATION),
    created_by_agent: offer.source?.kind === 'agent-browser',
    updated_at: Number.isFinite(updatedAt) ? updatedAt : null,
  };
}

export function operationCreatedOffer(room, operationId) {
  return asOfferArray(room?.offers).find(
    (offer) => offer?.source?.operationId === operationId,
  );
}

export function findOfferByUrl(room, sourceUrl) {
  return existingByUrl(asOfferArray(room?.offers), sourceUrl);
}

function priceNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function sizeNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value || '').match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(',', '.')) : null;
}

export function listRoomOffers(room, limit = 50) {
  return asOfferArray(room?.offers)
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, limit)
    .map(compactOffer);
}
