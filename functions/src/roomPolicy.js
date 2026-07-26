const ROOM_ID_PATTERN = /^[a-z0-9_-]{4,64}$/;

export class RequestError extends Error {
  constructor(status, message, code = 'request_error') {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
  }
}

function normalizeRoomId(value) {
  const roomId = String(value || '').trim().toLowerCase();
  if (!ROOM_ID_PATTERN.test(roomId)) {
    throw new RequestError(400, 'room_id must be 4–64 lowercase letters, numbers, "_" or "-".', 'invalid_room');
  }
  return roomId;
}

export function createRoomPolicy({ defaultRoomId = '', allowedRoomIds = '' } = {}) {
  const normalizedDefault = defaultRoomId ? normalizeRoomId(defaultRoomId) : '';
  const allowed = new Set(
    String(allowedRoomIds)
      .split(',')
      .map((roomId) => roomId.trim())
      .filter(Boolean)
      .map(normalizeRoomId),
  );
  if (normalizedDefault) allowed.add(normalizedDefault);

  return {
    resolve(requestedRoomId) {
      if (allowed.size === 0) {
        throw new RequestError(
          503,
          'No Firebase room is configured for the connector.',
          'room_configuration_missing',
        );
      }

      const roomId = requestedRoomId
        ? normalizeRoomId(requestedRoomId)
        : normalizedDefault;
      if (!roomId) {
        throw new RequestError(
          400,
          'room_id is required because no default room is configured.',
          'room_required',
        );
      }
      if (!allowed.has(roomId)) {
        throw new RequestError(403, 'This connector is not allowed to access that room.', 'room_forbidden');
      }
      return roomId;
    },
  };
}
