const fs = require('fs');
const p = 'app/admin/exam-sets/questions.action.ts';
let content = fs.readFileSync(p, 'utf8');

// Ensure 'use server' is on top
content = content.replace(/'use server'\n?/g, '');
content = "'use server'\n\n" + content;

// Remove cookies import
content = content.replace(/import \{ cookies \} from 'next\/headers'\n/g, '');
content = content.replace(/import \{ createServerClient \} from '@supabase\/ssr'\n/g, '');

// If it has inline supabase, replace it
content = content.replace(/const cookieStore = await cookies\(\)[\s\S]*?const supabase = createServerClient\([\s\S]*?\}\n\s*\)\n/g, `const { supabase } = await requirePermission('content.write')\n`);

fs.writeFileSync(p, content);
console.log('Fixed questions.action.ts');
