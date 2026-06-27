const fs = require('fs');
const path = require('path');

const pages = [
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
    } else if (file === 'page.tsx') {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // determine permission based on path
      let perm = 'content.read'; // default
      for (const mapping of pages) {
        if (fullPath.includes('/admin/' + mapping.p + '/')) {
          perm = mapping.perm;
          break;
        } else if (fullPath.endsWith('/admin/' + mapping.p + '/page.tsx')) {
          perm = mapping.perm;
          break;
        }
      }
      
      // if it's the root admin page, we just check if they are authenticated and have any valid role,
      // but let's just use `getAdminSession` for root page.
      
      if (fullPath === 'app/admin/page.tsx') {
        content = content.replace(
          /const \{ data: \{ session \} \} = await supabase.auth.getSession\(\)[\s\S]*?if \(profile\?\.role !== 'admin'\) redirect\('\/admin'\)/,
          `const { supabase, profile } = await getAdminSession()`
        );
        if (!content.includes('getAdminSession')) {
           content = "import { getAdminSession } from '@/lib/auth/server-protect'\n" + content;
        }
      } else {
        // replace the block
        content = content.replace(
          /const \{ data: \{ session \} \} = await supabase\.auth\.getSession\(\)[\s\S]*?if \(profile\?\.role !== 'admin'\) redirect\('\/admin'\)/,
          `const { supabase, profile } = await requirePermission('${perm}')`
        );
        // add import if needed
        if (content.includes('requirePermission') && !content.includes('@/lib/auth/server-protect')) {
          content = "import { requirePermission } from '@/lib/auth/server-protect'\n" + content;
        }
      }

      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('app/admin');
console.log('Pages updated');
