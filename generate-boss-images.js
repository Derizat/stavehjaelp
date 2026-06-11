#!/usr/bin/env node
// One-off: generate boss monster sprites via OpenAI gpt-image-1.
// Run: OPENAI_API_KEY=sk-... node generate-boss-images.js [slug]
// Existing files are skipped — delete a file to regenerate it.
const fs = require('fs');
const path = require('path');

const STYLE = "Cute-but-dangerous cartoon monster for a children's spelling game. " +
  'Bold rounded shapes, thick outlines, vivid saturated colors, playful menace. ' +
  'Single character, centered, full body. No text, no background elements.';

const MONSTERS = [
  { slug: 'stumme-bogstaver',   desc: 'a mischievous translucent ghost hugging a big glowing letter H' },
  { slug: 'dobbeltkonsonant',   desc: 'a two-headed dragon whose heads are identical twins' },
  { slug: 'for-efterstavelser', desc: 'a wizard juggling glowing word-fragment runes' },
  { slug: 'sammensatte-ord',    desc: 'a goofy ogre visibly stitched together from mismatched parts' },
  { slug: 'verbernes-bojning',  desc: 'a silly zombie bending and twisting its rubbery arms' },
  { slug: 'navneordsendelser',  desc: 'a small alien with several differently-shaped tails' },
  { slug: 'lydrette-ord',       desc: 'a big friendly bear roaring visible musical sound waves' },
  { slug: 'nutids-r',           desc: 'a tyrannosaurus rex with a bold letter R marked on its chest' },
  { slug: 'konsonantlyde',      desc: 'a bat with huge ears emitting echo rings' }
];

async function gen(m) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.OPENAI_API_KEY
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: STYLE + ' This monster: ' + m.desc + '.',
      size: '1024x1024',
      quality: 'medium',
      background: 'transparent',
      output_format: 'webp'
    })
  });
  if (!res.ok) throw new Error(m.slug + ': HTTP ' + res.status + ' ' + (await res.text()));
  const data = await res.json();
  const out = path.join('images', 'bosses', m.slug + '.webp');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(data.data[0].b64_json, 'base64'));
  console.log('OK', out);
}

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Set OPENAI_API_KEY first.');
    process.exit(1);
  }
  const only = process.argv[2];
  for (const m of MONSTERS) {
    if (only && m.slug !== only) continue;
    if (fs.existsSync(path.join('images', 'bosses', m.slug + '.webp'))) {
      console.log('skip (exists)', m.slug);
      continue;
    }
    await gen(m);
  }
})();
