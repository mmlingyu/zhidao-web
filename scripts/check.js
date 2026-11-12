const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
for (const name of fs.readdirSync('.').filter(n => n.endsWith('.js'))) execFileSync(process.execPath, ['--check', name], {stdio:'inherit'});
console.log('Syntax checks passed');
