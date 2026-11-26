// Monta a pasta public/ que a Vercel publica como arquivos estáticos.
// Só a interface vai para lá; src/, data.json e o restante do projeto ficam de fora.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'public');
const entries = ['index.html', 'css', 'js'];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const entry of entries) {
  fs.cpSync(path.join(root, entry), path.join(output, entry), { recursive: true });
}
console.log(`Arquivos públicos copiados para public/: ${entries.join(', ')}`);
