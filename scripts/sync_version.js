const { execSync } = require('child_process');
const fs = require('fs');

const log = [];
for (const py of ['python', 'py', 'python3']) {
    try {
        const out = execSync(`${py} --version`, { encoding: 'utf8' });
        log.push(`${py} -> OK: ${out.trim()}`);
    } catch(e) {
        log.push(`${py} -> ERROR: ${e.message}`);
    }
}

try {
    const out = execSync('python -m yt_dlp --version', { encoding: 'utf8' });
    log.push(`python -m yt_dlp -> OK: ${out.trim()}`);
} catch(e) {
    log.push(`python -m yt_dlp -> ERROR: ${e.message}`);
}

fs.writeFileSync('d:\\03_Trabajo\\Musica\\scripts\\omen_python_check.log', log.join('\n'), 'utf8');
