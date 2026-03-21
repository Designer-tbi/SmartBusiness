import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// Replace `if (currentCount !== items.length) {` with `if (true || currentCount !== items.length) {`
content = content.replace(/if \(currentCount !== items\.length\) \{/g, 'if (true || currentCount !== items.length) {');

fs.writeFileSync('server.ts', content);
console.log('Forced re-seeding');
