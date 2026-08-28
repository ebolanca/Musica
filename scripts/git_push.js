const { execSync } = require('child_process');

const commitMsg = process.argv[2] || 'Update Musica';

try {
    console.log(`Subiendo cambios: ${commitMsg}`);
    execSync('git add .');
    execSync(`git commit -m "${commitMsg}"`);
    execSync('git push origin main');
    console.log('¡Subida completada con éxito!');
} catch (e) {
    console.error('Fallo en la subida a Git:', e.message);
    process.exit(1);
}
