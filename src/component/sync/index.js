import { APP_NAME, SYNC_FILE_NAME } from '../../constant';
import { data } from '../data';
import { version } from '../version';
import { auth, AuthError } from './auth';
import { drive } from './drive';
import { decide } from './decide';

const META_KEY = APP_NAME + 'SyncMeta';
const DEBOUNCE = 3000;
const DEFAULT_META = { dirty: false, modified: 0, synced: 0, fileId: null };

const sync = {};

sync.ready = false;
sync.status = 'signed-out';
sync.lastSync = 0;

let running = false;
let rerun = false;
let timer = null;
let listener = null;

const loadMeta = () => {
  try {
    return { ...DEFAULT_META, ...JSON.parse(data.get(META_KEY)) };
  } catch (error) {
    return { ...DEFAULT_META };
  }
};

const saveMeta = (meta) => data.set(META_KEY, JSON.stringify(meta));

const setStatus = (status) => {
  sync.status = status;
  if (listener) {
    listener(status);
  }
};

sync.onStatus = (fn) => { listener = fn; };

sync.markChanged = () => {
  saveMeta({ ...loadMeta(), dirty: true, modified: Date.now() });
  clearTimeout(timer);
  timer = setTimeout(sync.run, DEBOUNCE);
};

sync.changed = () => {
  if (sync.ready) {
    sync.markChanged();
  }
};

const cycle = async () => {
  const token = await auth.getToken();
  const file = await drive.findFile(token, SYNC_FILE_NAME);
  // a missing or NaN remote.modified counts as 0
  const remote = file ? { ...file, modified: file.modified || 0 } : null;
  const meta = loadMeta();
  const local = data.get(APP_NAME);
  const { action, backupLocal } = decide({ meta, remote, appVersion: version.number, compareVersion: version.compare });

  if (action === 'push' && local !== null) {
    const result = await drive.upload(token, {
      id: file ? file.id : null,
      name: SYNC_FILE_NAME,
      json: local,
      version: version.number,
      modified: meta.modified
    });
    // an edit made during the upload keeps the config dirty
    const current = loadMeta();
    saveMeta({ dirty: current.modified !== meta.modified, modified: current.modified, synced: result.modifiedTime, fileId: result.id });
  } else if (action === 'pull') {
    const remoteData = await drive.download(token, file.id);
    if (backupLocal && local !== null) {
      data.backup(JSON.parse(local));
    }
    data.set(APP_NAME, JSON.stringify(data.update(remoteData)));
    saveMeta({ dirty: false, modified: remote.modified, synced: remote.modifiedTime, fileId: file.id });
    data.reload.render();
  }

  if (action === 'blocked') {
    setStatus('blocked');
  } else {
    sync.lastSync = Date.now();
    setStatus('synced');
  }
};

sync.run = async () => {
  if (!auth.isSignedIn()) {
    return;
  }
  if (!navigator.onLine) {
    setStatus('offline');
    return;
  }
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  setStatus('syncing');
  try {
    await cycle();
  } catch (error) {
    if (error instanceof AuthError) {
      setStatus('reauth');
    } else {
      console.error(error);
      setStatus(navigator.onLine ? 'error' : 'offline');
    }
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      sync.run();
    }
  }
};

const resetLink = () => saveMeta({ ...loadMeta(), synced: 0, fileId: null });

sync.signIn = async () => {
  await auth.signIn();
  resetLink();
  await sync.run();
};

sync.signOut = async () => {
  await auth.signOut();
  resetLink();
  setStatus('signed-out');
};

sync.init = () => {
  if (typeof chrome === 'undefined' || !chrome.identity) {
    return;
  }
  sync.ready = true;
  // data cannot import sync (import cycle), so sync registers its hook
  data.onChange = sync.changed;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sync.run();
    }
  });
  window.addEventListener('online', sync.run);
  sync.run();
};

export { sync };
