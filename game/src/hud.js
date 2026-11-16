// The DOM HUD: crosshair, hit marker, health, armour, ammo, money, timer, score,
// bomb status, plant/defuse progress, kill feed, buy menu, minimap, banners and
// overlays. It never touches the simulation; main.js pushes numbers in and reads
// the play callback out. Every setter is guarded, so the DOM only changes when a
// value does.
const COPY = {
  start: {
    title: 'Foundry Yard',
    copy: 'A tactical round-based shooter. Plant the core or wipe the enemy team — first to 5 rounds wins. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Foundry Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud(colliders, sites, onPlay) {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const healthNum = el('health-num');
  const healthBar = el('health-bar');
  const armorInd = el('armor-ind');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const reloadHint = el('reload-hint');
  const grenadePips = el('grenade-pips');
  const moneyEl = el('money');
  const timerEl = el('timer');
  const scoreA = el('score-a');
  const scoreB = el('score-b');
  const roundNum = el('round-num');
  const aliveA = el('alive-a');
  const aliveB = el('alive-b');
  const bombStatus = el('bomb-status');
  const fuseBar = el('fuse-bar');
  const carryInd = el('carry-ind');
  const progressWrap = el('progress-wrap');
  const progressLabel = el('progress-label');
  const progressBar = el('progress-bar');
  const killfeed = el('killfeed');
  const bannerEl = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const buyMenu = el('buymenu');
  const buyItems = el('buy-items');
  const buyMoney = el('buy-money');
  const scopeEl = el('scope');
  const vignette = el('damage-vignette');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');

  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastHealth = -1;
  let lastArmor = null;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';
  let lastBomb = '';
  let lastFeedHead = -1;
  let hitTimer = 0;
  let bannerTimer = 0;
  let vignetteTimer = 0;

  play.addEventListener('click', onPlay);

  function drawMinimap(player, allies, enemies, bomb) {
    const W = minimap.width;
    const H = minimap.height;
    const sx = (x) => ((x + 22.5) / 45) * W;
    const sz = (z) => ((z + 16.5) / 33) * H;
    mctx.clearRect(0, 0, W, H);
    mctx.fillStyle = 'rgba(20, 16, 12, 0.85)';
    mctx.fillRect(0, 0, W, H);
    mctx.fillStyle = '#6f5c42';
    for (const c of colliders) {
      if (c.max.y < 0.2) continue;
      mctx.fillRect(sx(c.min.x), sz(c.min.z), sx(c.max.x) - sx(c.min.x), sz(c.max.z) - sz(c.min.z));
    }
    for (const [site, color] of [[sites[0], '#ff8c1a'], [sites[1], '#2fbfa8']]) {
      mctx.strokeStyle = color;
      mctx.lineWidth = 1.5;
      mctx.strokeRect(sx(site.minX), sz(site.minZ), sx(site.maxX) - sx(site.minX), sz(site.maxZ) - sz(site.minZ));
    }
    const dot = (x, z, color, r = 3) => {
      mctx.fillStyle = color;
      mctx.beginPath();
      mctx.arc(sx(x), sz(z), r, 0, Math.PI * 2);
      mctx.fill();
    };
    for (const a of allies) dot(a.x, a.z, a.team === 'A' ? '#e8542f' : '#3f8fe0');
    for (const e of enemies) dot(e.x, e.z, e.team === 'A' ? '#e8542f' : '#3f8fe0', 3.5);
    if (bomb) {
      mctx.fillStyle = '#ff8c1a';
      const bx = sx(bomb.x);
      const bz = sz(bomb.z);
      mctx.beginPath();
      mctx.moveTo(bx, bz - 5);
      mctx.lineTo(bx + 4, bz);
      mctx.lineTo(bx, bz + 5);
      mctx.lineTo(bx - 4, bz);
      mctx.closePath();
      mctx.fill();
    }
    // The player: a white wedge pointing where they face.
    mctx.save();
    mctx.translate(sx(player.x), sz(player.z));
    mctx.rotate(Math.atan2(player.dx, -player.dz));
    mctx.fillStyle = '#f2e8d8';
    mctx.beginPath();
    mctx.moveTo(0, -6);
    mctx.lineTo(4, 4);
    mctx.lineTo(-4, 4);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  return {
    setHealth(hp, hasArmor) {
      if (hp === lastHealth && hasArmor === lastArmor) return;
      lastHealth = hp;
      lastArmor = hasArmor;
      healthNum.textContent = String(Math.max(0, hp));
      healthBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      healthBar.classList.toggle('low', hp <= 30);
      armorInd.hidden = !hasArmor;
    },
    setAmmo(mag, reserve, weapon, reloading, grenades) {
      if (mag === lastMag && reserve === lastReserve && weapon === lastWeapon) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = weapon;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = weapon;
      reloadHint.hidden = !reloading;
      grenadePips.textContent = grenades > 0 ? '●' : '○';
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyEl.textContent = `$${value}`;
    },
    setTimer(text) {
      if (text === lastTimer) return;
      lastTimer = text;
      timerEl.textContent = text;
    },
    setScore(a, b, round, playerTeam) {
      const key = `${a}-${b}-${round}-${playerTeam}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreA.textContent = String(a);
      scoreB.textContent = String(b);
      roundNum.textContent = `ROUND ${round} · YOU: ${playerTeam === 'A' ? 'VANGUARD' : 'WARDENS'}`;
    },
    setAlive(a, b) {
      const key = `${a}-${b}`;
      if (key === lastAlive) return;
      lastAlive = key;
      aliveA.textContent = `▲ ${a}`;
      aliveB.textContent = `▼ ${b}`;
    },
    setBomb(text, fuseFrac, carrying) {
      const key = `${text}-${Math.round(fuseFrac * 20)}-${carrying}`;
      if (key === lastBomb) return;
      lastBomb = key;
      bombStatus.textContent = text;
      fuseBar.style.width = `${Math.max(0, Math.min(1, fuseFrac)) * 100}%`;
      carryInd.hidden = !carrying;
    },
    setProgress(label, frac) {
      if (!label) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      progressLabel.textContent = label;
      progressBar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => vignette.classList.remove('on'), 140);
    },
    setFeed(entries) {
      const head = entries.length ? entries[0].id : -1;
      if (head === lastFeedHead) return;
      lastFeedHead = head;
      killfeed.innerHTML = '';
      for (const e of entries) {
        const row = document.createElement('div');
        row.className = 'feed-row';
        const k = document.createElement('b');
        k.textContent = e.killer;
        k.style.color = e.killerTeam === 'A' ? '#e8542f' : '#3f8fe0';
        const w = document.createElement('span');
        w.textContent = ` ${e.weapon}${e.headshot ? ' (headshot)' : ''} `;
        const v = document.createElement('b');
        v.textContent = e.victim;
        row.append(k, w, v);
        killfeed.appendChild(row);
      }
    },
    banner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      bannerEl.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        bannerEl.hidden = true;
      }, ms);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      bannerEl.hidden = true;
    },
    showBuy(items, money) {
      buyMenu.hidden = false;
      buyMoney.textContent = `$${money}`;
      buyItems.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'buy-row';
        row.dataset.key = item.key;
        if (money < item.price) row.classList.add('poor');
        const k = document.createElement('kbd');
        k.textContent = item.key;
        const n = document.createElement('b');
        n.textContent = item.name;
        const p = document.createElement('span');
        p.textContent = `$${item.price}`;
        const b = document.createElement('small');
        b.textContent = item.blurb;
        row.append(k, n, p, b);
        buyItems.appendChild(row);
      }
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    buyResult(key, ok) {
      const row = buyItems.querySelector(`[data-key="${key}"]`);
      if (!row) return;
      row.classList.add(ok ? 'bought' : 'denied');
      setTimeout(() => row.classList.remove('bought', 'denied'), 350);
    },
    setScoped(on) {
      scopeEl.hidden = !on;
      crosshair.style.opacity = on ? '0' : '';
    },
    showOverlay(mode, data) {
      if (mode === 'matchEnd') {
        title.textContent = data.winner ? `${data.winner === data.playerTeam ? 'Victory' : 'Defeat'} — ${data.scoreA} : ${data.scoreB}` : `Draw — ${data.scoreA} : ${data.scoreB}`;
        copy.textContent = `You finished ${data.kills} kills and ${data.deaths} deaths across ${data.rounds} rounds.`;
        play.textContent = 'Play again';
      } else {
        const text = COPY[mode];
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    setMinimap(player, allies, enemies, bomb) {
      drawMinimap(player, allies, enemies, bomb);
    },
  };
}
