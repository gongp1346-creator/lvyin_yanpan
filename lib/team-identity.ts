type AliasEntry = readonly [canonical: string, ...aliases: string[]];

// Sporttery uses Chinese display names while historical providers generally use
// English names. Keep this registry deterministic so a fixture always resolves
// to the same historical team key.
const TEAM_IDENTITIES: AliasEntry[] = [
  ["KuPS", "库奥皮奥", "Kuopion Palloseura", "KuPS Kuopio"],
  ["Sabah", "萨巴赫", "Sabah FK", "Sabah Baku"],
  ["Hajduk Split", "哈伊杜克", "HNK Hajduk Split"],
  ["Bodo/Glimt", "博德闪耀", "Bodø/Glimt", "Bodo Glimt"],
  ["Omonia", "奥莫尼亚", "Omonia Nicosia", "AC Omonia"],
  ["Hacken", "哈肯", "BK Hacken", "BK Häcken"],
  ["Arsenal", "阿森纳"],
  ["Aston Villa", "阿斯顿维拉", "维拉"],
  ["Bournemouth", "伯恩茅斯"],
  ["Brentford", "布伦特福德"],
  ["Brighton", "布赖顿", "布莱顿"],
  ["Burnley", "伯恩利"],
  ["Chelsea", "切尔西"],
  ["Crystal Palace", "水晶宫"],
  ["Everton", "埃弗顿"],
  ["Fulham", "富勒姆"],
  ["Leeds", "利兹联", "利兹"],
  ["Liverpool", "利物浦"],
  ["Manchester City", "曼城", "Man City"],
  ["Manchester United", "曼联", "Man United", "Man Utd"],
  ["Newcastle", "纽卡斯尔", "纽卡斯尔联", "Newcastle Utd"],
  ["Nottingham Forest", "诺丁汉森林", "诺丁汉林"],
  ["Sunderland", "桑德兰"],
  ["Tottenham", "热刺", "托特纳姆热刺", "Tottenham Hotspur"],
  ["West Ham", "西汉姆联", "西汉姆"],
  ["Wolves", "狼队", "伍尔弗汉普顿", "Wolverhampton Wanderers"],

  ["Bayern Munich", "拜仁", "拜仁慕尼黑", "Bayern München"],
  ["Dortmund", "多特蒙德", "Borussia Dortmund"],
  ["Leverkusen", "勒沃库森", "Bayer Leverkusen"],
  ["RB Leipzig", "莱比锡红牛", "莱比锡", "RasenBallsport Leipzig"],
  ["Eintracht Frankfurt", "法兰克福"],
  ["Freiburg", "弗赖堡", "弗莱堡"],
  ["Stuttgart", "斯图加特"],
  ["Wolfsburg", "沃尔夫斯堡"],
  ["Werder Bremen", "云达不来梅", "不来梅"],
  ["Mainz", "美因茨", "Mainz 05"],
  ["Augsburg", "奥格斯堡"],
  ["Hoffenheim", "霍芬海姆"],
  ["Borussia M'gladbach", "门兴", "门兴格拉德巴赫", "Borussia Monchengladbach"],
  ["Union Berlin", "柏林联合"],

  ["Real Madrid", "皇马", "皇家马德里"],
  ["Barcelona", "巴萨", "巴塞罗那"],
  ["Atletico Madrid", "马竞", "马德里竞技", "Atlético Madrid"],
  ["Athletic Bilbao", "毕尔巴鄂竞技", "毕尔巴鄂"],
  ["Real Sociedad", "皇家社会"],
  ["Villarreal", "比利亚雷亚尔"],
  ["Real Betis", "皇家贝蒂斯", "贝蒂斯"],
  ["Sevilla", "塞维利亚"],
  ["Valencia", "巴伦西亚", "瓦伦西亚"],
  ["Celta Vigo", "塞尔塔", "维戈塞尔塔"],
  ["Getafe", "赫塔费"],
  ["Osasuna", "奥萨苏纳"],
  ["Mallorca", "马略卡"],
  ["Girona", "赫罗纳", "吉罗纳"],

  ["Inter", "国际米兰", "国米", "Inter Milan", "Inter Milano", "Inter Milán", "Internazionale"],
  ["AC Milan", "AC米兰", "米兰"],
  ["Juventus", "尤文图斯", "尤文"],
  ["Napoli", "那不勒斯"],
  ["Roma", "罗马", "AS Roma"],
  ["Lazio", "拉齐奥"],
  ["Atalanta", "亚特兰大"],
  ["Fiorentina", "佛罗伦萨"],
  ["Bologna", "博洛尼亚"],
  ["Torino", "都灵"],
  ["Genoa", "热那亚"],

  ["Paris Saint Germain", "巴黎圣日耳曼", "巴黎", "Paris SG", "Paris St Germain", "PSG"],
  ["Marseille", "马赛", "Olympique Marseille"],
  ["Lyon", "里昂", "Olympique Lyonnais"],
  ["Monaco", "摩纳哥", "AS Monaco"],
  ["Lille", "里尔"],
  ["Nice", "尼斯"],
  ["Lens", "朗斯"],
  ["Rennes", "雷恩"],
  ["Strasbourg", "斯特拉斯堡"],

  ["Kawasaki Frontale", "川崎前锋"],
  ["Yokohama F. Marinos", "横滨水手", "横滨F水手", "Yokohama F Marinos"],
  ["Kashima Antlers", "鹿岛鹿角"],
  ["Urawa", "浦和红钻", "Urawa Red Diamonds"],
  ["Vissel Kobe", "神户胜利船"],
  ["Sanfrecce Hiroshima", "广岛三箭"],
  ["Gamba Osaka", "大阪钢巴"],
  ["Cerezo Osaka", "大阪樱花"],
  ["FC Tokyo", "东京FC", "FC东京"],
  ["Nagoya Grampus", "名古屋鲸八"],
  ["Kashiwa Reysol", "柏太阳神"],
  ["Shonan Bellmare", "湘南海洋"],
  ["Albirex Niigata", "新潟天鹅"],
  ["Avispa Fukuoka", "福冈黄蜂"],
  ["Machida Zelvia", "町田泽维亚"],

  ["Ulsan Hyundai FC", "蔚山HD", "蔚山现代", "Ulsan HD"],
  ["Jeonbuk Motors", "全北现代", "全北现代汽车", "Jeonbuk Hyundai Motors"],
  ["Pohang Steelers", "浦项制铁"],
  ["FC Seoul", "首尔FC", "FC首尔"],
  ["Suwon FC", "水原FC"],
  ["Gangwon FC", "江原FC"],
  ["Gimcheon Sangmu FC", "金泉尚武"],

  ["Inter Miami", "迈阿密国际"],
  ["Los Angeles FC", "洛杉矶FC", "LAFC"],
  ["Los Angeles Galaxy", "洛杉矶银河", "LA Galaxy"],
  ["New York City FC", "纽约城"],
  ["New York Red Bulls", "纽约红牛"],
  ["Seattle Sounders", "西雅图海湾人"],
  ["Columbus Crew", "哥伦布机员"],
  ["Atlanta United FC", "亚特兰大联"],

  ["Flamengo", "弗拉门戈"],
  ["Palmeiras", "帕尔梅拉斯"],
  ["Sao Paulo", "圣保罗", "São Paulo"],
  ["Corinthians", "科林蒂安"],
  ["Santos", "桑托斯"],
  ["Fluminense", "弗鲁米嫩塞"],
  ["Botafogo", "博塔弗戈"],
  ["Gremio", "格雷米奥", "Grêmio"],
  ["Internacional", "巴西国际"],
  ["Atletico-MG", "米内罗竞技", "Atlético Mineiro"],
  ["Cruzeiro", "克鲁塞罗"],
  ["Chapecoense-SC", "沙佩科恩斯", "Chapecoense"],
];

function rawKey(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

const aliasToCanonical = new Map<string, string>();
for (const [canonical, ...aliases] of TEAM_IDENTITIES) {
  for (const value of [canonical, ...aliases]) aliasToCanonical.set(rawKey(value), canonical);
}

export function canonicalTeamName(value: string) {
  const clean = value.trim();
  return aliasToCanonical.get(rawKey(clean)) || clean;
}

export function normalizeTeamKey(value: string) {
  return rawKey(canonicalTeamName(value));
}

export function teamIdentityKnown(value: string) {
  return aliasToCanonical.has(rawKey(value));
}
