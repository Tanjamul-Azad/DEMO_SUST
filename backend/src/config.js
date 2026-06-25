// Tiny zero-dependency .env loader + config. No secrets live here; only local config.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* no .env file — fall back to process.env / defaults */
  }
}

loadEnvFile(path.join(ROOT, '.env'));

const bool = (v, d) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(v));

export const config = {
  root: ROOT,
  port: Number(process.env.PORT || 8787),
  databaseUrl: process.env.DATABASE_URL || './queuestorm.db',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  llm: {
    enabled: bool(process.env.LLM_ENABLED, true),
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    model: process.env.GEMMA_MODEL || 'gemma4',
    timeoutMs: Number(process.env.GEMMA_TIMEOUT_MS || 6000),
  },
  version: '1.0.0',
};
