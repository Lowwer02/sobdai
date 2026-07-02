const fs = require('fs');
const { execSync } = require('child_process');

const files = execSync('find . -name "*.tsx" -not -path "*/node_modules/*" -not -path "*/.next/*"').toString().trim().split('\n');

let totalFixed = 0;

for (const file of files) {
  if (!file) continue;
  let content = fs.readFileSync(file, 'utf-8');
  
  // We want to find <button ... > tags.
  const regex = /<button([\s\S]*?)>/g;
  let changed = false;
  
  const newContent = content.replace(regex, (match, inner, offset) => {
    // Check if it already has a type
    if (/type\s*=\s*(['"])(button|submit|reset)\1/.test(inner)) {
      return match; // Leave it alone
    }
    
    // It has no type. Let's determine if it should be submit based on text content that follows
    const textAfter = content.slice(offset + match.length, offset + match.length + 100);
    const isSubmitText = /Save|Submit|Create|Login|Register|Checkout|Publish|ยืนยัน|เข้าสู่ระบบ|สมัครสมาชิก/.test(textAfter);
    
    // Also check if 'onSubmit' or something is in the tag, but we just default to button unless it's a known submit word.
    const type = isSubmitText ? 'submit' : 'button';
    
    changed = true;
    totalFixed++;
    
    // Inject type attribute right after <button
    return `<button type="${type}"${inner}>`;
  });
  
  if (changed) {
    fs.writeFileSync(file, newContent);
    console.log(`Updated ${file}`);
  }
}

console.log(`Total buttons fixed: ${totalFixed}`);
