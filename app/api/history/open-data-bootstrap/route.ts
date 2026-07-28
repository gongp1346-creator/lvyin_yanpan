import { NextResponse } from "next/server";
import { competitionsInGroup, type CompetitionGroup } from "../../../../lib/competition-catalog";
import { importHistoryMatches } from "../../../../lib/history-store";
import { downloadSportsDbSeason } from "../../../../lib/thesportsdb-history";

const ALLOWED_GROUPS = new Set<CompetitionGroup>(["supplemental_leagues", "continental", "domestic_cups"]);
const ALLOWED_YEARS = new Set([2024, 2025, 2026]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { group?: CompetitionGroup; year?: number };
    const group = body.group;
    const year = Number(body.year);
    if (!group || !ALLOWED_GROUPS.has(group) || !ALLOWED_YEARS.has(year)) {
      return NextResponse.json({ error: "导入分组或年份不在允许范围内。" }, { status: 400 });
    }
    const competitions = competitionsInGroup(group);
    const results = [];
    const failures: string[] = [];
    for (const competition of competitions) {
      const seasons = group === "supplemental_leagues"
        ? [String(year), `${year}-${year + 1}`]
        : [`${year}-${year + 1}`, String(year)];
      let imported = false;
      for (const season of seasons) {
        try {
          const parsed = await downloadSportsDbSeason(competition, season);
          results.push(await importHistoryMatches({ ...parsed, source: "TheSportsDB", season, fileName: `thesportsdb-${season}-${competition.code}.json` }));
          imported = true;
          break;
        } catch (error) {
          if (season === seasons.at(-1)) failures.push(error instanceof Error ? error.message : `${competition.nameZh}导入失败`);
        }
      }
      if (!imported) continue;
    }
    return NextResponse.json({ group, year, competitions: competitions.length, succeeded: results.length,
      imported: results.reduce((sum, result) => sum + result.imported, 0),
      skipped: results.reduce((sum, result) => sum + result.skipped, 0), failures });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "公开历史数据导入失败。" }, { status: 502 });
  }
}
