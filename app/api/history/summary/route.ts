import { NextResponse } from "next/server";
import { getHistorySummary } from "../../../../lib/history-store";

export async function GET() {
  try {
    return NextResponse.json(await getHistorySummary());
  } catch {
    return NextResponse.json({ error: "历史数据库暂时不可用。" }, { status: 503 });
  }
}
