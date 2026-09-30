// Udtale-træner for blødt d. UI-tilstand, lyd, statistik og de to øvelser.
(function () {
  var D = window.UDTALE_DATA;
  var STATS_KEY = 'udtale_stats';
  var VOICE_KEY = 'tts_voice'; // samme nøgle som Stavehjælpen, så stemmevalget følger med
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
  function isoDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function today() { return isoDate(new Date()); }
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); }
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
        if (parsed && parsed.words && Array.isArray(parsed.rounds)) return parsed;
      }
    } catch (e) { /* ugyldigt eller utilgængeligt: start forfra */ }
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
    var handled = false;
    function fallback(err) {
      if (handled || currentAudio !== a) return; // forældet eller allerede håndteret
      if (err && err.name === 'AbortError') return; // vi stoppede den selv
      handled = true;
      if (err && err.name === 'NotAllowedError') { showNote('Tryk "Hør igen" for at høre ordet'); return; }
      speakFallback(text);
    }
    a.onerror = function () { fallback(); };
    var p = a.play();
    if (p && p.catch) p.catch(fallback);
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

  // ---------- Optagelse ----------
  // Elevens egen optagelse lever kun til næste ord. Afspilles efter modellen så han hører sig selv udefra.
  var rec = {
    supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),
    stream: null, recorder: null, chunks: [], blob: null, url: null, active: false
  };
  function recMime() {
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    return '';
  }
  function clearRecording() {
    if (rec.url) URL.revokeObjectURL(rec.url);
    rec.blob = null; rec.url = null; rec.chunks = [];
  }
  function startRecording() {
    stopAudio();
    function go(stream) {
      rec.stream = stream;
      clearRecording();
      var mime = recMime();
      try { rec.recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
      catch (e) { showNote('Optagelse virker ikke i denne browser'); return; }
      rec.recorder.ondataavailable = function (e) { if (e.data && e.data.size) rec.chunks.push(e.data); };
      rec.recorder.onstop = function () {
        rec.blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || mime || 'audio/webm' });
        rec.url = URL.createObjectURL(rec.blob);
        rec.active = false;
        if (sig) renderSig();
      };
      rec.recorder.start();
      rec.active = true;
      if (sig) renderSig();
    }
    if (rec.stream && rec.stream.active) { go(rec.stream); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(go).catch(function (err) {
      showNote(err && err.name === 'NotAllowedError' ? 'Mikrofon ikke tilladt. Tillad den i browseren for at optage' : 'Kunne ikke starte mikrofonen');
    });
  }
  function stopRecording() {
    if (rec.recorder && rec.recorder.state !== 'inactive') rec.recorder.stop();
    else rec.active = false;
  }
  function releaseMic() {
    stopRecording();
    if (rec.stream) { rec.stream.getTracks().forEach(function (t) { t.stop(); }); rec.stream = null; }
    clearRecording();
  }
  // Spiller modellen og derefter elevens optagelse i samme Audio-element (iOS tillader kun afspilning fra et element der er startet ved et tryk)
  function playModelThenRecording(it) {
    if (!rec.url) return;
    stopAudio();
    var a = new Audio(D.audioPath(it.word, it.kind === 'sentence' ? 'sentence' : 'word', suffix()));
    currentAudio = a;
    var ownStarted = false;
    function playOwn() {
      if (ownStarted || currentAudio !== a) return; // afbrudt
      ownStarted = true;
      a.onended = null; a.onerror = null;
      a.src = rec.url;
      var p = a.play();
      if (p && p.catch) p.catch(function (err) { if (!err || err.name !== 'AbortError') showNote('Kunne ikke afspille optagelsen'); });
    }
    a.onended = function () { setTimeout(playOwn, 400); };
    a.onerror = playOwn; // ingen modelfil: spil kun optagelsen
    var p = a.play();
    if (p && p.catch) p.catch(function (err) { if (!err || err.name !== 'AbortError') playOwn(); });
  }

  // ---------- Faner ----------
  var activeTab = 'home';
  function showTab(id) {
    if (id === activeTab && tiers) return; // gentryk må ikke genstarte en runde
    activeTab = id;
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === id);
    var panels = document.querySelectorAll('.tab-panel');
    for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('active', panels[j].id === 'tab-' + id);
    stopAudio();
    releaseMic();
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
  function startLyt() {
    var items = sample(tiers.pair, ROUND_SIZE).map(function (p) {
      var side = Math.random() < 0.5 ? 0 : 1;
      return { pair: p.pair, target: p.pair[side], order: shuffle(p.pair) };
    });
    lyt = { items: items, index: 0, score: 0, answered: false };
    renderLyt();
    playLytItem();
  }
  function playLytItem() {
    var it = lyt.items[lyt.index];
    play(it.target, 'word', it.target);
  }
  function renderLyt() {
    var area = $('lytArea');
    if (lyt.index >= lyt.items.length) {
      area.innerHTML =
        '<div class="progress">Færdig</div>' +
        '<div class="target">' + lyt.score + ' / ' + lyt.items.length + '</div>' +
        '<p class="note">' + (lyt.score === lyt.items.length ? 'Alle rigtige. Forskellen høres tydeligt.' : 'Hvis der er flere fejl over flere runder, så nævn det i forløbet på skolen.') + '</p>' +
        '<button class="big" type="button" data-action="restart">En runde til</button>';
      return;
    }
    var it = lyt.items[lyt.index];
    area.innerHTML =
      '<div class="progress">Lyt · ' + (lyt.index + 1) + ' / ' + lyt.items.length + '</div>' +
      '<p class="note">Tryk på det ord du hørte.</p>' +
      '<button class="big secondary" type="button" data-action="hear">Hør igen</button>' +
      '<div class="choices">' + it.order.map(function (w) {
        return '<button class="big" type="button" data-action="choose" data-value="' + esc(w) + '">' + esc(w) + '</button>';
      }).join('') + '</div>' +
      '<div class="feedback"></div>' +
      '<button class="big hidden" type="button" data-action="next">Næste</button>';
  }
  function answerLyt(chosen) {
    if (lyt.answered) return;
    lyt.answered = true;
    var it = lyt.items[lyt.index];
    var ok = chosen === it.target;
    if (ok) lyt.score++;
    var area = $('lytArea');
    var btns = area.querySelectorAll('.choices .big');
    for (var i = 0; i < btns.length; i++) {
      var w = btns[i].getAttribute('data-value');
      if (w === it.target) btns[i].classList.add('correct');
      else if (w === chosen) btns[i].classList.add('wrong');
      btns[i].disabled = true;
    }
    var fb = area.querySelector('.feedback');
    fb.textContent = ok ? 'Rigtigt' : 'Det var "' + it.target + '"';
    fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
    area.querySelector('[data-action="next"]').classList.remove('hidden');
  }
  function nextLyt() {
    lyt.index++;
    lyt.answered = false;
    if (lyt.index >= lyt.items.length) recordRound('lyt', lyt.score, lyt.items.length);
    renderLyt();
    if (lyt.index < lyt.items.length) playLytItem();
  }
  function onLytClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'hear') playLytItem();
    else if (action === 'choose') answerLyt(btn.getAttribute('data-value'));
    else if (action === 'next') nextLyt();
    else if (action === 'restart') startLyt();
  }

  // ---------- Sig det ----------
  var sig = null;
  var SENTENCE_OK = 'Alle d\'er ramte';
  var SENTENCE_BAD = 'Et eller flere blev til j';

  function renderSigPicker() {
    sig = null;
    $('sigArea').innerHTML =
      '<div class="progress">Vælg trin</div>' +
      '<div class="tierlist">' + D.TIERS.map(function (t) {
        return '<button class="big" type="button" data-action="tier" data-value="' + t.id + '">' +
          esc(t.label) + ' <small>' + esc(t.desc) + ' · ' + tiers[t.id].length + ' stk</small></button>';
      }).join('') + '</div>';
  }

  // Laver et rundeelement ud fra et trin-element. Kilden gemmes så "Øv disse igen" kan genbruge den.
  function makeSigItem(tierId, src) {
    if (tierId === 'pair') {
      var target = src.pair[Math.random() < 0.5 ? 0 : 1];
      return { kind: 'pair', word: target, key: target, display: target, options: shuffle(src.pair), correct: target, source: src };
    }
    if (tierId === 'sentence') {
      return { kind: 'sentence', word: src.word, key: src.key, display: src.sentence, options: [SENTENCE_OK, SENTENCE_BAD], correct: SENTENCE_OK, source: src };
    }
    return { kind: 'word', word: src.word, key: src.key, display: src.word, options: shuffle([src.word, D.errorForm(src.word)]), correct: src.word, source: src };
  }

  // practice = true for "Øv disse igen": ordene tælles, men runden trækker ikke trin-procenten ned
  function startSig(tierId, pool, practice) {
    var items = sample(pool || tiers[tierId], ROUND_SIZE).map(function (src) { return makeSigItem(tierId, src); });
    sig = { tier: tierId, items: items, index: 0, phase: 'show', retry: false, score: 0, missed: [], practice: !!practice };
    renderSig();
  }

  function playSigItem() {
    var it = sig.items[sig.index];
    if (it.kind === 'sentence') play(it.word, 'sentence', it.display);
    else play(it.word, 'word', it.word);
  }

  function renderSig() {
    var area = $('sigArea');
    if (sig.index >= sig.items.length) { renderSigEnd(); return; }
    var it = sig.items[sig.index];
    var head = '<div class="progress">' + esc(tierLabel(sig.tier)) + ' · ' + (sig.index + 1) + ' / ' + sig.items.length + (sig.retry ? ' · øver igen' : '') + '</div>';
    var targetClass = 'target' + (it.kind === 'sentence' ? ' sentence' : '');

    var recBtn = !rec.supported ? '' :
      '<button class="big secondary' + (rec.active ? ' recording' : '') + '" type="button" data-action="rec">' + (rec.active ? '■ Stop' : '● Optag') + '</button>';
    var compareBtn = (rec.url && !rec.active)
      ? '<button class="big secondary" type="button" data-action="compare">Hør model + dig</button>' : '';

    if (sig.phase === 'show') {
      area.innerHTML = head +
        '<div class="' + targetClass + '">' + esc(it.display) + '</div>' +
        '<button class="big secondary" type="button" data-action="hear">Hør ' + (it.kind === 'sentence' ? 'sætningen' : 'ordet') + '</button>' +
        recBtn + compareBtn +
        '<button class="big" type="button" data-action="said">Jeg har sagt det</button>';
    } else if (sig.phase === 'judge') {
      area.innerHTML = head +
        '<div class="target hiddenword">Hvad hørte du?</div>' +
        '<div class="choices">' + it.options.map(function (o) {
          return '<button class="big" type="button" data-action="judge" data-value="' + esc(o) + '">' + esc(o) + '</button>';
        }).join('') + '</div>' + compareBtn;
    } else {
      var ok = sig.lastOk;
      var verdict = ok ? 'Ramte den' : (it.kind === 'pair' ? 'Lød som "' + esc(sig.lastChosen) + '"' : 'Blev til j');
      area.innerHTML = head +
        '<div class="' + targetClass + '">' + esc(it.display) + '</div>' +
        '<div class="feedback ' + (ok ? 'ok' : 'bad') + '">' + verdict + '</div>' +
        compareBtn +
        '<button class="big secondary" type="button" data-action="retry">Prøv igen</button>' +
        '<button class="big" type="button" data-action="next">Næste</button>';
    }
  }

  function judgeSig(chosen) {
    var it = sig.items[sig.index];
    var ok = chosen === it.correct;
    sig.lastOk = ok;
    sig.lastChosen = chosen;
    if (!sig.retry) {
      if (ok) sig.score++; else sig.missed.push({ source: it.source, label: it.kind === 'pair' ? it.word : it.key.replace('sentence:', '') });
      recordWord(it.key, ok);
    }
    sig.phase = 'reveal';
    renderSig();
  }

  function renderSigEnd() {
    var area = $('sigArea');
    var missedHtml = sig.missed.length
      ? '<div class="missed">' + sig.missed.map(function (m) {
          return '<span>' + esc(m.label) + '</span>';
        }).join('') + '</div>' +
        '<button class="big" type="button" data-action="again">Øv disse igen</button>'
      : '<p class="note">Ingen fejl i denne runde.</p>';
    area.innerHTML =
      '<div class="progress">' + esc(tierLabel(sig.tier)) + ' · færdig</div>' +
      '<div class="target">' + sig.score + ' / ' + sig.items.length + '</div>' +
      missedHtml +
      '<button class="big secondary" type="button" data-action="restart">Ny runde, samme trin</button>' +
      '<button class="big secondary" type="button" data-action="picker">Vælg trin</button>';
  }

  function onSigClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'tier') { clearRecording(); startSig(btn.getAttribute('data-value')); return; }
    if (!sig) return;
    if (action === 'hear') playSigItem();
    else if (action === 'rec') { if (rec.active) stopRecording(); else startRecording(); }
    else if (action === 'compare') playModelThenRecording(sig.items[sig.index]);
    else if (action === 'said') { stopAudio(); stopRecording(); sig.phase = 'judge'; renderSig(); }
    else if (action === 'judge') judgeSig(btn.getAttribute('data-value'));
    else if (action === 'retry') { clearRecording(); sig.retry = true; sig.phase = 'show'; renderSig(); }
    else if (action === 'next') {
      clearRecording();
      sig.index++; sig.retry = false; sig.phase = 'show';
      if (sig.index >= sig.items.length && !sig.practice) recordRound(sig.tier, sig.score, sig.items.length);
      renderSig();
    }
    else if (action === 'again') { clearRecording(); startSig(sig.tier, sig.missed.map(function (m) { return m.source; }), true); }
    else if (action === 'restart') { clearRecording(); startSig(sig.tier); }
    else if (action === 'picker') { clearRecording(); renderSigPicker(); }
  }

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
    $('lytArea').addEventListener('click', onLytClick);
    $('sigArea').addEventListener('click', onSigClick);
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); };
    }

    fetch('words.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (bank) { tiers = D.buildTiers(bank); showTab(activeTab); })
      .catch(function () {
        var msg = '<p class="feedback bad">Kunne ikke hente ordbanken. Genindlæs siden.</p>';
        $('statsBox').innerHTML = msg; $('lytArea').innerHTML = msg; $('sigArea').innerHTML = msg;
      });
  }
  init();
})();
