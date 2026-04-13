const fs = require('fs');
const words = JSON.parse(fs.readFileSync('words.json', 'utf8'));

let count = 0;
const issues = [];

for (const category of Object.keys(words)) {
  for (const entry of words[category]) {
    const word = entry.word;
    const sentence = entry.sentence;
    const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (!regex.test(sentence)) {
      count++;
      issues.push({ category, level: entry.level, word, sentence });
    }
  }
}

console.log(`\nTotal words needing fix: ${count}\n`);
for (const item of issues) {
  console.log(`[${item.category} / level ${item.level}] "${item.word}" — sentence: "${item.sentence}"`);
}
