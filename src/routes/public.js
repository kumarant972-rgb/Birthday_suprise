/**
 * routes/public.js — the surprise page side.
 * The visitor opens /s/<shareCode>, and must type the MAGIC PASSWORD before
 * any memory, name or photo leaves the server.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('../store');
const auth = require('../auth');

const router = express.Router();

/** Unlock tokens live in memory only: token -> { phone, expires }. */
const unlockTokens = new Map();

function issueUnlock(phone) {
  const token = auth.id() + auth.id();
  unlockTokens.set(token, { phone, expires: Date.now() + 1000 * 60 * 60 * 6 });
  return token;
}

function unlockedPhone(req) {
  const token = req.cookies.bday_unlock;
  if (!token) return null;
  const entry = unlockTokens.get(token);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    unlockTokens.delete(token);
    return null;
  }
  return entry.phone;
}

/** Public metadata — deliberately contains NO memories/names before unlock. */
router.get('/site/:shareCode', (req, res) => {
  const found = store.findByShareCode(req.params.shareCode);
  if (!found) return res.status(404).json({ error: 'This surprise link does not exist.' });
  const { profile } = found;
  const unlocked = unlockedPhone(req) === found.phone;
  res.json({
    shareCode: profile.shareCode,
    unlocked: unlocked || !profile.magicPasswordHash,
    themeHue: profile.themeHue ?? 330,
    memoryCount: store.readMemories(found.phone).length,
    photoCount: store.storageSummary(found.phone).photos,
    magicPasswordSet: Boolean(profile.magicPasswordHash),
    celebrantName: unlocked ? profile.celebrantName || '' : '',
    birthdayDate: unlocked ? profile.birthdayDate || '' : '',
    introTitle: unlocked ? profile.introTitle || '' : '',
    introMessage: unlocked ? profile.introMessage || '' : '',
  });
});

/** Magic password check. */
router.post('/site/:shareCode/unlock', (req, res) => {
  const found = store.findByShareCode(req.params.shareCode);
  if (!found) return res.status(404).json({ error: 'This surprise link does not exist.' });
  const { profile, phone } = found;

  const key = `unlock:${phone}`;
  if (auth.tooManyAttempts(key, 10)) {
    return res.status(429).json({ error: 'Too many wrong tries. Please wait a little while. 💫' });
  }

  const guess = String(req.body.password || '').trim().toLowerCase();
  // If the owner never set a magic password, the link is open by design.
  const ok = !profile.magicPasswordHash || auth.verifySecret(guess, profile.magicPasswordHash);
  if (!ok) {
    auth.noteFailedAttempt(key);
    return res.status(401).json({ error: 'That is not the magic word. Try again 💫' });
  }
  auth.clearAttempts(key);

  const token = issueUnlock(phone);
  res.cookie('bday_unlock', token, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 6 });
  res.json({
    ok: true,
    celebrantName: profile.celebrantName || '',
    birthdayDate: profile.birthdayDate || '',
    introTitle: profile.introTitle || 'Happy Birthday!',
    introMessage: profile.introMessage || '',
    memories: store.readMemories(phone).map((m) => ({
      ...m,
      photos: (m.photos || []).map((p) => `/api/public/site/${profile.shareCode}/photo/${encodeURIComponent(p)}`),
    })),
  });
});

/** Memories (requires an unlock cookie). */
router.get('/site/:shareCode/memories', (req, res) => {
  const found = store.findByShareCode(req.params.shareCode);
  if (!found) return res.status(404).json({ error: 'This surprise link does not exist.' });
  // An account with no magic password has an intentionally open link.
  if (found.profile.magicPasswordHash && unlockedPhone(req) !== found.phone) return res.status(401).json({ error: 'Locked' });
  res.json({
    memories: store.readMemories(found.phone).map((m) => ({
      ...m,
      photos: (m.photos || []).map((p) => `/api/public/site/${found.profile.shareCode}/photo/${encodeURIComponent(p)}`),
    })),
  });
});

/** Photos are only streamed to someone holding an unlock cookie. */
router.get('/site/:shareCode/photo/:filename', (req, res) => {
  const found = store.findByShareCode(req.params.shareCode);
  if (!found) return res.status(404).end();
  if (found.profile.magicPasswordHash && unlockedPhone(req) !== found.phone) return res.status(401).json({ error: 'Locked' });
  const file = path.join(store.photosDir(found.phone), path.basename(req.params.filename));
  if (!fs.existsSync(file)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(file);
});

module.exports = { router };
