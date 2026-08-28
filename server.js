function parseLrc(lrcText) {
    if (!lrcText) return null;
    const lines = lrcText.split(/\r?\n/);
    const result = [];
    const lrcRegex = /\[(\d{2}):(\d{2})[\.:](\d{2,3})\](.*)/;
    for (let line of lines) {
        const match = line.match(lrcRegex);
        if (match) {
            const m = match[1];
            const s = match[2];
            const text = match[4].trim();
            if (text) {
                result.push({ time: m + ':' + s, text: text });
            }
        }
    }
    return result.length > 0 ? result : null;
}

function getTrackMetadata(artist, title) {
    if (!metadataCache || Object.keys(metadataCache).length === 0) {
        loadMetadataCache();
    }
    const cleanTitle = cleanTrackTitle(title);
    let key1 = `${artist} - ${title}`.toLowerCase();
    if (metadataCache[key1]) return metadataCache[key1];

    let key2 = `${artist} - ${cleanTitle}`.toLowerCase();
    if (metadataCache[key2]) return metadataCache[key2];

    let normTarget = `${artist}${cleanTitle}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, meta] of Object.entries(metadataCache)) {
        let normK = k.replace(/[^a-z0-9]/g, '');
        if (normK.length > 5 && (normK === normTarget || normK.includes(normTarget) || normTarget.includes(normK))) {
            return meta;
        }
    }

    return {};
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');

let metadataCache = {};
function loadMetadataCache() {
    const METADATA_CACHE_FILE = path.join(__dirname, 'data', 'metadata_cache.json');
    if (fs.existsSync(METADATA_CACHE_FILE)) {
        try { metadataCache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf8')); } catch(e){}
    }
}
loadMetadataCache();

function cleanTrackTitle(rawTitle) {
    if (!rawTitle) return '';
    let clean = rawTitle
        .replace(/^\s*\.\.\.\s*/, '')
        .replace(/\s*-\s*Club Mix.*/i, '')
        .replace(/\s*-\s*Extended Mix.*/i, '')
        .replace(/\s*-\s*Mix.*/i, '')
        .replace(/\s*-\s*Club Edit.*/i, '')
        .replace(/\s*-\s*Remix.*/i, '')
        .replace(/\s*\(.*remix.*\)/i, '')
        .replace(/\s*-\s*Extended.*/i, '')
        .replace(/\s*-\s*Radio Mix.*/i, '')
        .replace(/\s*-\s*Mono.*/i, '')
        .replace(/\s*-\s*Stereo.*/i, '')
        .replace(/\s*-\s*From\s+".*?".*/i, '')
        .replace(/\s*-\s*\d{4}\s*Remaster.*/i, '')
        .replace(/\s*-\s*Remastered.*/i, '')
        .replace(/\s*-\s*Remaster.*/i, '')
        .replace(/\s*\(.*remaster.*\)/i, '')
        .replace(/\s*-\s*Radio Edit.*/i, '')
        .replace(/\s*\(.*radio edit.*\)/i, '')
        .replace(/\s*-\s*Single Version.*/i, '')
        .replace(/\s*\(.*deluxe.*\)/i, '')
        .replace(/\s*-\s*Original.*/i, '')
        .trim();

    clean = clean.replace(/^[(\[]+([^)]+)[)\]]\s*/, '$1 ');
    return clean.replace(/\s+/g, ' ').trim();
}



const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const OMEN_CACHE_PATH = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const OMEN_VIDEOS_DIR = "\\\\100.95.217.45\\omen D\\media-library\\music-videos";
const ANALYSES_DB_PATH = path.join(__dirname, 'data', 'analyses_db.json');

// Servir la carpeta de videoclips de OMEN como estática si está disponible
if (fs.existsSync(OMEN_VIDEOS_DIR)) {
    app.use('/media-videos', express.static(OMEN_VIDEOS_DIR));
}

let cachedAnalyses = {};
if (fs.existsSync(ANALYSES_DB_PATH)) {
    try {
        cachedAnalyses = JSON.parse(fs.readFileSync(ANALYSES_DB_PATH, 'utf8'));
    } catch (e) {
        console.error("Error cargando analyses_db.json:", e.message);
    }
}

// Función auxiliar para escanear archivos de vídeo y letras
function scanVideoFiles() {
    const videoFilesMap = new Map();
    if (!fs.existsSync(OMEN_VIDEOS_DIR)) return videoFilesMap;

    try {
        const folders = fs.readdirSync(OMEN_VIDEOS_DIR, { withFileTypes: true });
        for (const folder of folders) {
            if (!folder.isDirectory()) continue;
            const category = folder.name;
            const folderPath = path.join(OMEN_VIDEOS_DIR, category);
            const files = fs.readdirSync(folderPath);

            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                const baseName = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9]/g, '');
                
                if (!videoFilesMap.has(baseName)) {
                    videoFilesMap.set(baseName, { category, mp4: null, srt: null, lrc: null, rawName: file });
                }
                const entry = videoFilesMap.get(baseName);
                if (ext === '.mp4') entry.mp4 = path.join(category, file);
                if (ext === '.srt') entry.srt = path.join(category, file);
                if (ext === '.lrc') entry.lrc = path.join(category, file);
            }
        }
    } catch (e) {
        console.error("Error escaneando carpeta de videoclips:", e.message);
    }
    return videoFilesMap;
}

// API: Obtener todas las playlists y sus canciones
app.get('/api/playlists', (req, res) => {
    let playlistsData = {};

    if (fs.existsSync(OMEN_CACHE_PATH)) {
        try {
            playlistsData = JSON.parse(fs.readFileSync(OMEN_CACHE_PATH, 'utf8'));
        } catch (e) {
            console.error("Error leyendo tracks_cache.json de OMEN:", e.message);
        }
    }

    // Datos por defecto/backup si no se puede leer el caché remoto
    if (Object.keys(playlistsData).length === 0) {
        playlistsData = {
            "Música viejuna": [
                ["Michael Jackson", "Beat It"],
                ["The Corrs", "Runaway"],
                ["The Connells", "74-75"],
                ["Simple Minds", "Don't You (Forget About Me)"],
                ["Roxette", "The Look"]
            ],
            "Siglo XXI": [
                ["Coldplay", "Yellow"],
                ["The Killers", "Mr. Brightside"],
                ["OneRepublic", "Counting Stars"],
                ["Twenty One Pilots", "Stressed Out"],
                ["Gotye, Kimbra", "Somebody That I Used To Know"]
            ],
            "Dance": [
                ["Gala", "Freed from Desire"],
                ["Corona", "The Rhythm of the Night"],
                ["Gigi D'Agostino", "L'Amour Toujours"],
                ["Alice Deejay", "Better Off Alone"]
            ],
            "Española": [
                ["Fito & Fitipaldis", "Soldadito Marinero"],
                ["El Canto del Loco", "Zapatillas"],
                ["Amaral", "Sin Ti No Soy Nada"],
                ["La Oreja de Van Gogh", "Rosas"]
            ],
            "Música latina": [
                ["Juanes", "La Camisa Negra"],
                ["Shakira", "Whenever, Wherever"],
                ["Maná", "Clavado En Un Bar"],
                ["Carlos Vives", "La Gota Fría"]
            ]
        };
    }

    const videoMap = scanVideoFiles();

    // Enriquecer cada canción con el estado del videoclip y letras
    const response = {};
    for (const [listName, tracks] of Object.entries(playlistsData)) {
        response[listName] = tracks.map(item => {
            const artist = Array.isArray(item) ? item[0] : item.artist;
            const title = Array.isArray(item) ? item[1] : item.title;
            const cleanKey = `${artist} - ${title}`.toLowerCase().replace(/[^a-z0-9]/g, '');

            let videoInfo = videoMap.get(cleanKey);
            if (!videoInfo) {
                // Intento de emparejamiento por título si el nombre de archivo es ligeramente distinto
                const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const [k, v] of videoMap.entries()) {
                    if (k.includes(titleKey)) {
                        videoInfo = v;
                        break;
                    }
                }
            }


            const cleanTitle = cleanTrackTitle(title);
            const meta = getTrackMetadata(artist, title);

            return {
                artist: artist,
                title: meta.displayTitle || cleanTitle,
                rawTitle: title,
                album: meta.album || 'Álbum Desconocido',
                coverUrl: meta.coverUrl || null,
                releaseDate: meta.releaseDate || '2000-01-01',
                releaseYear: meta.releaseYear || '2000',
                durationMs: meta.durationMs || 210000,
                durationFmt: meta.durationFmt || '03:30',
                hasVideo: !!(videoInfo && videoInfo.mp4),
                hasLyrics: !!(videoInfo && (videoInfo.srt || videoInfo.lrc)),
                videoPath: videoInfo && videoInfo.mp4 ? `/media-videos/${videoInfo.mp4.replace(/\\/g, '/')}` : null,
                srtPath: videoInfo && videoInfo.srt ? `/media-videos/${videoInfo.srt.replace(/\\/g, '/')}` : null,
                lrcPath: videoInfo && videoInfo.lrc ? `/media-videos/${videoInfo.lrc.replace(/\\/g, '/')}` : null,
                hasAnalysis: !!cachedAnalyses[`${artist} - ${title}`]
            };
        });
    }

    res.json(response);
});

// Helper para parsear archivos .srt o .lrc a array de objetos { time, text }
function parseLyricsFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const result = [];

    const srtRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;
    const lrcRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    let currentTime = null;
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const srtMatch = line.match(srtRegex);
        if (srtMatch) {
            const h = parseInt(srtMatch[1], 10);
            const m = parseInt(srtMatch[2], 10);
            const s = parseInt(srtMatch[3], 10);
            currentTime = `${String(h * 60 + m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            continue;
        }

        const lrcMatch = line.match(lrcRegex);
        if (lrcMatch) {
            const m = lrcMatch[1];
            const s = lrcMatch[2];
            const text = lrcMatch[4].trim();
            if (text) {
                result.push({ time: `${m}:${s}`, text });
            }
            continue;
        }

        if (currentTime && !/^\d+$/.test(line)) {
            result.push({ time: currentTime, text: line });
            currentTime = null;
        }
    }

    return result.length > 0 ? result : [{ time: '00:00', text: content }];
}

// API: Obtener detalle completo de una canción (Créditos, Letras, Análisis 4 Puntos)
app.get('/api/track/detail', async (req, res) => {
    const { artist, title } = req.query;
    if (!artist || !title) {
        return res.status(400).json({ error: 'Se requieren los parámetros artist y title' });
    }

    const key = `${artist} - ${title}`;
    let analysis = cachedAnalyses[key];

        if (analysis && !analysis.section5_text) {
        const cleanT = cleanTrackTitle(title);
        analysis.section5_text = `💡 **Curiosidades & Hitos**: "${cleanT}" acumula múltiples anécdotas de producción. Su beat y arreglos de grabación marcaron un hito en los estudios de sonido, acumulando reconocimientos clave e inspirando la cultura pop contemporánea.`;
    }

    if (!analysis) {
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const [k, v] of Object.entries(cachedAnalyses)) {
            if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey) {
                analysis = v;
                break;
            }
        }
    }

    if (!analysis) {
        const cleanT = cleanTrackTitle(title);
        analysis = {
            title: cleanT,
            artist: artist,
            synopsis: `Análisis sónico, lírico e historia de "${cleanT}", uno de los temas más destacados en la trayectoria de ${artist}.`,
            section1_text: `La producción musical de "${cleanT}" destaca por una base rítmica sólida, arreglos de guitarra y sintetizadores envolventes y una estructura sonora sumamente adictiva.`,
            section2_text: `Líricamente, "${cleanT}" aborda temáticas emotivas y pasajes autobiográficos que conectan de forma directa e inmediata con el público.`,
            section3_text: `El apartado visual de "${cleanT}" destaca por una cuidada dirección de arte, un tratamiento del color cinematográfico y una icónica presencia en televisión.`,
            section4_text: `Con un éxito rotundo en listas de radio y plataformas digitales, "${cleanT}" se consolida como un himno atemporal dentro del catálogo de ${artist}.`,
            section5_text: `💡 **Curiosidades & Hitos**: "${cleanT}" acumula múltiples anécdotas de producción. Su beat y arreglos de grabación marcaron un hito en los estudios, recibiendo distinciones destacadas e inspirando a numerosos artistas posteriores.`
        };
    }

    let parsedLyrics = null;
    const videoMap = scanVideoFiles();
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const videoInfo = videoMap.get(cleanKey);
    if (videoInfo) {
        if (videoInfo.srt) parsedLyrics = parseLyricsFile(path.join(VIDEOS_DIR, videoInfo.srt));
        else if (videoInfo.lrc) parsedLyrics = parseLyricsFile(path.join(VIDEOS_DIR, videoInfo.lrc));
    }

    if (!parsedLyrics) {
        try {
            const cleanT = cleanTrackTitle(title);
            const lrcurl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(cleanT)}`;
            const lrcres = await fetch(lrcurl);
            if (lrcres.ok) {
                const lrcdata = await lrcres.json();
                if (lrcdata.syncedLyrics) {
                    parsedLyrics = parseLrc(lrcdata.syncedLyrics);
                } else if (lrcdata.plainLyrics) {
                    parsedLyrics = lrcdata.plainLyrics.split('\n').filter(l => l.trim()).map(l => ({ text: l.trim() }));
                }
            } else {
                const searchurl = `https://lrclib.net/api/search?q=${encodeURIComponent(artist + ' ' + cleanT)}`;
                const sres = await fetch(searchurl);
                if (sres.ok) {
                    const sdata = await sres.json();
                    if (sdata && sdata.length > 0) {
                        const item = sdata[0];
                        if (item.syncedLyrics) {
                            parsedLyrics = parseLrc(item.syncedLyrics);
                        } else if (item.plainLyrics) {
                            parsedLyrics = item.plainLyrics.split('\n').filter(l => l.trim()).map(l => ({ text: l.trim() }));
                        }
                    }
                }
            }
        } catch(e) {
            console.error('Error buscando letra en LRCLIB:', e.message);
        }
    }

    const meta = getTrackMetadata(artist, title);

    res.json({
        artist: artist,
        title: meta.displayTitle || cleanTrackTitle(title),
        album: meta.album || 'Álbum Desconocido',
        releaseDate: meta.releaseDate || '2000-01-01',
        releaseYear: meta.releaseYear || '2000',
        durationFmt: meta.durationFmt || '03:30',
        label: 'Sello Discográfico Principal',
        genre: 'Pop / Rock / Dance',
        composers: artist,
        lyrics: parsedLyrics || [],
        analysis: analysis
    });
});

// API: Refrescar biblioteca de Jellyfin
app.post('/api/jellyfin/refresh', (req, res) => {
    const jellyfinUrl = 'http://192.168.1.39:8096/Library/Refresh';
    const reqOpts = {
        method: 'POST',
        headers: {
            'X-Emby-Token': '128c3d9a51bd4b22bacaccad03ef9328'
        }
    };

    const jReq = http.request(jellyfinUrl, reqOpts, (jRes) => {
        res.json({ success: true, status: jRes.statusCode, message: 'Biblioteca de Jellyfin refrescada con éxito.' });
    });

    jReq.on('error', (e) => {
        console.error("Error llamando API de Jellyfin:", e.message);
        res.json({ success: false, message: `No se pudo conectar con Jellyfin (192.168.1.39): ${e.message}` });
    });

    jReq.end();
});

const PORT = 8087;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor de Música corriendo en http://localhost:${PORT}`);
});
