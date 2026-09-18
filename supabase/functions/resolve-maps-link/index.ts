import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SITE_ORIGIN = "https://morrow-trip-planner.yoonjintar0.chatgpt.site";
const ALLOWED_ORIGINS = new Set([SITE_ORIGIN, "https://yoonjintar0-commits.github.io"]);
const allowedHost = (host: string) => host === "maps.app.goo.gl" || host === "goo.gl" || /^(www\.|maps\.)?google\.(com|co\.kr|co\.jp|co\.uk|com\.au|ca|de|fr|it|es|co\.in|com\.tw|com\.hk|com\.sg)$/i.test(host);
const allowedUrl = (url: URL) => url.protocol === "https:" && !url.username && !url.password && !url.port && allowedHost(url.hostname) && (url.hostname === "maps.app.goo.gl" || url.pathname.startsWith("/maps") || url.hostname.startsWith("maps.google."));
const headers = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin",
});

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST 요청만 지원합니다." }), { status: 405, headers: headers(origin) });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(JSON.stringify({ error: "허용되지 않은 출처입니다." }), { status: 403, headers: headers(origin) });

  try {
    const body = await request.json();
    let current = new URL(String(body?.url || ""));
    if (!allowedUrl(current) || current.href.length > 8192) throw new Error("Google Maps 링크만 사용할 수 있습니다.");

    for (let hop = 0; hop < 6; hop += 1) {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 MorrowLinkResolver/1.0", "Accept": "text/html" },
      });
      await response.body?.cancel();
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) break;
      const next = new URL(location, current);
      if (!allowedUrl(next)) throw new Error("링크가 Google Maps 외부로 이동했습니다.");
      current = next;
    }

    return new Response(JSON.stringify({ url: current.toString() }), { status: 200, headers: headers(origin) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "링크를 확인하지 못했습니다.";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: headers(origin) });
  }
});
