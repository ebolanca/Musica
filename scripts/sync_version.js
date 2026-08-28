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

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Actualizar versión en public/index.html
const htmlPath = path.join(__dirname, '../public/index.html');
if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/Plataforma de Videoclips & Análisis Sónico v\d+\.\d+\.\d+/g, `Plataforma de Videoclips & Análisis Sónico v${pkg.version}`);
    fs.writeFileSync(htmlPath, html, 'utf8');
}

console.log(`Versión actualizada: v${pkg.version}`);
console.log('¡Sincronización completada en package.json y public/index.html!');
