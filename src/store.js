/**
 * store.js — per-mobile-number storage layer.
 *
 * Every account (identified by its phone number) gets its OWN folder:
 *
 *   data/users/<phone>/
 *     profile.json     -> account + surprise settings (hashed passwords)
 *     memories.json    -> all memories (words, dates, photo file names)
 *     photos/          -> the uploaded photos of that phone number only
 *
 * Nothing is shared between accounts, so two people using this app can never
 * see each other's memories.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

fs.mkdirSync(USERS_DIR, { recursive: true });

/** Keep a phone number safe to use as a folder name (digits only). */
function normalisePhone(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

function userDir(phone) {
  return path.join(USERS_DIR, normalisePhone(phone));
}

function photosDir(phone) {
  return path.join(userDir(phone), 'photos');
}

function ensureUser(phone) {
  const dir = userDir(phone);
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  return dir;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function phoneExists(phone) {
  return fs.existsSync(path.join(userDir(phone), 'profile.json'));
}

function listPhones() {
  try {
    return fs
      .readdirSync(USERS_DIR)
      .filter((p) => fs.existsSync(path.join(USERS_DIR, p, 'profile.json')));
  } catch {
    return [];
  }
}

function readProfile(phone) {
  return readJson(path.join(userDir(phone), 'profile.json'), null);
}

function writeProfile(phone, profile) {
  ensureUser(phone);
  writeJson(path.join(userDir(phone), 'profile.json'), profile);
  return profile;
}

function readMemories(phone) {
  return readJson(path.join(userDir(phone), 'memories.json'), []);
}

function writeMemories(phone, memories) {
  ensureUser(phone);
  writeJson(path.join(userDir(phone), 'memories.json'), memories);
  return memories;
}

/** Find the account that owns a public share code. */
function findByShareCode(code) {
  if (!code) return null;
  for (const phone of listPhones()) {
    const profile = readProfile(phone);
    if (profile && profile.shareCode === code) return { phone, profile };
  }
  return null;
}

/* ------------------------------- sessions -------------------------------- */

function readSessions() {
  return readJson(SESSIONS_FILE, {});
}

function saveSessions(sessions) {
  writeJson(SESSIONS_FILE, sessions);
}

function createSession(phone, ttlMs = 1000 * 60 * 60 * 12) {
  const sessions = readSessions();
  const token = require('crypto').randomBytes(24).toString('hex');
  sessions[token] = { phone: normalisePhone(phone), expires: Date.now() + ttlMs };
  saveSessions(sessions);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const sessions = readSessions();
  const session = sessions[token];
  if (!session) return null;
  if (session.expires < Date.now()) {
    delete sessions[token];
    saveSessions(sessions);
    return null;
  }
  return session;
}

function destroySession(token) {
  if (!token) return;
  const sessions = readSessions();
  delete sessions[token];
  saveSessions(sessions);
}

/* --------------------------- totals (dashboard) -------------------------- */

function storageSummary(phone) {
  const dir = photosDir(phone);
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    files = [];
  }
  const bytes = files.reduce((sum, f) => {
    try {
      return sum + fs.statSync(path.join(dir, f)).size;
    } catch {
      return sum;
    }
  }, 0);
  return { photos: files.length, bytes };
}

module.exports = {
  DATA_DIR,
  USERS_DIR,
  normalisePhone,
  userDir,
  photosDir,
  ensureUser,
  phoneExists,
  listPhones,
  readProfile,
  writeProfile,
  readMemories,
  writeMemories,
  findByShareCode,
  createSession,
  getSession,
  destroySession,
  storageSummary,
};
