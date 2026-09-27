/* Surprise frontend — magic password gate, then the memory reveal. */
(() => {
  const $ = (id) => document.getElementById(id);
  const shareCode = location.pathname.split('/').filter(Boolean).pop();

  function toast(msg, kind = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + kind;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = 'toast ' + kind), 2600);
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(url, options = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }

  /* ------------------------------ confetti ------------------------------- */
  const canvas = $('confetti');
  const ctx = canvas.getContext('2d');
  let pieces = [];
  let raf = null;
  function sizeCanvas() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  sizeCanvas();
  addEventListener('resize', sizeCanvas);

  function burst(count = 140) {
    const hue = getComputedStyle(document.documentElement).getPropertyValue('--hue') || '330';
    const colors = [`hsl(${hue.trim()} 90% 68%)`, 'hsl(45 95% 70%)', 'hsl(320 100% 85%)', 'hsl(190 90% 72%)', 'hsl(150 80% 70%)'];
    for (let i = 0; i < count; i += 1) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.4,
        r: 4 + Math.random() * 7,
        c: colors[(Math.random() * colors.length) | 0],
        vy: 1.2 + Math.random() * 2.6,
        vx: -1.2 + Math.random() * 2.4,
        rot: Math.random() * Math.PI,
        vr: -0.12 + Math.random() * 0.24,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }
    if (!raf) loop();
  }
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      if (p.shape === 'rect') ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.7);
      else { ctx.beginPath(); ctx.arc(0, 0, p.r / 1.7, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
    pieces = pieces.filter((p) => p.y < canvas.height + 40);
    if (pieces.length) raf = requestAnimationFrame(loop);
    else { raf = null; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  function floatHearts(n = 8) {
    for (let i = 0; i < n; i += 1) {
      const h = document.createElement('div');
      h.className = 'float-heart';
      h.textContent = ['💖', '🎈', '✨', '🎉', '💝'][(Math.random() * 5) | 0];
      h.style.left = 6 + Math.random() * 88 + 'vw';
      h.style.animationDuration = 4 + Math.random() * 4 + 's';
      h.style.fontSize = 1 + Math.random() * 1.6 + 'rem';
      document.body.appendChild(h);
      setTimeout(() => h.remove(), 9000);
    }
  }

  /* --------------------- happy-birthday tune (WebAudio) ------------------- */
  function playTune() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const audio = new AC();
      audio.resume();
      // Public-domain "Happy Birthday to You" melody, in G.
      const notes = [
        ['D4', 0.40], ['D4', 0.20], ['E4', 0.60], ['D4', 0.60], ['G4', 0.60], ['F#4', 1.10],
        ['D4', 0.40], ['D4', 0.20], ['E4', 0.60], ['D4', 0.60], ['A4', 0.60], ['G4', 1.10],
        ['D4', 0.40], ['D4', 0.20], ['D5', 0.60], ['B4', 0.60], ['G4', 0.60], ['F#4', 0.60], ['E4', 1.10],
        ['C5', 0.40], ['C5', 0.20], ['B4', 0.60], ['G4', 0.60], ['A4', 0.60], ['G4', 1.20],
      ];
      const freq = { D4: 293.66, E4: 329.63, 'F#4': 369.99, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33 };
      const master = audio.createGain();
      master.gain.value = 0.16;
      master.connect(audio.destination);
      let t = audio.currentTime + 0.15;
      notes.forEach(([n, d]) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq[n];
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.9, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.92);
        osc.connect(gain); gain.connect(master);
        osc.start(t); osc.stop(t + d);
        t += d;
      });
      setTimeout(() => audio.close(), (t - audio.currentTime + 1) * 1000);
    } catch { /* audio is a bonus, never a blocker */ }
  }

  /* ------------------------------ reveal UI ------------------------------ */
  function typeLine(text) {
    const el = $('typedLine');
    el.textContent = '';
    let i = 0;
    clearInterval(typeLine._t);
    typeLine._t = setInterval(() => {
      el.textContent = text.slice(0, i += 1);
      if (i >= text.length) clearInterval(typeLine._t);
    }, 45);
  }

  function render(data) {
    document.documentElement.style.setProperty('--hue', data.themeHue ?? 330);
    document.title = `Happy Birthday${data.celebrantName ? ', ' + data.celebrantName : ''}! 🎂`;

    const name = data.celebrantName || 'you';
    $('heroName').textContent = name;
    $('finaleName').textContent = name;
    $('heroNote').textContent = data.introMessage || '';
    $('cMem').textContent = data.memories.length;
    $('cPhoto').textContent = data.memories.reduce((n, m) => n + (m.photos || []).length, 0);

    if (data.birthdayDate) {
      const d = new Date(data.birthdayDate + 'T00:00:00');
      if (!Number.isNaN(d.getTime())) {
        const today = new Date();
        const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate());
        const diff = Math.round((thisYear - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
        $('cDay').textContent = diff === 0 ? 'today! 🎉' : diff > 0 ? `in ${diff} day(s)` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      }
    }

    const intro = data.introTitle && data.introTitle !== 'Happy Birthday!' ? `${data.introTitle}` : `Happy birthday ${name}! 🎉`;
    typeLine(intro + (data.introMessage ? ' Scroll down…' : ''));

    const timeline = $('timeline');
    timeline.innerHTML = data.memories.length
      ? data.memories
          .map(
            (m) => `
        <article class="card memory">
          <div class="when">${esc(m.memoryDate || m.createdAt?.slice(0, 10) || '')}</div>
          <h2>${esc(m.emoji || '💖')} ${esc(m.title)}</h2>
          <div class="words">${esc(m.words || '')}</div>
          ${m.author ? `<div class="sign">— ${esc(m.author)}</div>` : ''}
          ${
            (m.photos || []).length
              ? `<div class="album">${m.photos.map((p) => `<img src="${esc(p)}" data-full="${esc(p)}" loading="lazy" alt="memory photo" />`).join('')}</div>`
              : ''
          }
        </article>`
          )
          .join('')
      : '<div class="card" style="text-align:center">No memories added yet — but the wish still stands 💐</div>';

    timeline.querySelectorAll('.album img').forEach((img) => {
      img.onclick = () => { $('lightboxImg').src = img.dataset.full; $('lightbox').classList.remove('hidden'); };
    });

    // Reveal cards as they scroll into view.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = [...timeline.children].indexOf(e.target);
            setTimeout(() => e.target.classList.add('in'), Math.min(i, 6) * 90);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    [...timeline.children].forEach((c) => io.observe(c));

    $('lockStage').style.display = 'none';
    $('surpriseView').classList.add('on');
    burst(190);
    floatHearts(10);
    playTune();
  }

  /* ------------------------------ unlocking ------------------------------ */
  $('unlockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('unlockBtn');
    const value = $('magic').value;
    if (!value) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Opening…';
    $('lockErr').textContent = '';
    try {
      const data = await api(`/api/public/site/${encodeURIComponent(shareCode)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value }),
      });
      render(data);
    } catch (err) {
      $('lockErr').textContent = err.message;
      $('lockCard').classList.add('shake');
      setTimeout(() => $('lockCard').classList.remove('shake'), 500);
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  $('lightbox').onclick = () => $('lightbox').classList.add('hidden');
  $('heartBtn').onclick = () => { burst(120); floatHearts(10); toast('Love sent back 💖', 'ok'); };

  /* ------------------------------ boot: locked or already open ----------- */
  (async () => {
    if (!shareCode) return;
    try {
      const info = await api(`/api/public/site/${encodeURIComponent(shareCode)}`);
      document.documentElement.style.setProperty('--hue', info.themeHue ?? 330);
      if (info.unlocked) {
        // Already unlocked in this browser (or no magic password set) → show it.
        const { memories } = await api(`/api/public/site/${encodeURIComponent(shareCode)}/memories`);
        render({ ...info, memories });
        return;
      }
      if (info.magicPasswordSet) {
        $('lockLine').textContent = `Hmm… someone left ${info.memoryCount} memor${info.memoryCount === 1 ? 'y' : 'ies'} and ${info.photoCount} photo(s) in here for you. Type the magic word to open them.`;
      }
    } catch (err) {
      $('lockLine').textContent = err.message;
      $('unlockForm').style.display = 'none';
    }
  })();
})();
