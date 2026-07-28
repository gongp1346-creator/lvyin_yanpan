import { NextResponse } from "next/server";
import { getImportedResultsByDate } from "../../../../lib/history-store";

function dateInShanghai(offset: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const requestedDate = new URL(request.url).searchParams.get("date") || "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : dateInShanghai(-1);
  let matches: any[] = await getImportedResultsByDate(date).catch(() => []);
  if (!matches.length && new URL(request.url).hostname.endsWith("edgeone.cool")) {
    try {
      const origin = `https://pitch-intelligence.gongp1346.workers.dev/api/history/results?date=${date}`;
      const response = await fetch(origin, { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
      if (response.ok) {
        const payload = await response.json() as { matches?: unknown[] };
        matches = Array.isArray(payload.matches) ? payload.matches : [];
      }
    } catch {
      // Keep an empty result when the shared origin is unavailable.
    }
  }
  return NextResponse.json({ source: "Cloudflare D1 历史库", date, checkedAt: new Date().toISOString(), matches }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
}