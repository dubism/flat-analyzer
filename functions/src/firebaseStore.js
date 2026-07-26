import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import {
  compactOffer,
  findOfferByUrl,
  listRoomOffers,
  mergeListingIntoRoom,
  operationCreatedOffer,
} from './listingModel.js';

function getAdminDatabase() {
  if (getApps().length === 0) initializeApp();
  return getDatabase();
}

export function createFirebaseListingStore(database = getAdminDatabase()) {
  return {
    async upsert(roomId, normalizedListing) {
      const operationId = randomUUID();
      const now = Date.now();
      const roomRef = database.ref(`rooms/${roomId}`);
      const transaction = await roomRef.transaction((currentRoom) => {
        const merged = mergeListingIntoRoom(currentRoom, normalizedListing, operationId, now);
        return merged.room;
      });

      if (!transaction.committed) {
        throw new Error('Firebase did not commit the listing transaction.');
      }

      const room = transaction.snapshot.val();
      const created = operationCreatedOffer(room, operationId);
      const offer = created || findOfferByUrl(room, normalizedListing.data.URL);
      if (!offer) {
        throw new Error('The listing transaction committed but the listing could not be verified.');
      }

      return {
        action: created ? 'created' : 'existing',
        room_id: roomId,
        listing: compactOffer(offer),
      };
    },

    async list(roomId, limit = 50) {
      const snapshot = await database.ref(`rooms/${roomId}`).once('value');
      const listings = listRoomOffers(snapshot.val(), limit);
      return {
        room_id: roomId,
        count: listings.length,
        listings,
      };
    },
  };
}
