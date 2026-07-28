import { NextResponse } from "next/server";
import { importHistoryCsv } from "../../../../lib/history-store";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const source = String(form.get("source") || "football-data.co.uk").trim();
    const season = String(form.get("season") || "").trim();
    if (!(file instanceof File) || !season || !source) {
      return NextResponse.json({ error: "请选择CSV文件并填写赛季。" }, { status: 400 });
    }
    if (file.size > 3_000_000) {
      return NextResponse.json({ error: "单个CSV不能超过3MB。" }, { status: 413 });
    }
    const result = await importHistoryCsv({ text: await file.text(), source, season, fileName: file.name });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入失败，请检查CSV格式。" },
      { status: 400 },
    );
  }
}
