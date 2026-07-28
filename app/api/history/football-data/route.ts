import { NextResponse } from "next/server";
import { competitionByCode } from "../../../../lib/competition-catalog";
import { importHistoryMatches } from "../../../../lib/history-store";
import { downloadFootballDataSeason } from "../../../../lib/football-data-history";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { competitions?: string[]; seasons?: string[] };
    const codes = body.competitions || ["EPL", "BUN", "BUN2", "ECH", "ISA", "FL1", "FL2", "LL"];
    const seasons = body.seasons || ["2023-24", "2024-25", "2025-26"];
    if (codes.length > 20 || seasons.length > 10) return NextResponse.json({ error: "批量范围过大。" }, { status: 400 });
    const results = []; const failures: string[] = [];
    for (const code of codes) {
      const competition = competitionByCode(code);
      if (!competition) { failures.push(`未知赛事：${code}`); continue; }
      for (const season of seasons) {
        try {
          const parsed = await downloadFootballDataSeason(competition, season);
          results.push(await importHistoryMatches({ ...parsed, source: "Football-Data.co.uk", season, fileName: `football-data-${season}-${code}.csv` }));
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `${code} ${season} 导入失败`);
        }
      }
    }
    return NextResponse.json({ source: "Football-Data.co.uk", requested: codes.length * seasons.length,
      succeeded: results.length, imported: results.reduce((sum, item) => sum + item.imported, 0),
      skipped: results.reduce((sum, item) => sum + item.skipped, 0), failures });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Football-Data 导入失败。" }, { status: 502 });
  }
}
