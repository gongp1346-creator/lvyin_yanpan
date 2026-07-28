import { NextResponse } from "next/server";
import { resolveCompetition } from "../../../lib/competition-catalog";
import { collectFootballEvidence } from "../../../lib/football-data";
import { getHistoricalModelEstimate, saveModelPrediction } from "../../../lib/history-store";
import { getMarketMovement } from "../../../lib/market-store";

type AnalysisRequest = {
  homeTeam?: string;
  awayTeam?: string;
  competition?: string;
  kickoff?: string;
  brief?: string;
  odds?: { home?: string | number; draw?: string | number; away?: string | number } | null;
};

type RawAnalysis = {
  summary?: unknown;
  recommendation?: unknown;
  confidenceIndex?: unknown;
  marketSignal?: {
    status?: unknown;
    reasoning?: unknown;
    timingAdvice?: unknown;
    watchPoints?: unknown;
  };
  uniqueInsight?: unknown;
  probabilities?: {
    homeWin?: unknown;
    draw?: unknown;
    awayWin?: unknown;
  };
  likelyScores?: unknown;
  keyFactors?: unknown;
  risks?: unknown;
  confidence?: unknown;
  knownFacts?: unknown;
  missingInformation?: unknown;
  sources?: unknown;
  disclaimer?: unknown;
};

const SYSTEM_PROMPT = `你是“绿茵研判”，一个严谨的足球赛前分析助手。

原则：
1. 只能把用户明确提供的材料，以及提示中标注为“API-Football 已核验数据”的内容当作已知事实。不得补写数据源没有返回的伤停、首发、赔率、天气或裁判信息。
2. 必须区分“第三方数据源事实”“用户提供的事实”“分析推断”“缺失信息”。材料不足或数据覆盖不完整时降低置信度。
3. 不得自行生成主胜、平局、客胜概率。概率由外部历史模型决定；你只负责解释证据和不确定性。
4. 历史交锋仅低权重。不得使用“稳胆、必胜、稳赚”等措辞。
5. 列出最重要的正反因素、反方情景和会改变判断的新信息。
6. 推荐方向必须简洁，可使用“主队不败、客队不败、主胜方向、客胜方向、平局倾向、观望”。证据不足时必须选择“观望”。
7. 只有输入中存在明确的初盘、即时盘、让球和水位数值，才能判断是否诱盘；否则 marketSignal.status 必须为“证据不足”。不得把常规升降盘自动解释为操盘意图。
8. 独特见解必须指出一个具体的错配、反常点或容易忽略的变量；没有证据时说明还需要什么信息，不能编造机构意图。
9. 输出必须是合法 JSON，不要使用 Markdown 代码围栏，不要添加 JSON 之外的文字。
10. 采用有二十年看盘经验的老玩家思路：先看基本面是否支持盘口，再看欧亚定价是否一致，最后看开盘、即时盘、临场盘与水位变化是否有真实信息支撑。表达要直接、克制、讲人话，但不得冒充真实人物或虚构经验。
11. 不确定时绝不抢跑下结论。若距离开赛仍早、首发未出、盘口分歧较大或变盘尚未确认，recommendation 必须为“观望”，并明确给出应在什么时间复核、届时观察哪些数值。
12. 临盘信息优先级高于空泛印象，但不能只凭一次跳盘判断。至少比较两个可核验时间点；若没有开盘与即时/临场的成对数据，只能说明当前定价，不得判断资金意图或诱盘。
13. “诱盘”只能作为风险嫌疑，不得作为确定事实。必须说明反证条件：什么后续变化会推翻当前怀疑。
14. 结论分为三个档位：观望、明确方向、强信号。数据闸门未通过或证据冲突时只能观望；历史模型、阵容事实与市场变化同向时必须给出明确方向；只有独立模型概率优势明显、关键阵容已确认、至少两个盘口时间点同向且不存在重大反证时，才可标记强信号。
15. 达到明确方向或强信号门槛后，summary 第一段必须先说结论，使用“这场我直接站……”“这场看……不败”等直观措辞，不得使用“可能、或许、似乎、倾向于”等模糊表达；随后立即给出最关键的三条证据和一个止损条件。
16. “让球胜”“大胜”“至少赢两球”属于净胜球强结论，必须有经过校准的净胜球概率分布、真实让球盘及临场阵容共同支持。当前材料不具备这些证据时不得输出，不得用胜平负优势代替净胜球证据。
17. 强口吻不能改变概率与证据门槛。用户希望结论果断，不代表允许夸大置信度；该等的时候明确等，该出手的时候只给一个主方向，不罗列互相冲突的选择。

18. 每天北京时间20:30前必须形成阶段性结论，不能因为首发尚未公布而不输出报告。首发缺失时，必须基于已核验的历史、盘口和基本面给出明确方向或观望，并把“首发待确认”列为风险；首发公布后再触发临场复核。\nJSON 格式：
{
  "summary": "一句话结论",
  "recommendation": "客队（球队名）不败 / 主队方向 / 观望",
  "confidenceIndex": 1到10的整数,
  "marketSignal": {"status": "存在|不存在|证据不足", "reasoning": "盘口判断及依据", "timingAdvice": "现在判断或等待到具体赛前阶段", "watchPoints": ["下一次复核必须观察的盘口、水位或阵容指标"]},
  "uniqueInsight": "一条具体、可验证的反常点或关键错配",
  "likelyScores": [{"score": "1–0", "note": "理由"}],
  "keyFactors": [{"label": "因素", "direction": "home|away|neutral", "detail": "说明"}],
  "risks": ["风险或反方情景"],
  "confidence": "低|中|高",
  "knownFacts": ["列出用户材料和 API-Football 已核验事实"],
  "missingInformation": ["对判断重要但当前缺失的信息"],
  "sources": [{"title": "用户提供的来源或材料名称", "url": "可选 URL", "asOf": "可选时间"}],
  "disclaimer": "预测有误差，不构成投资或博彩建议；请遵守当地法律并设置预算上限。"
}`;

const textArray = (value: unknown, fallback: string[]) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .slice(0, 8)
    : fallback;

const stringValue = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const numberValue = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

const confidenceIndex = (value: unknown, maximum: number) =>
  Math.min(maximum, Math.max(1, Math.round(numberValue(value) || 1)));

function normalizeProbabilities(probabilities: RawAnalysis["probabilities"]) {
  const values = [
    numberValue(probabilities?.homeWin),
    numberValue(probabilities?.draw),
    numberValue(probabilities?.awayWin),
  ];
  const total = values.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return { homeWin: 34, draw: 33, awayWin: 33 };
  }

  const normalized = values.map((value) => Math.round((value / total) * 100));
  const difference = 100 - normalized.reduce((sum, value) => sum + value, 0);
  normalized[0] += difference;

  return {
    homeWin: normalized[0],
    draw: normalized[1],
    awayWin: normalized[2],
  };
}

function stripCodeFence(content: string) {
  return content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractOfficialOdds(value: string) {
  const match = value.match(/(?:胜平负\s*SP|竞彩\s*SP|官方胜平负SP)[^\d]*(?:主胜)?\s*(\d+(?:\.\d+)?)[^\d]+(?:平)?\s*(\d+(?:\.\d+)?)[^\d]+(?:客胜)?\s*(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const [home, draw, away] = match.slice(1).map(Number);
  if ([home, draw, away].some((number) => !Number.isFinite(number) || number <= 1)) return undefined;
  return { home, draw, away };
}

function validateOdds(value: AnalysisRequest["odds"]) {
  if (!value) return undefined;
  const odds = { home: Number(value.home), draw: Number(value.draw), away: Number(value.away) };
  return Object.values(odds).every((number) => Number.isFinite(number) && number > 1) ? odds : undefined;
}

export async function POST(request: Request) {
  let body: AnalysisRequest;

  try {
    body = (await request.json()) as AnalysisRequest;
  } catch {
    return NextResponse.json(
      { error: "请求格式无效。", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const homeTeam = body.homeTeam?.trim();
  const awayTeam = body.awayTeam?.trim();
  const competitionDefinition = resolveCompetition(body.competition?.trim() || "");
  const competition = competitionDefinition?.nameZh || "";
  const kickoff = body.kickoff?.trim() || "待确认";
  const brief = body.brief?.trim() || "用户没有提供额外数据。";
  const hasMarketEvidence = /(?:初盘|即时盘|临场盘|盘口|让球|水位|升盘|降盘|升水|降水|欧赔|竞彩\s*SP)/i.test(brief) && /\d/.test(brief);
  const briefHasMarketMovementEvidence = /(?:初盘|开盘)/.test(brief) && /(?:即时盘|临场盘|升盘|降盘|升水|降水)/.test(brief) && /\d/.test(brief);
  const officialOdds = validateOdds(body.odds) || extractOfficialOdds(brief);

  if (!homeTeam || !awayTeam) {
    return NextResponse.json(
      { error: "请同时填写主队和客队。", code: "MISSING_TEAMS" },
      { status: 400 },
    );
  }

  if (!competitionDefinition) {
    return NextResponse.json(
      { error: "该赛事不在当前竞彩目标白名单内。", code: "COMPETITION_NOT_ALLOWED" },
      { status: 400 },
    );
  }

  const apiKey =
    process.env.DEEPSEEK_API_KEY || process.env.deepseek_key;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "当前是安全演示模式：服务器尚未配置 DeepSeek API Key。配置后即可生成真实 AI 报告。",
        code: "DEEPSEEK_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const footballEvidence = await collectFootballEvidence({
    homeTeam,
    awayTeam,
    competition,
    kickoff,
  });
  const historicalEstimate = await getHistoricalModelEstimate({
    homeTeam,
    awayTeam,
    competition: competitionDefinition.code,
    kickoff,
    odds: officialOdds,
  }).catch(() => ({
    status: "blocked" as const,
    reason: "历史数据库暂时不可用，概率输出已关闭。",
    homeMatches: 0,
    awayMatches: 0,
    headToHead: [],
  }));

  const marketMovement = await getMarketMovement({
    competition: competitionDefinition.code,
    homeTeam,
    awayTeam,
    kickoff,
  }).catch(() => ({ status: "missing" as const, snapshots: 0, summary: "盘口快照库暂时不可用。" }));
  const hasMarketMovementEvidence = briefHasMarketMovementEvidence || marketMovement.status === "ready";

  const headToHeadText = historicalEstimate.headToHead.length
    ? historicalEstimate.headToHead.map((match) =>
        `- ${match.date} ${match.competition}：${match.homeTeam} ${match.homeGoals}-${match.awayGoals} ${match.awayTeam}（来源：${match.source}）`,
      ).join("\n")
    : "- 历史库中未匹配到赛前直接交锋记录。";

  const matchContext = "matchContext" in historicalEstimate ? historicalEstimate.matchContext : null;
  const goalModel = "goalModel" in historicalEstimate ? historicalEstimate.goalModel : null;
  const goalModelText = goalModel?.status === "ready"
    ? `- 模型版本：${goalModel.version}\n- 预期进球：主队${goalModel.expectedGoals.home}、客队${goalModel.expectedGoals.away}\n- 胜平负：主胜${goalModel.probabilities.homeWin}%、平${goalModel.probabilities.draw}%、客胜${goalModel.probabilities.awayWin}%\n- 大2.5球：${goalModel.probabilities.over25}%\n- 双方进球：${goalModel.probabilities.bothTeamsScore}%\n- 主队净胜2+：${goalModel.probabilities.homeWinBy2Plus}%\n- 客队净胜2+：${goalModel.probabilities.awayWinBy2Plus}%\n- 高概率比分：${goalModel.likelyScores.map((item) => `${item.score}（${item.probability}%）`).join("、")}\n- 样本与方法：${goalModel.reason}`
    : `- 状态：未通过净胜球模型门槛\n- 原因：${goalModel?.reason || "历史比分数据不足"}`;

  const matchContextText = matchContext?.status === "ready"
    ? `- 主队：第${matchContext.home.rank}/${matchContext.home.teams}名，${matchContext.home.played}场${matchContext.home.points}分，净胜球${matchContext.home.goalDifference}，预计剩余${matchContext.home.estimatedRemaining}场；压力：${matchContext.home.pressure.join("；")}；休息${matchContext.home.schedule.restDays ?? "--"}天，近14天${matchContext.home.schedule.matchesLast14}场；风险：${matchContext.home.risks.join("；") || "未识别到密集赛程风险"}\n- 客队：第${matchContext.away.rank}/${matchContext.away.teams}名，${matchContext.away.played}场${matchContext.away.points}分，净胜球${matchContext.away.goalDifference}，预计剩余${matchContext.away.estimatedRemaining}场；压力：${matchContext.away.pressure.join("；")}；休息${matchContext.away.schedule.restDays ?? "--"}天，近14天${matchContext.away.schedule.matchesLast14}场；风险：${matchContext.away.risks.join("；") || "未识别到密集赛程风险"}\n- 限制：${matchContext.caveat}`
    : `- 状态：战意计算关闭\n- 原因：${matchContext?.reason || "当前赛季数据不足"}`;

  const userPrompt = `请分析以下比赛：
- 主队：${homeTeam}
- 客队：${awayTeam}
- 赛事：${competition}
- 开球时间：${kickoff}

API-Football 已核验数据（状态：${footballEvidence.status}；查询时间：${footballEvidence.checkedAt}）：
${footballEvidence.facts.length ? footballEvidence.facts.map((fact) => `- ${fact}`).join("\n") : "- 本次未取得可用的第三方赛事事实。"}

数据源明确缺失或尚未发布的信息：
${footballEvidence.missing.length ? footballEvidence.missing.map((item) => `- ${item}`).join("\n") : "- 无。"}

用户提供的材料与要求：
${brief}

联赛独立历史模型（这是方向的唯一决策来源）：
${historicalEstimate.status === "ready"
  ? `- 模型版本：${historicalEstimate.modelVersion}\n- 概率：主胜${historicalEstimate.probabilities.homeWin}%、平${historicalEstimate.probabilities.draw}%、客胜${historicalEstimate.probabilities.awayWin}%\n- 最终方向：${historicalEstimate.recommendation}\n- 样本说明：${historicalEstimate.reason}`
  : `- 状态：未通过数据门槛\n- 原因：${historicalEstimate.reason}\n- 最终方向必须为：观望`}

双方赛前最近直接交锋（最多10场，仅作低权重参考）：
${headToHeadText}

赛前积分形势、战意压力与赛程风险：
${matchContextText}
战意纪律：只能使用上述可量化积分压力；杯赛晋级、德比情绪、内部奖金和主观“求胜欲”没有官方证据时必须列为未知，不得编造。

Dixon-Coles净胜球模型：
${goalModelText}
净胜球结论闸门：只有模型状态为ready、相应一方净胜2+概率不低于45%、首发/伤停证据充分且盘口时间序列同向，才允许输出“大胜”或“让球胜”；否则必须关闭该结论。

自动赔率快照：${marketMovement.summary}
盘口证据校验：${hasMarketMovementEvidence ? `已取得至少两个可核验时间点（自动快照${marketMovement.snapshots}个，或用户提供成对盘口），可谨慎判断市场信号。` : "未检测到完整的初盘与即时变化，marketSignal.status 必须为“证据不足”。"}
注意：当前自动源记录的是竞彩胜平负SP和让球胜平负SP；没有亚洲盘上下盘水位时，不得把竞彩SP称为水位。

请严格按照系统指定的 JSON 格式返回。`;

  try {
    const deepSeekResponse = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.25,
          max_tokens: 2400,
        }),
        signal: AbortSignal.timeout(25000),
      },
    );

    if (!deepSeekResponse.ok) {
      const requestId = deepSeekResponse.headers.get("x-request-id");
      return NextResponse.json(
        {
          error: "DeepSeek 暂时未能完成分析，请稍后重试。",
          code: "DEEPSEEK_UPSTREAM_ERROR",
          requestId,
        },
        { status: 502 },
      );
    }

    const payload = (await deepSeekResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("DeepSeek returned an empty response.");
    }

    const raw = JSON.parse(stripCodeFence(content)) as RawAnalysis;
    const now = new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Shanghai",
    }).format(new Date());
    const todayShanghai = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
    const matchDate = kickoff.slice(0, 10);
    const beforeDailyCutoff = matchDate === todayShanghai;
    const recommendation = historicalEstimate.status === "ready"
      ? historicalEstimate.recommendation
      : "观望";
    const evidenceCap = historicalEstimate.status === "ready"
      ? footballEvidence.status === "verified" && hasMarketMovementEvidence ? 9
        : footballEvidence.status === "verified" ? 8
          : footballEvidence.status === "partial" && hasMarketMovementEvidence ? 8
            : footballEvidence.status === "partial" ? 7 : 6
      : footballEvidence.status === "verified" ? 5 : 4;
    const marketStatus = hasMarketMovementEvidence && (raw.marketSignal?.status === "存在" || raw.marketSignal?.status === "不存在")
      ? raw.marketSignal.status
      : "证据不足";

    await saveModelPrediction({
      homeTeam,
      awayTeam,
      competition: competitionDefinition.code,
      kickoff,
      recommendation,
      predictedOutcome: historicalEstimate.status === "ready" ? historicalEstimate.predictedOutcome : null,
      probabilities: historicalEstimate.status === "ready" ? historicalEstimate.probabilities : null,
      odds: officialOdds,
      modelVersion: historicalEstimate.status === "ready" ? historicalEstimate.modelVersion : undefined,
    }).catch(() => undefined);

    return NextResponse.json({
      mode: "live",
      analyzedAt: `生成于 ${now}`,
      model,
      match: {
        home: homeTeam,
        away: awayTeam,
        competition,
        kickoff,
      },
      summary: stringValue(
        raw.summary,
        "当前材料不足以形成可靠倾向，请补充近期表现、伤停与阵容信息。",
      ),
      recommendation,
      confidenceIndex: confidenceIndex(raw.confidenceIndex, evidenceCap),
      marketSignal: {
        status: marketStatus,
        reasoning: marketStatus === "证据不足"
          ? "这会儿盘口证据还没走完整，先别急着站队。没有可核验的初盘、即时盘和水位变化，不能硬说存在诱盘。"
          : stringValue(raw.marketSignal?.reasoning, "盘口已经给出方向，但还要等临场变化确认，不能只看一次跳盘。"),
        timingAdvice: stringValue(
          raw.marketSignal?.timingAdvice,
          hasMarketMovementEvidence ? "开赛前30分钟结合首发和临场水位再复核一次。" : "等到开赛前30至60分钟，补齐即时让球、水位和首发后再判断。",
        ),
        watchPoints: textArray(raw.marketSignal?.watchPoints, [
          "让球盘是否继续升降，以及上盘水位是否同步变化",
          "欧赔主胜与亚洲盘方向是否一致",
          "首发、核心伤停和临场阵型是否支持盘口变化",
        ]).slice(0, 5),
      },
      uniqueInsight: stringValue(
        raw.uniqueInsight,
        "暂未发现有数据支撑的明显错配；补充盘口变化、预计首发和伤停后再判断。",
      ),
      probabilities:
        historicalEstimate.status === "ready"
          ? historicalEstimate.probabilities
          : null,
      decisionGate: {
        status: historicalEstimate.status === "ready" ? "ready" : "blocked",
        reason: historicalEstimate.reason,
        model: historicalEstimate.status === "ready" ? historicalEstimate.modelVersion : "联赛独立融合模型",
      },
      likelyScores: Array.isArray(raw.likelyScores)
        ? raw.likelyScores
            .filter(
              (item): item is { score?: unknown; note?: unknown } =>
                typeof item === "object" && item !== null,
            )
            .slice(0, 3)
            .map((item) => ({
              score: stringValue(item.score, "待定"),
              note: stringValue(item.note, "信息不足"),
            }))
        : [{ score: "待定", note: "缺少足够数据" }],
      keyFactors: Array.isArray(raw.keyFactors)
        ? raw.keyFactors
            .filter(
              (
                item,
              ): item is {
                label?: unknown;
                direction?: unknown;
                detail?: unknown;
              } => typeof item === "object" && item !== null,
            )
            .slice(0, 5)
            .map((item) => ({
              label: stringValue(item.label, "未命名因素"),
              direction:
                item.direction === "home" || item.direction === "away"
                  ? item.direction
                  : "neutral",
              detail: stringValue(item.detail, "暂无进一步说明"),
            }))
        : [
            {
              label: "信息完整度",
              direction: "neutral",
              detail: "当前材料不足。",
            },
          ],
      risks: textArray(raw.risks, ["信息不足会显著放大预测误差。"]),
      confidence:
        raw.confidence === "高" || raw.confidence === "中"
          ? raw.confidence
          : "低",
      knownFacts: [
        ...new Set([
          ...(historicalEstimate.status === "ready" ? [historicalEstimate.reason] : []),
          ...footballEvidence.facts,
          ...textArray(raw.knownFacts, ["用户提供了比赛双方。"]),
        ]),
      ].slice(0, 24),
      missingInformation: [
        ...new Set([
          ...footballEvidence.missing,
          ...textArray(raw.missingInformation, [
            "预计首发",
            "近期 xG 与赛程",
          ]),
        ]),
      ].slice(0, 12),
      sources: [
        ...footballEvidence.sources,
        ...(Array.isArray(raw.sources)
        ? raw.sources
            .filter(
              (
                item,
              ): item is { title?: unknown; url?: unknown; asOf?: unknown } =>
                typeof item === "object" && item !== null,
            )
            .slice(0, 8)
            .map((item) => ({
              title: stringValue(item.title, "用户提供的材料"),
              ...(typeof item.url === "string" && /^https?:\/\//.test(item.url)
                ? { url: item.url }
                : {}),
              ...(typeof item.asOf === "string" && item.asOf.trim()
                ? { asOf: item.asOf.trim() }
                : {}),
            }))
        : []),
      ].slice(0, 10),
      dataCoverage: {
        provider: footballEvidence.provider,
        status: footballEvidence.status,
        seasons: footballEvidence.seasons,
        checkedAt: footballEvidence.checkedAt,
        requestCount: footballEvidence.requestCount,
        factsFound: footballEvidence.facts.length,
        plan: footballEvidence.plan,
      },
      disclaimer: stringValue(
        raw.disclaimer,
        "预测有误差，不构成投资或博彩建议；请遵守当地法律并设置预算上限。",
      ),
    });
  } catch {
    return NextResponse.json(
      {
        error: "模型返回内容无法解析，请稍后重试。",
        code: "ANALYSIS_PARSE_ERROR",
      },
      { status: 502 },
    );
  }
}
