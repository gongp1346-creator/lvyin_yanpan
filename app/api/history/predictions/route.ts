import { NextResponse } from "next/server";
import { getPredictionAudit } from "../../../../lib/history-store";

export async function GET() {
  try {
    return NextResponse.json(await getPredictionAudit());
  } catch {
    return NextResponse.json({ error: "预测留档暂时无法读取。" }, { status: 503 });
  }
}
