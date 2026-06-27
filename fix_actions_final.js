const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (file === 'actions.ts') {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Remove getAdminSupabase block
      content = content.replace(/\/\/ Helper to get authenticated admin supabase client[\s\S]*?return supabase\n\}\n/g, '');
      content = content.replace(/async function getAdminSupabase\(\)[\s\S]*?return supabase\n\}\n/g, '');
      
      // Also remove import { createServerClient } and import { cookies }
      content = content.replace(/import \{ createServerClient \} from '@supabase\/ssr'\n/g, '');
      content = content.replace(/import \{ cookies \} from 'next\/headers'\n/g, '');
      
      // Replace any `const supabase = await getAdminSupabase()`
      // Actually we need to inject the proper requirePermission!
      // But we already did that before? Let's check what it has.
      const perms = {
        'packages': 'content.write',
        'exam-sets': 'content.write',
        'questions': 'content.write',
        'summaries': 'content.write',
        'import': 'content.write',
        'users': 'users.write',
        'organizations': 'system.manage',
        'positions': 'system.manage',
        'orders': 'financial.manage'
      };
      let perm = 'content.write';
      for (let p in perms) {
          if (fullPath.includes('/' + p + '/')) { perm = perms[p]; break; }
      }
      
      content = content.replace(/const supabase = await getAdminSupabase\(\)/g, `const { supabase } = await requirePermission('${perm}')`);
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('app/admin');
console.log('Actions fixed');
