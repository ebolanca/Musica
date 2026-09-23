const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ENV_PATH = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\.env";
const AUDIT_FILE = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\data\\audio_quality_audit.json";
const PROGRESS_FILE = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\data\\priority1_progress.json";
const FFMPEG = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\bin\\ffmpeg.exe";
const OMEN_MUSIC_DIR = "\\\\100.95.217.45\\omen D\\media-library\\music";

// Cargar contraseña
let password = '';
if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
    for (const l of lines) {
        if (l.trim().startsWith('APP_PASSWORD=')) {
            password = l.trim().split('=')[1].trim();
        }
    }
}

// Cargar estado previo si existe
let progressState = { completed: {}, failed: {} };
if (fs.existsSync(PROGRESS_FILE)) {
    try {
        progressState = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch(e) {}
}

function saveProgress() {
    try {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressState, null, 2), 'utf8');
    } catch(e) {
        console.error('Error guardando progreso:', e.message);
    }
}

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

function normalizeAudioIfLow(filePath) {
    if (!fs.existsSync(filePath)) return false;
    const info = inspectAudio(filePath);
    if (!info) return false;

    // Si tras el reemplazo el volumen medio sigue estando por debajo de -20 dB, normalizamos a -14 LUFS comercial
    if (info.meanVolume !== null && info.meanVolume <= -20.0) {
        console.log(`    🎚️ El audio nuevo sigue bajo (${info.meanVolume} dB). Aplicando normalización de máster EBU R128 a 320 kbps...`);
        const tmpNorm = path.join(__dirname, `tmp_norm_${Date.now()}.mp3`);
        const proc = spawnSync(FFMPEG, [
            '-y',
            '-i', filePath,
            '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11',
            '-b:a', '320k',
            tmpNorm
        ], { encoding: 'utf8' });

        if (proc.status === 0 && fs.existsSync(tmpNorm) && fs.statSync(tmpNorm).size > 500000) {
            fs.copyFileSync(tmpNorm, filePath);
            try { fs.unlinkSync(tmpNorm); } catch(e){}
            console.log(`    ✅ Audio normalizado a nivel estándar comercial.`);
            return true;
        } else {
            if (fs.existsSync(tmpNorm)) try { fs.unlinkSync(tmpNorm); } catch(e){}
        }
    }
    return false;
}

async function run() {
    console.log('🎵 [PROCESADOR DE PRIORIDAD 1] Iniciando lote masivo...');

    // 1. Iniciar sesión
    const loginRes = await fetch('http://localhost:8087/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    const cookie = loginRes.headers.get('set-cookie');
    const cookieHeader = cookie ? cookie.split(';')[0] : '';
    if (!cookieHeader) {
        console.error('❌ Error de autenticación en localhost:8087');
        process.exit(1);
    }
    console.log('✅ Sesión autenticada en el servidor.');

    // 2. Cargar pistas de auditoría
    const audit = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    const candidates = audit.tracks.filter(t => {
        if (!t.isLowBitrate) return false;
        if (t.lowVolumeLevel !== 'CRITICAL' && t.lowVolumeLevel !== 'MODERATE') return false;
        if (t.file.endsWith('.bak.mp3')) return false;
        return true;
    }).sort((a, b) => (a.meanVolume || 0) - (b.meanVolume || 0));

    console.log(`📋 Total de canciones en Prioridad 1 detectadas: ${candidates.length}`);

    // Filtrar las que ya están en progreso completadas
    const toProcess = candidates.filter(t => {
        const key = `${t.category}:::${t.file}`;
        return !progressState.completed[key];
    });

    console.log(`⏳ Canciones pendientes de procesar: ${toProcess.length} (Ya completadas: ${Object.keys(progressState.completed).length})`);

    let processedCount = 0;
    let successCount = 0;
    const totalToProcess = toProcess.length;

    for (const item of toProcess) {
        processedCount++;
        const itemKey = `${item.category}:::${item.file}`;

        // Parse artist y title
        const base = item.file.replace(/\.mp3$/i, '');
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

        const percent = ((processedCount / totalToProcess) * 100).toFixed(1);
        console.log(`\n============================================================`);
        console.log(`[${processedCount}/${totalToProcess}] (${percent}%) [${item.category}] ${artist} - ${title}`);
        console.log(`    Original -> Bitrate: ${item.bitrate}k | Volumen: ${item.meanVolume} dB (Pico: ${item.maxVolume} dB)`);

        try {
            const res = await fetch('http://localhost:8087/api/track/replace-clean-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookieHeader
                },
                body: JSON.stringify({
                    artist,
                    title,
                    category: item.category,
                    discardCurrent: true
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.warn(`    ⚠️ No se pudo reemplazar (${res.status}): ${errData.error || res.statusText}`);
                progressState.failed[itemKey] = {
                    date: new Date().toISOString(),
                    error: errData.error || res.statusText
                };
                saveProgress();
                continue;
            }

            const data = await res.json();
            console.log(`    ✨ Reemplazado por: "${data.versionDesc || 'Versión limpia'}"`);

            const targetFilePath = path.join(OMEN_MUSIC_DIR, item.category, item.file);

            // Comprobar y normalizar si fuera necesario
            normalizeAudioIfLow(targetFilePath);

            // Reinspeccionar audio final
            const newAudio = inspectAudio(targetFilePath);
            if (newAudio) {
                const gain = (newAudio.meanVolume - item.meanVolume).toFixed(1);
                console.log(`    🔊 Resultado final -> Bitrate: ${newAudio.bitrate}k | Volumen medio: ${newAudio.meanVolume} dB (Pico: ${newAudio.maxVolume} dB) | Ganancia: +${gain} dB`);
                progressState.completed[itemKey] = {
                    date: new Date().toISOString(),
                    oldBitrate: item.bitrate,
                    oldMean: item.meanVolume,
                    newBitrate: newAudio.bitrate,
                    newMean: newAudio.meanVolume,
                    gain: +gain,
                    version: data.versionDesc
                };
            } else {
                progressState.completed[itemKey] = {
                    date: new Date().toISOString(),
                    version: data.versionDesc
                };
            }

            delete progressState.failed[itemKey];
            saveProgress();
            successCount++;

        } catch (err) {
            console.error(`    ❌ Error de conexión o proceso:`, err.message);
            progressState.failed[itemKey] = {
                date: new Date().toISOString(),
                error: err.message
            };
            saveProgress();
        }

        // Pausa preventiva de 2 segundos entre descargas para no saturar APIs ni red
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n🎉 PROCESO MASIVO COMPLETADO:`);
    console.log(`- Exitosas: ${successCount}`);
    console.log(`- Total completadas acumuladas: ${Object.keys(progressState.completed).length}`);
    console.log(`- Fallidas o sin reemplazo alternativo: ${Object.keys(progressState.failed).length}`);
}

run();
