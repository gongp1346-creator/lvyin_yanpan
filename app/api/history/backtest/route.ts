import { NextResponse } from "next/server";
import { getBacktestReport } from "../../../../lib/history-store";

export async function GET() {
  try {
    return NextResponse.json(await getBacktestReport());
  } catch {
    return NextResponse.json({ error: "暂时无法生成回测报告。" }, { status: 503 });
  }
}
