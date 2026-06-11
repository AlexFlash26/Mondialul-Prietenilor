export type MatchStatus = "scheduled" | "live" | "finished";

export type Match = {
  id: string;
  apiFixtureId: number | null;
  groupName: string;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  elapsed: number | null;
  status: MatchStatus;
};

export type Prediction = {
  id: string;
  matchId: string;
  userId: string;
  displayName: string;
  homeScore: number;
  awayScore: number;
  points: number;
};

export type PlayerScore = {
  userId: string;
  displayName: string;
  points: number;
  exact: number;
  outcome: number;
  predicted: number;
};

export type AppData = {
  user: {
    id: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
  } | null;
  matches: Match[];
  predictions: Prediction[];
  leaderboard: PlayerScore[];
};
