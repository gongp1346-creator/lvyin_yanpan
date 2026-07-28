// Production wrapper: keep the generated Vinext handler and add a lightweight
// scheduled refresh for today's market snapshots.
import app from "./index.js";

const PUBLIC_ORIGIN = "https://pitch-intelligence.gongp1346.workers.dev";

export default {
  fetch: app.fetch,
  scheduled(_controller, _env, ctx) {
    ctx.waitUntil(
      fetch(`${PUBLIC_ORIGIN}/api/jingcai/today?scheduled=1`, {
        headers: { "user-agent": "pitch-intelligence-scheduler/1.0" },
      }).catch(() => undefined),
    );
  },
};
