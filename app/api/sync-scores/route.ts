import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ApiFixture = {
  fixture: {
    id: number;
    date: string;
    status: {
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    round: string;
  };
  teams: {
    home: { name: string };
    away: { name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

function normalizeStatus(short: string) {
  if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"].includes(short)) return "live";
  if (["FT", "AET", "PEN"].includes(short)) return "finished";
  return "scheduled";
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || (secret !== process.env.CRON_SECRET && bearer !== process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  const supabase = createServiceSupabase();
  if (!apiKey || !supabase) {
    return NextResponse.json({ error: "Lipsesc API_FOOTBALL_KEY sau Supabase service key." }, { status: 500 });
  }

  const response = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
    headers: {
      "x-apisports-key": apiKey
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return NextResponse.json({ error: "API-Football nu a raspuns corect." }, { status: 502 });
  }

  const payload = await response.json();
  const fixtures: ApiFixture[] = payload.response ?? [];

  const rows = fixtures
    .filter((fixture) => /group/i.test(fixture.league.round))
    .map((fixture) => ({
      api_fixture_id: fixture.fixture.id,
      group_name: fixture.league.round.replace("Group Stage - ", "Grupa "),
      kickoff_at: fixture.fixture.date,
      home_team: fixture.teams.home.name,
      away_team: fixture.teams.away.name,
      home_score: fixture.goals.home,
      away_score: fixture.goals.away,
      elapsed: fixture.fixture.status.elapsed,
      status: normalizeStatus(fixture.fixture.status.short)
    }));

  if (!rows.length) {
    return NextResponse.json({ ok: true, fixtures: 0 });
  }

  const { error } = await supabase.from("matches").upsert(rows, {
    onConflict: "api_fixture_id"
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.rpc("recalculate_prediction_points");

  return NextResponse.json({ ok: true, fixtures: rows.length });
}
