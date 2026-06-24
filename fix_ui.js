const fs = require('fs');
const path = './app/package/[packageId]/PackageClient.tsx';
let code = fs.readFileSync(path, 'utf8');

// Fix backgrounds
code = code.replace(/bg-\[#FDFCFB\]/g, 'bg-[var(--bg-base)]');
code = code.replace(/text-on-background/g, '');
code = code.replace(/bg-white border border-\[#EBE5DE\]/g, 'card');
code = code.replace(/bg-white border-t border-\[#EBE5DE\]/g, 'bg-[var(--bg-card)] border-t border-[var(--border-card)]');

// Fix text colors
code = code.replace(/text-text-primary/g, 'text-[var(--text-primary)]');
code = code.replace(/text-text-secondary/g, 'text-secondary');
code = code.replace(/text-text-muted/g, 'text-muted');

// Fix interactive background colors
code = code.replace(/bg-\[#F3EFE9\]/g, 'bg-[var(--bg-card-2)]');
code = code.replace(/hover:bg-\[#FDFCFB\]/g, 'hover:bg-[var(--bg-card-hover)]');
code = code.replace(/hover:bg-\[#F3EFE9\]/g, 'hover:bg-[var(--bg-card-hover)]');
code = code.replace(/bg-\[#FAFAFA\]/g, 'bg-[var(--bg-card-2)]');
code = code.replace(/bg-\[#EEF0FE\]/g, 'bg-[var(--bg-input)]');
code = code.replace(/bg-\[#EAF7ED\]/g, 'bg-[var(--bg-input)]');

// Fix borders
code = code.replace(/border-\[#EBE5DE\]/g, 'border-[var(--border-card)]');
code = code.replace(/border-\[#F0F0F0\]/g, 'border-[var(--border-card)]');

fs.writeFileSync(path, code);
console.log('Fixed PackageClient.tsx');
