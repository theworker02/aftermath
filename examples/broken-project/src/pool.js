export function createPool(size = 2) {
  if (size < 1) throw new Error('size must be >= 1');
  const connections = Array.from({ length: size }, (_, id) => ({ id, busy: false }));
  return {
    acquire() {
      const free = connections.find((c) => !c.busy);
      if (!free) throw new Error('pool exhausted');
      free.busy = true;
      return free;
    },
    release(conn) {
      conn.busy = false;
    },
    size: connections.length,
  };
}
