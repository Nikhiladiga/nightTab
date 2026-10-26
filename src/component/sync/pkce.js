const base64url = (bytes) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

const randomVerifier = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

const codeChallenge = async (verifier) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
};

const emailFromIdToken = (idToken) => {
  const payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(payload)).email;
};

export { randomVerifier, codeChallenge, emailFromIdToken };
