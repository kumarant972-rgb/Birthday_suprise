# 🎂 Birthday Surprise — full-stack website

A birthday surprise site where you (the **backend** user) log in with a **mobile number**, upload
their **photos + words**, set a **magic password**, and send one secret link. The birthday person
(**frontend**) opens the link, types the magic password, and the whole surprise unfolds — confetti,
a typed welcome line, a song, and a scrollable timeline of memories.

```
birthday-surprise/
├── server.js                  # Express app: mounts API + serves both frontends
├── package.json
├── src/
│   ├── store.js               # per-mobile-number storage layer (folders per phone)
│   ├── auth.js                # scrypt hashing, share codes, rate limiting
│   └── routes/
│       ├── api.js             # BACKEND API — mobile number login, memories, uploads
│       └── public.js          # FRONTEND API — magic-password gate, gated photos
├── public/                    # FRONTEND
│   ├── index.html             # landing page → "Create a surprise"
│   ├── admin.html             # backend dashboard (login + memory manager)
│   ├── surprise.html          # the magic-password surprise page
│   ├── css/style.css
│   └── js/admin.js, js/surprise.js
├── sample-photos/             # two demo photos used by the seeded demo memories
└── data/                      # ⚠️ ALL user content (auto-created)
    ├── sessions.json
    └── users/
        └── 919876543210/      # ← one folder per mobile number
            ├── profile.json   # account + surprise settings (hashed passwords)
            ├── memories.json  # titles, words, authors, dates, photo file names
            └── photos/        # only this phone number's photos
```

---

## 1. Run it

```bash
cd birthday-surprise
npm install          # express, multer, cookie-parser
npm start            # → http://localhost:3000
```

Optional env vars:

```bash
PORT=8080 HOST=0.0.0.0 npm start
```

### Pages

| URL | Who | What |
|---|---|---|
| `/` | anyone | landing / explainer |
| `/admin` | **you** | backend: login with mobile number, add memories, set magic password |
| `/s/<shareCode>` | the birthday person | frontend: magic-password gate → the surprise |

### Demo account (already seeded, delete `data/` to start fresh)

```
Backend : http://localhost:3000/admin
Mobile  : 9876543210   (country code +91 → stored as 919876543210)
Password: secret123
Magic   : firstkiss
Link    : http://localhost:3000/s/76ba363gezg2
```

---

## 2. How the flow works

**Backend (you)**

1. Open `/admin` → **Create account** with your mobile number + password
   (10–15 digits, digits only — this number names your private storage folder).
2. Add a memory: title, *their words / your words*, author, date, sticker, up to 20 photos (12 MB each).
3. Set the **magic password** (e.g. `firstkiss`, `07-09-mom`) and the surprise details
   (their name, birthday date, headline, opening note, theme colour).
4. Copy the secret link `/s/xxxxx` and send it — the magic word goes in a **separate** message.

**Frontend (them)**

1. Opens the link → sees only: "a surprise is waiting", the count of memories/photos, and a password box.
   No name, no photo, no memory is sent by the server before the magic word is correct.
2. Types the magic password → confetti bursts, "Happy Birthday" is typed out letter by letter,
   a short Happy-Birthday tune plays, floating hearts rise up.
3. Scrolls through the memory timeline: each card animates in, photos open in a lightbox at full size.

---

## 3. Storage — memories are separated by mobile number

Every account gets its own folder, `data/users/<mobile number>/`. Two different phone numbers can
never read each other's data: the server always resolves the folder from the **logged-in session**,
never from anything the browser sends.

* `profile.json` — password hash (scrypt), magic-password hash, share code, name, date, theme, intro text
* `memories.json` — array of memories: `{ id, title, words, author, memoryDate, emoji, photos[] }`
* `photos/` — the actual image files of that number only

Uploaded files are written straight into `data/users/<phone>/photos/`, and photos are **only streamed
back** to (a) the logged-in owner, or (b) a visitor holding the unlock cookie for that exact share code.

Backup = copy the whole `data/` folder. To delete everything for one person, delete their folder.

> If you meant *"store it in the phone's own storage"* (offline/browser storage on the visitor's
> device) instead of a server folder, say so — that variant keeps memories in
> `localStorage`/IndexedDB + the Web Share API and needs no server at all.

---

## 4. API reference

### Backend (session cookie `bday_session`, HttpOnly)

| Method | Endpoint | Body | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | `phone, password, displayName?` | create account, auto-login |
| POST | `/api/auth/login` | `phone, password` | log in by mobile number |
| POST | `/api/auth/logout` | — | end session |
| GET | `/api/me` | — | profile, memory count, photo count, storage used |
| PUT | `/api/settings` | `celebrantName, birthdayDate, introTitle, introMessage, themeHue, magicPassword?` | surprise details + magic password |
| POST | `/api/share-code/reset` | — | invalidate the old link, issue a new one |
| GET | `/api/memories` | — | list memories of your number |
| POST | `/api/memories` | multipart: `title, words, author, memoryDate, emoji, photos[]` | add a memory |
| PUT | `/api/memories/:id` | `title?, words?, author?, memoryDate?, emoji?` | edit a memory |
| DELETE | `/api/memories/:id/photos/:filename` | — | remove one photo |
| DELETE | `/api/memories/:id` | — | delete memory + its photos |
| GET | `/api/photos/:filename` | — | owner-only photo stream (dashboard thumbnails) |

### Frontend (public, no login)

| Method | Endpoint | Body | Purpose |
|---|---|---|---|
| GET | `/api/public/site/:shareCode` | — | theme + counts; celebrant details only if already unlocked |
| POST | `/api/public/site/:shareCode/unlock` | `password` | verify magic password → unlock cookie + memories |
| GET | `/api/public/site/:shareCode/memories` | — | memories (requires unlock cookie) |
| GET | `/api/public/site/:shareCode/photo/:filename` | — | photo (requires unlock cookie) |

Example:

```bash
curl -c jar.txt -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"919876543210","password":"secret123"}'

curl -b jar.txt -X POST localhost:3000/api/memories \
  -F 'title=First rain' -F 'words=You laughed so loud.' -F 'photos=@pic.jpg'
```

---

## 5. Security notes

* Passwords and magic passwords are hashed with **scrypt** + per-account salt; nothing is stored in plain text.
* Sessions and unlock tokens live in **HttpOnly, SameSite=Lax cookies** (12 h / 6 h), not in the URL.
* The public endpoint is **locked by default**: before the magic word, it returns only the theme colour
  and counts — no name, no words, no photos.
* Photos are never on a public static path; both owner and guest copies go through checked endpoints.
* Brute force is throttled (login: 8 tries / 10 min; magic word: 10 tries / 10 min).
* Share codes are 12 random characters from a 31-symbol alphabet (≈ 59 bits) and can be rotated anytime.
* Behind a proxy/CDN, serve over **HTTPS** so the cookies are marked Secure (add
  `secure: true` + `app.set('trust proxy', 1)` in `server.js` if you deploy publicly).
* Uploads are restricted to JPG/PNG/WEBP/GIF/AVIF, max 12 MB each, max 20 per memory.

## 6. Customising

* Theme colour: the slider in the dashboard writes `themeHue`; the frontend re-themes itself live.
* The birthday tune is synthesised with the Web Audio API in `public/js/surprise.js` (`playTune()`),
  so there is no mp3 file to host. Replace the note array to change the melody.
* Confetti / hearts: `burst()` and `floatHearts()` in the same file.
* Add a "video message" feature? Drop the file in the same memory payload — `api.js` is the only place
  that needs a new field.

## 7. Next steps worth doing

1. Deploy (Render / Railway / Fly.io / a VPS) and put it behind HTTPS.
2. Send the link by SMS/WhatsApp and the magic word by a different channel.
3. Auto-open on the birthday date (a cron that flips a `revealAt` timestamp).
4. Optional: video/voice notes, a guest-book where friends add memories from their own phones
   (each with its own mini magic word), and a "download the whole album" button.
