/**
 * Zenki Dojo web admin — application module.
 *
 * Split out of index.html so Firebase Hosting can serve a strict CSP
 * (script-src 'self' + gstatic; no inline script). All user-generated
 * strings reach the DOM via textContent (the el() helper) — never innerHTML.
 * The /admins/{uid} gate here is UX only; every mutation is enforced
 * server-side by the live firestore.rules and the deployed Cloud Functions.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, query, where, orderBy, limit, startAfter,
  getDocs, getCountFromServer, doc, getDoc, setDoc, deleteDoc, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Public web config (safe to expose — security is enforced by Firestore rules).
const firebaseConfig = {
  apiKey: 'AIzaSyALHuiCPe3wjcKYeqrx90DHcT6bu-Wn_Fo',
  authDomain: 'zenki-dojo.firebaseapp.com',
  projectId: 'zenki-dojo',
  storageBucket: 'zenki-dojo.firebasestorage.app',
  messagingSenderId: '277160279219',
  appId: '1:277160279219:web:4b04763265c86d17a484c6',
};
const FN_BASE = 'https://us-central1-zenki-dojo.cloudfunctions.net';
const BELTS = ['none', 'white', 'blue', 'purple', 'brown', 'black'];
const REPORT_REASON_LABELS = {
  spam: 'Spam', harassment: 'Harassment or bullying', hate: 'Hate speech',
  nudity: 'Nudity or sexual content', violence: 'Violence', self_harm: 'Self-harm',
  misinformation: 'Misinformation', inappropriate: 'Inappropriate content', other: 'Other',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const loginView = $('login'), appView = $('app'), content = $('content');

// ── Render-generation guard (F1) ─────────────────────────────────────────
// Every async renderer takes a generation ticket at entry and re-checks it
// after each await. A stale renderer (user switched tabs / refreshed) must
// never replaceChildren over the active pane — that clobbered typed drafts.
let renderGen = 0;

// ── DOM helpers — textContent only, no innerHTML on user data ────────────
const DANGEROUS_ATTRS = new Set(['href', 'src', 'srcdoc', 'action', 'formaction', 'style']);
function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'onclick') n.addEventListener('click', v);
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = !!v;
    else if (k.startsWith('on') || DANGEROUS_ATTRS.has(k)) {
      // Hardening: no event-handler or URL-bearing attributes via props —
      // images go through safeImg, handlers through the onclick branch.
      console.warn('[el] blocked attribute', k);
    } else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) n.appendChild(c);
  return n;
}
function stateBox(big, small) { return el('div', { class: 'state' }, [el('div', { class: 'big', text: big }), el('div', { text: small || '' })]); }
function spinnerBox() { return el('div', { class: 'state' }, [el('span', { class: 'spinner' })]); }
function fmtDate(v) {
  if (!v) return '';
  const d = new Date(typeof v === 'object' && v.seconds ? v.seconds * 1000 : v);
  return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
// Millis for client-side sorting across mixed ISO-string / Timestamp createdAt.
function toMs(v) {
  if (!v) return 0;
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}
// Image sources are pinned to known-good hosts (post media / avatars) so a
// crafted mediaUrl can't beacon the admin's IP to an arbitrary server.
const IMG_HOSTS = new Set(['firebasestorage.googleapis.com', 'lh3.googleusercontent.com']);
function safeImg(url, fallback = '👤') {
  const wrap = el('div', { class: 'thumb' });
  let ok = false;
  try {
    const u = new URL(String(url));
    ok = u.protocol === 'https:' && (IMG_HOSTS.has(u.hostname) || u.hostname.endsWith('.firebasestorage.app'));
  } catch { ok = false; }
  if (ok) {
    const img = document.createElement('img');
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => { wrap.textContent = '🖼'; };
    img.src = String(url);
    wrap.appendChild(img);
  } else { wrap.textContent = fallback; }
  return wrap;
}
// For interpolating user names into confirm()/alert() text.
const safeName = (s) => String(s || 'Member').replace(/\s+/g, ' ').slice(0, 40);
const rid = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = () => new Date().toISOString();

// ── Auth ──────────────────────────────────────────────────────────────────
function setLoginMsg(t, err) { const m = $('loginMsg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }
function authErr(e) {
  const c = (e && e.code) || '';
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return 'Sign-in cancelled.';
  if (c.includes('wrong-password') || c.includes('invalid-credential') || c.includes('user-not-found')) return 'Wrong email or password.';
  return (e && e.message) || 'Sign-in failed.';
}
$('googleBtn').addEventListener('click', async () => {
  setLoginMsg('');
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) {
    // Popup blocked (common with strict browsers) → full-page redirect flow.
    if ((e && e.code || '').includes('popup-blocked')) {
      try { await signInWithRedirect(auth, new GoogleAuthProvider()); return; } catch (e2) { setLoginMsg(authErr(e2), true); return; }
    }
    setLoginMsg(authErr(e), true);
  }
});
$('emailForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  setLoginMsg('');
  const email = $('email').value.trim(), pw = $('password').value;
  if (!email || !pw) { setLoginMsg('Enter email and password.', true); return; }
  try { await signInWithEmailAndPassword(auth, email, pw); }
  catch (e) { setLoginMsg(authErr(e), true); }
});
$('signOutBtn').addEventListener('click', () => signOut(auth));
// Complete a redirect-based Google sign-in if one is in flight.
getRedirectResult(auth).catch((e) => setLoginMsg(authErr(e), true));

onAuthStateChanged(auth, async (user) => {
  if (!user) { appView.classList.add('hidden'); loginView.classList.remove('hidden'); return; }
  let adminSnap;
  try { adminSnap = await getDoc(doc(db, 'admins', user.uid)); }
  catch (e) {
    // A transient read/network error must NOT masquerade as "not an admin"
    // and sign a legitimate admin out — leave the session so a reload retries.
    setLoginMsg('Could not verify admin access — check your connection and reload.', true);
    return;
  }
  if (!adminSnap.exists()) { setLoginMsg('That account is not an admin.', true); await signOut(auth); return; }
  $('who').textContent = user.email || user.uid;
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  renderTab(currentTab);
});

// ── Tabs ──────────────────────────────────────────────────────────────────
let currentTab = 'posts';
document.querySelectorAll('nav.tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('nav.tabs button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    currentTab = b.dataset.tab;
    renderTab(currentTab);
  });
});
function renderTab(tab) {
  if (tab === 'posts') return renderPosts();
  if (tab === 'reports') return renderReports();
  if (tab === 'members') return renderMembers();
  if (tab === 'announcements') return renderAnnouncements();
  if (tab === 'broadcast') return renderBroadcast();
  if (tab === 'support') return renderSupport();
}

// ── Cloud Function call (Bearer ID token; only ever to FN_BASE) ──────────
async function callFn(name, body) {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'not-signed-in' };
  try {
    const token = await user.getIdToken();
    const res = await fetch(`${FN_BASE}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `http-${res.status}` };
    return { ok: true, data };
  } catch (e) { return { ok: false, error: (e && e.message) || 'network-error' }; }
}

// ── Community ─────────────────────────────────────────────────────────────
const POSTS_PAGE = 200;
async function renderPosts() {
  const gen = ++renderGen;
  content.replaceChildren(spinnerBox());
  let posts = [], lastSnap = null, hasMore = false;
  try {
    const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(POSTS_PAGE)));
    posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    lastSnap = snap.docs[snap.docs.length - 1] || null;
    hasMore = snap.size === POSTS_PAGE;
  } catch (e) {
    if (gen !== renderGen) return;
    content.replaceChildren(stateBox('Could not load posts', (e && e.message) || String(e)));
    return;
  }
  if (gen !== renderGen) return;

  let deleted = 0, filter = '';
  const label = el('div', { class: 'section-label grow' });
  const list = el('div');
  const moreBtn = el('button', { class: 'refresh', text: 'Load more' });
  const moreWrap = el('div', { class: 'state' }, [moreBtn]);

  const matches = (p) => !filter || `${p.displayName || ''} ${p.caption || ''}`.toLowerCase().includes(filter);
  const redraw = () => {
    const visible = posts.filter(matches);
    label.textContent = `${visible.length} of ${posts.length} loaded post${posts.length === 1 ? '' : 's'}${hasMore ? ' · more available' : ''}${deleted ? ` · ${deleted} deleted` : ''}`;
    list.replaceChildren(...(visible.length ? visible.map((p) => postRow(p, onDeleted)) : [stateBox(filter ? 'No matching posts' : 'No posts', filter ? 'Try a different search.' : 'The community feed is empty.')]));
    moreWrap.classList.toggle('hidden', !hasMore);
  };
  const onDeleted = (p) => { posts = posts.filter((x) => x.id !== p.id); deleted += 1; redraw(); };

  const search = el('input', { class: 'search', placeholder: 'Search author or caption…' });
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); redraw(); });
  moreBtn.addEventListener('click', async () => {
    if (!lastSnap) return;
    moreBtn.disabled = true; moreBtn.textContent = 'Loading…';
    try {
      const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(lastSnap), limit(POSTS_PAGE)));
      posts = posts.concat(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      lastSnap = snap.docs[snap.docs.length - 1] || lastSnap;
      hasMore = snap.size === POSTS_PAGE;
    } catch (e) { alert('Load more failed: ' + ((e && e.message) || 'unknown')); }
    moreBtn.disabled = false; moreBtn.textContent = 'Load more';
    if (gen !== renderGen) return;
    redraw();
  });

  content.replaceChildren(el('div', {}, [
    el('div', { class: 'toolbar' }, [label, search, el('button', { class: 'refresh', text: 'Refresh', onclick: renderPosts })]),
    list,
    moreWrap,
  ]));
  redraw();
}
function postRow(p, onDeleted) {
  const row = el('div', { class: 'row' });
  row.appendChild(safeImg(p.mediaType === 'photo' ? p.mediaUrl : null, p.mediaType === 'video' ? '🎬' : '📝'));
  const caption = (p.caption || '').trim();
  const kind = p.mediaType === 'video' ? 'Video post' : p.mediaType === 'photo' ? 'Photo post' : 'Text post';
  row.appendChild(el('div', { class: 'body' }, [
    el('div', { class: 'name', text: p.displayName || 'Member' }),
    el('div', { class: 'meta', text: caption || kind }),
    el('div', { class: 'date', text: fmtDate(p.createdAt) }),
  ]));
  const delBtn = el('button', { class: 'btn danger', text: 'Delete' });
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Delete this post by ${safeName(p.displayName)}? Removes the post, its comments, likes, and any media. This cannot be undone.`)) return;
    delBtn.disabled = true; delBtn.textContent = 'Deleting…';
    const res = await callFn('deletePostCascade', { postId: p.id });
    if (res.ok) { row.remove(); if (onDeleted) onDeleted(p); }
    else { delBtn.disabled = false; delBtn.textContent = 'Delete'; alert('Delete failed: ' + (res.error || 'unknown')); }
  });
  row.appendChild(delBtn);
  return row;
}

// ── Reports (actionable) ──────────────────────────────────────────────────
async function renderReports() {
  const gen = ++renderGen;
  content.replaceChildren(spinnerBox());
  let reports = [];
  try {
    const snap = await getDocs(query(collection(db, 'reports'), where('status', '==', 'open'), orderBy('createdAt', 'desc')));
    reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    if (gen !== renderGen) return;
    content.replaceChildren(stateBox('Could not load reports', (e && e.message) || String(e)));
    return;
  }
  if (gen !== renderGen) return;

  let open = reports.length;
  const label = el('div', { class: 'section-label grow', text: `${open} OPEN REPORT${open === 1 ? '' : 'S'}` });
  const onResolved = () => { open = Math.max(0, open - 1); label.textContent = `${open} OPEN REPORT${open === 1 ? '' : 'S'}`; };
  const frame = el('div', {}, [el('div', { class: 'toolbar' }, [label, el('button', { class: 'refresh', text: 'Refresh', onclick: renderReports })])]);
  if (reports.length === 0) frame.appendChild(stateBox('All clear', 'No open reports.'));
  for (const r of reports) frame.appendChild(reportRow(r, gen, onResolved));
  content.replaceChildren(frame);
}

function reportRow(r, gen, onResolved) {
  const row = el('div', { class: 'row stack' });
  const adminUid = auth.currentUser ? auth.currentUser.uid : '';
  const reasonLabel = REPORT_REASON_LABELS[r.reason] || String(r.reason || 'reported');

  const title = el('div', { class: 'name' });
  title.appendChild(document.createTextNode(String(r.targetType || 'item') + ' report'));
  title.appendChild(el('span', { class: 'badge red', text: reasonLabel }));

  const body = el('div', { class: 'body' }, [
    title,
    el('div', { class: 'meta', text: (r.context && String(r.context).trim()) || 'No extra detail from the reporter.' }),
    el('div', { class: 'date', text: `Reported ${fmtDate(r.createdAt)} · offender ${String(r.targetUserId || '?').slice(0, 12)}… · reporter ${String(r.reporterId || '?').slice(0, 12)}…` }),
  ]);

  // Async content preview for post/comment targets (admin read is rule-permitted).
  if ((r.targetType === 'post' || r.targetType === 'comment') && r.targetId) {
    const preview = el('div', { class: 'report-preview', text: 'Loading reported content…' });
    body.appendChild(preview);
    (async () => {
      try {
        const ref = r.targetType === 'post'
          ? doc(db, 'posts', r.targetId)
          : (r.parentId ? doc(db, 'posts', r.parentId, 'comments', r.targetId) : null);
        if (!ref) { preview.textContent = 'Legacy comment report (no parent post id) — content preview unavailable.'; return; }
        const snap = await getDoc(ref);
        if (gen !== renderGen) return;
        if (!snap.exists()) { preview.textContent = 'Content already deleted — safe to dismiss.'; return; }
        const d = snap.data();
        const text = r.targetType === 'post'
          ? `${d.displayName || 'Member'}: ${(d.caption || '').trim() || `(${d.mediaType || 'text'} post, no caption)`}`
          : `${d.displayName || 'Member'}: ${(d.text || '').trim()}`;
        preview.textContent = text.slice(0, 300);
      } catch { preview.textContent = 'Could not load content preview.'; }
    })();
  }
  row.appendChild(el('div', { class: 'thumb', text: '🚩' }));
  row.appendChild(body);

  const msg = el('div', { class: 'msg' });
  body.appendChild(msg);
  const setMsg = (t, err) => { msg.textContent = t; msg.className = 'msg' + (err ? ' err' : ' ok'); };

  const btns = el('div', { class: 'rowbtns' });
  const resolve = async (status) => {
    await setDoc(doc(db, 'reports', r.id), { status, resolvedBy: adminUid, resolvedAt: iso() }, { merge: true });
    row.remove(); onResolved();
  };
  const busy = (b) => btns.querySelectorAll('button').forEach((x) => { x.disabled = b; });

  // Dismiss — resolve without touching content.
  const dismissBtn = el('button', { class: 'iconbtn', text: 'Dismiss' });
  dismissBtn.addEventListener('click', async () => {
    busy(true);
    try { await resolve('dismissed'); }
    catch (e) { busy(false); setMsg('Dismiss failed: ' + ((e && e.message) || 'unknown'), true); }
  });

  // Remove & Block — delete content first; only a CONFIRMED delete marks the
  // report actioned (deliberately fixes the app's F2 bug, which resolved the
  // report even when the delete failed and the content stayed live).
  const removeBtn = el('button', { class: 'btn danger', text: 'Remove & Block' });
  const commentMissingParent = r.targetType === 'comment' && !r.parentId;
  if (commentMissingParent) { removeBtn.disabled = true; removeBtn.title = 'Legacy report without parent post id — dismiss or action in the app.'; }
  removeBtn.addEventListener('click', async () => {
    if (!confirm(`Remove the reported ${r.targetType} and block the offender for the reporter?`)) return;
    busy(true);
    try {
      // 1. Delete content per target type — abort (report stays open) on failure.
      if (r.targetType === 'post' && r.targetId) {
        const res = await callFn('deletePostCascade', { postId: r.targetId });
        if (!res.ok) throw new Error('post delete failed: ' + (res.error || 'unknown'));
      } else if (r.targetType === 'comment' && r.targetId && r.parentId) {
        await deleteDoc(doc(db, 'posts', r.parentId, 'comments', r.targetId));
      } else if (r.targetType === 'message' && r.targetId) {
        const res = await callFn('redactDmMessages', { conversationId: r.targetId, targetUserId: r.targetUserId });
        if (!res.ok) throw new Error('DM redaction failed: ' + (res.error || 'unknown'));
      } // 'user' targets: nothing to delete — the block below is the action.

      // 2. Block offender for the reporter (best-effort; delete already landed).
      let blockWarn = '';
      if (r.reporterId && r.targetUserId && r.reporterId !== r.targetUserId) {
        try {
          await setDoc(doc(db, 'blocks', r.reporterId, 'blocked', r.targetUserId),
            { blockedAt: iso(), via: 'admin-report', reportId: r.id }, { merge: true });
        } catch (e) { blockWarn = ' (block write failed — content still removed)'; }
      }
      // 3. Only now mark the report actioned.
      await resolve('actioned');
      if (blockWarn) alert('Actioned' + blockWarn);
    } catch (e) {
      busy(false);
      setMsg(((e && e.message) || 'Action failed') + ' — report left open.', true);
    }
  });

  // Ban — disables the offender's sign-in AND purges their posts/comments
  // (banUser CF), so on success the report is resolved too (the app leaves it
  // open and demands a second action — deliberate improvement).
  const banBtn = el('button', { class: 'iconbtn', text: 'Ban user' });
  if (!r.targetUserId) banBtn.disabled = true;
  banBtn.addEventListener('click', async () => {
    if (!confirm(`Ban ${String(r.targetUserId).slice(0, 12)}…? This disables their sign-in and deletes their posts and comments. This is the strongest action.`)) return;
    busy(true);
    const res = await callFn('banUser', { targetUid: r.targetUserId });
    if (!res.ok) { busy(false); setMsg('Ban failed: ' + (res.error || 'unknown'), true); return; }
    // ok:true can still carry per-step purge failures in `errors` (the account
    // IS disabled) — resolve the report but tell the admin what didn't purge.
    const purgeFailed = res.errors ? Object.keys(res.errors) : [];
    try { await resolve('actioned'); }
    catch (e) { busy(false); setMsg('User banned, but the report could not be resolved: ' + ((e && e.message) || 'unknown'), true); return; }
    if (purgeFailed.length) setMsg('User banned, but content purge steps failed (' + purgeFailed.join(', ') + ') — their content may still be visible. Remove it from the Community tab.', true);
  });

  btns.appendChild(dismissBtn);
  btns.appendChild(removeBtn);
  btns.appendChild(banBtn);
  row.appendChild(btns);
  return row;
}

// ── Members (searchable, editable) ────────────────────────────────────────
async function renderMembers() {
  const gen = ++renderGen;
  content.replaceChildren(spinnerBox());
  let members = [];
  try {
    const snap = await getDocs(query(collection(db, 'members'), limit(500)));
    members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    if (gen !== renderGen) return;
    content.replaceChildren(stateBox('Could not load members', (e && e.message) || String(e)));
    return;
  }
  if (gen !== renderGen) return;
  members.sort((a, b) => String(a.firstName || a.name || '').localeCompare(String(b.firstName || b.name || '')));

  let filter = '', deleted = 0;
  const label = el('div', { class: 'section-label grow' });
  const list = el('div');
  const hay = (m) => [m.firstName, m.lastName, m.name, m.displayName, m.email, m.phone, m.username].filter(Boolean).join(' ').toLowerCase();
  const onDeleted = (m) => { members = members.filter((x) => x.id !== m.id); deleted += 1; redraw(); };
  const redraw = () => {
    const visible = members.filter((m) => !filter || hay(m).includes(filter));
    label.textContent = `${visible.length} of ${members.length} member${members.length === 1 ? '' : 's'}${members.length === 500 ? ' (first 500)' : ''}${deleted ? ` · ${deleted} deleted` : ''}`;
    list.replaceChildren(...(visible.length ? visible.map((m) => memberRow(m, onDeleted)) : [stateBox('No matching members', 'Try a different search.')]));
  };
  const search = el('input', { class: 'search', placeholder: 'Search name, email, phone…' });
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); redraw(); });

  content.replaceChildren(el('div', {}, [
    el('div', { class: 'toolbar' }, [label, search, el('button', { class: 'refresh', text: 'Refresh', onclick: renderMembers })]),
    list,
  ]));
  redraw();
}
function memberDisplay(m) {
  const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.name || m.displayName || '(no name)';
  const bits = [m.email, m.belt ? `${m.belt}${m.stripes ? ' · ' + m.stripes + ' stripe' + (m.stripes === 1 ? '' : 's') : ''} belt` : null, m.phone, m.isAdmin ? 'admin' : m.isEmployee ? 'staff' : null].filter(Boolean).join(' · ');
  return { name, bits };
}
function memberRow(m, onDeleted) {
  const row = el('div', { class: 'row' });
  const render = () => {
    row.replaceChildren();
    const { name, bits } = memberDisplay(m);
    row.appendChild(safeImg(m.profilePhoto || m.avatar));
    row.appendChild(el('div', { class: 'body' }, [
      el('div', { class: 'name', text: name }),
      el('div', { class: 'meta', text: bits || '—' }),
    ]));
    const editBtn = el('button', { class: 'iconbtn', text: 'Edit', onclick: edit });
    const delBtn = el('button', { class: 'btn danger', text: 'Delete' });
    if (!m.firebaseUid) {
      // No linked Auth account (member created by staff, never signed in) — there
      // is no uid to erase server-side, so hard delete doesn't apply.
      delBtn.disabled = true;
      delBtn.title = 'No linked login for this member — nothing to delete server-side.';
    } else {
      delBtn.addEventListener('click', async () => {
        const nm = safeName(name);
        if (!confirm(`PERMANENTLY DELETE ${nm}'s account?\n\nErases their profile, posts, comments, likes, follows, DMs, personal records, uploaded media, and their login. This cannot be undone.`)) return;
        const typed = prompt(`This is irreversible. Type DELETE to confirm removing ${nm}.`);
        if (typed !== 'DELETE') { if (typed !== null) alert('Not deleted — the confirmation text did not match.'); return; }
        editBtn.disabled = true; delBtn.disabled = true; delBtn.textContent = 'Deleting…';
        const res = await callFn('adminDeleteUser', { targetUid: m.firebaseUid });
        if (res.ok) {
          const d = (res.data && res.data.deleted) || {};
          const errs = (res.data && res.data.errors) || {};
          const summary = Object.entries(d).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(', ') || 'no residual data';
          const errNote = Object.keys(errs).length ? ` (some steps had issues: ${Object.keys(errs).join(', ')})` : '';
          if (onDeleted) onDeleted(m);
          alert(`Deleted ${nm}. Removed — ${summary}.${errNote}`);
        } else {
          editBtn.disabled = false; delBtn.disabled = false; delBtn.textContent = 'Delete';
          alert('Delete failed: ' + (res.error || 'unknown'));
        }
      });
    }
    row.appendChild(el('div', { class: 'rowbtns' }, [editBtn, delBtn]));
  };
  const edit = () => {
    row.replaceChildren();
    const first = el('input', { value: m.firstName || '', placeholder: 'First name' });
    const last = el('input', { value: m.lastName || '', placeholder: 'Last name' });
    const phone = el('input', { value: m.phone || '', placeholder: 'Phone' });
    const origBelt = BELTS.includes(m.belt) ? m.belt : 'none';   // app's neutral default is 'none', not 'white'
    const belt = el('select', {}, BELTS.map((b) => el('option', { value: b, text: b })));
    belt.value = origBelt;
    const origStripes = [0, 1, 2, 3, 4].includes(m.stripes) ? m.stripes : 0;
    const stripes = el('select', {}, [0, 1, 2, 3, 4].map((n) => el('option', { value: String(n), text: n + ' stripe' + (n === 1 ? '' : 's') })));
    stripes.value = String(origStripes);
    const msg = el('div', { class: 'msg' });
    const save = el('button', { class: 'btn primary small', text: 'Save' });
    const cancel = el('button', { class: 'btn small', text: 'Cancel', onclick: render });
    save.addEventListener('click', async () => {
      save.disabled = true; save.textContent = 'Saving…'; msg.textContent = ''; msg.className = 'msg';
      const patch = {
        firstName: first.value.trim(), lastName: last.value.trim(), phone: phone.value.trim(),
        updatedAt: iso(),
      };
      // Only touch rank when the admin actually changed it, so an unrelated
      // edit (e.g. fixing a phone number) can never fabricate/overwrite a belt.
      const newBelt = belt.value, newStripes = parseInt(stripes.value, 10) || 0;
      if (newBelt !== origBelt) patch.belt = newBelt;
      if (newStripes !== origStripes) patch.stripes = newStripes;
      try {
        await setDoc(doc(db, 'members', m.id), patch, { merge: true });
        Object.assign(m, patch);
        render();
      } catch (e) {
        save.disabled = false; save.textContent = 'Save';
        msg.textContent = 'Save failed: ' + ((e && e.message) || 'unknown'); msg.className = 'msg err';
      }
    });
    row.appendChild(safeImg(m.profilePhoto || m.avatar));
    row.appendChild(el('div', { class: 'body' }, [
      el('div', { class: 'grid2' }, [first, last]),
      el('div', { class: 'grid2', style: 'margin-top:8px' }, [belt, stripes]),
      el('div', { style: 'margin-top:8px' }, [phone]),
      msg,
      el('div', { class: 'rowbtns', style: 'margin-top:8px' }, [save, cancel]),
    ]));
  };
  render();
  return row;
}

// ── Announcements ─────────────────────────────────────────────────────────
// Draft survives tab switches (F6). Keyed by announcement id ('NEW' for new).
let annDraft = null;
async function renderAnnouncements() {
  const gen = ++renderGen;
  content.replaceChildren(spinnerBox());
  let items = [];
  try {
    // No server-side orderBy: Firestore EXCLUDES docs missing the field, so
    // legacy announcements without createdAt were invisible (and undeletable)
    // here while still rendering on members' Home. Sort client-side instead —
    // pinned first (matching the app), then newest.
    const snap = await getDocs(query(collection(db, 'announcements'), limit(200)));
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    if (gen !== renderGen) return;
    content.replaceChildren(stateBox('Could not load announcements', (e && e.message) || String(e)));
    return;
  }
  if (gen !== renderGen) return;
  items.sort((a, b) => (toMs(b.createdAt) - toMs(a.createdAt)));
  items.sort((a, b) => (b.pinned === true ? 1 : 0) - (a.pinned === true ? 1 : 0));

  if (annDraft) { openAnnEditor(annDraft.id === 'NEW' ? null : items.find((x) => x.id === annDraft.id) || null); return; }

  const frame = el('div');
  frame.appendChild(el('div', { class: 'toolbar' }, [
    el('div', { class: 'section-label grow', text: `${items.length} ANNOUNCEMENT${items.length === 1 ? '' : 'S'} · pinned first` }),
    el('button', { class: 'btn primary small', text: '+ New', onclick: () => openAnnEditor(null) }),
  ]));
  const list = el('div');
  frame.appendChild(list);
  if (items.length === 0) list.appendChild(stateBox('No announcements', 'Add one — it shows on every member’s Home screen.'));
  for (const a of items) list.appendChild(annRow(a));
  content.replaceChildren(frame);
}
function annRow(a) {
  const row = el('div', { class: 'row' });
  const title = el('div', { class: 'name' });
  if (a.pinned) title.appendChild(el('span', { class: 'badge gold', text: '📌 pinned' }));
  title.appendChild(document.createTextNode((a.pinned ? ' ' : '') + (a.title || '(untitled)')));
  row.appendChild(el('div', { class: 'body' }, [
    title,
    el('div', { class: 'meta', text: a.description || '' }),
    el('div', { class: 'date', text: fmtDate(a.createdAt) }),
  ]));
  const editBtn = el('button', { class: 'iconbtn', text: 'Edit', onclick: () => openAnnEditor(a) });
  const delBtn = el('button', { class: 'btn danger', text: 'Delete' });
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Delete announcement "${safeName(a.title)}"?`)) return;
    delBtn.disabled = true;
    try { await deleteDoc(doc(db, 'announcements', a.id)); row.remove(); }
    catch (e) { delBtn.disabled = false; alert('Delete failed: ' + ((e && e.message) || 'unknown')); }
  });
  row.appendChild(el('div', { class: 'rowbtns' }, [editBtn, delBtn]));
  return row;
}
function openAnnEditor(existing) {
  const isNew = !existing;
  const draft = annDraft && annDraft.id === (existing ? existing.id : 'NEW') ? annDraft : null;
  annDraft = { id: existing ? existing.id : 'NEW', title: draft ? draft.title : (existing ? existing.title || '' : ''), desc: draft ? draft.desc : (existing ? existing.description || '' : ''), pinned: draft ? draft.pinned : (existing ? !!existing.pinned : false) };

  const titleI = el('input', { value: annDraft.title, placeholder: 'Title (e.g. Mat cleaning Saturday 8AM)', maxlength: '80' });
  const descI = el('textarea', { placeholder: 'Short description (optional)', maxlength: '140' });
  descI.value = annDraft.desc;
  const pin = el('input', { type: 'checkbox', checked: annDraft.pinned });
  titleI.addEventListener('input', () => { annDraft.title = titleI.value; });
  descI.addEventListener('input', () => { annDraft.desc = descI.value; });
  pin.addEventListener('change', () => { annDraft.pinned = pin.checked; });

  const msg = el('div', { class: 'msg' });
  const saveBtn = el('button', { class: 'btn primary small', text: isNew ? 'Post' : 'Save' });
  const cancelBtn = el('button', { class: 'btn small', text: 'Cancel', onclick: () => { annDraft = null; renderAnnouncements(); } });
  saveBtn.addEventListener('click', async () => {
    const title = titleI.value.trim();
    if (!title) { msg.textContent = 'Enter a title.'; msg.className = 'msg err'; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; msg.textContent = ''; msg.className = 'msg';
    const id = existing ? existing.id : rid('ann');
    const rec = {
      title, description: descI.value.trim(), pinned: pin.checked,
      // ISO STRING, not Firestore Timestamp — the APP is the contract owner
      // here: announcementSync.ts sorts with createdAt.localeCompare, so a
      // Timestamp object THREW inside every client's onSnapshot and froze the
      // announcements pipeline app-wide (audit 2.0.5 P1). The admin's own
      // list sorts client-side via toMs(), which handles both shapes.
      createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
    };
    try { await setDoc(doc(db, 'announcements', id), rec, { merge: true }); annDraft = null; renderAnnouncements(); }
    catch (e) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Post' : 'Save'; msg.textContent = 'Save failed: ' + ((e && e.message) || 'unknown'); msg.className = 'msg err'; }
  });
  content.replaceChildren(el('div', { class: 'card' }, [
    el('div', { class: 'section-label', text: isNew ? 'NEW ANNOUNCEMENT' : 'EDIT ANNOUNCEMENT' }),
    el('label', { class: 'fl', text: 'Title' }), titleI,
    el('label', { class: 'fl', text: 'Description' }), descI,
    el('label', { class: 'checkrow' }, [pin, el('span', { text: 'Pin to top of Home' })]),
    msg,
    el('div', { class: 'rowbtns' }, [saveBtn, cancelBtn]),
  ]));
}

// ── Broadcast ─────────────────────────────────────────────────────────────
// Draft survives tab switches (F6).
const broadcastDraft = { title: '', body: '' };
function renderBroadcast() {
  ++renderGen; // synchronous render still invalidates in-flight async renders
  const titleI = el('input', { value: broadcastDraft.title, placeholder: 'e.g. Class canceled tonight', maxlength: '100' });
  const bodyI = el('textarea', { placeholder: 'What would you like to say?', maxlength: '400' });
  bodyI.value = broadcastDraft.body;
  const tc = el('div', { class: 'charcount', text: `${broadcastDraft.title.length}/100` });
  const bc = el('div', { class: 'charcount', text: `${broadcastDraft.body.length}/400` });
  titleI.addEventListener('input', () => { broadcastDraft.title = titleI.value; tc.textContent = `${titleI.value.length}/100`; });
  bodyI.addEventListener('input', () => { broadcastDraft.body = bodyI.value; bc.textContent = `${bodyI.value.length}/400`; });
  const recip = el('div', { class: 'pill', text: 'Counting recipients…' });
  const msg = el('div', { class: 'msg' });
  const sendBtn = el('button', { class: 'btn primary', text: 'Send to all members' });

  getCountFromServer(collection(db, 'pushTokens'))
    .then((agg) => { const n = agg.data().count; recip.textContent = n === 0 ? '0 devices have push enabled — members must sign in on a phone and allow notifications first' : `${n} device${n === 1 ? '' : 's'} will receive this`; })
    .catch(() => { recip.textContent = 'Recipient count unavailable'; });

  sendBtn.addEventListener('click', async () => {
    const title = titleI.value.trim(), body = bodyI.value.trim();
    if (!title || !body) { msg.textContent = 'Enter both a title and a message.'; msg.className = 'msg err'; return; }
    if (!confirm(`Send "${title}" as a push notification to every member with the app installed?`)) return;
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; msg.textContent = ''; msg.className = 'msg';
    const res = await callFn('broadcastPush', { title, body });
    sendBtn.disabled = false; sendBtn.textContent = 'Send to all members';
    if (!res.ok) { msg.textContent = 'Failed: ' + (res.error || 'unknown'); msg.className = 'msg err'; return; }
    const d = res.data || {};
    msg.textContent = d.recipients === 0
      ? 'No recipients had push tokens registered yet.'
      : `Delivered to ${d.sent} of ${d.recipients}${d.errors ? ` (${d.errors} failed)` : ''}.`;
    msg.className = 'msg ok';
    broadcastDraft.title = ''; broadcastDraft.body = '';
    titleI.value = ''; bodyI.value = ''; tc.textContent = '0/100'; bc.textContent = '0/400';
  });

  content.replaceChildren(el('div', {}, [
    el('div', { class: 'card' }, [
      el('div', { class: 'section-label', text: 'NEW BROADCAST' }),
      el('label', { class: 'fl', text: 'Title' }), titleI, tc,
      el('label', { class: 'fl', text: 'Message' }), bodyI, bc,
      recip,
      sendBtn,
      msg,
    ]),
    el('div', { class: 'section-label', text: 'Push notifications reach only phones that have signed in and granted notification permission (not web or simulators).' }),
  ]));
}

// ── Support (Contact IT inbox) ───────────────────────────────────────────
// /supportMessages is client-read:false (contact PII), so this reads through
// the admin-gated listSupportMessages CF. Fixes the audit 2.0.5 "support
// black hole": the app promises a 24h response but nothing surfaced messages.
const SUPPORT_CATEGORY_BADGES = { bug: 'red', urgent: 'red', feature: 'gold', general: 'green' };
async function renderSupport() {
  const gen = ++renderGen;
  content.replaceChildren(spinnerBox());
  const res = await callFn('listSupportMessages', { action: 'list' });
  if (gen !== renderGen) return;
  if (!res.ok) {
    content.replaceChildren(stateBox("Couldn't load support messages", res.error || 'unknown'));
    return;
  }
  const msgs = (res.data && res.data.messages) || [];
  const open = msgs.filter((m) => m.status !== 'handled');
  const handled = msgs.filter((m) => m.status === 'handled');
  const frame = el('div');
  frame.appendChild(el('div', { class: 'toolbar' }, [
    el('div', { class: 'section-label grow', text: `${open.length} OPEN · ${handled.length} handled (newest 100)` }),
    el('button', { class: 'refresh', text: 'Refresh', onclick: renderSupport }),
  ]));
  if (msgs.length === 0) {
    frame.appendChild(stateBox('No support messages', 'Contact IT submissions from the app appear here.'));
    content.replaceChildren(frame);
    return;
  }
  for (const m of [...open, ...handled]) {
    const row = el('div', { class: 'row stack' });
    const title = el('div', { class: 'name' });
    title.appendChild(el('span', { class: `badge ${SUPPORT_CATEGORY_BADGES[m.category] || ''}`, text: (m.category || 'general').toUpperCase() }));
    if (m.status === 'handled') title.appendChild(el('span', { class: 'badge', text: 'handled' }));
    title.appendChild(document.createTextNode(' ' + (m.subject || '(no subject)')));
    const body = el('div', { class: 'body' }, [
      title,
      el('div', { class: 'report-preview', text: m.message || '' }),
      el('div', { class: 'meta', text: `${m.memberName || 'Member'}${m.memberEmail ? ' · ' + m.memberEmail : ''} · ${m.platform || ''} ${m.appVersion || ''}` }),
      el('div', { class: 'date', text: fmtDate(m.createdAt) }),
    ]);
    row.appendChild(body);
    if (m.status !== 'handled') {
      const btn = el('button', { class: 'iconbtn', text: 'Mark handled' });
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Saving…';
        const r = await callFn('listSupportMessages', { action: 'markHandled', id: m.id });
        if (r.ok) renderSupport();
        else { btn.disabled = false; btn.textContent = 'Mark handled'; alert('Failed: ' + (r.error || 'unknown')); }
      });
      row.appendChild(el('div', { class: 'rowbtns' }, [btn]));
    }
    frame.appendChild(row);
  }
  content.replaceChildren(frame);
}
