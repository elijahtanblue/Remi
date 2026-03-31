import { NextResponse } from 'next/server';

function isJsonBody(bodyText: string, contentType: string | null) {
  if (contentType?.includes('application/json')) {
    return true;
  }

  try {
    JSON.parse(bodyText);
    return true;
  } catch {
    return false;
  }
}

export async function proxyAdminResponse(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, init);
    const bodyText = await response.text();

    if (!bodyText.trim()) {
      if (response.ok) {
        return new NextResponse(null, { status: response.status });
      }

      return NextResponse.json(
        { error: `Request failed with status ${response.status}` },
        { status: response.status },
      );
    }

    if (isJsonBody(bodyText, response.headers.get('content-type'))) {
      return new NextResponse(bodyText, {
        status: response.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return new NextResponse(bodyText, {
      status: response.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 },
    );
  }
}
