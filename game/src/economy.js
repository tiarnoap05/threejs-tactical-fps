// The economy: money earned each round and spent in the buy menu. Kills pay, round
// wins pay most, losses still pay, and planting or defusing the core pays a bonus.
// The purse caps at $16,000, and the buy menu refuses what the purse cannot cover.
const START_MONEY = 800;
const MAX_MONEY = 16000;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const PLANT_REWARD = 300;
const DEFUSE_REWARD = 300;

export function createEconomy() {
  let money = START_MONEY;
  let kills = 0;
  let deaths = 0;

  function earn(amount) {
    money = Math.min(MAX_MONEY, money + amount);
  }

  return {
    get money() {
      return money;
    },
    get kills() {
      return kills;
    },
    get deaths() {
      return deaths;
    },
    addKill() {
      kills += 1;
      earn(KILL_REWARD);
    },
    addDeath() {
      deaths += 1;
    },
    addWin() {
      earn(WIN_REWARD);
    },
    addLoss() {
      earn(LOSS_REWARD);
    },
    addPlant() {
      earn(PLANT_REWARD);
    },
    addDefuse() {
      earn(DEFUSE_REWARD);
    },
    spend(cost) {
      if (money < cost) return false;
      money -= cost;
      return true;
    },
    reset() {
      money = START_MONEY;
      kills = 0;
      deaths = 0;
    },
  };
}
