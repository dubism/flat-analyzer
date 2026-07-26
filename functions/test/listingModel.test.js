import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactOffer,
  mergeListingIntoRoom,
  normalizeListing,
  normalizeUrl,
} from '../src/listingModel.js';

test('normalizeUrl removes tracking and preserves listing identity', () => {
  assert.equal(
    normalizeUrl('HTTPS://WWW.SREALITY.CZ/detail/123/?utm_source=test&foo=bar#photos'),
    'https://www.sreality.cz/detail/123?foo=bar',
  );
});

test('normalizeListing maps agent fields to the existing offer model', () => {
  const listing = normalizeListing({
    source_url: 'https://example.com/listing/1',
    address: '  Dělnická   12 ',
    price_czk: '9200000',
    size_m2: '58.5',
    rooms: '2+kk',
    has_balcony: true,
    cellar_m2: 3.2,
    parking: 'garage',
    building: 'brick',
    energy_rating: 'd',
    subjective_ratings: { location: 8 },
    observed_at: '2026-07-26T08:00:00+00:00',
  }, 123);

  assert.equal(listing.name, 'Dělnická 12');
  assert.equal(listing.data.PRICE, 9_200_000);
  assert.equal(listing.data.SIZE, 58.5);
  assert.equal(listing.data.BALCONY, 1);
  assert.equal(listing.data.CELLAR, 3.2);
  assert.equal(listing.data.PARKING, 'Garage');
  assert.equal(listing.data.BUILDING, 'Brick');
  assert.equal(listing.data.ENERGY, 'D');
  assert.equal(listing.subjectiveRatings.Location, 8);
  assert.equal(listing.subjectiveRatings.Vibe, 5);
  assert.equal(listing.source.observedAt, Date.parse('2026-07-26T08:00:00+00:00'));
});

test('mergeListingIntoRoom appends once and is idempotent by normalized URL', () => {
  const listing = normalizeListing({
    source_url: 'https://example.com/listing/1?utm_campaign=retry',
    name: 'Test flat',
    price_czk: 8_000_000,
  }, 1000);

  const first = mergeListingIntoRoom(
    { offers: [{ id: 'old', manualOrder: 4, data: { URL: 'https://example.com/other' } }] },
    listing,
    'operation-one',
    1000,
  );
  assert.equal(first.result.action, 'created');
  assert.equal(first.result.offer.manualOrder, 5);
  assert.equal(first.room.offers.length, 2);

  const retry = mergeListingIntoRoom(
    first.room,
    normalizeListing({
      source_url: 'https://example.com/listing/1/',
      name: 'Duplicate attempt',
      price_czk: 8_000_000,
    }, 2000),
    'operation-two',
    2000,
  );
  assert.equal(retry.result.action, 'existing');
  assert.equal(retry.room.offers.length, 2);
  assert.equal(retry.result.offer.name, 'Test flat');
});

test('compactOffer normalizes legacy string values for MCP output', () => {
  const offer = compactOffer({
    id: 'manual-1',
    name: 'Manual listing',
    data: {
      URL: 'https://example.com/manual',
      PRICE: '10 950 000 CZK',
      SIZE: '74 m²',
      ROOMS: '3+kk',
    },
    updatedAt: '1234',
  });

  assert.equal(offer.price_czk, 10_950_000);
  assert.equal(offer.size_m2, 74);
  assert.equal(offer.updated_at, 1234);
});
