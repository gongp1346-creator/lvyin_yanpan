type MatchInput = {
  competitionCode: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
};

export type EspnResult = {
  status: string;
  homeScore: number;
  awayScore: number;
  source: "ESPN";
  sourceUrl: string;
  halfTimeScore: string;
  goals: MatchEvent[];
  cards: MatchEvent[];
};

export type MatchEvent = { type: "goal" | "yellow-card" | "red-card"; minute: string; player: string; team: string };

const ESPN_LEAGUES: Record<string, string> = {
  J1: "jpn.1",
  EPL: "eng.1",
  BUN: "ger.1",
  BUN2: "ger.2",
  ECH: "eng.2",
  ISA: "ita.1",
  FL1: "fra.1",
  FL2: "fra.2",
  LL: "esp.1",
  NOR: "nor.1",
  SWE: "swe.1",
  FIN: "fin.1",
  K1: "kor.1",
  MLS: "usa.1",
  BSA: "bra.1",
  UCL: "uefa.champions",
  UEL: "uefa.europa",
};

type AnyRecord = Record<string, any>;
const record = (value: unknown): AnyRecord => typeof value === "object" && value !== null ? value as AnyRecord : {};

export async function getEspnResult(match: MatchInput): Promise<EspnResult | null> {
  const league = ESPN_LEAGUES[match.competitionCode];
  if (!league) return null;
  const kickoff = new Date(`${match.kickoff.replace(" ", "T")}+08:00`);
  if (Number.isNaN(kickoff.getTime())) return null;
  const date = kickoff.toISOString().slice(0, 10).replaceAll("-", "");
  const sourceUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${date}`;

  try {
    const response = await fetch(sourceUrl, { cf: { cacheTtl: 60 } } as RequestInit);
    if (!response.ok) return null;
    const payload = record(await response.json());
    const events = Array.isArray(payload.events) ? payload.events.map(record) : [];
    const candidates = events.filter((event) => {
      const eventTime = new Date(String(event.date || ""));
      return !Number.isNaN(eventTime.getTime()) && Math.abs(eventTime.getTime() - kickoff.getTime()) <= 20 * 60 * 1000;
    });
    if (candidates.length !== 1) return null;

    const event = candidates[0];
    const competition = record(Array.isArray(event.competitions) ? event.competitions[0] : null);
    const competitors = Array.isArray(competition.competitors) ? competition.competitors.map(record) : [];
    const home = competitors.find((team) => team.homeAway === "home");
    const away = competitors.find((team) => team.homeAway === "away");
    const homeScore = Number(home?.score);
    const awayScore = Number(away?.score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

    const statusType = record(record(event.status).type);
    const completed = statusType.completed === true || String(statusType.state) === "post";
    const eventId = String(event.id || "");
    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${eventId}`;
    const summaryResponse = eventId ? await fetch(summaryUrl, { cf: { cacheTtl: 300 } } as RequestInit) : null;
    const summary = summaryResponse?.ok ? record(await summaryResponse.json()) : {};
    const headerCompetition = record(Array.isArray(record(summary.header).competitions) ? record(summary.header).competitions[0] : null);
    const summaryCompetitors = Array.isArray(headerCompetition.competitors) ? headerCompetition.competitors.map(record) : [];
    const summaryHome = summaryCompetitors.find((team) => team.homeAway === "home");
    const summaryAway = summaryCompetitors.find((team) => team.homeAway === "away");
    const homeHalf = record(Array.isArray(summaryHome?.linescores) ? summaryHome.linescores[0] : null).displayValue;
    const awayHalf = record(Array.isArray(summaryAway?.linescores) ? summaryAway.linescores[0] : null).displayValue;
    const halfTimeScore = homeHalf !== undefined && awayHalf !== undefined ? `${homeHalf}-${awayHalf}` : "";

    const keyEvents = Array.isArray(summary.keyEvents) ? summary.keyEvents.map(record) : [];
    const mappedEvents = keyEvents.map((item): MatchEvent | null => {
      const type = String(record(item.type).type || "");
      if (type !== "goal" && type !== "yellow-card" && type !== "red-card") return null;
      const participant = record(Array.isArray(item.participants) ? item.participants[0] : null);
      return {
        type: type as MatchEvent["type"],
        minute: String(record(item.clock).displayValue || ""),
        player: String(record(participant.athlete).displayName || ""),
        team: String(record(item.team).displayName || ""),
      };
    }).filter((item): item is MatchEvent => Boolean(item?.player));

    return {
      status: completed ? "完场" : String(statusType.description || "进行中"),
      homeScore,
      awayScore,
      source: "ESPN",
      sourceUrl: summaryResponse?.ok ? summaryUrl : sourceUrl,
      halfTimeScore,
      goals: mappedEvents.filter((item) => item.type === "goal"),
      cards: mappedEvents.filter((item) => item.type === "yellow-card" || item.type === "red-card"),
    };
  } catch {
    return null;
  }
}