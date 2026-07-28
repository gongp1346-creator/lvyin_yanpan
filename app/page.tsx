"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { COMPETITION_CATALOG, resolveCompetition } from "../lib/competition-catalog";
import HistoryCenter from "./history-center";

type AnalysisResult = {
  mode: "demo" | "live";
  analyzedAt: string;
  model: string;
  match: {
    home: string;
    away: string;
    competition: string;
    kickoff: string;
  };
  summary: string;
  recommendation: string;
  confidenceIndex: number;
  marketSignal: {
    status: "存在" | "不存在" | "证据不足";
    reasoning: string;
    timingAdvice: string;
    watchPoints: string[];
  };
  uniqueInsight: string;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
  } | null;
  decisionGate: {
    status: "blocked" | "ready";
    reason: string;
    model: string;
  };
  likelyScores: Array<{ score: string; note: string }>;
  keyFactors: Array<{
    label: string;
    direction: "home" | "away" | "neutral";
    detail: string;
  }>;
  risks: string[];
  confidence: "低" | "中" | "高";
  knownFacts: string[];
  missingInformation: string[];
  sources: Array<{ title: string; url?: string; asOf?: string }>;
  dataCoverage?: {
    provider: string;
    status: "verified" | "partial" | "unavailable";
    seasons: string[];
    checkedAt: string;
    requestCount: number;
    factsFound: number;
    plan?: string;
  };
  disclaimer: string;
};

type MarketOption = { label: string; value: string; odds: string };
type JingcaiMarkets = {
  winDrawLoss: MarketOption[];
  handicap: { line: string; options: MarketOption[] };
  score: MarketOption[];
  totalGoals: MarketOption[];
  halfFull: MarketOption[];
};
type JingcaiMatch = {
  id: string;
  matchNumber: string;
  league: string;
  competitionCode: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  odds: { home: string; draw: string; away: string } | null;
  markets?: JingcaiMarkets;
  live?: { status: string; homeScore: number; awayScore: number; source: string; sourceUrl: string } | null;
};

type JingcaiResult = {
  id: string;
  matchNumber: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  halfTimeScore: string;
  fullTimeScore: string;
  result: string;
  status: string;
  goals?: Array<{ minute: string; player: string; team: string }>;
  cards?: Array<{ minute: string; player: string; team: string; type: string }>;
};

function parseOfficialSchedule(payload: unknown): JingcaiMatch[] {
  const root = typeof payload === "object" && payload !== null ? payload as Record<string, any> : {};
  const value = typeof root.value === "object" && root.value !== null ? root.value as Record<string, any> : {};
  const groups = Array.isArray(value.matchInfoList) ? value.matchInfoList : [];
  return groups.flatMap((groupValue) => {
    const group = typeof groupValue === "object" && groupValue !== null ? groupValue as Record<string, any> : {};
    return Array.isArray(group.subMatchList) ? group.subMatchList : [];
  }).flatMap((matchValue): JingcaiMatch[] => {
    const match = typeof matchValue === "object" && matchValue !== null ? matchValue as Record<string, any> : {};
    if (String(match.matchStatus || "") !== "Selling") return [];
    const definition = resolveCompetition(String(match.leagueAbbName || match.leagueAllName || ""));
    if (!definition) return [];
    const date = String(match.matchDate || "").trim();
    const time = String(match.matchTime || "").trim();
    const combined = date.includes(":") ? date : `${date} ${time}`.trim();
    const normalizedKickoff = combined.replace(" ", "T").slice(0, 16);
    const oddsList = Array.isArray(match.oddsList) ? match.oddsList : [];
    const had = oddsList.find((item) => typeof item === "object" && item !== null && String(item.poolCode).toUpperCase() === "HAD") as Record<string, any> | undefined;
    const homeTeam = String(match.homeTeamAllName || match.homeTeamAbbName || "").trim();
    const awayTeam = String(match.awayTeamAllName || match.awayTeamAbbName || "").trim();
    if (!homeTeam || !awayTeam || !normalizedKickoff) return [];
    return [{
      id: String(match.matchId || match.matchNumStr || `${homeTeam}-${awayTeam}-${normalizedKickoff}`),
      matchNumber: String(match.matchNumStr || "竞彩").trim(),
      league: definition.nameZh,
      competitionCode: definition.code,
      homeTeam,
      awayTeam,
      kickoff: normalizedKickoff,
      odds: had?.h && had?.d && had?.a ? { home: String(had.h), draw: String(had.d), away: String(had.a) } : null,
    }];
  }).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

const demoAnalysis: AnalysisResult = {
  mode: "demo",
  analyzedAt: "演示数据 · 非实时",
  model: "DeepSeek 接口待配置",
  match: {
    home: "—",
    away: "—",
    competition: "",
    kickoff: "",
  },
  summary: "历史基础数据尚未导入，因此演示模式不输出胜平负概率。",
  recommendation: "请选择上方竞彩",
  confidenceIndex: 2,
  marketSignal: {
    status: "证据不足",
    reasoning: "没有实际初盘、即时盘与水位变化，不能判断诱盘。",
    timingAdvice: "等到开赛前30至60分钟，补齐即时让球、水位和首发后再判断。",
    watchPoints: ["让球与水位是否同步变化", "欧亚方向是否一致", "临场首发是否支持盘口"],
  },
  uniqueInsight: "当前最值得关注的不是强弱标签，而是补齐真实盘口变化与赛前阵容后，模型方向是否发生反转。",
  probabilities: null,
  decisionGate: {
    status: "blocked",
    reason: "没有经过时间回测的历史样本，概率输出已关闭。",
    model: "历史Elo基线",
  },
  likelyScores: [
    { score: "2–1", note: "主队创造机会略占优" },
    { score: "1–1", note: "高强度对位下的均衡情景" },
    { score: "1–2", note: "客队反击效率兑现的反方情景" },
  ],
  keyFactors: [
    {
      label: "主场加成",
      direction: "home",
      detail: "示例模型给予主队有限主场优势，不等同于必胜信号。",
    },
    {
      label: "转换进攻",
      direction: "away",
      detail: "客队快速推进会放大主队高位压迫身后的风险。",
    },
    {
      label: "信息完整度",
      direction: "neutral",
      detail: "缺少最新阵容与伤停，本报告只能作为界面和输出结构示范。",
    },
  ],
  risks: [
    "临场首发变化可能显著改变中场控制与进球预期。",
    "比分预测波动最大，不应把单一比分当作主要判断。",
  ],
  confidence: "低",
  knownFacts: ["本页当前展示产品样例，而非实时赛事结论。"],
  missingInformation: ["实时伤停", "预计首发", "近 5–10 场 xG", "赛程与休息天数"],
  sources: [],
  dataCoverage: {
    provider: "API-Football",
    status: "unavailable",
    seasons: [],
    checkedAt: "等待首次查询",
    requestCount: 0,
    factsFound: 0,
    plan: "等待查询",
  },
  disclaimer:
    "演示报告不构成投资或博彩建议。预测存在误差，请遵守当地法律并设置预算上限。",
};

const formatKickoff = (value: string) => {
  if (!value) return "待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

function outcomeOf(score: string) {
  const [home, away] = score.split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return "";
  return home > away ? "胜" : home < away ? "负" : "平";
}

function isMatchStarted(kickoff: string) {
  const normalized = kickoff.includes("T") ? kickoff : kickoff.replace(" ", "T");
  const parsed = new Date(`${normalized}:00+08:00`);
  return !Number.isNaN(parsed.getTime()) && Date.now() >= parsed.getTime();
}

function halfFullResult(halfTimeScore: string, fullTimeScore: string) {
  const half = outcomeOf(halfTimeScore);
  const full = outcomeOf(fullTimeScore);
  return half && full ? `${half}/${full}` : "";
}
export default function Home() {
  const [homeTeam, setHomeTeam] = useState("阿森纳");
  const [awayTeam, setAwayTeam] = useState("利物浦");
  const [competition, setCompetition] = useState("英超");
  const [kickoff, setKickoff] = useState("");
  const [brief, setBrief] = useState(
    "请只依据我提供的事实分析；缺少实时数据时主动降低置信度。",
  );
  const [analysis, setAnalysis] = useState<AnalysisResult>(demoAnalysis);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [dailyMatches, setDailyMatches] = useState<JingcaiMatch[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleCheckedAt, setScheduleCheckedAt] = useState("");
  const [scheduleSource, setScheduleSource] = useState("中国体彩网");
  const [scheduleWarning, setScheduleWarning] = useState("");
  const [yesterdayResults, setYesterdayResults] = useState<JingcaiResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [resultsError, setResultsError] = useState("");
  const [resultsDate, setResultsDate] = useState("");
  const [resultsCheckedAt, setResultsCheckedAt] = useState("");
  const [resultsSource, setResultsSource] = useState("中国体彩网");
  const [resultsWarning, setResultsWarning] = useState("");

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError("");
    setScheduleWarning("");
    try {
      const response = await fetch("/api/jingcai/today", { cache: "no-store" });
      const data = (await response.json()) as { matches?: JingcaiMatch[]; checkedAt?: string; source?: string; warning?: string; error?: string };
      if (response.ok) {
        setDailyMatches(data.matches || []);
        setScheduleCheckedAt(data.checkedAt || new Date().toISOString());
        setScheduleSource(data.source || "中国体彩网");
        setScheduleWarning(data.warning || "");
        return;
      }
      const directResponse = await fetch("https://webapi.sporttery.cn/gateway/uniform/football/getMatchListV1.qry?clientCode=3001", {
        headers: { Accept: "application/json,text/plain,*/*" },
        cache: "no-store",
      });
      if (!directResponse.ok) throw new Error(data.error || `官方接口返回 ${directResponse.status}`);
      const directPayload = await directResponse.json();
      if ((directPayload as { success?: boolean }).success !== true) throw new Error("官方竞彩场次暂未返回有效数据");
      setDailyMatches(parseOfficialSchedule(directPayload));
      setScheduleCheckedAt(new Date().toISOString());
      setScheduleSource("中国体彩网");
    } catch (requestError) {
      setDailyMatches([]);
      setScheduleError(requestError instanceof Error ? requestError.message : "官方竞彩场次同步失败。请稍后刷新。");
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  const loadYesterdayResults = useCallback(async () => {
    setResultsLoading(true);
    setResultsError("");
    setResultsWarning("");
    try {
      const response = await fetch("/api/jingcai/yesterday", { cache: "no-store" });
      const data = await response.json() as { matches?: JingcaiResult[]; date?: string; checkedAt?: string; source?: string; warning?: string; error?: string };
      if (!response.ok) throw new Error(data.error || `官方赛果接口返回 ${response.status}`);
      setYesterdayResults(data.matches || []);
      setResultsDate(data.date || "");
      setResultsCheckedAt(data.checkedAt || new Date().toISOString());
      setResultsSource(data.source || "中国体彩网");
      setResultsWarning(data.warning || "");
    } catch (requestError) {
      setYesterdayResults([]);
      setResultsError(requestError instanceof Error ? requestError.message : "官方竞彩赛果同步失败，请稍后刷新。");
    } finally {
      setResultsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedule();
    void loadYesterdayResults();
    const refreshInterval = 30 * 60 * 1000;
    const scheduleTimer = window.setInterval(() => void loadSchedule(), refreshInterval);
    let lastVisibleRefresh = Date.now();
    const refreshVisiblePage = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibleRefresh < refreshInterval) return;
      lastVisibleRefresh = now;
      void loadSchedule();
    };
    document.addEventListener("visibilitychange", refreshVisiblePage);
    window.addEventListener("focus", refreshVisiblePage);
    return () => {
      window.clearInterval(scheduleTimer);
      document.removeEventListener("visibilitychange", refreshVisiblePage);
      window.removeEventListener("focus", refreshVisiblePage);
    };
  }, [loadSchedule, loadYesterdayResults]);

  async function requestAnalysis(input: {
    homeTeam: string;
    awayTeam: string;
    competition: string;
    kickoff: string;
    brief: string;
    odds?: { home: string; draw: string; away: string } | null;
  }) {
    setError("");
    if (!input.homeTeam.trim() || !input.awayTeam.trim()) {
      setError("请填写主队和客队。");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/analyze", { signal: AbortSignal.timeout(30000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await response.json()) as AnalysisResult | { error?: string; code?: string };
      if (!response.ok) throw new Error("error" in data && data.error ? data.error : "分析服务暂时不可用，请稍后重试。");
      setAnalysis(data as AnalysisResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "分析服务暂时不可用，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestAnalysis({ homeTeam: homeTeam.trim(), awayTeam: awayTeam.trim(), competition: competition.trim(), kickoff, brief: brief.trim() });
  }

  async function analyzeJingcaiMatch(match: JingcaiMatch) {
    const officialBrief = [
      `中国体彩网当前在售竞彩场次：${match.matchNumber}，${match.league}。`,
      match.odds ? `官方胜平负SP：主胜${match.odds.home}，平${match.odds.draw}，客胜${match.odds.away}。` : "官方胜平负SP暂未返回。",
      "请结合真实数据给出极简最终方向；证据不足时结论为观望。",
    ].join("\n");
    setHomeTeam(match.homeTeam);
    setAwayTeam(match.awayTeam);
    setCompetition(match.league);
    setKickoff(match.kickoff);
    setBrief(officialBrief);
    setAnalysis({
      ...demoAnalysis,
      match: { home: match.homeTeam, away: match.awayTeam, competition: match.league, kickoff: match.kickoff },
      recommendation: "分析中…",
    });
    await requestAnalysis({ homeTeam: match.homeTeam, awayTeam: match.awayTeam, competition: match.league, kickoff: match.kickoff, brief: officialBrief, odds: match.odds });
  }

  return (
    <main className="minimal-app">
      <header className="minimal-header">
        <a href="#top" aria-label="绿茵研判首页"><strong>绿茵研判</strong></a>
        <span>只给结论</span>
      </header>

      <section className="minimal-tool" id="top">
        <div className="minimal-intro">
          <p>FOOTBALL DECISION</p>
          <h1>选择今日竞彩，直接看结论。</h1>
        </div>

        <section className="daily-schedule" aria-labelledby="daily-title">
          <div className="daily-heading">
            <div><span>{scheduleSource}</span><h2 id="daily-title">当前在售竞彩</h2></div>
            <button type="button" onClick={loadSchedule} disabled={scheduleLoading}>{scheduleLoading ? "同步中" : "刷新"}</button>
          </div>
          {scheduleLoading ? <p className="schedule-state">正在同步官方在售场次…</p> : scheduleError ? (
            <div className="schedule-state error"><strong>官方场次暂时无法同步</strong><span>{scheduleError}</span><a href="https://www.sporttery.cn/" target="_blank" rel="noreferrer">打开中国体彩网核对</a></div>
          ) : dailyMatches.length ? (
            <div className="match-list">
              {dailyMatches.map((match) => (
                <div className="match-item" key={match.id}>
                  <button className="match-pick" type="button" onClick={() => analyzeJingcaiMatch(match)} disabled={isLoading || isMatchStarted(match.kickoff)}>
                    <span className="match-number">{match.matchNumber}</span>
                    <span className="match-league">{match.league}</span>
                    <strong>{match.homeTeam}<small>VS</small>{match.awayTeam}</strong>
                    <time>{formatKickoff(match.kickoff)}</time>
                    <i>{match.live ? `${match.live.status} ${match.live.homeScore}-${match.live.awayScore}` : isMatchStarted(match.kickoff) ? "已开赛，等待赛果" : "分析"}</i>
                  </button>
                  {match.markets ? (
                    <details className="match-markets">
                      <summary>完整竞彩赔率</summary>
                      <div className="market-group">
                        <b>胜平负</b>
                        <div>{match.markets.winDrawLoss.map((option) => <span key={option.value}>{option.label}<em>{option.odds}</em></span>)}</div>
                      </div>
                      <div className="market-group">
                        <b>让球胜平负（{Number(match.markets.handicap.line) > 0 ? "+" : ""}{match.markets.handicap.line}）</b>
                        <div>{match.markets.handicap.options.map((option) => <span key={option.value}>{option.label}<em>{option.odds}</em></span>)}</div>
                      </div>
                      <div className="market-group market-scroll">
                        <b>比分</b>
                        <div>{match.markets.score.map((option) => <span key={option.value}>{option.label}<em>{option.odds}</em></span>)}</div>
                      </div>
                      <div className="market-group">
                        <b>总进球</b>
                        <div>{match.markets.totalGoals.map((option) => <span key={option.value}>{option.label}<em>{option.odds}</em></span>)}</div>
                      </div>
                      <div className="market-group">
                        <b>半全场</b>
                        <div>{match.markets.halfFull.map((option) => <span key={option.value}>{option.label}<em>{option.odds}</em></span>)}</div>
                      </div>
                      <p>赔率来源：500彩票网 · 以销售截止前最新发布值为准</p>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          ) : <p className="schedule-state">当前没有你指定联赛范围内的在售竞彩。</p>}
          {scheduleWarning ? <p className="schedule-footnote">官方源暂不可用，已自动切换备用真实数据源。</p> : null}
          {scheduleCheckedAt ? <p className="schedule-footnote">数据同步于 {formatKickoff(scheduleCheckedAt)} · 每30分钟自动更新</p> : null}
        </section>

        <details className="manual-entry">
          <summary>手动输入其他比赛</summary>
          <form className="minimal-form" onSubmit={submitAnalysis} aria-labelledby="match-input-title">
          <h2 id="match-input-title">比赛信息</h2>
          <div className="minimal-field-grid">
            <label><span>主队</span><input value={homeTeam} onChange={(event) => setHomeTeam(event.target.value)} placeholder="主队" autoComplete="off" /></label>
            <label><span>客队</span><input value={awayTeam} onChange={(event) => setAwayTeam(event.target.value)} placeholder="客队" autoComplete="off" /></label>
            <label>
              <span>赛事</span>
              <select value={competition} onChange={(event) => setCompetition(event.target.value)}>
                <optgroup label="目标联赛">{COMPETITION_CATALOG.filter((item) => item.group === "europe_leagues" || item.group === "supplemental_leagues").map((item) => <option key={item.code} value={item.nameZh}>{item.nameZh}</option>)}</optgroup>
                <optgroup label="洲际赛事">{COMPETITION_CATALOG.filter((item) => item.group === "continental").map((item) => <option key={item.code} value={item.nameZh}>{item.nameZh}</option>)}</optgroup>
                <optgroup label="主要国内杯赛">{COMPETITION_CATALOG.filter((item) => item.group === "domestic_cups").map((item) => <option key={item.code} value={item.nameZh}>{item.nameZh}</option>)}</optgroup>
              </select>
            </label>
            <label><span>开球时间</span><input type="datetime-local" value={kickoff} onChange={(event) => setKickoff(event.target.value)} /></label>
          </div>

          <details className="optional-data">
            <summary>补充盘口或伤停资料（可选）</summary>
            <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={4} placeholder="可粘贴盘口、水位、伤停或首发资料" />
          </details>

          <button className="minimal-submit" type="submit" disabled={isLoading}>{isLoading ? "分析中…" : "开始分析"}</button>
          </form>
        </details>

        {error && !isLoading ? <p className="minimal-error result-error" role="alert">{error}</p> : null}

        <section className="minimal-result" aria-labelledby="analysis-report-title" aria-busy={isLoading}>
          <div><span>球队</span><strong id="analysis-report-title">{analysis.match.home} <small>VS</small> {analysis.match.away}</strong></div>
          <div><span>时间</span><strong>{formatKickoff(analysis.match.kickoff)}</strong></div>
          <div className="minimal-answer"><span>结论</span><strong>{analysis.recommendation}</strong></div>
          <div className="market-verdict">
            <span>盘口研判 · {analysis.marketSignal.status}</span>
            <p>{analysis.marketSignal.reasoning}</p>
          </div>
          <div className="market-timing">
            <span>什么时候再看</span>
            <strong>{analysis.marketSignal.timingAdvice}</strong>
            <ul>{analysis.marketSignal.watchPoints.map((point) => <li key={point}>{point}</li>)}</ul>
          </div>
        </section>

        <section className="yesterday-results" aria-labelledby="yesterday-results-title">
          <div className="daily-heading">
            <div><span>{resultsSource} · {resultsDate || "昨日"}</span><h2 id="yesterday-results-title">昨日竞彩比赛结果</h2></div>
            <button type="button" onClick={loadYesterdayResults} disabled={resultsLoading}>{resultsLoading ? "同步中" : "刷新"}</button>
          </div>
          {resultsLoading ? <p className="schedule-state">正在同步官方完场赛果...</p> : resultsError ? (
            <div className="schedule-state error"><strong>官方赛果暂时无法同步</strong><span>{resultsError}</span><a href="https://www.sporttery.cn/" target="_blank" rel="noreferrer">打开中国体彩网核对</a></div>
          ) : yesterdayResults.length ? (
            <div className="result-table" role="table" aria-label="昨日竞彩完场赛果">
              {yesterdayResults.map((match) => (
                <div className="result-item" key={match.id}>
                  <div className="result-row" role="row">
                    <span>{match.matchNumber}</span><span>{match.league}</span>
                    <strong><em>{match.homeTeam}</em><b>{match.fullTimeScore}</b><em>{match.awayTeam}</em></strong>
                    <span>{match.halfTimeScore ? `半场 ${match.halfTimeScore} · 半全场 ${halfFullResult(match.halfTimeScore, match.fullTimeScore)}` : "半场 --"}</span>
                    <i>{match.status === "完场" ? match.result : match.status}</i>
                  </div>
                  {(match.goals?.length || match.cards?.length) ? (
                    <details className="match-events">
                      <summary>比赛事件</summary>
                      <div>
                        {match.goals?.map((event, index) => (
                          <span className="goal-event" key={`goal-${index}`}><b>{event.minute}</b>{event.player}<small>{event.team} · 进球</small></span>
                        ))}
                        {match.cards?.map((event, index) => (
                          <span className={event.type === "red-card" ? "red-event" : "yellow-event"} key={`card-${index}`}><b>{event.minute}</b>{event.player}<small>{event.team} · {event.type === "red-card" ? "红牌" : "黄牌"}</small></span>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          ) : <div className="schedule-state"><strong>官方源暂未发布该日完场赛果</strong><span>页面不会使用模拟结果，稍后可点击刷新重新同步。</span></div>}
          {resultsWarning ? <p className="schedule-footnote">官方源暂不可用，当前赛果由备用真实数据源交叉确认。</p> : null}
          {resultsCheckedAt ? <p className="schedule-footnote">数据同步于 {formatKickoff(resultsCheckedAt)} · 同步成功后停止自动更新</p> : null}
        </section>
      </section>

      <details className="data-admin">
        <summary>数据管理</summary>
        <HistoryCenter />
      </details>

      <footer className="minimal-footer"><span>绿茵研判</span><p>结果仅供信息分析，请理性使用。</p></footer>
    </main>
  );
}
