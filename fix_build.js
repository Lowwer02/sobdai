const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else {
      if (file === 'actions.ts') {
        let content = fs.readFileSync(fullPath, 'utf8');
        // move 'use server' to top
        if (content.includes("'use server'") && !content.startsWith("'use server'")) {
           content = content.replace(/'use server'\n?/g, '');
           content = "'use server'\n\n" + content;
        }
        fs.writeFileSync(fullPath, content);
      }
      
      if (file === 'page.tsx' && fullPath.includes('app/admin')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        
        // Remove old supabase init block
        // const cookieStore = await cookies()
        // const supabase = createServerClient(...)
        const supabaseInitRegex = /const cookieStore = await cookies\(\)[\s\S]*?\}\n\s*\)\n/g;
        content = content.replace(supabaseInitRegex, '');
        
        // Remove import { createServerClient } from '@supabase/ssr'
        content = content.replace(/import \{ createServerClient \} from '@supabase\/ssr'\n/g, '');
        // Remove import { cookies } from 'next/headers' (if not used elsewhere)
        // I'll leave cookies if used, but maybe remove it
        content = content.replace(/import \{ cookies \} from 'next\/headers'\n/g, '');
        
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

processDir('app/admin');
console.log('Build issues fixed');
