export type CompetitionGroup = "europe_leagues" | "supplemental_leagues" | "continental" | "domestic_cups";

export type CompetitionDefinition = {
  code: string;
  nameZh: string;
  nameEn: string;
  group: CompetitionGroup;
  country?: string;
  csvCode?: string;
  apiFootballId?: number;
  aliases: string[];
};

export const COMPETITION_CATALOG: CompetitionDefinition[] = [
  { code: "J1", nameZh: "日职联", nameEn: "J1 League", group: "supplemental_leagues", country: "Japan", apiFootballId: 98, aliases: ["日职联", "日职", "日职甲", "日本职业足球甲级联赛", "j1", "j1 league", "japan j1 league"] },
  { code: "EPL", nameZh: "英超", nameEn: "Premier League", group: "europe_leagues", country: "England", csvCode: "E0", apiFootballId: 39, aliases: ["英超", "英格兰超级联赛", "epl", "premier league", "e0"] },
  { code: "BUN", nameZh: "德甲", nameEn: "Bundesliga", group: "europe_leagues", country: "Germany", csvCode: "D1", apiFootballId: 78, aliases: ["德甲", "德国甲级联赛", "bundesliga", "d1"] },
  { code: "BUN2", nameZh: "德乙", nameEn: "2. Bundesliga", group: "europe_leagues", country: "Germany", csvCode: "D2", apiFootballId: 79, aliases: ["德乙", "德国乙级联赛", "2 bundesliga", "bundesliga 2", "d2"] },
  { code: "ECH", nameZh: "英冠", nameEn: "Championship", group: "europe_leagues", country: "England", csvCode: "E1", apiFootballId: 40, aliases: ["英冠", "英格兰冠军联赛", "championship", "efl championship", "e1"] },
  { code: "ISA", nameZh: "意甲", nameEn: "Serie A", group: "europe_leagues", country: "Italy", csvCode: "I1", apiFootballId: 135, aliases: ["意甲", "意大利甲级联赛", "italy serie a", "serie a italy", "i1"] },
  { code: "FL1", nameZh: "法甲", nameEn: "Ligue 1", group: "europe_leagues", country: "France", csvCode: "F1", apiFootballId: 61, aliases: ["法甲", "法国甲级联赛", "ligue 1", "f1"] },
  { code: "FL2", nameZh: "法乙", nameEn: "Ligue 2", group: "europe_leagues", country: "France", csvCode: "F2", apiFootballId: 62, aliases: ["法乙", "法国乙级联赛", "ligue 2", "f2"] },
  { code: "LL", nameZh: "西甲", nameEn: "La Liga", group: "europe_leagues", country: "Spain", csvCode: "SP1", apiFootballId: 140, aliases: ["西甲", "西班牙甲级联赛", "la liga", "primera division", "sp1"] },
  { code: "NOR", nameZh: "挪超", nameEn: "Eliteserien", group: "supplemental_leagues", country: "Norway", apiFootballId: 103, aliases: ["挪超", "挪威超级联赛", "eliteserien", "norway eliteserien"] },
  { code: "SWE", nameZh: "瑞典超", nameEn: "Allsvenskan", group: "supplemental_leagues", country: "Sweden", apiFootballId: 113, aliases: ["瑞典超", "瑞典超级联赛", "瑞超", "allsvenskan"] },
  { code: "FIN", nameZh: "芬超", nameEn: "Veikkausliiga", group: "supplemental_leagues", country: "Finland", apiFootballId: 244, aliases: ["芬超", "芬兰超级联赛", "veikkausliiga"] },
  { code: "K1", nameZh: "韩K联", nameEn: "K League 1", group: "supplemental_leagues", country: "South-Korea", apiFootballId: 292, aliases: ["韩k", "韩k联", "韩职", "韩国k联赛", "韩国职业联赛", "k league 1", "kleague1"] },
  { code: "MLS", nameZh: "美职联", nameEn: "Major League Soccer", group: "supplemental_leagues", country: "USA", apiFootballId: 253, aliases: ["美职联", "美职足", "美国职业大联盟", "美国职业足球大联盟", "mls", "major league soccer"] },
  { code: "BSA", nameZh: "巴甲", nameEn: "Brazil Serie A", group: "supplemental_leagues", country: "Brazil", apiFootballId: 71, aliases: ["巴甲", "巴西甲级联赛", "brasileirao", "brazil serie a"] },
  { code: "UCL", nameZh: "欧冠", nameEn: "UEFA Champions League", group: "continental", apiFootballId: 2, aliases: ["欧冠", "欧洲冠军联赛", "uefa champions league", "champions league", "ucl"] },
  { code: "ACL", nameZh: "亚冠", nameEn: "AFC Champions League", group: "continental", apiFootballId: 17, aliases: ["亚冠", "亚洲冠军联赛", "亚冠精英联赛", "afc champions league", "afc champions league elite"] },
  { code: "UEL", nameZh: "欧联杯 / 欧罗巴", nameEn: "UEFA Europa League", group: "continental", apiFootballId: 3, aliases: ["欧联杯", "欧罗巴", "欧洲联盟杯", "uefa europa league", "europa league", "uel"] },

  { code: "JEC", nameZh: "日本天皇杯", nameEn: "Emperor Cup", group: "domestic_cups", country: "Japan", apiFootballId: 99, aliases: ["日本天皇杯", "天皇杯", "emperor cup"] },
  { code: "JLC", nameZh: "日本联赛杯", nameEn: "J-League Cup", group: "domestic_cups", country: "Japan", apiFootballId: 101, aliases: ["日本联赛杯", "日联杯", "j league cup"] },
  { code: "FAC", nameZh: "英格兰足总杯", nameEn: "FA Cup", group: "domestic_cups", country: "England", apiFootballId: 45, aliases: ["英格兰足总杯", "英足总杯", "fa cup"] },
  { code: "EFL", nameZh: "英格兰联赛杯", nameEn: "League Cup", group: "domestic_cups", country: "England", apiFootballId: 48, aliases: ["英格兰联赛杯", "英联杯", "efl cup", "league cup"] },
  { code: "DFB", nameZh: "德国杯", nameEn: "DFB Pokal", group: "domestic_cups", country: "Germany", apiFootballId: 81, aliases: ["德国杯", "dfb pokal"] },
  { code: "CIT", nameZh: "意大利杯", nameEn: "Coppa Italia", group: "domestic_cups", country: "Italy", apiFootballId: 137, aliases: ["意大利杯", "coppa italia"] },
  { code: "CDF", nameZh: "法国杯", nameEn: "Coupe de France", group: "domestic_cups", country: "France", apiFootballId: 66, aliases: ["法国杯", "coupe de france"] },
  { code: "CDR", nameZh: "西班牙国王杯", nameEn: "Copa del Rey", group: "domestic_cups", country: "Spain", apiFootballId: 143, aliases: ["西班牙国王杯", "国王杯", "copa del rey"] },
  { code: "NMC", nameZh: "挪威杯", nameEn: "NM Cupen", group: "domestic_cups", country: "Norway", apiFootballId: 104, aliases: ["挪威杯", "nm cupen", "norwegian cup"] },
  { code: "SVC", nameZh: "瑞典杯", nameEn: "Svenska Cupen", group: "domestic_cups", country: "Sweden", apiFootballId: 116, aliases: ["瑞典杯", "svenska cupen"] },
  { code: "SUC", nameZh: "芬兰杯", nameEn: "Suomen Cup", group: "domestic_cups", country: "Finland", apiFootballId: 245, aliases: ["芬兰杯", "suomen cup"] },
  { code: "KFAC", nameZh: "韩国足总杯", nameEn: "Korean FA Cup", group: "domestic_cups", country: "South-Korea", apiFootballId: 293, aliases: ["韩国足总杯", "韩足总杯", "korean fa cup"] },
  { code: "USOC", nameZh: "美国公开杯", nameEn: "US Open Cup", group: "domestic_cups", country: "USA", apiFootballId: 257, aliases: ["美国公开杯", "美公开杯", "us open cup"] },
  { code: "CDB", nameZh: "巴西杯", nameEn: "Copa Do Brasil", group: "domestic_cups", country: "Brazil", apiFootballId: 73, aliases: ["巴西杯", "copa do brasil"] },
];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s._/()（）·-]+/g, "");
}

const COMPETITION_LOOKUP = new Map<string, CompetitionDefinition>();
for (const competition of COMPETITION_CATALOG) {
  const values = [competition.code, competition.nameZh, competition.nameEn, competition.csvCode, ...competition.aliases];
  for (const value of values) {
    if (value) COMPETITION_LOOKUP.set(normalize(value), competition);
  }
}

export function competitionByCode(code: string) {
  return COMPETITION_CATALOG.find((competition) => competition.code === code) || null;
}

export function resolveCompetition(value: string) {
  return COMPETITION_LOOKUP.get(normalize(value)) || null;
}

export function competitionLabel(code: string) {
  return competitionByCode(code)?.nameZh || code;
}

export function competitionsInGroup(group: CompetitionGroup) {
  return COMPETITION_CATALOG.filter((competition) => competition.group === group);
}
