import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const bool = (v, fallback = false) => v === undefined ? fallback : ['true','1','yes'].includes(String(v).toLowerCase());
export function loadConfig(env = process.env) {
  const dbFile=path.resolve(env.DATABASE_FILE || path.join(serverRoot,'data','bluehaven.sqlite'));
  const bounded=(value,fallback,min,max)=>{const n=Number(value??fallback);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.floor(n))):fallback;};
  return {
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 3001),
    dbFile,
    publicOrigin:env.PUBLIC_ORIGIN||'',
    lifeDbFile:path.resolve(env.LIFE_DB_PATH||dbFile),
    lifeWelcomeCoins:bounded(env.LIFE_WELCOME_COINS,0,0,10000),
    lifeAiWelcomeCoins:bounded(env.LIFE_AI_WELCOME_COINS,0,0,10000),
    memoryEnabled: bool(env.LONGMEMORY_ENABLED,true),
    memoryDbFile:path.resolve(env.LONGMEMORY_DB_PATH||path.join(path.dirname(dbFile),'longmemory.sqlite')),
    memoryTenant:env.LONGMEMORY_TENANT_ID||'',
    memoryTopK:bounded(env.LONGMEMORY_TOP_K,8,1,16),
    memoryTokenBudget:bounded(env.LONGMEMORY_TOKEN_BUDGET,1200,200,4000),
    clientOrigins: (env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:8080').split(',').map(s=>s.trim()).filter(Boolean),
    cookieSecure: bool(env.COOKIE_SECURE),
    aiMode: env.AI_MODE === 'api' ? 'api' : env.AI_MODE === 'mock' ? 'mock' : 'disabled',
    aiWebSearch: env.AI_WEB_SEARCH===undefined?undefined:bool(env.AI_WEB_SEARCH),
    aiApiFormat: env.AI_API_FORMAT||'auto',
    aiName: env.AI_NAME || 'AI',
    aiTriggerMode: env.AI_TRIGGER_MODE === 'mention' ? 'mention' : 'auto',
    aiBaseUrl: env.AI_BASE_URL || '',
    aiApiKey: env.AI_API_KEY || '',
    aiModel: env.AI_MODEL || '',
    aiTimeoutMs: Math.min(Math.max(Number(env.AI_TIMEOUT_MS || 90000), 3000), 180000),
    aiMaxOutputTokens: Math.min(Math.max(Number(env.AI_MAX_OUTPUT_TOKENS || 800), 64), 3000),
    ttsEnabled: bool(env.TTS_ENABLED),
    ttsUrl: env.TTS_PROVIDER_URL || '',
    ttsApiKey: env.TTS_API_KEY || env.AI_API_KEY || '',
    ttsModel: env.TTS_MODEL || '',
    ttsVoice: env.TTS_VOICE || 'alloy',
    personaPath: path.resolve(env.PERSONA_FILE || path.join(serverRoot, 'prompts', 'persona.md')),
    personaTemplatePath: path.join(serverRoot, 'prompts', 'persona.md'),
    profilePath: path.join(serverRoot, 'prompts', 'public-profile.json'),
  };
}
