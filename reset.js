import fs from 'fs';

import { ENVIRONMENT } from './constants';

if (ENVIRONMENT !== 'DEVELOPMENT') {
  console.warn('NOPE. I refuse to reset the production data.');
  process.exit(1);
}

const dbPath = 'storage/db.sqlite';

fs.closeSync(fs.openSync(dbPath, 'w'));
