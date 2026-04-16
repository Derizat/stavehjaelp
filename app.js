
// ===== KONSTANTER =====
var ONE_DAY_MS = 86400000;
var BOSS_TRIGGER_STREAK = 5;
var MAX_BOSSES_PER_SESSION = 2;
var MISSPELLING_CACHE_MS = 5 * 60 * 1000; // 5 minutter

// ===== MULTI-PROFIL SYSTEM =====
var activePlayer = '';

function playerKey(key) {
  return activePlayer + '_' + key;
}

function loadPlayersList() {
  try { var raw = localStorage.getItem('players_list'); return raw ? JSON.parse(raw) : []; } catch(e) { return []; }
}

function savePlayersList(list) {
  try { localStorage.setItem('players_list', JSON.stringify(list)); } catch(e) {}
}

function addPlayer(name) {
  var list = loadPlayersList();
  if (list.indexOf(name) === -1) { list.push(name); savePlayersList(list); }
}

function removePlayer(name) {
  if (!confirm('Slet spilleren "' + name + '" og al deres data?')) return;
  var list = loadPlayersList().filter(function(n) { return n !== name; });
  savePlayersList(list);
  ['profile_data', 'reward_data', 'sr_data', 'screening_data', 'student_grade'].forEach(function(k) {
    try { localStorage.removeItem(name + '_' + k); } catch(e) {}
  });
  renderProfilePicker();
}

function selectPlayer(name) {
  activePlayer = name;
  try { localStorage.setItem('last_player', name); } catch(e) {}
  // Sync from Supabase before showing welcome
  syncFromSupabase(name, function() {
    hide('phase-profile-picker');
    show('phase-welcome');
    var nameEl = document.getElementById('playerNameDisplay');
    if (nameEl) nameEl.textContent = activePlayer;
    updateWelcomeAvatar();
    renderCategoryLevels();
    restoreGradeSelection();
    updateDashboardButton();
    updateRewardBar();
    applyPlayerCosmetics();
  });
}

function switchPlayer() {
  // Nulstil kosmetik ved spillerskift
  applyTheme(null);
  applyNameStyle(null, null);
  // Flush pending sync for current player before switching
  if (syncTimer && activePlayer) { clearTimeout(syncTimer); doSyncToSupabase(activePlayer); syncTimer = null; }
  activePlayer = '';
  hide('phase-welcome');
  var panel = document.getElementById('settingsPanel');
  if (panel) panel.classList.remove('open');
  show('phase-profile-picker');
  renderProfilePicker();
}

function renderProfilePicker() {
  var list = loadPlayersList();
  var grid = document.getElementById('profilePickerGrid');

  // Merge with Supabase players
  if (supabaseClient) {
    supabaseClient.from('profiles').select('player').then(function(res) {
      if (res.data) {
        var changed = false;
        res.data.forEach(function(row) {
          if (list.indexOf(row.player) === -1) {
            list.push(row.player);
            changed = true;
          }
        });
        if (changed) { savePlayersList(list); renderProfilePickerGrid(list); }
      }
    }).catch(function() {});
  }

  renderProfilePickerGrid(list);
}

function renderProfilePickerGrid(list) {
  var grid = document.getElementById('profilePickerGrid');
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var name = list[i];
    var emoji = '\u{1F98A}';
    var nameStyle = '';
    try {
      var raw = localStorage.getItem(name + '_reward_data');
      if (raw) { var rd = JSON.parse(raw); var lvl = getAvatarLevel(rd.totalXP || 0); var dispIdx = rd.displayedLevel || 0; var dispLvl = AVATAR_LEVELS[dispIdx] || AVATAR_LEVELS[0]; emoji = dispLvl.image ? '<img src="' + dispLvl.image + '" style="width:2.5rem;height:2.5rem;object-fit:contain">' : dispLvl.emoji; nameStyle = dispLvl.titleStyle || ''; }
    } catch(e) {}
    html += '<button class="profile-picker-btn" onclick="selectPlayer(\'' + name.replace(/'/g, "\\'") + '\')">';
    html += '<span class="pp-emoji">' + emoji + '</span>';
    html += '<span class="pp-name" style="' + nameStyle + '">' + name + '</span>';
    html += '<span class="pp-delete" onclick="event.stopPropagation();removePlayer(\'' + name.replace(/'/g, "\\'") + '\')">\u2717 slet</span>';
    html += '</button>';
  }
  html += '<button class="profile-picker-btn pp-new" onclick="showNewPlayerForm()">';
  html += '<span class="pp-emoji">&#x2795;</span><span class="pp-name">Ny spiller</span></button>';
  grid.innerHTML = html;
  hide('newPlayerForm');
}

function showNewPlayerForm() {
  show('newPlayerForm');
  var inp = document.getElementById('newPlayerInput');
  inp.value = ''; inp.focus();
}

function cancelNewPlayer() { hide('newPlayerForm'); }

function confirmNewPlayer() {
  var inp = document.getElementById('newPlayerInput');
  var name = inp.value.trim();
  if (!name) return;
  if (loadPlayersList().indexOf(name) !== -1) { alert('Der findes allerede en spiller med det navn.'); return; }
  addPlayer(name);
  selectPlayer(name);
}

function migrateOldData() {
  var list = loadPlayersList();
  if (list.length > 0) return false;
  var hasOld = localStorage.getItem(playerKey('profile_data')) || localStorage.getItem(playerKey('reward_data')) || localStorage.getItem(playerKey('sr_data'));
  if (!hasOld) return false;
  var migrateName = 'Spiller 1';
  ['profile_data', 'reward_data', 'sr_data', 'screening_data', 'student_grade'].forEach(function(k) {
    var val = localStorage.getItem(k);
    if (val) { localStorage.setItem(migrateName + '_' + k, val); localStorage.removeItem(k); }
  });
  addPlayer(migrateName);
  return true;
}

// ===== SUPABASE =====
var supabaseClient = null;
try {
  supabaseClient = window.supabase.createClient(
    'https://cfkddsiwwujbbxjuthie.supabase.co',
    'sb_publishable_kPzQnAh0XICjtfZ_HszoRw_GEeMrgJt'
  );
} catch(e) { console.log('Supabase ikke tilg\u00E6ngelig'); }

// --- Batched answer logging ---
var answerQueue = [];
var answerFlushTimer = null;

function logAnswer(word, answer, correct, attempt, category, level) {
  // Update local word stats
  updateWordStats(word, correct, category);
  if (!supabaseClient || !activePlayer) return;
  var grade = 0;
  try { grade = parseInt(localStorage.getItem(playerKey('student_grade'))) || 0; } catch(e) {}
  answerQueue.push({
    player: activePlayer, word: word, answer: answer, correct: correct,
    attempt: attempt, category: category || null, level: level || 0, grade: grade
  });
  if (answerFlushTimer) clearTimeout(answerFlushTimer);
  answerFlushTimer = setTimeout(flushAnswers, 3000);
}

function loadWordStats() {
  try { var raw = localStorage.getItem(playerKey('word_stats')); return raw ? JSON.parse(raw) : {}; } catch(e) { return {}; }
}

function saveWordStats(stats) {
  try { localStorage.setItem(playerKey('word_stats'), JSON.stringify(stats)); } catch(e) {}
}

function updateWordStats(word, correct, category) {
  var stats = loadWordStats();
  var key = word.toLowerCase();
  if (!stats[key]) stats[key] = { word: word, correct: 0, wrong: 0, category: category || '' };
  if (correct) { stats[key].correct++; stats[key].streak = (stats[key].streak || 0) + 1; }
  else { stats[key].wrong++; stats[key].streak = 0; }
  if (category) stats[key].category = category;
  saveWordStats(stats);
}

function flushAnswers() {
  if (!supabaseClient || answerQueue.length === 0) return;
  var batch = answerQueue.splice(0, answerQueue.length);
  supabaseClient.from('answers').insert(batch).then(function(res) {
    if (res.error) console.warn('Supabase batch log fejl:', res.error.message);
  });
}

// --- Debounced profile sync ---
var syncTimer = null;

function syncToSupabase() {
  if (!supabaseClient || !activePlayer) return;
  var playerToSync = activePlayer;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(function() { doSyncToSupabase(playerToSync); }, 2000);
}

function doSyncToSupabase(forPlayer) {
  if (!supabaseClient) return;
  var p = forPlayer || activePlayer;
  if (!p) return;
  var profileData = null, rewardData = null, srData = null, grade = 0;
  try { profileData = JSON.parse(localStorage.getItem(p + '_profile_data') || 'null'); } catch(e) {}
  try { rewardData = JSON.parse(localStorage.getItem(p + '_reward_data') || 'null'); } catch(e) {}
  try { srData = JSON.parse(localStorage.getItem(p + '_sr_data') || 'null'); } catch(e) {}
  try { grade = parseInt(localStorage.getItem(p + '_student_grade')) || 0; } catch(e) {}
  var wordStats = null;
  try { wordStats = JSON.parse(localStorage.getItem(p + '_word_stats') || 'null'); } catch(e) {}
  supabaseClient.from('profiles').upsert({
    player: p,
    profile_data: profileData,
    reward_data: rewardData,
    sr_data: srData,
    student_grade: grade,
    word_stats: wordStats,
    updated_at: new Date().toISOString()
  }, { onConflict: 'player' }).then(function(res) {
    if (res.error) console.warn('Supabase sync fejl:', res.error.message);
  });
}

// Flush on page unload
window.addEventListener('beforeunload', function() {
  flushAnswers();
  if (syncTimer) { clearTimeout(syncTimer); doSyncToSupabase(); }
});

// Safely load, merge, and save a localStorage JSON field
function mergeLocalField(key, remoteData, mergeFn) {
  if (!remoteData) return;
  try {
    var local = JSON.parse(localStorage.getItem(key) || 'null');
    var merged = mergeFn ? mergeFn(local, remoteData) : remoteData;
    localStorage.setItem(key, JSON.stringify(merged));
  } catch(e) {}
}

function syncFromSupabase(name, callback) {
  if (!supabaseClient) { if (callback) callback(); return; }
  supabaseClient.from('profiles').select('*').eq('player', name).single().then(function(res) {
    if (res.data) {
      mergeLocalField(name + '_profile_data', res.data.profile_data, function(local, remote) {
        if (local && local.categoryLevels && !remote.categoryLevels) remote.categoryLevels = local.categoryLevels;
        return remote;
      });
      mergeLocalField(name + '_reward_data', res.data.reward_data, function(local, remote) {
        if (local) {
          if ((local.totalXP || 0) > (remote.totalXP || 0)) remote.totalXP = local.totalXP;
          if ((local.gems || 0) > (remote.gems || 0)) remote.gems = local.gems;
        }
        return remote;
      });
      mergeLocalField(name + '_sr_data', res.data.sr_data);
      mergeLocalField(name + '_word_stats', res.data.word_stats, function(local, remote) {
        var merged = local || {};
        for (var wk in remote) {
          if (!merged[wk]) { merged[wk] = remote[wk]; }
          else {
            merged[wk].correct = Math.max(merged[wk].correct || 0, remote[wk].correct || 0);
            merged[wk].wrong = Math.max(merged[wk].wrong || 0, remote[wk].wrong || 0);
          }
        }
        return merged;
      });
      if (res.data.student_grade !== null) {
        try { localStorage.setItem(name + '_student_grade', res.data.student_grade.toString()); } catch(e) {}
      }
    }
    if (callback) callback();
  }).catch(function() { if (callback) callback(); });
}

// ===== KLASSER (CLASSES) =====
var JOIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateJoinCode() {
  var code = '';
  for (var i = 0; i < 3; i++) {
    code += JOIN_CODE_CHARS.charAt(Math.floor(Math.random() * JOIN_CODE_CHARS.length));
  }
  return code;
}

function isTeacher() {
  var rd = loadRewardData();
  return rd.isTeacher || false;
}

function toggleTeacherMode() {
  var rd = loadRewardData();
  rd.isTeacher = !rd.isTeacher;
  saveRewardData(rd);
  renderClassSettings();
  updateDashboardButton();
}

function updateDashboardButton() {
  var btn = document.getElementById('dashboardBtn');
  if (btn) btn.style.display = isTeacher() ? 'block' : 'none';
}

async function createClass(name) {
  if (!supabaseClient) { alert('Kr\u00e6ver internetforbindelse'); return; }
  if (!name || !name.trim()) { alert('Indtast et klassenavn'); return; }
  name = name.trim();

  var code, exists = true;
  for (var attempt = 0; attempt < 10 && exists; attempt++) {
    code = generateJoinCode();
    var check = await supabaseClient.from('groups').select('id').eq('join_code', code);
    exists = check.data && check.data.length > 0;
  }
  if (exists) { alert('Kunne ikke generere unik kode. Pr\u00f8v igen.'); return; }

  var res = await supabaseClient.from('groups').insert({
    name: name, join_code: code, type: 'class', created_by: activePlayer
  }).select().single();

  if (res.error) { alert('Fejl: ' + res.error.message); return; }

  await supabaseClient.from('group_members').insert({
    group_id: res.data.id, player: activePlayer, role: 'teacher'
  });

  renderClassSettings();
}

async function deleteClass(groupId, groupName) {
  if (!confirm('Slet klassen "' + groupName + '"? Alle elever fjernes.')) return;
  if (!supabaseClient) return;
  await supabaseClient.from('groups').delete().eq('id', groupId);
  renderClassSettings();
}

async function joinClass(joinCode) {
  if (!supabaseClient) { alert('Kr\u00e6ver internetforbindelse'); return; }
  if (!joinCode || joinCode.trim().length < 3) { alert('Indtast en gyldig klassekode'); return; }
  joinCode = joinCode.trim().toUpperCase();

  var res = await supabaseClient.from('groups').select('id, name').eq('join_code', joinCode).single();
  if (res.error || !res.data) { alert('Ingen klasse fundet med koden "' + joinCode + '"'); return; }

  var memberRes = await supabaseClient.from('group_members').insert({
    group_id: res.data.id, player: activePlayer, role: 'student'
  });
  if (memberRes.error) {
    if (memberRes.error.message.indexOf('duplicate') !== -1 || memberRes.error.code === '23505') {
      alert('Du er allerede tilmeldt denne klasse');
    } else {
      alert('Fejl: ' + memberRes.error.message);
    }
    return;
  }

  alert('Tilmeldt klassen "' + res.data.name + '"!');
  renderClassSettings();
}

async function leaveClass(groupId, groupName) {
  if (!confirm('Forlad klassen "' + groupName + '"?')) return;
  if (!supabaseClient) return;
  await supabaseClient.from('group_members').delete().eq('group_id', groupId).eq('player', activePlayer);
  renderClassSettings();
}

async function removeStudentFromClass(groupId, playerName, groupName) {
  if (!confirm('Fjern "' + playerName + '" fra "' + groupName + '"?')) return;
  if (!supabaseClient) return;
  await supabaseClient.from('group_members').delete().eq('group_id', groupId).eq('player', playerName);
  // Reload current class overview if on dashboard
  if (dashboardCurrentClass && dashboardCurrentClass.id === groupId) {
    loadClassOverview(groupId, dashboardTimeFilter);
  }
}

function copyJoinCode(code) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(function() {
      var el = document.getElementById('copyFeedback_' + code);
      if (el) { el.textContent = 'Kopieret!'; setTimeout(function() { el.textContent = ''; }, 2000); }
    });
  } else {
    prompt('Kopier denne kode:', code);
  }
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function renderClassSettings() {
  var container = document.getElementById('classSettingsContent');
  if (!container) return;

  var html = '';

  html += '<label class="teacher-toggle-wrap">' +
    '<input type="checkbox" onchange="toggleTeacherMode()" ' + (isTeacher() ? 'checked' : '') + '>' +
    '<span>Jeg er l\u00e6rer</span></label>';

  if (!supabaseClient) {
    html += '<p style="font-size:0.82rem;color:var(--muted);margin-top:8px">Klassefunktionen kr\u00e6ver internetforbindelse.</p>';
    container.innerHTML = html;
    return;
  }

  var memberships = [];
  try {
    var memRes = await supabaseClient.from('group_members').select('group_id, role, groups(id, name, join_code, type, created_by)').eq('player', activePlayer);
    if (memRes.data) memberships = memRes.data;
  } catch(e) {}

  var teacherClasses = memberships.filter(function(m) { return m.role === 'teacher'; });
  var studentClasses = memberships.filter(function(m) { return m.role === 'student'; });

  if (isTeacher()) {
    html += '<div style="margin-top:12px;margin-bottom:6px;font-size:0.85rem;font-weight:700;color:var(--accent)">Mine klasser</div>';

    if (teacherClasses.length === 0) {
      html += '<p style="font-size:0.82rem;color:var(--muted)">Du har ingen klasser endnu.</p>';
    }
    for (var i = 0; i < teacherClasses.length; i++) {
      var g = teacherClasses[i].groups;
      html += '<div class="class-item">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<strong style="font-size:0.9rem;color:var(--text)">' + escapeHtml(g.name) + '</strong>' +
        '<span class="teacher-badge teacher">L\u00e6rer</span></div>' +
        '<div class="join-code-display" onclick="copyJoinCode(\'' + g.join_code + '\')" title="Klik for at kopiere">' +
        g.join_code + '</div>' +
        '<span id="copyFeedback_' + g.join_code + '" style="font-size:0.75rem;color:var(--green);display:block;text-align:center;min-height:1.2em"></span>' +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<button class="btn btn-blue" style="flex:1;font-size:0.8rem;padding:8px" onclick="showClassDashboard(\'' + g.id + '\', \'' + escapeHtml(g.name).replace(/'/g, "\\'") + '\')">Dashboard</button>' +
        '<button class="btn" style="flex:0;font-size:0.8rem;padding:8px;background:var(--red);color:white" onclick="deleteClass(\'' + g.id + '\', \'' + escapeHtml(g.name).replace(/'/g, "\\'") + '\')">Slet</button>' +
        '</div></div>';
    }

    html += '<div style="margin-top:10px;display:flex;gap:6px">' +
      '<input type="text" id="newClassNameInput" class="settings-input" placeholder="Klassenavn, fx &#34;6b Skovskolen&#34;" style="flex:1;margin:0" />' +
      '<button class="btn btn-green" style="font-size:0.8rem;padding:8px 14px;white-space:nowrap" onclick="createClass(document.getElementById(\'newClassNameInput\').value)">Opret</button>' +
      '</div>';
  }

  html += '<div style="margin-top:14px;margin-bottom:6px;font-size:0.85rem;font-weight:700;color:var(--accent)">Tilmeld klasse</div>';
  html += '<div style="display:flex;gap:6px">' +
    '<input type="text" id="joinCodeInput" class="settings-input" placeholder="Indtast klassekode" style="flex:1;margin:0;text-transform:uppercase;letter-spacing:2px" maxlength="3" />' +
    '<button class="btn btn-accent" style="font-size:0.8rem;padding:8px 14px;white-space:nowrap" onclick="joinClass(document.getElementById(\'joinCodeInput\').value)">Tilmeld</button>' +
    '</div>';

  if (studentClasses.length > 0) {
    html += '<div style="margin-top:12px;margin-bottom:6px;font-size:0.85rem;font-weight:700;color:var(--accent)">Tilmeldte klasser</div>';
    for (var j = 0; j < studentClasses.length; j++) {
      var sg = studentClasses[j].groups;
      html += '<div class="class-item">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<strong style="font-size:0.88rem;color:var(--text)">' + escapeHtml(sg.name) + '</strong>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="teacher-badge student">Elev</span>' +
        '<button class="btn" style="font-size:0.75rem;padding:4px 10px;background:var(--red);color:white" onclick="leaveClass(\'' + sg.id + '\', \'' + escapeHtml(sg.name).replace(/'/g, "\\'") + '\')">Forlad</button>' +
        '</div></div></div>';
    }
  }

  container.innerHTML = html;
}

// ===== KLASSE-DASHBOARD (FASE) =====
var dashboardClasses = [];
var dashboardCurrentClass = null;
var dashboardStudents = [];
var dashboardTimeFilter = 'all';

async function openDashboard() {
  if (!supabaseClient) { alert('Kr\u00e6ver internetforbindelse'); return; }
  hide('phase-welcome');
  show('phase-dashboard');
  document.getElementById('dashboardClassOverview').innerHTML = '';
  document.getElementById('dashboardStudentSection').style.display = 'none';
  document.getElementById('dashboardStudentDetail').innerHTML = '';

  // Load teacher's classes
  var select = document.getElementById('dashboardClassSelect');
  select.innerHTML = '<option value="">Indl\u00e6ser...</option>';

  var memRes = await supabaseClient.from('group_members').select('group_id, role, groups(id, name, join_code)').eq('player', activePlayer).eq('role', 'teacher');
  dashboardClasses = (memRes.data || []).map(function(m) { return m.groups; });

  if (dashboardClasses.length === 0) {
    select.innerHTML = '<option value="">Ingen klasser oprettet</option>';
    document.getElementById('dashboardClassOverview').innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px 0">Opret en klasse i Indstillinger f\u00f8rst.</p>';
    return;
  }

  select.innerHTML = '<option value="">-- V\u00e6lg klasse --</option>';
  for (var i = 0; i < dashboardClasses.length; i++) {
    var c = dashboardClasses[i];
    select.innerHTML += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
  }

  // Auto-select if only one class
  if (dashboardClasses.length === 1) {
    select.value = dashboardClasses[0].id;
    onDashboardClassChange();
  }
}

async function onDashboardClassChange() {
  var select = document.getElementById('dashboardClassSelect');
  var groupId = select.value;
  document.getElementById('dashboardStudentSection').style.display = 'none';
  document.getElementById('dashboardStudentDetail').innerHTML = '';
  document.getElementById('dashboardClassOverview').innerHTML = '';

  if (!groupId) return;
  dashboardCurrentClass = dashboardClasses.find(function(c) { return c.id === groupId; });
  dashboardTimeFilter = 'all';
  await loadClassOverview(groupId, 'all');
}

async function loadClassOverview(groupId, timeFilter) {
  if (!supabaseClient) return;
  dashboardTimeFilter = timeFilter;
  var container = document.getElementById('dashboardClassOverview');
  container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:16px 0">Indl\u00e6ser...</p>';

  var memRes = await supabaseClient.from('group_members').select('player, role').eq('group_id', groupId);
  if (memRes.error || !memRes.data) {
    container.innerHTML = '<p style="color:var(--red)">Kunne ikke hente klassedata.</p>';
    return;
  }

  var students = memRes.data.filter(function(m) { return m.role === 'student'; });
  var studentNames = students.map(function(m) { return m.player; });

  if (studentNames.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px 0">Ingen elever tilmeldt endnu.<br><span style="font-size:0.82rem">Del klassekoden s\u00e5 elever kan tilmelde sig.</span></p>';
    document.getElementById('dashboardStudentSection').style.display = 'none';
    return;
  }

  // Fetch profiles and answers in parallel
  var profilesPromise = supabaseClient.from('profiles').select('player, reward_data, profile_data, student_grade, updated_at').in('player', studentNames);
  var answersQuery = supabaseClient.from('answers').select('player, correct, category').in('player', studentNames);
  if (timeFilter === 'week') {
    answersQuery = answersQuery.gte('created_at', new Date(Date.now() - 7 * ONE_DAY_MS).toISOString());
  } else if (timeFilter === 'month') {
    answersQuery = answersQuery.gte('created_at', new Date(Date.now() - 30 * ONE_DAY_MS).toISOString());
  }

  var results = await Promise.all([profilesPromise, answersQuery.limit(10000)]);
  var profiles = results[0].data || [];
  var answers = results[1].data || [];

  // Aggregate answer stats per player
  var answerStats = {};
  for (var a = 0; a < answers.length; a++) {
    var row = answers[a];
    if (!answerStats[row.player]) answerStats[row.player] = { total: 0, correct: 0, cats: {} };
    answerStats[row.player].total++;
    if (row.correct) answerStats[row.player].correct++;
    // Per-category stats
    if (row.category) {
      if (!answerStats[row.player].cats[row.category]) answerStats[row.player].cats[row.category] = { total: 0, correct: 0 };
      answerStats[row.player].cats[row.category].total++;
      if (row.correct) answerStats[row.player].cats[row.category].correct++;
    }
  }

  var profileMap = {};
  for (var p = 0; p < profiles.length; p++) {
    profileMap[profiles[p].player] = profiles[p];
  }

  dashboardStudents = studentNames.map(function(name) {
    var prof = profileMap[name] || {};
    var rd = prof.reward_data || {};
    var stats = answerStats[name] || { total: 0, correct: 0, cats: {} };
    var pct = stats.total > 0 ? Math.round(100 * stats.correct / stats.total) : 0;
    var avatarIdx = rd.displayedLevel || 0;
    var avatarTitle = (typeof AVATAR_LEVELS !== 'undefined' && AVATAR_LEVELS[avatarIdx]) ? AVATAR_LEVELS[avatarIdx].title : '-';
    var lastActive = prof.updated_at ? formatRelativeTime(prof.updated_at) : '-';

    return {
      name: name,
      grade: prof.student_grade || 0,
      xp: rd.totalXP || 0,
      avatar: avatarTitle,
      correctPct: pct,
      totalAnswers: stats.total,
      lastActive: lastActive,
      catStats: stats.cats,
      profileData: prof.profile_data || {},
      rewardData: rd
    };
  });

  dashboardStudents.sort(function(a, b) { return b.xp - a.xp; });
  renderClassOverview(groupId, dashboardStudents, timeFilter);

  // Populate student selector
  var studentSelect = document.getElementById('dashboardStudentSelect');
  studentSelect.innerHTML = '<option value="">-- V\u00e6lg en elev --</option>';
  for (var s = 0; s < dashboardStudents.length; s++) {
    studentSelect.innerHTML += '<option value="' + escapeHtml(dashboardStudents[s].name) + '">' + escapeHtml(dashboardStudents[s].name) + '</option>';
  }
  document.getElementById('dashboardStudentSection').style.display = 'block';
  document.getElementById('dashboardStudentDetail').innerHTML = '';
}

function renderClassOverview(groupId, students, timeFilter) {
  var html = '';

  // Time filter
  html += '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">';
  var filters = [
    { key: 'week', label: 'Denne uge' },
    { key: 'month', label: 'Denne m\u00e5ned' },
    { key: 'all', label: 'Alt' }
  ];
  for (var f = 0; f < filters.length; f++) {
    var active = timeFilter === filters[f].key ? ' active' : '';
    html += '<button class="time-filter-btn' + active + '" onclick="loadClassOverview(\'' + groupId + '\', \'' + filters[f].key + '\')">' + filters[f].label + '</button>';
  }
  html += '</div>';

  // Table
  html += '<div style="overflow-x:auto;border-radius:10px;border:1px solid #3d4270">';
  html += '<table class="dashboard-table"><thead><tr>' +
    '<th>Navn</th><th>Kl.</th><th>XP</th><th>Rigtige</th><th>Svar</th><th>Sidst aktiv</th><th></th>' +
    '</tr></thead><tbody>';

  for (var s = 0; s < students.length; s++) {
    var st = students[s];
    var pctColor = st.correctPct >= 80 ? 'var(--green)' : st.correctPct >= 50 ? 'var(--accent)' : 'var(--red)';
    html += '<tr>' +
      '<td style="font-weight:700">' + escapeHtml(st.name) + '</td>' +
      '<td>' + (st.grade > 0 ? st.grade + '.' : '-') + '</td>' +
      '<td style="color:var(--accent)">' + st.xp + '</td>' +
      '<td style="color:' + pctColor + ';font-weight:700">' + st.correctPct + '%</td>' +
      '<td>' + st.totalAnswers + '</td>' +
      '<td style="font-size:0.78rem;color:var(--muted)">' + st.lastActive + '</td>' +
      '<td><button class="btn" style="font-size:0.7rem;padding:3px 8px;background:var(--red);color:white" onclick="removeStudentFromClass(\'' + groupId + '\', \'' + escapeHtml(st.name).replace(/'/g, "\\'") + '\', \'' + escapeHtml(dashboardCurrentClass.name).replace(/'/g, "\\'") + '\')">Fjern</button></td>' +
      '</tr>';
  }

  html += '</tbody></table></div>';
  document.getElementById('dashboardClassOverview').innerHTML = html;
}

function onDashboardStudentChange() {
  var select = document.getElementById('dashboardStudentSelect');
  var name = select.value;
  var detail = document.getElementById('dashboardStudentDetail');
  if (!name) { detail.innerHTML = ''; return; }

  var student = dashboardStudents.find(function(s) { return s.name === name; });
  if (!student) { detail.innerHTML = ''; return; }
  renderStudentDetail(student);
}

function renderStudentDetail(student) {
  var detail = document.getElementById('dashboardStudentDetail');
  var html = '';

  // Header
  var avatarIdx = student.rewardData.displayedLevel || 0;
  var avatarLevel = (typeof AVATAR_LEVELS !== 'undefined' && AVATAR_LEVELS[avatarIdx]) ? AVATAR_LEVELS[avatarIdx] : null;
  var avatarImg = avatarLevel && avatarLevel.image ? '<img src="' + avatarLevel.image + '" style="width:3.5rem;height:3.5rem;object-fit:contain">' : '';

  html += '<div class="student-detail-header">' +
    avatarImg +
    '<h3>' + escapeHtml(student.name) + '</h3>' +
    '<span style="font-size:0.82rem;color:var(--muted)">' + (student.avatar || '') + ' &middot; ' + (student.grade > 0 ? student.grade + '. klasse' : 'Ingen klasse valgt') + '</span>' +
    '</div>';

  // Stat boxes
  var pctColor = student.correctPct >= 80 ? 'var(--green)' : student.correctPct >= 50 ? 'var(--accent)' : 'var(--red)';
  html += '<div class="student-stat-grid">' +
    '<div class="student-stat-box"><div class="stat-val">' + student.xp + '</div><div class="stat-lbl">XP</div></div>' +
    '<div class="student-stat-box"><div class="stat-val" style="color:' + pctColor + '">' + student.correctPct + '%</div><div class="stat-lbl">Rigtige</div></div>' +
    '<div class="student-stat-box"><div class="stat-val">' + student.totalAnswers + '</div><div class="stat-lbl">Svar i alt</div></div>' +
    '</div>';

  // Category breakdown
  html += '<div style="background:var(--card2);border-radius:12px;padding:14px 16px;border:1px solid #3d4270">';
  html += '<div style="font-size:0.85rem;font-weight:700;color:var(--accent);margin-bottom:10px">Kategorier</div>';

  var catLevels = student.profileData.categoryLevels || {};
  var levelColors = ['#9ca3af', '#60a5fa', '#22d3a0', '#f5a623', '#f97316', '#f43f5e'];

  if (ALL_CATEGORIES.length === 0) {
    html += '<p style="font-size:0.82rem;color:var(--muted)">Kategorier indl\u00e6ses...</p>';
  } else {
    for (var i = 0; i < ALL_CATEGORIES.length; i++) {
      var cat = ALL_CATEGORIES[i];
      var icon = CATEGORY_ICONS[cat] || '';
      var catData = catLevels[cat] || { level: 0, history: [] };
      var lvl = catData.level;
      var maxLvl = (typeof CATEGORY_MAX_LEVELS !== 'undefined' && CATEGORY_MAX_LEVELS[cat] !== undefined) ? CATEGORY_MAX_LEVELS[cat] : 5;
      var mastered = lvl >= maxLvl;
      var lvlText = mastered ? 'Mestret' : 'Niv ' + lvl + '/' + (maxLvl - 1);
      var lvlColor = mastered ? 'var(--green)' : levelColors[Math.min(lvl, 5)];

      // Answer stats for this category
      var catStat = student.catStats[cat] || { total: 0, correct: 0 };
      var catPct = catStat.total > 0 ? Math.round(100 * catStat.correct / catStat.total) : -1;
      var barColor = catPct >= 80 ? 'var(--green)' : catPct >= 50 ? 'var(--accent)' : 'var(--red)';

      html += '<div class="cat-progress-row">' +
        '<span style="width:22px;text-align:center">' + icon + '</span>' +
        '<span style="flex:1;color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + cat + '</span>' +
        '<span style="font-weight:700;font-size:0.78rem;color:' + lvlColor + ';min-width:50px;text-align:right">' + lvlText + '</span>';

      if (catPct >= 0) {
        html += '<div class="cat-progress-bar" style="min-width:50px;max-width:80px">' +
          '<div class="cat-progress-bar-fill" style="width:' + catPct + '%;background:' + barColor + '"></div></div>' +
          '<span style="font-size:0.75rem;font-weight:700;color:' + barColor + ';min-width:35px;text-align:right">' + catPct + '%</span>' +
          '<span style="font-size:0.7rem;color:var(--muted);min-width:25px;text-align:right">(' + catStat.total + ')</span>';
      } else {
        html += '<span style="font-size:0.75rem;color:var(--muted);min-width:110px;text-align:right">Ingen svar</span>';
      }

      html += '</div>';
    }
  }

  html += '</div>';
  detail.innerHTML = html;
}

function formatRelativeTime(isoStr) {
  var diff = Date.now() - new Date(isoStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Lige nu';
  if (mins < 60) return mins + ' min siden';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' t siden';
  var days = Math.floor(hours / 24);
  if (days === 1) return 'I g\u00e5r';
  if (days < 30) return days + ' dage siden';
  return new Date(isoStr).toLocaleDateString('da-DK');
}

// Legacy aliases for settings panel
function showClassDashboard(groupId, groupName) { openDashboard(); }
function hideClassDashboard() { goHome(); }

// ===== ORDBANK OG KATEGORIER =====
var WORD_BANK = {};

var PATTERN_RULES = {
  "Stumme bogstaver": "<b>Nogle bogstaver er usynlige!</b> De skrives, men man kan ikke h\u00F8re dem.<br><span style='color:var(--accent)'>hv-</span> (hvid), <span style='color:var(--accent)'>hj-</span> (hj\u00E6lp) \u2014 h'et er stumt!",
  "Dobbeltkonsonant": "<b>Kort vokal = dobbelt!</b><br>Sig vokalen: er den <span style='color:var(--red)'>kort</span>? \u2192 dobbelt (<span style='color:var(--accent)'>hoppe</span>)<br>Er den <span style='color:var(--green)'>lang</span>? \u2192 enkelt (<span style='color:var(--accent)'>bade</span>)",
  "For- og efterstavelser": "<b>Del ordet op i klodser!</b><br>Forstavelser: <span style='color:var(--accent)'>be-</span>, <span style='color:var(--accent)'>for-</span>, <span style='color:var(--accent)'>u-</span><br>Efterstavelser: <span style='color:var(--accent)'>-hed</span>, <span style='color:var(--accent)'>-else</span>, <span style='color:var(--accent)'>-lig</span><br>Klodserne staves altid ens!",
  "Sammensatte ord": "<b>Del ordet i stykker!</b><br><span style='color:var(--accent)'>skole + arbejde</span>, <span style='color:var(--accent)'>mad + pakke</span><br>Kan du stave stykkerne? S\u00E5 kan du stave hele ordet!",
  "Verbernes bøjning": "<b>Hvad skete der?</b><br>De fleste: <span style='color:var(--accent)'>-ede</span> (legede, cyklede)<br>Korte ord: <span style='color:var(--accent)'>-te</span> (spiste, k\u00F8bte)",
  "Navneordsendelser": "<b>Hvor mange? Hvilken \u00E9n?</b><br>Flertal: <span style='color:var(--accent)'>-e</span> eller <span style='color:var(--accent)'>-er</span> (hunde, lamper)<br>Bestemt: en-ord f\u00E5r <span style='color:var(--accent)'>-en</span>, et-ord f\u00E5r <span style='color:var(--accent)'>-et</span>",
  "Lydrette ord": "<b>Sig ordet langsomt!</b> Skriv \u00E9n lyd ad gangen \u2014 det staves pr\u00E6cis som det lyder.",
  "Nutids-r": "<b>Pr\u00F8v at s\u00E6tte \u201Dhan\u201D foran!</b><br>Han hoppe<span style='color:var(--green);font-weight:800'>r</span>, hun spise<span style='color:var(--green);font-weight:800'>r</span>, de lege<span style='color:var(--green);font-weight:800'>r</span><br>Passer \u201Dhan/hun\u201D foran? S\u00E5 skal der <span style='color:var(--green);font-weight:800'>-r</span> p\u00E5!",
  "Fremmedord": "<b>L\u00E5neord fra andre sprog!</b><br>Mange ord kommer fra <span style='color:var(--accent)'>fransk</span> (restaurant, garage), <span style='color:var(--accent)'>engelsk</span> (computer, juice) eller <span style='color:var(--accent)'>latin</span> (station, nation).<br>De f\u00F8lger ikke danske staveregler!",
  "Bl\u00F8dt d": "<b>D'et er bl\u00F8dt!</b><br>Mange danske ord har et <span style='color:var(--accent)'>d</span> man n\u00E6sten ikke kan h\u00F8re.<br>r\u00F8<span style='color:var(--green);font-weight:800'>d</span>, ba<span style='color:var(--green);font-weight:800'>d</span>e, ri<span style='color:var(--green);font-weight:800'>dd</span>er<br>Husk: d'et er der \u2014 ogs\u00E5 selv om det lyder bl\u00F8dt!",
  "Konsonantlyde": "<b>Lyt til konsonanten!</b><br>Nogle konsonanter lyder ens men staves forskelligt.<br><span style='color:var(--accent)'>p/b</span>, <span style='color:var(--accent)'>k/g</span>, <span style='color:var(--accent)'>g/j</span> \u2014 hvilken er det?",
  "Ord fra Fransk": "<b>Parlez-vous fran\u00E7ais?</b><br>Disse ord kommer fra fransk og staves helt anderledes end de lyder.<br>Her g\u00E6lder det om at huske de franske stavem\u00E5der!",
  "Ord fra Fransk 2": "<b>Encore du fran\u00E7ais!</b><br>Endnu flere franske ord der kr\u00E6ver ekstra opm\u00E6rksomhed p\u00E5 stavningen."
};

// Emoji illustrations for fill-in exercise (words with clear visual representation)
var WORD_EMOJIS = {
  // Stumme bogstaver
  "hvid": "\u2B1C", "hjul": "\u{1F6DE}", "hjem": "\u{1F3E0}", "hjerte": "\u2764\uFE0F",
  "hveps": "\u{1F41D}", "hjort": "\u{1F98C}", "hval": "\u{1F40B}", "hvalp": "\u{1F436}",
  "hvalros": "\u{1F9AD}", "hvede": "\u{1F33E}", "hjelm": "\u26D1\uFE0F", "chokolade": "\u{1F36B}",
  "hjerne": "\u{1F9E0}", "dværg": "\u{1F9CC}", "guld": "\u{1FAA9}", "sølv": "\u{1FA99}",
  "gulv": "\u{1F3E0}", "kalv": "\u{1F404}", "hjørne": "\u{1F4D0}",
  // Dobbeltkonsonant
  "hoppe": "\u{1F407}", "kaffe": "\u2615", "sommer": "\u2600\uFE0F", "suppe": "\u{1F372}",
  "trappen": "\u{1FA9C}", "vinter": "\u2744\uFE0F", "katte": "\u{1F431}", "briller": "\u{1F453}",
  "dukke": "\u{1F9F8}", "tromme": "\u{1F941}", "flaske": "\u{1F37C}", "skole": "\u{1F3EB}",
  "lamme": "\u{1F411}", "kopper": "\u2615", "nisse": "\u{1F385}", "svømme": "\u{1F3CA}",
  "klasse": "\u{1F4DA}", "bade": "\u{1F6C1}",
  // Navneordsendelser
  "huset": "\u{1F3E0}", "stolen": "\u{1FA91}", "bogen": "\u{1F4D6}", "drengen": "\u{1F466}",
  "blomster": "\u{1F490}", "fuglen": "\u{1F426}", "lamper": "\u{1F4A1}", "børnene": "\u{1F9D2}",
  "pigerne": "\u{1F467}", "æbler": "\u{1F34E}", "brødet": "\u{1F35E}", "tøjet": "\u{1F455}",
  "kvinder": "\u{1F469}", "biler": "\u{1F697}", "hesten": "\u{1F40E}", "træet": "\u{1F333}",
  "skyer": "\u2601\uFE0F", "bilerne": "\u{1F697}", "hestene": "\u{1F40E}", "fuglene": "\u{1F426}",
  "blomsterne": "\u{1F490}", "gæster": "\u{1F465}",
  // Nutids-r
  "hopper": "\u{1F3C3}", "spiser": "\u{1F37D}\uFE0F", "leger": "\u{1F3B2}", "sover": "\u{1F634}",
  "cykler": "\u{1F6B2}", "svømmer": "\u{1F3CA}", "tegner": "\u{1F3A8}", "danser": "\u{1F483}",
  "lytter": "\u{1F442}",
  // Sammensatte ord
  "morgensmad": "\u{1F373}", "fødselsdagsgave": "\u{1F381}",
  // Verbernes bøjning
  "spiste": "\u{1F37D}\uFE0F", "legede": "\u{1F3B2}", "hoppede": "\u{1F3C3}",
  "cyklede": "\u{1F6B2}", "svømmede": "\u{1F3CA}", "rejste": "\u2708\uFE0F",
  // For- og efterstavelser
  "venlig": "\u{1F60A}", "farlig": "\u26A0\uFE0F", "kærlighed": "\u2764\uFE0F",
  "frihed": "\u{1F5FD}", "ulykke": "\u{1F4A5}"
};

var CATEGORY_LESSONS = {
  "Stumme bogstaver": {
    emoji: "\u{1F47B}",
    title: "Stumme bogstaver",
    rule: "Nogle bogstaver er usynlige! De skrives, men man kan <strong>ikke h\u00F8re dem</strong>.",
    examples: [
      { word: "<span class='highlight'>h</span>vid", note: "h'et er stumt" },
      { word: "<span class='highlight'>h</span>j\u00E6lp", note: "h'et er stumt" },
      { word: "ha<span class='highlight'>l</span>v", note: "l'et er stumt" },
      { word: "gul<span class='highlight'>d</span>", note: "d'et er stumt" }
    ],
    tip: "\u{1F4A1} Trick: Kig efter m\u00F8nstrene! 'h' er ofte stumt foran 'v' (hvid, hvem) eller 'j' (hjem, hj\u00E6lp). 'd' og 'l' kan gemme sig til sidst som i guld og halv."
  },
  "Dobbeltkonsonant": {
    emoji: "\u270C\uFE0F",
    title: "Dobbeltkonsonant",
    rule: "Sig vokalen (a, e, i, o, u) h\u00F8jt. Er den <strong style='color:var(--red)'>kort</strong>? S\u00E5 <strong>dobbelt</strong> konsonant!",
    examples: [
      { word: "ho<span class='highlight'>pp</span>e", note: "kort 'o' \u2192 dobbelt" },
      { word: "ka<span class='highlight'>ff</span>e", note: "kort 'a' \u2192 dobbelt" },
      { word: "ba<span class='highlight'>d</span>e", note: "lang 'a' \u2192 enkelt" },
      { word: "vi<span class='highlight'>d</span>e", note: "lang 'i' \u2192 enkelt" }
    ],
    tip: "\u{1F4A1} Trick: Sig vokalen langsomt. Kort vokal = hop-pe. Lang vokal = ba-de."
  },
  "For- og efterstavelser": {
    emoji: "\u{1F9E9}",
    title: "For- og efterstavelser",
    rule: "Mange ord er bygget af <strong>klodser</strong> der altid staves ens!",
    examples: [
      { word: "<span class='highlight'>for-</span>bered<span class='highlight'>-else</span>", note: "3 klodser" },
      { word: "<span class='highlight'>u-</span>mulig", note: "u- = ikke/modsat" },
      { word: "ven<span class='highlight'>-lig</span>", note: "-lig, ikke -leg" },
      { word: "k\u00E6rlig<span class='highlight'>-hed</span>", note: "-hed, ikke -het" }
    ],
    tip: "\u{1F4A1} Trick: Del ordet op i klodser! Kender du klodserne, kan du stave hele ordet."
  },
  "Sammensatte ord": {
    emoji: "\u{1F517}",
    title: "Sammensatte ord",
    rule: "Dansk elsker at <strong>s\u00E6tte ord sammen</strong>. Del dem i stykker!",
    examples: [
      { word: "<span class='highlight'>skole</span>+<span class='highlight'>taske</span>", note: "to ord" },
      { word: "<span class='highlight'>morgen</span>-s-<span class='highlight'>mad</span>", note: "med fuge-s" },
      { word: "<span class='highlight'>mad</span>+<span class='highlight'>pakke</span>", note: "to ord" }
    ],
    tip: "\u{1F4A1} Trick: Kan du dele ordet i to ord du kender? S\u00E5 er det et sammensat ord!"
  },
  "Verbernes b\u00F8jning": {
    emoji: "\u270F\uFE0F",
    title: "Verbernes b\u00F8jning",
    rule: "N\u00E5r noget <strong>skete i g\u00E5r</strong>, skal verbet b\u00F8jes.",
    examples: [
      { word: "leg<span class='highlight'>ede</span>", note: "de fleste f\u00E5r -ede" },
      { word: "spis<span class='highlight'>te</span>", note: "korte ord f\u00E5r -te" },
      { word: "k\u00F8b<span class='highlight'>te</span>", note: "kort stamme = -te" },
      { word: "cykl<span class='highlight'>ede</span>", note: "lang stamme = -ede" }
    ],
    tip: "\u{1F4A1} Trick: Sig grundformen (at lege, at spise). F\u00F8les stammen kort? S\u00E5 -te. Lang? S\u00E5 -ede."
  },
  "Navneordsendelser": {
    emoji: "\u{1F4DD}",
    title: "Navneordsendelser",
    rule: "Er det <strong>en</strong>-ord eller <strong>et</strong>-ord? Det bestemmer endelsen!",
    examples: [
      { word: "stol<span class='highlight'>en</span>", note: "en stol \u2192 -en" },
      { word: "hus<span class='highlight'>et</span>", note: "et hus \u2192 -et" },
      { word: "bil<span class='highlight'>er</span>", note: "flertal \u2192 -er" },
      { word: "hund<span class='highlight'>ene</span>", note: "bestemt flertal" }
    ],
    tip: "\u{1F4A1} Trick: Sig \"en\" eller \"et\" foran ordet. \"En stol\" \u2192 stolen. \"Et hus\" \u2192 huset."
  },
  "Lydrette ord": {
    emoji: "\u{1F524}",
    title: "Lydrette ord",
    rule: "Disse ord staves <strong>pr\u00E6cis som de lyder</strong>. Sig dem langsomt!",
    examples: [
      { word: "sol", note: "s-o-l" },
      { word: "mus", note: "m-u-s" },
      { word: "hund", note: "h-u-n-d" }
    ],
    tip: "\u{1F4A1} Trick: Sig ordet \u00E9n lyd ad gangen og skriv hver lyd ned."
  },
  "Nutids-r": {
    emoji: "\u{1F996}",
    title: "Nutids-r",
    rule: "Pr\u00F8v at s\u00E6tte <strong>\"han\"</strong> foran! Passer det? S\u00E5 skal der <strong style='color:var(--green)'>-r</strong> p\u00E5!",
    examples: [
      { word: "hun hoppe<span class='highlight'>r</span>", note: "han/hun = nutid" },
      { word: "de spise<span class='highlight'>r</span>", note: "de = nutid" },
      { word: "at hoppe", note: "at = INGEN -r" },
      { word: "at spise", note: "at = INGEN -r" }
    ],
    tip: "\u{1F4A1} Trick: \"Han hopper\" \u2192 -r. \"At hoppe\" \u2192 ingen -r. S\u00E5 simpelt er det!"
  },
  "Fremmedord": {
    emoji: "\u{1F30D}",
    title: "Fremmedord",
    rule: "Mange ord kommer fra <strong>andre sprog</strong> og f\u00F8lger ikke danske staveregler!",
    examples: [
      { word: "<span class='highlight'>pizza</span>", note: "italiensk: dobbelt-z" },
      { word: "<span class='highlight'>ch</span>auff\u00F8r", note: "fransk: ch = sj" },
      { word: "sta<span class='highlight'>tion</span>", note: "latin: -tion = sjon" },
      { word: "<span class='highlight'>j</span>uice", note: "engelsk: j = dj" }
    ],
    tip: "\u{1F4A1} Trick: Fremmedord skal man l\u00E6re udenad \u2014 de lyder ikke som de staves!"
  },
  "Bl\u00F8dt d": {
    emoji: "\u{1F4AC}",
    title: "Bl\u00F8dt d",
    rule: "Mange danske ord har et <strong>d</strong> man n\u00E6sten ikke kan h\u00F8re \u2014 men det skal skrives!",
    examples: [
      { word: "r\u00F8<span class='highlight'>d</span>", note: "bl\u00F8dt d til sidst" },
      { word: "ba<span class='highlight'>d</span>e", note: "bl\u00F8dt d mellem vokaler" },
      { word: "ri<span class='highlight'>dd</span>er", note: "dobbelt bl\u00F8dt d" },
      { word: "mi<span class='highlight'>dd</span>ag", note: "dobbelt bl\u00F8dt d" }
    ],
    tip: "\u{1F4A1} Trick: Sig ordet langsomt. Kan du m\u00E6rke tungen bag t\u00E6nderne? S\u00E5 er der et d!"
  },
  "Konsonantlyde": {
    emoji: "\u{1F442}",
    title: "Konsonantlyde",
    rule: "Nogle konsonanter lyder n\u00E6sten ens, men staves forskelligt! <strong>p/b</strong>, <strong>k/g</strong> og <strong>g/j</strong>",
    examples: [
      { word: "mo<span class='highlight'>pp</span>e", note: "p, ikke b" },
      { word: "sti<span class='highlight'>kk</span>e", note: "k, ikke g" },
      { word: "le<span class='highlight'>g</span>e", note: "g, ikke j" },
      { word: "ka<span class='highlight'>g</span>e", note: "g, ikke j" }
    ],
    tip: "\u{1F4A1} Trick: Er det <strong>g</strong> eller <strong>j</strong>? Pr\u00F8v at b\u00F8je ordet \u2014 le<strong>g</strong>e \u2192 le<strong>g</strong>et. G'et bliver tydeligt!"
  }
};

var sessionLessonCategories = [];

function trackCategoryError(category) {
  if (!sessionCategoryErrors[category]) sessionCategoryErrors[category] = 0;
  sessionCategoryErrors[category]++;
  // Check accumulated history for this category — trigger lesson if struggling
  checkLessonTrigger(category);
}

function checkLessonTrigger(category) {
  if (!CATEGORY_LESSONS[category]) return;
  if (sessionLessonCategories.indexOf(category) !== -1) return; // already triggered this session

  var levels = loadCategoryLevels();
  var cat = levels[category];
  if (!cat || !cat.history || cat.history.length < 2) return;

  var total = cat.history.length;
  var correct = cat.history.filter(function(h) { return h; }).length;
  var pct = correct / total;

  // Trigger lesson if struggling:
  // - 2 answers with 0 correct (immediate help)
  // - 3+ answers with <60% correct (accumulated struggle)
  var shouldTrigger = (total === 2 && correct === 0) || (total >= 3 && pct < 0.6);
  if (shouldTrigger) {
    // Reset history so the count starts fresh after the lesson
    cat.history = [];
    levels[category] = cat;
    saveCategoryLevels(levels);

    sessionLessonCategories.push(category);
    showLessonPopup(category);
  }
}

function showLessonPopup(category) {
  // Delegation: hvis kategorien har wizard-scenarier, brug det interaktive flow
  if (typeof WIZARD_SCENARIOS !== 'undefined' && WIZARD_SCENARIOS[category] && WIZARD_SCENARIOS[category].length > 0) {
    showWizardLesson(category);
    return;
  }

  var lesson = CATEGORY_LESSONS[category];
  if (!lesson) return;

  var overlay = document.getElementById('lessonOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lessonOverlay';
    overlay.className = 'milestone-overlay';
    document.body.appendChild(overlay);
  }

  var html = '<div style="background:var(--card);border-radius:16px;padding:24px;max-width:380px;margin:0 auto;border:2px solid var(--accent);text-align:center">';
  html += '<div style="font-size:2.5rem;margin-bottom:8px">' + lesson.emoji + '</div>';
  html += '<h3 style="color:var(--accent);margin-bottom:12px">' + lesson.title + '</h3>';
  html += '<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:12px;text-align:left">';
  html += '<p style="font-size:0.95rem;line-height:1.6;color:var(--text)">' + lesson.rule + '</p></div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:12px">';
  for (var i = 0; i < lesson.examples.length; i++) {
    var ex = lesson.examples[i];
    html += '<div style="background:var(--card2);border-radius:8px;padding:8px 12px;text-align:center">';
    html += '<div style="font-size:1.1rem;font-weight:700">' + ex.word + '</div>';
    html += '<div style="font-size:0.7rem;color:var(--muted);margin-top:2px">' + ex.note + '</div></div>';
  }
  html += '</div>';
  html += '<div style="background:rgba(34,211,160,0.1);border-radius:8px;padding:10px;margin-bottom:14px;font-size:0.85rem;color:var(--green)">' + lesson.tip + '</div>';
  html += '<button class="btn btn-accent" onclick="dismissLessonPopup()">Forst\u00E5et! \u{1F4AA}</button>';
  html += '</div>';

  overlay.innerHTML = html;
  overlay.classList.remove('hidden');
  pendingLesson = true;
}

function dismissLessonPopup() {
  var overlay = document.getElementById('lessonOverlay');
  if (overlay) overlay.classList.add('hidden');
  pendingLesson = false;
}

var pendingLesson = false;

// ===== WIZARD LESSONS (interaktiv trolmand) =====

var WIZARD_SCENARIOS = {
  "Dobbeltkonsonant": [
    {
      setup: "Jeg har planlagt en stor fødselsdag og skal lave en lækker dessert i ovnen.",
      riddle: "Hvordan staves det jeg skal — 'bage' eller 'bagge'?",
      options: ["bage", "bagge"],
      correct: 0,
      reveal: "Det rigtige er BAGE. Vokalen 'a' er LANG (baaaa-ge), så enkelt 'g'. Kort vokal som i 'hop-pe' ville have dobbelt."
    },
    {
      setup: "Jeg er træt og vil hvile mig på stolen.",
      riddle: "Hvordan staves det — 'sidde' eller 'side'?",
      options: ["sidde", "side"],
      correct: 0,
      reveal: "AHA — jeg vil SIDDE (kort 'i' → dobbelt d). En SIDE er noget helt andet (en side i en bog)!"
    },
    {
      setup: "Jeg drikker varm te. Hvis jeg vil have to af dem på bordet...",
      riddle: "Hvordan staves det — 'kopper' eller 'koper'?",
      options: ["kopper", "koper"],
      correct: 0,
      reveal: "KOPPER — kort 'o' så dobbelt p. Tip: sig vokalen højt; er den kort? Så dobbelt!"
    },
    {
      setup: "Pizzaen kommer lige ud af ovnen — den er meget varm.",
      riddle: "Hvordan staves temperaturen — 'hede' eller 'hedde'?",
      options: ["hede", "hedde"],
      correct: 0,
      reveal: "HEDE betyder varm (lang 'e' → enkelt d). At HEDDE er noget helt andet (kort 'e' → dobbelt d), fx 'jeg hedder Anna'."
    },
    {
      setup: "Der er rigtig mange æbler i træet i år!",
      riddle: "Hvordan staves antal-ordet — 'masse' eller 'mase'?",
      options: ["masse", "mase"],
      correct: 0,
      reveal: "MASSE betyder mange — kort 'a' så dobbelt s. At MASE er noget andet (presse på)!"
    },
    {
      setup: "På trampolinen kan jeg sætte af og flyve op i luften.",
      riddle: "Hvordan staves verbet — 'hoppe' eller 'hope'?",
      options: ["hoppe", "hope"],
      correct: 0,
      reveal: "HOPPE — kort 'o' så dobbelt p. Tip: føles vokalen 'o' kort eller lang? Kort = dobbelt."
    },
    {
      setup: "Til koncerten viser publikum begejstring med hænderne.",
      riddle: "Hvordan staves grundformen — 'klappe' eller 'klape'?",
      options: ["klappe", "klape"],
      correct: 0,
      reveal: "KLAPPE — kort 'a' så dobbelt p. Prøv at sige det langsomt: klap-pe."
    },
    {
      setup: "En kold is om sommeren er noget af det bedste der findes.",
      riddle: "Hvordan staves det jeg gør med isen — 'slikke' eller 'slike'?",
      options: ["slikke", "slike"],
      correct: 0,
      reveal: "SLIKKE — kort 'i' så dobbelt k. Lang vokal som i 'rige' ville være enkelt."
    }
  ]
};

// State for nuværende wizard-session
var wizardCurrentScenario = null;
var wizardCurrentCategory = null;
var wizardPhase = null;
var wizardTries = 0;
var wizardFirstTryCorrect = false;
var wizardDoorOrder = [0, 1];
var wizardLastDeath = null;
var wizardSessionId = 0;

function loadWizardRecent() {
  if (typeof activePlayer === 'undefined' || !activePlayer) return {};
  try {
    var raw = localStorage.getItem(playerKey('wizard_recent'));
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveWizardRecent(data) {
  if (typeof activePlayer === 'undefined' || !activePlayer) return;
  try { localStorage.setItem(playerKey('wizard_recent'), JSON.stringify(data)); } catch(e) {}
}

function pickScenarioForCategory(category) {
  var scenarios = WIZARD_SCENARIOS[category] || [];
  if (scenarios.length === 0) return null;
  if (scenarios.length === 1) return { scenario: scenarios[0], index: 0 };

  var recent = loadWizardRecent();
  var recentList = recent[category] || [];

  // Filtrer scenarier der ikke er i recent
  var available = [];
  for (var i = 0; i < scenarios.length; i++) {
    if (recentList.indexOf(i) === -1) available.push(i);
  }
  // Hvis alle er recente, nulstil
  if (available.length === 0) {
    recentList = [];
    available = scenarios.map(function(_, i) { return i; });
  }

  var pickedIdx = available[Math.floor(Math.random() * available.length)];

  // Opdater recent (max 3)
  recentList.push(pickedIdx);
  if (recentList.length > 3) recentList = recentList.slice(-3);
  recent[category] = recentList;
  saveWizardRecent(recent);

  return { scenario: scenarios[pickedIdx], index: pickedIdx };
}

function showWizardLesson(category) {
  var scenarios = WIZARD_SCENARIOS[category];
  if (!scenarios || scenarios.length === 0) {
    console.warn('[wizard] No scenarios for', category, '— falling back to legacy popup');
    showLessonPopup(category); // fallback (vil aldrig kalde os igen pga. delegation — se Task 9)
    return;
  }

  var picked = pickScenarioForCategory(category);
  if (!picked) {
    console.warn('[wizard] No scenario could be picked for', category);
    return;
  }
  wizardCurrentScenario = picked.scenario;
  wizardCurrentCategory = category;
  wizardPhase = 'intro';
  wizardTries = 0;
  wizardFirstTryCorrect = false;

  // Shuffle dør-position så rigtigt ord ikke altid er venstre
  wizardDoorOrder = Math.random() < 0.5 ? [0, 1] : [1, 0];

  wizardSessionId++;
  var mySession = wizardSessionId;
  renderWizardOverlay();
  pendingLesson = true;

  // Auto-overgang til riddle efter 2.5s — kun hvis sessionen stadig er aktuel
  setTimeout(function() {
    if (wizardSessionId === mySession && wizardPhase === 'intro') {
      wizardTransitionTo('riddle');
    }
  }, 2500);
}

function renderWizardOverlay() {
  var overlay = document.getElementById('wizardOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wizardOverlay';
    overlay.className = 'wizard-overlay';
    document.body.appendChild(overlay);
  } else {
    overlay.className = 'wizard-overlay';
  }

  var html = '<div class="wizard-card">';
  html += '<div class="wizard-header">🧙‍♂️ Trolmandens gåde</div>';
  html += '<div class="wizard-stage">';
  html += '<div class="wizard-character" id="wizardChar">🧙‍♂️</div>';
  html += '<div class="wizard-speech" id="wizardSpeech">' + escapeHtml(wizardCurrentScenario.setup) + '</div>';
  html += '</div>';
  html += '<div class="wizard-doors" id="wizardDoors"></div>';
  html += '<div class="wizard-footer" id="wizardFooter"></div>';
  html += '</div>';

  overlay.innerHTML = html;

  // Aktiver idle-float når intro-animationen er færdig (mere pålideligt end setTimeout)
  var ch = document.getElementById('wizardChar');
  if (ch) {
    ch.addEventListener('animationend', function onIntroEnd(e) {
      if (e.animationName !== 'wizard-char-in') return;
      ch.removeEventListener('animationend', onIntroEnd);
      ch.classList.add('idle');
    });
  }
}

function wizardTransitionTo(phase) {
  wizardPhase = phase;

  if (phase === 'riddle') {
    wizardChangeSpeech(wizardCurrentScenario.riddle);
    wizardRenderDoors();
  }
  else if (phase === 'reveal') {
    wizardRenderReveal();
  }
  else if (phase === 'done') {
    wizardComplete();
  }
}

function wizardRenderReveal() {
  // Fade ud forkert dør
  var doors = document.querySelectorAll('.wizard-door');
  for (var i = 0; i < doors.length; i++) {
    var idx = parseInt(doors[i].getAttribute('data-idx'), 10);
    if (idx !== wizardCurrentScenario.correct) {
      doors[i].classList.add('fade-out');
      (function(d) { setTimeout(function() { d.style.display = 'none'; }, 260); })(doors[i]);
    }
  }

  // Skift speech til reveal-tekst
  setTimeout(function() {
    wizardChangeSpeech(wizardCurrentScenario.reveal);
  }, 300);

  // Tilføj "Forstået!" knap
  var footer = document.getElementById('wizardFooter');
  if (footer) {
    footer.innerHTML = '<button class="wizard-done-btn" onclick="wizardTransitionTo(\'done\')">Forstået! 💪</button>';
  }
}

function wizardComplete() {
  // Tildel XP — håndter dato-skift så stale todayXP fra tidligere dag ikke tælles med
  var xpReward = wizardFirstTryCorrect ? 15 : 10;
  if (typeof loadRewardData === 'function' && typeof saveRewardData === 'function') {
    var data = loadRewardData();
    var today = (typeof getTodayStr === 'function') ? getTodayStr() : '';
    if (today && data.todayDate !== today) {
      data.todayXP = 0;
      data.todayDate = today;
    }
    data.totalXP = (data.totalXP || 0) + xpReward;
    data.todayXP = (data.todayXP || 0) + xpReward;
    saveRewardData(data);
    if (typeof updateRewardBar === 'function') updateRewardBar();
    if (typeof showRewardFloat === 'function') showRewardFloat('+' + xpReward + ' XP ✨');
  }

  // Fade ud overlay
  var overlay = document.getElementById('wizardOverlay');
  if (overlay) {
    overlay.classList.add('fading-out');
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 280);
  }

  pendingLesson = false;

  // Reset state
  wizardCurrentScenario = null;
  wizardCurrentCategory = null;
  wizardPhase = null;
  wizardTries = 0;
  wizardFirstTryCorrect = false;
  wizardLastDeath = null;
}

function wizardChangeSpeech(newText) {
  var bubble = document.getElementById('wizardSpeech');
  if (!bubble) return;
  bubble.classList.add('text-changing');
  setTimeout(function() {
    bubble.innerHTML = escapeHtml(newText);
  }, 180);
  setTimeout(function() {
    bubble.classList.remove('text-changing');
  }, 400);
}

function wizardRenderDoors() {
  var container = document.getElementById('wizardDoors');
  if (!container) return;
  var html = '';
  for (var i = 0; i < wizardDoorOrder.length; i++) {
    var optIdx = wizardDoorOrder[i];
    var word = wizardCurrentScenario.options[optIdx];
    html += '<button class="wizard-door appearing" data-idx="' + optIdx + '" ';
    html += 'style="animation-delay:' + (i * 100) + 'ms" ';
    html += 'onclick="wizardPickDoor(' + optIdx + ', this)">';
    html += escapeHtml(word) + '</button>';
  }
  container.innerHTML = html;
}

function wizardPickDoor(optIdx, btn) {
  if (wizardPhase !== 'riddle') return; // ignorer dobbeltklik
  var isCorrect = (optIdx === wizardCurrentScenario.correct);

  if (isCorrect) {
    if (wizardTries === 0) wizardFirstTryCorrect = true;
    wizardHandleCorrect(btn);
  } else {
    wizardHandleWrong(optIdx, btn);
  }
}

function wizardHandleCorrect(btn) {
  wizardPhase = 'correct';
  btn.classList.add('correct-flash');

  var ch = document.getElementById('wizardChar');
  if (ch) {
    ch.classList.remove('idle');
    ch.classList.add('cheer');
    setTimeout(function() {
      ch.classList.remove('cheer');
      ch.classList.add('idle');
    }, 600);
  }

  wizardChangeSpeech(wizardFirstTryCorrect ? 'Perfekt! 🌟' : 'Næsten! Kig her...');

  setTimeout(function() { wizardTransitionTo('reveal'); }, 1200);
}

function wizardHandleWrong(optIdx, btn) {
  wizardPhase = 'wrong-1';
  wizardTries++;

  // Marker dør som forkert + disabled
  btn.classList.add('wrong-flash', 'disabled');

  // Trigger tilfældig død-animation
  wizardTriggerDeath(pickWizardDeath());

  // Skift speech midlertidigt
  wizardChangeSpeech('Hov hov hov...');

  // Efter 1.8s: tilbage til riddle med kun én dør tilbage
  setTimeout(function() {
    if (wizardPhase !== 'wrong-1') return;
    wizardChangeSpeech(wizardCurrentScenario.riddle);
    wizardPhase = 'riddle'; // tillader klik igen
    wizardClearDeathEffects();
  }, 1800);
}

var WIZARD_DEATHS = ['anvil', 'dragon', 'lightning', 'banana', 'ufo', 'rock', 'ghost', 'explosion'];

function pickWizardDeath() {
  var pool = WIZARD_DEATHS.filter(function(d) { return d !== wizardLastDeath; });
  return pool[Math.floor(Math.random() * pool.length)];
}

function wizardTriggerDeath(deathName) {
  var stage = document.querySelector('.wizard-stage');
  var ch = document.getElementById('wizardChar');
  if (!stage || !ch) return;
  wizardLastDeath = deathName;

  if (deathName === 'anvil') {
    var warning = document.createElement('div');
    warning.className = 'wizard-warning wizard-effect-overlay';
    warning.innerHTML = '⚠️';
    stage.appendChild(warning);
    var anvil = document.createElement('div');
    anvil.className = 'wizard-anvil wizard-effect-overlay';
    anvil.innerHTML = '🔨';
    stage.appendChild(anvil);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('flat');
      ch.innerHTML = '🥞';
    }, 900);
    var stars = document.createElement('div');
    stars.className = 'wizard-stars wizard-effect-overlay';
    stars.innerHTML = '⭐💫⭐';
    stage.appendChild(stars);
  }
  else if (deathName === 'dragon') {
    var dragon = document.createElement('div');
    dragon.className = 'wizard-dragon wizard-effect-overlay';
    dragon.innerHTML = '🐉';
    stage.appendChild(dragon);
    var flames = document.createElement('div');
    flames.className = 'wizard-flames wizard-effect-overlay';
    flames.innerHTML = '🔥🔥🔥';
    stage.appendChild(flames);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('charred');
    }, 1200);
  }
  else if (deathName === 'lightning') {
    var cloud = document.createElement('div');
    cloud.className = 'wizard-cloud wizard-effect-overlay';
    cloud.innerHTML = '☁️';
    stage.appendChild(cloud);
    var bolt = document.createElement('div');
    bolt.className = 'wizard-bolt wizard-effect-overlay';
    bolt.innerHTML = '⚡';
    stage.appendChild(bolt);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('zapped');
    }, 700);
  }
  else if (deathName === 'banana') {
    var banana = document.createElement('div');
    banana.className = 'wizard-banana wizard-effect-overlay';
    banana.innerHTML = '🍌';
    stage.appendChild(banana);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('slipping');
    }, 600);
  }
  else if (deathName === 'ufo') {
    var ufo = document.createElement('div');
    ufo.className = 'wizard-ufo wizard-effect-overlay';
    ufo.innerHTML = '🛸';
    stage.appendChild(ufo);
    var beam = document.createElement('div');
    beam.className = 'wizard-beam wizard-effect-overlay';
    stage.appendChild(beam);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('abducted');
    }, 1100);
  }
  else if (deathName === 'rock') {
    var rock = document.createElement('div');
    rock.className = 'wizard-rock wizard-effect-overlay';
    rock.innerHTML = '🪨';
    stage.appendChild(rock);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('flat');
      ch.innerHTML = '🥞';
    }, 800);
  }
  else if (deathName === 'ghost') {
    var ghost = document.createElement('div');
    ghost.className = 'wizard-ghost wizard-effect-overlay';
    ghost.innerHTML = '👻';
    stage.appendChild(ghost);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('scared');
      ch.innerHTML = '😨';
    }, 800);
  }
  else if (deathName === 'explosion') {
    var spark = document.createElement('div');
    spark.className = 'wizard-spark wizard-effect-overlay';
    spark.innerHTML = '✨';
    stage.appendChild(spark);
    var boom = document.createElement('div');
    boom.className = 'wizard-boom wizard-effect-overlay';
    boom.innerHTML = '💥';
    stage.appendChild(boom);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('charred');
      ch.innerHTML = '🤯';
    }, 1100);
  }
}

function wizardClearDeathEffects() {
  var ch = document.getElementById('wizardChar');
  if (ch) {
    ch.classList.remove('flat', 'charred', 'zapped', 'slipping', 'abducted', 'scared');
    ch.style.transform = '';
    ch.style.filter = '';
    ch.innerHTML = '🧙‍♂️';
    ch.classList.add('idle');
  }
  var effects = document.querySelectorAll('.wizard-effect-overlay');
  for (var i = 0; i < effects.length; i++) {
    effects[i].parentNode.removeChild(effects[i]);
  }
}

// --- Lessons slideshow ---
var lessonSlideIndex = 0;

function showLessonsOverview() {
  lessonSlideIndex = 0;
  renderLessonSlide();
  document.getElementById('lessonsSlideshow').classList.remove('hidden');
}

function hideLessonsSlideshow() {
  document.getElementById('lessonsSlideshow').classList.add('hidden');
}

function nextLessonSlide() {
  var keys = Object.keys(CATEGORY_LESSONS);
  lessonSlideIndex = (lessonSlideIndex + 1) % keys.length;
  renderLessonSlide();
}

function prevLessonSlide() {
  var keys = Object.keys(CATEGORY_LESSONS);
  lessonSlideIndex = (lessonSlideIndex - 1 + keys.length) % keys.length;
  renderLessonSlide();
}

function renderLessonSlide() {
  var keys = Object.keys(CATEGORY_LESSONS);
  var category = keys[lessonSlideIndex];
  var lesson = CATEGORY_LESSONS[category];
  if (!lesson) return;

  var html = '<div style="background:var(--card);border-radius:16px;padding:24px;max-width:420px;margin:0 auto;border:2px solid var(--accent);position:relative">';
  // Close button
  html += '<button onclick="hideLessonsSlideshow()" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--muted);font-size:1.5rem;cursor:pointer;padding:4px 10px">\u2715</button>';
  // Progress dots
  html += '<div style="display:flex;justify-content:center;gap:6px;margin-bottom:14px">';
  for (var i = 0; i < keys.length; i++) {
    var dotColor = i === lessonSlideIndex ? 'var(--accent)' : '#3d4270';
    html += '<span style="width:8px;height:8px;border-radius:50%;background:' + dotColor + '"></span>';
  }
  html += '</div>';
  // Lesson content
  html += '<div style="text-align:center">';
  html += '<div style="font-size:3rem;margin-bottom:8px">' + lesson.emoji + '</div>';
  html += '<h3 style="color:var(--accent);margin-bottom:14px;font-size:1.3rem">' + lesson.title + '</h3>';
  html += '<div style="background:var(--card2);border-radius:10px;padding:14px;margin-bottom:12px;text-align:left">';
  html += '<p style="font-size:0.95rem;line-height:1.6;color:var(--text)">' + lesson.rule + '</p></div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:12px">';
  for (var ei = 0; ei < lesson.examples.length; ei++) {
    var ex = lesson.examples[ei];
    html += '<div style="background:var(--card2);border-radius:8px;padding:8px 12px;text-align:center">';
    html += '<div style="font-size:1.1rem;font-weight:700">' + ex.word + '</div>';
    html += '<div style="font-size:0.7rem;color:var(--muted);margin-top:2px">' + ex.note + '</div></div>';
  }
  html += '</div>';
  html += '<div style="background:rgba(34,211,160,0.1);border-radius:8px;padding:10px;margin-bottom:14px;font-size:0.85rem;color:var(--green)">' + lesson.tip + '</div>';
  html += '</div>';
  // Navigation
  html += '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px">';
  html += '<button class="btn" onclick="prevLessonSlide()" style="flex:1">\u2B05\uFE0F Forrige</button>';
  html += '<button class="btn btn-accent" onclick="nextLessonSlide()" style="flex:1">N\u00E6ste \u27A1\uFE0F</button>';
  html += '</div>';
  html += '<div style="text-align:center;margin-top:8px;font-size:0.75rem;color:var(--muted)">' + (lessonSlideIndex + 1) + ' / ' + keys.length + '</div>';
  html += '</div>';

  document.getElementById('lessonsSlideshow').innerHTML = html;
}

function renderLessonInline(category) {
  var lesson = CATEGORY_LESSONS[category];
  if (!lesson) return;
  var el = document.getElementById('lessonInline_' + category.replace(/[^a-zA-Z]/g, ''));
  if (!el) return;
  if (el.style.display === 'block') { el.style.display = 'none'; return; }

  var html = '<div style="background:var(--card2);border-radius:12px;padding:16px;border:1px solid #3d4270;margin-top:8px">';
  html += '<div style="font-size:2rem;text-align:center;margin-bottom:8px">' + lesson.emoji + '</div>';
  html += '<h3 style="text-align:center;margin-bottom:8px">' + lesson.title + '</h3>';
  html += '<div class="lesson-rule"><p>' + lesson.rule + '</p></div>';
  html += '<div class="lesson-examples">';
  for (var i = 0; i < lesson.examples.length; i++) {
    var ex = lesson.examples[i];
    html += '<div class="lesson-example"><div>' + ex.word + '</div><div style="font-size:0.75rem;color:var(--muted);font-weight:400;margin-top:2px">' + ex.note + '</div></div>';
  }
  html += '</div>';
  html += '<div class="lesson-tip">' + lesson.tip + '</div>';
  html += '</div>';
  el.innerHTML = html;
  el.style.display = 'block';
}

var CATEGORY_ICONS = {
  "Stumme bogstaver": "\u{1F507}",
  "Dobbeltkonsonant": "\u270C\uFE0F",
  "For- og efterstavelser": "\u{1F9E9}",
  "Sammensatte ord": "\u{1F517}",
  "Verbernes bøjning": "\u270F\uFE0F",
  "Navneordsendelser": "\u{1F4DD}",
  "Lydrette ord": "\u{1F524}",
  "Nutids-r": "\u00AE\uFE0F",
  "Fremmedord": "\u{1F30D}",
  "Bl\u00F8dt d": "\u{1F4AC}",
  "Konsonantlyde": "\u{1F442}",
  "Ord fra Fransk": "\u{1F1EB}\u{1F1F7}",
  "Ord fra Fransk 2": "\u{1F1EB}\u{1F1F7}"
};

var ALL_CATEGORIES = [];
var PRO_CATEGORIES = ['Ord fra Fransk', 'Ord fra Fransk 2'];

// Show category badge for levels 0-3, hide for 4+
function updatePatternBadge(badgeId, category, wordLevel) {
  var el = document.getElementById(badgeId);
  if (!el) return;
  el.style.display = '';
  var lvlStr = (wordLevel !== undefined) ? ' \u2014 niveau ' + wordLevel : '';
  el.textContent = (CATEGORY_ICONS[category] || '\u{1F520}') + ' ' + category + lvlStr;
}

var LEVEL_LABELS = {
  0: { text: "\u26AA Niveau 0", bg: "rgba(255,255,255,0.1)", color: "#ccc" },
  1: { text: "\u{1F7E2} Niveau 1", bg: "rgba(34,211,160,0.15)", color: "var(--green)" },
  2: { text: "\u{1F7E1} Niveau 2", bg: "rgba(245,166,35,0.15)", color: "var(--accent)" },
  3: { text: "\u{1F7E0} Niveau 3", bg: "rgba(249,115,22,0.15)", color: "#f97316" },
  4: { text: "\u2B50 Mestret", bg: "rgba(244,63,94,0.15)", color: "var(--red)" }
};

var LEVEL_GRADE_MAP = {
  0: "Niveau 0",
  1: "Niveau 1",
  2: "Niveau 2",
  3: "Niveau 3",
  4: "Mestret"
};

// ===== SPIL-STATE OG HJÆLPEFUNKTIONER =====
var currentWords = [], currentIndex = 0, results = [], feedbackShown = false;
var retryAttempt = false;
var sessionCategoryErrors = {}; // track errors per category for lesson triggers
var gameMode = 'training'; // 'training' | 'review'

// Gamification state
var wrongCountPerWord = {};
var pendingBoss = null;
var sessionCorrectCount = 0;
var sessionCorrectStreak = 0; // consecutive correct answers for boss trigger
var pendingChest = false;
var pendingInterruptAction = null; // stores what to do after boss/chest
var sessionUsedWords = {}; // tracks words used in session to prevent repeats
var sessionStartLevels = null; // snapshot af categoryLevels ved sessionstart (kun blandet træning)

// Utility
function show(id) { var el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
function hide(id) { var el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function shuffle(arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

function goHome() {
  ['phase-test','phase-results','phase-fillin','phase-spellingpolice','phase-wordbuilder','phase-sentence','phase-spellpick','phase-wordmemory','phase-screening-intro','phase-screening-test','phase-screening-ran','phase-screening-results','phase-boss','phase-profile-picker','phase-dashboard'].forEach(function(id) { hide(id); });
  document.getElementById('chestOverlay').classList.add('hidden');
  document.querySelectorAll('.session-badge').forEach(function(el) { el.remove(); });
  cleanupPacman();
  cleanupHighway();
  cleanupSnake();
  if (bossRainInterval) { clearInterval(bossRainInterval); bossRainInterval = null; }
  if (highwayInterval) { clearInterval(highwayInterval); highwayInterval = null; }
  show('phase-welcome');
  updateWelcomeAvatar();
  renderCategoryLevels();
  updateDashboardButton();
  applyPlayerCosmetics();
}

// Grade selector
function selectGrade(g) {
  try { localStorage.setItem(playerKey('student_grade'), g.toString()); } catch(e) {}
  syncToSupabase();
  var btns = document.querySelectorAll('.grade-btn');
  btns.forEach(function(b) {
    if (parseInt(b.getAttribute('data-grade')) === g) b.classList.add('active');
    else b.classList.remove('active');
  });
}

function loadGrade() {
  try {
    var v = localStorage.getItem(playerKey('student_grade'));
    if (v === null) return -1;
    var n = parseInt(v);
    return isNaN(n) ? -1 : n;
  } catch(e) { return -1; }
}

function restoreGradeSelection() {
  var g = loadGrade();
  if (g >= 0 && g <= 8) {
    var btns = document.querySelectorAll('.grade-btn');
    btns.forEach(function(b) {
      if (parseInt(b.getAttribute('data-grade')) === g) b.classList.add('active');
      else b.classList.remove('active');
    });
  }
}

// Settings toggle
function toggleSettings() {
  var panel = document.getElementById('settingsPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderClassSettings();
}

// Spaced Repetition
var SR_INTERVALS = [0, ONE_DAY_MS, 3*ONE_DAY_MS, 7*ONE_DAY_MS, 14*ONE_DAY_MS];

function loadSRData() {
  try { var raw = localStorage.getItem(playerKey('sr_data')); return raw ? JSON.parse(raw) : { words: {} }; } catch(e) { return { words: {} }; }
}

function saveSRData(data) {
  try { localStorage.setItem(playerKey('sr_data'), JSON.stringify(data)); } catch(e) {}
  syncToSupabase();
}

function updateSRWord(word, correct, category) {
  if (category === 'Ord fra Fransk' || category === 'Ord fra Fransk 2') trackFrenchWord(word, correct, category);
  var sr = loadSRData();
  if (!sr.words) sr.words = {};
  if (!sr.words[word]) { sr.words[word] = { level: 0, nextReview: Date.now(), category: category }; }
  if (correct) { sr.words[word].level = Math.min(sr.words[word].level + 1, 4); }
  else { sr.words[word].level = 0; }
  var interval = SR_INTERVALS[sr.words[word].level] || 0;
  sr.words[word].nextReview = Date.now() + interval;
  sr.words[word].category = category;
  saveSRData(sr);
}

function getDueWords() {
  var sr = loadSRData();
  if (!sr.words) sr.words = {};
  var now = Date.now();
  var due = [];
  for (var word in sr.words) {
    if (now >= sr.words[word].nextReview) {
      for (var ci = 0; ci < ALL_CATEGORIES.length; ci++) {
        var cat = ALL_CATEGORIES[ci];
        var found = WORD_BANK[cat].find(function(w) { return w.word === word; });
        if (found) { due.push(Object.assign({}, found, { category: cat })); break; }
      }
    }
  }
  return due;
}

// Profile storage
function loadProfile() {
  try { var raw = localStorage.getItem(playerKey('profile_data')); return raw ? JSON.parse(raw) : null; } catch(e) { return null; }
}

function saveProfile(data) {
  try { localStorage.setItem(playerKey('profile_data'), JSON.stringify(data)); } catch(e) {}
  syncToSupabase();
}

function resetProfile() {
  if (!confirm('Er du sikker? Dit stavespil-resultat og niveau bliver slettet.')) return;
  localStorage.removeItem(playerKey('profile_data'));
  goHome();
}

// Starting level per category — categories with level 0 words start at 0
var CATEGORY_START_LEVELS = {
  'Lydrette ord': 0,
  'Fremmedord': 2,
  'Blødt d': 1,
  'Ord fra Fransk': 5,
  'Ord fra Fransk 2': 5
};

// Per-category level system
function loadCategoryLevels() {
  var profile = loadProfile();
  if (profile && profile.categoryLevels) {
    // Migrate: ensure no category is below its start level
    var needsSave = false;
    for (var cat in CATEGORY_START_LEVELS) {
      var sl = CATEGORY_START_LEVELS[cat];
      if (profile.categoryLevels[cat] && profile.categoryLevels[cat].level < sl) {
        profile.categoryLevels[cat].level = sl;
        needsSave = true;
      }
    }
    if (needsSave) saveCategoryLevels(profile.categoryLevels);
    return profile.categoryLevels;
  }
  var levels = {};
  for (var i = 0; i < ALL_CATEGORIES.length; i++) {
    var cat = ALL_CATEGORIES[i];
    var startLevel = CATEGORY_START_LEVELS[cat] !== undefined ? CATEGORY_START_LEVELS[cat] : 1;
    levels[cat] = { level: startLevel, history: [] };
  }
  return levels;
}

function saveCategoryLevels(levels) {
  var profile = loadProfile() || {};
  profile.categoryLevels = levels;
  try { localStorage.setItem(playerKey('profile_data'), JSON.stringify(profile)); } catch(e) {}
  syncToSupabase();
}

function trackFrenchWord(word, correct, category) {
  if (!correct) return;
  var data = loadRewardData();
  var key = (category === 'Ord fra Fransk 2') ? 'french2CorrectWords' : 'frenchCorrectWords';
  if (!data[key]) data[key] = [];
  var w = word.toLowerCase();
  if (data[key].indexOf(w) === -1) {
    data[key].push(w);
    saveRewardData(data);
  }
}

function getFrenchProgress(category) {
  var data = loadRewardData();
  var key = (category === 'Ord fra Fransk 2') ? 'french2CorrectWords' : 'frenchCorrectWords';
  return (data[key] || []).length;
}

function isFrench2Unlocked() {
  var data = loadRewardData();
  return !!data.french2Unlocked;
}

function purchaseFrench2() {
  var data = loadRewardData();
  if (data.gems < 10) return false;
  data.gems -= 10;
  data.french2Unlocked = true;
  saveRewardData(data);
  updateRewardBar();
  var gemsEl = document.getElementById('welcomeGemsDisplay');
  if (gemsEl) gemsEl.innerHTML = '\u{1F48E} ' + data.gems;
  renderCategoryLevels();
  return true;
}

// Progressivt oprykningskrav: afstand til mestring bestemmer strengheden.
// Tidlige niveauer skal føles belønnende, mens mestring kræver vedvarende præstation.
function getLevelUpThreshold(currentLevel, maxLevel) {
  var levelsLeft = maxLevel - currentLevel;
  if (levelsLeft <= 1) return { minAnswers: 50, minPct: 0.90 }; // mestring
  if (levelsLeft === 2) return { minAnswers: 20, minPct: 0.85 };
  if (levelsLeft === 3) return { minAnswers: 10, minPct: 0.82 };
  return { minAnswers: 5, minPct: 0.80 }; // første niveau(er)
}

function updateCategoryLevel(category, correct, wordLevel, userAnswer, misspelling) {
  if (!category || ALL_CATEGORIES.indexOf(category) === -1) return;
  // Ord fra Fransk / Fransk 2: track unique correct words instead of normal level system
  if (category === 'Ord fra Fransk' || category === 'Ord fra Fransk 2') return;
  // Tilfældige tastefejl straffes ikke: hvis svaret ikke matcher kategoriens
  // forventede misspelling, tæller det som "ikke-kategori-fejl" (true i historik).
  // Korrekte svar og kategori-typiske fejl tælles som normalt.
  var historyEntry = correct;
  if (!correct && misspelling && userAnswer) {
    if (userAnswer.toLowerCase().trim() !== misspelling.toLowerCase()) {
      historyEntry = true;
    }
  }
  var levels = loadCategoryLevels();
  if (!levels[category]) levels[category] = { level: 1, history: [] };
  var cat = levels[category];
  var maxLevel = CATEGORY_MAX_LEVELS[category] !== undefined ? CATEGORY_MAX_LEVELS[category] : 4;
  var startLevel = CATEGORY_START_LEVELS[category] !== undefined ? CATEGORY_START_LEVELS[category] : 1;

  // Mestret kategori: tæl vedligeholds-svar på top-niveau (word.level === maxLevel-1).
  // Gentagne fejl her → falder tilbage til max-1 (un-master).
  if (cat.level >= maxLevel) {
    if (wordLevel === maxLevel - 1) {
      cat.history.push(historyEntry);
      if (cat.history.length > 10) cat.history = cat.history.slice(-10);
      var mCorrect = cat.history.filter(function(h) { return h; }).length;
      if (cat.history.length >= 5 && mCorrect / cat.history.length < 0.4) {
        cat.level = maxLevel - 1;
        cat.history = [];
      }
    }
    levels[category] = cat;
    saveCategoryLevels(levels);
    return;
  }

  // Kun svar på ord på spillerens nuværende niveau tæller
  var wl = (wordLevel !== undefined) ? wordLevel : cat.level;
  if (wl === cat.level) {
    var threshold = getLevelUpThreshold(cat.level, maxLevel);
    cat.history.push(historyEntry);
    // Dynamisk historik-loft: matcher nuværende niveaus krav (men altid mindst 10)
    var maxHistory = Math.max(10, threshold.minAnswers);
    if (cat.history.length > maxHistory) cat.history = cat.history.slice(-maxHistory);

    var total = cat.history.length;
    var correctCount = cat.history.filter(function(h) { return h; }).length;

    // Oprykning: progressivt krav afhænger af afstand til mestring
    if (total >= threshold.minAnswers && correctCount / total >= threshold.minPct && cat.level < maxLevel) {
      cat.level++;
      cat.history = [];
    }
    // Nedrykning: uændret — <40% af 5+ svar, aldrig under startniveau
    else if (total >= 5 && correctCount / total < 0.4 && cat.level > startLevel) {
      cat.level--;
      cat.history = [];
    }
  }

  levels[category] = cat;
  saveCategoryLevels(levels);
}

function buildPoolForCategory(cat, catLevel) {
  var stats = loadWordStats();
  var pool = (WORD_BANK[cat] || []).filter(function(w) { return w.level === catLevel; });
  if (pool.length < 3) {
    pool = (WORD_BANK[cat] || []).filter(function(w) {
      return w.level >= Math.max(0, catLevel - 1) && w.level <= catLevel + 1;
    });
  }
  // Filter out words answered correctly 2+ times in a row
  var filtered = pool.filter(function(w) {
    var s = stats[w.word.toLowerCase()];
    return !s || (s.streak || 0) < 2;
  });
  // Fallback: if all words are mastered, use full pool so player can still play
  if (filtered.length === 0) filtered = pool;
  return filtered.map(function(w) { return Object.assign({}, w, { category: cat }); });
}

// Pick a boss word from one level higher than player's current level, excluding used words
function pickBossWord(fallbackWord) {
  var levels = loadCategoryLevels();
  var lydretLevel = (levels['Lydrette ord'] && levels['Lydrette ord'].level !== undefined) ? levels['Lydrette ord'].level : 0;
  var atLevel2 = countCategoriesAtLevel(levels, 2);
  var pool = [];
  for (var i = 0; i < ALL_CATEGORIES.length; i++) {
    var cat = ALL_CATEGORIES[i];
    if (!WORD_BANK[cat] || PRO_CATEGORIES.indexOf(cat) !== -1) continue;
    if (cat !== 'Lydrette ord' && lydretLevel < 1) continue;
    if (cat === 'Fremmedord' && atLevel2 < 2) continue;
    var catLevel = (levels[cat] && levels[cat].level !== undefined) ? levels[cat].level : 1;
    var maxLvl = CATEGORY_MAX_LEVELS[cat] || 5;
    if (catLevel >= maxLvl) continue; // skip mastered
    var nextLevel = catLevel + 1;
    var words = WORD_BANK[cat].filter(function(w) { return w.level === nextLevel; });
    for (var j = 0; j < words.length; j++) {
      if (!sessionUsedWords[words[j].word.toLowerCase()]) {
        pool.push({ word: words[j].word, category: cat });
      }
    }
  }
  // Fallback: current level, unused words
  if (pool.length === 0) {
    for (var i = 0; i < ALL_CATEGORIES.length; i++) {
      var cat = ALL_CATEGORIES[i];
      if (!WORD_BANK[cat] || PRO_CATEGORIES.indexOf(cat) !== -1) continue;
      if (cat !== 'Lydrette ord' && lydretLevel < 1) continue;
      if (cat === 'Fremmedord' && atLevel2 < 2) continue;
      var catLevel = (levels[cat] && levels[cat].level !== undefined) ? levels[cat].level : 1;
      var words = WORD_BANK[cat].filter(function(w) { return w.level === catLevel; });
      for (var j = 0; j < words.length; j++) {
        if (!sessionUsedWords[words[j].word.toLowerCase()]) {
          pool.push({ word: words[j].word, category: cat });
        }
      }
    }
  }
  if (pool.length > 0) {
    var pick = pool[Math.floor(Math.random() * pool.length)];
    sessionUsedWords[pick.word.toLowerCase()] = true;
    return pick;
  }
  return fallbackWord;
}

// Max level per category — one above highest word level (5 = mastered all level 4 words)
// "Mastered" when player reaches this level (category stops appearing in training)
var CATEGORY_MAX_LEVELS = {
  'Lydrette ord': 4,
  'Stumme bogstaver': 5,
  'Dobbeltkonsonant': 5,
  'Sammensatte ord': 3,
  'Verbernes bøjning': 5,
  'Nutids-r': 5,
  'Fremmedord': 5,
  'Blødt d': 5,
  'Konsonantlyde': 4,
  'Ord fra Fransk': 6,
  'Ord fra Fransk 2': 6
};

function isFrenchUnlocked() {
  var data = loadRewardData();
  return !!data.frenchUnlocked;
}

function purchaseFrench() {
  var data = loadRewardData();
  if (data.gems < 10) return false;
  data.gems -= 10;
  data.frenchUnlocked = true;
  saveRewardData(data);
  updateRewardBar();
  var gemsEl = document.getElementById('welcomeGemsDisplay');
  if (gemsEl) gemsEl.innerHTML = '\u{1F48E} ' + data.gems;
  renderCategoryLevels();
  return true;
}

// Vedligeholds-pool: mestrede kategorier bidrager med deres top-niveau-ord
// (word.level === max-1). Bruges som low-frequency injection i blandet træning
// så færdigheden holdes vedlige og kan falde tilbage ved gentagne fejl.
function buildMaintenancePool() {
  var levels = loadCategoryLevels();
  var stats = loadWordStats();
  var pool = [];
  for (var i = 0; i < ALL_CATEGORIES.length; i++) {
    var cat = ALL_CATEGORIES[i];
    if (!WORD_BANK[cat] || PRO_CATEGORIES.indexOf(cat) !== -1) continue;
    var catLevel = (levels[cat] && levels[cat].level !== undefined) ? levels[cat].level : 1;
    var maxLvl = CATEGORY_MAX_LEVELS[cat] !== undefined ? CATEGORY_MAX_LEVELS[cat] : 5;
    if (catLevel < maxLvl) continue; // kun mestrede
    var topLevel = maxLvl - 1;
    var words = (WORD_BANK[cat] || []).filter(function(w) { return w.level === topLevel; });
    // Filtrér ord med streak ≥2 (spilleren kan dem) så der kommer variation
    var filtered = words.filter(function(w) {
      var s = stats[w.word.toLowerCase()];
      return !s || (s.streak || 0) < 2;
    });
    if (filtered.length === 0) filtered = words; // fallback hvis alle mestrede
    for (var j = 0; j < filtered.length; j++) {
      pool.push(Object.assign({}, filtered[j], { category: cat }));
    }
  }
  return pool;
}

function countMasteredCategories(levels) {
  var count = 0;
  for (var i = 0; i < ALL_CATEGORIES.length; i++) {
    var cat = ALL_CATEGORIES[i];
    if (cat === 'Ord fra Fransk' || cat === 'Ord fra Fransk 2') continue;
    var catLevel = (levels[cat] && levels[cat].level !== undefined) ? levels[cat].level : 1;
    var maxLvl = CATEGORY_MAX_LEVELS[cat] !== undefined ? CATEGORY_MAX_LEVELS[cat] : 5;
    if (catLevel >= maxLvl) count++;
  }
  return count;
}

function countCategoriesAtLevel(levels, minLevel) {
  var count = 0;
  for (var i = 0; i < ALL_CATEGORIES.length; i++) {
    var cat = ALL_CATEGORIES[i];
    if (cat === 'Fremmedord' || PRO_CATEGORIES.indexOf(cat) !== -1) continue;
    var lvl = (levels[cat] && levels[cat].level !== undefined) ? levels[cat].level : 1;
    if (lvl >= minLevel) count++;
  }
  return count;
}

function buildPoolWithCategoryLevels(categories) {
  var levels = loadCategoryLevels();
  var atLevel2 = countCategoriesAtLevel(levels, 2);
  var lydretLevel = (levels['Lydrette ord'] && levels['Lydrette ord'].level !== undefined) ? levels['Lydrette ord'].level : 0;
  var pool = [];
  for (var i = 0; i < categories.length; i++) {
    var cat = categories[i];
    if (!WORD_BANK[cat]) continue;
    // Skip pro categories — handled separately by buildProPool
    if (PRO_CATEGORIES.indexOf(cat) !== -1) continue;
    // Only Lydrette ord until it reaches level 1
    if (cat !== 'Lydrette ord' && lydretLevel < 1) continue;
    // Fremmedord requires 2 other categories at level 2+
    if (cat === 'Fremmedord' && atLevel2 < 2) continue;
    var catLevel = (levels[cat] && levels[cat].level !== undefined) ? levels[cat].level : 1;
    // Skip mastered categories
    if (CATEGORY_MAX_LEVELS[cat] !== undefined && catLevel >= CATEGORY_MAX_LEVELS[cat]) continue;
    pool = pool.concat(buildPoolForCategory(cat, catLevel));
  }
  return pool;
}

function buildProPool() {
  var pool = [];
  if (isFrenchUnlocked()) {
    var frenchTotal = (WORD_BANK['Ord fra Fransk'] || []).length;
    if (getFrenchProgress() < frenchTotal) {
      pool = pool.concat((WORD_BANK['Ord fra Fransk'] || []).map(function(w) { return Object.assign({}, w, { category: 'Ord fra Fransk' }); }));
    }
  }
  if (isFrench2Unlocked()) {
    var french2Total = (WORD_BANK['Ord fra Fransk 2'] || []).length;
    if (getFrenchProgress('Ord fra Fransk 2') < french2Total) {
      pool = pool.concat((WORD_BANK['Ord fra Fransk 2'] || []).map(function(w) { return Object.assign({}, w, { category: 'Ord fra Fransk 2' }); }));
    }
  }
  // Filter out words with streak >= 2
  var stats = loadWordStats();
  var filtered = pool.filter(function(w) {
    var s = stats[w.word.toLowerCase()];
    return !s || (s.streak || 0) < 2;
  });
  return filtered.length > 0 ? filtered : pool;
}

function resetAll() {
  if (!confirm('Er du HELT sikker? ALT bliver slettet \u2014 stavespil, XP og \u00F8veord.')) return;
  localStorage.removeItem(playerKey('profile_data'));
  localStorage.removeItem(playerKey('reward_data'));
  localStorage.removeItem(playerKey('sr_data'));
  localStorage.removeItem(playerKey('screening_data'));
  goHome();
}

// ===== LYDE OG TTS =====
function setVoice(voiceId) {
  try { localStorage.setItem('tts_voice', voiceId); } catch(e) {}
  audioCache = {};
  var allBtns = document.querySelectorAll('.voice-btn');
  allBtns.forEach(function(b) { b.classList.remove('active'); });
  var btnId = voiceId === 'male' ? 'vbtn-male' : 'vbtn-female';
  var b = document.getElementById(btnId); if (b) b.classList.add('active');
  // Also update in-test voice buttons
  var btnId2 = voiceId === 'male' ? 'vbtn-male2' : 'vbtn-female2';
  var b2 = document.getElementById(btnId2); if (b2) b2.classList.add('active');
}

function loadVoice() {
  try {
    var v = localStorage.getItem('tts_voice') || 'female';
    // Migrate old voice IDs
    if (v !== 'male' && v !== 'female') {
      v = (v.indexOf('-D') !== -1 || v.indexOf('-C') !== -1 || v.indexOf('-G') !== -1) ? 'male' : 'female';
      localStorage.setItem('tts_voice', v);
    }
    return v;
  } catch(e) { return 'female'; }
}

function toggleApiPanel() {
  var p = document.getElementById('apiPanel');
  if (!p) return;
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
  if (p.style.display === 'block') {
    var k = loadApiKey();
    var inp = document.getElementById('apiKeyInput2');
    if (inp) { inp.value = k; updateApiStatus2(k); }
  }
}

function syncApiInputs() {
  var k = loadApiKey();
  var i1 = document.getElementById('apiKeyInput');
  var i2 = document.getElementById('apiKeyInput2');
  if (i1 && i1.value !== k) i1.value = k;
  if (i2 && i2.value !== k) i2.value = k;
  updateApiStatus(k);
  updateApiStatus2(k);
}

function updateApiStatus2(key) {
  var el = document.getElementById('apiKeyStatus2');
  if (!el) return;
  el.innerHTML = key ? '<span style="color:var(--green)">\u2713 Aktiveret</span>' : 'Ingen nøgle — bruger browser-stemme';
}

// API key storage (Google Cloud TTS)
function saveApiKey(val) {
  try { localStorage.setItem('gcloud_tts_key', val.trim()); } catch(e){}
  updateApiStatus(val.trim());
  updateApiStatus2(val.trim());
}
function loadApiKey() {
  try { return localStorage.getItem('gcloud_tts_key') || ''; } catch(e) { return ''; }
}
function updateApiStatus(key) {
  var el = document.getElementById('apiKeyStatus');
  if (!el) return;
  el.innerHTML = key
    ? '<span style="color:var(--green)">\u2713 Google TTS aktiveret — naturlig dansk stemme</span>'
    : 'Opret gratis på <a href="https://console.cloud.google.com" target="_blank" style="color:var(--blue)">console.cloud.google.com</a> \u2192 aktiver Text-to-Speech API \u2192 Credentials \u2192 API Key.';
}

// Anthropic API key
function saveAnthropicKey(val) {
  try { localStorage.setItem('anthropic_api_key', val.trim()); } catch(e){}
  updateAnthropicStatus(val.trim());
}
function loadAnthropicKey() {
  try { return localStorage.getItem('anthropic_api_key') || ''; } catch(e) { return ''; }
}
function updateAnthropicStatus(key) {
  var el = document.getElementById('anthropicKeyStatus');
  if (!el) return;
  el.innerHTML = key
    ? '<span style="color:var(--green)">\u2713 Anthropic API aktiveret — AI-analyse klar</span>'
    : 'Hent nøgle på <a href="https://console.anthropic.com" target="_blank" style="color:var(--blue)">console.anthropic.com</a> \u2192 API Keys.';
}

// TTS - Google Cloud with browser fallback
var audioCache = {};
var audioManifest = null;

function sanitizeFilename(word) {
  return word.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]/g, '_');
}

function playStaticAudio(wordAudioUrl, sentenceAudioUrl, btn) {
  var wordAudio = new Audio(wordAudioUrl);
  wordAudio.onerror = function() {
    if (btn) { btn.classList.remove('speaking'); btn.innerHTML = '\u{1F508} Hør ordet igen'; }
  };
  if (sentenceAudioUrl) {
    wordAudio.onended = function() {
      setTimeout(function() {
        var sentAudio = new Audio(sentenceAudioUrl);
        sentAudio.onended = sentAudio.onerror = function() {
          if (btn) { btn.classList.remove('speaking'); btn.innerHTML = '\u{1F508} Hør ordet igen'; }
        };
        sentAudio.play();
      }, 600);
    };
  } else {
    wordAudio.onended = function() {
      if (btn) { btn.classList.remove('speaking'); btn.innerHTML = '\u{1F508} Hør ordet igen'; }
    };
  }
  wordAudio.play();
}

async function speakWord(word, sentence) {
  var btn = document.getElementById('listenBtn');
  if (btn) { btn.classList.add('speaking'); btn.textContent = '\u{1F509} Læser op...'; }

  // 1. Try pre-generated static audio files
  if (audioManifest && audioManifest[word]) {
    var m = audioManifest[word];
    var voice = loadVoice();
    var wordUrl = voice === 'male' && m.word_m ? m.word_m : m.word;
    var sentUrl = voice === 'male' && m.sentence_m ? m.sentence_m : m.sentence;
    playStaticAudio(wordUrl, sentence ? sentUrl : null, btn);
    return;
  }

  // 2. Try Google Cloud TTS API
  var apiKey = loadApiKey();
  var texts = sentence ? [word, sentence] : [word];

  if (apiKey) {
    try {
      var cacheKey = texts.join('|');
      if (audioCache[cacheKey]) { playAudioBase64(audioCache[cacheKey], btn); return; }

      var audioParts = [];
      for (var ti = 0; ti < texts.length; ti++) {
        var text = texts[ti];
        var res = await fetch(
          'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + apiKey,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: { text: text },
              voice: { languageCode: 'da-DK', name: loadVoice() },
              audioConfig: { audioEncoding: 'MP3', speakingRate: text === word ? 0.8 : 0.95 }
            })
          }
        );
        if (!res.ok) throw new Error('Google TTS fejl: ' + res.status);
        var data = await res.json();
        audioParts.push(data.audioContent);
      }
      audioCache[cacheKey] = audioParts;
      playAudioBase64(audioParts, btn);
      return;
    } catch(err) {
      console.warn('Google TTS fejlede, bruger browser-stemme:', err);
    }
  }

  // 3. Browser TTS fallback
  window.speechSynthesis.cancel();
  var voices = window.speechSynthesis.getVoices();
  var v = voices.find(function(v) { return v.lang.startsWith('da'); }) || voices.find(function(v) { return v.lang.startsWith('nb'); });
  var wordUtter = new SpeechSynthesisUtterance(word);
  wordUtter.lang = 'da-DK'; wordUtter.rate = 0.75; wordUtter.pitch = 1;
  if (v) wordUtter.voice = v;
  if (sentence) {
    wordUtter.onend = function() {
      setTimeout(function() {
        var sentUtter = new SpeechSynthesisUtterance(sentence);
        sentUtter.lang = 'da-DK'; sentUtter.rate = 0.9; sentUtter.pitch = 1;
        if (v) sentUtter.voice = v;
        sentUtter.onend = sentUtter.onerror = function() {
          if (btn) { btn.classList.remove('speaking'); btn.innerHTML = '\u{1F508} Hør ordet igen'; }
        };
        window.speechSynthesis.speak(sentUtter);
      }, 600);
    };
  } else {
    wordUtter.onend = wordUtter.onerror = function() {
      if (btn) { btn.classList.remove('speaking'); btn.innerHTML = '\u{1F508} Hør ordet igen'; }
    };
  }
  window.speechSynthesis.speak(wordUtter);
}

function playAudioBase64(parts, btn, index) {
  if (index === undefined) index = 0;
  if (index >= parts.length) {
    if (btn) { btn.classList.remove('speaking'); btn.innerHTML = '\u{1F508} Hør ordet igen'; }
    return;
  }
  var audio = new Audio('data:audio/mp3;base64,' + parts[index]);
  audio.onended = function() { setTimeout(function() { playAudioBase64(parts, btn, index + 1); }, index === 0 && parts.length > 1 ? 600 : 0); };
  audio.onerror = function() { if (btn) { btn.classList.remove('speaking'); btn.innerHTML = '\u{1F508} Hør ordet igen'; } };
  audio.play();
}

function speakCurrentWord() {
  var w = currentWords[currentIndex];
  speakWord(w.word, w.sentence || null);
}

// ===== TRÆNING OG DIKTAT =====
var mixedQueue = [];
var mixedIndex = 0;
var isMixedSession = false;

function startTrainingFromProfile() {
  hide('phase-results');
  var resultsEl = document.getElementById('resultsContent');
  if (resultsEl) resultsEl.innerHTML = '';
  var profile = loadProfile() || {};
  // Use all categories — weakCategories from diagnostik is too narrow and gets stale
  var categories = ALL_CATEGORIES;
  isMixedSession = true;
  pendingBoss = null;
  sessionLessonCategories = [];
  sessionCorrectCount = 0; sessionCorrectStreak = 0; sessionCategoryErrors = {};
  sessionBossCount = 0;
  pendingChest = false;
  wrongCountPerWord = {};
  sessionUsedWords = {};
  results = [];

  // Snapshot af kategori-niveauer til at vise op/ned-ændringer i resultat-oversigten
  var startLevels = loadCategoryLevels();
  sessionStartLevels = {};
  for (var slCat in startLevels) {
    sessionStartLevels[slCat] = startLevels[slCat].level;
  }

  var pool = buildPoolWithCategoryLevels(categories);
  if (pool.length === 0) {
    for (var ci2 = 0; ci2 < categories.length; ci2++) {
      var cat2 = categories[ci2];
      if (!WORD_BANK[cat2] || PRO_CATEGORIES.indexOf(cat2) !== -1) continue;
      pool = pool.concat(WORD_BANK[cat2].map(function(w) { return Object.assign({}, w, { category: cat2 }); }));
    }
  }
  pool = shuffle(pool);

  // Pick 1 pro word if any pro category is unlocked
  var proPool = buildProPool();
  var proWord = null;
  if (proPool.length > 0) {
    proPool = shuffle(proPool);
    proWord = proPool[0];
  }

  // Kvote-baseret kø: 5 diktat + 1 af hver variation-type (fillin, spellingpolice,
  // wordbuilder, spellpick, sentence). Matcher ord → type i rækkefølge efter
  // sjældenhed (wordbuilder sjældnest) så flaskehalse ikke skæver fordelingen.
  var CANDIDATE_POOL_SIZE = 30;
  var candidates = pool.slice(0, CANDIDATE_POOL_SIZE);
  if (proWord) candidates = [proWord].concat(candidates); // pro-ordet får første match-chance

  var enriched = candidates.map(function(w) {
    return {
      wordObj: w,
      blanks: generateBlanks(w),
      spItem: buildSpellingPoliceItem(w),
      morphemes: parseMorphemes(w.patternHint, w.word),
      sentenceOk: !!(w.hint && w.level >= 1)
    };
  });

  function isEligibleFor(type, e) {
    if (type === 'wordbuilder') return !!e.morphemes;
    if (type === 'sentence') return e.sentenceOk;
    if (type === 'fillin') return !!e.blanks;
    if (type === 'spellingpolice') return !!e.spItem;
    if (type === 'spellpick') return true;
    return false;
  }

  var usedKey = {};
  function takeEligible(type) {
    for (var i = 0; i < enriched.length; i++) {
      var e = enriched[i];
      var k = e.wordObj.word.toLowerCase();
      if (usedKey[k]) continue;
      if (isEligibleFor(type, e)) {
        usedKey[k] = true;
        return { wordObj: e.wordObj, type: type, blanks: e.blanks, spItem: e.spItem, morphemes: e.morphemes };
      }
    }
    return null;
  }

  var queue = [];
  var targets = ['wordbuilder', 'sentence', 'fillin', 'spellingpolice', 'spellpick'];
  for (var ti = 0; ti < targets.length; ti++) {
    var target = targets[ti];
    var item = takeEligible(target);
    if (item) {
      queue.push(item);
    } else {
      // Fallback: brug spellpick (altid eligible) og log unfulfilled
      trackUnfulfilledType(target);
      var fb = takeEligible('spellpick');
      if (fb) queue.push(fb);
    }
  }

  // Vedligeholds-slot: hvis der findes mestrede kategorier, inject 1 tilfældigt
  // top-niveau ord derfra som diktat (10% af sessionen). Holder færdigheden varm
  // og udløser demaster hvis spilleren fejler gentagne gange.
  var maintPool = shuffle(buildMaintenancePool()).filter(function(w) {
    return !usedKey[w.word.toLowerCase()];
  });
  if (maintPool.length > 0 && queue.length < 10) {
    var mw = maintPool[0];
    usedKey[mw.word.toLowerCase()] = true;
    queue.push({
      wordObj: mw,
      type: 'diktat',
      blanks: generateBlanks(mw),
      spItem: buildSpellingPoliceItem(mw),
      morphemes: parseMorphemes(mw.patternHint, mw.word)
    });
  }

  // Fyld resten med diktat (op til 10 items total)
  while (queue.length < 10) {
    var filled = false;
    for (var j = 0; j < enriched.length; j++) {
      var ej = enriched[j];
      var kj = ej.wordObj.word.toLowerCase();
      if (usedKey[kj]) continue;
      usedKey[kj] = true;
      queue.push({ wordObj: ej.wordObj, type: 'diktat', blanks: ej.blanks, spItem: ej.spItem, morphemes: ej.morphemes });
      filled = true;
      break;
    }
    if (!filled) break; // pool tom (sker kun hvis <10 unikke kandidater)
  }

  mixedQueue = shuffle(queue);
  for (var qi = 0; qi < mixedQueue.length; qi++) {
    sessionUsedWords[mixedQueue[qi].wordObj.word.toLowerCase()] = true;
  }

  console.log('Mixed queue types:', mixedQueue.map(function(q) { return q.type; }));

  if (mixedQueue.length === 0) {
    alert('Ingen ord fundet til tr\u00E6ning.');
    return;
  }

  mixedIndex = 0;
  hide('phase-welcome');
  updateRewardBar();
  document.querySelectorAll('.session-badge').forEach(function(el) { el.remove(); });

  renderMixedItem();
}

function hideAllExercisePhases() {
  ['phase-test', 'phase-fillin', 'phase-spellingpolice', 'phase-wordbuilder', 'phase-sentence', 'phase-spellpick', 'phase-wordmemory'].forEach(function(id) { hide(id); });
}

function trackExerciseType(type) {
  if (!type || !activePlayer) return;
  var key = playerKey('exercise_stats');
  var stats = {};
  try { stats = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) {}
  stats[type] = (stats[type] || 0) + 1;
  stats._total = (stats._total || 0) + 1;
  stats._updatedAt = Date.now();
  try { localStorage.setItem(key, JSON.stringify(stats)); } catch(e) {}
}

function trackUnfulfilledType(type) {
  if (!type || !activePlayer) return;
  var key = playerKey('exercise_stats');
  var stats = {};
  try { stats = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) {}
  stats._unfulfilled = stats._unfulfilled || {};
  stats._unfulfilled[type] = (stats._unfulfilled[type] || 0) + 1;
  try { localStorage.setItem(key, JSON.stringify(stats)); } catch(e) {}
}

function renderMixedItem() {
  if (mixedIndex >= mixedQueue.length) { finishMixedTraining(); return; }
  var item = mixedQueue[mixedIndex];
  trackExerciseType(item.type);
  hideAllExercisePhases();
  hide('phase-boss');
  document.getElementById('chestOverlay').classList.add('hidden');

  var correctCount = results.filter(function(r) { return r.correct; }).length;
  var wrongCount = results.filter(function(r) { return !r.correct; }).length;
  var progressPct = ((mixedIndex / mixedQueue.length) * 100) + '%';
  var wordNumStr = String(mixedIndex + 1);

  // Map of prefix → phase score/progress element IDs
  var prefixMap = {
    diktat: '', fillin: 'fillin',
    spellingpolice: 'sp', wordbuilder: 'wb', spellpick: 'spk', sentence: 'sw'
  };
  var prefix = prefixMap[item.type] || '';
  var scoreC = document.getElementById(prefix ? prefix + 'ScoreCorrect' : 'scoreCorrect');
  var scoreW = document.getElementById(prefix ? prefix + 'ScoreWrong' : 'scoreWrong');
  var wordNum = document.getElementById(prefix ? prefix + 'WordNum' : 'wordNum');
  var progBar = document.getElementById(prefix ? prefix + 'ProgressBar' : 'progressBar');
  if (scoreC) scoreC.textContent = correctCount;
  if (scoreW) scoreW.textContent = wrongCount;
  if (wordNum) wordNum.textContent = wordNumStr;
  if (progBar) progBar.style.width = progressPct;

  switch (item.type) {
    case 'diktat':
      gameMode = 'training';
      currentWords = [item.wordObj];
      currentIndex = 0;
      document.getElementById('testPhaseLabel').style.display = 'none';
      document.getElementById('difficultyLabel').innerHTML = '';
      show('phase-test');
      renderWord();
      break;

    case 'fillin':
      gameMode = 'fillin';
      fillinWords = [item.wordObj];
      fillinBlanks = [item.blanks];
      fillinIndex = 0;
      fillinResults = results.filter(function(r) { return true; }); // share results
      show('phase-fillin');
      renderFillInWord();
      break;

    case 'spellingpolice':
      gameMode = 'spellingpolice';
      spItems = [item.spItem];
      spIndex = 0;
      spResults = [];
      show('phase-spellingpolice');
      renderSpellingPoliceWord();
      break;

    case 'wordbuilder':
      gameMode = 'wordbuilder';
      wbWords = [{ wordObj: item.wordObj, morphemes: item.morphemes }];
      wbIndex = 0;
      wbResults = [];
      show('phase-wordbuilder');
      renderWBWord();
      break;

    case 'spellpick':
      gameMode = 'spellpick';
      spkWords = [item.wordObj];
      spkIndex = 0;
      spkResults = [];
      var spkWord = item.wordObj;
      spkWord._dbMis = [];
      fetchMisspellings([spkWord.word.toLowerCase()], function(misByWord) {
        spkWords[0]._dbMis = misByWord[spkWord.word.toLowerCase()] || [];
        show('phase-spellpick');
        renderSpkWord();
      });
      break;

    case 'sentence':
      gameMode = 'sentence';
      show('phase-sentence');
      renderSentenceWord(item.wordObj);
      break;
  }
}

function nextMixedItem() {
  // Check for boss/chest interrupts
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;

  if (pendingBoss) {
    pendingInterruptAction = (mixedIndex + 1) >= mixedQueue.length ? 'finish' : 'continue';
    mixedIndex++;
    hideAllExercisePhases();
    showBossMinigame(pendingBoss);
    return;
  }

  if (pendingChest) {
    pendingChest = false;
    pendingInterruptAction = (mixedIndex + 1) >= mixedQueue.length ? 'finish' : 'continue';
    mixedIndex++;
    showTreasureChest();
    return;
  }

  mixedIndex++;

  if (mixedIndex >= mixedQueue.length) {
    finishMixedTraining();
  } else {
    renderMixedItem();
  }
}

var finalBossDone = false;
var sessionBossCount = 0;

function finishMixedTraining() {
  hideAllExercisePhases();

  // Final boss fight before results — always show one
  if (!finalBossDone && results.length > 0) {
    finalBossDone = true;
    var fallback = { word: results[0].word, category: results[0].category };
    var bossWord = pickBossWord(fallback);
    pendingInterruptAction = 'finish-final';
    isMixedSession = true; // keep mixed so proceedAfterInterrupt routes back
    pendingChest = true; // chest after final boss too
    showBossMinigame(bossWord);
    return;
  }

  isMixedSession = false;
  finalBossDone = false;

  var correctCount = results.filter(function(r) { return r.correct; }).length;
  var totalCount = results.length;
  var prevXP = loadRewardData().totalXP || 0;
  var rewardResult = awardSessionXP(correctCount, totalCount);
  var rewardData = loadRewardData();
  var newXP = rewardData.totalXP || 0;
  var prevLevel = getAvatarLevel(prevXP);
  var newLevel = getAvatarLevel(newXP);
  updateRewardBar();
  showRewardOverlay(rewardResult.xpEarned, rewardResult.gemsEarned);
  if (rewardResult.dailyGoalReached) {
    setTimeout(function() { showRewardFloat('Dagligt m\u00E5l n\u00E5et! +5 \u{1F48E}'); }, 800);
  }
  if (newLevel.index > prevLevel.index) {
    setTimeout(function() { showLevelUpPopup(newLevel); }, 2200);
  }
  renderTrainingResults();
}

// Review mode
function startReview() {
  gameMode = 'review';
  wrongCountPerWord = {};
  pendingBoss = null;
  sessionCorrectCount = 0; sessionCorrectStreak = 0; sessionCategoryErrors = {};
  sessionUsedWords = {};
  pendingChest = false;
  currentWords = shuffle(getDueWords());
  if (currentWords.length === 0) {
    alert('Ingen ord klar til gennemgang lige nu.');
    return;
  }
  currentIndex = 0; results = [];
  document.getElementById('scoreCorrect').textContent = '0';
  document.getElementById('scoreWrong').textContent = '0';
  document.getElementById('testPhaseLabel').style.display = 'none';
  document.getElementById('difficultyLabel').innerHTML = '';
  document.querySelectorAll('.session-badge').forEach(function(el) { el.remove(); });
  hide('phase-welcome');
  show('phase-test');
  updateRewardBar();
  var b = document.createElement('div');
  b.className = 'session-badge';
  b.innerHTML = '\u{1F4D6} Gennemgang — spaced repetition';
  document.getElementById('phase-test').appendChild(b);
  renderWord();
}

// Render word
function renderWord() {
  // Safety: don't render if chest or boss overlay is visible
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;
  var w = currentWords[currentIndex];
  var total = currentWords.length;
  document.getElementById('wordNum').textContent = (results.length + 1);
  document.getElementById('progressBar').style.width = ((results.length / Math.max(total, results.length + 1)) * 100) + '%';
  updatePatternBadge('patternBadge', w.category, w.level);
  document.getElementById('spellingInput').value = '';
  document.getElementById('feedbackBox').style.display = 'none';
  document.getElementById('listenBox').style.visibility = '';
  document.getElementById('checkBtn').classList.remove('hidden');
  document.getElementById('checkBtn').innerHTML = '\u270F\uFE0F Tjek stavning';
  document.getElementById('nextBtn').classList.add('hidden');
  var btn = document.getElementById('listenBtn');
  btn.classList.remove('speaking'); btn.innerHTML = '\u{1F508} Hør ordet igen';
  feedbackShown = false;
  retryAttempt = false;
  document.getElementById('spellingInput').classList.remove('input-retry');

  var flashEl = document.getElementById('wordFlash');
  var wrap = document.getElementById('countdownWrap');
  var bar = document.getElementById('countdownBar');
  var hintEl = document.getElementById('wordHint');
  var sentEl = document.getElementById('wordSentence');
  var diffLabel = document.getElementById('difficultyLabel');

  diffLabel.innerHTML = '';

  // Hint always shown
  hintEl.textContent = '\u{1F4A1} ' + w.hint;
  // Show sentence with blank for the word
  if (sentEl) {
    if (w.sentence) {
      var sentRegex = new RegExp('(?<![a-zA-ZæøåÆØÅ])' + w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-zæøå]*(?![a-zA-ZæøåÆØÅ])', 'i');
      var blankSpan = '<span style="display:inline-block;min-width:' + Math.max(60, w.word.length * 14) + 'px;border-bottom:3px solid var(--accent);padding:2px 4px">&nbsp;</span>';
      var cloze = w.sentence.replace(sentRegex, blankSpan);
      if (cloze === w.sentence) cloze = w.sentence + ' ' + blankSpan;
      sentEl.innerHTML = cloze;
    } else {
      sentEl.textContent = '';
    }
  }

  if (gameMode === 'training') {
    // TRAINING: Pure dictation — hear the word, spell it
    flashEl.textContent = '';
    flashEl.style.opacity = '0';
    wrap.style.display = 'none';
    speakWord(w.word, w.sentence || null);
    setTimeout(function() { document.getElementById('spellingInput').focus(); }, 300);
  } else if (gameMode === 'review') {
    // REVIEW: Show word for 2 seconds
    flashEl.style.fontSize = '2.8rem';
    flashEl.textContent = w.word; flashEl.style.opacity = '1';
    wrap.style.display = 'block';
    bar.style.transition = 'none'; bar.style.width = '100%';
    setTimeout(function() { bar.style.transition = 'width 2s linear'; bar.style.width = '0%'; }, 50);
    setTimeout(function() {
      flashEl.style.opacity = '0';
      setTimeout(function() { flashEl.textContent = ''; wrap.style.display = 'none'; }, 500);
    }, 2000);
    setTimeout(function() { speakWord(w.word, w.sentence || null); }, 200);
    setTimeout(function() { document.getElementById('spellingInput').focus(); }, 2600);
  }
}

// Enter key handler
var lastSpaceTime = 0;
// Global Enter key: dismiss overlays and continue buttons
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;

  // Chest overlay: open if unopened, close if opened
  var chestOv = document.getElementById('chestOverlay');
  if (chestOv && !chestOv.classList.contains('hidden')) {
    e.preventDefault();
    var closeBtn = document.getElementById('chestCloseBtn');
    if (closeBtn && !closeBtn.classList.contains('hidden')) { closeChest(); }
    else { openChest(); }
    return;
  }

  // Boss phase: click visible Fortsæt button
  var bossPhase = document.getElementById('phase-boss');
  if (bossPhase && !bossPhase.classList.contains('hidden')) {
    var bossBtn = bossPhase.querySelector('.btn-green[onclick*="continueAfterBoss"]');
    if (bossBtn) { e.preventDefault(); continueAfterBoss(); return; }
  }

  // Milestone popup
  var milestoneOv = document.getElementById('milestoneOverlay');
  if (milestoneOv && !milestoneOv.classList.contains('hidden')) {
    e.preventDefault(); dismissMilestone(); return;
  }

  // Category lesson popup
  var lessonOv = document.getElementById('lessonOverlay');
  if (lessonOv && !lessonOv.classList.contains('hidden')) {
    e.preventDefault(); dismissLessonPopup(); return;
  }

  // Wizard lesson overlay — kun når "Forstået!" knappen er synlig (skipper ikke selve gåden)
  var wizOv = document.getElementById('wizardOverlay');
  if (wizOv && !wizOv.classList.contains('fading-out')) {
    var doneBtn = wizOv.querySelector('.wizard-done-btn');
    if (doneBtn) { e.preventDefault(); wizardTransitionTo('done'); return; }
  }
});

document.addEventListener('keydown', function(e) {
  var testPhase = document.getElementById('phase-test');
  if (!testPhase || testPhase.classList.contains('hidden')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (feedbackShown) nextWord();
    else checkSpelling();
  } else if (e.key === ' ' && document.activeElement === document.getElementById('spellingInput')) {
    var now = Date.now();
    if (now - lastSpaceTime < 400) {
      e.preventDefault();
      var inp = document.getElementById('spellingInput');
      inp.value = inp.value.replace(/\s+$/, '');
      speakCurrentWord();
    }
    lastSpaceTime = now;
  }
});

// Diff highlight
function diffHighlight(correct, attempt) {
  var out = '';
  for (var i = 0; i < correct.length; i++) {
    var c = correct[i];
    var a = i < attempt.length ? attempt[i].toLowerCase() : '';
    if (c.toLowerCase() === a) out += '<span style="color:var(--green)">' + c + '</span>';
    else out += '<span style="color:var(--red);text-decoration:underline">' + c + '</span>';
  }
  return out;
}

// Check spelling
function checkSpelling() {
  var w = currentWords[currentIndex];
  var inp = document.getElementById('spellingInput');
  var ans = inp.value.trim().toLowerCase();
  if (!ans) return;
  var ok = ans === w.word.toLowerCase();
  var box = document.getElementById('feedbackBox');
  box.style.display = 'flex';

  // Single attempt — no retry
  var result = { word: w.word, correct: ok, selfCorrected: false, userAnswer: ans, category: w.category, patternHint: w.patternHint || '', level: w.level || 0 };
  results.push(result);
  logAnswer(w.word, ans, ok, 1, w.category, w.level || 0);
  updateCategoryLevel(w.category, ok, w.level || 0, ans, w.misspelling);
  updateSRWord(w.word, ok, w.category);

  document.getElementById('listenBox').style.visibility = 'hidden';
  if (ok) {
    box.style.background = 'rgba(16,185,129,0.15)';
    box.innerHTML = '<div style="text-align:center;font-size:1.2rem;font-weight:700;color:var(--green)">\u2705 Rigtigt! Flot klaret! \u{1F389}</div>';
  } else {
    box.style.background = 'rgba(239,68,68,0.15)';
    box.innerHTML = '<div style="text-align:center;font-size:1.1rem;font-weight:700;color:var(--red)">\u274C Du skrev: <strong>' + ans + '</strong><br>' +
      'Rigtigt: <span style="color:var(--green)">' + diffHighlight(w.word, ans) + '</span></div>';
  }

  // Streak and boss/chest trigger (reward-based)
  if (ok) {
    sessionCorrectCount++;
    sessionCorrectStreak++;
    // Boss + chest triggered as reward after 5 correct in a row
    if (sessionCorrectStreak >= BOSS_TRIGGER_STREAK) {
      sessionCorrectStreak = 0;
      pendingBoss = pickBossWord({ word: w.word, category: w.category });
      pendingChest = true; // chest awarded after boss is defeated
    }
  } else {
    sessionCorrectStreak = 0;
    trackCategoryError(w.category);
  }

  document.getElementById('scoreCorrect').textContent = results.filter(function(r) { return r.correct; }).length;
  document.getElementById('scoreWrong').textContent = results.filter(function(r) { return !r.correct; }).length;
  document.getElementById('checkBtn').classList.add('hidden');
  document.getElementById('nextBtn').classList.remove('hidden');
  feedbackShown = true;
  retryAttempt = false;
}

function nextWord() {
  if (isMixedSession) { nextMixedItem(); return; }
  // Block if an interrupt overlay is active
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;

  // Check for pending boss FIRST (reward for streak) — chest follows after boss
  if (pendingBoss) {
    pendingInterruptAction = (currentIndex + 1) >= currentWords.length ? 'finish' : 'continue';
    currentIndex++;
    showBossMinigame(pendingBoss);
    return;
  }

  // Check for pending chest (awarded after boss defeat)
  if (pendingChest) {
    pendingChest = false;
    pendingInterruptAction = (currentIndex + 1 >= currentWords.length) ? 'finish' : 'continue';
    if (!pendingBoss) currentIndex++; // only advance if boss didn't already advance
    showTreasureChest();
    return;
  }

  currentIndex++;

  if (currentIndex >= currentWords.length) {
    finishTest();
  } else {
    renderWord();
  }
}

// Finish test
function finishTest() {
  hide('phase-test');

  // === Reward system: award XP ===
  var correctCount = results.filter(function(r) { return r.correct; }).length;
  var totalCount = results.length;
  var prevXP = loadRewardData().totalXP || 0;
  var rewardResult = awardSessionXP(correctCount, totalCount);
  var rewardData = loadRewardData();
  var newXP = rewardData.totalXP || 0;
  var prevLevel = getAvatarLevel(prevXP);
  var newLevel = getAvatarLevel(newXP);
  updateRewardBar();

  // Show reward overlay briefly before continuing
  showRewardOverlay(rewardResult.xpEarned, rewardResult.gemsEarned);

  // Show floating notifications
  if (rewardResult.dailyGoalReached) {
    setTimeout(function() { showRewardFloat('Dagligt m\u00E5l n\u00E5et! +5 \u{1F48E}'); }, 800);
  }

  // Show level-up popup if avatar level changed
  if (newLevel.index > prevLevel.index) {
    setTimeout(function() { showLevelUpPopup(newLevel); }, 2200);
  }

  // Show reward bar now that we're leaving the test phase

  if (gameMode === 'review') {
    renderReviewResults();
  } else {
    renderTrainingResults();
  }
}

// Shared results renderer
// opts: { resultsList, messages, summary, labels, showAllWords, showLessons, wordRenderer }
function renderResults(opts) {
  show('phase-results');
  var res = opts.resultsList;
  var correct = res.filter(function(r) { return r.correct; }).length;
  var wrong = res.filter(function(r) { return !r.correct; });
  var labels = opts.labels || { correct: 'Rigtige \u2713', wrong: 'Fejl \u2717' };

  var html = '';

  // Encouragement bubble
  var msgs = opts.messages || ['Godt gået! \u{1F4AA}', 'Flot indsats! \u{1F31F}', 'Stærkt! \u2B50'];
  var summary = opts.summary || ('Du fik ' + correct + ' ud af ' + res.length + ' rigtige.');
  html += '<div class="ai-bubble">' + getCurrentAvatarImg('ai-bubble-avatar') + '<p><strong>' + msgs[Math.floor(Math.random() * msgs.length)] + '</strong></p>';
  html += '<p style="margin-top:8px">' + summary + '</p></div>';

  // Score boxes
  html += '<div class="score-row">';
  html += '<div class="score-box"><div class="num num-green">' + correct + '</div><div class="lbl">' + labels.correct + '</div></div>';
  html += '<div class="score-box"><div class="num num-red">' + wrong.length + '</div><div class="lbl">' + labels.wrong + '</div></div>';
  html += '<div class="score-box"><div class="num num-yellow">' + Math.round(correct / res.length * 100) + '%</div><div class="lbl">Score</div></div>';
  html += '</div>';

  // Kategori-niveau ændringer (kun hvis der er nogle)
  if (opts.categoryChanges && opts.categoryChanges.length > 0) {
    html += '<div class="level-changes">';
    html += '<h2 style="margin-bottom:8px;font-size:1.1rem">\u{1F4C8} Niveau-ændringer</h2>';
    for (var ci = 0; ci < opts.categoryChanges.length; ci++) {
      var ch = opts.categoryChanges[ci];
      var up = ch.after > ch.before;
      var icon = up ? '\u2B06\uFE0F' : '\u2B07\uFE0F';
      var color = up ? 'var(--green)' : 'var(--red)';
      html += '<div class="level-change-row" style="color:' + color + '">';
      html += '<span>' + icon + ' <strong>' + ch.category + '</strong></span>';
      html += '<span>' + ch.before + ' \u2192 ' + ch.after + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Word list
  var wordsToShow = opts.showAllWords !== false ? res : wrong;
  if (wordsToShow.length > 0) {
    var heading = opts.showAllWords !== false ? 'Ord-resultater' : '\u{1F4D6} Ord at øve';
    html += '<h2 style="margin-bottom:12px;font-size:1.2rem">' + heading + '</h2>';
    html += '<div style="margin-bottom:18px">';
    wordsToShow.forEach(function(r) {
      html += '<div class="word-attempt">';
      html += '<span><strong>' + r.word + '</strong> <span style="font-size:0.72rem;color:var(--muted)">' + r.category + '</span></span>';
      html += '<span>';
      if (opts.wordRenderer) {
        html += opts.wordRenderer(r);
      } else {
        html += (r.correct ? '<span class="correct-mark">\u2713</span>' : '<span class="wrong-mark">\u2717 ' + r.userAnswer + '</span>');
      }
      html += '</span></div>';
    });
    html += '</div>';
  }

  // Lesson buttons (training only)
  if (opts.showLessons && sessionLessonCategories.length > 0) {
    html += '<div style="margin-top:16px;margin-bottom:8px">';
    for (var li = 0; li < sessionLessonCategories.length; li++) {
      var lCat = sessionLessonCategories[li];
      var lLesson = CATEGORY_LESSONS[lCat];
      if (!lLesson) continue;
      var lId = lCat.replace(/[^a-zA-Z]/g, '');
      html += '<button class="btn btn-full" style="background:var(--card2);border:1px solid var(--accent);color:var(--accent);margin-bottom:6px" onclick="renderLessonInline(\'' + lCat.replace(/'/g, "\\'") + '\')">\u{1F4D6} Lektion: ' + lCat + '</button>';
      html += '<div id="lessonInline_' + lId + '" style="display:none"></div>';
    }
    html += '</div>';
  }

  html += '<hr class="divider">';
  html += '<button class="btn btn-accent btn-full" onclick="goHome()">\u{1F3E0} Hjem</button>';

  document.getElementById('resultsContent').innerHTML = html;
}

function computeLevelChanges() {
  if (!sessionStartLevels) return [];
  var current = loadCategoryLevels();
  var changes = [];
  for (var cat in sessionStartLevels) {
    var before = sessionStartLevels[cat];
    var after = (current[cat] && current[cat].level !== undefined) ? current[cat].level : before;
    if (after !== before) changes.push({ category: cat, before: before, after: after });
  }
  return changes;
}

function renderTrainingResults() {
  renderResults({
    resultsList: results,
    messages: ['Godt gået med træningen! \u{1F4AA}', 'Flot indsats! Du bliver bedre og bedre \u{1F31F}', 'Stærkt! Øvelse gør mester \u2B50'],
    summary: 'Du fik ' + results.filter(function(r) { return r.correct; }).length + ' ud af ' + results.length + ' rigtige i træningen.',
    showLessons: true,
    categoryChanges: computeLevelChanges()
  });
}

function renderReviewResults() {
  var sr = loadSRData();
  var levelNames = ['Nulstillet', 'Niveau 1', 'Niveau 2', 'Niveau 3', 'Mestret!'];
  var levelColors = ['var(--red)', 'var(--accent)', 'var(--accent)', 'var(--blue)', 'var(--green)'];
  renderResults({
    resultsList: results,
    messages: ['Gennemgang færdig!'],
    summary: 'Du fik ' + results.filter(function(r) { return r.correct; }).length + ' ud af ' + results.length + ' rigtige i gennemgangen.',
    wordRenderer: function(r) {
      var srWord = sr.words[r.word];
      var level = srWord ? srWord.level : 0;
      var mark = r.correct ? '<span class="correct-mark">\u2713</span>' : '<span class="wrong-mark">\u2717 ' + r.userAnswer + '</span>';
      return mark + ' <span style="font-size:0.72rem;color:' + levelColors[level] + ';margin-left:6px">' + levelNames[level] + '</span>';
    }
  });
}

// ===== REWARD SYSTEM =====

function loadRewardData() {
  try {
    var raw = localStorage.getItem(playerKey('reward_data'));
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {
    lastSessionDate: '',
    gems: 0,
    totalXP: 0,
    todayXP: 0,
    todayDate: '',
    displayedLevel: 0
  };
}

function saveRewardData(data) {
  try { localStorage.setItem(playerKey('reward_data'), JSON.stringify(data)); } catch(e) {}
  syncToSupabase();
}

function getTodayStr() {
  var d = new Date();
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

function dateDiffDays(dateStr1, dateStr2) {
  // Returns how many days dateStr2 is after dateStr1
  if (!dateStr1 || !dateStr2) return 999;
  var d1 = new Date(dateStr1 + 'T00:00:00');
  var d2 = new Date(dateStr2 + 'T00:00:00');
  return Math.round((d2 - d1) / ONE_DAY_MS);
}

function awardSessionXP(correctCount, totalCount) {
  var data = loadRewardData();
  var today = getTodayStr();

  // Ensure todayXP is for today
  if (data.todayDate !== today) {
    data.todayXP = 0;
    data.todayDate = today;
  }

  var xpEarned = 0;
  // +5 XP per correct word
  xpEarned += correctCount * 5;
  // +2 XP per incorrect word (rewards effort)
  xpEarned += (totalCount - correctCount) * 2;
  // +3 XP bonus per self-corrected answer
  var selfCorrectedCount = results.filter(function(r) { return r.selfCorrected; }).length;
  xpEarned += selfCorrectedCount * 3;
  // +10 XP bonus for completing session
  xpEarned += 10;

  var gemsEarned = 0;
  // 2 gems for completing session
  gemsEarned += 2;

  var dailyGoalReached = false;
  var prevTodayXP = data.todayXP;
  data.todayXP += xpEarned;
  data.totalXP += xpEarned;

  // Check if daily goal reached (100 XP) — only award once per day
  if (prevTodayXP < 100 && data.todayXP >= 100) {
    gemsEarned += 5;
    dailyGoalReached = true;
  }

  data.gems += gemsEarned;
  data.lastSessionDate = today;

  saveRewardData(data);
  return { xpEarned: xpEarned, gemsEarned: gemsEarned, dailyGoalReached: dailyGoalReached };
}

function updateRewardBar() {
  var data = loadRewardData();
  var bar = document.getElementById('rewardBar');
  var xpBarWrap = document.getElementById('rewardXPBarWrap');
  if (!bar) return;

  document.getElementById('rewardGems').textContent = data.gems;

  var totalXP = data.totalXP || 0;
  document.getElementById('rewardXP').textContent = totalXP;

  // XP bar — progress toward next avatar level
  var xpBar = document.getElementById('rewardXPBar');
  var currentMin = 0, nextMin = 100;
  for (var li = AVATAR_LEVELS.length - 1; li >= 0; li--) {
    if (totalXP >= AVATAR_LEVELS[li].minXP) {
      currentMin = AVATAR_LEVELS[li].minXP;
      nextMin = (li < AVATAR_LEVELS.length - 1) ? AVATAR_LEVELS[li + 1].minXP : AVATAR_LEVELS[li].minXP;
      break;
    }
  }
  var pct = (nextMin > currentMin) ? Math.min(((totalXP - currentMin) / (nextMin - currentMin)) * 100, 100) : 100;
  xpBar.style.width = pct + '%';

  // Show/hide based on current phase
  var welcomeVisible = !document.getElementById('phase-welcome').classList.contains('hidden');
  if (welcomeVisible) {
    bar.classList.add('hidden');
    xpBarWrap.classList.add('hidden');
  } else {
    bar.classList.remove('hidden');
    xpBarWrap.classList.remove('hidden');
  }
}

function dismissMilestone() {
  var overlay = document.getElementById('milestoneOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function showRewardOverlay(xpEarned, gemsEarned) {
  var overlay = document.getElementById('rewardOverlay');
  overlay.innerHTML = '<div class="reward-overlay-text">' +
    '<div class="xp-line">+' + xpEarned + ' XP \u26A1</div>' +
    '<div class="gem-line">+' + gemsEarned + ' \u{1F48E}</div>' +
    '</div>';
  overlay.classList.remove('hidden');

  setTimeout(function() {
    overlay.classList.add('hidden');
  }, 1500);
}

function showRewardFloat(text) {
  var el = document.createElement('div');
  el.className = 'reward-float';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1600);
}

// ===== BOSS MINIGAME =====

var BOSS_MONSTERS = {
  "Stumme bogstaver": { emoji: "\uD83D\uDC7B", name: "Sp\u00F8gelsesbossen" },
  "Dobbeltkonsonant": { emoji: "\uD83D\uDC09", name: "Dobbeltdragen" },
  "For- og efterstavelser": { emoji: "\uD83E\uDDD9", name: "Troldmanden" },
  "Sammensatte ord": { emoji: "\uD83D\uDC79", name: "Samlemonsteret" },
  "Verbernes b\u00F8jning": { emoji: "\uD83E\uDDDF", name: "B\u00F8jningszombien" },
  "Navneordsendelser": { emoji: "\uD83D\uDC7E", name: "Endelsesalienen" },
  "Lydrette ord": { emoji: "\uD83D\uDC3B", name: "Lydbj\u00F8rnen" },
  "Nutids-r": { emoji: "\uD83E\uDD96", name: "R-Rex" },
  "Konsonantlyde": { emoji: "\uD83E\uDD87", name: "Lydflagermussen" }
};

var BOSS_BATTLE_TYPES = ['memory', 'cardcast', 'silentservant'];
var BOSS_DEATH_ANIMS = ['boss-death-spin', 'boss-death-explode', 'boss-death-melt', 'boss-death-launch'];
var BOSS_IDLE_ANIMS = ['boss-idle-float', 'boss-idle-pulse', 'boss-idle-wobble'];
var BOSS_VICTORY_MSGS = [
  'Du vandt!', 'Flot klaret!', 'Ordmester!', 'Fantastisk!',
  'Godt g\u00E5et!', 'Sejt!', 'St\u00E6rkt!', 'Perfekt!'
];

var bossState = null;
var bossRainInterval = null;

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

var BOSS_INSTRUCTIONS = {
  scramble: { emoji: '\u{1F500}', name: 'Bogstavmix', text: 'Tryk p\u00E5 bogstaverne i den rigtige r\u00E6kkef\u00F8lge!' },
  rain: { emoji: '\u{1F327}\uFE0F', name: 'Bogstavregn', text: 'Fang det rigtige bogstav n\u00E5r det falder ned!' },
  memory: { emoji: '\u{1F9E0}', name: 'Hukommelse', text: 'Husk ordet \u2014 du skal stave det bagefter!' },
  reverse: { emoji: '\u{1F500}', name: 'Bagl\u00E6ns', text: 'Ordet er bagl\u00E6ns \u2014 skriv det rigtigt!' },
  pacman: { emoji: '\u{1F3AE}', name: 'Pac-Man', text: 'Saml bogstaverne i r\u00E6kkef\u00F8lge \u2014 undg\u00E5 sp\u00F8gelset!' },
  highway: { emoji: '\u{1F697}', name: 'Motorvejen', text: 'K\u00F8r bilen fra bane til bane og fang de rigtige bogstaver!' },
  cardcast: { emoji: '\u{1F0CF}', name: 'Kortmagi', text: 'Lyt til ordet og kast de rigtige bogstav-kort mod bossen!' },
  spellpick: { emoji: '\u{1F3AF}', name: 'Stavev\u00E6lger', text: 'V\u00E6lg den rigtige stavem\u00E5de!' },
  silentservant: { emoji: '\u{1F9F3}', name: 'Stumtjeneren', text: 'Fyld stumtjeneren! V\u00E6lg den rigtige stavem\u00E5de.' },
  snake: { emoji: '\u{1F40D}', name: 'Slangen', text: 'Styr slangen og spis bogstaverne i den rigtige r\u00E6kkef\u00F8lge!' }
};

var bossPracticeMode = false;
var bossPracticeType = null;

var BOSS_DISABLED_TYPES = ['scramble', 'spellpick', 'rain', 'reverse', 'pacman', 'highway', 'snake'];
var BOSS_ALL_TYPES = BOSS_BATTLE_TYPES.concat(BOSS_DISABLED_TYPES);

var EXERCISE_TYPES = [
  { id: 'fillin', emoji: '\u{270F}\uFE0F', name: 'Udfyld bogstav', fn: 'startFillIn' },
  { id: 'spellingpolice', emoji: '\u{1F46E}', name: 'Stavepolitiet', fn: 'startSpellingPolice' },
  { id: 'wordbuilder', emoji: '\u{1F9F1}', name: 'Ordbyggeren', fn: 'startWordBuilder' },
  { id: 'spellpick', emoji: '\u{1F3AF}', name: 'Stavev\u00E6lger', fn: 'startSpellPick' },
  { id: 'sentence', emoji: '\u{1F4DD}', name: 'Udfyld s\u00E6tningen', fn: 'startWhatIsTheWord' },
  { id: 'wordmemory', emoji: '\u{1F9E0}', name: 'Ord-memory', fn: 'startWordMemory' }
];

function showExercisePicker() {
  var container = document.getElementById('exercisePickerButtons');
  var html = '';
  EXERCISE_TYPES.forEach(function(ex) {
    html += '<button class="btn btn-green" style="padding:14px 10px;font-size:0.95rem;display:flex;flex-direction:column;align-items:center;gap:4px" onclick="hideExercisePicker();' + ex.fn + '()">' +
      '<span style="font-size:1.8rem">' + ex.emoji + '</span>' +
      '<span>' + ex.name + '</span></button>';
  });
  container.innerHTML = html;
  document.getElementById('exercisePickerOverlay').classList.remove('hidden');
}

function hideExercisePicker() {
  document.getElementById('exercisePickerOverlay').classList.add('hidden');
}

function showBossPicker() {
  var container = document.getElementById('bossPickerButtons');
  var html = '<div style="grid-column:1/-1;font-size:0.85rem;font-weight:700;color:var(--green);margin-bottom:2px">Virker</div>';
  BOSS_BATTLE_TYPES.forEach(function(type) {
    var instr = BOSS_INSTRUCTIONS[type];
    html += '<button class="btn btn-green" style="padding:14px 10px;font-size:0.95rem;display:flex;flex-direction:column;align-items:center;gap:4px" onclick="startBossPractice(\'' + type + '\')">' +
      '<span style="font-size:1.8rem">' + instr.emoji + '</span>' +
      '<span>' + instr.name + '</span></button>';
  });
  html += '<div style="grid-column:1/-1;font-size:0.85rem;font-weight:700;color:var(--red);margin-top:8px;margin-bottom:2px">Virker ikke endnu</div>';
  BOSS_DISABLED_TYPES.forEach(function(type) {
    var instr = BOSS_INSTRUCTIONS[type];
    html += '<button class="btn" style="padding:14px 10px;font-size:0.95rem;display:flex;flex-direction:column;align-items:center;gap:4px;opacity:0.5" onclick="startBossPractice(\'' + type + '\')">' +
      '<span style="font-size:1.8rem">' + instr.emoji + '</span>' +
      '<span>' + instr.name + '</span></button>';
  });
  container.innerHTML = html;
  document.getElementById('bossPickerOverlay').classList.remove('hidden');
}

function hideBossPicker() {
  document.getElementById('bossPickerOverlay').classList.add('hidden');
}

// Shared boss helpers
function pickSilentServantWord() {
  var ssLvl = loadCategoryLevels()['Stumme bogstaver'] ? loadCategoryLevels()['Stumme bogstaver'].level : 1;
  var ssPool = buildPoolForCategory('Stumme bogstaver', ssLvl + 1);
  if (ssPool.length === 0) ssPool = buildPoolForCategory('Stumme bogstaver', ssLvl);
  return ssPool.length > 0 ? pickRandom(ssPool) : null;
}

function createBossState(word, battleType, boss, idleAnim, wordObj) {
  return {
    word: word, hp: word.length, maxHP: word.length, letterIndex: 0,
    battleType: battleType, boss: boss, idleAnim: idleAnim,
    deathAnim: pickRandom(BOSS_DEATH_ANIMS),
    wordObj: wordObj
  };
}

function startBossPractice(battleType) {
  hideBossPicker();
  bossPracticeMode = true;
  bossPracticeType = battleType;
  var allWords = buildPoolWithCategoryLevels(ALL_CATEGORIES);
  if (allWords.length === 0) {
    Object.keys(WORD_BANK).forEach(function(cat) {
      WORD_BANK[cat].forEach(function(w) { allWords.push(Object.assign({}, w, { category: cat })); });
    });
  }
  var chosen = allWords[Math.floor(Math.random() * allWords.length)];
  if (battleType === 'silentservant') {
    var ssPick = pickSilentServantWord();
    if (ssPick) chosen = ssPick;
  }
  var word = chosen.word.toLowerCase();
  var boss = BOSS_MONSTERS[chosen.category] || { emoji: '\uD83D\uDC7E', name: 'Ordbossen' };
  var idleAnim = pickRandom(BOSS_IDLE_ANIMS);

  hide('phase-welcome');
  show('phase-boss');
  bossState = createBossState(word, battleType, boss, idleAnim, chosen);
  renderBossByType(battleType, word, boss, idleAnim);
}

function renderBossByType(type, word, boss, idleAnim) {
  var renderers = {
    scramble: renderBossScramble, rain: renderBossRain, memory: renderBossMemory,
    reverse: renderBossReverse, pacman: renderBossPacman, highway: renderBossHighway,
    cardcast: renderBossCardcast, spellpick: renderBossSpellpick,
    silentservant: renderBossSilentServant, snake: renderBossSnake
  };
  var fn = renderers[type] || renderers.scramble;
  fn(word, boss, idleAnim);
}

function loadBossSeen() {
  try { var raw = localStorage.getItem(playerKey('boss_seen')); return raw ? JSON.parse(raw) : {}; } catch(e) { return {}; }
}

function saveBossSeen(data) {
  try { localStorage.setItem(playerKey('boss_seen'), JSON.stringify(data)); } catch(e) {}
}

function testBoss(type) {
  var allWords = Object.values(WORD_BANK).flat();
  var w = allWords[Math.floor(Math.random() * allWords.length)];
  gameMode = 'training';
  isMixedSession = false;
  pendingBoss = null;
  pendingChest = false;
  pendingInterruptAction = null;
  results = [];

  hide('phase-welcome');
  show('phase-boss');

  var word = w.word.toLowerCase();
  var boss = BOSS_MONSTERS[w.category] || { emoji: "\uD83D\uDC7E", name: "Ordbossen" };
  var idleAnim = pickRandom(BOSS_IDLE_ANIMS);
  bossState = createBossState(word, type, boss, idleAnim, w);
  renderBossByType(type, word, boss, idleAnim);
}

function showBossMinigame(bossData) {
  // Hard limit: max 2 bosses per session to prevent loops
  if (sessionBossCount >= MAX_BOSSES_PER_SESSION) {
    pendingBoss = null;
    pendingChest = false;
    proceedAfterInterrupt();
    return;
  }
  sessionBossCount++;
  hide('phase-test');
  hide('phase-fillin');
  hide('phase-spellingpolice');
  hide('phase-wordbuilder');
  hide('phase-sentence');
  hide('phase-spellpick');
  show('phase-boss');

  var word = bossData.word.toLowerCase();
  var boss = BOSS_MONSTERS[bossData.category] || { emoji: "\uD83D\uDC7E", name: "Ordbossen" };
  var battleType = pickRandom(BOSS_BATTLE_TYPES);
  var idleAnim = pickRandom(BOSS_IDLE_ANIMS);

  // Silent servant: force word from Stumme bogstaver
  if (battleType === 'silentservant') {
    var ssPick = pickSilentServantWord();
    if (ssPick) {
      word = ssPick.word.toLowerCase();
      bossData.category = 'Stumme bogstaver';
      boss = BOSS_MONSTERS['Stumme bogstaver'] || boss;
    }
  }

  // Memory boss: pick a word 2 levels above the player's category level
  if (battleType === 'memory' && bossData.category) {
    var levels = loadCategoryLevels();
    var catLvl = (levels[bossData.category] && levels[bossData.category].level !== undefined) ? levels[bossData.category].level : 1;
    var memLevel = Math.min(4, catLvl + 2);
    var memPool = (WORD_BANK[bossData.category] || []).filter(function(w) { return w.level === memLevel; });
    if (memPool.length === 0) memPool = (WORD_BANK[bossData.category] || []).filter(function(w) { return w.level >= catLvl + 1; });
    if (memPool.length > 0) {
      word = pickRandom(memPool).word.toLowerCase();
    }
  }

  // Look up full word object
  var wordObj = { word: word, category: bossData.category, patternHint: '' };
  var catWords = WORD_BANK[bossData.category] || [];
  for (var wi = 0; wi < catWords.length; wi++) {
    if (catWords[wi].word.toLowerCase() === word) { wordObj = catWords[wi]; wordObj.category = bossData.category; break; }
  }

  bossState = createBossState(word, battleType, boss, idleAnim, wordObj);

  // Show instruction first time per boss type
  var seen = loadBossSeen();
  if (!seen[battleType]) {
    seen[battleType] = true;
    saveBossSeen(seen);
    var instr = BOSS_INSTRUCTIONS[battleType];
    var content = document.getElementById('bossContent');
    content.innerHTML = '<div style="text-align:center;padding:40px 20px">' +
      '<div style="font-size:4rem;margin-bottom:16px">' + instr.emoji + '</div>' +
      '<div style="font-size:3rem;margin-bottom:12px">' + boss.emoji + '</div>' +
      '<p style="font-size:1.15rem;font-weight:700;color:var(--text);line-height:1.6">' + instr.text + '</p>' +
      '</div>';
    setTimeout(function() {
      renderBossByType(battleType, word, boss, idleAnim);
    }, 3000);
  } else {
    renderBossByType(battleType, word, boss, idleAnim);
  }
}

// --- Shared boss UI helpers ---
function renderBossHeader(boss, idleAnim, hp, maxHP) {
  var catBadge = '';
  if (bossState && bossState.wordObj) {
    var wo = bossState.wordObj;
    var icon = CATEGORY_ICONS[wo.category] || '\uD83D\uDD20';
    var lvlStr = (wo.level !== undefined) ? ' \u2014 niveau ' + wo.level : '';
    catBadge = '<div style="font-size:0.75rem;color:var(--muted);margin-bottom:4px">' + icon + ' ' + (wo.category || '') + lvlStr + '</div>';
  }
  // Update phase label with boss name
  var label = document.getElementById('bossPhaseLabel');
  if (label && bossState) {
    var bossNames = {
      scramble: 'Bogstavmixer', rain: 'Bogstavregner', memory: 'Huskemonster',
      reverse: 'Baglænsuhyre', pacman: 'Pac-Man', highway: 'Motorvejsmonster',
      cardcast: 'Kortmagiker', spellpick: 'Stavevælger', silentservant: 'Stumtjeneren',
      snake: 'Bogstavslangen'
    };
    var displayName = bossNames[bossState.battleType] || boss.name;
    label.innerHTML = '\u2694\uFE0F Ord-Boss: ' + displayName;
  }
  return '<div style="text-align:center">' +
    catBadge +
    '<div class="boss-hp-wrap"><div class="boss-hp-bar" id="bossHPBar" style="width:100%"></div></div>' +
    '<div style="font-size:0.8rem;color:var(--muted);margin-bottom:4px" id="bossHPText">HP: ' + hp + '/' + maxHP + '</div>' +
    '<div id="bossMonster" class="boss-monster ' + idleAnim + '">' + boss.emoji + '</div>' +
    '</div>';
}

function renderBossWordSlots(word) {
  var html = '<div class="boss-word-progress" id="bossWordProgress">';
  for (var i = 0; i < word.length; i++) {
    html += '<span class="boss-word-slot" id="bossSlot' + i + '">_</span>';
  }
  html += '</div>';
  return html;
}

function updateBossHP() {
  var pct = (bossState.hp / bossState.maxHP) * 100;
  document.getElementById('bossHPBar').style.width = pct + '%';
  document.getElementById('bossHPText').textContent = 'HP: ' + bossState.hp + '/' + bossState.maxHP;
}

function bossHitAnim() {
  var monster = document.getElementById('bossMonster');
  if (!monster) return;
  monster.className = 'boss-monster boss-hit';
  setTimeout(function() {
    if (bossState) monster.className = 'boss-monster ' + bossState.idleAnim;
  }, 400);
}

function bossAttackAnim() {
  var monster = document.getElementById('bossMonster');
  if (!monster) return;
  monster.className = 'boss-monster boss-attack';
  setTimeout(function() {
    if (bossState) monster.className = 'boss-monster ' + bossState.idleAnim;
  }, 500);
}

function revealBossSlot(index, letter) {
  var slot = document.getElementById('bossSlot' + index);
  if (slot) { slot.textContent = letter; slot.classList.add('revealed'); }
}

// --- Type 1: SCRAMBLE (original) ---
function renderBossScramble(word, boss, idleAnim) {
  var letters = word.split('');
  var alphabet = 'abcdefghijklmnopqrstuvwxyz\u00E6\u00F8\u00E5';
  var distractors = [];
  var shuffledAlpha = shuffle(alphabet.split(''));
  for (var d = 0; d < shuffledAlpha.length && distractors.length < 3; d++) {
    if (word.indexOf(shuffledAlpha[d]) === -1) distractors.push(shuffledAlpha[d]);
  }
  var allLetters = shuffle(letters.concat(distractors));

  var html = renderBossHeader(boss, idleAnim, letters.length, letters.length);
  html += renderBossWordSlots(word);
  html += '<button class="btn-listen" onclick="speakWord(bossState.word, null)" style="margin:8px auto;display:block">\u{1F508} H\u00F8r ordet</button>';
  html += '<p style="text-align:center;color:var(--muted);font-size:0.9rem;margin:8px 0">\u2694\uFE0F Tryk bogstaverne i den rigtige r\u00E6kkef\u00F8lge!</p>';
  html += '<div class="boss-letters" id="bossLetters">';
  for (var j = 0; j < allLetters.length; j++) {
    html += '<button class="boss-letter" id="bossLetter' + j + '" onclick="bossScrambleTap(\'' + allLetters[j].replace(/'/g, "\\'") + '\', ' + j + ')">' + allLetters[j] + '</button>';
  }
  html += '</div>';
  document.getElementById('bossContent').innerHTML = html;
  speakWord(word, null);
}

function bossScrambleTap(letter, btnIdx) {
  if (!bossState) return;
  var expected = bossState.word[bossState.letterIndex];
  var btn = document.getElementById('bossLetter' + btnIdx);
  if (letter === expected) {
    btn.classList.add('correct'); btn.style.pointerEvents = 'none';
    bossState.hp--; bossState.letterIndex++;
    revealBossSlot(bossState.letterIndex - 1, letter);
    updateBossHP(); bossHitAnim();
    if (bossState.hp <= 0) bossDefeated();
  } else {
    btn.classList.add('wrong');
    setTimeout(function() { btn.classList.remove('wrong'); }, 500);
    bossAttackAnim();
  }
}

// --- Type 2: RAIN (letters fall, catch the right one) ---
function renderBossRain(word, boss, idleAnim) {
  var html = renderBossHeader(boss, idleAnim, word.length, word.length);

  // For weaker spellers (level 0-2): show the full word with highlight on current letter
  var profile = loadProfile();
  var spellingLevel = (profile && profile.spellingLevel !== undefined) ? profile.spellingLevel : 2;
  var guidedMode = spellingLevel <= 2;
  bossState.guidedRain = guidedMode;

  if (guidedMode) {
    html += '<div class="boss-rain-guide" id="bossRainGuide" style="text-align:center;margin:8px 0 4px">';
    html += '<p style="color:var(--muted);font-size:0.85rem;margin-bottom:6px">Stav ordet — fang bogstaverne i r\u00E6kkef\u00F8lge!</p>';
    html += '<div style="font-family:Fredoka One,cursive;font-size:2rem;letter-spacing:6px">';
    for (var i = 0; i < word.length; i++) {
      var cls = i === 0 ? 'boss-rain-guide-letter active' : 'boss-rain-guide-letter';
      html += '<span class="' + cls + '" id="bossGuide' + i + '">' + word[i] + '</span>';
    }
    html += '</div></div>';
  } else {
    html += renderBossWordSlots(word);
  }

  html += '<div class="boss-rain-target" id="bossRainTarget">\u{1F3AF} Fang bogstavet: <strong>' + word[0] + '</strong></div>';
  html += '<div class="boss-rain-area" id="bossRainArea"></div>';
  document.getElementById('bossContent').innerHTML = html;
  bossState.rainDrops = [];
  bossState.rainSpawnCount = 0;
  bossRainInterval = setInterval(function() { spawnRainLetter(); }, 900);
  setTimeout(function() { spawnRainLetter(); }, 200);
}

function spawnRainLetter() {
  if (!bossState || bossState.battleType !== 'rain') { clearInterval(bossRainInterval); return; }
  var area = document.getElementById('bossRainArea');
  if (!area) { clearInterval(bossRainInterval); return; }
  var target = bossState.word[bossState.letterIndex];
  var alphabet = 'abcdefghijklmnopqrstuvwxyz\u00E6\u00F8\u00E5';

  // Sometimes spawn the target letter, sometimes a distractor
  var letter;
  if (Math.random() < 0.35 || bossState.rainSpawnCount % 4 === 0) {
    letter = target;
  } else {
    letter = alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  bossState.rainSpawnCount++;

  var el = document.createElement('div');
  el.className = 'boss-rain-letter';
  el.textContent = letter;
  var leftPos = 10 + Math.random() * (area.offsetWidth - 60);
  el.style.left = leftPos + 'px';
  el.style.top = '-44px';
  var dropId = 'rainDrop' + bossState.rainSpawnCount;
  el.id = dropId;
  el.onclick = function() { catchRainLetter(dropId, letter); };
  area.appendChild(el);

  // Animate falling
  var startTime = Date.now();
  var duration = 2800 + Math.random() * 1200;
  var areaHeight = area.offsetHeight;
  function animateDrop() {
    if (!document.getElementById(dropId)) return;
    var elapsed = Date.now() - startTime;
    var progress = elapsed / duration;
    if (progress >= 1) {
      var dropEl = document.getElementById(dropId);
      if (dropEl && !dropEl.classList.contains('caught')) {
        dropEl.classList.add('missed');
        setTimeout(function() { if (dropEl.parentNode) dropEl.parentNode.removeChild(dropEl); }, 300);
      }
      return;
    }
    el.style.top = (progress * (areaHeight - 44)) + 'px';
    requestAnimationFrame(animateDrop);
  }
  requestAnimationFrame(animateDrop);
}

function catchRainLetter(dropId, letter) {
  if (!bossState) return;
  var el = document.getElementById(dropId);
  if (!el || el.classList.contains('caught') || el.classList.contains('missed')) return;
  var target = bossState.word[bossState.letterIndex];
  if (letter === target) {
    el.classList.add('caught');
    bossState.hp--; bossState.letterIndex++;

    // Update guided mode or normal word slots
    if (bossState.guidedRain) {
      var prevGuide = document.getElementById('bossGuide' + (bossState.letterIndex - 1));
      if (prevGuide) { prevGuide.classList.remove('active'); prevGuide.classList.add('caught'); }
      var nextGuide = document.getElementById('bossGuide' + bossState.letterIndex);
      if (nextGuide) nextGuide.classList.add('active');
    } else {
      revealBossSlot(bossState.letterIndex - 1, letter);
    }

    updateBossHP(); bossHitAnim();
    if (bossState.hp <= 0) {
      clearInterval(bossRainInterval);
      bossDefeated();
    } else {
      var targetEl = document.getElementById('bossRainTarget');
      if (targetEl) targetEl.innerHTML = '\u{1F3AF} Fang bogstavet: <strong>' + bossState.word[bossState.letterIndex] + '</strong>';
    }
  } else {
    el.style.borderColor = 'var(--red)';
    setTimeout(function() { if (el) el.style.borderColor = '#3d4270'; }, 400);
    bossAttackAnim();
  }
}

// --- Type 3: MEMORY (see word, then spell from memory) ---
function renderBossMemory(word, boss, idleAnim) {
  // Find the word's hint
  var wordHint = '';
  for (var ci = 0; ci < ALL_CATEGORIES.length; ci++) {
    var found = WORD_BANK[ALL_CATEGORIES[ci]].find(function(w) { return w.word === word; });
    if (found) { wordHint = found.hint || ''; break; }
  }
  bossState.memHint = wordHint;
  bossState.memAttempts = 2;

  var html = renderBossHeader(boss, idleAnim, word.length, word.length);
  html += '<div id="memLives" style="text-align:center;margin:6px 0;font-size:1.3rem">\u2764\uFE0F \u2764\uFE0F</div>';
  html += '<div style="text-align:center;margin:20px 0">';
  html += '<p style="color:var(--accent);font-size:1.1rem;font-weight:800;margin-bottom:12px">\u{1F9E0} Husk dette ord!</p>';
  html += '<div class="boss-memory-word" id="bossMemoryWord">' + word + '</div>';
  html += '</div>';
  html += '<div id="bossMemoryInput" style="display:none">';
  html += renderBossWordSlots(word);
  if (wordHint) html += '<p style="text-align:center;color:var(--accent);font-size:0.95rem;margin:8px 0">\u{1F4A1} ' + wordHint + '</p>';
  html += '<p style="text-align:center;color:var(--muted);font-size:0.9rem;margin:8px 0">\u270F\uFE0F Stav ordet fra hukommelsen!</p>';
  html += '<input type="text" id="bossMemInput" placeholder="Skriv ordet her..." style="margin-bottom:12px" autocomplete="off" autocapitalize="off" onkeydown="if(event.key===\'Enter\')checkBossMemory()" />';
  html += '<button class="btn btn-primary btn-full" onclick="checkBossMemory()">\u2714\uFE0F Tjek</button>';
  html += '</div>';
  document.getElementById('bossContent').innerHTML = html;

  // Play the word aloud
  speakWord(word, null);

  // Show word for 2 seconds then hide
  setTimeout(function() {
    var wordEl = document.getElementById('bossMemoryWord');
    if (wordEl) wordEl.style.opacity = '0';
    setTimeout(function() {
      if (wordEl) wordEl.textContent = '\u{1F50D}';
      if (wordEl) wordEl.style.opacity = '1';
      var inputArea = document.getElementById('bossMemoryInput');
      if (inputArea) inputArea.style.display = 'block';
      var inp = document.getElementById('bossMemInput');
      if (inp) inp.focus();
    }, 500);
  }, 2000);
}

function checkBossMemory() {
  if (!bossState) return;
  var inp = document.getElementById('bossMemInput');
  if (!inp) return;
  var answer = inp.value.trim().toLowerCase();
  if (!answer) return;

  if (answer === bossState.word) {
    // All correct!
    for (var i = 0; i < bossState.word.length; i++) {
      revealBossSlot(i, bossState.word[i]);
    }
    bossState.hp = 0;
    updateBossHP(); bossHitAnim();
    setTimeout(function() { bossDefeated(); }, 300);
    return;
  }

  // Wrong — lose a life
  bossState.memAttempts--;
  bossAttackAnim();

  // Update lives display
  var livesEl = document.getElementById('memLives');
  if (livesEl) {
    var livesHtml = '';
    for (var li = 0; li < 2; li++) {
      livesHtml += li < bossState.memAttempts ? '\u2764\uFE0F ' : '\u{1F5A4} ';
    }
    livesEl.innerHTML = livesHtml;
  }

  if (bossState.memAttempts <= 0) {
    // Lost — reveal the word, no chest reward
    pendingChest = false;
    for (var ri = 0; ri < bossState.word.length; ri++) {
      revealBossSlot(ri, bossState.word[ri]);
    }
    var content = document.getElementById('bossContent');
    content.innerHTML += '<div style="text-align:center;margin-top:16px">' +
      '<p style="color:var(--red);font-weight:700;margin-bottom:8px">Du tabte! Ordet var: ' + bossState.word + '</p>' +
      '<button class="btn btn-green" onclick="continueAfterBoss()" style="margin-top:8px">\u27A1\uFE0F Forts\u00E6t</button></div>';
    return;
  }

  // First mistake — show the word again for 3 seconds
  inp.value = '';
  inp.disabled = true;
  var wordEl = document.getElementById('bossMemoryWord');
  if (wordEl) {
    wordEl.style.opacity = '0';
    setTimeout(function() {
      wordEl.textContent = bossState.word;
      wordEl.style.opacity = '1';
    }, 300);
  }
  setTimeout(function() {
    if (wordEl) {
      wordEl.style.opacity = '0';
      setTimeout(function() {
        wordEl.textContent = '\u{1F50D}';
        wordEl.style.opacity = '1';
      }, 300);
    }
    inp.disabled = false;
    inp.focus();
  }, 3300);
}

// --- Type 4: REVERSE (word shown backwards, type it correctly) ---
function renderBossReverse(word, boss, idleAnim) {
  var reversed = word.split('').reverse().join('');
  var html = renderBossHeader(boss, idleAnim, word.length, word.length);
  html += '<div style="text-align:center;margin:16px 0">';
  html += '<p style="color:var(--muted);font-size:0.95rem;margin-bottom:8px">\u{1F500} Ordet er bagl\u00E6ns! Skriv det rigtigt:</p>';
  html += '<div style="font-family:Fredoka One,cursive;font-size:2.2rem;color:var(--red);letter-spacing:6px;margin:10px 0">' + reversed + '</div>';
  html += '<button class="btn-listen" onclick="speakWord(bossState.word, null)" style="margin:8px auto;display:block">\u{1F508} H\u00F8r ordet</button>';
  html += '</div>';
  html += renderBossWordSlots(word);
  html += '<input type="text" id="bossReverseInput" placeholder="Skriv ordet rigtigt..." style="margin:12px 0" autocomplete="off" autocapitalize="off" />';
  html += '<button class="btn btn-primary btn-full" onclick="checkBossReverse()">\u2714\uFE0F Tjek</button>';
  document.getElementById('bossContent').innerHTML = html;
  speakWord(word, null);
  setTimeout(function() {
    var inp = document.getElementById('bossReverseInput');
    if (inp) inp.focus();
  }, 300);
}

function checkBossReverse() {
  if (!bossState) return;
  var inp = document.getElementById('bossReverseInput');
  if (!inp) return;
  var answer = inp.value.trim().toLowerCase();
  if (!answer) return;

  if (answer === bossState.word) {
    for (var i = 0; i < bossState.word.length; i++) {
      revealBossSlot(i, bossState.word[i]);
    }
    bossState.hp = 0;
    updateBossHP(); bossHitAnim();
    setTimeout(function() { bossDefeated(); }, 300);
  } else {
    var correct = 0;
    for (var j = 0; j < bossState.word.length; j++) {
      if (j < answer.length && answer[j] === bossState.word[j]) {
        revealBossSlot(j, bossState.word[j]);
        correct++;
      }
    }
    bossState.hp = Math.max(0, bossState.hp - correct);
    updateBossHP();
    bossAttackAnim();
    if (bossState.hp <= 0) {
      setTimeout(function() { bossDefeated(); }, 300);
    } else {
      inp.value = '';
      inp.classList.add('input-retry');
      setTimeout(function() { inp.classList.remove('input-retry'); }, 600);
      inp.focus();
    }
  }
}

// --- Type 5: PACMAN ---
var PACMAN_MAZES = [
  // 13x11 mazes. 1=wall, 0=path. Player starts top-left area, ghost bottom-right area.
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,0,0,0,1],
    [1,0,1,1,0,1,1,1,0,1,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,1,0,1],
    [1,0,0,0,1,1,0,1,1,0,0,0,1],
    [1,0,1,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,1,0,1,0,1,0,1,1,0,1],
    [1,0,0,0,0,1,0,1,0,0,0,0,1],
    [1,0,1,0,1,1,0,1,1,0,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1]
  ],
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,1,0,0,0,1],
    [1,0,1,0,0,0,1,0,0,0,1,0,1],
    [1,0,0,0,1,0,0,0,1,0,0,0,1],
    [1,1,0,1,1,0,1,0,1,1,0,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,0,1,1,0,1,0,1,1,0,1,1],
    [1,0,0,0,1,0,0,0,1,0,0,0,1],
    [1,0,1,0,0,0,1,0,0,0,1,0,1],
    [1,0,0,0,1,0,0,0,1,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1]
  ]
];

var pacmanState = null;
var pacmanInterval = null;

function renderBossPacman(word, boss, idleAnim) {
  var html = renderBossHeader(boss, idleAnim, word.length, word.length);

  // Word guide at top
  html += '<div class="pacman-wrap">';
  html += '<div class="pacman-guide" id="pacGuide">';
  for (var i = 0; i < word.length; i++) {
    var cls = i === 0 ? 'pacman-guide-letter active' : 'pacman-guide-letter';
    html += '<span class="' + cls + '" id="pacGuide' + i + '">' + word[i] + '</span>';
  }
  html += '</div>';
  html += '<p style="color:var(--muted);font-size:0.82rem;margin-bottom:6px">\u{1F3AE} Saml bogstaverne i r\u00E6kkef\u00F8lge \u2014 undg\u00E5 sp\u00F8gelset!</p>';

  // Grid
  html += '<div class="pacman-grid" id="pacGrid"></div>';
  html += '</div>';

  // D-pad controls
  html += '<div class="pacman-dpad" id="pacDpad">';
  html += '<div class="dpad-empty"></div>';
  html += '<div class="dpad-btn" onpointerdown="pacMove(0,-1)">\u2B06\uFE0F</div>';
  html += '<div class="dpad-empty"></div>';
  html += '<div class="dpad-btn" onpointerdown="pacMove(-1,0)">\u2B05\uFE0F</div>';
  html += '<div class="dpad-empty"></div>';
  html += '<div class="dpad-btn" onpointerdown="pacMove(1,0)">\u27A1\uFE0F</div>';
  html += '<div class="dpad-empty"></div>';
  html += '<div class="dpad-btn" onpointerdown="pacMove(0,1)">\u2B07\uFE0F</div>';
  html += '<div class="dpad-empty"></div>';
  html += '</div>';

  document.getElementById('bossContent').innerHTML = html;

  // Initialize game state
  var maze = PACMAN_MAZES[Math.floor(Math.random() * PACMAN_MAZES.length)];
  var rows = maze.length;
  var cols = maze[0].length;

  // Find all path cells
  var pathCells = [];
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      if (maze[r][c] === 0) pathCells.push({ r: r, c: c });
    }
  }

  // Place letters on random path cells (avoid player/ghost start)
  var playerStart = { r: 1, c: 1 };
  var ghostStart = { r: rows - 2, c: cols - 2 };
  var availCells = pathCells.filter(function(p) {
    var distPlayer = Math.abs(p.r - playerStart.r) + Math.abs(p.c - playerStart.c);
    var distGhost = Math.abs(p.r - ghostStart.r) + Math.abs(p.c - ghostStart.c);
    return distPlayer > 2 && distGhost > 1;
  });
  availCells = shuffle(availCells);

  var letterPositions = [];
  var wordLetters = word.split('');
  for (var li = 0; li < wordLetters.length && li < availCells.length; li++) {
    letterPositions.push({ r: availCells[li].r, c: availCells[li].c, letter: wordLetters[li], collected: false });
  }

  pacmanState = {
    maze: maze, rows: rows, cols: cols,
    player: { r: playerStart.r, c: playerStart.c },
    ghost: { r: ghostStart.r, c: ghostStart.c },
    letters: letterPositions,
    letterIndex: 0,
    word: word,
    ghostMoveCounter: 0,
    alive: true
  };

  renderPacmanGrid();

  // Ghost movement interval
  pacmanInterval = setInterval(function() { moveGhost(); }, 400);

  // Keyboard controls
  pacmanState._keyHandler = function(e) {
    if (!pacmanState || !pacmanState.alive) return;
    if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); pacMove(0, -1); }
    else if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); pacMove(0, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); pacMove(-1, 0); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); pacMove(1, 0); }
  };
  document.addEventListener('keydown', pacmanState._keyHandler);

  // Swipe controls
  var grid = document.getElementById('pacGrid');
  var touchStart = null;
  grid.addEventListener('touchstart', function(e) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  grid.addEventListener('touchend', function(e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return; // too small
    if (Math.abs(dx) > Math.abs(dy)) {
      pacMove(dx > 0 ? 1 : -1, 0);
    } else {
      pacMove(0, dy > 0 ? 1 : -1);
    }
  }, { passive: true });
}

function renderPacmanGrid() {
  if (!pacmanState) return;
  var s = pacmanState;
  var grid = document.getElementById('pacGrid');
  if (!grid) return;

  grid.style.gridTemplateColumns = 'repeat(' + s.cols + ', auto)';
  var html = '';
  for (var r = 0; r < s.rows; r++) {
    for (var c = 0; c < s.cols; c++) {
      if (s.maze[r][c] === 1) {
        html += '<div class="pac-cell pac-wall"></div>';
      } else if (r === s.player.r && c === s.player.c) {
        html += '<div class="pac-cell pac-path pac-player">\u{1F600}</div>';
      } else if (r === s.ghost.r && c === s.ghost.c) {
        html += '<div class="pac-cell pac-path pac-ghost">\u{1F47B}</div>';
      } else {
        // Check for letter
        var letterHere = null;
        for (var li = 0; li < s.letters.length; li++) {
          if (s.letters[li].r === r && s.letters[li].c === c && !s.letters[li].collected) {
            letterHere = s.letters[li];
            letterHere._index = li;
            break;
          }
        }
        if (letterHere) {
          var isCurrent = (letterHere._index === s.letterIndex);
          html += '<div class="pac-cell pac-path pac-letter' + (isCurrent ? ' next-target' : '') + '">' + letterHere.letter + '</div>';
        } else {
          html += '<div class="pac-cell pac-path"><div class="pac-dot"></div></div>';
        }
      }
    }
  }
  grid.innerHTML = html;
}

function pacMove(dx, dy) {
  if (!pacmanState || !pacmanState.alive) return;
  var s = pacmanState;
  var newR = s.player.r + dy;
  var newC = s.player.c + dx;

  // Check bounds and walls
  if (newR < 0 || newR >= s.rows || newC < 0 || newC >= s.cols) return;
  if (s.maze[newR][newC] === 1) return;

  s.player.r = newR;
  s.player.c = newC;

  // Check letter collection
  checkPacLetterCollision();

  // Check ghost collision
  if (s.player.r === s.ghost.r && s.player.c === s.ghost.c) {
    pacmanCaught();
    return;
  }

  renderPacmanGrid();
}

function checkPacLetterCollision() {
  var s = pacmanState;
  for (var i = 0; i < s.letters.length; i++) {
    if (!s.letters[i].collected && s.letters[i].r === s.player.r && s.letters[i].c === s.player.c) {
      if (i === s.letterIndex) {
        // Correct letter in sequence!
        s.letters[i].collected = true;
        s.letterIndex++;

        // Update guide
        var prev = document.getElementById('pacGuide' + (s.letterIndex - 1));
        if (prev) { prev.classList.remove('active'); prev.classList.add('caught'); }
        var next = document.getElementById('pacGuide' + s.letterIndex);
        if (next) next.classList.add('active');

        // Boss damage
        bossState.hp--;
        bossState.letterIndex = s.letterIndex;
        updateBossHP();
        bossHitAnim();

        if (bossState.hp <= 0) {
          // Won!
          s.alive = false;
          cleanupPacman();
          bossDefeated();
          return;
        }
      }
      // Wrong order: just ignore, they need to find the right one first
      break;
    }
  }
}

function moveGhost() {
  if (!pacmanState || !pacmanState.alive) return;
  var s = pacmanState;
  s.ghostMoveCounter++;

  // Simple BFS to find shortest path to player
  var start = { r: s.ghost.r, c: s.ghost.c };
  var goal = { r: s.player.r, c: s.player.c };

  var queue = [start];
  var visited = {};
  visited[start.r + ',' + start.c] = null; // parent
  var found = false;

  while (queue.length > 0) {
    var cur = queue.shift();
    if (cur.r === goal.r && cur.c === goal.c) { found = true; break; }

    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (var d = 0; d < dirs.length; d++) {
      var nr = cur.r + dirs[d][1];
      var nc = cur.c + dirs[d][0];
      var key = nr + ',' + nc;
      if (nr >= 0 && nr < s.rows && nc >= 0 && nc < s.cols && s.maze[nr][nc] === 0 && !(key in visited)) {
        visited[key] = cur;
        queue.push({ r: nr, c: nc });
      }
    }
  }

  // Trace back from goal to find first step
  if (found) {
    var step = goal;
    var prevKey = step.r + ',' + step.c;
    while (visited[prevKey] !== null) {
      var parent = visited[prevKey];
      var parentKey = parent.r + ',' + parent.c;
      if (parentKey === start.r + ',' + start.c) {
        // step is the next move
        break;
      }
      step = parent;
      prevKey = parentKey;
    }
    // Sometimes pause to give player a chance (every 3rd move, ghost hesitates)
    if (s.ghostMoveCounter % 3 !== 0) {
      s.ghost.r = step.r;
      s.ghost.c = step.c;
    }
  }

  // Check collision after ghost moves
  if (s.player.r === s.ghost.r && s.player.c === s.ghost.c) {
    pacmanCaught();
    return;
  }

  renderPacmanGrid();
}

function pacmanCaught() {
  if (!pacmanState) return;
  pacmanState.alive = false;
  cleanupPacman();

  // Player caught — deal remaining damage and continue (boss wins this round)
  pendingChest = false; // no chest reward for losing
  var content = document.getElementById('bossContent');
  if (!content) return;

  var collected = pacmanState.letterIndex;
  var word = pacmanState.word;

  var html = '<div style="text-align:center;padding:20px">';
  html += '<div style="font-size:3.5rem;margin-bottom:10px">\u{1F47B}</div>';
  html += '<h2 style="color:var(--red);margin-bottom:8px">Fanget af sp\u00F8gelset!</h2>';
  html += '<p style="color:var(--muted);margin-bottom:6px">Du samlede ' + collected + ' ud af ' + word.length + ' bogstaver</p>';
  html += '<p style="font-family:Fredoka One,cursive;font-size:1.6rem;color:var(--accent);letter-spacing:3px;margin:10px 0">' + word + '</p>';
  if (collected > 0) {
    html += '<p style="color:var(--green);font-weight:700">+' + (collected * 3) + ' XP alligevel!</p>';
    var data = loadRewardData();
    data.totalXP = (data.totalXP || 0) + collected * 3;
    data.todayXP = (data.todayXP || 0) + collected * 3;
    saveRewardData(data);
    updateRewardBar();
  }
  html += '<button class="btn btn-green btn-full" onclick="continueAfterBoss()" style="margin-top:16px">\u27A1\uFE0F Forts\u00E6t</button>';
  html += '</div>';

  setTimeout(function() { content.innerHTML = html; }, 600);
}

function cleanupPacman() {
  if (pacmanInterval) { clearInterval(pacmanInterval); pacmanInterval = null; }
  if (pacmanState && pacmanState._keyHandler) {
    document.removeEventListener('keydown', pacmanState._keyHandler);
  }
}

// --- Type 6: HIGHWAY (Outrun-style 3-lane racing) ---
var highwayInterval = null;
var highwayState = null;

function renderBossHighway(word, boss, idleAnim) {
  var html = renderBossHeader(boss, idleAnim, word.length, word.length);

  // Word guide
  html += '<div style="text-align:center;margin:8px 0">';
  html += '<div style="font-family:Fredoka One,cursive;font-size:1.3rem;letter-spacing:4px">';
  for (var i = 0; i < word.length; i++) {
    var cls = i === 0 ? 'boss-rain-guide-letter active' : 'boss-rain-guide-letter';
    html += '<span class="' + cls + '" id="hwGuide' + i + '">' + word[i] + '</span>';
  }
  html += '</div></div>';

  html += '<div class="boss-rain-target" id="hwTarget">\u{1F3AF} Fang: <strong>' + word[0] + '</strong></div>';

  // Outrun-style road area
  html += '<div class="highway-area" id="hwArea">';
  html += '<div class="highway-sky"><span class="highway-sky-stars">\u2728</span><span class="highway-sky-stars2">\u2B50</span></div>';
  html += '<div class="highway-ground">';
  html += '<div class="highway-road-surface"></div>';
  html += '<div class="highway-road-edge-l"></div>';
  html += '<div class="highway-road-edge-r"></div>';
  html += '<div class="highway-lane-stripe highway-lane-stripe-1"></div>';
  html += '<div class="highway-lane-stripe highway-lane-stripe-2"></div>';
  html += '<div class="highway-lane-stripe highway-lane-stripe-3"></div>';
  html += '</div>';
  html += '<div class="highway-horizon-line"></div>';
  html += '<div class="highway-car" id="hwCar" style="left:50%"><div class="highway-car-body"><div class="highway-car-stripe"></div><div class="highway-car-wheel-l"></div><div class="highway-car-wheel-r"></div><div class="highway-car-wheel-bl"></div><div class="highway-car-wheel-br"></div></div><div class="highway-car-exhaust"></div></div>';
  html += '</div>';

  // D-pad
  html += '<div style="display:flex;justify-content:center;gap:16px;margin-top:10px">';
  html += '<div class="dpad-btn" onpointerdown="hwMove(-1)" style="width:70px;height:50px">\u2B05\uFE0F</div>';
  html += '<div class="dpad-btn" onpointerdown="hwMove(1)" style="width:70px;height:50px">\u27A1\uFE0F</div>';
  html += '</div>';

  document.getElementById('bossContent').innerHTML = html;

  // Lane positions (percentage from left)
  var lanePositions = [25, 50, 75];

  highwayState = {
    lane: 1,
    letterIndex: 0,
    spawnCount: 0,
    lanePositions: lanePositions
  };

  // Position car
  var car = document.getElementById('hwCar');
  if (car) car.style.left = lanePositions[1] + '%';

  // Keyboard
  highwayState._keyHandler = function(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); hwMove(-1); }
    if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); hwMove(1); }
  };
  document.addEventListener('keydown', highwayState._keyHandler);

  // Swipe
  var area = document.getElementById('hwArea');
  var touchX = null;
  area.addEventListener('touchstart', function(e) { touchX = e.touches[0].clientX; }, { passive: true });
  area.addEventListener('touchend', function(e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 20) hwMove(dx > 0 ? 1 : -1);
  }, { passive: true });

  highwayInterval = setInterval(function() { hwSpawnLetter(); }, 1100);
  setTimeout(function() { hwSpawnLetter(); }, 400);
}

function hwMove(dir) {
  if (!highwayState || !bossState) return;
  highwayState.lane = Math.max(0, Math.min(2, highwayState.lane + dir));
  var car = document.getElementById('hwCar');
  if (car) car.style.left = highwayState.lanePositions[highwayState.lane] + '%';
}

function hwSpawnLetter() {
  if (!bossState || bossState.battleType !== 'highway') { clearInterval(highwayInterval); return; }
  var area = document.getElementById('hwArea');
  if (!area) { clearInterval(highwayInterval); return; }

  var target = bossState.word[bossState.letterIndex];
  var alphabet = 'abcdefghijklmnopqrstuvwxyz\u00E6\u00F8\u00E5';
  var letter;
  highwayState.spawnCount++;
  if (Math.random() < 0.4 || highwayState.spawnCount % 3 === 0) {
    letter = target;
  } else {
    letter = alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  var lane = Math.floor(Math.random() * 3);
  var laneX = highwayState.lanePositions[lane];
  var el = document.createElement('div');
  el.className = 'highway-letter' + (letter === target ? ' target' : '');
  el.textContent = letter;
  el.dataset.lane = lane;
  el.dataset.letter = letter;
  var dropId = 'hwDrop' + highwayState.spawnCount;
  el.id = dropId;
  area.appendChild(el);

  // Outrun perspective animation: starts small at horizon, grows as it approaches
  var startTime = Date.now();
  var duration = 2200;
  var areaHeight = area.offsetHeight;
  var horizonY = areaHeight * 0.40; // vanishing point (matches sky/ground split)
  var carY = areaHeight - 60;

  function animate() {
    var elRef = document.getElementById(dropId);
    if (!elRef) return;
    var progress = (Date.now() - startTime) / duration;
    if (progress >= 1) {
      if (elRef.parentNode) elRef.parentNode.removeChild(elRef);
      return;
    }

    // Exponential scaling for perspective effect
    var t = progress * progress; // ease-in for approaching feel
    var yPos = horizonY + t * (carY - horizonY);
    var scale = 0.3 + t * 1.2;

    // Lateral position converges from center to lane position
    var centerX = 50;
    var laneXpct = laneX;
    var xPos = centerX + (laneXpct - centerX) * t;

    elRef.style.left = xPos + '%';
    elRef.style.top = yPos + 'px';
    elRef.style.fontSize = (0.8 + scale * 0.8) + 'rem';
    elRef.style.width = (20 + scale * 25) + 'px';
    elRef.style.height = (20 + scale * 25) + 'px';
    elRef.style.opacity = 0.4 + t * 0.6;

    // Collision check near car
    if (t > 0.85 && parseInt(elRef.dataset.lane) === highwayState.lane) {
      var l = elRef.dataset.letter;
      if (l === bossState.word[bossState.letterIndex]) {
        elRef.classList.add('caught');
        setTimeout(function() { if (elRef.parentNode) elRef.parentNode.removeChild(elRef); }, 150);
        bossState.hp--; bossState.letterIndex++;
        var prev = document.getElementById('hwGuide' + (bossState.letterIndex - 1));
        if (prev) { prev.classList.remove('active'); prev.classList.add('caught'); }
        var next = document.getElementById('hwGuide' + bossState.letterIndex);
        if (next) next.classList.add('active');
        updateBossHP(); bossHitAnim();
        if (bossState.hp <= 0) {
          clearInterval(highwayInterval);
          cleanupHighway();
          bossDefeated();
          return;
        }
        var targetEl = document.getElementById('hwTarget');
        if (targetEl) targetEl.innerHTML = '\u{1F3AF} Fang: <strong>' + bossState.word[bossState.letterIndex] + '</strong>';
      } else {
        elRef.style.borderColor = 'var(--red)';
        if (elRef.parentNode) elRef.parentNode.removeChild(elRef);
        bossAttackAnim();
      }
      return;
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

function cleanupHighway() {
  if (highwayInterval) { clearInterval(highwayInterval); highwayInterval = null; }
  if (highwayState && highwayState._keyHandler) {
    document.removeEventListener('keydown', highwayState._keyHandler);
  }
  highwayState = null;
}

// --- Type 7: CARDCAST (Slay the Spire style) ---
function renderBossCardcast(word, boss, idleAnim) {
  var html = renderBossHeader(boss, idleAnim, word.length, word.length);

  // Hearts that become letters
  html += '<div class="cardcast-hearts" id="ccHearts">';
  for (var i = 0; i < word.length; i++) {
    html += '<span class="cardcast-heart" id="ccHeart' + i + '">\u2764\uFE0F</span>';
  }
  html += '</div>';

  // Player lives
  html += '<div id="ccLives" style="text-align:center;margin:6px 0;font-size:1.3rem">\u2764\uFE0F \u2764\uFE0F</div>';

  html += '<button class="btn-listen" onclick="speakWord(bossState.word, null)" style="margin:8px auto;display:block">\u{1F508} H\u00F8r ordet igen</button>';
  html += '<p style="text-align:center;color:var(--muted);font-size:0.85rem;margin:8px 0">Kast det rigtige bogstav-kort!</p>';

  // Build hand: correct letters + distractors
  var handLetters = word.split('');
  var alphabet = 'abcdefghijklmnopqrstuvwxyz\u00E6\u00F8\u00E5';
  var distractorCount = 2 + Math.floor(Math.random() * 2); // 2-3 distractors
  for (var d = 0; d < distractorCount; d++) {
    var distractor;
    do {
      distractor = alphabet[Math.floor(Math.random() * alphabet.length)];
    } while (handLetters.indexOf(distractor) >= 0);
    handLetters.push(distractor);
  }
  // Shuffle hand
  for (var si = handLetters.length - 1; si > 0; si--) {
    var sj = Math.floor(Math.random() * (si + 1));
    var tmp = handLetters[si]; handLetters[si] = handLetters[sj]; handLetters[sj] = tmp;
  }

  html += '<div class="cardcast-hand" id="ccHand">';
  for (var ci = 0; ci < handLetters.length; ci++) {
    html += '<button class="cardcast-card" data-index="' + ci + '" data-letter="' + handLetters[ci] + '" onclick="castCard(' + ci + ')">' + handLetters[ci] + '</button>';
  }
  html += '</div>';

  document.getElementById('bossContent').innerHTML = html;

  bossState.ccLetterIndex = 0;
  bossState.ccLives = 2;

  // Keyboard support: press a letter key to cast the first matching unplayed card
  if (bossState._ccKeyHandler) document.removeEventListener('keydown', bossState._ccKeyHandler);
  bossState._ccKeyHandler = function(e) {
    if (!bossState || bossState.battleType !== 'cardcast') return;
    var key = e.key.toLowerCase();
    if (key.length !== 1) return;
    var cards = document.querySelectorAll('.cardcast-card:not(.played)');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].dataset.letter === key) {
        castCard(parseInt(cards[i].dataset.index));
        return;
      }
    }
  };
  document.addEventListener('keydown', bossState._ccKeyHandler);

  // Play the word
  speakWord(word, null);
}

function castCard(cardIndex) {
  if (!bossState) return;
  var card = document.querySelector('.cardcast-card[data-index="' + cardIndex + '"]');
  if (!card || card.classList.contains('played')) return;

  var letter = card.dataset.letter;
  var expected = bossState.word[bossState.ccLetterIndex];

  if (letter === expected) {
    // Correct cast!
    card.classList.add('played');
    bossState.ccLetterIndex++;
    bossState.hp--;

    // Reveal heart → letter
    var heart = document.getElementById('ccHeart' + (bossState.ccLetterIndex - 1));
    if (heart) {
      heart.textContent = letter;
      heart.classList.add('revealed');
    }

    updateBossHP(); bossHitAnim();

    if (bossState.hp <= 0) {
      bossDefeated();
    }
  } else {
    // Wrong cast — lose a life
    card.classList.add('wrong-cast');
    setTimeout(function() { card.classList.remove('wrong-cast'); }, 400);
    bossAttackAnim();
    bossState.ccLives--;
    // Update lives display
    var livesEl = document.getElementById('ccLives');
    if (livesEl) {
      var livesHtml = '';
      for (var li = 0; li < 2; li++) {
        livesHtml += li < bossState.ccLives ? '\u2764\uFE0F ' : '\u{1F5A4} ';
      }
      livesEl.innerHTML = livesHtml;
    }
    if (bossState.ccLives <= 0) {
      // Lost — reveal word, no chest reward
      pendingChest = false;
      var hearts = document.getElementById('ccHearts');
      if (hearts) {
        for (var ri = 0; ri < bossState.word.length; ri++) {
          var h = document.getElementById('ccHeart' + ri);
          if (h && !h.classList.contains('revealed')) {
            h.textContent = bossState.word[ri];
            h.style.color = 'var(--red)';
          }
        }
      }
      var hand = document.getElementById('ccHand');
      if (hand) hand.style.display = 'none';
      var content = document.getElementById('bossContent');
      content.innerHTML += '<div style="text-align:center;margin-top:16px">' +
        '<p style="color:var(--red);font-weight:700;margin-bottom:8px">Du tabte! Ordet var: ' + bossState.word + '</p>' +
        '<button class="btn btn-green" onclick="continueAfterBoss()" style="margin-top:8px">\u27A1\uFE0F Forts\u00E6t</button></div>';
    }
  }
}

// --- Type 8: SNAKE ---
var snakeState = null;
var snakeInterval = null;

function renderBossSnake(word, boss, idleAnim) {
  var html = renderBossHeader(boss, idleAnim, word.length, word.length);

  // Word guide
  html += '<div style="text-align:center;margin:6px 0">';
  html += '<div style="font-family:Fredoka One,cursive;font-size:1.3rem;letter-spacing:4px">';
  for (var i = 0; i < word.length; i++) {
    var cls = i === 0 ? 'boss-rain-guide-letter active' : 'boss-rain-guide-letter';
    html += '<span class="' + cls + '" id="snGuide' + i + '">' + word[i] + '</span>';
  }
  html += '</div></div>';

  html += '<div style="text-align:center"><div class="snake-area" id="snakeArea"></div></div>';

  // D-pad
  html += '<div class="pacman-dpad" id="snakeDpad">';
  html += '<div class="dpad-empty"></div>';
  html += '<div class="dpad-btn" onpointerdown="snakeDir(0,-1)">\u2B06\uFE0F</div>';
  html += '<div class="dpad-empty"></div>';
  html += '<div class="dpad-btn" onpointerdown="snakeDir(-1,0)">\u2B05\uFE0F</div>';
  html += '<div class="dpad-empty"></div>';
  html += '<div class="dpad-btn" onpointerdown="snakeDir(1,0)">\u27A1\uFE0F</div>';
  html += '<div class="dpad-empty"></div>';
  html += '<div class="dpad-btn" onpointerdown="snakeDir(0,1)">\u2B07\uFE0F</div>';
  html += '<div class="dpad-empty"></div>';
  html += '</div>';

  document.getElementById('bossContent').innerHTML = html;

  var cols = 13, rows = 11;
  var snake = [{ r: 5, c: 6 }, { r: 5, c: 5 }, { r: 5, c: 4 }];
  var dir = { dc: 1, dr: 0 };
  var nextDir = { dc: 1, dr: 0 };

  snakeState = {
    cols: cols, rows: rows, snake: snake, dir: dir, nextDir: nextDir,
    letters: [], letterIndex: 0, alive: true, word: word
  };

  // Spawn first pair (correct + distractor)
  snakeSpawnPair();

  renderSnakeGrid();

  // Keyboard
  snakeState._keyHandler = function(e) {
    if (!snakeState || !snakeState.alive) return;
    if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); snakeDir(0, -1); }
    else if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); snakeDir(0, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); snakeDir(-1, 0); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); snakeDir(1, 0); }
  };
  document.addEventListener('keydown', snakeState._keyHandler);

  // Swipe
  var area = document.getElementById('snakeArea');
  var touchStart = null;
  area.addEventListener('touchstart', function(e) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  area.addEventListener('touchend', function(e) {
    if (!touchStart) return;
    var dx = e.changedTouches[0].clientX - touchStart.x;
    var dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return;
    if (Math.abs(dx) > Math.abs(dy)) snakeDir(dx > 0 ? 1 : -1, 0);
    else snakeDir(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  // 3-2-1 countdown before snake starts moving
  var countdownEl = document.createElement('div');
  countdownEl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:Fredoka One,cursive;font-size:4rem;color:var(--accent);z-index:20;text-shadow:0 4px 12px rgba(0,0,0,0.8);';
  countdownEl.textContent = '3';
  var snArea = document.getElementById('snakeArea');
  snArea.style.position = 'relative';
  snArea.appendChild(countdownEl);
  setTimeout(function() { countdownEl.textContent = '2'; }, 1000);
  setTimeout(function() { countdownEl.textContent = '1'; }, 2000);
  setTimeout(function() {
    countdownEl.textContent = 'GO!';
    countdownEl.style.color = 'var(--green)';
    setTimeout(function() { if (countdownEl.parentNode) countdownEl.parentNode.removeChild(countdownEl); }, 400);
    snakeInterval = setInterval(function() { snakeTick(); }, 200);
  }, 3000);
}

function snakeSpawnPair() {
  var s = snakeState;
  if (s.letterIndex >= s.word.length) return;
  var target = s.word[s.letterIndex];
  var alphabet = 'abcdefghijklmnopqrstuvwxyz\u00E6\u00F8\u00E5';
  var distractor;
  do {
    distractor = alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (distractor === target);

  // Clear old letters
  s.letters = [];
  var occupied = {};
  s.snake.forEach(function(seg) { occupied[seg.r + ',' + seg.c] = true; });

  // Place correct letter
  var pos1;
  do { pos1 = { r: Math.floor(Math.random() * s.rows), c: Math.floor(Math.random() * s.cols) }; }
  while (occupied[pos1.r + ',' + pos1.c]);
  occupied[pos1.r + ',' + pos1.c] = true;
  s.letters.push({ r: pos1.r, c: pos1.c, letter: target, isCorrect: true });

  // Place distractor
  var pos2;
  do { pos2 = { r: Math.floor(Math.random() * s.rows), c: Math.floor(Math.random() * s.cols) }; }
  while (occupied[pos2.r + ',' + pos2.c]);
  s.letters.push({ r: pos2.r, c: pos2.c, letter: distractor, isCorrect: false });
}

function snakeDir(dc, dr) {
  if (!snakeState) return;
  // Prevent 180-degree turns
  if (dc === -snakeState.dir.dc && dr === -snakeState.dir.dr) return;
  snakeState.nextDir = { dc: dc, dr: dr };
}

function snakeTick() {
  if (!snakeState || !snakeState.alive) return;
  var s = snakeState;
  s.dir = s.nextDir;

  var head = s.snake[0];
  var newR = head.r + s.dir.dr;
  var newC = head.c + s.dir.dc;

  // Wrap around walls
  if (newR < 0) newR = s.rows - 1;
  if (newR >= s.rows) newR = 0;
  if (newC < 0) newC = s.cols - 1;
  if (newC >= s.cols) newC = 0;

  // Check self-collision
  for (var i = 0; i < s.snake.length; i++) {
    if (s.snake[i].r === newR && s.snake[i].c === newC) {
      snakeDeath();
      return;
    }
  }

  // Move head
  s.snake.unshift({ r: newR, c: newC });

  // Check letter collision
  var ate = false;
  for (var li = 0; li < s.letters.length; li++) {
    if (s.letters[li].r === newR && s.letters[li].c === newC) {
      if (s.letters[li].isCorrect) {
        // Correct letter!
        s.letterIndex++;
        ate = true;

        var prev = document.getElementById('snGuide' + (s.letterIndex - 1));
        if (prev) { prev.classList.remove('active'); prev.classList.add('caught'); }
        var next = document.getElementById('snGuide' + s.letterIndex);
        if (next) next.classList.add('active');

        bossState.hp--;
        bossState.letterIndex = s.letterIndex;
        updateBossHP(); bossHitAnim();

        if (bossState.hp <= 0) {
          s.alive = false;
          cleanupSnake();
          bossDefeated();
          return;
        }
        // Spawn next pair
        snakeSpawnPair();
      } else {
        // Wrong letter — death!
        snakeDeath();
        return;
      }
      break;
    }
  }

  if (!ate) {
    s.snake.pop(); // Remove tail (no growth)
  }

  renderSnakeGrid();
}

function renderSnakeGrid() {
  if (!snakeState) return;
  var s = snakeState;
  var area = document.getElementById('snakeArea');
  if (!area) return;

  area.style.gridTemplateColumns = 'repeat(' + s.cols + ', auto)';
  var snakeSet = {};
  s.snake.forEach(function(seg, idx) { snakeSet[seg.r + ',' + seg.c] = idx; });

  var html = '';
  for (var r = 0; r < s.rows; r++) {
    for (var c = 0; c < s.cols; c++) {
      var key = r + ',' + c;
      if (snakeSet[key] === 0) {
        html += '<div class="snake-cell snake-head">\u{1F40D}</div>';
      } else if (snakeSet[key] !== undefined) {
        html += '<div class="snake-cell snake-body"></div>';
      } else {
        var letterHere = null;
        for (var li = 0; li < s.letters.length; li++) {
          if (s.letters[li].r === r && s.letters[li].c === c) {
            letterHere = s.letters[li];
            break;
          }
        }
        if (letterHere) {
          html += '<div class="snake-cell snake-letter' + (letterHere.isCorrect ? ' next-target' : '') + '">' + letterHere.letter.toUpperCase() + '</div>';
        } else {
          html += '<div class="snake-cell"></div>';
        }
      }
    }
  }
  area.innerHTML = html;
}

function snakeDeath() {
  if (!snakeState) return;
  snakeState.alive = false;
  pendingChest = false; // no chest reward for losing
  cleanupSnake();

  var collected = snakeState.letterIndex;
  var word = bossState.word;

  var content = document.getElementById('bossContent');
  var html = '<div style="text-align:center;padding:20px">';
  html += '<div style="font-size:3.5rem;margin-bottom:10px">\u{1F4A5}</div>';
  html += '<h2 style="color:var(--red);margin-bottom:8px">Slangen bed sig selv!</h2>';
  html += '<p style="color:var(--muted);margin-bottom:6px">Du samlede ' + collected + ' ud af ' + word.length + ' bogstaver</p>';
  html += '<p style="font-family:Fredoka One,cursive;font-size:1.6rem;color:var(--accent);letter-spacing:3px;margin:10px 0">' + word + '</p>';
  if (collected > 0) {
    html += '<p style="color:var(--green);font-weight:700">+' + (collected * 3) + ' XP alligevel!</p>';
    var data = loadRewardData();
    data.totalXP = (data.totalXP || 0) + collected * 3;
    data.todayXP = (data.todayXP || 0) + collected * 3;
    saveRewardData(data);
    updateRewardBar();
  }
  html += '<button class="btn btn-green btn-full" onclick="continueAfterBoss()" style="margin-top:16px">\u27A1\uFE0F Forts\u00E6t</button>';
  html += '</div>';

  setTimeout(function() { content.innerHTML = html; }, 400);
}

// --- Type 9: SPELLPICK (multiple choice) ---
function renderBossSpellpick(word, boss, idleAnim) {
  var hp = 3;
  bossState.hp = hp;
  bossState.maxHP = hp;
  bossState.spRound = 0;

  // Pick 3 different words from the same category
  var cat = bossState.wordObj.category;
  var catWords = (WORD_BANK[cat] || []).slice();
  for (var i = catWords.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = catWords[i]; catWords[i] = catWords[j]; catWords[j] = t;
  }
  var spWords = [];
  var usedWords = {};
  for (var wi = 0; wi < catWords.length && spWords.length < 3; wi++) {
    var wo = catWords[wi];
    var wl = wo.word.toLowerCase();
    if (usedWords[wl]) continue;
    usedWords[wl] = true;
    spWords.push({ word: wl, category: cat, patternHint: wo.patternHint || '', wordObj: wo, dbMisspellings: [] });
  }
  bossState.spWords = spWords;

  var content = document.getElementById('bossContent');
  content.innerHTML = renderBossHeader(boss, idleAnim, hp, hp) +
    '<p style="text-align:center;color:var(--muted);font-size:0.9rem;margin-top:12px">Henter stavefejl...</p>';

  // Fetch real misspellings from Supabase for all 3 words
  var wordList = spWords.map(function(w) { return w.word; });
  fetchMisspellings(wordList, function(misByWord) {
    for (var mi = 0; mi < spWords.length; mi++) {
      spWords[mi].dbMisspellings = misByWord[spWords[mi].word] || [];
    }
    buildSpellpickRound();
  });
}

var misspellingCache = {};
var misspellingCacheTime = 0;

// Levenshtein-afstand bruges til at filtrere urealistiske "stavefejl" fra databasen
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  var prev = [];
  for (var i = 0; i <= b.length; i++) prev[i] = i;
  for (var i = 1; i <= a.length; i++) {
    var curr = [i];
    for (var j = 1; j <= b.length; j++) {
      var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

// Filtrerer brugerens forkerte svar så kun sandsynlige stavefejl bruges som
// distraktorer — afviser fulde sætninger, tegnsætning, og svar der er for langt
// fra det rigtige ord (typos, fejltryk, legacy rightorwrong-svar som "rigtigt").
function isPlausibleMisspelling(word, attempt) {
  if (!attempt || attempt === word) return false;
  if (!/^[a-zæøå]+$/.test(attempt)) return false;
  if (attempt.length < Math.max(2, word.length - 3)) return false;
  if (attempt.length > word.length + 3) return false;
  var maxDist = Math.max(2, Math.floor(word.length / 3));
  return levenshteinDistance(word, attempt) <= maxDist;
}

function fetchMisspellings(words, callback) {
  if (!supabaseClient) { callback({}); return; }

  // Use cache if fresh (5 minutes)
  var now = Date.now();
  var uncached = words.filter(function(w) { return !misspellingCache[w] || now - misspellingCacheTime > MISSPELLING_CACHE_MS; });
  if (uncached.length === 0) {
    var result = {};
    words.forEach(function(w) { if (misspellingCache[w]) result[w] = misspellingCache[w]; });
    callback(result);
    return;
  }

  supabaseClient.from('answers')
    .select('word, answer')
    .eq('correct', false)
    .in('word', uncached)
    .then(function(res) {
      var misByWord = {};
      if (res.data) {
        for (var i = 0; i < res.data.length; i++) {
          var r = res.data[i];
          var w = r.word.toLowerCase();
          var a = r.answer.toLowerCase().trim();
          if (isPlausibleMisspelling(w, a)) {
            if (!misByWord[w]) misByWord[w] = {};
            misByWord[w][a] = (misByWord[w][a] || 0) + 1;
          }
        }
      }
      // Convert frequency maps to sorted arrays (most common first)
      var sortedByWord = {};
      Object.keys(misByWord).forEach(function(w) {
        var entries = Object.keys(misByWord[w]).map(function(a) { return { answer: a, count: misByWord[w][a] }; });
        entries.sort(function(a, b) { return b.count - a.count; });
        sortedByWord[w] = entries.map(function(e) { return e.answer; });
      });
      // Update cache
      uncached.forEach(function(w) { misspellingCache[w] = sortedByWord[w] || []; });
      misspellingCacheTime = now;
      // Return all requested words from cache
      var result = {};
      words.forEach(function(w) { if (misspellingCache[w]) result[w] = misspellingCache[w]; });
      callback(result);
    }).catch(function() { callback({}); });
}

function generateFallbackMisspellings(word) {
  var extras = [];
  if (word.length >= 3) {
    var si = 1 + Math.floor(Math.random() * (word.length - 2));
    var swapped = word.substring(0, si) + word[si + 1] + word[si] + word.substring(si + 2);
    if (swapped !== word) extras.push(swapped);
  }
  var ri = Math.floor(Math.random() * word.length);
  var removed = word.substring(0, ri) + word.substring(ri + 1);
  if (removed !== word && removed.length > 1) extras.push(removed);
  var di = Math.floor(Math.random() * word.length);
  var doubled = word.substring(0, di) + word[di] + word[di] + word.substring(di + 1);
  if (doubled !== word) extras.push(doubled);
  var vowels = 'aeiouy\u00E6\u00F8\u00E5';
  for (var vi = 0; vi < word.length; vi++) {
    if (vowels.indexOf(word[vi]) >= 0) {
      var rv = vowels[Math.floor(Math.random() * vowels.length)];
      if (rv !== word[vi]) {
        extras.push(word.substring(0, vi) + rv + word.substring(vi + 1));
        break;
      }
    }
  }
  return extras;
}

function buildSpellpickRound() {
  if (!bossState || bossState.hp <= 0) return;
  var spWord = bossState.spWords[bossState.spRound];
  var wordObj = spWord.wordObj || spWord;
  var word = spWord.word;

  // Start with correct answer
  var options = [word];

  // Prioritize real misspellings from database
  var dbMis = (spWord.dbMisspellings || []).slice();
  // Shuffle db misspellings
  for (var di = dbMis.length - 1; di > 0; di--) {
    var dj = Math.floor(Math.random() * (di + 1));
    var dt = dbMis[di]; dbMis[di] = dbMis[dj]; dbMis[dj] = dt;
  }
  for (var dbi = 0; dbi < dbMis.length && options.length < 4; dbi++) {
    if (options.indexOf(dbMis[dbi]) < 0) options.push(dbMis[dbi]);
  }

  // Fill with hardcoded misspelling
  if (options.length < 4 && wordObj.misspelling) {
    var hcMis = wordObj.misspelling.toLowerCase();
    if (options.indexOf(hcMis) < 0) options.push(hcMis);
  }

  // Fill remaining with fallback misspellings
  if (options.length < 4) {
    var fallbacks = generateFallbackMisspellings(word);
    for (var fi = 0; fi < fallbacks.length && options.length < 4; fi++) {
      if (options.indexOf(fallbacks[fi]) < 0) options.push(fallbacks[fi]);
    }
  }

  // Shuffle options
  for (var si2 = options.length - 1; si2 > 0; si2--) {
    var sj = Math.floor(Math.random() * (si2 + 1));
    var tmp = options[si2]; options[si2] = options[sj]; options[sj] = tmp;
  }

  var content = document.getElementById('bossContent');
  var html = renderBossHeader(bossState.boss, bossState.idleAnim, bossState.hp, bossState.maxHP);
  html += '<button class="btn-listen" onclick="speakWord(bossState.spWords[bossState.spRound].word, null)" style="margin:8px auto;display:block">\u{1F508} H\u00F8r ordet igen</button>';
  html += '<p style="text-align:center;color:var(--muted);font-size:0.85rem;margin:10px 0">Hvilken stavem\u00E5de er rigtig?</p>';
  html += '<div style="display:flex;flex-direction:column;gap:10px;max-width:320px;margin:0 auto">';
  for (var oi = 0; oi < options.length; oi++) {
    html += '<button class="btn btn-primary" style="font-size:1.15rem;letter-spacing:2px;padding:14px 20px" onclick="pickSpellOption(this, \'' + options[oi].replace(/'/g, "\\'") + '\')">' + options[oi] + '</button>';
  }
  html += '</div>';
  content.innerHTML = html;

  speakWord(word, null);
}

function pickSpellOption(btn, picked) {
  if (!bossState) return;
  var currentWord = bossState.spWords[bossState.spRound].word;
  var correct = picked === currentWord;
  var buttons = btn.parentNode.querySelectorAll('button');

  // Highlight correct/wrong
  for (var i = 0; i < buttons.length; i++) {
    if (buttons[i] === btn) continue;
    buttons[i].disabled = true;
    if (buttons[i].textContent === currentWord) {
      buttons[i].style.background = 'var(--green)';
      buttons[i].style.color = '#fff';
    } else {
      buttons[i].style.opacity = '0.3';
    }
  }

  if (correct) {
    bossState.hp--;
    updateBossHP();
    bossHitAnim();
    if (bossState.hp <= 0) {
      btn.disabled = true;
      btn.style.background = 'var(--green)';
      btn.style.color = '#fff';
      btn.textContent = '\u2714 Rigtigt!';
      setTimeout(function() { bossDefeated(); }, 800);
      return;
    }
  } else {
    bossAttackAnim();
  }

  // Turn clicked button into "next" button
  btn.style.background = correct ? 'var(--green)' : 'var(--red)';
  btn.style.color = '#fff';
  btn.textContent = correct ? '\u2714 Rigtigt! \u2014 N\u00E6ste \u27A1' : '\u2717 Forkert! \u2014 N\u00E6ste \u27A1';
  btn.onclick = function() {
    bossState.spRound++;
    buildSpellpickRound();
  };
}

// --- Type 10: SILENT SERVANT (stumtjeneren) ---
var SS_ITEMS = [
  { emoji: '\u{1F45F}', name: 'Sko' },
  { emoji: '\u{1F9E6}', name: 'Sokker' },
  { emoji: '\u{1F9E3}', name: 'Halst\u00F8rkl\u00E6de' },
  { emoji: '\u{1F9E5}', name: 'Jakke' },
  { emoji: '\u{1F3A9}', name: 'Hat' }
];

function renderCoatRack(correctCount, wrongCount) {
  var html = '<div style="text-align:center;margin-bottom:14px">';
  html += '<div style="font-weight:700;color:var(--accent);margin-bottom:8px">Stumtjeneren</div>';
  html += '<div style="display:flex;flex-direction:column-reverse;align-items:center;gap:2px;min-height:180px;justify-content:flex-start">';
  // Rack base
  html += '<div style="font-size:1.2rem;color:var(--muted)">\u2503\u2501\u2501\u2501\u2503</div>';
  // Items from bottom to top
  for (var i = 0; i < SS_ITEMS.length; i++) {
    var visible = i < correctCount;
    html += '<div style="font-size:1.8rem;transition:all 0.5s;' + (visible ? 'opacity:1;transform:scale(1)' : 'opacity:0.15;transform:scale(0.7);filter:grayscale(1)') + '">' + SS_ITEMS[i].emoji + '</div>';
  }
  html += '</div>';
  // Show X marks for wrong answers
  html += '<div style="font-size:1.2rem;margin-top:4px">';
  for (var x = 0; x < 2; x++) {
    html += '<span style="margin:0 4px;' + (x < wrongCount ? 'color:var(--red)' : 'color:#333') + '">\u2717</span>';
  }
  html += '</div>';
  html += '<div style="font-size:0.8rem;color:var(--muted)">' + correctCount + ' / ' + SS_ITEMS.length + ' ting p\u00E5 stumtjeneren</div>';
  html += '</div>';
  return html;
}

function renderBossSilentServant(word, boss, idleAnim) {
  bossState.ssCorrect = 0;
  bossState.ssWrong = 0;
  bossState.ssRound = 0;

  // Build 5 rounds using words matching player's level for Stumme bogstaver
  var stumLvl = loadCategoryLevels()['Stumme bogstaver'] ? loadCategoryLevels()['Stumme bogstaver'].level : 1;
  var stummeWords = buildPoolForCategory('Stumme bogstaver', stumLvl + 1);
  if (stummeWords.length === 0) stummeWords = buildPoolForCategory('Stumme bogstaver', stumLvl);
  for (var i = stummeWords.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = stummeWords[i]; stummeWords[i] = stummeWords[j]; stummeWords[j] = t;
  }

  var rounds = [];
  var usedWords = {};

  for (var si = 0; si < stummeWords.length && rounds.length < 3; si++) {
    var sw = stummeWords[si];
    if (!sw.misspelling) continue;
    if (usedWords[sw.word.toLowerCase()]) continue;
    usedWords[sw.word.toLowerCase()] = true;
    rounds.push({ correct: sw.word.toLowerCase(), wrong: sw.misspelling.toLowerCase(), hasSilent: true, hint: sw.hint || '' });
  }

  for (var si2 = 0; si2 < stummeWords.length && rounds.length < 5; si2++) {
    var sw2 = stummeWords[si2];
    if (usedWords[sw2.word.toLowerCase()] || !sw2.misspelling) continue;
    usedWords[sw2.word.toLowerCase()] = true;
    rounds.push({ correct: sw2.word.toLowerCase(), wrong: sw2.misspelling.toLowerCase(), hasSilent: true, hint: sw2.hint || '' });
  }

  for (var ri = rounds.length - 1; ri > 0; ri--) {
    var rj = Math.floor(Math.random() * (ri + 1));
    var rt = rounds[ri]; rounds[ri] = rounds[rj]; rounds[rj] = rt;
  }

  bossState.ssRounds = rounds;
  bossState.boss = { emoji: '\u{1F9F3}', name: 'Stumtjeneren' };
  // Set hp for compatibility with bossDefeated
  bossState.hp = 5;
  bossState.maxHP = 5;

  var content = document.getElementById('bossContent');
  content.innerHTML = renderCoatRack(0, 0);
  buildSilentServantRound();
}

function buildSilentServantRound() {
  if (!bossState) return;
  if (bossState.ssCorrect >= SS_ITEMS.length) { bossDefeated(); return; }
  var round = bossState.ssRounds[bossState.ssRound];
  if (!round) { bossDefeated(); return; }

  var content = document.getElementById('bossContent');
  var html = renderCoatRack(bossState.ssCorrect, bossState.ssWrong);
  html += '<p style="text-align:center;color:var(--muted);font-size:0.85rem;margin:10px 0">Hvilken stavem\u00E5de er rigtig?</p>';
  if (round.hint) {
    html += '<p style="text-align:center;color:var(--accent);font-size:0.9rem;margin-bottom:10px;font-style:italic">' + round.hint + '</p>';
  }

  var opts = [round.correct, round.wrong];
  if (Math.random() > 0.5) { opts = [round.wrong, round.correct]; }

  html += '<div style="display:flex;flex-direction:column;gap:12px;max-width:320px;margin:0 auto">';
  for (var i = 0; i < opts.length; i++) {
    html += '<button class="btn btn-primary" style="font-size:1.3rem;letter-spacing:3px;padding:16px 24px" onclick="pickSilentOption(this, \'' + opts[i].replace(/'/g, "\\'") + '\')">' + opts[i] + '</button>';
  }
  html += '</div>';
  html += '<p style="text-align:center;color:var(--muted);font-size:0.8rem;margin-top:12px">Runde ' + (bossState.ssRound + 1) + ' / ' + bossState.ssRounds.length + '</p>';
  content.innerHTML = html;
}

function pickSilentOption(btn, picked) {
  if (!bossState) return;
  var round = bossState.ssRounds[bossState.ssRound];
  var correct = picked === round.correct;
  var buttons = btn.parentNode.querySelectorAll('button');

  for (var i = 0; i < buttons.length; i++) {
    buttons[i].disabled = true;
    if (buttons[i].textContent === round.correct) {
      buttons[i].style.background = 'var(--green)';
      buttons[i].style.color = '#fff';
    } else if (buttons[i] === btn && !correct) {
      buttons[i].style.background = 'var(--red)';
      buttons[i].style.color = '#fff';
    }
  }

  if (correct) {
    bossState.ssCorrect++;
    bossState.hp--;
    if (bossState.ssCorrect >= SS_ITEMS.length) {
      setTimeout(function() { bossDefeated(); }, 800);
      return;
    }
  } else {
    bossState.ssWrong++;
    if (bossState.ssWrong >= 2) {
      setTimeout(function() { bossLost(); }, 800);
      return;
    }
  }

  setTimeout(function() {
    bossState.ssRound++;
    if (bossState.ssRound >= bossState.ssRounds.length) {
      bossState.ssRound = 0;
    }
    buildSilentServantRound();
  }, 1200);
}

function bossLost() {
  bossState = null;
  pendingChest = false; // no chest reward for losing
  var content = document.getElementById('bossContent');
  content.innerHTML = '<div style="text-align:center;padding:30px">' +
    '<div style="font-size:4rem;margin-bottom:12px">\u{1F614}</div>' +
    '<h2 style="color:var(--red);margin-bottom:8px">Du tabte!</h2>' +
    '<p style="color:var(--muted);margin-bottom:16px">Pr\u00F8v igen n\u00E6ste gang!</p>' +
    '<button class="btn btn-primary btn-full" onclick="continueAfterBoss()" style="margin-top:16px">\u27A1\uFE0F Forts\u00E6t</button>' +
    '</div>';
}

function cleanupSnake() {
  if (snakeInterval) { clearInterval(snakeInterval); snakeInterval = null; }
  if (snakeState && snakeState._keyHandler) {
    document.removeEventListener('keydown', snakeState._keyHandler);
  }
}

// --- Boss defeated (shared) ---
function bossDefeated() {
  var defeatedWord = bossState ? bossState.word : '';
  var deathAnim = bossState ? bossState.deathAnim : 'boss-death-spin';
  if (bossRainInterval) { clearInterval(bossRainInterval); bossRainInterval = null; }
  cleanupPacman();
  cleanupHighway();
  cleanupSnake();
  if (bossState && bossState._ccKeyHandler) document.removeEventListener('keydown', bossState._ccKeyHandler);
  bossState = null;

  var monster = document.getElementById('bossMonster');
  if (monster) {
    monster.className = 'boss-monster ' + deathAnim;
  }

  var victoryMsg = pickRandom(BOSS_VICTORY_MSGS);
  setTimeout(function() {
    var content = document.getElementById('bossContent');
    content.innerHTML = '<div style="text-align:center;padding:30px">' +
      '<div style="font-size:4rem;margin-bottom:12px">\uD83C\uDF89</div>' +
      '<h2 style="color:var(--green);margin-bottom:8px">' + victoryMsg + '</h2>' +
      '<p style="color:var(--accent);font-weight:700;font-size:1.1rem">\uD83D\uDC8E +3 Diamanter</p>' +
      '<button class="btn btn-green btn-full" onclick="continueAfterBoss()" style="margin-top:16px">\u27A1\uFE0F Forts\u00E6t</button>' +
      '</div>';
  }, 1700);

  var data = loadRewardData();
  data.gems = (data.gems || 0) + 3;
  saveRewardData(data);
  updateRewardBar();
}

function continueAfterBoss() {
  pendingBoss = null;
  sessionCorrectStreak = 0; // reset streak so boss doesn't re-trigger immediately
  hide('phase-boss');

  // Boss practice mode — start another fight of the same type
  if (bossPracticeMode) {
    startBossPractice(bossPracticeType);
    return;
  }

  pendingChest = false;

  if (!isMixedSession) {
    if (gameMode === 'fillin') show('phase-fillin');
    else if (gameMode === 'spellingpolice') show('phase-spellingpolice');
    else if (gameMode === 'wordbuilder') show('phase-wordbuilder');
    else if (gameMode === 'sentence') show('phase-sentence');
    else if (gameMode === 'spellpick') show('phase-spellpick');
    else show('phase-test');
  }
  proceedAfterInterrupt();
}

function proceedAfterInterrupt() {
  var action = pendingInterruptAction;
  pendingInterruptAction = null;

  if (isMixedSession) {
    if (action === 'finish' || action === 'finish-final') {
      finishMixedTraining();
    } else {
      renderMixedItem();
    }
    return;
  }

  if (gameMode === 'fillin') {
    if (action === 'finish') {
      finishFillIn();
    } else {
      show('phase-fillin');
      renderFillInWord();
    }
    return;
  }

  if (gameMode === 'spellingpolice') {
    if (action === 'finish') {
      finishSpellingPolice();
    } else {
      show('phase-spellingpolice');
      renderSpellingPoliceWord();
    }
    return;
  }

  if (gameMode === 'wordbuilder') {
    if (action === 'finish') {
      finishWordBuilder();
    } else {
      show('phase-wordbuilder');
      renderWBWord();
    }
    return;
  }

  if (gameMode === 'spellpick') {
    if (action === 'finish') {
      finishSpellPick();
    } else {
      show('phase-spellpick');
      renderSpkWord();
    }
    return;
  }

  if (gameMode === 'sentence') {
    if (action === 'finish') {
      finishMixedTraining();
    } else {
      show('phase-sentence');
      renderSentenceWord();
    }
    return;
  }

  if (action === 'finish') {
    finishTest();
  } else {
    show('phase-test');
    renderWord();
  }
}

// ===== TREASURE CHESTS =====

var CHEST_REWARDS = {
  common:   { weight: 55, rewards: [
    { type: 'xp', amount: 20, text: '+20 XP', emoji: '\u2728' },
    { type: 'xp', amount: 30, text: '+30 XP', emoji: '\u2728' },
    { type: 'gems', amount: 3, text: '+3 Diamanter', emoji: '\uD83D\uDC8E' }
  ]},
  uncommon: { weight: 25, rewards: [
    { type: 'xp', amount: 50, text: '+50 XP', emoji: '\uD83D\uDCA5' },
    { type: 'gems', amount: 5, text: '+5 Diamanter', emoji: '\uD83D\uDC8E' },
    { type: 'combo', xp: 25, gems: 3, text: '+25 XP & +3 \uD83D\uDC8E', emoji: '\uD83C\uDF08' }
  ]},
  rare:     { weight: 13, rewards: [
    { type: 'xp', amount: 80, text: '+80 XP', emoji: '\uD83D\uDD25' },
    { type: 'gems', amount: 10, text: '+10 Diamanter', emoji: '\uD83D\uDC8E' }
  ]},
  epic:     { weight: 7, rewards: [
    { type: 'xp', amount: 150, text: '+150 XP!', emoji: '\uD83C\uDF1F' },
    { type: 'gems', amount: 15, text: '+15 Diamanter!', emoji: '\uD83D\uDC8E' },
    { type: 'combo', xp: 75, gems: 8, text: '+75 XP & +8 \uD83D\uDC8E', emoji: '\uD83C\uDF08' }
  ]}
};

var CHEST_RARITY_COLORS = {
  common: { border: '#8892b0', bg: 'rgba(136,146,176,0.1)', label: 'Almindelig' },
  uncommon: { border: '#22d3a0', bg: 'rgba(34,211,160,0.1)', label: 'Ualmindelig' },
  rare: { border: '#0ea5e9', bg: 'rgba(14,165,233,0.1)', label: 'Sj\u00E6lden' },
  epic: { border: '#a855f7', bg: 'rgba(168,85,247,0.15)', label: 'Episk' }
};

function rollChestReward() {
  var roll = Math.random() * 100;
  var cumulative = 0;
  var rarities = ['common', 'uncommon', 'rare', 'epic'];
  for (var i = 0; i < rarities.length; i++) {
    cumulative += CHEST_REWARDS[rarities[i]].weight;
    if (roll < cumulative) {
      var pool = CHEST_REWARDS[rarities[i]].rewards;
      return { rarity: rarities[i], reward: pool[Math.floor(Math.random() * pool.length)] };
    }
  }
  return { rarity: 'common', reward: CHEST_REWARDS.common.rewards[0] };
}

function showTreasureChest() {
  // Award 3 gems
  var data = loadRewardData();
  data.gems += 3;
  saveRewardData(data);
  updateRewardBar();

  var overlay = document.getElementById('chestOverlay');
  overlay.innerHTML = '<div class="chest-card" style="border-color:var(--accent);cursor:pointer" onclick="closeChest()">' +
    '<div style="font-size:2.5rem;margin-bottom:8px">\uD83D\uDC8E</div>' +
    '<div style="font-size:1.3rem;font-weight:800;color:var(--text)">+3 Diamanter</div>' +
    '<div style="font-size:0.85rem;color:var(--muted);margin-top:8px">Klik for at forts\u00E6tte</div>' +
    '</div>';
  overlay.classList.remove('hidden');
  pendingChest = false;
  document.addEventListener('keydown', chestKeyHandler);
}

function chestKeyHandler(e) {
  if (e.key === 'Enter') {
    document.removeEventListener('keydown', chestKeyHandler);
    closeChest();
  }
}

function closeChest() {
  document.removeEventListener('keydown', chestKeyHandler);
  document.getElementById('chestOverlay').classList.add('hidden');
  proceedAfterInterrupt();
}

// ===== AVATAR PROGRESSION =====

var AVATAR_LEVELS = [
  { minXP: 0,     image: 'images/animal_levels/level_1.png', title: 'Kylling', desc: 'Helt ny', titleStyle: 'color:var(--muted)' },
  { minXP: 30,    image: 'images/animal_levels/level_3.png', title: '\u00C6lling', desc: 'P\u00E5 vej', titleStyle: 'color:var(--muted)' },
  { minXP: 75,    image: 'images/animal_levels/level_2.png', title: 'Fr\u00F8', desc: 'F\u00F8rste hop', titleStyle: 'color:var(--text)' },
  { minXP: 150,   image: 'images/animal_levels/level_4.png', title: 'Egern', desc: 'Samler bogstaver', titleStyle: 'color:var(--text)' },
  { minXP: 250,   image: 'images/animal_levels/level_5.png', title: 'R\u00E6v', desc: 'Klar til eventyr', titleStyle: 'color:var(--text)' },
  { minXP: 400,   image: 'images/animal_levels/level_6.png', title: 'Professor R\u00E6v', desc: 'Bogstavklog', titleStyle: 'color:var(--green)' },
  { minXP: 600,   image: 'images/animal_levels/level_7.png', title: 'Detektiv', desc: 'Finder stavefejl', titleStyle: 'color:var(--green)' },
  { minXP: 850,   image: 'images/animal_levels/level_8.png', title: 'L\u00E6se-Pingvin', desc: 'Bogorm', titleStyle: 'color:var(--green)' },
  { minXP: 1150,  image: 'images/animal_levels/level_9.png', title: 'Ugle', desc: 'Vis og klog', titleStyle: 'color:var(--blue)' },
  { minXP: 1500,  image: 'images/animal_levels/level_10.png', title: 'Bog-Kat', desc: 'L\u00E6rd', titleStyle: 'color:var(--blue)' },
  { minXP: 1900,  image: 'images/animal_levels/level_12.png', title: 'Spor-Hund', desc: 'P\u00E5 sporet', titleStyle: 'color:var(--blue)' },
  { minXP: 2400,  image: 'images/animal_levels/level_13.png', title: 'Agent Ulv', desc: 'Ordagent', titleStyle: 'color:var(--accent2)' },
  { minXP: 3000,  image: 'images/animal_levels/level_14.png', title: 'Viking', desc: 'Stavekriger', titleStyle: 'color:var(--accent2)' },
  { minXP: 3700,  image: 'images/animal_levels/level_15.png', title: 'Viking-H\u00F8vding', desc: 'Anf\u00F8rer', titleStyle: 'color:var(--accent2)' },
  { minXP: 4500,  image: 'images/animal_levels/level_16.png', title: 'Troldmand', desc: 'Stavemagi', titleStyle: 'color:#7c3aed' },
  { minXP: 5400,  image: 'images/animal_levels/level_17.png', title: 'L\u00F8ve-Kongen', desc: 'Majest\u00E6tisk', titleStyle: 'color:#f97316' },
  { minXP: 6500,  image: 'images/animal_levels/level_18.png', title: 'Reporter', desc: 'Ordj\u00E6ger', titleStyle: 'color:#f97316' },
  { minXP: 7700,  image: 'images/animal_levels/level_19.png', title: 'Rensdyr', desc: 'Vinterklar', titleStyle: 'color:#f97316' },
  { minXP: 9000,  image: 'images/animal_levels/level_20.png', title: 'Super-R\u00E6v', desc: 'Bogstavhelt', titleStyle: 'color:var(--red)' },
  { minXP: 10500, image: 'images/animal_levels/level_21.png', title: 'Panda', desc: 'Kalligraf', titleStyle: 'color:var(--red)' },
  { minXP: 12000, image: 'images/animal_levels/level_22.png', title: 'Pingvin i Smoking', desc: 'Elegant', titleStyle: 'color:var(--red)' },
  { minXP: 13700, image: 'images/animal_levels/level_23.png', title: 'Professor Koala', desc: 'Forsker', titleStyle: 'background:linear-gradient(135deg,#22d3a0,#0ea5e9);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text' },
  { minXP: 15500, image: 'images/animal_levels/level_24.png', title: 'Vandre-Kat', desc: 'Eventyrer', titleStyle: 'background:linear-gradient(135deg,#22d3a0,#0ea5e9);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text' },
  { minXP: 17500, image: 'images/animal_levels/level_25.png', title: 'Astronaut', desc: 'Stjernestaver', titleStyle: 'background:linear-gradient(135deg,#0ea5e9,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text' },
  { minXP: 19500, image: 'images/animal_levels/level_26.png', title: 'Tiger-Samurai', desc: 'Sværdmester', titleStyle: 'background:linear-gradient(135deg,#f97316,#f43f5e);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text' },
  { minXP: 22000, image: 'images/animal_levels/level_27.png', title: 'Opdageren', desc: 'Skattesamler', titleStyle: 'background:linear-gradient(135deg,#f5a623,#f97316);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text' },
  { minXP: 25000, image: 'images/animal_levels/level_28.png', title: 'Vismand', desc: 'Ordenes vogter', titleStyle: 'background:linear-gradient(135deg,#7c3aed,#f5a623);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text' },
  { minXP: 28000, image: 'images/animal_levels/level_29.png', title: 'Elefant-Kejser', desc: 'Hersker', titleStyle: 'background:linear-gradient(135deg,#f43f5e,#f5a623);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text' },
  { minXP: 32000, image: 'images/animal_levels/level_30.png', title: 'R\u00E6ve-Kongen', desc: 'Den Legendariske', titleStyle: 'background:linear-gradient(90deg,#f43f5e,#f5a623,#22d3a0,#0ea5e9,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text' }
];

function getAvatarLevel(totalXP) {
  var level = AVATAR_LEVELS[0];
  var idx = 0;
  for (var i = AVATAR_LEVELS.length - 1; i >= 0; i--) {
    if (totalXP >= AVATAR_LEVELS[i].minXP) {
      level = AVATAR_LEVELS[i];
      idx = i;
      break;
    }
  }
  var nextLevel = idx < AVATAR_LEVELS.length - 1 ? AVATAR_LEVELS[idx + 1] : null;
  var progress = nextLevel ? (totalXP - level.minXP) / (nextLevel.minXP - level.minXP) : 1;
  return { emoji: level.emoji, title: level.title, desc: level.desc, titleStyle: level.titleStyle || '', index: idx, progress: progress, nextXP: nextLevel ? nextLevel.minXP : null, currentXP: totalXP };
}

function getCurrentAvatarImg(cssClass) {
  var data = loadRewardData();
  var idx = data.displayedLevel || 0;
  var lvl = AVATAR_LEVELS[idx] || AVATAR_LEVELS[0];
  if (lvl.image) return '<img src="' + lvl.image + '" class="' + (cssClass || '') + '">';
  return '<span class="' + (cssClass || '') + '">' + (lvl.emoji || '\u{1F98A}') + '</span>';
}

function updateWelcomeAvatar() {
  var data = loadRewardData();
  var displayedIdx = data.displayedLevel || 0;
  var displayedLevel = AVATAR_LEVELS[displayedIdx] || AVATAR_LEVELS[0];
  var actualLevel = getAvatarLevel(data.totalXP || 0);
  var canLevelUp = actualLevel.index > displayedIdx;

  // Show the displayed level (not the actual earned one)
  var el = document.getElementById('avatarEmoji');
  if (el) {
    if (displayedLevel.image) {
      el.innerHTML = '<img src="' + displayedLevel.image + '" alt="' + displayedLevel.title + '" style="width:6rem;height:6rem;object-fit:contain">';
    } else {
      el.textContent = displayedLevel.emoji;
    }
  }
  var titleEl = document.getElementById('avatarTitle');
  if (titleEl) {
    titleEl.textContent = displayedLevel.title;
    titleEl.setAttribute('style', 'font-family:Fredoka One,cursive;font-size:1.3rem;margin-top:4px;' + (displayedLevel.titleStyle || ''));
    titleEl.classList.remove('hidden');
  }
  var descEl = document.getElementById('avatarDesc');
  if (descEl) descEl.textContent = displayedLevel.desc;

  // Progress bar shows XP toward next level-up
  var nextIdx = displayedIdx + 1;
  var nextLevel = nextIdx < AVATAR_LEVELS.length ? AVATAR_LEVELS[nextIdx] : null;
  var bar = document.getElementById('avatarProgressBar');
  var label = document.getElementById('avatarProgressLabel');
  if (bar && label) {
    if (canLevelUp) {
      bar.style.width = '100%';
      label.textContent = '\u2B50 Klar til level up!';
      label.style.color = 'var(--accent)';
    } else if (nextLevel) {
      var progress = (data.totalXP - displayedLevel.minXP) / (nextLevel.minXP - displayedLevel.minXP);
      bar.style.width = Math.min(progress * 100, 100) + '%';
      label.textContent = (data.totalXP || 0) + ' / ' + nextLevel.minXP + ' XP';
      label.style.color = 'var(--muted)';
    } else {
      bar.style.width = '100%';
      label.textContent = 'Maksimalt niveau! ' + (data.totalXP || 0) + ' XP';
      label.style.color = 'var(--green)';
    }
  }

  // Gems display
  var gemsEl = document.getElementById('welcomeGemsDisplay');
  if (gemsEl) gemsEl.innerHTML = '\u{1F48E} ' + (data.gems || 0);

  // Level Up button
  var btn = document.getElementById('levelUpBtn');
  if (btn) {
    if (canLevelUp) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
  }
}

function doLevelUp() {
  var data = loadRewardData();
  var oldIdx = data.displayedLevel || 0;
  var actualLevel = getAvatarLevel(data.totalXP || 0);
  var newIdx = oldIdx + 1; // level up one step at a time
  if (newIdx > actualLevel.index) return;
  var oldLevel = AVATAR_LEVELS[oldIdx];
  var newLevel = AVATAR_LEVELS[newIdx];

  // Hide level up button during animation
  var btn = document.getElementById('levelUpBtn');
  if (btn) btn.classList.add('hidden');

  var emojiEl = document.getElementById('avatarEmoji');
  var titleEl = document.getElementById('avatarTitle');
  var descEl = document.getElementById('avatarDesc');
  var section = document.getElementById('welcomeAvatarSection');

  // Phase 1: Old avatar shakes and disappears
  emojiEl.style.animation = 'levelup-shake 1s ease forwards';

  // Spawn sparkles around the avatar
  var sparkles = ['\u2728', '\u{1F31F}', '\u{1F4AB}', '\u26A1', '\u{1F525}'];
  for (var si = 0; si < 8; si++) {
    var spark = document.createElement('div');
    spark.className = 'levelup-sparkle';
    spark.textContent = sparkles[si % sparkles.length];
    spark.style.setProperty('--tx', (Math.random() * 120 - 60) + 'px');
    spark.style.setProperty('--ty', (Math.random() * 120 - 60) + 'px');
    spark.style.left = '50%';
    spark.style.top = '50%';
    section.style.position = 'relative';
    section.appendChild(spark);
    setTimeout(function(s) { return function() { if (s.parentNode) s.parentNode.removeChild(s); }; }(spark), 1000);
  }

  // Phase 2: New avatar appears
  setTimeout(function() {
    if (newLevel.image) {
      emojiEl.innerHTML = '<img src="' + newLevel.image + '" alt="' + newLevel.title + '" style="width:6rem;height:6rem;object-fit:contain">';
    } else {
      emojiEl.textContent = newLevel.emoji;
    }
    emojiEl.style.animation = 'levelup-appear 0.8s ease forwards';

    titleEl.textContent = newLevel.title;
    titleEl.setAttribute('style', 'font-family:Fredoka One,cursive;font-size:1.3rem;margin-top:4px;' + (newLevel.titleStyle || ''));
    descEl.textContent = newLevel.desc;

    // More sparkles!
    for (var si2 = 0; si2 < 10; si2++) {
      var spark2 = document.createElement('div');
      spark2.className = 'levelup-sparkle';
      spark2.textContent = sparkles[si2 % sparkles.length];
      spark2.style.setProperty('--tx', (Math.random() * 160 - 80) + 'px');
      spark2.style.setProperty('--ty', (Math.random() * 160 - 80) + 'px');
      spark2.style.left = '50%';
      spark2.style.top = '50%';
      section.appendChild(spark2);
      setTimeout(function(s) { return function() { if (s.parentNode) s.parentNode.removeChild(s); }; }(spark2), 1200);
    }
  }, 1000);

  // Phase 3: Save and update
  setTimeout(function() {
    emojiEl.style.animation = '';
    data.displayedLevel = newIdx;
    saveRewardData(data);
    updateWelcomeAvatar(); // refresh bar and check if more level-ups available
  }, 2000);
}

// Legacy — no longer auto-shows, kept for compatibility
function showLevelUpPopup(newLevel) {
  // Level-ups are now manual via the Level Up button on welcome screen
}

// ===== SCREENING (Stavevurdering) =====

var NONORD_ITEMS = [
  { text: "n\u00F8f", correct: "n\u00F8f", options: ["n\u00F8f", "n\u00F8ff", "n\u00F8v", "n\u00F8vf", "n\u00F8fv"] },
  { text: "blek", correct: "blek", options: ["blek", "bl\u00E6k", "bl\u00E6g", "bleg", "bleck"] },
  { text: "sp\u00F8l", correct: "sp\u00F8l", options: ["sp\u00F8l", "sp\u00F8ll", "sp\u00F8le", "sb\u00F8l", "sp\u00F8hl"] },
  { text: "kr\u00E5n", correct: "kr\u00E5n", options: ["kr\u00E5n", "kron", "gr\u00E5n", "krohn", "kronn"] },
  { text: "hvirm", correct: "hvirm", options: ["hvirm", "virm", "hverm", "hvirmm", "hirm"] },
  { text: "gj\u00E6p", correct: "gj\u00E6p", options: ["gj\u00E6p", "j\u00E6p", "g\u00E6p", "gjep", "gj\u00E6b"] },
  { text: "fn\u00F8s", correct: "fn\u00F8s", options: ["fn\u00F8s", "fn\u00F8ss", "fn\u00F8se", "fn\u00F8hs", "fny\u00F8s"] },
  { text: "tv\u00E5l", correct: "tv\u00E5l", options: ["tv\u00E5l", "tvo\u00E5l", "tv\u00E5ll", "dv\u00E5l", "tvol"] },
  { text: "sn\u00E6lk", correct: "sn\u00E6lk", options: ["sn\u00E6lk", "snelk", "sn\u00E6lg", "sn\u00E6ld", "sn\u00E6lck"] },
  { text: "pl\u00E5m", correct: "pl\u00E5m", options: ["pl\u00E5m", "plom", "pl\u00E5mm", "bl\u00E5m", "plohm"] },
  { text: "dr\u00F8jf", correct: "dr\u00F8jf", options: ["dr\u00F8jf", "dr\u00F8jv", "dr\u00F8if", "dr\u00F8jff", "dr\u00F8jfv"] },
  { text: "skr\u00F8n", correct: "skr\u00F8n", options: ["skr\u00F8n", "skr\u00F8nn", "sgr\u00F8n", "skr\u00F8hn", "skr\u00F6n"] }
];

var FONOLOGISK_ITEMS = [
  { type: "rim", instruction: "Hvilket ord rimer p\u00E5", target: "kat", correct: "hat", options: ["hat", "kap", "kas", "kar"] },
  { type: "rim", instruction: "Hvilket ord rimer p\u00E5", target: "bold", correct: "told", options: ["told", "bolle", "bukke", "bord"] },
  { type: "rim", instruction: "Hvilket ord rimer p\u00E5", target: "hest", correct: "rest", options: ["rest", "helt", "heks", "fest"] },
  { type: "rim", instruction: "Hvilket ord rimer p\u00E5", target: "sol", correct: "stol", options: ["stol", "sod", "som", "sog"] },
  { type: "fjern", instruction: "Hvad bliver 'stol' uden 's'-lyden?", correct: "tol", options: ["tol", "sol", "sto", "stel"] },
  { type: "fjern", instruction: "Hvad bliver 'bleg' uden 'b'-lyden?", correct: "leg", options: ["leg", "beg", "ble", "bl\u00E6g"] },
  { type: "fjern", instruction: "Hvad bliver 'skab' uden 's'-lyden?", correct: "kab", options: ["kab", "sab", "ska", "skab"] },
  { type: "lyd", instruction: "Hvilken lyd starter ordet 'blomst' med?", correct: "b", options: ["b", "bl", "m", "l"] },
  { type: "lyd", instruction: "Hvilken lyd starter ordet 'pris' med?", correct: "p", options: ["p", "r", "pr", "s"] },
  { type: "lyd", instruction: "Hvilken lyd starter ordet 'glas' med?", correct: "g", options: ["g", "l", "gl", "s"] }
];

var ORDKAEDER_ITEMS = [
  { chain: "hunkatbil", words: ["hun", "kat", "bil"] },
  { chain: "solskohat", words: ["sol", "sko", "hat"] },
  { chain: "benarm\u00F8re", words: ["ben", "arm", "\u00F8re"] },
  { chain: "husboldbog", words: ["hus", "bold", "bog"] },
  { chain: "vindstolris", words: ["vind", "stol", "ris"] },
  { chain: "blomstfuglregn", words: ["blomst", "fugl", "regn"] },
  { chain: "d\u00F8rlampesol", words: ["d\u00F8r", "lampe", "sol"] },
  { chain: "skoletidbus", words: ["skole", "tid", "bus"] },
  { chain: "vandflaskeis", words: ["vand", "flaske", "is"] },
  { chain: "hovedpudesen", words: ["hoved", "pude", "sen"] }
];

var RAN_COLORS = [
  { name: "r\u00F8d", color: "#ef4444" },
  { name: "bl\u00E5", color: "#3b82f6" },
  { name: "gr\u00F8n", color: "#22c55e" },
  { name: "gul", color: "#eab308" },
  { name: "sort", color: "#374151" }
];

var screeningState = null;
var ranTimerInterval = null;
var ranStartTime = null;

function startScreening() {
  screeningState = {
    currentSubtest: 'nonord',
    subtestIndex: 0,
    results: { nonord: [], fonologisk: [], ordkaeder: [], ran: null },
    startedAt: Date.now()
  };
  hide('phase-welcome');
  show('phase-screening-intro');
}

function beginScreeningSubtest(subtest) {
  if (!screeningState) return;
  screeningState.currentSubtest = subtest;
  screeningState.subtestIndex = 0;

  if (subtest === 'ran') {
    hide('phase-screening-intro');
    hide('phase-screening-test');
    startRAN();
    return;
  }

  hide('phase-screening-intro');
  hide('phase-screening-ran');
  show('phase-screening-test');

  if (subtest === 'nonord') {
    document.getElementById('screeningTestLabel').textContent = '\u{1F4CB} Nonord';
    renderNonordItem(0);
  } else if (subtest === 'fonologisk') {
    document.getElementById('screeningTestLabel').textContent = '\u{1F4CB} Fonologisk bevidsthed';
    renderFonologiskItem(0);
  } else if (subtest === 'ordkaeder') {
    document.getElementById('screeningTestLabel').textContent = '\u{1F4CB} Ordk\u00E6der';
    renderOrdkaederItem(0);
  }
}

function showScreeningTransition(message, nextSubtest) {
  var area = document.getElementById('screeningQuestionArea');
  area.innerHTML = '<div style="text-align:center;padding:40px 20px">' +
    '<div style="font-size:3rem;margin-bottom:14px">\u{1F31F}</div>' +
    '<h2 style="color:var(--green);margin-bottom:8px">' + message + '</h2>' +
    '<p style="color:var(--muted)">N\u00E6ste opgave starter om et \u00F8jeblik...</p>' +
    '</div>';
  setTimeout(function() {
    beginScreeningSubtest(nextSubtest);
  }, 2000);
}

function updateScreeningProgress(subtest, index) {
  var subtestNum = 1;
  var subtestNames = { nonord: 1, fonologisk: 2, ordkaeder: 3, ran: 4 };
  subtestNum = subtestNames[subtest] || 1;
  var total = 4;
  var items = 0;
  var itemTotal = 0;
  if (subtest === 'nonord') { items = index; itemTotal = NONORD_ITEMS.length; }
  else if (subtest === 'fonologisk') { items = index; itemTotal = FONOLOGISK_ITEMS.length; }
  else if (subtest === 'ordkaeder') { items = index; itemTotal = ORDKAEDER_ITEMS.length; }

  var label = document.getElementById('screeningSubtestLabel');
  if (label) label.textContent = 'Opgave ' + subtestNum + ' af ' + total + ' \u2014 ' + (index + 1) + '/' + itemTotal;

  var fill = document.getElementById('screeningProgressFill');
  if (fill) {
    var basePct = ((subtestNum - 1) / total) * 100;
    var subPct = itemTotal > 0 ? ((index / itemTotal) * (100 / total)) : 0;
    fill.style.width = Math.min(basePct + subPct, 100) + '%';
  }
}

function renderNonordItem(index) {
  screeningState.subtestIndex = index;
  if (index >= NONORD_ITEMS.length) {
    showScreeningTransition('Godt klaret!', 'fonologisk');
    return;
  }
  updateScreeningProgress('nonord', index);
  var item = NONORD_ITEMS[index];
  var opts = shuffle(item.options);

  var html = '<div style="text-align:center;margin-bottom:12px">' +
    '<p class="screening-question">Lyt til ordet og v\u00E6lg den rigtige stavem\u00E5de</p>' +
    '<button class="btn-listen" onclick="speakWord(\'' + item.text.replace(/'/g, "\\'") + '\', null)">\u{1F50A} H\u00F8r ordet</button>' +
    '</div>';
  html += '<div class="screening-options-grid">';
  for (var i = 0; i < opts.length; i++) {
    html += '<button class="screening-option" onclick="checkNonordAnswer(this, ' + index + ', \'' + opts[i].replace(/'/g, "\\'") + '\')">' + opts[i] + '</button>';
  }
  html += '</div>';

  document.getElementById('screeningQuestionArea').innerHTML = html;
  setTimeout(function() { speakWord(item.text, null); }, 300);
}

function checkNonordAnswer(btn, index, answer) {
  var item = NONORD_ITEMS[index];
  var isCorrect = answer === item.correct;
  screeningState.results.nonord.push({ correct: isCorrect, item: item.text, answer: answer });

  var btns = document.querySelectorAll('#screeningQuestionArea .screening-option');
  for (var i = 0; i < btns.length; i++) {
    btns[i].onclick = null;
    btns[i].style.pointerEvents = 'none';
    if (btns[i].textContent === item.correct) btns[i].classList.add('correct');
    else if (btns[i] === btn && !isCorrect) btns[i].classList.add('wrong');
  }

  setTimeout(function() { renderNonordItem(index + 1); }, 1200);
}

function renderFonologiskItem(index) {
  screeningState.subtestIndex = index;
  if (index >= FONOLOGISK_ITEMS.length) {
    showScreeningTransition('Flot gjort!', 'ordkaeder');
    return;
  }
  updateScreeningProgress('fonologisk', index);
  var item = FONOLOGISK_ITEMS[index];
  var opts = shuffle(item.options);

  var questionText = '';
  if (item.type === 'rim') {
    questionText = '<p class="screening-question">' + item.instruction + ' <span class="target-word">' + item.target + '</span>?</p>';
  } else {
    questionText = '<p class="screening-question">' + item.instruction + '</p>';
  }

  var html = questionText;
  html += '<div class="screening-options-grid">';
  for (var i = 0; i < opts.length; i++) {
    html += '<button class="screening-option" onclick="checkFonologiskAnswer(this, ' + index + ', \'' + opts[i].replace(/'/g, "\\'") + '\')">' + opts[i] + '</button>';
  }
  html += '</div>';

  document.getElementById('screeningQuestionArea').innerHTML = html;
}

function checkFonologiskAnswer(btn, index, answer) {
  var item = FONOLOGISK_ITEMS[index];
  var isCorrect = answer === item.correct;
  screeningState.results.fonologisk.push({ correct: isCorrect, item: item.instruction, answer: answer });

  var btns = document.querySelectorAll('#screeningQuestionArea .screening-option');
  for (var i = 0; i < btns.length; i++) {
    btns[i].onclick = null;
    btns[i].style.pointerEvents = 'none';
    if (btns[i].textContent === item.correct) btns[i].classList.add('correct');
    else if (btns[i] === btn && !isCorrect) btns[i].classList.add('wrong');
  }

  setTimeout(function() { renderFonologiskItem(index + 1); }, 1200);
}

function renderOrdkaederItem(index) {
  screeningState.subtestIndex = index;
  if (index >= ORDKAEDER_ITEMS.length) {
    showScreeningTransition('Superflot!', 'ran');
    return;
  }
  updateScreeningProgress('ordkaeder', index);
  var item = ORDKAEDER_ITEMS[index];
  var letters = item.chain.split('');

  var html = '<p class="screening-question">Find de 3 ord der er sat sammen. Tryk mellem bogstaverne for at s\u00E6tte en skillelinje.</p>';
  html += '<div class="chain-container" id="chainContainer">';
  for (var i = 0; i < letters.length; i++) {
    html += '<span class="chain-letter">' + letters[i] + '</span>';
    if (i < letters.length - 1) {
      html += '<span class="chain-gap" data-pos="' + (i + 1) + '" onclick="toggleChainGap(this)"></span>';
    }
  }
  html += '</div>';
  html += '<p style="text-align:center;color:var(--muted);font-size:0.85rem;margin-bottom:12px" id="chainHint">Placer 2 skillelinjer for at dele k\u00E6den i 3 ord</p>';
  html += '<div style="text-align:center"><button class="btn btn-primary" onclick="checkOrdkaede(' + index + ')">\u2714\uFE0F Tjek</button></div>';

  document.getElementById('screeningQuestionArea').innerHTML = html;
}

function toggleChainGap(el) {
  var activeGaps = document.querySelectorAll('.chain-gap.active');
  if (el.classList.contains('active')) {
    el.classList.remove('active');
  } else {
    if (activeGaps.length >= 2) return;
    el.classList.add('active');
  }
  var count = document.querySelectorAll('.chain-gap.active').length;
  var hint = document.getElementById('chainHint');
  if (hint) {
    if (count === 0) hint.textContent = 'Placer 2 skillelinjer for at dele k\u00E6den i 3 ord';
    else if (count === 1) hint.textContent = 'Placer 1 skillelinje mere';
    else hint.textContent = 'Tryk Tjek n\u00E5r du er klar!';
  }
}

function checkOrdkaede(index) {
  var item = ORDKAEDER_ITEMS[index];
  var activeGaps = document.querySelectorAll('.chain-gap.active');
  if (activeGaps.length !== 2) return;

  var positions = [];
  for (var i = 0; i < activeGaps.length; i++) {
    positions.push(parseInt(activeGaps[i].getAttribute('data-pos')));
  }
  positions.sort(function(a, b) { return a - b; });

  // Compute correct positions from words
  var correctPositions = [];
  var pos = 0;
  for (var w = 0; w < item.words.length - 1; w++) {
    pos += item.words[w].length;
    correctPositions.push(pos);
  }

  var isCorrect = positions.length === correctPositions.length &&
    positions[0] === correctPositions[0] && positions[1] === correctPositions[1];

  screeningState.results.ordkaeder.push({ correct: isCorrect, chain: item.chain, positions: positions, correctPositions: correctPositions });

  // Show feedback on gaps
  var allGaps = document.querySelectorAll('.chain-gap');
  for (var g = 0; g < allGaps.length; g++) {
    allGaps[g].onclick = null;
    allGaps[g].style.pointerEvents = 'none';
    var gapPos = parseInt(allGaps[g].getAttribute('data-pos'));
    if (correctPositions.indexOf(gapPos) !== -1) {
      allGaps[g].classList.add('active');
      allGaps[g].classList.add('gap-correct');
    } else if (allGaps[g].classList.contains('active')) {
      allGaps[g].classList.add('gap-wrong');
    }
  }

  // Disable check button
  var checkBtns = document.querySelectorAll('#screeningQuestionArea .btn');
  for (var b = 0; b < checkBtns.length; b++) {
    checkBtns[b].onclick = null;
    checkBtns[b].style.pointerEvents = 'none';
  }

  var hint = document.getElementById('chainHint');
  if (hint) {
    if (isCorrect) hint.innerHTML = '<span style="color:var(--green)">\u2705 Rigtigt! ' + item.words.join(' | ') + '</span>';
    else hint.innerHTML = '<span style="color:var(--red)">\u274C Svaret var: ' + item.words.join(' | ') + '</span>';
  }

  setTimeout(function() { renderOrdkaederItem(index + 1); }, 1500);
}

function buildRANGrid() {
  var grid = [];
  for (var i = 0; i < 40; i++) {
    grid.push(RAN_COLORS[i % RAN_COLORS.length]);
  }
  // Shuffle
  for (var j = grid.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = grid[j]; grid[j] = grid[k]; grid[k] = tmp;
  }
  return grid;
}

function startRAN() {
  hide('phase-screening-test');
  show('phase-screening-ran');

  var grid = buildRANGrid();
  var html = '<div class="ran-grid">';
  for (var i = 0; i < grid.length; i++) {
    html += '<div class="ran-cell" style="background:' + grid[i].color + '" title="' + grid[i].name + '"></div>';
  }
  html += '</div>';
  document.getElementById('ranGridArea').innerHTML = html;
  document.getElementById('ranTimer').textContent = '0.0s';
  document.getElementById('ranStartBtn').classList.remove('hidden');
  document.getElementById('ranStopBtn').classList.add('hidden');
  ranStartTime = null;
  if (ranTimerInterval) clearInterval(ranTimerInterval);
}

function startRANTimer() {
  ranStartTime = Date.now();
  document.getElementById('ranStartBtn').classList.add('hidden');
  document.getElementById('ranStopBtn').classList.remove('hidden');
  ranTimerInterval = setInterval(function() {
    var elapsed = (Date.now() - ranStartTime) / 1000;
    document.getElementById('ranTimer').textContent = elapsed.toFixed(1) + 's';
  }, 100);
}

function stopRANTimer() {
  if (ranTimerInterval) clearInterval(ranTimerInterval);
  var elapsed = ranStartTime ? (Date.now() - ranStartTime) / 1000 : 0;
  document.getElementById('ranTimer').textContent = elapsed.toFixed(1) + 's';
  document.getElementById('ranStopBtn').classList.add('hidden');
  screeningState.results.ran = { time: elapsed };
  setTimeout(function() { finishScreening(); }, 800);
}

function analyzePassiveData() {
  var score = 50; // default middle score
  try {
    var sr = loadSRData();
    var profile = loadProfile();
    var totalWords = 0;
    var totalErrors = 0;
    var phonologicalErrors = 0;

    if (sr && sr.words) {
      for (var word in sr.words) {
        totalWords++;
        if (sr.words[word].level === 0) totalErrors++;
      }
    }


    if (totalWords === 0) return 50;

    var errorRate = totalErrors / totalWords;
    score = Math.max(0, Math.min(100, Math.round((1 - errorRate) * 100)));

    // Phonological errors are a stronger indicator
    if (phonologicalErrors > 2) {
      score = Math.max(0, score - 15);
    }
  } catch(e) {
    score = 50;
  }
  return score;
}

function computeScreeningRisk(results, passiveScore) {
  // Nonord score (0-100)
  var nonordCorrect = 0;
  for (var i = 0; i < results.nonord.length; i++) {
    if (results.nonord[i].correct) nonordCorrect++;
  }
  var nonordScore = results.nonord.length > 0 ? (nonordCorrect / results.nonord.length) * 100 : 50;

  // Fonologisk score (0-100)
  var fonCorrect = 0;
  for (var j = 0; j < results.fonologisk.length; j++) {
    if (results.fonologisk[j].correct) fonCorrect++;
  }
  var fonScore = results.fonologisk.length > 0 ? (fonCorrect / results.fonologisk.length) * 100 : 50;

  // Ordkaeder score (0-100)
  var ordCorrect = 0;
  for (var k = 0; k < results.ordkaeder.length; k++) {
    if (results.ordkaeder[k].correct) ordCorrect++;
  }
  var ordScore = results.ordkaeder.length > 0 ? (ordCorrect / results.ordkaeder.length) * 100 : 50;

  // RAN score (0-100) - normalized by grade
  var ranScore = 50;
  if (results.ran && results.ran.time > 0) {
    var grade = loadGrade();
    var expectedTime = 40; // default
    if (grade <= 1) expectedTime = 60;
    else if (grade <= 3) expectedTime = 45;
    else if (grade <= 5) expectedTime = 35;
    else expectedTime = 28;

    if (results.ran.time <= expectedTime) {
      ranScore = 80 + Math.min(20, (expectedTime - results.ran.time) / expectedTime * 40);
    } else {
      ranScore = Math.max(0, 80 - ((results.ran.time - expectedTime) / expectedTime) * 80);
    }
  }

  // Weighted composite
  var composite = nonordScore * 0.35 + fonScore * 0.25 + ordScore * 0.20 + ranScore * 0.10 + passiveScore * 0.10;
  composite = Math.round(composite);

  var riskLevel = 'lav';
  if (composite < 45) riskLevel = 'hoej';
  else if (composite < 70) riskLevel = 'mellem';

  return {
    composite: composite,
    riskLevel: riskLevel,
    nonordScore: Math.round(nonordScore),
    fonScore: Math.round(fonScore),
    ordScore: Math.round(ordScore),
    ranScore: Math.round(ranScore),
    passiveScore: passiveScore
  };
}

function finishScreening() {
  hide('phase-screening-test');
  hide('phase-screening-ran');

  var passiveScore = analyzePassiveData();
  var risk = computeScreeningRisk(screeningState.results, passiveScore);

  renderScreeningResults(screeningState.results, risk);

  var data = {
    date: Date.now(),
    results: screeningState.results,
    risk: risk
  };
  saveScreeningData(data);
}

function renderScreeningResults(results, risk) {
  show('phase-screening-results');

  var riskClass = 'risk-low';
  var riskLabel = 'Lav risiko';
  var riskEmoji = '\u2705';
  if (risk.riskLevel === 'mellem') {
    riskClass = 'risk-medium';
    riskLabel = 'Moderat risiko';
    riskEmoji = '\u26A0\uFE0F';
  } else if (risk.riskLevel === 'hoej') {
    riskClass = 'risk-high';
    riskLabel = 'Forh\u00F8jet risiko';
    riskEmoji = '\u26A0\uFE0F';
  }

  var html = '';

  // Traffic light
  html += '<div class="risk-indicator ' + riskClass + '">';
  html += '<div class="risk-light"></div>';
  html += '<div><div class="risk-text">' + riskEmoji + ' ' + riskLabel + '</div>';
  html += '<div style="font-size:0.85rem;color:var(--muted);margin-top:4px">Samlet score: ' + risk.composite + '/100</div>';
  html += '</div></div>';

  // Per-subtest breakdown
  html += '<h2 style="margin:18px 0 12px;font-size:1.1rem">Delresultater</h2>';

  var subtests = [
    { name: 'Nonord (lyd-til-bogstav)', score: risk.nonordScore, weight: '35%', icon: '\u{1F50A}' },
    { name: 'Fonologisk bevidsthed', score: risk.fonScore, weight: '25%', icon: '\u{1F3B5}' },
    { name: 'Ordk\u00E6der', score: risk.ordScore, weight: '20%', icon: '\u{1F517}' },
    { name: 'Hurtig navngivning (RAN)', score: risk.ranScore, weight: '10%', icon: '\u{1F3A8}' },
    { name: 'Passiv analyse', score: risk.passiveScore, weight: '10%', icon: '\u{1F4CA}' }
  ];

  for (var i = 0; i < subtests.length; i++) {
    var st = subtests[i];
    var barColor = 'var(--green)';
    if (st.score < 45) barColor = 'var(--red)';
    else if (st.score < 70) barColor = 'var(--accent)';

    html += '<div class="screening-subtest-bar">';
    html += '<div style="font-size:1.1rem">' + st.icon + '</div>';
    html += '<div class="stb-name">' + st.name + ' <span style="font-size:0.72rem;color:var(--muted)">(' + st.weight + ')</span></div>';
    html += '<div class="stb-bar"><div class="stb-bar-fill" style="width:' + st.score + '%;background:' + barColor + '"></div></div>';
    html += '<div class="stb-score" style="color:' + barColor + '">' + st.score + '%</div>';
    html += '</div>';
  }

  // RAN time
  if (results.ran) {
    html += '<p style="text-align:center;color:var(--muted);font-size:0.88rem;margin:8px 0">RAN-tid: ' + results.ran.time.toFixed(1) + ' sekunder</p>';
  }

  // Detail counts
  var nonordCorrect = results.nonord.filter(function(r) { return r.correct; }).length;
  var fonCorrect = results.fonologisk.filter(function(r) { return r.correct; }).length;
  var ordCorrect = results.ordkaeder.filter(function(r) { return r.correct; }).length;

  html += '<div class="score-row" style="margin-top:14px">';
  html += '<div class="score-box"><div class="num num-green">' + nonordCorrect + '/' + results.nonord.length + '</div><div class="lbl">Nonord</div></div>';
  html += '<div class="score-box"><div class="num num-green">' + fonCorrect + '/' + results.fonologisk.length + '</div><div class="lbl">Fonologisk</div></div>';
  html += '<div class="score-box"><div class="num num-green">' + ordCorrect + '/' + results.ordkaeder.length + '</div><div class="lbl">Ordk\u00E6der</div></div>';
  html += '</div>';

  // Disclaimer
  html += '<div class="disclaimer-box">';
  html += '<strong>VIGTIGT:</strong> Denne stavevurdering er IKKE en diagnose for ordblindhed. ';
  html += 'Den kan kun vise tegn p\u00E5 stavevanskeligheder. ';
  html += 'Kun en professionel test hos PPR eller en l\u00E6sevejleder kan fastsl\u00E5 om der er tale om ordblindhed. ';
  html += 'Tal med din l\u00E6rer eller for\u00E6ldre hvis du er bekymret.';
  html += '</div>';

  // Action buttons
  html += '<hr class="divider">';
  html += '<button class="btn btn-accent btn-full" onclick="goHome()">🏠 Hjem</button>';

  document.getElementById('screeningResultsContent').innerHTML = html;
}

function saveScreeningData(data) {
  try { localStorage.setItem(playerKey('screening_data'), JSON.stringify(data)); } catch(e) {}
}

function loadScreeningData() {
  try { var raw = localStorage.getItem(playerKey('screening_data')); return raw ? JSON.parse(raw) : null; } catch(e) { return null; }
}

// ===== FILL-IN EXERCISE =====

// Generate blanking data for a word based on its category and patternHint
function generateBlanks(wordObj) {
  var word = wordObj.word;
  var cat = wordObj.category;
  var hint = wordObj.patternHint || '';

  // --- Stumme bogstaver ---
  if (cat === 'Stumme bogstaver') {
    // Parse "stumt 'X' i 'YZ'" pattern
    var stmMatch = hint.match(/stumt '(\w+)' i '(\w+)'/);
    if (stmMatch) {
      var silentLetter = stmMatch[1]; // e.g. 'h'
      var cluster = stmMatch[2]; // e.g. 'hv', 'hj'
      var pos = word.toLowerCase().indexOf(cluster.toLowerCase());
      if (pos >= 0) {
        var blankPos = pos; // the silent letter is first in the cluster
        return {
          word: word,
          blankStart: blankPos,
          blankLen: silentLetter.length,
          correct: silentLetter.toLowerCase(),
          options: shuffle([silentLetter.toLowerCase(), '']),
          explanation: 'I "' + cluster + '" er "' + silentLetter + '" stumt — det skrives men udtales ikke'
        };
      }
    }
    // "stumt 'X' foran 'Y'" or "stumt 'X' efter 'Y'" or "stumt 'X'" or "stumt 'X' i udtalen"
    var stmSimple = hint.match(/stumt '(\w+)'/);
    if (stmSimple) {
      var sl = stmSimple[1].toLowerCase();
      var slPos = word.toLowerCase().indexOf(sl);
      if (slPos >= 0) {
        return {
          word: word,
          blankStart: slPos,
          blankLen: sl.length,
          correct: sl,
          options: shuffle([sl, '']),
          explanation: '"' + sl + '" er stumt i dette ord — skrives men udtales ikke'
        };
      }
    }
    return null;
  }

  // --- Dobbeltkonsonant ---
  if (cat === 'Dobbeltkonsonant') {
    // "dobbelt-X efter kort 'Y'" or "dobbelt 'X' efter kort vokal" or "dobbelt X"
    var dblMatch = hint.match(/dobbelt[- ]'?(\w)'?/);
    if (dblMatch) {
      var letter = dblMatch[1].toLowerCase();
      var dbl = letter + letter;
      var dblPos = word.toLowerCase().indexOf(dbl);
      if (dblPos >= 0) {
        return {
          word: word,
          blankStart: dblPos,
          blankLen: 2,
          correct: dbl,
          options: shuffle([dbl, letter]),
          explanation: 'Her skal der dobbelt-' + letter + ' fordi vokalen foran er kort'
        };
      }
    }
    // "enkelt-X" or "enkelt konsonant"
    var snglMatch = hint.match(/enkelt[- ]'?(\w)'?/);
    if (snglMatch && snglMatch[1] !== 'k') { // skip generic 'konsonant'
      var sLetter = snglMatch[1].toLowerCase();
      // Find the single consonant that is NOT doubled
      for (var si = 0; si < word.length; si++) {
        if (word[si].toLowerCase() === sLetter && (si + 1 >= word.length || word[si + 1].toLowerCase() !== sLetter)) {
          return {
            word: word,
            blankStart: si,
            blankLen: 1,
            correct: sLetter,
            options: shuffle([sLetter, sLetter + sLetter]),
            explanation: 'Her er vokalen lang, så der er kun enkelt-' + sLetter
          };
        }
      }
    }
    return null;
  }

  // --- Nutids-r ---
  if (cat === 'Nutids-r') {
    // Word ends with -r in present tense
    if (word.endsWith('r')) {
      return {
        word: word,
        blankStart: word.length - 1,
        blankLen: 1,
        correct: 'r',
        options: shuffle(['r', '']),
        explanation: 'Verber i nutid ender altid på -r: "hun hoppe-r", "han løbe-r"'
      };
    }
    return null;
  }

  // --- Verbernes bøjning ---
  if (cat === 'Verbernes b\u00F8jning') {
    // datid: '-ede' vs '-te'
    if (hint.indexOf('-ede') >= 0) {
      var edePos = word.lastIndexOf('ede');
      if (edePos > 0) {
        return {
          word: word,
          blankStart: edePos,
          blankLen: 3,
          correct: 'ede',
          options: shuffle(['ede', 'te']),
          explanation: 'Datid: dette verbum bøjes med "-ede" (svag bøjning)'
        };
      }
    }
    if (hint.indexOf("'-te'") >= 0 || hint.indexOf(': \'-te\'') >= 0 || (hint.indexOf('-te') >= 0 && hint.indexOf('-ede') < 0)) {
      var tePos = word.lastIndexOf('te');
      if (tePos > 0 && word.indexOf('ede') < 0) {
        return {
          word: word,
          blankStart: tePos,
          blankLen: 2,
          correct: 'te',
          options: shuffle(['te', 'ede']),
          explanation: 'Datid: dette verbum bøjes med "-te" (kort bøjning)'
        };
      }
    }
    // tillægsform: '-et' vs '-t'
    if (hint.indexOf('-et') >= 0 || hint.indexOf('tillægsform') >= 0) {
      if (word.endsWith('et')) {
        return {
          word: word,
          blankStart: word.length - 2,
          blankLen: 2,
          correct: 'et',
          options: shuffle(['et', 't']),
          explanation: 'Tillægsform: dette verbum ender på "-et"'
        };
      }
    }
    return null;
  }

  // --- Navneordsendelser ---
  if (cat === 'Navneordsendelser') {
    // bestemt form: -en vs -et
    if (hint.indexOf('-en') >= 0 && word.endsWith('en')) {
      return {
        word: word,
        blankStart: word.length - 2,
        blankLen: 2,
        correct: 'en',
        options: shuffle(['en', 'et']),
        explanation: 'Fælleskøn (en-ord): bestemt form ender på "-en"'
      };
    }
    if (hint.indexOf('-et') >= 0 && word.endsWith('et')) {
      return {
        word: word,
        blankStart: word.length - 2,
        blankLen: 2,
        correct: 'et',
        options: shuffle(['et', 'en']),
        explanation: 'Intetkøn (et-ord): bestemt form ender på "-et"'
      };
    }
    // flertal: -er vs -e
    if (hint.indexOf("'-er'") >= 0 && word.endsWith('er')) {
      return {
        word: word,
        blankStart: word.length - 2,
        blankLen: 2,
        correct: 'er',
        options: shuffle(['er', 'e', 'ene']),
        explanation: 'Flertal dannes her med "-er"'
      };
    }
    // -erne vs -ene
    if (hint.indexOf('-erne') >= 0 && word.endsWith('erne')) {
      return {
        word: word,
        blankStart: word.length - 4,
        blankLen: 4,
        correct: 'erne',
        options: shuffle(['erne', 'ene']),
        explanation: 'Bestemt flertal dannes her med "-erne"'
      };
    }
    if (hint.indexOf('-ene') >= 0 && word.endsWith('ene')) {
      return {
        word: word,
        blankStart: word.length - 3,
        blankLen: 3,
        correct: 'ene',
        options: shuffle(['ene', 'erne']),
        explanation: 'Bestemt flertal dannes her med "-ene"'
      };
    }
    return null;
  }

  // --- For- og efterstavelser ---
  if (cat === 'For- og efterstavelser') {
    // efterstavelse '-lig' vs '-lig'
    if (hint.indexOf('-lig') >= 0 && word.indexOf('lig') > 0) {
      var ligPos = word.lastIndexOf('lig');
      return {
        word: word,
        blankStart: ligPos,
        blankLen: 3,
        correct: 'lig',
        options: shuffle(['lig', 'leg']),
        explanation: 'Efterstavelsen "-lig" bruges til at danne tillægsord'
      };
    }
    // '-hed'
    if (hint.indexOf('-hed') >= 0 && word.indexOf('hed') > 0) {
      var hedPos = word.lastIndexOf('hed');
      return {
        word: word,
        blankStart: hedPos,
        blankLen: 3,
        correct: 'hed',
        options: shuffle(['hed', 'het']),
        explanation: 'Efterstavelsen "-hed" bruges til at danne navneord'
      };
    }
    // '-else'
    if (hint.indexOf('-else') >= 0 && word.indexOf('else') > 0) {
      var elsePos = word.lastIndexOf('else');
      return {
        word: word,
        blankStart: elsePos,
        blankLen: 4,
        correct: 'else',
        options: shuffle(['else', 'ælse']),
        explanation: 'Efterstavelsen "-else" bruges til at danne navneord af verber'
      };
    }
    // forstavelse 'u-'
    if (hint.indexOf("'u-'") >= 0 && word.startsWith('u')) {
      return {
        word: word,
        blankStart: 0,
        blankLen: 1,
        correct: 'u',
        options: shuffle(['u', 'o']),
        explanation: 'Forstavelsen "u-" betyder "ikke" eller "modsat"'
      };
    }
    return null;
  }

  // --- Sammensatte ord: blank the junction ---
  if (cat === 'Sammensatte ord') {
    // fuge-s
    if (hint.indexOf('fuge-s') >= 0 || hint.indexOf("'s'") >= 0) {
      // Find the fuge-s in the compound
      var parts = hint.match(/'([^']+)'/g);
      if (parts && parts.length >= 2) {
        var firstPart = parts[0].replace(/'/g, '').toLowerCase();
        var sPos = word.toLowerCase().indexOf(firstPart);
        if (sPos >= 0) {
          var fugePos = sPos + firstPart.length;
          if (word[fugePos] === 's') {
            return {
              word: word,
              blankStart: fugePos,
              blankLen: 1,
              correct: 's',
              options: shuffle(['s', '']),
              explanation: 'Sammensatte ord har her et fuge-s mellem delene'
            };
          }
        }
      }
    }
    return null;
  }

  // --- Lydrette ord: not suitable for fill-in (too easy/generic) ---
  return null;
}

// Fill-in state
var fillinWords = [], fillinIndex = 0, fillinResults = [], fillinBlanks = [];

function startFillIn() {
  var profile = loadProfile() || {};
  var categories = ALL_CATEGORIES;
  isMixedSession = false;
  gameMode = 'fillin';
  pendingBoss = null;
  sessionLessonCategories = [];
  sessionCorrectCount = 0; sessionCorrectStreak = 0; sessionCategoryErrors = {};
  sessionUsedWords = {};
  pendingChest = false;

  var pool = buildPoolWithCategoryLevels(categories);
  if (pool.length === 0) {
    for (var ci2 = 0; ci2 < categories.length; ci2++) {
      var cat2 = categories[ci2];
      if (!WORD_BANK[cat2]) continue;
      pool = pool.concat(WORD_BANK[cat2].map(function(w) { return Object.assign({}, w, { category: cat2 }); }));
    }
  }
  pool = shuffle(pool);

  // Filter to words that have valid blanks, prioritize words with emoji illustrations
  var withEmoji = [], withoutEmoji = [], blanksEmoji = [], blanksNoEmoji = [];
  for (var i = 0; i < pool.length; i++) {
    var blanks = generateBlanks(pool[i]);
    if (blanks) {
      if (WORD_EMOJIS[pool[i].word]) {
        withEmoji.push(pool[i]); blanksEmoji.push(blanks);
      } else {
        withoutEmoji.push(pool[i]); blanksNoEmoji.push(blanks);
      }
    }
  }
  // Take emoji words first, fill up with non-emoji words
  fillinWords = [];
  fillinBlanks = [];
  for (var ei = 0; ei < withEmoji.length && fillinWords.length < 10; ei++) {
    fillinWords.push(withEmoji[ei]); fillinBlanks.push(blanksEmoji[ei]);
  }
  for (var ni = 0; ni < withoutEmoji.length && fillinWords.length < 10; ni++) {
    fillinWords.push(withoutEmoji[ni]); fillinBlanks.push(blanksNoEmoji[ni]);
  }

  if (fillinWords.length === 0) {
    alert('Ingen ord fundet til udfyld-\u00F8velsen for dine kategorier. Pr\u00F8v tr\u00E6ningsmodus i stedet.');
    return;
  }

  fillinIndex = 0;
  fillinResults = [];
  results = []; // shared results array for finishTest
  for (var fi = 0; fi < fillinWords.length; fi++) sessionUsedWords[fillinWords[fi].word.toLowerCase()] = true;

  document.getElementById('fillinScoreCorrect').textContent = '0';
  document.getElementById('fillinScoreWrong').textContent = '0';

  hide('phase-welcome');
  show('phase-fillin');
  updateRewardBar();

  var b = document.createElement('div');
  b.className = 'session-badge';
  b.innerHTML = '\u270D\uFE0F Udfyld bogstav \u2014 v\u00E6lg det rigtige bogstav';
  document.getElementById('phase-fillin').appendChild(b);

  renderFillInWord();
}

function renderFillInWord() {
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;

  var w = fillinWords[fillinIndex];
  var blanks = fillinBlanks[fillinIndex];
  var total = fillinWords.length;

  document.getElementById('fillinWordNum').textContent = (fillinResults.length + 1);
  document.getElementById('fillinProgressBar').style.width = ((fillinResults.length / total) * 100) + '%';
  updatePatternBadge('fillinPatternBadge', w.category, w.level);
  document.getElementById('fillinFeedbackBox').style.display = 'none';
  document.getElementById('fillinNextBtn').classList.add('hidden');

  // Show emoji illustration if available, otherwise text hint
  var emoji = WORD_EMOJIS[w.word] || '';
  if (emoji) {
    document.getElementById('fillinHint').innerHTML = '<span style="font-size:2.5rem;display:block;margin-bottom:4px">' + emoji + '</span>' + (w.hint || '');
  } else {
    document.getElementById('fillinHint').textContent = w.hint || '';
  }

  // Render word with blank
  var word = blanks.word;
  var html = '';
  for (var i = 0; i < word.length; i++) {
    if (i >= blanks.blankStart && i < blanks.blankStart + blanks.blankLen) {
      if (i === blanks.blankStart) {
        html += '<span class="fillin-blank">' + '_'.repeat(blanks.blankLen) + '</span>';
      }
      // skip rest of blank characters
    } else {
      html += '<span>' + word[i] + '</span>';
    }
  }
  // If blank is "nothing" (empty string option), the blank might be at a position
  // For empty options (silent letter removal), show blank differently
  document.getElementById('fillinWordDisplay').innerHTML = html;

  // Render choice buttons
  var choicesHtml = '';
  for (var oi = 0; oi < blanks.options.length; oi++) {
    var optLabel = blanks.options[oi] === '' ? '(intet)' : blanks.options[oi];
    choicesHtml += '<button class="fillin-choice-btn" onclick="checkFillIn(' + oi + ')" data-index="' + oi + '">' + optLabel + '</button>';
  }
  document.getElementById('fillinChoices').innerHTML = choicesHtml;

  // Play audio
  speakWord(w.word, null);
}

function speakFillInWord() {
  var w = fillinWords[fillinIndex];
  speakWord(w.word, w.sentence || null);
}

function checkFillIn(chosenIndex) {
  var w = fillinWords[fillinIndex];
  var blanks = fillinBlanks[fillinIndex];
  var chosen = blanks.options[chosenIndex];
  var ok = (chosen === blanks.correct);

  // Disable all choice buttons
  var btns = document.querySelectorAll('.fillin-choice-btn');
  btns.forEach(function(btn) {
    btn.onclick = null;
    btn.style.pointerEvents = 'none';
    var idx = parseInt(btn.getAttribute('data-index'));
    if (idx === chosenIndex && ok) {
      btn.classList.add('chosen-correct');
    } else if (idx === chosenIndex && !ok) {
      btn.classList.add('chosen-wrong');
    }
    if (blanks.options[idx] === blanks.correct && !ok) {
      btn.classList.add('reveal-correct');
    }
  });

  // Update word display to show the filled letter
  var word = blanks.word;
  var html = '';
  for (var i = 0; i < word.length; i++) {
    if (i >= blanks.blankStart && i < blanks.blankStart + blanks.blankLen) {
      if (i === blanks.blankStart) {
        if (ok) {
          html += '<span class="fillin-filled">' + blanks.correct + '</span>';
        } else {
          html += '<span class="fillin-filled-wrong">' + (chosen || '\u00D8') + '</span>';
        }
      }
    } else {
      html += '<span>' + word[i] + '</span>';
    }
  }
  document.getElementById('fillinWordDisplay').innerHTML = html;

  // Feedback
  var box = document.getElementById('fillinFeedbackBox');
  box.style.display = 'block';
  if (ok) {
    box.innerHTML = '<div class="feedback-correct">\u2705 Rigtigt! "' + word + '" \u{1F389}</div>';
  } else {
    var rule = PATTERN_RULES[w.category] || '';
    var feedbackHTML = '<div class="feedback-wrong">\u274C Det rigtige svar er: <strong>' + blanks.correct + '</strong> \u2192 "' + word + '"</div>';
    if (blanks.explanation) {
      feedbackHTML += '<div class="pattern-explain"><strong>\u{1F4D6} Staveregel:</strong><br>' + blanks.explanation + '</div>';
    }
    box.innerHTML = feedbackHTML;
  }

  // Record result
  var result = {
    word: w.word, correct: ok, selfCorrected: false,
    userAnswer: chosen === '' ? '(intet)' : chosen,
    category: w.category, patternHint: w.patternHint || '', level: w.level || 0
  };
  fillinResults.push(result);
  results.push(result);

  // SR update + Supabase
  updateSRWord(w.word, ok, w.category);
  logAnswer(w.word, chosen === '' ? '(intet)' : chosen, ok, 1, w.category, w.level || 0);
  updateCategoryLevel(w.category, ok, w.level || 0, chosen, w.misspelling);

  // Gamification — boss + chest as reward for 5 correct streak
  if (ok) {
    sessionCorrectCount++;
    sessionCorrectStreak++;
    if (sessionCorrectStreak >= BOSS_TRIGGER_STREAK) {
      sessionCorrectStreak = 0;
      pendingBoss = pickBossWord({ word: w.word, category: w.category });
      pendingChest = true;
    }
  } else {
    sessionCorrectStreak = 0;
    trackCategoryError(w.category);
  }

  // Update scores
  document.getElementById('fillinScoreCorrect').textContent = fillinResults.filter(function(r) { return r.correct; }).length;
  document.getElementById('fillinScoreWrong').textContent = fillinResults.filter(function(r) { return !r.correct; }).length;

  document.getElementById('fillinNextBtn').classList.remove('hidden');
  document.getElementById('fillinNextBtn').focus();
}

function nextFillInWord() {
  if (isMixedSession) { nextMixedItem(); return; }
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;

  // Boss first (reward for streak), chest follows after boss defeat
  if (pendingBoss) {
    pendingInterruptAction = (fillinIndex + 1) >= fillinWords.length ? 'finish' : 'continue';
    fillinIndex++;
    showBossMinigame(pendingBoss);
    return;
  }

  // Chest without boss (shouldn't normally happen now, but safety)
  if (pendingChest) {
    pendingChest = false;
    pendingInterruptAction = (fillinIndex + 1) >= fillinWords.length ? 'finish' : 'continue';
    fillinIndex++;
    showTreasureChest();
    return;
  }

  fillinIndex++;

  if (fillinIndex >= fillinWords.length) {
    finishFillIn();
  } else {
    renderFillInWord();
  }
}

function finishFillIn() {
  hide('phase-fillin');

  // Reuse reward system
  var correctCount = fillinResults.filter(function(r) { return r.correct; }).length;
  var totalCount = fillinResults.length;
  var prevXP = loadRewardData().totalXP || 0;
  var rewardResult = awardSessionXP(correctCount, totalCount);
  var rewardData = loadRewardData();
  var newXP = rewardData.totalXP || 0;
  var prevLevel = getAvatarLevel(prevXP);
  var newLevel = getAvatarLevel(newXP);
  updateRewardBar();
  showRewardOverlay(rewardResult.xpEarned, rewardResult.gemsEarned);
  if (rewardResult.dailyGoalReached) {
    setTimeout(function() { showRewardFloat('Dagligt m\u00E5l n\u00E5et! +5 \u{1F48E}'); }, 800);
  }
  if (newLevel.index > prevLevel.index) {
    setTimeout(function() { showLevelUpPopup(newLevel); }, 2200);
  }

  // Render results
  renderFillInResults();
}

function renderFillInResults() {
  renderResults({
    resultsList: fillinResults,
    messages: ['Godt gået! \u{1F4AA}', 'Flot indsats med bogstaverne! \u{1F31F}', 'Du bliver skarpere! \u2B50'],
    summary: 'Du fik ' + fillinResults.filter(function(r) { return r.correct; }).length + ' ud af ' + fillinResults.length + ' rigtige i udfyld-øvelsen.'
  });
}


// ===== SPELLING POLICE EXERCISE =====

var spItems = [], spIndex = 0, spResults = [];

function buildSpellingPoliceItem(wordObj) {
  if (!wordObj.sentence) return null;
  if (!wordObj.misspelling) return null;
  var ms = { misspelled: wordObj.misspelling, explanation: '' };

  var word = wordObj.word;
  var sentence = wordObj.sentence;

  // Find the target word in the sentence (case-insensitive match including inflected forms)
  var regex = new RegExp('(?<![a-zA-ZæøåÆØÅ])(' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-zæøåA-ZÆØÅ]*)(?![a-zA-ZæøåÆØÅ])', 'i');
  var match = sentence.match(regex);
  if (!match) return null;

  var originalForm = match[1]; // the word as it appears in the sentence (possibly capitalized/inflected)
  var misspelledForm = ms.misspelled;

  // Handle capitalization
  if (originalForm[0] === originalForm[0].toUpperCase()) {
    misspelledForm = misspelledForm[0].toUpperCase() + misspelledForm.slice(1);
  }

  // Handle inflected forms: if the sentence form is longer than the base word, append the suffix to misspelling
  if (originalForm.toLowerCase() !== word.toLowerCase() && originalForm.toLowerCase().startsWith(word.toLowerCase())) {
    var suffix = originalForm.slice(word.length);
    misspelledForm = ms.misspelled + suffix;
    if (originalForm[0] === originalForm[0].toUpperCase()) {
      misspelledForm = misspelledForm[0].toUpperCase() + misspelledForm.slice(1);
    }
  }

  // Create the misspelled sentence
  var misspelledSentence = sentence.replace(originalForm, misspelledForm);
  if (misspelledSentence === sentence) return null; // replacement didn't work

  // Split sentence into words (keeping punctuation attached)
  var tokens = misspelledSentence.match(/\S+/g) || [];
  var targetIndex = -1;
  for (var i = 0; i < tokens.length; i++) {
    // Strip punctuation for comparison
    var clean = tokens[i].replace(/[.,!?;:'"]+$/g, '');
    if (clean === misspelledForm || clean.toLowerCase() === misspelledForm.toLowerCase()) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex < 0) return null;

  return {
    sentence: misspelledSentence,
    tokens: tokens,
    targetIndex: targetIndex,
    correctWord: originalForm,
    misspelledWord: misspelledForm,
    explanation: ms.explanation,
    word: wordObj.word,
    category: wordObj.category,
    patternHint: wordObj.patternHint || '',
    level: wordObj.level || 0
  };
}

function startSpellingPolice() {
  var profile = loadProfile() || {};
  var categories = ALL_CATEGORIES;
  isMixedSession = false;
  gameMode = 'spellingpolice';
  pendingBoss = null;
  sessionLessonCategories = [];
  sessionCorrectCount = 0; sessionCorrectStreak = 0; sessionCategoryErrors = {};
  sessionUsedWords = {};
  pendingChest = false;

  var pool = buildPoolWithCategoryLevels(categories);
  if (pool.length === 0) {
    for (var ci2 = 0; ci2 < categories.length; ci2++) {
      var cat2 = categories[ci2];
      if (!WORD_BANK[cat2]) continue;
      pool = pool.concat(WORD_BANK[cat2].map(function(w) { return Object.assign({}, w, { category: cat2 }); }));
    }
  }
  pool = shuffle(pool);

  spItems = [];
  for (var i = 0; i < pool.length && spItems.length < 10; i++) {
    var item = buildSpellingPoliceItem(pool[i]);
    if (item) spItems.push(item);
  }

  if (spItems.length < 3) {
    alert('Ikke nok s\u00E6tninger til Stavepolitiet. Pr\u00F8v en anden \u00F8velse.');
    return;
  }

  spIndex = 0;
  spResults = [];
  results = [];
  for (var si2 = 0; si2 < spItems.length; si2++) sessionUsedWords[spItems[si2].word.toLowerCase()] = true;

  document.getElementById('spScoreCorrect').textContent = '0';
  document.getElementById('spScoreWrong').textContent = '0';

  hide('phase-welcome');
  show('phase-spellingpolice');
  updateRewardBar();

  var b = document.createElement('div');
  b.className = 'session-badge';
  b.innerHTML = '\u{1F50D} Stavepolitiet \u2014 find den skyldige i line-up\'et!';
  document.getElementById('phase-spellingpolice').appendChild(b);

  renderSpellingPoliceWord();
}

function renderSpellingPoliceWord() {
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;

  var item = spItems[spIndex];
  var total = spItems.length;

  document.getElementById('spWordNum').textContent = (spResults.length + 1);
  document.getElementById('spProgressBar').style.width = ((spResults.length / total) * 100) + '%';
  updatePatternBadge('spPatternBadge', item.category, item.level);
  document.getElementById('spFeedbackBox').style.display = 'none';
  document.getElementById('spNextBtn').classList.add('hidden');
  document.getElementById('spCorrection').classList.add('hidden');

  // Render sentence as suspect line-up with animal characters
  var suspects = ['\u{1F431}','\u{1F436}','\u{1F437}','\u{1F438}','\u{1F435}','\u{1F43B}','\u{1F428}','\u{1F981}','\u{1F42D}','\u{1F430}','\u{1F99D}','\u{1F994}','\u{1F98E}','\u{1F427}','\u{1F99C}','\u{1F98A}','\u{1F40D}','\u{1F422}'];
  var shuffledSuspects = shuffle(suspects);
  var html = '';
  for (var i = 0; i < item.tokens.length; i++) {
    var animal = shuffledSuspects[i % shuffledSuspects.length];
    html += '<span class="sp-word" data-index="' + i + '" onclick="checkSpellingPolice(' + i + ')">' +
      '<span class="sp-suspect">' + animal + '</span>' +
      '<span class="sp-sign"><span class="sp-text">' + item.tokens[i] + '</span></span>' +
      '<span class="sp-number">#' + (i + 1) + '</span>' +
      '</span>';
  }
  document.getElementById('spSentence').innerHTML = html;
}

function checkSpellingPolice(wordIndex) {
  var item = spItems[spIndex];
  var ok = (wordIndex === item.targetIndex);

  // Disable all words
  var words = document.querySelectorAll('.sp-word');
  words.forEach(function(w) { w.classList.add('disabled'); });

  // Highlight selected and target
  var selected = document.querySelector('.sp-word[data-index="' + wordIndex + '"]');
  var target = document.querySelector('.sp-word[data-index="' + item.targetIndex + '"]');

  if (ok) {
    selected.classList.add('selected-correct');
  } else {
    selected.classList.add('selected-wrong');
    target.classList.add('reveal-target');
  }

  // Show correction
  var corrEl = document.getElementById('spCorrection');
  corrEl.textContent = '\u2192 ' + item.correctWord;
  corrEl.classList.remove('hidden');

  // Feedback
  var box = document.getElementById('spFeedbackBox');
  box.style.display = 'block';
  if (ok) {
    box.innerHTML = '<div class="feedback-correct">\u{1F6A8} Forbryder fanget! "' + item.misspelledWord + '" \u2192 "' + item.correctWord + '"</div>';
  } else {
    box.innerHTML = '<div class="feedback-wrong">\u{1F575}\uFE0F Forbryderen slap v\u00E6k! Det var: <strong>"' + item.misspelledWord + '"</strong> \u2192 <strong>"' + item.correctWord + '"</strong>' +
      (item.explanation ? '<br><span style="font-size:0.9rem">' + item.explanation + '</span>' : '') + '</div>';
  }

  // Record result
  var result = {
    word: item.word, correct: ok, selfCorrected: false,
    userAnswer: item.tokens[wordIndex] || '',
    category: item.category, patternHint: item.patternHint, level: item.level
  };
  spResults.push(result);
  results.push(result);

  updateSRWord(item.word, ok, item.category);
  logAnswer(item.word, item.tokens[wordIndex] || '', ok, 1, item.category, item.level || 0);
  updateCategoryLevel(item.category, ok, item.level || 0);

  // Gamification
  if (ok) {
    sessionCorrectCount++;
    sessionCorrectStreak++;
    if (sessionCorrectStreak >= BOSS_TRIGGER_STREAK) {
      sessionCorrectStreak = 0;
      pendingBoss = pickBossWord({ word: item.word, category: item.category });
      pendingChest = true;
    }
  } else {
    sessionCorrectStreak = 0;
    trackCategoryError(item.category);
  }

  document.getElementById('spScoreCorrect').textContent = spResults.filter(function(r) { return r.correct; }).length;
  document.getElementById('spScoreWrong').textContent = spResults.filter(function(r) { return !r.correct; }).length;

  document.getElementById('spNextBtn').classList.remove('hidden');
  document.getElementById('spNextBtn').focus();
}

function nextSpellingPolice() {
  if (isMixedSession) { nextMixedItem(); return; }
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;

  if (pendingBoss) {
    pendingInterruptAction = (spIndex + 1) >= spItems.length ? 'finish' : 'continue';
    spIndex++;
    showBossMinigame(pendingBoss);
    return;
  }

  if (pendingChest) {
    pendingChest = false;
    pendingInterruptAction = (spIndex + 1) >= spItems.length ? 'finish' : 'continue';
    spIndex++;
    showTreasureChest();
    return;
  }

  spIndex++;

  if (spIndex >= spItems.length) {
    finishSpellingPolice();
  } else {
    renderSpellingPoliceWord();
  }
}

function finishSpellingPolice() {
  hide('phase-spellingpolice');

  var correctCount = spResults.filter(function(r) { return r.correct; }).length;
  var totalCount = spResults.length;
  var prevXP = loadRewardData().totalXP || 0;
  var rewardResult = awardSessionXP(correctCount, totalCount);
  var rewardData = loadRewardData();
  var newXP = rewardData.totalXP || 0;
  var prevLevel = getAvatarLevel(prevXP);
  var newLevel = getAvatarLevel(newXP);
  updateRewardBar();
  showRewardOverlay(rewardResult.xpEarned, rewardResult.gemsEarned);
  if (rewardResult.dailyGoalReached) {
    setTimeout(function() { showRewardFloat('Dagligt m\u00E5l n\u00E5et! +5 \u{1F48E}'); }, 800);
  }
  if (newLevel.index > prevLevel.index) {
    setTimeout(function() { showLevelUpPopup(newLevel); }, 2200);
  }

  renderSpellingPoliceResults();
}

function renderSpellingPoliceResults() {
  renderResults({
    resultsList: spResults,
    messages: ['Skarpt politiarbejde, betjent! \u{1F50D}', 'Mesterdetektiv! \u{1F575}\uFE0F', 'Ingen slipper forbi dig! \u{1F6A8}'],
    summary: spResults.filter(function(r) { return r.correct; }).length + ' ud af ' + spResults.length + ' forbrydere fanget!',
    labels: { correct: 'Fundet \u2713', wrong: 'Misset \u2717' },
    showAllWords: false
  });
}

// ===== WORD BUILDER EXERCISE =====

var DISTRACTOR_MORPHEMES = [
  'be-', 'for-', 'u-', 'op-', 'ud-', 'af-', 'til-', 'over-', 'ind-',
  '-lig', '-hed', '-else', '-som', '-ing', '-tion', '-dom',
  '-er', '-en', '-et', '-ene', '-erne', '-ede', '-te'
];

function parseMorphemes(hint, word) {
  if (!hint || hint.indexOf('+') < 0) return null;
  var quoted = [];
  var re = /'([^']+)'/g;
  var match;
  while ((match = re.exec(hint)) !== null) { quoted.push(match[1]); }

  // Check if quoted parts directly reconstruct the word
  if (quoted.length >= 2) {
    var joined = quoted.map(function(p) { return p.replace(/^-/, '').replace(/-$/, ''); }).join('');
    if (joined === word) return quoted;
  }

  // For affix patterns: extract known parts, derive the stem
  if (quoted.length >= 1) {
    var parts = [];
    var remaining = word;
    // Collect prefixes and middle parts from the front
    for (var pi = 0; pi < quoted.length; pi++) {
      var q = quoted[pi];
      var clean = q.replace(/^-/, '').replace(/-$/, '');
      if ((q.endsWith('-') && !q.startsWith('-')) || (!q.startsWith('-') && !q.endsWith('-'))) {
        if (remaining.startsWith(clean)) {
          parts.push(q);
          remaining = remaining.slice(clean.length);
        }
      }
    }
    // Collect suffixes from the end
    var suffixParts = [];
    for (var si = quoted.length - 1; si >= 0; si--) {
      var qs = quoted[si];
      var cleanS = qs.replace(/^-/, '').replace(/-$/, '');
      if (qs.startsWith('-') && !qs.endsWith('-') && remaining.endsWith(cleanS)) {
        suffixParts.unshift(qs);
        remaining = remaining.slice(0, remaining.length - cleanS.length);
      }
    }
    // Whatever is left is the stem
    if (remaining.length > 0) parts.push(remaining);
    parts = parts.concat(suffixParts);

    var testJoin = parts.map(function(p) { return p.replace(/^-/, '').replace(/-$/, ''); }).join('');
    if (testJoin === word && parts.length >= 2) return parts;
  }

  // Format C with colon: "description: STEM + '-ending'"
  var colonIdx = hint.lastIndexOf(':');
  if (colonIdx >= 0) {
    var afterColon = hint.substring(colonIdx + 1).trim();
    var plusParts = afterColon.split('+').map(function(s) { return s.trim(); });
    var morphemes = plusParts.map(function(p) { return p.replace(/'/g, '').replace(/\(.*\)/, '').trim(); }).filter(function(p) { return p; });
    var testJoin2 = morphemes.map(function(p) { return p.replace(/^-/, '').replace(/-$/, ''); }).join('');
    if (testJoin2 === word) return morphemes;
  }

  return null;
}

var wbWords = [], wbIndex = 0, wbResults = [];
var wbCurrentMorphemes = [];
var wbShuffled = [];
var wbPlacedCount = 0;
var wbMistakes = 0;

function startWordBuilder() {
  var profile = loadProfile() || {};
  isMixedSession = false;
  gameMode = 'wordbuilder';
  pendingBoss = null;
  sessionLessonCategories = [];
  sessionCorrectCount = 0; sessionCorrectStreak = 0; sessionCategoryErrors = {};
  sessionUsedWords = {};
  pendingChest = false;

  // Build pool from ALL categories (morphemes work best across categories)
  var pool = buildPoolWithCategoryLevels(ALL_CATEGORIES);
  pool = shuffle(pool);

  // Filter to words with parseable morphemes, prioritize weak categories
  var weakSet = {};
  (profile.weakCategories || []).forEach(function(c) { weakSet[c] = true; });
  var weakItems = [], otherItems = [];
  for (var i = 0; i < pool.length; i++) {
    var m = parseMorphemes(pool[i].patternHint, pool[i].word);
    if (m) {
      if (weakSet[pool[i].category]) weakItems.push({ wordObj: pool[i], morphemes: m });
      else otherItems.push({ wordObj: pool[i], morphemes: m });
    }
  }

  wbWords = [];
  var combined = weakItems.concat(otherItems);
  for (var j = 0; j < combined.length && wbWords.length < 10; j++) {
    wbWords.push(combined[j]);
  }

  if (wbWords.length < 3) {
    alert('Ikke nok ord til Ordbyggeren. Pr\u00F8v en anden \u00F8velse.');
    return;
  }

  wbIndex = 0;
  wbResults = [];
  results = [];
  for (var wi = 0; wi < wbWords.length; wi++) sessionUsedWords[wbWords[wi].wordObj.word.toLowerCase()] = true;

  document.getElementById('wbScoreCorrect').textContent = '0';
  document.getElementById('wbScoreWrong').textContent = '0';

  hide('phase-welcome');
  show('phase-wordbuilder');
  updateRewardBar();

  var b = document.createElement('div');
  b.className = 'session-badge';
  b.innerHTML = '\u{1F9E9} Ordbyggeren \u2014 byg ordet af klodser!';
  document.getElementById('phase-wordbuilder').appendChild(b);

  renderWBWord();
}

function renderWBWord() {
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;

  var item = wbWords[wbIndex];
  var w = item.wordObj;
  wbCurrentMorphemes = item.morphemes;
  wbPlacedCount = 0;
  wbMistakes = 0;

  document.getElementById('wbWordNum').textContent = (wbResults.length + 1);
  document.getElementById('wbProgressBar').style.width = ((wbResults.length / wbWords.length) * 100) + '%';
  updatePatternBadge('wbPatternBadge', w.category, w.level);
  document.getElementById('wbFeedbackBox').style.display = 'none';
  document.getElementById('wbNextBtn').classList.add('hidden');

  // Show hint with optional emoji
  var emoji = WORD_EMOJIS[w.word] || '';
  if (emoji) {
    document.getElementById('wbHint').innerHTML = '<span style="font-size:2.5rem;display:block;margin-bottom:4px">' + emoji + '</span>' + (w.hint || '');
  } else {
    document.getElementById('wbHint').textContent = w.hint || '';
  }

  // Render empty slots — no hints about word length, just dashes between parts
  var slotsHtml = '';
  for (var i = 0; i < wbCurrentMorphemes.length; i++) {
    var cls = i === 0 ? 'wb-slot active' : 'wb-slot';
    if (i > 0) slotsHtml += '<span class="wb-dash">-</span>';
    slotsHtml += '<span class="' + cls + '" id="wbSlot' + i + '"></span>';
  }
  document.getElementById('wbBuiltWord').innerHTML = slotsHtml;

  // Build shuffled morpheme buttons with distractors (always)
  var allMorphemes = wbCurrentMorphemes.slice();
  var available = DISTRACTOR_MORPHEMES.filter(function(d) {
    return allMorphemes.indexOf(d) < 0;
  });
  available = shuffle(available);
  // Always add at least 2 distractors, more for shorter words
  var numDistractors = allMorphemes.length <= 2 ? 3 : (allMorphemes.length <= 3 ? 2 : 2);
  for (var di = 0; di < numDistractors && di < available.length; di++) {
    allMorphemes.push(available[di]);
  }
  wbShuffled = shuffle(allMorphemes);

  var btnsHtml = '';
  for (var mi = 0; mi < wbShuffled.length; mi++) {
    btnsHtml += '<button class="wb-morph-btn" data-index="' + mi + '" onclick="tapMorpheme(' + mi + ')">' + wbShuffled[mi] + '</button>';
  }
  document.getElementById('wbMorphemes').innerHTML = btnsHtml;

  // Play audio
  speakWord(w.word, null);
}

function speakWBWord() {
  var w = wbWords[wbIndex].wordObj;
  speakWord(w.word, w.sentence || null);
}

function tapMorpheme(btnIndex) {
  if (wbPlacedCount >= wbCurrentMorphemes.length) return;

  var tapped = wbShuffled[btnIndex];
  var expected = wbCurrentMorphemes[wbPlacedCount];
  var btn = document.querySelector('.wb-morph-btn[data-index="' + btnIndex + '"]');

  if (tapped === expected) {
    // Correct!
    btn.classList.add('used');
    var slot = document.getElementById('wbSlot' + wbPlacedCount);
    // Strip leading/trailing dashes from morpheme (be- → be, -lig → lig)
    slot.textContent = tapped.replace(/^-+/, '').replace(/-+$/, '');
    slot.classList.remove('active');
    slot.classList.add('filled');
    wbPlacedCount++;

    // Highlight next slot
    var nextSlot = document.getElementById('wbSlot' + wbPlacedCount);
    if (nextSlot) nextSlot.classList.add('active');

    // Check if word is complete
    if (wbPlacedCount >= wbCurrentMorphemes.length) {
      wordBuilderComplete();
    }
  } else {
    // Wrong
    wbMistakes++;
    btn.classList.add('wrong-pick');
    setTimeout(function() { btn.classList.remove('wrong-pick'); }, 500);
  }
}

function wordBuilderComplete() {
  var w = wbWords[wbIndex].wordObj;
  var ok = (wbMistakes === 0);

  // Play complete word
  speakWord(w.word, null);

  // Feedback
  var box = document.getElementById('wbFeedbackBox');
  box.style.display = 'block';
  if (ok) {
    box.innerHTML = '<div class="feedback-correct">\u2705 Perfekt! "' + w.word + '" \u{1F389}</div>';
  } else {
    box.innerHTML = '<div class="feedback-correct">\u{1F31F} Godt! "' + w.word + '" \u2014 ' + wbMistakes + ' forkerte fors\u00F8g</div>';
  }

  // Record result (correct if completed, even with mistakes — but track mistakes)
  var result = {
    word: w.word, correct: ok, selfCorrected: wbMistakes > 0 && true,
    userAnswer: ok ? w.word : wbMistakes + ' fejl',
    category: w.category, patternHint: w.patternHint || '', level: w.level || 0
  };
  wbResults.push(result);
  results.push(result);

  updateSRWord(w.word, ok, w.category);
  logAnswer(w.word, ok ? w.word : wbMistakes + ' fejl', ok, 1, w.category, w.level || 0);
  updateCategoryLevel(w.category, ok, w.level || 0);

  // Gamification
  if (ok) {
    sessionCorrectCount++;
    sessionCorrectStreak++;
    if (sessionCorrectStreak >= BOSS_TRIGGER_STREAK) {
      sessionCorrectStreak = 0;
      pendingBoss = pickBossWord({ word: w.word, category: w.category });
      pendingChest = true;
    }
  } else {
    sessionCorrectStreak = 0;
    trackCategoryError(w.category);
  }

  document.getElementById('wbScoreCorrect').textContent = wbResults.filter(function(r) { return r.correct; }).length;
  document.getElementById('wbScoreWrong').textContent = wbResults.filter(function(r) { return !r.correct; }).length;

  document.getElementById('wbNextBtn').classList.remove('hidden');
  document.getElementById('wbNextBtn').focus();
}

function nextWBWord() {
  if (isMixedSession) { nextMixedItem(); return; }
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;

  if (pendingBoss) {
    pendingInterruptAction = (wbIndex + 1) >= wbWords.length ? 'finish' : 'continue';
    wbIndex++;
    showBossMinigame(pendingBoss);
    return;
  }
  if (pendingChest) {
    pendingChest = false;
    pendingInterruptAction = (wbIndex + 1) >= wbWords.length ? 'finish' : 'continue';
    wbIndex++;
    showTreasureChest();
    return;
  }

  wbIndex++;
  if (wbIndex >= wbWords.length) {
    finishWordBuilder();
  } else {
    renderWBWord();
  }
}

function finishWordBuilder() {
  hide('phase-wordbuilder');

  var correctCount = wbResults.filter(function(r) { return r.correct; }).length;
  var totalCount = wbResults.length;
  var prevXP = loadRewardData().totalXP || 0;
  var rewardResult = awardSessionXP(correctCount, totalCount);
  var rewardData = loadRewardData();
  var newXP = rewardData.totalXP || 0;
  var prevLevel = getAvatarLevel(prevXP);
  var newLevel = getAvatarLevel(newXP);
  updateRewardBar();
  showRewardOverlay(rewardResult.xpEarned, rewardResult.gemsEarned);
  if (rewardResult.dailyGoalReached) {
    setTimeout(function() { showRewardFloat('Dagligt m\u00E5l n\u00E5et! +5 \u{1F48E}'); }, 800);
  }
  if (newLevel.index > prevLevel.index) {
    setTimeout(function() { showLevelUpPopup(newLevel); }, 2200);
  }

  renderWBResults();
}

function renderWBResults() {
  renderResults({
    resultsList: wbResults,
    messages: ['Flot bygget! \u{1F9E9}', 'Du er en ordarkitekt! \u{1F3D7}\uFE0F', 'Godt samlet! \u{1F4AA}'],
    summary: wbResults.filter(function(r) { return r.correct; }).length + ' ud af ' + wbResults.length + ' ord bygget uden fejl.',
    labels: { correct: 'Perfekte \u2713', wrong: 'Med fejl' }
  });
}

// ===== SPELL PICK EXERCISE =====

var spkWords = [], spkIndex = 0, spkResults = [];

function startSpellPick() {
  var profile = loadProfile() || {};
  var categories = ALL_CATEGORIES;
  isMixedSession = false;
  gameMode = 'spellpick';
  pendingBoss = null;
  sessionLessonCategories = [];
  sessionCorrectCount = 0; sessionCorrectStreak = 0; sessionCategoryErrors = {};
  sessionUsedWords = {};
  pendingChest = false;

  var pool = buildPoolWithCategoryLevels(categories);
  if (pool.length === 0) {
    for (var ci2 = 0; ci2 < categories.length; ci2++) {
      var cat2 = categories[ci2];
      if (!WORD_BANK[cat2]) continue;
      pool = pool.concat(WORD_BANK[cat2].map(function(w) { return Object.assign({}, w, { category: cat2 }); }));
    }
  }
  pool = shuffle(pool);
  spkWords = pool.slice(0, 10);

  if (spkWords.length < 3) {
    alert('Ikke nok ord til Stavev\u00E6lger.');
    return;
  }

  spkIndex = 0;
  spkResults = [];
  results = [];
  for (var ski = 0; ski < spkWords.length; ski++) sessionUsedWords[spkWords[ski].word.toLowerCase()] = true;

  document.getElementById('spkScoreCorrect').textContent = '0';
  document.getElementById('spkScoreWrong').textContent = '0';

  hide('phase-welcome');
  show('phase-spellpick');
  updateRewardBar();

  // Fetch misspellings for all words, then render
  var wordList = spkWords.map(function(w) { return w.word.toLowerCase(); });
  fetchMisspellings(wordList, function(misByWord) {
    for (var i = 0; i < spkWords.length; i++) {
      spkWords[i]._dbMis = misByWord[spkWords[i].word.toLowerCase()] || [];
    }
    renderSpkWord();
  });
}

function speakSpkWord() {
  if (spkWords[spkIndex]) speakWord(spkWords[spkIndex].word, null);
}

function renderSpkWord() {
  if (spkIndex >= spkWords.length) { finishSpellPick(); return; }
  var w = spkWords[spkIndex];
  var word = w.word.toLowerCase();

  document.getElementById('spkWordNum').textContent = (spkIndex + 1);
  document.getElementById('spkProgressBar').style.width = ((spkIndex / spkWords.length) * 100) + '%';
  updatePatternBadge('spkPatternBadge', w.category, w.level);
  document.getElementById('spkHint').textContent = '\u{1F4A1} ' + w.hint;
  document.getElementById('spkFeedbackBox').style.display = 'none';
  document.getElementById('spkNextBtn').classList.add('hidden');

  // Build options: correct + misspellings based on DB data
  var options = [word];
  var dbMis = (w._dbMis || []).filter(function(m) { return m !== word; });
  var hardcoded = w.misspelling ? w.misspelling.toLowerCase() : null;
  if (hardcoded === word) hardcoded = null;

  if (dbMis.length === 0) {
    // No DB misspellings: show correct + hardcoded (2 options)
    if (hardcoded && options.indexOf(hardcoded) < 0) options.push(hardcoded);
  } else if (dbMis.length === 1) {
    // 1 DB misspelling: show correct + hardcoded + DB (3 options)
    if (hardcoded && options.indexOf(hardcoded) < 0) options.push(hardcoded);
    if (options.indexOf(dbMis[0]) < 0) options.push(dbMis[0]);
  } else {
    // 2+ DB misspellings: show correct + top 2 most common (3 options)
    for (var dbi = 0; dbi < 2 && dbi < dbMis.length; dbi++) {
      if (options.indexOf(dbMis[dbi]) < 0) options.push(dbMis[dbi]);
    }
  }

  // Fallback: ensure at least 2 options
  if (options.length < 2 && w.misspelling) {
    var hcFallback = w.misspelling.toLowerCase();
    if (options.indexOf(hcFallback) < 0) options.push(hcFallback);
  }
  if (options.length < 2) {
    var fallbacks = generateFallbackMisspellings(word);
    for (var fi = 0; fi < fallbacks.length && options.length < 2; fi++) {
      if (options.indexOf(fallbacks[fi]) < 0) options.push(fallbacks[fi]);
    }
  }

  // Shuffle
  for (var si = options.length - 1; si > 0; si--) {
    var sj = Math.floor(Math.random() * (si + 1));
    var tmp = options[si]; options[si] = options[sj]; options[sj] = tmp;
  }

  var container = document.getElementById('spkOptions');
  var html = '';
  for (var oi = 0; oi < options.length; oi++) {
    html += '<button class="btn btn-primary" style="font-size:1.15rem;letter-spacing:2px;padding:14px 20px" onclick="pickSpkOption(this,\'' + options[oi].replace(/'/g, "\\'") + '\')">' + options[oi] + '</button>';
  }
  container.innerHTML = html;

  speakWord(word, null);
}

function pickSpkOption(btn, picked) {
  var w = spkWords[spkIndex];
  var word = w.word.toLowerCase();
  var ok = picked === word;
  var buttons = btn.parentNode.querySelectorAll('button');

  for (var i = 0; i < buttons.length; i++) {
    if (buttons[i] === btn) continue;
    buttons[i].disabled = true;
    if (buttons[i].textContent === word) {
      buttons[i].style.background = 'var(--green)';
      buttons[i].style.color = '#fff';
    } else {
      buttons[i].style.opacity = '0.3';
    }
  }

  var result = { word: w.word, correct: ok, userAnswer: picked, category: w.category, level: w.level || 0 };
  spkResults.push(result);
  results.push(result);
  logAnswer(w.word, picked, ok, 1, w.category, w.level || 0);
  updateCategoryLevel(w.category, ok, w.level || 0, picked, w.misspelling);
  updateSRWord(w.word, ok, w.category);

  if (ok) {
    sessionCorrectCount++;
    sessionCorrectStreak++;
    if (sessionCorrectStreak >= BOSS_TRIGGER_STREAK) {
      sessionCorrectStreak = 0;
      pendingBoss = pickBossWord({ word: w.word, category: w.category });
      pendingChest = true;
    }
  } else { sessionCorrectStreak = 0; trackCategoryError(w.category); }

  document.getElementById('spkScoreCorrect').textContent = spkResults.filter(function(r) { return r.correct; }).length;
  document.getElementById('spkScoreWrong').textContent = spkResults.filter(function(r) { return !r.correct; }).length;

  // Turn clicked button into next button
  btn.style.background = ok ? 'var(--green)' : 'var(--red)';
  btn.style.color = '#fff';
  var feedbackText = ok ? '\u2714 Rigtigt!' : '\u2717 Forkert! \u2014 ' + w.word;
  btn.textContent = feedbackText + ' \u2014 N\u00E6ste \u27A1';
  btn.onclick = function() { nextSpkWord(); };
}

function nextSpkWord() {
  if (isMixedSession) { nextMixedItem(); return; }
  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden'))) return;

  if (pendingBoss) {
    pendingInterruptAction = (spkIndex + 1) >= spkWords.length ? 'finish' : 'continue';
    spkIndex++;
    showBossMinigame(pendingBoss);
    return;
  }
  if (pendingChest) {
    pendingChest = false;
    pendingInterruptAction = (spkIndex + 1 >= spkWords.length) ? 'finish' : 'continue';
    if (!pendingBoss) spkIndex++;
    showTreasureChest();
    return;
  }

  spkIndex++;
  if (spkIndex >= spkWords.length) { finishSpellPick(); }
  else { renderSpkWord(); }
}

function finishSpellPick() {
  hide('phase-spellpick');

  var correctCount = spkResults.filter(function(r) { return r.correct; }).length;
  var totalCount = spkResults.length;
  var prevXP = loadRewardData().totalXP || 0;
  var rewardResult = awardSessionXP(correctCount, totalCount);
  var rewardData = loadRewardData();
  var newXP = rewardData.totalXP || 0;
  var prevLevel = getAvatarLevel(prevXP);
  var newLevel = getAvatarLevel(newXP);
  updateRewardBar();
  showRewardOverlay(rewardResult.xpEarned, rewardResult.gemsEarned);
  if (rewardResult.dailyGoalReached) {
    setTimeout(function() { showRewardFloat('Dagligt m\u00E5l n\u00E5et! +5 \u{1F48E}'); }, 800);
  }
  if (newLevel.index > prevLevel.index) {
    setTimeout(function() { showLevelUpPopup(newLevel); }, 2200);
  }

  renderSpkResults();
}

function renderSpkResults() {
  renderResults({
    resultsList: spkResults,
    messages: ['Godt valgt! \u{1F3AF}', 'Skarpt øje! \u{1F441}\uFE0F', 'Flot stavning! \u{1F4AA}'],
    summary: spkResults.filter(function(r) { return r.correct; }).length + ' ud af ' + spkResults.length + ' ord valgt rigtigt.',
    labels: { correct: 'Rigtige \u2713', wrong: 'Forkerte' }
  });
}

// ===== WHAT IS THE WORD EXERCISE =====

var swCurrentWord = null;

function renderSentenceWord(wordObj) {
  swCurrentWord = wordObj || mixedQueue[mixedIndex].wordObj;
  var w = swCurrentWord;

  updatePatternBadge('swPatternBadge', w.category, w.level);
  document.getElementById('swFeedbackBox').style.display = 'none';
  document.getElementById('swCheckBtn').classList.remove('hidden');
  document.getElementById('swNextBtn').classList.add('hidden');
  document.getElementById('swInput').value = '';

  // Build cloze sentence: replace the word with ___
  var sentence = w.sentence || '';
  var wordRegex = new RegExp('(?<![a-zA-ZæøåÆØÅ])' + w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-zæøå]*(?![a-zA-ZæøåÆØÅ])', 'i');
  var blank = '<span style="display:inline-block;min-width:' + Math.max(60, w.word.length * 14) + 'px;border-bottom:3px solid var(--accent);padding:2px 4px">&nbsp;</span>';
  var clozeText = sentence.replace(wordRegex, blank);

  // If word wasn't found in sentence (edge case), just show sentence with blank at end
  if (clozeText === sentence) {
    clozeText = sentence + ' ' + blank;
  }

  document.getElementById('swClozeText').innerHTML = clozeText;

  // Play the full sentence audio
  speakWord(w.word, w.sentence);

  setTimeout(function() { document.getElementById('swInput').focus(); }, 300);
}

function speakSWWord() {
  if (swCurrentWord) speakWord(swCurrentWord.word, swCurrentWord.sentence || null);
}

function checkSentence() {
  if (!swCurrentWord) return;
  var input = document.getElementById('swInput').value.trim();
  if (!input) return;

  var word = swCurrentWord.word.toLowerCase();
  var answer = input.toLowerCase();
  var ok = (answer === word);

  var box = document.getElementById('swFeedbackBox');
  box.style.display = 'block';

  // Show the complete sentence with the word highlighted
  var sentence = swCurrentWord.sentence || '';
  var wordRegex = new RegExp('(' + swCurrentWord.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i');
  var highlighted = sentence.replace(wordRegex, '<strong style="color:var(--green)">$1</strong>');

  if (ok) {
    box.innerHTML = '<div class="feedback-correct">\u2705 Rigtigt! ' + highlighted + '</div>';
  } else {
    box.innerHTML = '<div class="feedback-wrong">\u274C Du skrev: <strong>' + input + '</strong><br>' + highlighted + '</div>';
  }

  // Record result
  var result = {
    word: swCurrentWord.word, correct: ok, selfCorrected: false,
    userAnswer: input, category: swCurrentWord.category,
    patternHint: swCurrentWord.patternHint || '', level: swCurrentWord.level || 0
  };
  results.push(result);
  logAnswer(swCurrentWord.word, input, ok, 1, swCurrentWord.category, swCurrentWord.level || 0);
  updateSRWord(swCurrentWord.word, ok, swCurrentWord.category);
  updateCategoryLevel(swCurrentWord.category, ok, swCurrentWord.level || 0, input, swCurrentWord.misspelling);

  // Gamification
  if (ok) {
    sessionCorrectCount++;
    sessionCorrectStreak++;
    if (sessionCorrectStreak >= BOSS_TRIGGER_STREAK) {
      sessionCorrectStreak = 0;
      pendingBoss = pickBossWord({ word: swCurrentWord.word, category: swCurrentWord.category });
      pendingChest = true;
    }
  } else {
    sessionCorrectStreak = 0;
    trackCategoryError(swCurrentWord.category);
  }

  document.getElementById('swScoreCorrect').textContent = results.filter(function(r) { return r.correct; }).length;
  document.getElementById('swScoreWrong').textContent = results.filter(function(r) { return !r.correct; }).length;
  document.getElementById('swCheckBtn').classList.add('hidden');
  // Short delay before showing next button to prevent accidental skip
  setTimeout(function() {
    document.getElementById('swNextBtn').classList.remove('hidden');
    document.getElementById('swNextBtn').focus();
  }, 500);
}

var swWords = [], swIndex = 0, swResults = [];

function startWhatIsTheWord() {
  var profile = loadProfile();
  gameMode = 'sentence';
  isMixedSession = false;
  pendingBoss = null;
  sessionCorrectCount = 0; sessionCorrectStreak = 0; sessionCategoryErrors = {};
  sessionUsedWords = {};
  pendingChest = false;
  results = [];

  // Build pool from words with hints, level 1+
  var pool = [];
  for (var ci = 0; ci < ALL_CATEGORIES.length; ci++) {
    var cat = ALL_CATEGORIES[ci];
    if (!WORD_BANK[cat]) continue;
    pool = pool.concat(WORD_BANK[cat].filter(function(w) { return w.hint && w.level >= 1; }).map(function(w) { return Object.assign({}, w, { category: cat }); }));
  }
  pool = shuffle(pool);
  swWords = pool.slice(0, 10);
  swIndex = 0;
  swResults = [];
  for (var swi = 0; swi < swWords.length; swi++) sessionUsedWords[swWords[swi].word.toLowerCase()] = true;

  if (swWords.length < 3) { alert('Ikke nok ord.'); return; }

  hide('phase-welcome');
  show('phase-sentence');
  show('rewardBar');
  show('rewardXPBarWrap');
  updateRewardBar();

  renderSentenceWord(swWords[swIndex]);
}

function nextSentenceWord() {
  if (isMixedSession) { nextMixedItem(); return; }

  var chestOv = document.getElementById('chestOverlay');
  var bossOv = document.getElementById('bossOverlay');
  if ((chestOv && !chestOv.classList.contains('hidden')) || (bossOv && !bossOv.classList.contains('hidden')) || pendingLesson) return;

  if (pendingBoss) {
    pendingInterruptAction = (swIndex + 1) >= swWords.length ? 'finish' : 'continue';
    swIndex++;
    showBossMinigame(pendingBoss);
    return;
  }
  if (pendingChest) {
    pendingChest = false;
    pendingInterruptAction = (swIndex + 1) >= swWords.length ? 'finish' : 'continue';
    swIndex++;
    showTreasureChest();
    return;
  }

  swIndex++;
  if (swIndex >= swWords.length) {
    hide('phase-sentence');
    // Show results using training results
    var correctCount = results.filter(function(r) { return r.correct; }).length;
    var totalCount = results.length;
    awardSessionXP(correctCount, totalCount);
    updateRewardBar();
    show('rewardBar');
    show('rewardXPBarWrap');
    renderTrainingResults();
  } else {
    renderSentenceWord(swWords[swIndex]);
  }
}

// Enter key for sentence input
document.addEventListener('DOMContentLoaded', function() {
  var swInput = document.getElementById('swInput');
  if (swInput) {
    swInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var nextBtn = document.getElementById('swNextBtn');
        if (nextBtn && !nextBtn.classList.contains('hidden')) nextSentenceWord();
        else checkSentence();
      }
    });
  }
});

// ===== WORD MEMORY GAME =====

var wmState = null;

function startWordMemory() {
  gameMode = 'wordmemory';
  isMixedSession = false;
  results = [];
  sessionCorrectCount = 0; sessionCorrectStreak = 0; sessionCategoryErrors = {};

  // Build pairs from words with parseable morphemes (2 parts)
  var pool = [];
  for (var ci = 0; ci < ALL_CATEGORIES.length; ci++) {
    var cat = ALL_CATEGORIES[ci];
    if (!WORD_BANK[cat]) continue;
    WORD_BANK[cat].forEach(function(w) {
      var m = parseMorphemes(w.patternHint, w.word);
      if (m && m.length === 2) {
        pool.push({ word: w.word, parts: m, category: cat, level: w.level || 0 });
      }
    });
  }
  pool = shuffle(pool);

  // Take 8 pairs for a 4x4 grid, ensuring no ambiguous part combinations
  var pairs = [];
  var usedParts = {};
  for (var pi = 0; pi < pool.length && pairs.length < 8; pi++) {
    var p0 = pool[pi].parts[0].replace(/^-/, '').replace(/-$/, '').toLowerCase();
    var p1 = pool[pi].parts[1].replace(/^-/, '').replace(/-$/, '').toLowerCase();
    // Skip if either part is already used by another pair (prevents ambiguous matches)
    if (usedParts[p0] || usedParts[p1]) continue;
    usedParts[p0] = true;
    usedParts[p1] = true;
    pairs.push(pool[pi]);
  }
  if (pairs.length < 4) {
    alert('Ikke nok ord til ord-match.');
    return;
  }

  // Create tiles: each pair becomes 2 tiles
  var tiles = [];
  for (var i = 0; i < pairs.length; i++) {
    tiles.push({
      id: i * 2, pairId: i, text: pairs[i].parts[0],
      word: pairs[i].word, partIndex: 0, category: pairs[i].category, level: pairs[i].level
    });
    tiles.push({
      id: i * 2 + 1, pairId: i, text: pairs[i].parts[1],
      word: pairs[i].word, partIndex: 1, category: pairs[i].category, level: pairs[i].level
    });
  }
  tiles = shuffle(tiles);

  wmState = {
    tiles: tiles,
    selected: -1, // index of currently selected tile
    matched: [], // matched pair IDs
    moves: 0,
    locked: false,
    totalPairs: pairs.length
  };

  hide('phase-welcome');
  show('phase-wordmemory');
  show('rewardBar');
  show('rewardXPBarWrap');
  updateRewardBar();

  document.getElementById('wmMatched').textContent = '0';
  document.getElementById('wmMoves').textContent = '0';
  document.getElementById('wmPairs').textContent = pairs.length;
  document.getElementById('wmMatchedWords').innerHTML = '';
  document.getElementById('wmFeedbackBox').style.display = 'none';

  renderMemoryGrid();
}

function renderMemoryGrid() {
  var s = wmState;
  var html = '';
  for (var i = 0; i < s.tiles.length; i++) {
    var tile = s.tiles[i];
    var isMatched = s.matched.indexOf(tile.pairId) >= 0;
    var isSelected = s.selected === i;
    var cls = 'memory-tile';
    if (isSelected) cls += ' selected';
    if (isMatched) cls += ' matched';
    html += '<div class="' + cls + '" data-index="' + i + '" onclick="wmTap(' + i + ')">' + tile.text + '</div>';
  }
  document.getElementById('wmGrid').innerHTML = html;
}

function wmTap(index) {
  var s = wmState;
  if (!s || s.locked) return;
  var tile = s.tiles[index];

  // Skip matched tiles
  if (s.matched.indexOf(tile.pairId) >= 0) return;

  // First selection
  if (s.selected < 0 || s.selected === index) {
    s.selected = (s.selected === index) ? -1 : index; // toggle
    renderMemoryGrid();
    return;
  }

  // Second selection — check match
  s.moves++;
  document.getElementById('wmMoves').textContent = s.moves;
  var tile1 = s.tiles[s.selected];
  var tile2 = tile;
  var idx1 = s.selected;
  var idx2 = index;

  if (tile1.pairId === tile2.pairId && idx1 !== idx2) {
    // Match!
    s.matched.push(tile1.pairId);
    s.selected = -1;
    document.getElementById('wmMatched').textContent = s.matched.length;
    document.getElementById('wmPairs').textContent = s.totalPairs - s.matched.length;

    // Show matched word
    var wordsDiv = document.getElementById('wmMatchedWords');
    wordsDiv.innerHTML += '<span class="memory-matched-word">\u2705 ' + tile1.word + '</span>';

    speakWord(tile1.word, null);

    results.push({ word: tile1.word, correct: true, selfCorrected: false, userAnswer: tile1.word, category: tile1.category, patternHint: '', level: tile1.level });
    logAnswer(tile1.word, tile1.word, true, 1, tile1.category, tile1.level);
    updateSRWord(tile1.word, true, tile1.category);

    renderMemoryGrid();

    if (s.matched.length >= s.totalPairs) {
      setTimeout(function() { wmFinish(); }, 800);
    }
  } else {
    // No match — flash red
    s.locked = true;
    var el1 = document.querySelector('.memory-tile[data-index="' + idx1 + '"]');
    var el2 = document.querySelector('.memory-tile[data-index="' + idx2 + '"]');
    if (el1) el1.classList.add('wrong');
    if (el2) el2.classList.add('wrong');

    setTimeout(function() {
      if (el1) el1.classList.remove('wrong');
      if (el2) el2.classList.remove('wrong');
      s.selected = -1;
      s.locked = false;
      renderMemoryGrid();
    }, 600);
  }
}

function wmFinish() {
  var box = document.getElementById('wmFeedbackBox');
  box.style.display = 'block';

  var stars = wmState.moves <= wmState.totalPairs + 2 ? '\u2B50\u2B50\u2B50' :
             wmState.moves <= wmState.totalPairs + 5 ? '\u2B50\u2B50' : '\u2B50';

  box.innerHTML = '<div class="feedback-correct" style="text-align:center">' +
    '<div style="font-size:2rem;margin-bottom:8px">' + stars + '</div>' +
    '<strong>Alle ord samlet!</strong><br>' +
    wmState.matched.length + ' ord p\u00E5 ' + wmState.moves + ' fors\u00F8g' +
    '<div style="margin-top:12px">' +
    '<button class="btn btn-accent" onclick="startWordMemory()" style="margin-right:8px">\u{1F504} Spil igen</button>' +
    '<button class="btn btn-blue" onclick="goHome()">\u{1F3E0} Tilbage</button>' +
    '</div></div>';

  var correctCount = results.filter(function(r) { return r.correct; }).length;
  awardSessionXP(correctCount, correctCount);
  updateRewardBar();
}

// ===== VELKOMSTSKÆRM =====
function renderCategoryLevels() {
  var el = document.getElementById('categoryLevelsDisplay');
  if (!el || ALL_CATEGORIES.length === 0) return;
  var levels = loadCategoryLevels();
  var levelColors = ['#9ca3af', '#60a5fa', '#22d3a0', '#f5a623', '#f97316', '#f43f5e'];
  var html = '<div style="background:var(--card2);border-radius:12px;padding:12px 14px;border:1px solid #3d4270">' +
    '<div style="font-size:0.85rem;font-weight:700;color:var(--accent);margin-bottom:8px">Kategoriniveauer</div>';
  var masteredCount = countMasteredCategories(levels);
  for (var i = 0; i < ALL_CATEGORIES.length; i++) {
    var cat = ALL_CATEGORIES[i];
    var icon = CATEGORY_ICONS[cat] || '';
    var startLevel = CATEGORY_START_LEVELS[cat] !== undefined ? CATEGORY_START_LEVELS[cat] : 1;
    var catData = levels[cat] || { level: startLevel, history: [] };
    var lvl = catData.level;
    var hist = catData.history || [];
    var correct = hist.filter(function(h) { return h; }).length;
    var histStr = hist.length > 0 ? ' (' + correct + '/' + hist.length + ')' : '';
    var maxLvl = CATEGORY_MAX_LEVELS[cat] !== undefined ? CATEGORY_MAX_LEVELS[cat] : 5;
    var mastered = lvl >= maxLvl;
    // Locked French categories: hidden until N mastered, then locked, then purchasable
    var isFrench = (cat === 'Ord fra Fransk');
    var isFrench2 = (cat === 'Ord fra Fransk 2');
    var isAnyFrench = isFrench || isFrench2;
    var hideThreshold = isFrench ? 1 : isFrench2 ? 2 : 0;
    var lockThreshold = isFrench ? 2 : isFrench2 ? 4 : 0;
    if (isAnyFrench && masteredCount < hideThreshold) continue;
    // Only show Lydrette ord until it reaches level 1
    var lydretLevel = (levels['Lydrette ord'] && levels['Lydrette ord'].level !== undefined) ? levels['Lydrette ord'].level : 0;
    if (cat !== 'Lydrette ord' && lydretLevel < 1) continue;
    // Fremmedord: hidden until 2 other categories reach level 2
    if (cat === 'Fremmedord' && countCategoriesAtLevel(levels, 2) < 2) continue;
    var locked = isAnyFrench && masteredCount < lockThreshold;
    var isUnlocked = isFrench ? isFrenchUnlocked() : isFrench2 ? isFrench2Unlocked() : false;
    var purchasable = isAnyFrench && !locked && !isUnlocked;
    var fProgress = isAnyFrench ? getFrenchProgress(cat) : 0;
    var fTotal = isAnyFrench ? (WORD_BANK[cat] || []).length : 0;
    var fMastered = isAnyFrench && isUnlocked && fProgress >= fTotal;
    if (isAnyFrench) mastered = fMastered;
    var dimmed = mastered || locked || purchasable;
    var lvlText = locked ? '\u{1F512} L\u00E5st (' + masteredCount + '/' + lockThreshold + ')' :
                  purchasable ? '\u{1F512} Locked' :
                  isAnyFrench ? (fMastered ? 'Mestret \u2B50' : fProgress + '/' + fTotal) :
                  (mastered ? 'Mestret \u2B50' : 'Niv ' + lvl + '/' + (maxLvl - 1));
    var lvlColor = locked ? '#9ca3af' : purchasable ? 'var(--blue)' : (fMastered || mastered) ? 'var(--green)' : isAnyFrench ? 'var(--accent)' : levelColors[Math.min(lvl, 5)];
    var purchaseFn = isFrench ? 'purchaseFrench()' : 'purchaseFrench2()';
    var clickAttr = purchasable ? ' onclick="' + purchaseFn + '" style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:0.8rem;opacity:0.8;cursor:pointer"' :
      ' style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:0.8rem' + (dimmed ? ';opacity:0.6' : '') + '"';
    html += '<div' + clickAttr + '>' +
      '<span style="width:20px;text-align:center">' + icon + '</span>' +
      '<span style="flex:1;color:var(--text)">' + cat + '</span>' +
      '<span style="font-weight:700;color:' + lvlColor + '">' + lvlText + '</span>' +
      '<span style="color:var(--muted);font-size:0.7rem;min-width:40px;text-align:right">' + (dimmed ? '' : histStr) + '</span>' +
      '</div>';
    if (locked) {
      html += '<div style="font-size:0.72rem;color:var(--muted);padding:0 0 4px 28px;opacity:0.7">Opn\u00E5 Mestret i ' + lockThreshold + ' kategorier for at \u00E5bne</div>';
    }
    if (purchasable) {
      html += '<div style="font-size:0.72rem;color:var(--blue);padding:0 0 4px 28px;opacity:0.8">Klik for at l\u00E5se op med 10 \u{1F48E}</div>';
    }
  }
  html += '</div>';
  el.innerHTML = html;
}


// ===== INITIALISERING =====
window.addEventListener('load', function() {
  window.speechSynthesis.getVoices();
  // Load word bank from JSON
  fetch('words.json')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      WORD_BANK = data;
      ALL_CATEGORIES = Object.keys(WORD_BANK);
      initApp();
    })
    .catch(function(err) {
      console.error('Kunne ikke hente words.json:', err);
      document.getElementById('phase-welcome').innerHTML = '<div style="text-align:center;padding:40px"><h2 style="color:var(--red)">Fejl</h2><p style="color:var(--muted)">Kunne ikke hente ordbanken. Prøv at genindlæse siden.</p></div>';
    });
});

function initApp() {
  // Load audio manifest for pre-generated audio files
  fetch('audio-manifest.json')
    .then(function(res) { return res.json(); })
    .then(function(data) { audioManifest = data; console.log('Lydmanifest indlæst (' + Object.keys(data).length + ' ord)'); })
    .catch(function() { console.log('Ingen pre-genererede lydfiler fundet, bruger TTS API/browser'); });

  var savedKey = loadApiKey();
  var keyInput = document.getElementById('apiKeyInput');
  if (keyInput && savedKey) { keyInput.value = savedKey; updateApiStatus(savedKey); }
  updateApiStatus2(savedKey);
  var savedAnthropicKey = loadAnthropicKey();
  var anthropicInput = document.getElementById('anthropicKeyInput');
  if (anthropicInput && savedAnthropicKey) { anthropicInput.value = savedAnthropicKey; updateAnthropicStatus(savedAnthropicKey); }
  setVoice(loadVoice());

  // Multi-profil initialization
  var justMigrated = migrateOldData();
  var players = loadPlayersList();
  var lastPlayer = '';
  try { lastPlayer = localStorage.getItem('last_player') || ''; } catch(e) {}

  if (justMigrated) {
    hide('phase-welcome');
    show('phase-profile-picker');
    show('migrationHint');
    renderProfilePicker();
  } else if (players.length === 1 && lastPlayer) {
    selectPlayer(players[0]);
  } else if (players.length > 1 && lastPlayer && players.indexOf(lastPlayer) !== -1) {
    selectPlayer(lastPlayer);
  } else {
    hide('phase-welcome');
    show('phase-profile-picker');
    renderProfilePicker();
  }
}

// ===== GEMS SHOP =====

var SHOP_CATALOG = {
  themes: [
    // Starter (3-5 gems)
    { id: 'ocean', name: 'Ocean', emoji: '\u{1F30A}', price: 3, tier: 'starter',
      vars: { '--bg': '#0a1628', '--card': '#112240', '--card2': '#1a3358', '--accent': '#22d3a0', '--accent2': '#0ea5e9' },
      gradient: 'radial-gradient(ellipse at 20% 20%, #0c2d5e 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #0a3d3d 0%, transparent 50%)' },
    { id: 'forest', name: 'Skov', emoji: '\u{1F332}', price: 4, tier: 'starter',
      vars: { '--bg': '#0b1a0b', '--card': '#142814', '--card2': '#1e3a1e', '--accent': '#4ade80', '--accent2': '#a3e635' },
      gradient: 'radial-gradient(ellipse at 30% 30%, #1a3a1a 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, #0d2a0d 0%, transparent 50%)' },
    { id: 'cherry', name: 'Kirsebaer', emoji: '\u{1F338}', price: 4, tier: 'starter',
      vars: { '--bg': '#1a0a14', '--card': '#2d142a', '--card2': '#3d1e38', '--accent': '#f472b6', '--accent2': '#e879f9' },
      gradient: 'radial-gradient(ellipse at 20% 20%, #3d1033 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #1a0a2e 0%, transparent 50%)' },
    { id: 'midnight', name: 'Midnat', emoji: '\u{1F319}', price: 3, tier: 'starter',
      vars: { '--bg': '#050510', '--card': '#0e0e20', '--card2': '#161630', '--accent': '#818cf8', '--accent2': '#6366f1' },
      gradient: 'radial-gradient(ellipse at 20% 20%, #10103a 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #050520 0%, transparent 50%)' },
    // Standard (10-15 gems)
    { id: 'sunset', name: 'Solnedgang', emoji: '\u{1F305}', price: 10, tier: 'standard',
      vars: { '--bg': '#1a0c05', '--card': '#2d1a0e', '--card2': '#3d2518', '--accent': '#fb923c', '--accent2': '#f43f5e' },
      gradient: 'radial-gradient(ellipse at 20% 30%, #4a1a08 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, #2d0a1a 0%, transparent 50%)' },
    { id: 'arctic', name: 'Arktisk', emoji: '\u{1F3D4}\uFE0F', price: 12, tier: 'standard',
      vars: { '--bg': '#0a1520', '--card': '#152535', '--card2': '#1e3548', '--accent': '#7dd3fc', '--accent2': '#bae6fd' },
      gradient: 'radial-gradient(ellipse at 30% 20%, #0c3555 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, #0a2540 0%, transparent 50%)' },
    { id: 'candy', name: 'Slik', emoji: '\u{1F36C}', price: 15, tier: 'standard',
      vars: { '--bg': '#1a0a1e', '--card': '#2a1430', '--card2': '#381e42', '--accent': '#f0abfc', '--accent2': '#fbbf24' },
      gradient: 'radial-gradient(ellipse at 20% 20%, #3d1050 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #1a1040 0%, transparent 50%)' },
    { id: 'galaxy', name: 'Galakse', emoji: '\u{1F30C}', price: 15, tier: 'standard',
      vars: { '--bg': '#08051a', '--card': '#12102e', '--card2': '#1c1840', '--accent': '#a78bfa', '--accent2': '#6366f1' },
      gradient: 'radial-gradient(ellipse at 25% 25%, #2a1060 0%, transparent 50%), radial-gradient(ellipse at 75% 75%, #0a0a40 0%, transparent 50%)' },
    // Premium (25-40 gems)
    { id: 'lava', name: 'Lava', emoji: '\u{1F525}', price: 25, tier: 'premium',
      vars: { '--bg': '#1a0805', '--card': '#2d120e', '--card2': '#3d1c18', '--accent': '#ef4444', '--accent2': '#f97316' },
      gradient: 'radial-gradient(ellipse at 30% 70%, #4a1008 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, #3d1505 0%, transparent 50%)' },
    { id: 'dragon', name: 'Drage', emoji: '\u{1F409}', price: 30, tier: 'premium',
      vars: { '--bg': '#0a1205', '--card': '#162010', '--card2': '#1e2d18', '--accent': '#fbbf24', '--accent2': '#4ade80' },
      gradient: 'radial-gradient(ellipse at 20% 20%, #1a3008 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #0d1a0a 0%, transparent 50%)' },
    { id: 'retro', name: 'Retro', emoji: '\u{1F47E}', price: 35, tier: 'premium',
      vars: { '--bg': '#000000', '--card': '#0a0a0a', '--card2': '#141414', '--accent': '#22c55e', '--accent2': '#4ade80' },
      gradient: 'radial-gradient(ellipse at 50% 50%, #001a00 0%, transparent 70%)' },
    { id: 'rainbow', name: 'Regnbue', emoji: '\u{1F984}', price: 40, tier: 'premium',
      vars: { '--bg': '#0f0818', '--card': '#1a1028', '--card2': '#241838', '--accent': '#e879f9', '--accent2': '#fb923c' },
      gradient: 'radial-gradient(ellipse at 20% 20%, #2a1050 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #102a3a 0%, transparent 50%)' },
    // Legendarisk (60 gems)
    { id: 'gold', name: 'Guld', emoji: '\u26A1', price: 60, tier: 'legend',
      vars: { '--bg': '#0a0800', '--card': '#1a1508', '--card2': '#2a2010', '--accent': '#fbbf24', '--accent2': '#f59e0b' },
      gradient: 'radial-gradient(ellipse at 30% 30%, #3d2a00 0%, transparent 50%), radial-gradient(ellipse at 70% 70%, #1a1200 0%, transparent 50%)' }
  ],

  nameStyles: [
    { id: 'color-red', name: 'Roed', price: 3, tier: 'starter', type: 'color', css: 'color:#ef4444' },
    { id: 'color-blue', name: 'Blaa', price: 3, tier: 'starter', type: 'color', css: 'color:#3b82f6' },
    { id: 'color-green', name: 'Groen', price: 3, tier: 'starter', type: 'color', css: 'color:#22c55e' },
    { id: 'color-purple', name: 'Lilla', price: 3, tier: 'starter', type: 'color', css: 'color:#a855f7' },
    { id: 'color-orange', name: 'Orange', price: 3, tier: 'starter', type: 'color', css: 'color:#f97316' },
    { id: 'color-cyan', name: 'Cyan', price: 3, tier: 'starter', type: 'color', css: 'color:#06b6d4' },
    { id: 'color-pink', name: 'Pink', price: 3, tier: 'starter', type: 'color', css: 'color:#ec4899' },
    { id: 'color-gold', name: 'Guld', price: 3, tier: 'starter', type: 'color', css: 'color:#fbbf24' },
    { id: 'glow-red', name: 'Gloed Roed', price: 8, tier: 'standard', type: 'glow', css: 'color:#ef4444;text-shadow:0 0 8px #ef4444,0 0 16px #ef444488' },
    { id: 'glow-blue', name: 'Gloed Blaa', price: 8, tier: 'standard', type: 'glow', css: 'color:#3b82f6;text-shadow:0 0 8px #3b82f6,0 0 16px #3b82f688' },
    { id: 'glow-green', name: 'Gloed Groen', price: 8, tier: 'standard', type: 'glow', css: 'color:#22c55e;text-shadow:0 0 8px #22c55e,0 0 16px #22c55e88' },
    { id: 'glow-purple', name: 'Gloed Lilla', price: 8, tier: 'standard', type: 'glow', css: 'color:#a855f7;text-shadow:0 0 8px #a855f7,0 0 16px #a855f788' },
    { id: 'glow-orange', name: 'Gloed Orange', price: 8, tier: 'standard', type: 'glow', css: 'color:#f97316;text-shadow:0 0 8px #f97316,0 0 16px #f9731688' },
    { id: 'glow-cyan', name: 'Gloed Cyan', price: 8, tier: 'standard', type: 'glow', css: 'color:#06b6d4;text-shadow:0 0 8px #06b6d4,0 0 16px #06b6d488' },
    { id: 'glow-pink', name: 'Gloed Pink', price: 8, tier: 'standard', type: 'glow', css: 'color:#ec4899;text-shadow:0 0 8px #ec4899,0 0 16px #ec489988' },
    { id: 'glow-gold', name: 'Gloed Guld', price: 8, tier: 'standard', type: 'glow', css: 'color:#fbbf24;text-shadow:0 0 8px #fbbf24,0 0 16px #fbbf2488' },
    { id: 'bold', name: 'Fed skrift', price: 5, tier: 'starter', type: 'font', css: 'font-family:Fredoka One,cursive' }
  ],

  nameFrames: [
    { id: 'shield', name: 'Skjold', emoji: '\u{1F6E1}\uFE0F', price: 15, tier: 'premium', cssClass: 'frame-shield' },
    { id: 'explosion', name: 'Eksplosion', emoji: '\u{1F4A5}', price: 20, tier: 'premium', cssClass: 'frame-explosion' },
    { id: 'radioactive', name: 'Radioaktiv', emoji: '\u2622\uFE0F', price: 25, tier: 'premium', cssClass: 'frame-radioactive' },
    { id: 'ribbon', name: 'Sloejfe', emoji: '\u{1F380}', price: 15, tier: 'premium', cssClass: 'frame-ribbon' },
    { id: 'viking', name: 'Viking', emoji: '\u2694\uFE0F', price: 30, tier: 'premium', cssClass: 'frame-viking' },
    { id: 'royal', name: 'Royal', emoji: '\u{1F451}', price: 50, tier: 'legend', cssClass: 'frame-royal' }
  ],

  stickers: [
    // Dyr (3-5 gems)
    { id: 'cat', emoji: '\u{1F431}', name: 'Kat', price: 3, tier: 'starter' },
    { id: 'dog', emoji: '\u{1F436}', name: 'Hund', price: 3, tier: 'starter' },
    { id: 'fox', emoji: '\u{1F98A}', name: 'Raev', price: 3, tier: 'starter' },
    { id: 'frog', emoji: '\u{1F438}', name: 'Froe', price: 3, tier: 'starter' },
    { id: 'butterfly', emoji: '\u{1F98B}', name: 'Sommerfugl', price: 5, tier: 'starter' },
    { id: 'turtle', emoji: '\u{1F422}', name: 'Skildpadde', price: 5, tier: 'starter' },
    { id: 'octopus', emoji: '\u{1F419}', name: 'Blaeksprutte', price: 5, tier: 'starter' },
    { id: 'dino', emoji: '\u{1F996}', name: 'Dino', price: 5, tier: 'starter' },
    // Sjove (5-10 gems)
    { id: 'poo', emoji: '\u{1F4A9}', name: 'Lort', price: 5, tier: 'standard' },
    { id: 'alien', emoji: '\u{1F47D}', name: 'Alien', price: 5, tier: 'standard' },
    { id: 'robot', emoji: '\u{1F916}', name: 'Robot', price: 5, tier: 'standard' },
    { id: 'ghost', emoji: '\u{1F47B}', name: 'Spoegelse', price: 5, tier: 'standard' },
    { id: 'pumpkin', emoji: '\u{1F383}', name: 'Graeskar', price: 8, tier: 'standard' },
    { id: 'skull', emoji: '\u{1F480}', name: 'Kranie', price: 8, tier: 'standard' },
    { id: 'clown', emoji: '\u{1F921}', name: 'Klovn', price: 10, tier: 'standard' },
    { id: 'zombie', emoji: '\u{1F9DF}', name: 'Zombie', price: 10, tier: 'standard' },
    // Sejhed (10-15 gems)
    { id: 'lightning', emoji: '\u26A1', name: 'Lyn', price: 10, tier: 'standard' },
    { id: 'fire', emoji: '\u{1F525}', name: 'Ild', price: 10, tier: 'standard' },
    { id: 'diamond', emoji: '\u{1F48E}', name: 'Diamant', price: 10, tier: 'standard' },
    { id: 'sword', emoji: '\u{1F5E1}\uFE0F', name: 'Svaerd', price: 12, tier: 'standard' },
    { id: 'pirate', emoji: '\u{1F3F4}\u200D\u2620\uFE0F', name: 'Pirat', price: 12, tier: 'standard' },
    { id: 'guitar', emoji: '\u{1F3B8}', name: 'Guitar', price: 12, tier: 'standard' },
    { id: 'skateboard', emoji: '\u{1F6F9}', name: 'Skateboard', price: 15, tier: 'standard' },
    { id: 'rocket', emoji: '\u{1F680}', name: 'Raket', price: 15, tier: 'standard' },
    // Natur & mad (5-10 gems)
    { id: 'rainbow', emoji: '\u{1F308}', name: 'Regnbue', price: 5, tier: 'standard' },
    { id: 'star', emoji: '\u2B50', name: 'Stjerne', price: 5, tier: 'standard' },
    { id: 'moon', emoji: '\u{1F319}', name: 'Maane', price: 5, tier: 'standard' },
    { id: 'pizza', emoji: '\u{1F355}', name: 'Pizza', price: 5, tier: 'standard' },
    { id: 'icecream', emoji: '\u{1F366}', name: 'Is', price: 5, tier: 'standard' },
    { id: 'cake', emoji: '\u{1F382}', name: 'Kage', price: 8, tier: 'standard' },
    { id: 'donut', emoji: '\u{1F369}', name: 'Donut', price: 8, tier: 'standard' },
    { id: 'taco', emoji: '\u{1F32E}', name: 'Taco', price: 8, tier: 'standard' },
    // Sjaeldne (25-40 gems)
    { id: 'trophy', emoji: '\u{1F3C6}', name: 'Trofae', price: 25, tier: 'premium' },
    { id: 'crown', emoji: '\u{1F451}', name: 'Krone', price: 25, tier: 'premium' },
    { id: 'unicorn', emoji: '\u{1F984}', name: 'Enhjorning', price: 30, tier: 'premium' },
    { id: 'dragonSticker', emoji: '\u{1F432}', name: 'Drage', price: 30, tier: 'premium' },
    { id: 'comet', emoji: '\u2604\uFE0F', name: 'Komet', price: 35, tier: 'premium' },
    { id: 'volcano', emoji: '\u{1F30B}', name: 'Vulkan', price: 35, tier: 'premium' },
    { id: 'circus', emoji: '\u{1F3AA}', name: 'Cirkus', price: 40, tier: 'premium' },
    { id: 'crystal', emoji: '\u{1F52E}', name: 'Krystal', price: 40, tier: 'premium' },
    // Legendariske (50 gems)
    { id: 'lightningFox', emoji: '\u26A1\u{1F98A}', name: 'Lynraev', price: 50, tier: 'legend' },
    { id: 'goldenDragon', emoji: '\u{1F409}\u2728', name: 'Gylden Drage', price: 50, tier: 'legend' }
  ]
};

var TIER_COLORS = {
  starter: '#9ca3af', standard: '#22d3a0', premium: '#a855f7', legend: '#fbbf24'
};
var TIER_LABELS = {
  starter: 'Starter', standard: 'Standard', premium: 'Premium', legend: 'Legendaer'
};

function getShopData() {
  var data = loadRewardData();
  if (!data.shop) {
    data.shop = {
      owned: { themes: [], nameplates: [], stickers: [] },
      active: { theme: null, nameStyle: null, nameFrame: null, stickers: { welcome_1: null, welcome_2: null, welcome_3: null, welcome_4: null, rewardbar: null } }
    };
  }
  return data;
}

function ownsItem(data, category, itemId) {
  return data.shop.owned[category] && data.shop.owned[category].indexOf(itemId) >= 0;
}

function buyItem(category, itemId, price) {
  var data = getShopData();
  if (data.gems < price) return false;
  if (ownsItem(data, category, itemId)) return false;
  data.gems -= price;
  if (!data.shop.owned[category]) data.shop.owned[category] = [];
  data.shop.owned[category].push(itemId);
  saveRewardData(data);
  return true;
}

function activateItem(category, itemId) {
  var data = getShopData();
  if (category === 'themes') data.shop.active.theme = itemId;
  else if (category === 'nameplates') data.shop.active.nameStyle = itemId;
  else if (category === 'nameFrames') data.shop.active.nameFrame = itemId;
  saveRewardData(data);
}

function setSticker(slot, stickerId) {
  var data = getShopData();
  data.shop.active.stickers[slot] = stickerId || null;
  saveRewardData(data);
}

var DEFAULT_THEME_VARS = {
  '--bg': '#0f1117', '--card': '#1a1d2e', '--card2': '#222540',
  '--accent': '#f5a623', '--accent2': '#7c3aed',
  '--green': '#22d3a0', '--red': '#f43f5e', '--blue': '#0ea5e9',
  '--text': '#e8eaf6', '--muted': '#8892b0'
};
var DEFAULT_GRADIENT = 'radial-gradient(ellipse at 20% 20%, #1e1060 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #0d2a1a 0%, transparent 50%)';

function applyTheme(themeId) {
  var root = document.documentElement;
  if (!themeId) {
    Object.keys(DEFAULT_THEME_VARS).forEach(function(k) { root.style.setProperty(k, DEFAULT_THEME_VARS[k]); });
    document.body.style.backgroundImage = DEFAULT_GRADIENT;
    return;
  }
  var theme = SHOP_CATALOG.themes.find(function(t) { return t.id === themeId; });
  if (!theme) return;
  Object.keys(DEFAULT_THEME_VARS).forEach(function(k) {
    root.style.setProperty(k, theme.vars[k] || DEFAULT_THEME_VARS[k]);
  });
  if (theme.gradient) document.body.style.backgroundImage = theme.gradient;
}

function applyPlayerCosmetics() {
  var data = getShopData();
  applyTheme(data.shop.active.theme);
  applyNameStyle(data.shop.active.nameStyle, data.shop.active.nameFrame);
  renderActiveStickers(data.shop.active.stickers);
}

function applyNameStyle(styleId, frameId) {
  var nameEl = document.getElementById('playerNameDisplay');
  var avatarSection = document.getElementById('welcomeAvatarSection');
  if (!nameEl) return;

  // Reset
  nameEl.removeAttribute('style');
  // Fjern alle ramme-klasser
  var frameClasses = ['frame-shield','frame-explosion','frame-radioactive','frame-ribbon','frame-viking','frame-royal'];
  frameClasses.forEach(function(cls) { if (avatarSection) avatarSection.classList.remove(cls); });

  // Anvend tekst-stil
  if (styleId) {
    var style = SHOP_CATALOG.nameStyles.find(function(s) { return s.id === styleId; });
    if (style) nameEl.setAttribute('style', style.css);
  }

  // Anvend ramme
  if (frameId) {
    var frame = SHOP_CATALOG.nameFrames.find(function(f) { return f.id === frameId; });
    if (frame && avatarSection) avatarSection.classList.add(frame.cssClass);
  }
}

function renderActiveStickers(stickers) {
  if (!stickers) return;
  var card = document.getElementById('phase-welcome');
  if (!card) return;

  // Fjern gamle sticker-pladser
  card.querySelectorAll('.sticker-slot').forEach(function(el) { el.remove(); });

  var positions = {
    welcome_1: 'top:8px;left:8px',
    welcome_2: 'top:8px;right:8px',
    welcome_3: 'bottom:8px;left:8px',
    welcome_4: 'bottom:8px;right:8px'
  };

  // Sørg for at card har position:relative
  card.style.position = 'relative';

  Object.keys(positions).forEach(function(slot) {
    var el = document.createElement('div');
    el.className = 'sticker-slot' + (stickers[slot] ? '' : ' empty');
    el.setAttribute('style', 'position:absolute;' + positions[slot]);
    el.onclick = function() { openStickerPicker(slot); };
    if (stickers[slot]) {
      var sticker = SHOP_CATALOG.stickers.find(function(s) { return s.id === stickers[slot]; });
      el.textContent = sticker ? sticker.emoji : stickers[slot];
    } else {
      el.textContent = '+';
    }
    card.appendChild(el);
  });

  // Reward bar sticker
  var bar = document.getElementById('rewardBar');
  if (bar) {
    var existing = bar.querySelector('.rewardbar-sticker');
    if (existing) existing.remove();
    if (stickers.rewardbar) {
      var sticker = SHOP_CATALOG.stickers.find(function(s) { return s.id === stickers.rewardbar; });
      if (sticker) {
        var badge = document.createElement('span');
        badge.className = 'rewardbar-sticker';
        badge.textContent = sticker.emoji;
        bar.appendChild(badge);
      }
    }
  }
}

var shopTab = 'themes';

function openShop() {
  shopTab = 'themes';
  renderShop();
  document.getElementById('shopOverlay').classList.remove('hidden');
}

function closeShop() {
  document.getElementById('shopOverlay').classList.add('hidden');
}

function switchShopTab(tab) {
  shopTab = tab;
  renderShop();
}

function renderShop() {
  var data = getShopData();
  var overlay = document.getElementById('shopOverlay');

  var html = '<div style="background:var(--card);border-radius:16px;padding:20px;max-width:560px;width:95%;margin:0 auto;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;position:relative">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<h2 style="color:var(--accent);font-size:1.3rem">\u{1F6D2} Shop</h2>';
  html += '<div style="display:flex;align-items:center;gap:12px">';
  html += '<span style="color:var(--blue);font-weight:700">\u{1F48E} ' + data.gems + '</span>';
  html += '<button onclick="closeShop()" style="background:none;border:none;color:var(--muted);font-size:1.5rem;cursor:pointer">\u2715</button>';
  html += '</div></div>';

  // Faner
  html += '<div class="shop-tabs">';
  html += '<button class="shop-tab' + (shopTab === 'themes' ? ' active' : '') + '" onclick="switchShopTab(\'themes\')">\u{1F3A8} Temaer</button>';
  html += '<button class="shop-tab' + (shopTab === 'names' ? ' active' : '') + '" onclick="switchShopTab(\'names\')">\u270F\uFE0F Navne</button>';
  html += '<button class="shop-tab' + (shopTab === 'stickers' ? ' active' : '') + '" onclick="switchShopTab(\'stickers\')">\u2B50 Stickers</button>';
  html += '</div>';

  // Indhold
  html += '<div class="shop-grid">';
  if (shopTab === 'themes') html += renderShopThemes(data);
  else if (shopTab === 'names') html += renderShopNames(data);
  else if (shopTab === 'stickers') html += renderShopStickers(data);
  html += '</div>';

  html += '</div>';
  overlay.innerHTML = html;
}

function renderShopThemes(data) {
  var html = '';
  SHOP_CATALOG.themes.forEach(function(theme) {
    var owned = ownsItem(data, 'themes', theme.id);
    var isActive = data.shop.active.theme === theme.id;
    var canAfford = data.gems >= theme.price;
    var cls = 'shop-item' + (isActive ? ' active-item' : (owned ? ' owned' : ''));

    var previewBg = theme.vars['--bg'] || '#0f1117';
    var previewAccent = theme.vars['--accent'] || '#f5a623';

    html += '<div class="' + cls + '">';
    html += '<div style="width:100%;height:40px;border-radius:8px;margin-bottom:6px;background:' + previewBg + ';border:1px solid ' + previewAccent + '"></div>';
    html += '<div class="shop-item-emoji">' + theme.emoji + '</div>';
    html += '<div class="shop-item-name">' + theme.name + '</div>';
    html += '<div class="shop-item-tier" style="color:' + TIER_COLORS[theme.tier] + '">' + TIER_LABELS[theme.tier] + '</div>';

    if (isActive) {
      html += '<div class="shop-item-btn" style="background:var(--green);color:#fff">Aktiv \u2714</div>';
    } else if (owned) {
      html += '<div class="shop-item-btn" style="background:var(--card);color:var(--green);border:1px solid var(--green)" onclick="event.stopPropagation();shopActivateTheme(\'' + theme.id + '\')">Brug</div>';
    } else {
      html += '<div class="shop-item-btn" style="background:' + (canAfford ? 'var(--accent)' : 'var(--muted)') + ';color:#fff" onclick="event.stopPropagation();shopBuyTheme(\'' + theme.id + '\',' + theme.price + ')">\u{1F48E} ' + theme.price + '</div>';
    }
    html += '</div>';
  });
  return html;
}

function shopBuyTheme(id, price) {
  if (buyItem('themes', id, price)) {
    activateItem('themes', id);
    applyTheme(id);
    renderShop();
    updateRewardBar();
    var gemsEl = document.getElementById('welcomeGemsDisplay');
    if (gemsEl) gemsEl.textContent = '\u{1F48E} ' + loadRewardData().gems;
  }
}

function shopActivateTheme(id) {
  activateItem('themes', id);
  applyTheme(id);
  renderShop();
}

function renderShopNames(data) {
  var html = '<div style="grid-column:1/-1;font-size:0.8rem;font-weight:700;color:var(--accent);padding:4px 0">Tekst-farver & effekter</div>';

  SHOP_CATALOG.nameStyles.forEach(function(style) {
    var owned = ownsItem(data, 'nameplates', style.id);
    var isActive = data.shop.active.nameStyle === style.id;
    var canAfford = data.gems >= style.price;
    var cls = 'shop-item' + (isActive ? ' active-item' : (owned ? ' owned' : ''));

    html += '<div class="' + cls + '">';
    html += '<div style="font-size:1.3rem;margin-bottom:4px;' + style.css + '">Abc</div>';
    html += '<div class="shop-item-name">' + style.name + '</div>';
    html += '<div class="shop-item-tier" style="color:' + TIER_COLORS[style.tier] + '">' + TIER_LABELS[style.tier] + '</div>';

    if (isActive) {
      html += '<div class="shop-item-btn" style="background:var(--green);color:#fff">Aktiv \u2714</div>';
    } else if (owned) {
      html += '<div class="shop-item-btn" style="background:var(--card);color:var(--green);border:1px solid var(--green)" onclick="event.stopPropagation();shopActivateName(\'' + style.id + '\')">Brug</div>';
    } else {
      html += '<div class="shop-item-btn" style="background:' + (canAfford ? 'var(--accent)' : 'var(--muted)') + ';color:#fff" onclick="event.stopPropagation();shopBuyName(\'' + style.id + '\',' + style.price + ')">\u{1F48E} ' + style.price + '</div>';
    }
    html += '</div>';
  });

  html += '<div style="grid-column:1/-1;font-size:0.8rem;font-weight:700;color:var(--accent);padding:8px 0 4px">Navne-rammer</div>';

  SHOP_CATALOG.nameFrames.forEach(function(frame) {
    var owned = ownsItem(data, 'nameplates', frame.id);
    var isActive = data.shop.active.nameFrame === frame.id;
    var canAfford = data.gems >= frame.price;
    var cls = 'shop-item' + (isActive ? ' active-item' : (owned ? ' owned' : ''));

    html += '<div class="' + cls + '">';
    html += '<div class="shop-item-emoji">' + frame.emoji + '</div>';
    html += '<div class="shop-item-name">' + frame.name + '</div>';
    html += '<div class="shop-item-tier" style="color:' + TIER_COLORS[frame.tier] + '">' + TIER_LABELS[frame.tier] + '</div>';

    if (isActive) {
      html += '<div class="shop-item-btn" style="background:var(--green);color:#fff">Aktiv \u2714</div>';
    } else if (owned) {
      html += '<div class="shop-item-btn" style="background:var(--card);color:var(--green);border:1px solid var(--green)" onclick="event.stopPropagation();shopActivateFrame(\'' + frame.id + '\')">Brug</div>';
    } else {
      html += '<div class="shop-item-btn" style="background:' + (canAfford ? 'var(--accent)' : 'var(--muted)') + ';color:#fff" onclick="event.stopPropagation();shopBuyFrame(\'' + frame.id + '\',' + frame.price + ')">\u{1F48E} ' + frame.price + '</div>';
    }
    html += '</div>';
  });
  return html;
}

function shopBuyName(id, price) {
  if (buyItem('nameplates', id, price)) {
    activateItem('nameplates', id);
    applyNameStyle(id, getShopData().shop.active.nameFrame);
    renderShop();
    updateRewardBar();
    var gemsEl = document.getElementById('welcomeGemsDisplay');
    if (gemsEl) gemsEl.textContent = '\u{1F48E} ' + loadRewardData().gems;
  }
}

function shopActivateName(id) {
  activateItem('nameplates', id);
  applyNameStyle(id, getShopData().shop.active.nameFrame);
  renderShop();
}

function shopBuyFrame(id, price) {
  if (buyItem('nameplates', id, price)) {
    var data = getShopData();
    data.shop.active.nameFrame = id;
    saveRewardData(data);
    applyNameStyle(data.shop.active.nameStyle, id);
    renderShop();
    updateRewardBar();
    var gemsEl = document.getElementById('welcomeGemsDisplay');
    if (gemsEl) gemsEl.textContent = '\u{1F48E} ' + loadRewardData().gems;
  }
}

function shopActivateFrame(id) {
  var data = getShopData();
  data.shop.active.nameFrame = id;
  saveRewardData(data);
  applyNameStyle(data.shop.active.nameStyle, id);
  renderShop();
}

function renderShopStickers(data) {
  var html = '';

  // Sticker-placering sektion
  html += '<div style="grid-column:1/-1;background:var(--card);border-radius:10px;padding:10px;margin-bottom:8px;border:1px solid #3d4270">';
  html += '<div style="font-size:0.8rem;font-weight:700;color:var(--accent);margin-bottom:8px">Mine pladser</div>';
  html += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">';
  var slotLabels = { welcome_1: 'Hjoerne 1', welcome_2: 'Hjoerne 2', welcome_3: 'Hjoerne 3', welcome_4: 'Hjoerne 4', rewardbar: 'Badge' };
  Object.keys(slotLabels).forEach(function(slot) {
    var stickerId = data.shop.active.stickers[slot];
    var sticker = stickerId ? SHOP_CATALOG.stickers.find(function(s) { return s.id === stickerId; }) : null;
    html += '<div style="text-align:center;cursor:pointer" onclick="openStickerPicker(\'' + slot + '\')">';
    html += '<div style="width:40px;height:40px;border-radius:8px;background:var(--card2);border:2px dashed #3d4270;display:flex;align-items:center;justify-content:center;font-size:1.4rem">';
    html += sticker ? sticker.emoji : '<span style="color:#3d4270">+</span>';
    html += '</div>';
    html += '<div style="font-size:0.6rem;color:var(--muted);margin-top:2px">' + slotLabels[slot] + '</div>';
    html += '</div>';
  });
  html += '</div></div>';

  // Stickers til salg
  html += '<div style="grid-column:1/-1;font-size:0.8rem;font-weight:700;color:var(--accent);padding:4px 0">Koeb stickers</div>';

  SHOP_CATALOG.stickers.forEach(function(sticker) {
    var owned = ownsItem(data, 'stickers', sticker.id);
    var canAfford = data.gems >= sticker.price;
    var cls = 'shop-item' + (owned ? ' owned' : '');

    html += '<div class="' + cls + '">';
    html += '<div class="shop-item-emoji">' + sticker.emoji + '</div>';
    html += '<div class="shop-item-name">' + sticker.name + '</div>';
    html += '<div class="shop-item-tier" style="color:' + TIER_COLORS[sticker.tier] + '">' + TIER_LABELS[sticker.tier] + '</div>';

    if (owned) {
      html += '<div class="shop-item-btn" style="background:var(--green);color:#fff">Ejet \u2714</div>';
    } else {
      html += '<div class="shop-item-btn" style="background:' + (canAfford ? 'var(--accent)' : 'var(--muted)') + ';color:#fff" onclick="event.stopPropagation();shopBuySticker(\'' + sticker.id + '\',' + sticker.price + ')">\u{1F48E} ' + sticker.price + '</div>';
    }
    html += '</div>';
  });
  return html;
}

function shopBuySticker(id, price) {
  if (buyItem('stickers', id, price)) {
    renderShop();
    updateRewardBar();
    var gemsEl = document.getElementById('welcomeGemsDisplay');
    if (gemsEl) gemsEl.textContent = '\u{1F48E} ' + loadRewardData().gems;
  }
}

function openStickerPicker(slot) {
  var data = getShopData();
  var owned = data.shop.owned.stickers || [];
  if (owned.length === 0) return;

  var html = '<div style="background:var(--card);border-radius:16px;padding:20px;max-width:340px;margin:0 auto;text-align:center">';
  html += '<h3 style="color:var(--accent);margin-bottom:12px">Vaelg sticker</h3>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:14px">';

  // "Ingen" mulighed
  html += '<div style="width:48px;height:48px;border-radius:10px;background:var(--card2);border:2px solid #3d4270;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.8rem;color:var(--muted)" onclick="pickSticker(\'' + slot + '\',null)">\u2715</div>';

  owned.forEach(function(id) {
    var sticker = SHOP_CATALOG.stickers.find(function(s) { return s.id === id; });
    if (!sticker) return;
    var isActive = data.shop.active.stickers[slot] === id;
    html += '<div style="width:48px;height:48px;border-radius:10px;background:var(--card2);border:2px solid ' + (isActive ? 'var(--green)' : '#3d4270') + ';display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1.8rem" onclick="pickSticker(\'' + slot + '\',\'' + id + '\')">' + sticker.emoji + '</div>';
  });

  html += '</div>';
  html += '<button class="btn" onclick="renderShop()" style="font-size:0.85rem">Annuller</button>';
  html += '</div>';

  document.getElementById('shopOverlay').innerHTML = html;
}

function pickSticker(slot, stickerId) {
  setSticker(slot, stickerId);
  applyPlayerCosmetics();
  renderShop();
}
