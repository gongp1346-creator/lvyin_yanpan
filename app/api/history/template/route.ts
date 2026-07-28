const TEMPLATE = `Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,Referee,HS,AS,HST,AST,HC,AC,HY,AY,HR,AR,AvgH,AvgD,AvgA\nE0,16/08/2024,20:00,Manchester United,Fulham,1,0,H,Robert Jones,14,10,5,2,7,8,2,3,0,0,1.60,4.20,5.70\n`;

export async function GET() {
  return new Response(TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="football-history-template.csv"',
    },
  });
}
