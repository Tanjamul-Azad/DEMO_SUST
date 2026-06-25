// SQLite connection + migration. Uses better-sqlite3 (synchronous, CPU-only, no GPU).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.isAbsolute(config.databaseUrl)
  ? config.databaseUrl
  : path.resolve(config.root, config.databaseUrl);

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return dbPath;
}

// Ensure schema exists on import so the server is always ready.
migrate();

// `npm run migrate` entrypoint
if (process.argv.includes('--migrate')) {
  console.log(`[db] migrated schema at ${dbPath}`);
}
