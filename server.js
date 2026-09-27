/**
 * Birthday Surprise — server
 *
 *   Backend (owner) : /admin.html  → log in with MOBILE NUMBER + password,
 *                     add memories (photos + words), set the magic password.
 *   Frontend (guest): /s/<shareCode> → magic-password gate, then the surprise.
 *
 * Storage: data/users/<phone number>/  (profile.json, memories.json, photos/)
 */
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const { router: apiRouter } = require('./src/routes/api');
const { router: publicRouter } = require('./src/routes/public');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API + uploaded photos must never be cached by a shared proxy.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/api', apiRouter);
app.use('/api/public', publicRouter);

// Pretty surprise links:  /s/<shareCode>
app.get('/s/:shareCode', (req, res) => res.sendFile(path.join(__dirname, 'public', 'surprise.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  return res.redirect('/');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Each photo must be under 12 MB.'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'You can upload up to 20 photos at once.'
          : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err) return res.status(400).json({ error: err.message || 'Something went wrong.' });
  return res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, HOST, () => {
  console.log(`🎂 Birthday Surprise running on http://${HOST}:${PORT}`);
});
