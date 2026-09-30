export const MAX_PROFILE_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PROFILE_PHOTO_LABEL = '3MB';
/** Keep encoded JSON under Vercel’s ~4.5MB function body after base64. */
const MAX_PROFILE_PHOTO_PAYLOAD_BYTES = 2 * 1024 * 1024;

export function loggedInPhotoUrl(
  user?: { avatar?: string | null; employee?: { avatar?: string | null } | null } | null,
): string | null {
  return firstPhotoUrl(user?.employee?.avatar, user?.avatar);
}

export function employeePhotoUrl(
  employee?: { avatar?: string | null; user?: { avatar?: string | null } | null } | null,
): string | null {
  return firstPhotoUrl(employee?.avatar, employee?.user?.avatar);
}

function firstPhotoUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const url of candidates) {
    if (url && String(url).trim()) return url;
  }
  return null;
}

export function dataUrlDecodedBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = (b64.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function validateProfilePhotoFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Please upload an image file (JPG, PNG or GIF).';
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return `Photo must be ${MAX_PROFILE_PHOTO_LABEL} or smaller.`;
  }
  return null;
}

export function profilePhotoPayloadError(avatar: unknown): string | null {
  if (avatar == null || avatar === '') return null;
  if (typeof avatar !== 'string') return 'Invalid photo data';
  if (/^https?:\/\//i.test(avatar)) return null;
  if (!avatar.startsWith('data:image/')) return 'Photo must be an image';
  if (dataUrlDecodedBytes(avatar) > MAX_PROFILE_PHOTO_BYTES) {
    return `Photo must be ${MAX_PROFILE_PHOTO_LABEL} or smaller.`;
  }
  return null;
}

export async function fileToProfilePhotoDataUrl(
  file: File,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  const fileError = validateProfilePhotoFile(file);
  if (fileError) return { ok: false, error: fileError };

  try {
    const dataUrl = await compressImageFile(file, MAX_PROFILE_PHOTO_PAYLOAD_BYTES);
    const payloadError = profilePhotoPayloadError(dataUrl);
    if (payloadError) return { ok: false, error: payloadError };
    return { ok: true, dataUrl };
  } catch {
    return { ok: false, error: `Photo must be ${MAX_PROFILE_PHOTO_LABEL} or smaller.` };
  }
}

function compressImageFile(file: File, maxDecodedBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxEdge = 1280;
        if (width > maxEdge || height > maxEdge) {
          const scale = Math.min(maxEdge / width, maxEdge / height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        let quality = 0.82;
        let out = src;
        for (let attempt = 0; attempt < 8; attempt++) {
          canvas.width = width;
          canvas.height = height;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          out = canvas.toDataURL('image/jpeg', quality);
          if (dataUrlDecodedBytes(out) <= maxDecodedBytes) {
            resolve(out);
            return;
          }
          quality = Math.max(0.45, quality - 0.1);
          if (quality <= 0.45) {
            width = Math.max(320, Math.round(width * 0.85));
            height = Math.max(320, Math.round(height * 0.85));
          }
        }
        resolve(out);
      };
      img.onerror = () => reject(new Error('image failed'));
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
