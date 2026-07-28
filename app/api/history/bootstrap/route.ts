import { NextResponse } from "next/server";
import { competitionsInGroup } from "../../../../lib/competition-catalog";
import { importHistoryCsv } from "../../../../lib/history-store";

const ALLOWED_SEASONS: Record<string, string> = {
  "2023-24": "2324",
  "2024-25": "2425",
  "2025-26": "2526",
};
const LEAGUES = competitionsInGroup("europe_leagues")
  .map((competition) => competition.csvCode)
  .filter((code): code is string => Boolean(code));

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { season?: string };
    const season = body.season || "";
    const sourceSeason = ALLOWED_SEASONS[season];
    if (!sourceSeason) {
      return NextResponse.json({ error: "暂不支持该赛季的一键导入。" }, { status: 400 });
    }

    const downloads = await Promise.all(
      LEAGUES.map(async (league) => {
        const url = `https://www.football-data.co.uk/mmz4281/${sourceSeason}/${league}.csv`;
        const response = await fetch(url, {
          headers: { Accept: "text/csv" },
          cf: { cacheTtl: 3600 },
        } as RequestInit);
        if (!response.ok) throw new Error(`${league} 数据下载失败（${response.status}）。`);
        const text = await response.text();
        if (!text.includes("HomeTeam") || !text.includes("AwayTeam")) {
          throw new Error(`${league} 文件格式无效。`);
        }
        return { league, text };
      }),
    );

    const results = [];
    for (const download of downloads) {
      results.push(
        await importHistoryCsv({
          text: download.text,
          source: "football-data.co.uk",
          season,
          fileName: `${season}-${download.league}.csv`,
        }),
      );
    }

    return NextResponse.json({
      season,
      imported: results.reduce((sum, result) => sum + result.imported, 0),
      skipped: results.reduce((sum, result) => sum + result.skipped, 0),
      invalid: results.reduce((sum, result) => sum + result.invalid, 0),
      excluded: results.reduce((sum, result) => sum + result.excluded, 0),
      competitions: LEAGUES.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "一键导入失败，请稍后重试。" },
      { status: 502 },
    );
  }
}
