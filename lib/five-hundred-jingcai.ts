import { resolveCompetition } from "./competition-catalog";

export type MarketOption = { label: string; value: string; odds: string };
export type JingcaiMarkets = {
  winDrawLoss: MarketOption[];
  handicap: { line: string; options: MarketOption[] };
  score: MarketOption[];
  totalGoals: MarketOption[];
  halfFull: MarketOption[];
};

export type FiveHundredJingcaiMatch = {
  id: string;
  matchNumber: string;
  league: string;
  competitionCode: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  odds: { home: string; draw: string; away: string } | null;
  markets: JingcaiMarkets;
};

function attribute(fragment: string, name: string) {
  return fragment.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1]?.trim() || "";
}

function matchBlocks(html: string) {
  const starts = [...html.matchAll(/<tr[^>]*data-infomatchid=/gi)].map((match) => match.index || 0);
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function optionsOf(block: string, type: string) {
  const elements = block.match(new RegExp(`<[^>]*data-type="${type}"[^>]*>`, "gi")) || [];
  return elements.map((element) => {
    const value = attribute(element, "data-value");
    return { label: labelOf(type, value), value, odds: attribute(element, "data-sp") };
  }).filter((option) => option.value && option.odds && option.odds !== "-");
}

function labelOf(type: string, value: string) {
  if (type === "nspf" || type === "spf") return value === "3" ? "主胜" : value === "1" ? "平" : "客胜";
  if (type === "jqs") return value === "7" ? "7+" : value + "球";
  if (type === "bqc") {
    const label: Record<string, string> = { "3": "胜", "1": "平", "0": "负" };
    const [half, full] = value.split("-");
    return `${label[half] || half}/${label[full] || full}`;
  }
  return value.replace(":", "-");
}

async function fetchPlayPage(date: string, playid?: number) {
  const query = playid ? `playid=${playid}&g=2&date=${encodeURIComponent(date)}` : `date=${encodeURIComponent(date)}`;
  const response = await fetch(`https://trade.500.com/jczq/?${query}`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Referer: "https://trade.500.com/jczq/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    },
    cf: { cacheTtl: 60 },
  } as RequestInit);
  if (!response.ok) throw new Error(`500彩票网竞彩页面返回 ${response.status}`);
  return new TextDecoder("gbk").decode(await response.arrayBuffer());
}

async function fetchJinaMatches(date: string): Promise<FiveHundredJingcaiMatch[]> {
  const response = await fetch(`https://r.jina.ai/http://trade.500.com/jczq/?date=${encodeURIComponent(date)}`, {
    headers: { Accept: "text/plain" },
    cf: { cacheTtl: 300 },
  } as RequestInit);
  if (!response.ok) return [];
  const markdown = await response.text();
  const pattern = /\[(周[^\]]+\d{3})\]\(javascript:[^)]*\)\[([^\]]+)\]\(https:\/\/liansai\.500\.com\/zuqiu-[^)]+\)(\d{2}-\d{2})\s+(\d{2}:\d{2})[\s\S]*?\[([^\]]+)\]\(https:\/\/liansai\.500\.com\/team\/[^)]+\)[\s\S]*?_\[(?:\d+:\d+|VS)\]\(https:\/\/odds\.500\.com\/fenxi\/shuju-(\d+)\.shtml\)_\[([^\]]+)\]\(https:\/\/liansai\.500\.com\/team\/[^)]+\)/g;
  const year = Number(date.slice(0, 4));
  return [...markdown.matchAll(pattern)].map((item) => {
    const competition = resolveCompetition(item[2]);
    if (!competition) return null;
    const month = Number(item[3].slice(0, 2));
    const baseMonth = Number(date.slice(5, 7));
    const kickoffYear = baseMonth === 12 && month === 1 ? year + 1 : year;
    return {
      id: item[6],
      matchNumber: item[1],
      league: competition.nameZh,
      competitionCode: competition.code,
      homeTeam: item[5],
      awayTeam: item[7],
      kickoff: `${kickoffYear}-${item[3]} ${item[4]}`,
      odds: null,
      markets: emptyMarkets(""),
    };
  }).filter((match): match is FiveHundredJingcaiMatch => Boolean(match));
}

function emptyMarkets(line: string): JingcaiMarkets {
  return { winDrawLoss: [], handicap: { line, options: [] }, score: [], totalGoals: [], halfFull: [] };
}
export async function getFiveHundredJingcaiMatches(date: string, includeMarkets = true): Promise<FiveHundredJingcaiMatch[]> {
  let mainHtml = await fetchPlayPage(date);
  if (!matchBlocks(mainHtml).length) mainHtml = await fetchPlayPage(date, 269);
  if (!matchBlocks(mainHtml).length && !includeMarkets) return fetchJinaMatches(date);
  const scoreHtml = includeMarkets ? await fetchPlayPage(date, 271) : "";
  const goalsHtml = includeMarkets ? await fetchPlayPage(date, 270) : "";
  const halfFullHtml = includeMarkets ? await fetchPlayPage(date, 272) : "";
  const pageMaps = [scoreHtml, goalsHtml, halfFullHtml].map((html) =>
    new Map(matchBlocks(html).map((block) => [attribute(block, "data-infomatchid"), block])),
  );

  const matches = matchBlocks(mainHtml).map((row) => {
    const leagueName = attribute(row, "data-simpleleague");
    const competition = resolveCompetition(leagueName);
    if (!competition) return null;
    const id = attribute(row, "data-infomatchid") || attribute(row, "data-fixtureid");
    const homeTeam = attribute(row, "data-homesxname");
    const awayTeam = attribute(row, "data-awaysxname");
    const matchDate = attribute(row, "data-matchdate");
    const matchTime = attribute(row, "data-matchtime");
    if (!id || !homeTeam || !awayTeam || !matchDate || !matchTime) return null;

    const winDrawLoss = optionsOf(row, "nspf");
    const handicapOptions = optionsOf(row, "spf");
    const score = optionsOf(pageMaps[0].get(id) || "", "bf");
    const totalGoals = optionsOf(pageMaps[1].get(id) || "", "jqs");
    const halfFull = optionsOf(pageMaps[2].get(id) || "", "bqc");
    return {
      id,
      matchNumber: attribute(row, "data-matchnum") || "竞彩",
      league: competition.nameZh,
      competitionCode: competition.code,
      homeTeam,
      awayTeam,
      kickoff: `${matchDate} ${matchTime}`,
      odds: winDrawLoss.length === 3
        ? { home: winDrawLoss[0].odds, draw: winDrawLoss[1].odds, away: winDrawLoss[2].odds }
        : null,
      markets: {
        winDrawLoss,
        handicap: { line: attribute(row, "data-rangqiu"), options: handicapOptions },
        score,
        totalGoals,
        halfFull,
      },
    };
  }).filter((match): match is FiveHundredJingcaiMatch => Boolean(match));

  return [...new Map(matches.map((match) => [match.id, match])).values()];
}