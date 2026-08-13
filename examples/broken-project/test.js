import { createPool } from './src/pool.js';

const pool = createPool(2);
const a = pool.acquire();
const b = pool.acquire();
let exhausted = false;
try {
  pool.acquire();
} catch {
  exhausted = true;
}
pool.release(a);
pool.release(b);
if (!exhausted) {
  console.error('expected pool exhaustion');
  process.exit(1);
}
console.log('1 passed');
process.exit(0);
