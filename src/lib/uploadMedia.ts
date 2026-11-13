import { auth } from './firebase';

export async function compressImageFile(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return file;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1280;
      let { width, height } = img;
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
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0 && blob.size < file.size) {
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
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

  const token = await user.getIdToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.timeout = 0;
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
    xhr.send(payload);
  });
}
