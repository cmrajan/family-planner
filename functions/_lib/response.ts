interface ApiErrorBody {
  code: string;
  message: string;
}

export function jsonOk<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonError(
  code: string,
  message: string,
  status = 400
): Response {
  const body: ApiErrorBody = { code, message };
  return new Response(JSON.stringify({ ok: false, error: body }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonErrorWithData<T>(
  code: string,
  message: string,
  data: T,
  status = 400
): Response {
  const body: ApiErrorBody = { code, message };
  return new Response(JSON.stringify({ ok: false, error: body, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
