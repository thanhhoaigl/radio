export class ApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status = 500, retryable = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export async function fetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, options);
  const rawText = await res.text();
  const trimmed = rawText.trim();

  let data: any = null;
  if (trimmed) {
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      throw new ApiError(
        res.status >= 500
          ? `Máy chủ phản hồi quá lâu hoặc đang quá tải (HTTP ${res.status}). Vui lòng thử bấm tạo lại sau vài giây.`
          : `Phiên kết nối vừa được làm mới hoặc máy chủ đang cập nhật (HTTP ${res.status}). Vui lòng tải lại trang (F5) rồi thử lại.`,
        res.status,
        true
      );
    }
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new ApiError(
        `Phản hồi từ máy chủ không đúng định dạng JSON (HTTP ${res.status}). Vui lòng thử lại.`,
        res.status,
        res.status >= 500
      );
    }
  }

  if (!res.ok) {
    const isRetryable = Boolean(data?.retryable) || [429, 502, 503, 504].includes(res.status);
    throw new ApiError(
      data?.error || `Lỗi máy chủ (HTTP ${res.status}). Vui lòng thử lại.`,
      res.status,
      isRetryable
    );
  }

  return data as T;
}

export async function fetchSseResult<T = any>(
  url: string,
  payload: Record<string, any>,
  onStatus?: (message: string) => void
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify({ ...payload, stream: true }),
  });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  // Handle non-streaming JSON or unexpected HTML responses
  if (!contentType.includes('text/event-stream')) {
    const rawText = await res.text();
    const trimmed = rawText.trim();
    if (!trimmed) {
      throw new ApiError(`Máy chủ trả về phản hồi trống (HTTP ${res.status}). Vui lòng thử lại.`, res.status, true);
    }
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      throw new ApiError(
        res.status >= 500
          ? `Máy chủ phản hồi quá lâu hoặc đang quá tải (HTTP ${res.status}). Vui lòng thử bấm tạo lại sau vài giây.`
          : `Phiên kết nối vừa được làm mới hoặc máy chủ đang cập nhật (HTTP ${res.status}). Vui lòng tải lại trang (F5) rồi thử lại.`,
        res.status,
        true
      );
    }
    let data: any;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new ApiError(`Phản hồi từ máy chủ không đúng định dạng JSON (HTTP ${res.status}).`, res.status, true);
    }
    if (!res.ok) {
      throw new ApiError(
        data?.error || `Lỗi máy chủ (HTTP ${res.status}). Vui lòng thử lại.`,
        res.status,
        Boolean(data?.retryable) || [429, 502, 503, 504].includes(res.status)
      );
    }
    return data as T;
  }

  // Parse SSE stream
  if (!res.body) {
    throw new ApiError('Trình duyệt không hỗ trợ đọc luồng dữ liệu từ máy chủ.', 500, true);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let resultData: T | null = null;

  const processBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue; // skip keepalive comments
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join('\n');
    let parsed: any;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return;
    }

    if (eventName === 'status' && parsed?.message) {
      onStatus?.(parsed.message);
    } else if (eventName === 'complete') {
      resultData = parsed as T;
    } else if (eventName === 'error') {
      throw new ApiError(
        parsed?.error || 'Không thể tạo kịch bản từ AI.',
        parsed?.status || 500,
        Boolean(parsed?.retryable)
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || '';
    for (const part of parts) {
      processBlock(part);
    }
  }

  if (buffer.trim()) {
    processBlock(buffer);
  }

  if (!resultData) {
    throw new ApiError('Kết nối AI bị ngắt giữa chừng trước khi nhận đủ kịch bản. Vui lòng thử lại.', 504, true);
  }

  return resultData;
}
