const fs = require('fs');
const path = require('path');

const mappings = [
  { p: 'packages', perm: 'content.write' },
  { p: 'exam-sets', perm: 'content.write' },
  { p: 'questions', perm: 'content.write' },
  { p: 'summaries', perm: 'content.write' },
  { p: 'import', perm: 'content.write' },
  { p: 'users', perm: 'users.write' },
  { p: 'organizations', perm: 'system.manage' },
  { p: 'positions', perm: 'system.manage' },
  { p: 'orders', perm: 'financial.manage' }
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (file === 'actions.ts') {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let perm = 'content.write'; // default
      for (const mapping of mappings) {
        if (fullPath.includes('/admin/' + mapping.p + '/')) {
          perm = mapping.perm;
          break;
        } else if (fullPath.endsWith('/admin/' + mapping.p + '/actions.ts')) {
          perm = mapping.perm;
          break;
        }
      }
      
      // Remove createAdminClient definition
      content = content.replace(/\/\/ Helper to create authenticated supabase client[\s\S]*?return supabase\n}\n/g, '');
      
      // Remove createServerClient import if not used elsewhere
      content = content.replace(/import \{ createServerClient \} from '@supabase\/ssr'\n/g, '');
      content = content.replace(/import \{ cookies \} from 'next\/headers'\n/g, '');
      
      // Add requirePermission import
      if (!content.includes('@/lib/auth/server-protect')) {
        content = "import { requirePermission } from '@/lib/auth/server-protect'\n" + content;
      }
      
      // Replace createAdminClient() with requirePermission()
      content = content.replace(/const supabase = await createAdminClient\(\)/g, `const { supabase } = await requirePermission('${perm}')`);
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('app/admin');
console.log('Actions updated');
