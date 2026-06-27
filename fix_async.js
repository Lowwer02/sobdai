const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // If it's a client component with requirePermission, we need to extract it
  if (content.includes("'use client'")) {
     // I will just remove requirePermission from the client component for now
     // and create a Server page.tsx to wrap it.
     
     // Remove import { requirePermission...
     content = content.replace(/import \{ requirePermission.*?\} from '@\/lib\/auth\/server-protect'\n/g, '');
     
     // Remove const { supabase, profile } = await requirePermission(...)
     content = content.replace(/const \{ supabase, profile \} = await requirePermission\('.*?'\)\n/g, '');
     
     // Rename to Client component
     const dir = path.dirname(filePath);
     const clientPath = path.join(dir, 'ImportClient.tsx');
     
     // Change component name if it is ImportCenterPage -> ImportClient
     content = content.replace(/export default function \w+\(/, 'export default function ImportClient(');
     
     fs.writeFileSync(clientPath, content);
     
     // Create server page.tsx
     let perm = 'content.write';
     if (filePath.includes('summaries')) perm = 'content.read';
     
     const serverContent = `import { requirePermission } from '@/lib/auth/server-protect'
import ImportClient from './ImportClient'

export default async function Page() {
  await requirePermission('${perm}')
  return <ImportClient />
}
`;
     fs.writeFileSync(filePath, serverContent);
     
  } else {
     // It's a server component. Ensure it has async keyword
     if (!content.includes('export default async function')) {
         content = content.replace(/export default function/g, 'export default async function');
         fs.writeFileSync(filePath, content);
     }
  }
}

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (file === 'page.tsx' && fullPath.includes('app/admin')) {
      processFile(fullPath);
    }
  }
}

processDir('app/admin');
console.log('Async and client components fixed');
