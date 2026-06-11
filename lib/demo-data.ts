import { AppData, Match } from "./types";
import { scorePrediction } from "./scoring";

const now = Date.now();

export const demoMatches: Match[] = [
  {
    id: "demo-1",
    apiFixtureId: null,
    groupName: "Grupa A",
    kickoffAt: new Date(now - 55 * 60 * 1000).toISOString(),
    homeTeam: "Mexic",
    awayTeam: "Africa de Sud",
    homeScore: 1,
    awayScore: 0,
    elapsed: 55,
    status: "live"
  },
  {
    id: "demo-2",
    apiFixtureId: null,
    groupName: "Grupa A",
    kickoffAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    homeTeam: "Canada",
    awayTeam: "Uruguay",
    homeScore: null,
    awayScore: null,
    elapsed: null,
    status: "scheduled"
  },
  {
    id: "demo-3",
    apiFixtureId: null,
    groupName: "Grupa B",
    kickoffAt: new Date(now - 28 * 60 * 60 * 1000).toISOString(),
    homeTeam: "Brazilia",
    awayTeam: "Japonia",
    homeScore: 2,
    awayScore: 1,
    elapsed: 90,
    status: "finished"
  },
  {
    id: "demo-4",
    apiFixtureId: null,
    groupName: "Grupa C",
    kickoffAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    homeTeam: "Franta",
    awayTeam: "Maroc",
    homeScore: null,
    awayScore: null,
    elapsed: null,
    status: "scheduled"
  }
];

const rawPredictions = [
  ["p1", "Alex", "demo-1", 2, 0],
  ["p2", "Bogdan", "demo-1", 1, 0],
  ["p3", "Cristi", "demo-1", 1, 1],
  ["p4", "Diana", "demo-1", 3, 1],
  ["p5", "Alex", "demo-3", 2, 1],
  ["p6", "Bogdan", "demo-3", 1, 0],
  ["p7", "Cristi", "demo-3", 2, 2],
  ["p8", "Diana", "demo-3", 3, 1]
] as const;

export const demoData: AppData = {
  user: null,
  matches: demoMatches,
  predictions: rawPredictions.map(([id, displayName, matchId, homeScore, awayScore]) => {
    const match = demoMatches.find((item) => item.id === matchId)!;
    return {
      id,
      userId: displayName.toLowerCase(),
      displayName,
      matchId,
      homeScore,
      awayScore,
      points: scorePrediction(match.homeScore, match.awayScore, homeScore, awayScore)
    };
  }),
  leaderboard: [
    { userId: "alex", displayName: "Alex", points: 4, exact: 1, outcome: 1, predicted: 2 },
    { userId: "bogdan", displayName: "Bogdan", points: 4, exact: 1, outcome: 1, predicted: 2 },
    { userId: "diana", displayName: "Diana", points: 2, exact: 0, outcome: 2, predicted: 2 },
    { userId: "cristi", displayName: "Cristi", points: 0, exact: 0, outcome: 0, predicted: 2 }
  ]
};
