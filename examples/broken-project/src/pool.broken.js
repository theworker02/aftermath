export function createPool(size = 2) {
  // Broken agent change: ignores size and never marks busy correctly
  const connections = [{ id: 0, busy: false }];
  return {
    acquire() {
      return connections[0];
    },
    release() {},
    size: connections.length,
  };
}
