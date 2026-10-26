const decide = ({ meta, remote, appVersion, compareVersion }) => {
  if (remote === null) {
    return { action: 'push', backupLocal: false };
  }
  // a missing remote.version counts as not newer
  if (remote.version && compareVersion(remote.version, appVersion) > 0) {
    return { action: 'blocked', backupLocal: false };
  }
  if (meta.synced === 0) {
    return { action: 'pull', backupLocal: true };
  }
  const remoteChanged = remote.modifiedTime > meta.synced;
  if (remoteChanged && !meta.dirty) {
    return { action: 'pull', backupLocal: false };
  }
  if (!remoteChanged && meta.dirty) {
    return { action: 'push', backupLocal: false };
  }
  if (remoteChanged && meta.dirty) {
    return remote.modified > meta.modified
      ? { action: 'pull', backupLocal: true }
      : { action: 'push', backupLocal: false };
  }
  return { action: 'none', backupLocal: false };
};

export { decide };
