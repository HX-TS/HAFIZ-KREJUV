/* Visual playback of recorded pressure history; final readings stay exact. */
(() => {
  'use strict';
  const DURATION = 5200;
  const states = new Map();
  const replayButton = document.getElementById('pressure-replay');
  let frame = 0;
  let soundEnabled = true;
  let audioAttempted = false;
  let audioUnavailable = false;
  let lastEntry = -Infinity;
  let audio;
  let master;
  let clickNoise;
  let lastClick = -Infinity;

  function updateControls() {
    replayButton.disabled = ![...states.values()].some(state => state.history.length > 1);
    replayButton.title = 'Replay the recorded pressure history';
  }

  function show(state, number) {
    const value = number.toFixed(2);
    if (value === state.number.textContent) return false;
    state.number.textContent = value;
    return true;
  }

  function finish(state) {
    state.active = false;
    show(state, state.latest.value);
    state.card.classList.remove('is-replaying');
    state.card.setAttribute('aria-busy', 'false');
    state.note.textContent = 'Latest recorded · ' + state.latest.time + ' hrs';
  }

  function finishAll() {
    cancelAnimationFrame(frame);
    frame = 0;
    states.forEach(finish);
  }

  // A short synthesized click, inspired by a picker wheel, without an audio file.
  function tick(now) {
    if (!soundEnabled || !audio || audio.state !== 'running' || document.hidden || now - lastClick < 22) return;
    lastClick = now;
    const start = audio.currentTime;
    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const noiseGain = audio.createGain();
    noise.buffer = clickNoise;
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    noiseGain.gain.setValueAtTime(0.24, start);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, start + 0.014);
    noise.connect(filter).connect(noiseGain).connect(master);
    noise.start(start);
    noise.stop(start + 0.016);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); noiseGain.disconnect(); };
    const tone = audio.createOscillator();
    const toneGain = audio.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(1000, start);
    tone.frequency.exponentialRampToValueAtTime(650, start + 0.012);
    toneGain.gain.setValueAtTime(0.09, start);
    toneGain.gain.exponentialRampToValueAtTime(0.001, start + 0.014);
    tone.connect(toneGain).connect(master);
    tone.start(start);
    tone.stop(start + 0.016);
    tone.onended = () => { tone.disconnect(); toneGain.disconnect(); };
  }

  function advance(now) {
    frame = 0;
    let changed = false;
    for (const state of states.values()) {
      if (!state.active) continue;
      const progress = Math.min(1, (now - state.start) / DURATION);
      if (progress === 1) { changed = show(state, state.latest.value) || changed; finish(state); continue; }
      if (now < state.nextStep) continue;
      // Move through the recorded sequence quickly, then decelerate at the end.
      const position = (1 - Math.pow(1 - progress, 3)) * (state.path.length - 1);
      const index = Math.min(state.path.length - 2, Math.floor(position));
      const fraction = position - index;
      const value = state.path[index] + (state.path[index + 1] - state.path[index]) * fraction;
      changed = show(state, value) || changed;
      state.nextStep = now + 24 + 176 * Math.pow(progress, 3);
    }
    if (changed) {
      try { tick(now); }
      catch { soundEnabled = false; updateControls(); }
    }
    if ([...states.values()].some(state => state.active)) frame = requestAnimationFrame(advance);
  }

  function start(state) {
    if (document.hidden || state.path.length < 2) { finish(state); return; }
    state.active = true;
    state.start = performance.now();
    state.nextStep = state.start;
    state.card.classList.add('is-replaying');
    state.card.setAttribute('aria-busy', 'true');
    state.note.textContent = 'Replaying recorded log…';
    show(state, state.path[0]);
    if (!frame) frame = requestAnimationFrame(advance);
  }

  function replay() {
    for (const state of states.values()) {
      state.seenThisEntry = state.visible;
      state.path = state.history.map(point => point.value);
      start(state);
    }
  }

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = [...states.values()].find(item => item.card === entry.target);
      if (!state) continue;
      state.visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
      // Replay once when a card is first seen if the entry animation was missed.
      if (state.visible && !state.seenThisEntry) {
        state.seenThisEntry = true;
        if (!state.active || performance.now() - state.start > 600) {
          state.path = state.history.map(point => point.value);
          start(state);
        }
      }
    }
  }, { threshold: 0.2 }) : null;

  function updateCard(index, rows, column) {
    const card = document.querySelectorAll('.cards .card')[index];
    if (!card) return;
    const readings = rows.filter(row => Number.isFinite(row[column])).map(row => ({ time: row[0], value: row[column] }));
    const latest = readings.at(-1);
    if (!latest) {
      const previous = states.get(index);
      if (previous) { finish(previous); observer?.unobserve(card); states.delete(index); }
      card.querySelector('.value').innerHTML = '— <small>bar</small>';
      card.querySelector('.value').setAttribute('aria-label', 'No pressure reading recorded');
      card.querySelector('p').textContent = 'No reading recorded';
      updateControls();
      return;
    }
    let state = states.get(index);
    const previous = state?.latest;
    if (!state) {
      const value = card.querySelector('.value');
      value.innerHTML = '<span class="pressure-number" aria-hidden="true"></span> <small aria-hidden="true">bar</small>';
      value.setAttribute('role', 'img');
      state = { card, number: value.querySelector('.pressure-number'), note: card.querySelector('p'), visible: !observer, active: false, seenThisEntry: false };
      states.set(index, state);
      observer?.observe(card);
    }
    // Skip consecutive plateaus while retaining their latest recorded timestamp.
    const history = [];
    for (const point of readings) {
      if (history.length && history.at(-1).value === point.value) history[history.length - 1] = point;
      else history.push(point);
    }
    state.history = history;
    state.latest = latest;
    if (!audioAttempted) requestSound();
    state.card.querySelector('.value').setAttribute('aria-label', latest.value.toFixed(2) + ' bar, latest recorded at ' + latest.time + ' hours');
    updateControls();
    if (previous && previous.time === latest.time && previous.value === latest.value) return;
    if (previous && previous.value === latest.value) { finish(state); return; }
    // Initial/manual replay follows the log; new data animates from the prior value.
    state.path = previous ? [previous.value, ...history.filter(point => point.time > previous.time).map(point => point.value)] : history.map(point => point.value);
    if (state.path.at(-1) !== latest.value) state.path.push(latest.value);
    start(state);
  }

  function requestSound(replayAfterUnlock = false) {
    if (!soundEnabled || audioUnavailable || document.hidden) return;
    audioAttempted = true;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { audioUnavailable = true; updateControls(); return; }
    try {
      if (!audio || audio.state === 'closed' || !master || !clickNoise) {
        audio = new Audio();
        master = audio.createGain();
        master.gain.value = 0.35;
        master.connect(audio.destination);
        clickNoise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.016), audio.sampleRate);
        const samples = clickNoise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (samples.length / 4));
        audio.onstatechange = updateControls;
      }
      // Never wait for resume: blocked autoplay must not hold up the numbers.
      audio.resume().then(() => {
        if (!soundEnabled) return;
        master.gain.setValueAtTime(0.35, audio.currentTime);
        updateControls();
        if (replayAfterUnlock && audio.state === 'running' && ![...states.values()].some(state => state.active)) replay();
      }).catch(updateControls);
    } catch { /* A later user gesture can retry audio without affecting the readouts. */ }
    updateControls();
  }

  function enterPage() {
    const now = performance.now();
    if (now - lastEntry < 300 || document.hidden) return;
    lastEntry = now;
    requestSound();
    replay();
  }

  replayButton.addEventListener('click', () => { requestSound(); replay(); });
  document.addEventListener('pointerdown', event => {
    if (soundEnabled && audio?.state !== 'running') requestSound(true);
  }, { passive: true });
  document.addEventListener('keydown', event => {
    if (soundEnabled && audio?.state !== 'running') requestSound(true);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finishAll(); else enterPage(); });
  window.addEventListener('pagehide', finishAll);
  window.addEventListener('pageshow', event => { if (event.persisted) enterPage(); });
  window.addEventListener('beforeprint', finishAll);
  window.PressureReplay = Object.freeze({ updateCard });
  updateControls();
})();


