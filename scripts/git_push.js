const { execFileSync } = require('child_process');

const commitMsg = process.argv[2] || 'Update Musica';

try {
    console.log(`Subiendo cambios: ${commitMsg}`);
    // execFileSync con array de argumentos: no pasa por el shell, así que el mensaje de
    // commit no puede romper comillas ni inyectar comandos aunque contenga & | ; ` $ etc.
    execFileSync('git', ['add', '.'], { stdio: 'inherit' });
    execFileSync('git', ['commit', '-m', commitMsg], { stdio: 'inherit' });
    execFileSync('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
    console.log('¡Subida completada con éxito!');
} catch (e) {
    console.error('Fallo en la subida a Git:', e.message);
    process.exit(1);
}
