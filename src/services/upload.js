const UPLOAD_TIMEOUT = 120000;

export async function uploadFile(file, { type, semester } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

  const headers = {
    'Content-Type': 'application/pdf',
    'X-Upload-Type': type,
    'X-Filename': file.name,
  };

  if (type === 'notes' && semester) {
    headers['X-Semester'] = semester;
  }

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers,
      body: file,
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      const message = data?.error || 'Upload failed';
      if (/unauthorized/i.test(message)) {
        throw new Error('Upload service is not configured. Please contact the administrator.');
      }
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Upload timed out');
    }

    if (error instanceof TypeError) {
      throw new Error('Could not reach the upload service');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
