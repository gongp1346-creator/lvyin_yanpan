import { parseHistoricalCsv } from "./history-csv";
import type { CompetitionDefinition } from "./competition-catalog";

function seasonCode(season: string) {
  const match = season.match(/^(\d{4})[-/]?(\d{2,4})$/);
  if (!match) throw new Error(`无效赛季：${season}`);
  return `${match[1].slice(2)}${match[2].slice(-2)}`;
}

export async function downloadFootballDataSeason(competition: CompetitionDefinition, season: string) {
  if (!competition.csvCode) throw new Error(`${competition.nameZh}暂无Football-Data CSV代码。`);
  const code = seasonCode(season);
  const url = `https://www.football-data.co.uk/mmz4281/${code}/${competition.csvCode}.csv`;
  const response = await fetch(url, { headers: { "user-agent": "pitch-intelligence-history/1.0" } });
  if (!response.ok) throw new Error(`${competition.nameZh} ${season} 下载失败（HTTP ${response.status}）。`);
  const text = await response.text();
  if (!text.includes("HomeTeam") || !text.includes("AwayTeam")) throw new Error(`${competition.nameZh} ${season} 返回内容不是比赛 CSV。`);
  return parseHistoricalCsv(text, {
    source: "Football-Data.co.uk",
    season,
    fileName: `football-data-${season}-${competition.csvCode}.csv`,
  });
}
