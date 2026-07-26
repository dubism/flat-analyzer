import { randomUUID } from 'node:crypto';
import {
  compactOffer,
  listRoomOffers,
  mergeListingIntoRoom,
} from '../src/listingModel.js';

export function createFakeStore() {
  const rooms = new Map();

  return {
    rooms,

    async upsert(roomId, normalizedListing) {
      const operationId = randomUUID();
      const merged = mergeListingIntoRoom(
        rooms.get(roomId),
        normalizedListing,
        operationId,
        Date.now(),
      );
      rooms.set(roomId, merged.room);
      return {
        action: merged.result.action,
        room_id: roomId,
        listing: compactOffer(merged.result.offer),
      };
    },

    async list(roomId, limit) {
      const listings = listRoomOffers(rooms.get(roomId), limit);
      return {
        room_id: roomId,
        count: listings.length,
        listings,
      };
    },
  };
}
