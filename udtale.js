// Udtale-træner for blødt d. UI-tilstand, lyd, statistik og de to øvelser.
(function () {
  var D = window.UDTALE_DATA;
  var STATS_KEY = 'udtale_stats';
  var VOICE_KEY = 'udtale_voice';
  var ROUND_SIZE = 10;

  var tiers = null;
  var voice = 'female';
  var storageOk = true;
  var stats = loadStats();
  var currentAudio = null;
  var noteTimer = null;

  // ---------- Hjælpere ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
  function tierLabel(id) {
    for (var i = 0; i < D.TIERS.length; i++) if (D.TIERS[i].id === id) return D.TIERS[i].label;
    return id;
  }
  function showNote(text) {
    var el = $('audioNote');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { el.classList.add('hidden'); }, 3000);
  }

  // ---------- Statistik ----------
  function loadStats() {
    try {
      var raw = localStorage.getItem(STATS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.words && parsed.rounds) return parsed;
      }
    } catch (e) { storageOk = false; }
    return { words: {}, rounds: [] };
  }
  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); }
    catch (e) { storageOk = false; }
  }
  function recordWord(key, ok) {
    var s = stats.words[key] || (stats.words[key] = { ok: 0, fail: 0, last: null });
    if (ok) s.ok++; else s.fail++;
    s.last = today();
    saveStats();
  }
  function recordRound(tier, score, total) {
    stats.rounds.push({ date: today(), tier: tier, score: score, total: total });
    if (stats.rounds.length > 200) stats.rounds = stats.rounds.slice(-200);
    saveStats();
  }
  function resetStats() {
    if (!confirm('Slet al statistik?')) return;
    stats = { words: {}, rounds: [] };
    saveStats();
    renderStats();
  }

  // ---------- Lyd ----------
  function suffix() { return voice === 'male' ? '_m' : ''; }
  function stopAudio() {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
  // kind: 'word' eller 'sentence'. Falder tilbage på browser-stemme hvis filen mangler.
  function play(word, kind, text) {
    stopAudio();
    var a = new Audio(D.audioPath(word, kind, suffix()));
    currentAudio = a;
    a.onerror = function () { speakFallback(text); };
    var p = a.play();
    if (p && p.catch) p.catch(function () { speakFallback(text); });
  }
  function speakFallback(text) {
    if (!window.speechSynthesis) { showNote('Ingen dansk stemme, læs ordet højt selv'); return; }
    var voices = window.speechSynthesis.getVoices();
    var v = null;
    for (var i = 0; i < voices.length; i++) if (voices[i].lang.indexOf('da') === 0) { v = voices[i]; break; }
    if (!v) { showNote('Ingen dansk stemme, læs ordet højt selv'); return; }
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'da-DK'; u.rate = 0.75; u.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    showNote('Lydfil mangler, bruger browser-stemme');
  }
  function setVoice(v) {
    voice = v === 'male' ? 'male' : 'female';
    try { localStorage.setItem(VOICE_KEY, voice); } catch (e) {}
    $('voiceBtn').textContent = 'Stemme: ' + (voice === 'male' ? 'mand' : 'kvinde');
  }

  // ---------- Faner ----------
  function showTab(id) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === id);
    var panels = document.querySelectorAll('.tab-panel');
    for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('active', panels[j].id === 'tab-' + id);
    stopAudio();
    if (!tiers) return;
    if (id === 'home') renderStats();
    if (id === 'lyt') startLyt();
    if (id === 'sig') renderSigPicker();
  }

  // ---------- Statistik-boks ----------
  function renderStats() {
    var box = $('statsBox');
    var week = daysAgo(7);
    var rows = D.TIERS.map(function (t) {
      var all = { s: 0, n: 0 }, recent = { s: 0, n: 0 };
      stats.rounds.forEach(function (r) {
        if (r.tier !== t.id) return;
        all.s += r.score; all.n += r.total;
        if (r.date >= week) { recent.s += r.score; recent.n += r.total; }
      });
      function pct(x) { return x.n ? Math.round(100 * x.s / x.n) + ' %' : '–'; }
      return '<tr><td>' + esc(t.label) + '</td><td class="num">' + pct(recent) + '</td><td class="num">' + pct(all) + '</td></tr>';
    }).join('');
    var worst = Object.keys(stats.words).map(function (k) {
      var s = stats.words[k];
      return { key: k, ok: s.ok, fail: s.fail };
    }).filter(function (w) { return w.ok + w.fail >= 2 && w.fail > 0; })
      .sort(function (a, b) { return b.fail - a.fail || a.ok - b.ok; }).slice(0, 5);
    var worstHtml = worst.length
      ? '<table><tr><th>Ord</th><th class="num">Fejl</th><th class="num">Rigtige</th></tr>' +
        worst.map(function (w) {
          var label = w.key.indexOf('sentence:') === 0 ? 'sætning: ' + w.key.slice(9) : w.key;
          return '<tr><td>' + esc(label) + '</td><td class="num">' + w.fail + '</td><td class="num">' + w.ok + '</td></tr>';
        }).join('') + '</table>'
      : '<p class="note">Ingen sværeste ord endnu. Øv en runde i "Sig det".</p>';
    box.className = 'card stats';
    box.innerHTML =
      '<h2>Rigtige</h2>' +
      '<table><tr><th>Trin</th><th class="num">7 dage</th><th class="num">Alt</th></tr>' + rows + '</table>' +
      '<h2>Sværeste ord</h2>' + worstHtml +
      (storageOk ? '' : '<p class="note">Kan ikke gemme statistik i denne browser. Den forsvinder når siden lukkes.</p>') +
      '<button class="big secondary" type="button" data-action="reset">Nulstil statistik</button>';
  }

  // ---------- Lyt ----------
  var lyt = null;
  function startLyt() { /* Task 5 */ }

  // ---------- Sig det ----------
  var sig = null;
  function renderSigPicker() { /* Task 6 */ }

  // ---------- Init ----------
  function init() {
    var savedVoice = 'female';
    try { savedVoice = localStorage.getItem(VOICE_KEY) || 'female'; } catch (e) {}
    setVoice(savedVoice);
    $('voiceBtn').addEventListener('click', function () { setVoice(voice === 'male' ? 'female' : 'male'); });
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function (e) { showTab(e.currentTarget.getAttribute('data-tab')); });
    }
    $('statsBox').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (btn && btn.getAttribute('data-action') === 'reset') resetStats();
    });
    if (window.speechSynthesis) window.speechSynthesis.getVoices();

    fetch('words.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (bank) { tiers = D.buildTiers(bank); renderStats(); })
      .catch(function () {
        $('statsBox').innerHTML = '<p class="feedback bad">Kunne ikke hente ordbanken. Genindlæs siden.</p>';
      });
  }
  init();
})();
