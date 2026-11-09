const CRED_KEY = 'ktu_cred_key';
const CRED_DATA = 'ktu_credentials';

let keyPromise = null;

function subtleAvailable() {
  return Boolean(globalThis.crypto?.subtle);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function savePlain(credentials) {
  const encoded = new TextEncoder().encode(JSON.stringify(credentials));
  localStorage.setItem(
    CRED_DATA,
    JSON.stringify({
      mode: 'plain',
      data: bytesToBase64(encoded),
    }),
  );
}

async function getKey() {
  if (!subtleAvailable()) {
    throw new Error('Saving credentials is unavailable in this browser.');
  }

  if (!keyPromise) {
    keyPromise = (async () => {
      const stored = localStorage.getItem(CRED_KEY);

      if (stored) {
        try {
          return await crypto.subtle.importKey(
            'jwk',
            JSON.parse(stored),
            { name: 'AES-GCM' },
            true,
            ['encrypt', 'decrypt'],
          );
        } catch {
          localStorage.removeItem(CRED_KEY);
        }
      }

      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      );
      const exported = await crypto.subtle.exportKey('jwk', key);
      localStorage.setItem(CRED_KEY, JSON.stringify(exported));
      return key;
    })().catch((error) => {
      keyPromise = null;
      throw error;
    });
  }

  return keyPromise;
}

export async function saveCredentials(credentials) {
  if (!subtleAvailable()) {
    savePlain(credentials);
    return;
  }

  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(credentials));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    localStorage.setItem(
      CRED_DATA,
      JSON.stringify({
        mode: 'aes',
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
        iv: bytesToBase64(iv),
      }),
    );
  } catch {
    savePlain(credentials);
  }
}

export async function loadCredentials() {
  const raw = localStorage.getItem(CRED_DATA);
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw);

    if (stored.mode === 'plain') {
      return JSON.parse(new TextDecoder().decode(base64ToBytes(stored.data)));
    }

    if (!subtleAvailable()) {
      throw new Error('Saving credentials is unavailable in this browser.');
    }

    const key = await getKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(stored.iv) },
      key,
      base64ToBytes(stored.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    try {
      localStorage.removeItem(CRED_DATA);
    } catch {
      return null;
    }
    return null;
  }
}

export function clearCredentials() {
  localStorage.removeItem(CRED_DATA);
}
