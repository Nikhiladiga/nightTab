const API = 'https://www.googleapis.com';

const request = async (token, url, options = {}) => {
  const res = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, ...options.headers } });
  if (!res.ok) {
    const error = new Error('Drive request failed: ' + res.status);
    error.status = res.status;
    throw error;
  }
  return res.json();
};

const drive = {};

drive.findFile = async (token, name) => {
  const q = encodeURIComponent('name=\'' + name + '\'');
  const data = await request(token, API + '/drive/v3/files?spaces=appDataFolder&q=' + q + '&fields=' + encodeURIComponent('files(id,modifiedTime,appProperties)'));
  const file = data.files[0];
  if (!file) {
    return null;
  }
  return {
    id: file.id,
    modifiedTime: Date.parse(file.modifiedTime),
    version: file.appProperties?.version,
    modified: Number(file.appProperties?.modified)
  };
};

drive.download = (token, id) => request(token, API + '/drive/v3/files/' + id + '?alt=media');

drive.upload = async (token, { id, name, json, version, modified }) => {
  const boundary = 'nightTab' + Math.random().toString(36).slice(2);
  const metadata = { name, appProperties: { version, modified: String(modified) } };
  if (!id) {
    metadata.parents = ['appDataFolder'];
  }
  const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata)
    + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + json
    + '\r\n--' + boundary + '--';
  const data = await request(token, API + '/upload/drive/v3/files' + (id ? '/' + id : '') + '?uploadType=multipart&fields=id,modifiedTime', {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body
  });
  return { id: data.id, modifiedTime: Date.parse(data.modifiedTime) };
};

export { drive };
