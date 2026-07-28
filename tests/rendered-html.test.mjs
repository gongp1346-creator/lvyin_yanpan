import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the football intelligence product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /绿茵研判/);
  assert.match(html, /选择今日竞彩，直接看结论/);
  assert.match(html, /当前在售竞彩/);
  assert.match(html, /正在同步官方在售场次/);
  assert.match(html, /手动输入其他比赛/);
  assert.match(html, /开始分析/);
  assert.match(html, /历史数据中心/);
  assert.match(html, /概率输出关闭/);
  assert.match(html, />球队</);
  assert.match(html, />时间</);
  assert.match(html, />结论</);
  assert.match(html, /数据管理/);
  assert.doesNotMatch(html, /诱盘判断/);
  assert.doesNotMatch(html, /独特见解/);
  assert.match(html, /竞彩目标赛事白名单/);
  assert.match(html, /导入欧洲8项联赛/);
  assert.match(html, /欧冠 \/ 亚冠 \/ 欧联/);
  assert.match(html, /名单外数据自动拦截/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.match(html, /昨日竞彩比赛结果/);
  assert.match(html, /正在同步官方完场赛果/);
  assert.doesNotMatch(html, /Building your site/);
});
