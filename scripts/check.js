const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
for (const name of fs.readdirSync('.').filter(n => n.endsWith('.js'))) execFileSync(process.execPath, ['--check', name], {stdio:'inherit'});
const tts = path.join('public','tts');
for (const name of fs.readdirSync(tts).filter(n => /\.(js|mjs)$/.test(n) && n !== 'kokoro-tts.js')) {
  execFileSync(process.execPath, ['--check', path.join(tts, name)], {stdio:'inherit'});
}
console.log('Syntax checks passed');
