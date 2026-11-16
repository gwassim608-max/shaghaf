import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from './firebase';

const STANDARD_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name);
}

export async function compressImageFile(file: File): Promise<Blob> {
  if (!isLikelyImageFile(file) || file.type === 'image/gif' || /\.gif$/i.test(file.name)) {
    return file;
  }
  return new Promise((resolve) => {
    let settled = false;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    const finish = (out: Blob) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(out);
    };
    const timer = setTimeout(() => finish(file), 8000);

    img.onload = () => {
      clearTimeout(timer);
      const maxDim = 1280;
      let { width, height } = img;
      if (!width || !height) {
        finish(file);
        return;
      }
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          const isStandard = STANDARD_IMAGE_MIMES.has(file.type.toLowerCase());
          if (blob && blob.size > 0 && (blob.size <= file.size || !isStandard || file.size > 1_500_000)) {
            finish(blob);
          } else {
            finish(file);
          }
        },
        'image/jpeg',
        0.84
      );
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(file);
    };
    img.src = objectUrl;
  });
}

function uploadViaServerApi(
  payload: Blob,
  kind: 'image' | 'video',
  mimeType: string,
  token: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.timeout = kind === 'image' ? 60_000 : 0;
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Media-Kind', kind);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { url?: string };
          if (data.url) {
            onProgress?.(100);
            resolve(data.url);
            return;
          }
        } catch {
          // fall through
        }
      }
      if (xhr.status === 413) {
        reject(new Error(kind === 'video' ? 'FILE_TOO_LARGE_VIDEO' : 'FILE_TOO_LARGE_IMAGE'));
        return;
      }
      reject(new Error(`UPLOAD_FAILED_${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('UPLOAD_NETWORK_ERROR'));
    xhr.ontimeout = () => reject(new Error('UPLOAD_TIMEOUT'));
    xhr.send(payload);
  });
}

function uploadViaFirebaseStorage(
  payload: Blob,
  kind: 'image' | 'video',
  mimeType: string,
  uid: string,
  origName: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const rawExt = origName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  const ext =
    mimeType === 'image/jpeg'
      ? 'jpg'
      : mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
      ? 'webp'
      : mimeType === 'image/gif'
      ? 'gif'
      : rawExt || (kind === 'video' ? 'mp4' : 'jpg');

  const path = `uploads/${uid}/${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, payload, { contentType: mimeType });
    task.on(
      'state_changed',
      (snap) => {
        if (snap.totalBytes > 0 && onProgress) {
          onProgress(Math.min(99, Math.round((snap.bytesTransferred / snap.totalBytes) * 100)));
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          onProgress?.(100);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function uploadMediaFile(
  file: File,
  kind: 'image' | 'video',
  onProgress?: (percent: number) => void
): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('AUTH_REQUIRED');
  }

  let payload: Blob = file;
  let mimeType = file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg');

  if (kind === 'image') {
    payload = await compressImageFile(file);
    mimeType = payload.type || 'image/jpeg';
    if (payload.size > 10 * 1024 * 1024) {
      throw new Error('FILE_TOO_LARGE_IMAGE');
    }
  } else if (payload.size > 1024 * 1024 * 1024) {
    throw new Error('FILE_TOO_LARGE_VIDEO');
  }

  try {
    const token = await user.getIdToken();
    return await uploadViaServerApi(payload, kind, mimeType, token, onProgress);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'FILE_TOO_LARGE_IMAGE' || msg === 'FILE_TOO_LARGE_VIDEO') {
      throw err;
    }

    // Retry once with refreshed token if 401
    if (msg === 'UPLOAD_FAILED_401') {
      try {
        const freshToken = await user.getIdToken(true);
        return await uploadViaServerApi(payload, kind, mimeType, freshToken, onProgress);
      } catch {
        // Fall through to Firebase Storage
      }
    }

    // Fallback to Firebase Storage cloud upload
    try {
      return await uploadViaFirebaseStorage(
        payload,
        kind,
        mimeType,
        user.uid,
        file.name,
        onProgress
      );
    } catch {
      throw new Error(msg.startsWith('UPLOAD_') ? msg : 'UPLOAD_FAILED');
    }
  }
}
