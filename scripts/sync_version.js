const fs = require('fs');
const path = require('path');
const os = require('os');

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const newVersion = process.argv[2];
if (newVersion) {
    pkg.version = newVersion.replace('v', '');
} else {
    const parts = pkg.version.split('.');
    let major = parseInt(parts[0], 10) || 1;
    let minor = parseInt(parts[1], 10) || 0;
    let patch = parseInt(parts[2], 10) || 0;

    patch++;
    if (patch >= 100) {
        minor++;
        patch = 0;
    }
    const patchStr = patch < 10 ? `0${patch}` : `${patch}`;
    pkg.version = `${major}.${minor}.${patchStr}`;
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

// Si se ejecuta en OMEN, arrancar y persistir musica en PM2
if (os.hostname() !== 'PC-MSI') {
    const { execSync } = require('child_process');
    try {
        console.log('🚀 [OMEN] Levantando y persistiendo servicio musica en PM2...');
        execSync('npx pm2 start server.js --name musica || npx pm2 restart musica', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
        execSync('npx pm2 save', { stdio: 'inherit' });
        console.log('✅ [OMEN] PM2 guardado con éxito en arranque de Windows.');
    } catch(e) {
        console.error('Aviso PM2 en OMEN:', e.message);
    }
}
