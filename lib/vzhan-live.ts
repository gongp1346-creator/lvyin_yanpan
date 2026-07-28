type MatchInput = { homeTeam: string; awayTeam: string };

export type VzhanLiveResult = {
  status: string;
  homeScore: number;
  awayScore: number;
  source: "V站";
  sourceUrl: string;
};

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/aik/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function stripHtml(html: string) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function namesMatch(url: string, match: MatchInput) {
  const decoded = normalize(decodeURIComponent(url));
  const home = normalize(match.homeTeam);
  const away = normalize(match.awayTeam);
  const homeMatched = decoded.includes(home) || home.includes(decoded.split("vs")[0].split("live").at(-1) || "-");
  const awayMatched = decoded.includes(away) || [...away].length >= 3 && decoded.includes([...away].slice(-3).join(""));
  return homeMatched && awayMatched;
}

export async function getVzhanLiveResult(match: MatchInput): Promise<VzhanLiveResult | null> {
  try {
    const sitemapResponse = await fetch("https://www.vzhan310.com/sitemap/football.xml", {
      headers: { Accept: "text/xml", "User-Agent": "Mozilla/5.0" },
      cf: { cacheTtl: 60 },
    } as RequestInit);
    if (!sitemapResponse.ok) return null;
    const sitemap = await sitemapResponse.text();
    const urls = [...sitemap.matchAll(/<loc>(https:\/\/www\.vzhan310\.com\/football-match\/live-[^<]+)<\/loc>/g)].map((item) => item[1]);
    const sourceUrl = urls.find((url) => namesMatch(url, match));
    if (!sourceUrl) return null;
    const response = await fetch(sourceUrl, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
      cf: { cacheTtl: 30 },
    } as RequestInit);
    if (!response.ok) return null;
    const text = stripHtml(await response.text());
    const statusMatch = text.match(/(\u5b8c\u573a|\u52a0\u65f6|\u70b9\u7403\u5927\u6218|\u4e0b\u534a\u573a|\u4e2d\u573a|\u4e0a\u534a\u573a|\u8fdb\u884c\u4e2d|\u672a\u5f00\u8d5b)/);
    if (!statusMatch) return null;
    const context = text.slice(Math.max(0, statusMatch.index! - 260), statusMatch.index! + 120);
    const scoreCandidates = [...context.matchAll(/(\d+)\s*[:：-]\s*(\d+)/g)];
    const score = scoreCandidates.at(-1);
    if (!score) return null;
    const status = statusMatch[1];    return { status, homeScore: Number(score[1]), awayScore: Number(score[2]), source: "V站", sourceUrl };
  } catch {
    return null;
  }
}
