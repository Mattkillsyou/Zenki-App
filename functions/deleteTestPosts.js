/**
 * deleteTestPosts.js — one-off admin cleanup (NOT a Cloud Function; do not export).
 *
 * Deletes community posts AND their Cloud Storage media for one or more user
 * UIDs, in BOTH layers (Firestore /posts doc + subcollections via recursiveDelete,
 * and the postMedia Storage blob parsed from each post's mediaUrl). Mirrors the
 * logic of functions/src/deletePostCascade.ts so results match the app's own path.
 *
 * SAFE BY DEFAULT: dry-run unless you pass `delete`. Always run `list` then `dry`
 * before `delete`.
 *
 * Auth (needs prod credentials — this touches live data):
 *   Option 1: gcloud auth application-default login   (then set the project)
 *   Option 2: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   Project:  export GOOGLE_CLOUD_PROJECT=zenki-dojo   (or pass --project below)
 *
 * Run from the functions/ dir so firebase-admin resolves (npm --prefix functions install first):
 *   node deleteTestPosts.js list                         # every post: id, userId, displayName, mediaUrl
 *   node deleteTestPosts.js dry    <uid1> [uid2 ...]     # what WOULD be deleted for these uids
 *   node deleteTestPosts.js delete <uid1> [uid2 ...]     # actually delete (both layers)
 */

const admin = require('firebase-admin');

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'zenki-dojo';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
});

const db = admin.firestore();

/** Parse a Firebase download URL into { bucket, path } so we can delete the blob.
 *  Format: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded-path>?alt=media&token=... */
function parseStorageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const bucketMatch = url.match(/\/b\/([^/]+)\/o\//);
  const pathMatch = url.match(/\/o\/([^?]+)/);
  if (!pathMatch) return null;
  try {
    return {
      bucket: bucketMatch ? decodeURIComponent(bucketMatch[1]) : null,
      path: decodeURIComponent(pathMatch[1]),
    };
  } catch {
    return null;
  }
}

async function listAll() {
  const snap = await db.collection('posts').orderBy('createdAt', 'desc').get();
  console.log(`\n${snap.size} post(s) in /posts:\n`);
  const byUser = {};
  snap.forEach((d) => {
    const p = d.data();
    byUser[p.userId] = (byUser[p.userId] || 0) + 1;
    console.log(
      `  ${d.id}  userId=${p.userId}  "${p.displayName || '?'}"  ${p.mediaType || 'text'}  ${p.mediaUrl ? 'has-media' : 'no-media'}`
    );
  });
  console.log('\nPosts per userId:');
  for (const [uid, n] of Object.entries(byUser)) console.log(`  ${uid}: ${n}`);
  console.log('\nPick the uid(s) for the admin + mbrown accounts and pass them to `dry`/`delete`.');
}

async function run(uids, doDelete) {
  if (!uids.length) {
    console.error('Provide at least one uid. Run `list` first to find them.');
    process.exit(1);
  }
  // Firestore `in` supports up to 10 values; chunk if ever needed.
  const snap = await db.collection('posts').where('userId', 'in', uids.slice(0, 10)).get();
  console.log(`\n${doDelete ? 'DELETING' : 'DRY-RUN'} — ${snap.size} post(s) for uids [${uids.join(', ')}]:\n`);

  let docs = 0, blobs = 0, blobMisses = 0;
  for (const d of snap.docs) {
    const p = d.data();
    const media = parseStorageUrl(p.mediaUrl);
    console.log(`  post ${d.id}  media=${media ? `${media.bucket || '(default)'}:${media.path}` : '(none/unparseable)'}`);

    if (!doDelete) continue;

    // 1) Storage blob first (so a failure here doesn't leave a doc-less orphan).
    if (media) {
      try {
        const bucket = media.bucket ? admin.storage().bucket(media.bucket) : admin.storage().bucket();
        await bucket.file(media.path).delete();
        blobs++;
      } catch (e) {
        blobMisses++;
        console.warn(`    ! blob delete failed (${e.code || e.message}) — continuing`);
      }
    }
    // 2) Firestore doc + subcollections (likes/comments).
    await db.recursiveDelete(d.ref);
    docs++;
  }

  if (doDelete) {
    console.log(`\nDone. Deleted ${docs} post doc(s), ${blobs} media blob(s)${blobMisses ? `, ${blobMisses} blob(s) failed (check Storage manually)` : ''}.`);
  } else {
    console.log('\nDry-run only. Re-run with `delete` to remove the above.');
  }
}

(async () => {
  const [mode, ...uids] = process.argv.slice(2);
  try {
    if (mode === 'list') await listAll();
    else if (mode === 'dry') await run(uids, false);
    else if (mode === 'delete') await run(uids, true);
    else {
      console.log('Usage: node deleteTestPosts.js list | dry <uid...> | delete <uid...>');
      process.exit(1);
    }
    process.exit(0);
  } catch (e) {
    console.error('Failed:', e);
    process.exit(1);
  }
})();
