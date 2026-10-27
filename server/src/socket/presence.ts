/**
 * In-memory presence tracking: a user is online while at least one of their
 * sockets (tabs/devices) is connected. For multiple API instances this would
 * move to Redis together with the Socket.IO Redis adapter.
 */
const connections = new Map<string, Set<string>>();

/** Registers a socket; returns true if the user just came online. */
export function addConnection(userId: string, socketId: string): boolean {
  const sockets = connections.get(userId);
  if (sockets) {
    sockets.add(socketId);
    return false;
  }
  connections.set(userId, new Set([socketId]));
  return true;
}

/** Unregisters a socket; returns true if the user just went offline. */
export function removeConnection(userId: string, socketId: string): boolean {
  const sockets = connections.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size > 0) return false;
  connections.delete(userId);
  return true;
}

export function isOnline(userId: string): boolean {
  return connections.has(userId);
}

export function onlineCount(): number {
  return connections.size;
}

export function resetPresence(): void {
  connections.clear();
}
