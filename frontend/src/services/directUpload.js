import api from "./api";

export const UPLOAD_TIMEOUT_MS = 45 * 60 * 1000;

function reportProgress(onProgress, loaded, total) {
  if (onProgress && total > 0) onProgress(Math.round((loaded / total) * 100));
}

function putFileToUrl(uploadUrl, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      reportProgress(onProgress, event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading to storage."));
    xhr.ontimeout = () => reject(new Error("Upload timed out."));
    xhr.send(file);
  });
}

async function uploadViaPresign(presignPath, file, onProgress) {
  try {
    const { data: presign } = await api.post(
      presignPath,
      {
        filename: file.name,
        contentType: file.type || undefined,
        contentLength: file.size,
      },
      { timeout: 30000 }
    );

    if (!presign?.direct || !presign?.uploadUrl) return null;

    try {
      await putFileToUrl(presign.uploadUrl, file, presign.contentType || file.type, onProgress);
      return presign;
    } catch (err) {
      console.warn("Direct storage upload failed; falling back to server upload.", err);
      return null;
    }
  } catch (err) {
    console.warn("Presign request failed; falling back to server upload.", err);
    return null;
  }
}

async function uploadViaBackend(path, fieldName, file, onProgress) {
  const fd = new FormData();
  fd.append(fieldName, file);
  const { data } = await api.post(path, fd, {
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress: (event) => {
      reportProgress(onProgress, event.loaded, event.total);
    },
  });
  return data;
}

export async function uploadLessonVideo(file, { onProgress } = {}) {
  const presign = await uploadViaPresign("/upload/presign/video", file, onProgress);
  if (presign?.video_url) {
    return {
      video_url: presign.video_url,
      filename: presign.filename,
      storageProvider: presign.storageProvider,
    };
  }
  return uploadViaBackend("/upload", "video", file, onProgress);
}

export async function uploadResourceDocumentFile(file, { onProgress } = {}) {
  const presign = await uploadViaPresign("/upload/presign/document", file, onProgress);
  if (presign?.file_url) {
    return {
      file_url: presign.file_url,
      filename: presign.filename,
      storageProvider: presign.storageProvider,
    };
  }
  return uploadViaBackend("/upload/document", "file", file, onProgress);
}
