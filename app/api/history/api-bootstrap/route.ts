import { NextResponse } from "next/server";
import { downloadApiFootballSeason } from "../../../../lib/api-football-history";
import { competitionsInGroup, type CompetitionGroup } from "../../../../lib/competition-catalog";
import { importHistoryMatches } from "../../../../lib/history-store";

const ALLOWED_GROUPS = new Set<CompetitionGroup>(["supplemental_leagues", "continental", "domestic_cups"]);
const ALLOWED_SEASONS = new Set([2024, 2025, 2026]);

export async function POST(request: Request) {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) return NextResponse.json({ error: "API-Football 尚未配置。" }, { status: 503 });
    const body = (await request.json()) as { group?: CompetitionGroup; season?: number };
    const group = body.group;
    const season = Number(body.season);
    if (!group || !ALLOWED_GROUPS.has(group) || !ALLOWED_SEASONS.has(season)) {
      return NextResponse.json({ error: "导入组或赛季不在允许范围内。" }, { status: 400 });
    }

    const competitions = competitionsInGroup(group);
    const downloads: Array<{
      competition: (typeof competitions)[number];
      parsed?: Awaited<ReturnType<typeof downloadApiFootballSeason>>;
      error?: string;
    }> = [];

    for (const competition of competitions) {
      if (downloads.length) await new Promise((resolve) => setTimeout(resolve, 6_500));
      try {
        downloads.push({ competition, parsed: await downloadApiFootballSeason(competition, season, apiKey) });
      } catch (error) {
        downloads.push({ competition, error: error instanceof Error ? error.message : `${competition.nameZh}下载失败。` });
      }
    }

    const results = [];
    for (const download of downloads) {
      if (!download.parsed) continue;
      results.push(await importHistoryMatches({
        ...download.parsed,
        source: "API-Football",
        season: String(season),
        fileName: `api-football-${season}-${download.competition.code}.json`,
      }));
    }
    const failures = downloads.filter((download) => download.error).map((download) => download.error as string);
    if (!results.length && failures.length) {
      return NextResponse.json({ error: failures.join("；") }, { status: 502 });
    }

    return NextResponse.json({
      group,
      season,
      competitions: competitions.length,
      succeeded: results.length,
      imported: results.reduce((sum, result) => sum + result.imported, 0),
      skipped: results.reduce((sum, result) => sum + result.skipped, 0),
      invalid: results.reduce((sum, result) => sum + result.invalid, 0),
      failures,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "API补充导入失败，请稍后重试。" },
      { status: 502 },
    );
  }
}
