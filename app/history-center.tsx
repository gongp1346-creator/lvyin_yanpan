"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { COMPETITION_CATALOG, type CompetitionGroup } from "../lib/competition-catalog";

type Summary = {
  total: number;
  completed: number;
  withOdds: number;
  competitions: number;
  seasons: number;
  dateFrom: string | null;
  dateTo: string | null;
  gate: "blocked" | "preliminary" | "foundation";
  gateReason: string;
  coverage: Array<{
    code: string;
    name: string;
    group: CompetitionGroup;
    matches: number;
  }>;
  imports: Array<{
    source: string;
    file_name: string;
    season: string;
    rows_total: number;
    rows_imported: number;
    rows_skipped: number;
    rows_invalid: number;
    created_at: string;
  }>;
};

type Backtest = {
  status: "insufficient" | "preliminary" | "baseline_ready" | "underperforming";
  reason: string;
  totalMatches: number;
  trainingMatches?: number;
  testingMatches?: number;
  dateFrom?: string;
  dateTo?: string;
  calibrationError?: number;
  model?: { samples: number; accuracy: number; brier: number; logLoss: number };
  baseline?: { samples: number; accuracy: number; brier: number; logLoss: number };
  market?: { samples: number; accuracy: number; brier: number; logLoss: number } | null;
  betting?: { bets: number; profit: number; roi: number; maxDrawdown: number };
  perCompetition?: Array<{ competition: string; samples: number; accuracy: number; brier: number; logLoss: number }>;
};

type PredictionAudit = {
  total: number;
  pending: number;
  settled: number;
  correct: number;
  hitRate: number | null;
  profit: number;
  roi: number | null;
};

const percent = (value?: number) => (value === undefined ? "—" : `${(value * 100).toFixed(1)}%`);
const decimal = (value?: number) => (value === undefined ? "—" : value.toFixed(3));

export default function HistoryCenter() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [predictionAudit, setPredictionAudit] = useState<PredictionAudit | null>(null);
  const [source, setSource] = useState("football-data.co.uk");
  const [season, setSeason] = useState("2024-25");
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [summaryResponse, predictionResponse] = await Promise.all([
        fetch("/api/history/summary", { cache: "no-store" }),
        fetch("/api/history/predictions", { cache: "no-store" }),
      ]);
      if (!summaryResponse.ok) throw new Error("历史数据中心暂时不可用。");
      setSummary((await summaryResponse.json()) as Summary);
      if (predictionResponse.ok) setPredictionAudit((await predictionResponse.json()) as PredictionAudit);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "历史数据中心暂时不可用。");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function importFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length) {
      setError("请先选择一个或多个CSV文件。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    let imported = 0;
    let skipped = 0;
    let invalid = 0;
    let excluded = 0;
    try {
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        form.set("source", source);
        form.set("season", season);
        const response = await fetch("/api/history/import", { method: "POST", body: form });
        const result = (await response.json()) as { imported?: number; skipped?: number; invalid?: number; excluded?: number; error?: string };
        if (!response.ok) throw new Error(result.error || `${file.name} 导入失败。`);
        imported += result.imported || 0;
        skipped += result.skipped || 0;
        invalid += result.invalid || 0;
        excluded += result.excluded || 0;
      }
      setMessage(`导入完成：新增${imported}场，重复${skipped}场，无效${invalid}行，范围外拦截${excluded}行。`);
      setFiles([]);
      const input = document.getElementById("history-files") as HTMLInputElement | null;
      if (input) input.value = "";
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "导入失败，请检查文件格式。");
    } finally {
      setBusy(false);
    }
  }

  async function runBacktest() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/history/backtest", { cache: "no-store" });
      const result = (await response.json()) as Backtest & { error?: string };
      if (!response.ok) throw new Error(result.error || "暂时无法生成回测报告。");
      setBacktest(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法生成回测报告。");
    } finally {
      setBusy(false);
    }
  }

  async function bootstrapHistory() {
    setBusy(true);
    setError("");
    setMessage("正在建立欧洲目标联赛三赛季基础库，请保持页面打开…");
    let imported = 0;
    let skipped = 0;
    try {
      for (const targetSeason of ["2023-24", "2024-25", "2025-26"]) {
        setMessage(`正在导入 ${targetSeason} 英超、英冠、德甲、德乙、意甲、法甲、法乙、西甲…`);
        const response = await fetch("/api/history/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season: targetSeason }),
        });
        const result = (await response.json()) as { imported?: number; skipped?: number; error?: string };
        if (!response.ok) throw new Error(result.error || `${targetSeason} 导入失败。`);
        imported += result.imported || 0;
        skipped += result.skipped || 0;
      }
      setMessage(`基础库建立完成：新增${imported}场，重复跳过${skipped}场。正在生成回测…`);
      await refresh();
      const response = await fetch("/api/history/backtest", { cache: "no-store" });
      const result = (await response.json()) as Backtest & { error?: string };
      if (!response.ok) throw new Error(result.error || "回测生成失败。");
      setBacktest(result);
      setMessage(`基础库建立完成：新增${imported}场，重复跳过${skipped}场；首轮回测已生成。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "一键建立基础库失败。");
    } finally {
      setBusy(false);
    }
  }

  async function bootstrapApiGroup(group: Exclude<CompetitionGroup, "europe_leagues">, label: string) {
    setBusy(true);
    setError("");
    setMessage(`正在通过 API-Football 补充${label}，请保持页面打开…`);
    let imported = 0;
    let skipped = 0;
    const failures: string[] = [];
    try {
      for (const targetSeason of [2024, 2025, 2026]) {
        setMessage(`正在导入 ${targetSeason} ${label}…`);
        const response = await fetch("/api/history/api-bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group, season: targetSeason }),
        });
        const result = (await response.json()) as {
          imported?: number;
          skipped?: number;
          failures?: string[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || `${targetSeason} ${label}导入失败。`);
        imported += result.imported || 0;
        skipped += result.skipped || 0;
        failures.push(...(result.failures || []));
      }
      await refresh();
      setMessage(`${label}补充完成：新增${imported}场，重复${skipped}场${failures.length ? `，${failures.length}项受套餐或数据源限制` : ""}。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `${label}补充失败。`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="history-section" id="history" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <p className="section-index">C / DATA LAB</p>
          <h2 id="history-title">历史数据中心</h2>
          <p>只接收真实赛果、赛前赔率与比赛统计。导入过程自动去重，并保留每次数据来源。</p>
        </div>
        <span className={`gate-pill ${summary?.gate || "blocked"}`}>
          {summary?.gate === "foundation" ? "基础样本已建立" : summary?.gate === "preliminary" ? "初步样本" : "概率输出关闭"}
        </span>
      </div>

      <div className="data-stat-grid">
        <article><span>比赛总数</span><strong>{summary?.total ?? "—"}</strong><small>去重后的真实记录</small></article>
        <article><span>已完赛</span><strong>{summary?.completed ?? "—"}</strong><small>可进入时间回测</small></article>
        <article><span>含赛前赔率</span><strong>{summary?.withOdds ?? "—"}</strong><small>可对比市场基准</small></article>
        <article><span>赛事 / 赛季</span><strong>{summary ? `${summary.competitions} / ${summary.seasons}` : "—"}</strong><small>{summary?.dateFrom ? `${summary.dateFrom} 至 ${summary.dateTo}` : "等待导入"}</small></article>
      </div>

      <div className="gate-banner">
        <span aria-hidden="true">!</span>
        <div><strong>数据门槛</strong><p>{summary?.gateReason || "正在检查历史数据库。"}</p></div>
      </div>

      <div className="target-scope">
        <div className="block-title"><h3>竞彩目标赛事白名单</h3><span>名单外数据自动拦截</span></div>
        <div className="competition-chips">
          {COMPETITION_CATALOG.map((competition) => {
            const count = summary?.coverage?.find((item) => item.code === competition.code)?.matches || 0;
            return <span className={count ? "loaded" : ""} key={competition.code}>{competition.nameZh}<small>{count ? `${count}场` : "待导入"}</small></span>;
          })}
        </div>
        <p>欧联杯与欧罗巴按同一赛事存储；杯赛范围为上述联赛对应的主要国内杯赛，不自动扩展到其他赛事。</p>
      </div>

      <div className="history-grid">
        <form className="import-card" onSubmit={importFiles}>
          <div className="card-title"><div><p className="mini-label">BULK IMPORT</p><h3>批量导入CSV</h3></div><a href="/api/history/template">下载模板</a></div>
          <div className="import-fields">
            <label><span>数据来源</span><input value={source} onChange={(event) => setSource(event.target.value)} /></label>
            <label><span>赛季</span><input value={season} onChange={(event) => setSeason(event.target.value)} placeholder="例如 2024-25" /></label>
          </div>
          <button className="bootstrap-button" type="button" onClick={bootstrapHistory} disabled={busy}>
            <span>第一步 · 免费历史CSV</span>
            <strong>{busy ? "正在处理…" : "导入欧洲8项联赛 · 3赛季"}</strong>
            <small>英超、英冠、德甲、德乙、意甲、法甲、法乙、西甲，含可用赛前赔率</small>
          </button>
          <div className="api-bootstrap-grid">
            <button type="button" onClick={() => bootstrapApiGroup("supplemental_leagues", "日韩/北欧/美洲联赛")} disabled={busy}><span>API补充</span><strong>日韩 / 北欧 / 美洲</strong><small>日职、挪超、瑞典超、芬超、韩K、美职联、巴甲</small></button>
            <button type="button" onClick={() => bootstrapApiGroup("continental", "洲际赛事")} disabled={busy}><span>API补充</span><strong>欧冠 / 亚冠 / 欧联</strong><small>按2022–2024三个赛季导入</small></button>
            <button type="button" onClick={() => bootstrapApiGroup("domestic_cups", "主要国内杯赛")} disabled={busy}><span>API补充</span><strong>主要国内杯赛</strong><small>仅白名单联赛对应杯赛</small></button>
          </div>
          <div className="import-divider"><span>或导入自己的CSV</span></div>
          <label className="file-drop" htmlFor="history-files">
            <strong>{files.length ? `已选择 ${files.length} 个文件` : "选择一个或多个CSV"}</strong>
            <span>支持 Football-Data 标准列；单文件不超过3MB</span>
            <input id="history-files" type="file" accept=".csv,text/csv" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
          </label>
          <button className="secondary-button" type="submit" disabled={busy}>{busy ? "处理中…" : "导入并去重"}</button>
          {message ? <p className="success-message" role="status">{message}</p> : null}
          {error ? <p className="history-error" role="alert">{error}</p> : null}
          <p className="import-note">API免费套餐按日计数，建议分组导入。必须使用赛前记录；赛后信息不能回填为赛前特征。</p>
        </form>

        <div className="backtest-card">
          <div className="card-title"><div><p className="mini-label">WALK-FORWARD</p><h3>时间顺序回测</h3></div><button type="button" onClick={runBacktest} disabled={busy}>运行回测</button></div>
          {backtest?.model ? (
            <>
              <div className="backtest-verdict"><strong>{backtest.status === "baseline_ready" ? "基础模型通过第一道门槛" : backtest.status === "underperforming" ? "模型未通过基准" : "初步结果，仅供研究"}</strong><p>{backtest.reason}</p></div>
              <div className="metric-table" role="table" aria-label="回测指标">
                <div className="metric-head" role="row"><span>方法</span><span>样本</span><span>准确率</span><span>Brier↓</span><span>Log Loss↓</span></div>
                <div role="row"><strong>联赛融合模型</strong><span>{backtest.model.samples}</span><span>{percent(backtest.model.accuracy)}</span><span>{decimal(backtest.model.brier)}</span><span>{decimal(backtest.model.logLoss)}</span></div>
                {backtest.baseline ? <div role="row"><strong>固定先验</strong><span>{backtest.baseline.samples}</span><span>{percent(backtest.baseline.accuracy)}</span><span>{decimal(backtest.baseline.brier)}</span><span>{decimal(backtest.baseline.logLoss)}</span></div> : null}
                {backtest.market ? <div role="row"><strong>赔率基准</strong><span>{backtest.market.samples}</span><span>{percent(backtest.market.accuracy)}</span><span>{decimal(backtest.market.brier)}</span><span>{decimal(backtest.market.logLoss)}</span></div> : null}
              </div>
              <div className="backtest-meta"><span>热身 {backtest.trainingMatches}</span><span>逐场测试 {backtest.testingMatches}</span><span>校准误差 {percent(backtest.calibrationError)}</span></div>
              {backtest.betting ? <div className="backtest-meta"><span>模拟下注 {backtest.betting.bets}</span><span>ROI {percent(backtest.betting.roi)}</span><span>最大回撤 {backtest.betting.maxDrawdown.toFixed(2)}单位</span></div> : null}
            </>
          ) : (
            <div className="empty-report"><span>01</span><h4>还没有回测报告</h4><p>{backtest?.reason || "导入真实历史数据后，各联赛独立热身，再严格按时间逐场预测和更新。"}</p></div>
          )}
        </div>
      </div>

      <div className="gate-banner">
        <span aria-hidden="true">✓</span>
        <div><strong>预测闭环</strong><p>{predictionAudit
          ? `已留档${predictionAudit.total}场，待赛果${predictionAudit.pending}场，已核对${predictionAudit.settled}场${predictionAudit.hitRate === null ? "" : `，命中率${percent(predictionAudit.hitRate)}，留档ROI ${percent(predictionAudit.roi ?? undefined)}`}`
          : "每次分析自动留档；导入赛果后自动核对命中与盈亏。"}</p></div>
      </div>

      {summary?.imports.length ? (
        <div className="import-log"><div className="block-title"><h3>最近导入记录</h3><span>可追溯来源</span></div>{summary.imports.map((job) => <div key={`${job.created_at}-${job.file_name}`}><span>{job.file_name}</span><span>{job.source}</span><span>{job.season}</span><span>新增 {job.rows_imported}</span><span>重复 {job.rows_skipped}</span></div>)}</div>
      ) : null}
    </section>
  );
}
