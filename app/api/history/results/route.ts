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
  const matches = await getImportedResultsByDate(date).catch(() => []);
  return NextResponse.json({ source: "Cloudflare D1 历史库", date, checkedAt: new Date().toISOString(), matches }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
}