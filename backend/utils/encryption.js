const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV is what GCM is designed around

function getKey() {
  const keyHex = process.env.HELPER_DATA_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      'HELPER_DATA_ENCRYPTION_KEY environment variable is required to store helper contact info. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('HELPER_DATA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) for aes-256-gcm.');
  }
  return key;
}

// Public Tier 1 helpers' name and phone are encrypted at rest with this,
// so a copy of db.json on disk or in a backup isn't a plaintext contact
// list. iv and authTag are random/derived per value and stored alongside
// the ciphertext (not secret on their own) so this round-trips through
// plain JSON without a separate side-table.
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(encoded) {
  const key = getKey();
  const parts = String(encoded).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted value.');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
