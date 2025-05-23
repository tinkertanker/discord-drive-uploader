import nacl from 'tweetnacl';

export async function verifyDiscordRequest(body, signature, timestamp) {
  if (!signature || !timestamp || !body) {
    return false;
  }

  try {
    const publicKey = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKey) {
      throw new Error('Missing DISCORD_PUBLIC_KEY');
    }

    const message = timestamp + body;
    const messageBuffer = Buffer.from(message);
    const signatureBuffer = Buffer.from(signature, 'hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');

    return nacl.sign.detached.verify(
      messageBuffer,
      signatureBuffer,
      publicKeyBuffer
    );
  } catch (error) {
    console.error('Error verifying Discord request:', error);
    return false;
  }
}