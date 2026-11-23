// Dateien im Feedback-Chat (Cloudflare R2, Bindung FILES). Ablage: chat/<uid des Chats>/<zufällige ID>.
// Reine Prüfungen, Test: node push/files.test.mjs
export const LIMITS = { image: 5e6, audio: 10e6, video: 95e6, file: 15e6 };   // Bytes je Datei
const DOCS = ['application/pdf', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

export const baseType = t => String(t || '').split(';')[0].trim().toLowerCase();
export function kindOf(type) {
  const t = baseType(type);
  if (/^image\/(jpeg|png|webp|gif)$/.test(t)) return 'image';
  if (/^audio\/(mp4|mpeg|webm|ogg|aac|x-m4a)$/.test(t)) return 'audio';
  if (/^video\/(mp4|quicktime|webm)$/.test(t)) return 'video';
  if (DOCS.includes(t)) return 'file';
  return null;
}
export const threadOk = t => /^[\w-]{1,128}$/.test(t || '');
// Nur die beiden Chat-Seiten: der Nutzer selbst (eigener Chat) oder der Entwickler
export const mayAccess = (uid, admin, key) => typeof key === 'string' && /^chat\/[\w-]{1,128}\/[0-9a-f-]{36}$/.test(key) && (admin || key.split('/')[1] === uid);
