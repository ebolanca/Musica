const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envPath = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\.env";
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
let password = '';
for (const l of lines) {
    if (l.trim().startsWith('APP_PASSWORD=')) {
        password = l.trim().split('=')[1].trim();
    }
}

const FFMPEG = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\bin\\ffmpeg.exe";
const OMEN_MUSIC_DIR = "\\\\100.95.217.45\\omen D\\media-library\\music";

function inspectAudio(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const proc = spawnSync(FFMPEG, [
        '-ss', '30',
        '-t', '45',
        '-i', filePath,
        '-filter:a', 'volumedetect',
        '-f', 'null',
        '-'
    ], { encoding: 'utf8' });
    const stderr = proc.stderr || '';
    const br = stderr.match(/bitrate:\s*([0-9]+)\s*kb\/s/i);
    const max = stderr.match(/max_volume:\s*([-0-9.]+)\s*dB/i);
    const mean = stderr.match(/mean_volume:\s*([-0-9.]+)\s*dB/i);
    return {
        bitrate: br ? parseInt(br[1], 10) : 0,
        maxVolume: max ? parseFloat(max[1]) : null,
        meanVolume: mean ? parseFloat(mean[1]) : null
    };
}

async function runBatch(tracksToProcess) {
    console.log(`🚀 Iniciando lote de reemplazo de audio para ${tracksToProcess.length} canciones prioritarias...`);

    // 1. Login
    const loginRes = await fetch('http://localhost:8087/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    const cookie = loginRes.headers.get('set-cookie');
    const cookieHeader = cookie ? cookie.split(';')[0] : '';
    if (!cookieHeader) {
        console.error('❌ Error de autenticación');
        process.exit(1);
    }
    console.log('✅ Autenticado correctamente con el servidor.');

    const summaryResults = [];

    for (let i = 0; i < tracksToProcess.length; i++) {
        const item = tracksToProcess[i];
        console.log(`\n------------------------------------------------------------`);
        console.log(`[${i + 1}/${tracksToProcess.length}] Procesando: [${item.category}] ${item.artist} - ${item.title}`);
        console.log(`    Antes -> Bitrate: ${item.oldBitrate}k | Volumen medio: ${item.oldMean} dB (Pico: ${item.oldMax} dB)`);

        try {
            const res = await fetch('http://localhost:8087/api/track/replace-clean-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookieHeader
                },
                body: JSON.stringify({
                    artist: item.artist,
                    title: item.title,
                    category: item.category,
                    discardCurrent: true
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.warn(`    ⚠️ Fallo en reemplazo (${res.status}):`, errData.error || res.statusText);
                summaryResults.push({ ...item, success: false, error: errData.error || res.statusText });
                continue;
            }

            const data = await res.json();
            console.log(`    ✨ Reemplazado con éxito: "${data.versionDesc || 'Versión limpia'}"`);

            // Inspeccionar resultado en disco
            const targetFilePath = path.join(OMEN_MUSIC_DIR, item.category, item.file);
            const newAudio = inspectAudio(targetFilePath);

            if (newAudio) {
                const volGain = (newAudio.meanVolume - item.oldMean).toFixed(1);
                console.log(`    🔊 Nuevo audio -> Bitrate: ${newAudio.bitrate}k | Volumen medio: ${newAudio.meanVolume} dB (Pico: ${newAudio.maxVolume} dB) | Ganancia: +${volGain} dB`);
                summaryResults.push({
                    ...item,
                    success: true,
                    newBitrate: newAudio.bitrate,
                    newMean: newAudio.meanVolume,
                    newMax: newAudio.maxVolume,
                    volGain: +volGain
                });
            } else {
                console.log('    ℹ️ No se pudo reinspeccionar inmediatamente el archivo en disco.');
                summaryResults.push({ ...item, success: true });
            }

        } catch (e) {
            console.error(`    ❌ Error procesando canción:`, e.message);
            summaryResults.push({ ...item, success: false, error: e.message });
        }

        // Breve pausa para no saturar YouTube ni la red
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n============================================================`);
    console.log(`🏁 Lote finalizado: ${summaryResults.filter(r => r.success).length}/${summaryResults.length} canciones actualizadas correctamente.`);

    return summaryResults;
}

// Ejecutar con las primeras 10 canciones críticas de Prioridad 1
const REPORT_PATH = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\data\\audio_quality_audit.json";
const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

const candidates = report.tracks.filter(t => 
    t.isLowBitrate && 
    t.lowVolumeLevel === 'CRITICAL' && 
    !t.file.includes('David Guetta') && 
    !t.file.includes('Dua Lipa') &&
    !t.file.endsWith('.bak.mp3')
).sort((a, b) => (a.meanVolume || 0) - (b.meanVolume || 0));

const batch10 = candidates.slice(0, 10).map(t => {
    const base = t.file.replace(/\.mp3$/i, '');
    let artist = '';
    let title = '';
    if (base.includes(' - ')) {
        const parts = base.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
    } else {
        artist = base;
        title = base;
    }
    return {
        category: t.category,
        file: t.file,
        artist,
        title,
        oldBitrate: t.bitrate,
        oldMean: t.meanVolume,
        oldMax: t.maxVolume
    };
});

runBatch(batch10);
