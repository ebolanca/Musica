const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const newVersion = process.argv[2];
if (newVersion) {
    pkg.version = newVersion.replace('v', '');
} else {
    const parts = pkg.version.split('.');
    parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
    pkg.version = parts.join('.');
}

console.log(`Versión actualizada: v${pkg.version}`);
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('¡Sincronización completada!');
