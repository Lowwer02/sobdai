const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (file === 'actions.ts' || fullPath.endsWith('questions.action.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const inlineSupabaseRegex = /const cookieStore = await cookies\(\)[\s\S]*?const supabase = createServerClient\([\s\S]*?\}\n\s*\)\n/g;
      
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
      
      content = content.replace(inlineSupabaseRegex, `const { supabase } = await requirePermission('${perm}')\n`);
      
      // Also remove any duplicate requirePermission imports
      // and ensure there is only one.
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('app/admin');
console.log('Inline supabase fixed');
