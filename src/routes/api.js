/**
 * routes/api.js — the backend/owner side.
 * Login is by MOBILE NUMBER + password. Everything a logged-in owner does is
 * written into data/users/<their phone number>/ only.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const store = require('../store');
const auth = require('../auth');

const router = express.Router();

/* ------------------------------- uploads --------------------------------- */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    // Always write into THIS phone number's own photo folder.
    store.ensureUser(req.session.phone);
    cb(null, store.photosDir(req.session.phone));
  },
  filename(req, file, cb) {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().slice(0, 6);
    cb(null, `${Date.now()}-${auth.id()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024, files: 20 },
  fileFilter(req, file, cb) {
    if (!ALLOWED.has(file.mimetype)) return cb(new Error('Only JPG, PNG, WEBP, GIF or AVIF photos are allowed.'));
    return cb(null, true);
  },
});

/* ------------------------------ middleware ------------------------------- */
function requireLogin(req, res, next) {
  const session = store.getSession(req.cookies.bday_session);
  if (!session) return res.status(401).json({ error: 'Please log in with your mobile number.' });
  req.session = session;
  next();
}

function publicProfile(phone) {
  const p = store.readProfile(phone) || {};
  const memoryCount = store.readMemories(phone).length;
  return {
    phone,
    displayName: p.displayName || '',
    celebrantName: p.celebrantName || '',
    birthdayDate: p.birthdayDate || '',
    introTitle: p.introTitle || 'Happy Birthday!',
    introMessage: p.introMessage || '',
    themeHue: p.themeHue ?? 330,
    hasMagicPassword: Boolean(p.magicPasswordHash),
    shareCode: p.shareCode,
    createdAt: p.createdAt,
    memoryCount,
    storage: store.storageSummary(phone),
  };
}

/* --------------------------- auth: phone + password ---------------------- */
router.get('/auth/check-phone', (req, res) => {
  const phone = store.normalisePhone(req.query.phone);
  if (phone.length < 10) return res.status(400).json({ error: 'Enter a valid mobile number.' });
  res.json({ phone, taken: store.phoneExists(phone) });
});

router.post('/auth/register', (req, res) => {
  const phone = store.normalisePhone(req.body.phone);
  const { password } = req.body;
  if (phone.length < 10 || phone.length > 15) return res.status(400).json({ error: 'Mobile number must have 10–15 digits.' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (store.phoneExists(phone)) return res.status(409).json({ error: 'This mobile number already has an account. Please log in.' });

  store.writeProfile(phone, {
    phone,
    passwordHash: auth.hashSecret(password),
    displayName: String(req.body.displayName || '').slice(0, 60),
    celebrantName: '',
    birthdayDate: '',
    introTitle: 'Happy Birthday!',
    introMessage: '',
    themeHue: 330,
    magicPasswordHash: null,
    shareCode: auth.shareCode(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.writeMemories(phone, []);

  const token = store.createSession(phone);
  res.cookie('bday_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 });
  res.json({ ok: true, profile: publicProfile(phone) });
});

router.post('/auth/login', (req, res) => {
  const phone = store.normalisePhone(req.body.phone);
  const { password } = req.body;
  if (auth.tooManyAttempts(`login:${phone}`)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait 10 minutes and try again.' });
  }
  const profile = store.readProfile(phone);
  if (!profile || !auth.verifySecret(password, profile.passwordHash)) {
    auth.noteFailedAttempt(`login:${phone}`);
    return res.status(401).json({ error: 'Mobile number or password is wrong.' });
  }
  auth.clearAttempts(`login:${phone}`);
  const token = store.createSession(phone);
  res.cookie('bday_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 });
  res.json({ ok: true, profile: publicProfile(phone) });
});

router.post('/auth/logout', (req, res) => {
  store.destroySession(req.cookies.bday_session);
  res.clearCookie('bday_session');
  res.json({ ok: true });
});

router.get('/me', requireLogin, (req, res) => {
  res.json({ profile: publicProfile(req.session.phone) });
});

/* ------------------------------ surprise settings ------------------------ */
router.put('/settings', requireLogin, (req, res) => {
  const phone = req.session.phone;
  const profile = store.readProfile(phone);
  const { displayName, celebrantName, birthdayDate, introTitle, introMessage, themeHue, magicPassword } = req.body;

  if (typeof displayName === 'string') profile.displayName = displayName.slice(0, 60);
  if (typeof celebrantName === 'string') profile.celebrantName = celebrantName.slice(0, 60);
  if (typeof birthdayDate === 'string') profile.birthdayDate = birthdayDate.slice(0, 10);
  if (typeof introTitle === 'string') profile.introTitle = introTitle.slice(0, 90);
  if (typeof introMessage === 'string') profile.introMessage = introMessage.slice(0, 1200);
  if (themeHue !== undefined && !Number.isNaN(Number(themeHue))) profile.themeHue = Math.max(0, Math.min(360, Number(themeHue)));

  if (magicPassword) {
    if (String(magicPassword).length < 3) return res.status(400).json({ error: 'Magic password needs at least 3 characters.' });
    profile.magicPasswordHash = auth.hashSecret(String(magicPassword).trim().toLowerCase());
  }
  profile.updatedAt = new Date().toISOString();
  store.writeProfile(phone, profile);
  res.json({ ok: true, profile: publicProfile(phone) });
});

router.post('/share-code/reset', requireLogin, (req, res) => {
  const phone = req.session.phone;
  const profile = store.readProfile(phone);
  profile.shareCode = auth.shareCode();
  store.writeProfile(phone, profile);
  res.json({ ok: true, profile: publicProfile(phone) });
});

/* ---------------- photos for the logged-in owner (dashboard) ------------- */
router.get('/photos/:filename', requireLogin, (req, res) => {
  const file = path.join(store.photosDir(req.session.phone), path.basename(req.params.filename));
  if (!fs.existsSync(file)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(file);
});

/* -------------------------------- memories ------------------------------- */
router.get('/memories', requireLogin, (req, res) => {
  res.json({ memories: store.readMemories(req.session.phone) });
});

router.post('/memories', requireLogin, upload.array('photos', 20), (req, res) => {
  const phone = req.session.phone;
  const { title, words, author, memoryDate, emoji } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Give this memory a title.' });
  }
  const memory = {
    id: auth.id(),
    title: String(title).slice(0, 120),
    words: String(words || '').slice(0, 4000),
    author: String(author || '').slice(0, 60),
    memoryDate: String(memoryDate || '').slice(0, 20),
    emoji: String(emoji || '💖').slice(0, 4) || '💖',
    photos: (req.files || []).map((f) => f.filename),
    createdAt: new Date().toISOString(),
  };
  const memories = store.readMemories(phone);
  memories.unshift(memory);
  store.writeMemories(phone, memories);
  res.status(201).json({ ok: true, memory, profile: publicProfile(phone) });
});

router.put('/memories/:id', requireLogin, (req, res) => {
  const phone = req.session.phone;
  const memories = store.readMemories(phone);
  const memory = memories.find((m) => m.id === req.params.id);
  if (!memory) return res.status(404).json({ error: 'Memory not found.' });
  const { title, words, author, memoryDate, emoji } = req.body;
  if (typeof title === 'string' && title.trim()) memory.title = title.slice(0, 120);
  if (typeof words === 'string') memory.words = words.slice(0, 4000);
  if (typeof author === 'string') memory.author = author.slice(0, 60);
  if (typeof memoryDate === 'string') memory.memoryDate = memoryDate.slice(0, 20);
  if (typeof emoji === 'string' && emoji.trim()) memory.emoji = emoji.slice(0, 4);
  memory.updatedAt = new Date().toISOString();
  store.writeMemories(phone, memories);
  res.json({ ok: true, memory });
});

function deletePhotoFile(phone, filename) {
  const full = path.join(store.photosDir(phone), path.basename(filename));
  fs.rm(full, { force: true }, () => {});
}

router.delete('/memories/:id/photos/:filename', requireLogin, (req, res) => {
  const phone = req.session.phone;
  const memories = store.readMemories(phone);
  const memory = memories.find((m) => m.id === req.params.id);
  if (!memory) return res.status(404).json({ error: 'Memory not found.' });
  const filename = path.basename(req.params.filename);
  memory.photos = (memory.photos || []).filter((p) => p !== filename);
  store.writeMemories(phone, memories);
  deletePhotoFile(phone, filename);
  res.json({ ok: true, memory });
});

router.delete('/memories/:id', requireLogin, (req, res) => {
  const phone = req.session.phone;
  const memories = store.readMemories(phone);
  const memory = memories.find((m) => m.id === req.params.id);
  if (!memory) return res.status(404).json({ error: 'Memory not found.' });
  (memory.photos || []).forEach((p) => deletePhotoFile(phone, p));
  store.writeMemories(phone, memories.filter((m) => m.id !== req.params.id));
  res.json({ ok: true, profile: publicProfile(phone) });
});

module.exports = { router, requireLogin };
