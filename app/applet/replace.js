const fs = require('fs');
const path = 'src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/\bfont-black\b/g, 'font-normal');
content = content.replace(/\bfont-extrabold\b/g, 'font-normal');
content = content.replace(/\bfont-bold\b/g, 'font-normal');
content = content.replace(/\bfont-semibold\b/g, 'font-normal');
content = content.replace(/\bfont-medium\b/g, 'font-normal');

fs.writeFileSync(path, content, 'utf8');
console.log('Fonts updated successfully');
