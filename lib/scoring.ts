export function outcome(home: number, away: number) {
  if (home > away) return "H";
  if (home < away) return "A";
  return "D";
}

export function scorePrediction(
  actualHome: number | null,
  actualAway: number | null,
  predictedHome: number,
  predictedAway: number
) {
  if (actualHome === null || actualAway === null) return 0;
  if (actualHome === predictedHome && actualAway === predictedAway) return 3;
  return outcome(actualHome, actualAway) === outcome(predictedHome, predictedAway) ? 1 : 0;
}
