// The match: one place holds the whole state. Rounds alternate sides, open with a
// 12 s buy freeze, run on a 100 s clock, and end by elimination, detonation,
// defuse or time. First to 5 rounds wins the match, at most 9 rounds. The kill
// feed lives here too, newest first, five entries kept.
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createMatch() {
  const state = {
    phase: 'buy', // buy | live | roundEnd | matchEnd
    round: 1,
    scoreA: 0,
    scoreB: 0,
    playerTeam: 'A',
    buyLeft: BUY_SECONDS,
    roundLeft: ROUND_SECONDS,
    endLeft: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
  };
  const feed = [];
  let feedSeq = 0;

  function startMatch() {
    state.phase = 'buy';
    state.round = 1;
    state.scoreA = 0;
    state.scoreB = 0;
    state.playerTeam = 'A';
    state.buyLeft = BUY_SECONDS;
    state.roundLeft = ROUND_SECONDS;
    state.endLeft = 0;
    state.roundWinner = null;
    state.roundReason = '';
    state.matchWinner = null;
    feed.length = 0;
  }

  function nextRound() {
    state.round += 1;
    state.playerTeam = state.playerTeam === 'A' ? 'B' : 'A';
    state.phase = 'buy';
    state.buyLeft = BUY_SECONDS;
    state.roundLeft = ROUND_SECONDS;
    state.roundWinner = null;
    state.roundReason = '';
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    if (winner === 'A') state.scoreA += 1;
    else state.scoreB += 1;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.phase = 'roundEnd';
    state.endLeft = 4;
  }

  // step() advances the clocks. Returns 'go' when the buy freeze ends,
  // 'round' when the round-end pause ends, 'time' when the round clock runs out.
  function step(dt) {
    if (state.phase === 'buy') {
      state.buyLeft -= dt;
      if (state.buyLeft <= 0) {
        state.phase = 'live';
        state.roundLeft = ROUND_SECONDS;
        return 'go';
      }
    } else if (state.phase === 'live') {
      state.roundLeft -= dt;
      if (state.roundLeft <= 0) return 'time';
    } else if (state.phase === 'roundEnd') {
      state.endLeft -= dt;
      if (state.endLeft <= 0) {
        if (state.scoreA >= WIN_ROUNDS || state.scoreB >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
          state.phase = 'matchEnd';
          state.matchWinner = state.scoreA > state.scoreB ? 'A' : state.scoreB > state.scoreA ? 'B' : null;
        } else {
          nextRound();
        }
        return 'round';
      }
    }
    return null;
  }

  function addKill(killer, victim, weapon, headshot, killerTeam) {
    feed.unshift({ id: feedSeq += 1, killer, victim, weapon, headshot, killerTeam, at: performance.now() });
    if (feed.length > 5) feed.pop();
  }

  return {
    state,
    startMatch,
    nextRound,
    endRound,
    step,
    addKill,
    feed() {
      return feed;
    },
    isBuyPhase() {
      return state.phase === 'buy';
    },
  };
}
