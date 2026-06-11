// sfx.js — WebAudio sound effects for Stavehjælpen.
// Loaded before app.js. Exposes a global SFX object. No dependencies.
// All sounds are synthesized (no audio files). SFX.play() is a silent
// no-op when muted or when WebAudio is unavailable.
(function () {
  var ctx = null;
  var muted = (function () { try { return localStorage.getItem('sound_muted') === '1'; } catch (e) { return false; } })();

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // iOS/Safari requires the AudioContext to be created/resumed inside a
  // user gesture. One-shot unlock on the first interaction.
  function unlock() {
    ensureCtx();
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  // One enveloped oscillator note.
  // opts: type ('sine'|'triangle'|'square'|'sawtooth'), vol, delay (s), slide (target Hz)
  function tone(freq, dur, opts) {
    opts = opts || {};
    var c = ensureCtx();
    if (!c) return;
    var t = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    var vol = opts.vol || 0.15;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Short filtered noise burst (impacts).
  function noise(dur, opts) {
    opts = opts || {};
    var c = ensureCtx();
    if (!c) return;
    var t = c.currentTime + (opts.delay || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource();
    src.buffer = buf;
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.cutoff || 700;
    var gain = c.createGain();
    gain.gain.setValueAtTime(opts.vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  var SOUNDS = {
    correct: function () {
      tone(523.25, 0.11, { type: 'triangle' });               // C5
      tone(659.25, 0.11, { type: 'triangle', delay: 0.09 });  // E5
      tone(783.99, 0.18, { type: 'triangle', delay: 0.18 });  // G5
    },
    wrong: function () {
      tone(220, 0.28, { type: 'sawtooth', slide: 110, vol: 0.1 });
    },
    letterCatch: function () {
      tone(660, 0.07, { type: 'square', vol: 0.06, slide: 990 });
    },
    bossHit: function () {
      noise(0.12, { vol: 0.22, cutoff: 500 });
      tone(150, 0.16, { type: 'square', vol: 0.14, slide: 55 });
    },
    bossDefeat: function () {
      // Rising arpeggio + final chord — doubles as the victory fanfare.
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], 0.14, { type: 'triangle', delay: i * 0.11 });
      }
      tone(1046.5, 0.5, { type: 'triangle', delay: 0.5, vol: 0.12 });
      tone(1318.5, 0.5, { type: 'triangle', delay: 0.5, vol: 0.1 });
    },
    chestOpen: function () {
      tone(392, 0.1, { type: 'triangle' });                    // G4
      tone(523.25, 0.1, { type: 'triangle', delay: 0.1 });
      tone(659.25, 0.25, { type: 'triangle', delay: 0.2 });
      tone(1318.5, 0.3, { type: 'sine', delay: 0.28, vol: 0.07 }); // sparkle
    },
    combo: function (n) {
      // Pitch rises with the streak; capped so it never gets shrill.
      var f = 440 * Math.pow(1.1225, Math.min(n || 2, 10));
      tone(f, 0.08, { type: 'square', vol: 0.06 });
      tone(f * 1.5, 0.1, { type: 'square', vol: 0.05, delay: 0.07 });
    },
    levelup: function () {
      var notes = [392, 523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], 0.13, { type: 'triangle', delay: i * 0.09 });
      }
    }
  };

  window.SFX = {
    play: function (name, arg) {
      if (muted) return;
      var fn = SOUNDS[name];
      if (!fn) return;
      try { fn(arg); } catch (e) { /* never break the game over a sound */ }
    },
    isMuted: function () { return muted; },
    toggleMute: function () {
      muted = !muted;
      try { localStorage.setItem('sound_muted', muted ? '1' : '0'); } catch (e) {}
      var btn = document.getElementById('muteBtn');
      if (btn) btn.textContent = muted ? '🔇' : '🔊';
      if (!muted) window.SFX.play('correct');
      return muted;
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('muteBtn');
    if (btn && muted) btn.textContent = '🔇';
  });
})();
