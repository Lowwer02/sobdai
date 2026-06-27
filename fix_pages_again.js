const fs = require('fs');
const path = require('path');

const mappings = [
  { p: 'organizations', perm: 'system.manage' },
  { p: 'users', perm: 'users.read' },
  { p: 'packages', perm: 'content.read' },
  { p: 'summaries', perm: 'content.read' },
  { p: 'positions', perm: 'system.manage' },
  { p: 'orders', perm: 'orders.read' },
  { p: 'import', perm: 'content.write' },
  { p: 'exam-sets', perm: 'content.read' },
  { p: 'questions', perm: 'content.read' },
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (file === 'page.tsx' && fullPath.includes('app/admin')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let perm = 'content.read';
      for (const mapping of mappings) {
        if (fullPath.includes('/admin/' + mapping.p + '/')) {
          perm = mapping.perm;
          break;
        } else if (fullPath.endsWith('/admin/' + mapping.p + '/page.tsx')) {
          perm = mapping.perm;
          break;
        }
      }
      
      // If it's missing supabase init, inject it right after "export default async function... {"
      if (!content.includes('const { supabase') && !content.includes('const {supabase')) {
         let fnRegex = /export default (async )?function \w+\([^\)]*\)\s*\{/g;
         let match = fnRegex.exec(content);
         if (match) {
            let inject = `\n  const { supabase, profile } = await requirePermission('${perm}')\n`;
            if (fullPath === 'app/admin/page.tsx') {
               inject = `\n  const { supabase, profile } = await getAdminSession()\n`;
            }
            content = content.slice(0, match.index + match[0].length) + inject + content.slice(match.index + match[0].length);
         }
      }
      
      if (!content.includes('@/lib/auth/server-protect')) {
         content = "import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'\n" + content;
      }

      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('app/admin');
console.log('Pages fixed');
