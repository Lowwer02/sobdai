const fs = require('fs');
const p = 'app/admin/users/UsersClient.tsx';
let content = fs.readFileSync(p, 'utf8');

// Fix role filter dropdown
const dropdownRegex = /<option value="admin">Admin<\/option>/g;
content = content.replace(dropdownRegex, `<option value="admin">Admin</option>
              <option value="owner">Owner</option>
              <option value="editor">Editor</option>
              <option value="support">Support</option>`);

// Fix badge styling
content = content.replace(/user\.role === 'admin'/g, "['admin', 'owner', 'editor', 'support'].includes(user.role)");

// Fix Demote/Promote title
content = content.replace(/title\{\[\'admin\', \'owner\', \'editor\', \'support\'\]\.includes\(user\.role\) \? \'Demote to User\' : \'Promote to Admin\'\}/g, "title={['admin', 'owner', 'editor', 'support'].includes(user.role) ? 'Demote to User' : 'Promote to Admin'}");

fs.writeFileSync(p, content);
console.log('Fixed UsersClient.tsx');
