"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarClock, Crown, Eye, Lock, Mail, RefreshCw, Shield, Sparkles, Trophy } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createBrowserSupabase, hasSupabaseEnv } from "@/lib/supabase";
import { demoData } from "@/lib/demo-data";
import { AppData, Match } from "@/lib/types";

type Tab = "dashboard" | "predictions" | "matches" | "admin";

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function hasStarted(match: Match) {
  return new Date(match.kickoffAt).getTime() <= Date.now();
}

function matchLabel(match: Match) {
  if (match.status === "live") return `LIVE ${match.elapsed ?? ""}'`;
  if (match.status === "finished") return "Final";
  return "Programat";
}

function buildTimeline(data: AppData) {
  const finished = data.matches
    .filter((match) => match.status === "finished")
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

  const totals = new Map<string, number>();
  const rows = finished.map((match, index) => {
    data.predictions
      .filter((prediction) => prediction.matchId === match.id)
      .forEach((prediction) => {
        totals.set(prediction.displayName, (totals.get(prediction.displayName) ?? 0) + prediction.points);
      });

    return {
      name: `M${index + 1}`,
      ...Object.fromEntries([...totals.entries()])
    };
  });

  return rows.length ? rows : [{ name: "Start", Alex: 0, Bogdan: 0, Diana: 0 }];
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState<AppData>(demoData);
  const [drafts, setDrafts] = useState<Record<string, { home: string; away: string }>>({});
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const configured = hasSupabaseEnv();

  const upcoming = data.matches.filter((match) => !hasStarted(match));
  const live = data.matches.filter((match) => match.status === "live");
  const completed = data.matches.filter((match) => match.status === "finished");
  const timeline = buildTimeline(data);
  const topPlayers = data.leaderboard.slice(0, 5);
  const tabs: Tab[] = data.user?.isAdmin || !configured
    ? ["dashboard", "predictions", "matches", "admin"]
    : ["dashboard", "predictions", "matches"];

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    async function load() {
      setLoading(true);
      const { data: userData } = await client.auth.getUser();
      const { data: sessionData } = await client.auth.getSession();
      const user = userData.user;

      if (user) {
        const pendingName = localStorage.getItem("pendingDisplayName");
        const pendingInvite = localStorage.getItem("pendingInvite");
        if (pendingName && pendingInvite) {
          await fetch("/api/complete-profile", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionData.session?.access_token}`
            },
            body: JSON.stringify({ displayName: pendingName, inviteCode: pendingInvite })
          });
          localStorage.removeItem("pendingDisplayName");
          localStorage.removeItem("pendingInvite");
        }
      }

      const [{ data: matches }, { data: predictions }, { data: leaderboard }, { data: profile }] = await Promise.all([
        client.from("matches").select("*").order("kickoff_at"),
        client.from("predictions_public").select("*"),
        client.from("leaderboard").select("*"),
        user ? client.from("profiles").select("*").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null })
      ]);

      const { data: profileAfter } = user
        ? await client.from("profiles").select("*").eq("id", user.id).maybeSingle()
        : { data: null };

      setData({
        user: user
          ? {
              id: user.id,
              email: user.email ?? "",
              displayName: profileAfter?.display_name ?? user.email?.split("@")[0] ?? "Jucator",
              isAdmin: Boolean(profileAfter?.is_admin)
            }
          : null,
        matches:
          matches?.map((match: any) => ({
            id: match.id,
            apiFixtureId: match.api_fixture_id,
            groupName: match.group_name,
            kickoffAt: match.kickoff_at,
            homeTeam: match.home_team,
            awayTeam: match.away_team,
            homeScore: match.home_score,
            awayScore: match.away_score,
            elapsed: match.elapsed,
            status: match.status
          })) ?? [],
        predictions:
          predictions?.map((prediction: any) => ({
            id: prediction.id,
            matchId: prediction.match_id,
            userId: prediction.user_id,
            displayName: prediction.display_name,
            homeScore: prediction.home_score,
            awayScore: prediction.away_score,
            points: prediction.points
          })) ?? [],
        leaderboard:
          leaderboard?.map((row: any) => ({
            userId: row.user_id,
            displayName: row.display_name,
            points: row.points,
            exact: row.exact_scores,
            outcome: row.outcomes,
            predicted: row.predicted
          })) ?? []
      });

      setLoading(false);
    }

    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [supabase]);

  async function signIn() {
    if (!supabase) {
      setMessage("Demo mode: configureaza Supabase pentru login real.");
      return;
    }
    if (!email || !invite || !displayName) {
      setMessage("Completeaza email, nume si codul de invitatie.");
      return;
    }

    localStorage.setItem("pendingDisplayName", displayName);
    localStorage.setItem("pendingInvite", invite);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    });
    setMessage(error ? error.message : "Ti-am trimis linkul magic pe email.");
  }

  async function savePrediction(match: Match) {
    const draft = drafts[match.id];
    if (!draft || draft.home === "" || draft.away === "") return;
    if (hasStarted(match)) {
      setMessage("Meciul a inceput deja. Predictia este blocata.");
      return;
    }
    if (!supabase || !data.user) {
      setMessage("In demo poti edita campurile, dar salvarea reala cere login.");
      return;
    }

    const { error } = await supabase
      .from("predictions")
      .upsert(
        {
          match_id: match.id,
          user_id: data.user.id,
          home_score: Number(draft.home),
          away_score: Number(draft.away)
        },
        { onConflict: "match_id,user_id" }
      );

    setMessage(error ? error.message : "Predictie salvata.");
  }

  async function syncScores() {
    const secret = window.prompt("CRON_SECRET");
    if (!secret) return;
    const response = await fetch(`/api/sync-scores?secret=${encodeURIComponent(secret)}`);
    setMessage(response.ok ? "Sincronizare pornita." : "Sincronizarea a esuat.");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Trophy size={24} />
          </div>
          <div>
            <div>Mondialul Prietenilor</div>
            <div className="small-label">Faza grupelor · scor corect</div>
          </div>
        </div>
        <button className="button ghost" onClick={() => window.location.reload()}>
          <RefreshCw size={17} /> Refresh
        </button>
      </header>

      <section className="hero">
        <div className="hero-main">
          <div>
            <div className={live.length ? "pill live" : "pill"}>
              <Activity size={14} /> {live.length ? `${live.length} meci live` : "Pregatit de start"}
            </div>
            <h1>Mondialul Prietenilor</h1>
            <p>
              Predictii treptate, scoruri blocate la fluierul de start si clasament live pentru gasca ta.
            </p>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <strong>{data.matches.length}</strong>
              <span>Meciuri</span>
            </div>
            <div className="stat">
              <strong>{data.leaderboard.length}</strong>
              <span>Jucatori</span>
            </div>
            <div className="stat">
              <strong>{completed.length}</strong>
              <span>Finalizate</span>
            </div>
          </div>
        </div>

        <aside className="panel auth-panel">
          <h2>{data.user ? `Salut, ${data.user.displayName}` : "Intra in joc"}</h2>
          <p>
            {configured
              ? "Login prin magic link si cod de invitatie."
              : "Rulezi in demo mode pana configurezi Supabase."}
          </p>
          {!data.user && (
            <div className="form-grid">
              <label className="field">
                <span>Email</span>
                <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label className="field">
                <span>Nume afisat</span>
                <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              <label className="field">
                <span>Cod invitatie</span>
                <input className="input" value={invite} onChange={(event) => setInvite(event.target.value)} />
              </label>
              <button className="button" onClick={signIn}>
                <Mail size={17} /> Trimite magic link
              </button>
            </div>
          )}
          {data.user && (
            <div className="form-grid">
              <div className="notice">Predictiile tale sunt private pana incepe fiecare meci.</div>
              <button className="button ghost" onClick={() => supabase?.auth.signOut().then(() => window.location.reload())}>
                Logout
              </button>
            </div>
          )}
          {message && <div className="notice">{message}</div>}
        </aside>
      </section>

      <nav className="tabs">
        {tabs.map((item) => (
          <button key={item} className={`tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>
            {item === "dashboard" && "Dashboard"}
            {item === "predictions" && "Predictii"}
            {item === "matches" && "Meciuri"}
            {item === "admin" && "Admin"}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && (
        <section className="grid two">
          <div className="panel">
            <div className="section-title">
              <h2>Clasament live</h2>
              <p>Departajare: puncte, scoruri exacte, rezultate corecte.</p>
            </div>
            <div className="leaderboard" style={{ marginTop: 16 }}>
              {data.leaderboard.map((player, index) => (
                <div className="leader-row" key={player.userId}>
                  <div className="rank">{index + 1}</div>
                  <div>
                    <strong>{player.displayName}</strong>
                    <div className="small-label">{player.predicted} predictii</div>
                  </div>
                  <div className="metric">
                    {player.points}
                    <div className="small-label">pct</div>
                  </div>
                  <div className="metric">
                    {player.exact}
                    <div className="small-label">exacte</div>
                  </div>
                  <div className="metric">
                    {player.outcome}
                    <div className="small-label">semne</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="section-title">
                <h2>Evolutie</h2>
                <p>Cum s-a miscat liderul dupa meciurile finalizate.</p>
              </div>
              <div style={{ width: "100%", height: 240, marginTop: 14 }}>
                <ResponsiveContainer>
                  <AreaChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    {topPlayers.map((player, index) => (
                      <Area
                        key={player.userId}
                        dataKey={player.displayName}
                        stroke={["#2f7d46", "#ff6f61", "#7c5cff", "#f6c744", "#6dcff6"][index]}
                        fill={["#2f7d46", "#ff6f61", "#7c5cff", "#f6c744", "#6dcff6"][index]}
                        fillOpacity={0.12}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid three">
              <div className="card">
                <Crown size={22} />
                <h3>{data.leaderboard[0]?.displayName ?? "-"}</h3>
                <div className="small-label">Lider curent</div>
              </div>
              <div className="card">
                <Sparkles size={22} />
                <h3>{Math.max(0, ...data.leaderboard.map((p) => p.exact))}</h3>
                <div className="small-label">Record exacte</div>
              </div>
              <div className="card">
                <CalendarClock size={22} />
                <h3>{upcoming.length}</h3>
                <div className="small-label">De prezis</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === "predictions" && (
        <section className="grid">
          {data.matches.map((match) => {
            const locked = hasStarted(match);
            const visiblePredictions = data.predictions.filter((prediction) => prediction.matchId === match.id);
            return (
              <article className="card match" key={match.id}>
                <div className="match-head">
                  <span>{match.groupName}</span>
                  <span>{formatKickoff(match.kickoffAt)}</span>
                  <span className={match.status === "live" ? "pill live" : "pill"}>{matchLabel(match)}</span>
                </div>
                <div className="teams">
                  <div className="team-row">
                    <div className="team-name">{match.homeTeam}</div>
                    <input
                      className="score-input"
                      disabled={locked}
                      type="number"
                      min={0}
                      value={drafts[match.id]?.home ?? ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [match.id]: { home: event.target.value, away: prev[match.id]?.away ?? "" }
                        }))
                      }
                    />
                  </div>
                  <div className="team-row">
                    <div className="team-name">{match.awayTeam}</div>
                    <input
                      className="score-input"
                      disabled={locked}
                      type="number"
                      min={0}
                      value={drafts[match.id]?.away ?? ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [match.id]: { home: prev[match.id]?.home ?? "", away: event.target.value }
                        }))
                      }
                    />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span className="small-label">
                    {locked ? (
                      <>
                        <Lock size={13} /> Blocat
                      </>
                    ) : (
                      "Editabil pana la start"
                    )}
                  </span>
                  <button className="button secondary" disabled={locked} onClick={() => savePrediction(match)}>
                    Salveaza
                  </button>
                </div>
                {locked && (
                  <div>
                    <div className="small-label">
                      <Eye size={13} /> Predictii vizibile
                    </div>
                    {visiblePredictions.map((prediction) => (
                      <div className="prediction-row" key={prediction.id}>
                        <strong>{prediction.displayName}</strong>
                        <span>
                          {prediction.homeScore}-{prediction.awayScore}
                        </span>
                        <span className="metric">{prediction.points} pct</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {tab === "matches" && (
        <section className="grid three">
          {data.matches.map((match) => (
            <article className="card match" key={match.id}>
              <div className="match-head">
                <span>{match.groupName}</span>
                <span className={match.status === "live" ? "pill live" : "pill"}>{matchLabel(match)}</span>
              </div>
              <div>
                <h3>
                  {match.homeTeam} vs {match.awayTeam}
                </h3>
                <p className="small-label">{formatKickoff(match.kickoffAt)}</p>
              </div>
              <h2>
                {match.homeScore ?? "-"} : {match.awayScore ?? "-"}
              </h2>
            </article>
          ))}
        </section>
      )}

      {tab === "admin" && (
        <section className="panel">
          <div className="section-title">
            <h2>Admin</h2>
            <p>Sincronizare scoruri si control rapid. In productie este accesibil doar emailului admin.</p>
          </div>
          <div className="form-grid">
            <button className="button" onClick={syncScores}>
              <Shield size={17} /> Sincronizeaza API-Football
            </button>
            <div className="notice">
              Pentru fallback manual, actualizeaza tabela `matches` in Supabase. Scorurile se recalculeaza automat prin trigger.
            </div>
          </div>
        </section>
      )}

      <p className="footer-note">
        {loading ? "Actualizez datele..." : "Timezone-ul este detectat automat din device-ul utilizatorului."}
      </p>
    </main>
  );
}
