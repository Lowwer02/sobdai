const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const files = execSync('grep -rl "<form" . --include=\\*.tsx').toString().trim().split('\n');

for (const file of files) {
  if (!file) continue;
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  let inForm = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('<button') && !line.includes('type=')) {
      console.log(`\nFILE: ${file}:${i+1}`);
      // print context
      for(let j = Math.max(0, i-2); j <= Math.min(lines.length-1, i+4); j++) {
         console.log(lines[j]);
      }
    }
  }
}
