import {MEDIA_SCHEMA} from './uploads.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const makeToken = () => randomBytes(32).toString('base64url');
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, saved) {
  if (typeof saved !== 'string') return false;
  const [algorithm, salt, digest] = saved.split(':');
  if (algorithm !== 'scrypt' || !salt || !digest || digest.length !== 128) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(digest, 'hex'));
}
export function createDB(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT REFERENCES users(id),
      role TEXT NOT NULL CHECK(role IN ('human','ai')),
      content TEXT NOT NULL, client_id TEXT, created_at INTEGER NOT NULL,
      UNIQUE(user_id, client_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(id);
  `);
  if(!db.prepare('PRAGMA table_info(messages)').all().some(c=>c.name==='reply_to_message_id'))db.exec('ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER REFERENCES messages(id)');
  db.exec('CREATE TABLE IF NOT EXISTS message_actions(action_id TEXT PRIMARY KEY,message_id INTEGER NOT NULL,label TEXT NOT NULL,status TEXT NOT NULL,updated_at INTEGER NOT NULL)');
  for(const [name,definition] of [['membership',"TEXT NOT NULL DEFAULT 'approved'"],['avatar_url',"TEXT NOT NULL DEFAULT ''"],['muted_until','INTEGER NOT NULL DEFAULT 0'],['daily_token_limit','INTEGER']])if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name===name))db.exec('ALTER TABLE users ADD COLUMN '+name+' '+definition);
  db.exec(MEDIA_SCHEMA);if(!db.prepare('PRAGMA table_info(messages)').all().some(c=>c.name==='sources'))db.exec("ALTER TABLE messages ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'");
  db.exec("CREATE TABLE IF NOT EXISTS chat_memory_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
  const state=key=>db.prepare('SELECT value FROM chat_memory_state WHERE key=?').get(key)?.value;
  const saveState=(key,value)=>db.prepare('INSERT INTO chat_memory_state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));
  const queries = {
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userBySession: db.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.avatar_url,u.membership,u.muted_until,u.daily_token_limit FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.membership='approved'`),
    allUsers: db.prepare("SELECT id,username,display_name,role,avatar_url,muted_until FROM users WHERE membership='approved' ORDER BY created_at ASC"),
    createUser: db.prepare('INSERT INTO users (id,username,display_name,password_hash,role,created_at,membership) VALUES (?,?,?,?,?,?,?)'),
    createSession: db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash=?'),
    createHumanMessage: db.prepare('INSERT INTO messages (user_id,role,content,client_id,created_at) VALUES (?,\'human\',?,?,?)'),
    createAiMessage: db.prepare("INSERT INTO messages (user_id,role,content,client_id,created_at,reply_to_message_id,sources) VALUES (NULL,'ai',?,NULL,?,?,?)"),
    msgById: db.prepare(`SELECT m.id,m.role,m.content,m.client_id AS clientId,m.created_at AS createdAt,
      u.id AS userId,u.username,u.display_name AS displayName,u.avatar_url AS avatarUrl,m.reply_to_message_id AS replyToMessageId,m.sources FROM messages m LEFT JOIN users u ON m.user_id=u.id WHERE m.id=?`),
    msgByClientId: db.prepare('SELECT id FROM messages WHERE user_id=? AND client_id=?'),
    recent: db.prepare('SELECT id FROM messages ORDER BY id DESC LIMIT ?'),
    before: db.prepare('SELECT id FROM messages WHERE id < ? ORDER BY id DESC LIMIT ?'),
    after: db.prepare('SELECT id FROM messages WHERE id > ? ORDER BY id ASC LIMIT ?'),
    context: db.prepare('SELECT id FROM messages ORDER BY id DESC LIMIT ?'),
    newestHuman: db.prepare(`SELECT MAX(id) AS id FROM messages WHERE role='human'`),
    countUsers: db.prepare('SELECT COUNT(*) AS total FROM users'),
  };
  function outputMessage(id) {
    const row = queries.msgById.get(id);
    if (!row) return null;
    return {
      id: row.id, role: row.role, content: row.content, clientId: row.clientId,
      createdAt: row.createdAt,sources:JSON.parse(row.sources||'[]'),attachments:db.prepare('SELECT u.id,u.name,u.mime,u.kind,u.size,u.duration FROM message_media a JOIN chat_uploads u ON u.id=a.upload_id WHERE a.message_id=?').all(row.id).map(a=>({...a,url:'/social-api/api/uploads/'+a.id})),
      ...(row.role==='human'?{actions:db.prepare('SELECT action_id AS actionId,label,status FROM message_actions WHERE message_id=? ORDER BY updated_at').all(id)}:{}),
      ...(row.replyToMessageId?{replyTo:(()=>{const target=queries.msgById.get(row.replyToMessageId);return {messageId:row.replyToMessageId,author:target?{id:target.userId,username:target.username,displayName:target.displayName,avatarUrl:target.avatarUrl}:null};})()}:{}),
      author: row.role === 'ai' ? null : { id: row.userId, username: row.username, displayName: row.displayName,avatarUrl:row.avatarUrl },
    };
  }
  return {
    close: () => db.close(),
    memoryIdentity: () => state('identity'),
    memoryCutoffInitialized: () => state('cutoff')!==undefined,
    memoryCutoff: () => Number(state('cutoff')||0),
    ensureMemoryIdentity(candidate){if(!state('identity'))saveState('identity',candidate||'bluehaven-room-'+randomUUID());return state('identity');},
    setMemoryCutoff(id){saveState('cutoff',Math.max(Number(state('cutoff')||0),id));},
    userCount: () => queries.countUsers.get().total,
    register({ username, displayName, password,membership='approved' }) {
      const id = randomUUID();
      const role = queries.countUsers.get().total === 0 ? 'admin' : 'member';
      queries.createUser.run(id, username, displayName, hashPassword(password), role, Date.now(),role==='admin'?'approved':membership);
      return { id, username, displayName, role,membership:role==='admin'?'approved':membership,avatarUrl:'' };
    },
    validateLogin(username, password) {
      const row = queries.userByName.get(username);
      if (!row || !verifyPassword(password, row.password_hash)) return null;
      return { id: row.id, username: row.username, displayName: row.display_name, role: row.role,membership:row.membership,avatarUrl:row.avatar_url,muted_until:row.muted_until,daily_token_limit:row.daily_token_limit };
    },
    setMembership:(id,status)=>db.prepare('UPDATE users SET membership=? WHERE id=?').run(status,id),
    updateProfile(id,{name,avatarUrl}){db.prepare('UPDATE users SET display_name=?,avatar_url=? WHERE id=?').run(name,avatarUrl,id);return db.prepare('SELECT id,username,display_name,role,avatar_url,membership,muted_until,daily_token_limit FROM users WHERE id=?').get(id);},
    createSession(userId) {
      const token = makeToken();
      queries.createSession.run(tokenHash(token), userId, Date.now() + SESSION_LIFETIME_MS, Date.now());
      return token;
    },
    findSession(token) { return token ? queries.userBySession.get(tokenHash(token), Date.now()) || null : null; },
    deleteSession(token) { if (token) queries.deleteSession.run(tokenHash(token)); },
    allUsers: () => queries.allUsers.all().map(r => ({ id:r.id, username:r.username, displayName:r.display_name, role:r.role,avatarUrl:r.avatar_url,mutedUntil:r.muted_until })),
    addHumanMessage(userId, content, clientId,attachments=[]) {
      const existing = queries.msgByClientId.get(userId, clientId);
      if (existing) return { message: outputMessage(existing.id), created:false };
      try {
        db.exec('BEGIN IMMEDIATE');
        const result = queries.createHumanMessage.run(userId, content, clientId, Date.now());
        const id=Number(result.lastInsertRowid);for(const uploadId of attachments)db.prepare('INSERT INTO message_media VALUES(?,?)').run(id,uploadId);const message=outputMessage(id);db.exec('COMMIT');return { message, created: true };
      } catch (error) {
        try{db.exec('ROLLBACK');}catch{}
        if (String(error).includes('UNIQUE')) {
          const found = queries.msgByClientId.get(userId, clientId);
          if (found) return { message: outputMessage(found.id), created: false };
        }
        throw error;
      }
    },
    addAiMessage(content,{replyToMessageId=null,sources=[]}={}) {
      const result = queries.createAiMessage.run(content, Date.now(),replyToMessageId,JSON.stringify(sources));
      return outputMessage(Number(result.lastInsertRowid));
    },
    getMessage: id => outputMessage(id),
    getMessages({ before, after, limit = 60 } = {}) {
      const ids = after ? queries.after.all(after, limit) : before ? queries.before.all(before, limit) : queries.recent.all(limit).reverse();
      return ids.map(row => outputMessage(row.id));
    },
    getContext: (limit = 35) => queries.context.all(limit).reverse().filter(row=>row.id>Number(state('cutoff')||0)).map(row => outputMessage(row.id)),
    getMessagesAfter: (after=0,limit=100) => queries.after.all(after,limit).map(row=>outputMessage(row.id)),
    latestHumanId: () => queries.newestHuman.get().id || 0,
  };
}
