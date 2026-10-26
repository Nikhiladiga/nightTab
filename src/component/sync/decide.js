const decide = ({ meta, remote, appVersion, compareVersion }) => {
  if (remote === null) {
    return { action: 'push', backupLocal: false, backupRemote: false };
  }
  // a missing remote.version counts as not newer
  if (remote.version && compareVersion(remote.version, appVersion) > 0) {
    return { action: 'blocked', backupLocal: false, backupRemote: false };
  }
  if (meta.synced === 0) {
    return { action: 'pull', backupLocal: true, backupRemote: false };
  }
  const remoteChanged = remote.modifiedTime > meta.synced;
  if (remoteChanged && !meta.dirty) {
    return { action: 'pull', backupLocal: false, backupRemote: false };
  }
  if (!remoteChanged && meta.dirty) {
    return { action: 'push', backupLocal: false, backupRemote: false };
  }
  if (remoteChanged && meta.dirty) {
    return remote.modified > meta.modified
      ? { action: 'pull', backupLocal: true, backupRemote: false }
      // the Drive copy is lost everywhere after this push, so it takes the backup slot
      : { action: 'push', backupLocal: false, backupRemote: true };
  }
  return { action: 'none', backupLocal: false, backupRemote: false };
};

export { decide };
