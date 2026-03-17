#!/usr/bin/env node
// Generate audio files for all words and sentences in words.json
// Usage: GOOGLE_TTS_KEY=your-api-key node generate-audio.js [--suffix _m] [--voice da-DK-Wavenet-G]

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.GOOGLE_TTS_KEY;
if (!API_KEY) {
  console.error('Mangler GOOGLE_TTS_KEY environment variable');
  console.error('Brug: GOOGLE_TTS_KEY=din-nøgle node generate-audio.js');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
let VOICE = process.env.TTS_VOICE || 'da-DK-Neural2-F';
let SUFFIX = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--voice' && args[i + 1]) { VOICE = args[i + 1]; i++; }
  if (args[i] === '--suffix' && args[i + 1]) { SUFFIX = args[i + 1]; i++; }
}

const AUDIO_DIR = path.join(__dirname, 'audio');
const WORDS_FILE = path.join(__dirname, 'words.json');

// Rate limiting
const DELAY_MS = 120;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeFilename(word) {
  return word.toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]/g, '_');
}

function synthesize(text, speakingRate) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      input: { text },
      voice: { languageCode: 'da-DK', name: VOICE },
      audioConfig: { audioEncoding: 'MP3', speakingRate }
    });

    const options = {
      hostname: 'texttospeech.googleapis.com',
      path: '/v1/text:synthesize?key=' + API_KEY,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error('TTS fejl ' + res.statusCode + ': ' + data.substring(0, 200)));
          return;
        }
        try {
          const json = JSON.parse(data);
          resolve(Buffer.from(json.audioContent, 'base64'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const wordBank = JSON.parse(fs.readFileSync(WORDS_FILE, 'utf8'));
  const allWords = Object.values(wordBank).flat();

  console.log('Genererer lyd for ' + allWords.length + ' ord...');
  console.log('Stemme: ' + VOICE);
  console.log('Suffix: ' + (SUFFIX || '(ingen)'));
  console.log('Output: ' + AUDIO_DIR);
  console.log('');

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of allWords) {
    const key = sanitizeFilename(entry.word);
    const wordFile = path.join(AUDIO_DIR, 'word_' + key + SUFFIX + '.mp3');
    const sentenceFile = path.join(AUDIO_DIR, 'sentence_' + key + SUFFIX + '.mp3');

    // Generate word audio
    if (fs.existsSync(wordFile)) {
      skipped++;
    } else {
      try {
        const audio = await synthesize(entry.word, 0.8);
        fs.writeFileSync(wordFile, audio);
        generated++;
      } catch (e) {
        console.error('FEJL (ord): ' + entry.word + ' - ' + e.message);
        errors++;
      }
      await sleep(DELAY_MS);
    }

    // Generate sentence audio
    if (fs.existsSync(sentenceFile)) {
      skipped++;
    } else {
      try {
        const audio = await synthesize(entry.sentence, 0.95);
        fs.writeFileSync(sentenceFile, audio);
        generated++;
      } catch (e) {
        console.error('FEJL (sætning): ' + entry.word + ' - ' + e.message);
        errors++;
      }
      await sleep(DELAY_MS);
    }

    const total = generated + skipped + errors;
    if (total % 20 === 0) {
      console.log('Fremskridt: ' + Math.round(total / (allWords.length * 2) * 100) + '% (' + generated + ' genereret, ' + skipped + ' sprunget over, ' + errors + ' fejl)');
    }
  }

  console.log('');
  console.log('Færdig!');
  console.log('Genereret: ' + generated);
  console.log('Sprunget over (fandtes allerede): ' + skipped);
  console.log('Fejl: ' + errors);

  // Generate manifest file with both voice sets
  const manifest = {};
  for (const entry of allWords) {
    const key = sanitizeFilename(entry.word);
    if (!manifest[entry.word]) {
      manifest[entry.word] = {
        word: 'audio/word_' + key + '.mp3',
        sentence: 'audio/sentence_' + key + '.mp3',
        word_m: 'audio/word_' + key + '_m.mp3',
        sentence_m: 'audio/sentence_' + key + '_m.mp3'
      };
    }
  }
  fs.writeFileSync(path.join(__dirname, 'audio-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Manifest skrevet til audio-manifest.json');
}

main().catch(e => { console.error(e); process.exit(1); });
