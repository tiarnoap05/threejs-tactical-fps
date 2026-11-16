// Every sound is synthesised with WebAudio: filtered noise bursts for gunfire, sine
// blips for beeps, a falling sine for the explosion. No audio files, no network, and
// the game's own sounds, not samples of anything else. The context starts on the
// first user gesture, as browsers require.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  function burst(dur, freq, q, gain, type = 'bandpass') {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.5, dur);
    src.stop(t + dur);
  }

  function tone(freq, dur, gain, slideTo = null, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  function click(delay = 0) {
    burst(0.03, 3000, 2, 0.25);
    void delay;
  }

  return {
    unlock,
    shot(id) {
      if (id === 'pistol') burst(0.09, 1800, 0.8, 0.5);
      else if (id === 'smg') burst(0.07, 2200, 0.8, 0.4);
      else if (id === 'rifle') burst(0.11, 1400, 0.8, 0.6);
      else if (id === 'sniper') {
        burst(0.22, 900, 0.6, 0.8);
        tone(120, 0.25, 0.4, 45);
      }
    },
    enemyShot(dist) {
      const gain = Math.max(0.08, 0.5 - dist * 0.012);
      burst(0.1, 1100, 0.7, gain);
    },
    reload() {
      click();
      setTimeout(click, 280);
    },
    dryFire() {
      click();
    },
    hit(kill) {
      tone(1250, 0.05, 0.3);
      if (kill) tone(1650, 0.09, 0.3, null, 0.06);
    },
    footstep() {
      burst(0.05, 300, 0.6, 0.12, 'lowpass');
    },
    beep() {
      tone(880, 0.06, 0.25);
    },
    explosion() {
      tone(70, 0.8, 0.9, 28);
      burst(0.6, 220, 0.4, 0.8, 'lowpass');
    },
    roundWin() {
      tone(523, 0.14, 0.3);
      tone(784, 0.22, 0.3, null, 0.13);
    },
    roundLose() {
      tone(392, 0.16, 0.3);
      tone(262, 0.26, 0.3, null, 0.15);
    },
    buy() {
      tone(660, 0.07, 0.25);
      tone(990, 0.09, 0.25, null, 0.07);
    },
    denied() {
      tone(220, 0.12, 0.25);
    },
  };
}
