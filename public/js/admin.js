/* Admin (backend) frontend — mobile-number login + memory manager. */
(() => {
  const $ = (id) => document.getElementById(id);
  let profile = null;
  let mode = 'login';

  /* ------------------------------- helpers ------------------------------- */
  function toast(msg, kind = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + kind;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = 'toast ' + kind), 2600);
  }
  async function api(url, options = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function applyHue(hue) {
    document.documentElement.style.setProperty('--hue', hue ?? 330);
  }
  function shareUrl() {
    return `${location.origin}/s/${profile.shareCode}`;
  }

  /* --------------------------- auth screen logic -------------------------- */
  $('tabLogin').onclick = () => setMode('login');
  $('tabRegister').onclick = () => setMode('register');
  function setMode(next) {
    mode = next;
    const reg = next === 'register';
    $('tabLogin').classList.toggle('active', !reg);
    $('tabRegister').classList.toggle('active', reg);
    $('authTitle').textContent = reg ? 'Create your account' : 'Log in';
    $('authSub').textContent = reg
      ? 'Choose the mobile number that will own this surprise folder.'
      : 'Enter the mobile number you registered. Every memory is stored separately under that number.';
    $('registerOnly').classList.toggle('hidden', !reg);
    $('authSubmit').textContent = reg ? 'Create account' : 'Log in';
    $('authErr').textContent = '';
  }

  $('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('authSubmit');
    const cc = $('country').value;
    const phone = ($('phone').value || '').replace(/\D/g, '');
    const payload = { phone: cc ? cc + phone : phone, password: $('password').value, displayName: $('displayName').value };
    if (phone.length < 6) return ($('authErr').textContent = 'Please enter a valid mobile number.');
    btn.disabled = true;
    const original = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Please wait…';
    try {
      const data = await api('/api/auth/' + (mode === 'register' ? 'register' : 'login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      profile = data.profile;
      toast(mode === 'register' ? 'Account created 🎉 Set your magic password next.' : 'Welcome back 💖', 'ok');
      openDash();
    } catch (err) {
      $('authErr').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  /* ------------------------------ dashboard ------------------------------ */
  function openDash() {
    $('authView').classList.add('hidden');
    $('dashView').classList.remove('hidden');
    applyHue(profile.themeHue);
    $('navRight').innerHTML = `<button class="btn ghost small" id="navLogout">Log out</button>`;
    $('navLogout').onclick = logout;
    $('whoPhone').textContent = '+' + profile.phone;
    $('folderPath').value = `data/users/${profile.phone}/`;
    $('celebrantName').value = profile.celebrantName || '';
    $('birthdayDate').value = profile.birthdayDate || '';
    $('introTitle').value = profile.introTitle || 'Happy Birthday!';
    $('introMessage').value = profile.introMessage || '';
    $('themeHue').value = profile.themeHue ?? 330;
    $('hueDot').style.background = `linear-gradient(135deg, hsl(${profile.themeHue ?? 330} 90% 68%), hsl(45 95% 70%))`;
    $('shareLink').value = shareUrl();
    $('openLink').href = '/s/' + profile.shareCode;
    renderStats();
    loadMemories();
  }

  function renderStats() {
    $('statMemories').textContent = profile.memoryCount ?? 0;
    $('statPhotos').textContent = profile.storage?.photos ?? 0;
    $('statSize').textContent = ((profile.storage?.bytes || 0) / 1048576).toFixed(1) + ' MB';
    $('memCountLine').textContent =
      (profile.memoryCount ?? 0) === 0
        ? 'Nothing yet — add your first memory on the left.'
        : `${profile.memoryCount} memory(ies) saved in folder ${profile.phone}.`;
  }

  async function loadMemories() {
    try {
      const { memories } = await api('/api/memories');
      renderMemories(memories);
    } catch {
      $('memList').innerHTML = '<div class="empty">Could not load memories.</div>';
    }
  }

  function renderMemories(memories) {
    const list = $('memList');
    if (!memories.length) {
      list.innerHTML = '<div class="empty">🕯️ No memories yet. The surprise page is waiting for its first story.</div>';
      return;
    }
    list.innerHTML = memories
      .map(
        (m) => `
      <div class="card mem-card" data-id="${m.id}">
        <div class="mem-head">
          <h3>${esc(m.emoji || '💖')} ${esc(m.title)}</h3>
          <div class="row-actions">
            <button class="btn ghost small" data-act="edit">Edit words</button>
            <button class="btn danger small" data-act="del">Delete</button>
          </div>
        </div>
        <div class="mem-words">${esc(m.words || '')}</div>
        <div class="mem-meta">${m.author ? '✍️ ' + esc(m.author) : '✍️ —'}${m.memoryDate ? ' · 📅 ' + esc(m.memoryDate) : ''} · 🖼 ${(m.photos || []).length} photo(s)</div>
        <div class="mem-photos">
          ${(m.photos || [])
            .map(
              (p) => `<figure><img src="/api/photos/${encodeURIComponent(p)}"
                        data-full="/api/photos/${encodeURIComponent(p)}" alt="" />
                        <button class="x" data-act="delphoto" data-photo="${esc(p)}" title="Remove photo">✕</button></figure>`
            )
            .join('')}
        </div>
      </div>`
      )
      .join('');

    list.querySelectorAll('.mem-photos img').forEach((img) => {
      img.onclick = () => {
        $('lightboxImg').src = img.dataset.full;
        $('lightbox').classList.remove('hidden');
      };
    });
    list.querySelectorAll('[data-act]').forEach((btn) => {
      btn.onclick = () => handleMemoryAction(btn);
    });
  }

  async function handleMemoryAction(btn) {
    const card = btn.closest('.mem-card');
    const id = card.dataset.id;
    const act = btn.dataset.act;
    try {
      if (act === 'del') {
        if (!confirm('Delete this memory and its photos?')) return;
        await api('/api/memories/' + id, { method: 'DELETE' });
        toast('Memory deleted', 'ok');
      } else if (act === 'delphoto') {
        await api(`/api/memories/${id}/photos/${encodeURIComponent(btn.dataset.photo)}`, { method: 'DELETE' });
        toast('Photo removed', 'ok');
      } else if (act === 'edit') {
        const current = card.querySelector('.mem-words').textContent;
        const next = prompt('Edit the words for this memory:', current);
        if (next === null) return;
        await api('/api/memories/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: next }),
        });
        toast('Words updated', 'ok');
      }
      const { profile: fresh } = await api('/api/me');
      profile = fresh;
      renderStats();
      loadMemories();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  $('lightbox').onclick = () => $('lightbox').classList.add('hidden');

  /* ------------------------------- add memory ---------------------------- */
  $('mPhotos').addEventListener('change', () => {
    const strip = $('previewStrip');
    strip.innerHTML = '';
    [...$('mPhotos').files].slice(0, 20).forEach((file) => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      strip.appendChild(img);
    });
  });

  $('memoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('memSubmit');
    const fd = new FormData();
    fd.append('title', $('mTitle').value);
    fd.append('words', $('mWords').value);
    fd.append('author', $('mAuthor').value);
    fd.append('memoryDate', $('mDate').value);
    fd.append('emoji', $('mEmoji').value || '💖');
    [...$('mPhotos').files].slice(0, 20).forEach((f) => fd.append('photos', f));

    btn.disabled = true;
    const original = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Uploading…';
    $('memErr').textContent = '';
    try {
      const data = await api('/api/memories', { method: 'POST', body: fd });
      profile = data.profile;
      $('memoryForm').reset();
      $('mEmoji').value = '💖';
      $('previewStrip').innerHTML = '';
      renderStats();
      loadMemories();
      toast('Memory saved 💖', 'ok');
    } catch (err) {
      $('memErr').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  /* -------------------------------- settings ----------------------------- */
  $('magicPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('saveMagic').click(); }
  });
  $('saveMagic').onclick = async () => {
    const value = $('magicPassword').value;
    if (!value) return toast('Type the magic word first', 'err');
    try {
      const { profile: fresh } = await api('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magicPassword: value }),
      });
      profile = fresh;
      $('magicPassword').value = '';
      toast('Magic password saved 🔮', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  $('saveDetails').onclick = async () => {
    try {
      const { profile: fresh } = await api('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          celebrantName: $('celebrantName').value,
          birthdayDate: $('birthdayDate').value,
          introTitle: $('introTitle').value,
          introMessage: $('introMessage').value,
          themeHue: Number($('themeHue').value),
        }),
      });
      profile = fresh;
      applyHue(profile.themeHue);
      $('shareLink').value = shareUrl();
      toast('Details saved ✨', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  $('themeHue').addEventListener('input', (e) => {
    applyHue(e.target.value);
    $('hueDot').style.background = `linear-gradient(135deg, hsl(${e.target.value} 90% 68%), hsl(45 95% 70%))`;
  });

  $('copyLink').onclick = async () => {
    const link = shareUrl();
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied — now share the magic word separately 🔐', 'ok');
    } catch {
      $('shareLink').select();
      toast('Press Ctrl/Cmd + C to copy');
    }
  };

  $('resetLink').onclick = async () => {
    if (!confirm('Create a new secret link? The old link will stop working.')) return;
    const { profile: fresh } = await api('/api/share-code/reset', { method: 'POST' });
    profile = fresh;
    $('shareLink').value = shareUrl();
    $('openLink').href = '/s/' + profile.shareCode;
    loadMemories();
    toast('New secret link ready 🔗', 'ok');
  };

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  }
  $('logoutBtn').onclick = logout;

  /* --------------------------------- boot -------------------------------- */
  (async () => {
    try {
      const { profile: me } = await api('/api/me');
      profile = me;
      openDash();
    } catch {
      setMode('login');
    }
  })();
})();
