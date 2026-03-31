export interface DeadLetterActionError {
  error?: string;
}

export interface DeadLetterActionResponse {
  ok: boolean;
  status: number;
  error?: string;
}

type TextResponse = Pick<Response, 'ok' | 'status' | 'text'>;

function parseErrorMessage(bodyText: string, status: number) {
  if (status === 404) {
    return 'Already cleared';
  }

  const trimmed = bodyText.trim();
  if (!trimmed) {
    return `Request failed with status ${status}`;
  }

  try {
    const parsed = JSON.parse(trimmed) as DeadLetterActionError;
    if (typeof parsed?.error === 'string' && parsed.error.length > 0) {
      return parsed.error;
    }
  } catch {
    // Fall back to raw body text when the response is not JSON.
  }

  return trimmed;
}

export async function readDeadLetterActionResponse(
  response: TextResponse,
): Promise<DeadLetterActionResponse> {
  const bodyText = await response.text();

  if (response.ok) {
    return {
      ok: true,
      status: response.status,
    };
  }

  return {
    ok: false,
    status: response.status,
    error: parseErrorMessage(bodyText, response.status),
  };
}
