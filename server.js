const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');


const LYRICS_CACHE_FILE = path.join(__dirname, 'data', 'lyrics_cache.json');
let lyricsTransCache = {};
if (fs.existsSync(LYRICS_CACHE_FILE)) {
    try { lyricsTransCache = JSON.parse(fs.readFileSync(LYRICS_CACHE_FILE, 'utf8')); } catch(e){}
}

async function translateLyricsBatch(lines) {
    if (!lines || lines.length === 0) return lines;
    
    // Check if song is already in Spanish
    const fullSample = lines.slice(0, 15).map(l => l.text).join(' ').toLowerCase();
    const spanishWords = fullSample.match(/\b(que|para|estoy|corazón|noche|nada|amor|vida|todo|cuando|tiempo|quiero|tengo|hacer|siento|solo)\b/gi) || [];
    if (spanishWords.length >= 4) {
        return lines;
    }

    // Identify unique untranslated texts
    const untranslated = Array.from(new Set(
        lines.map(l => (l.text || '').trim()).filter(t => t.length > 1 && !lyricsTransCache[t])
    ));

    if (untranslated.length > 0) {
        let changed = false;
        const batchSize = 10;
        for (let i = 0; i < untranslated.length; i += batchSize) {
            const chunk = untranslated.slice(i, i + batchSize);
            await Promise.allSettled(chunk.map(async (txt) => {
                try {
                    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(txt)}&langpair=en|es`;
                    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
                    if (res.ok) {
                        const data = await res.json();
                        const trans = data.responseData?.translatedText;
                        if (trans && !trans.startsWith("MYMEMORY WARNING")) {
                            lyricsTransCache[txt] = trans;
                            changed = true;
                        }
                    }
                } catch(e) {}
            }));
        }

        if (changed) {
            try {
                fs.writeFileSync(LYRICS_CACHE_FILE, JSON.stringify(lyricsTransCache, null, 2), 'utf8');
            } catch(e){}
        }
    }

    // Attach translations to all lines
    for (let item of lines) {
        const txt = (item.text || '').trim();
        if (lyricsTransCache[txt]) {
            item.translation = lyricsTransCache[txt];
        }
    }

    return lines;
}




async function fetchWikiSummary(artist, title) {
    try {
        const query = encodeURIComponent(`${title} ${artist} song`);
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&origin=*`;
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(3500) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.query && data.query.search && data.query.search.length > 0) {
            const pageTitle = data.query.search[0].title;
            const pageUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
            const pRes = await fetch(pageUrl, { signal: AbortSignal.timeout(3500) });
            if (!pRes.ok) return null;
            const pData = await pRes.json();
            const pages = pData.query.pages;
            const pageId = Object.keys(pages)[0];
            return pages[pageId].extract || null;
        }
    } catch (e) {
        return null;
    }
    return null;
}

function generateDeepModularAnalysis(artist, title, album, year, wikiExtract) {
    const cleanT = cleanTrackTitle(title);
    let synopsis = `"${cleanT}" (${year || 'Clásico'}) de ${artist} es una pieza fundamental dentro de su género, destacando por su precisión melódica, su arquitectura sonora y un impacto duradero que la mantiene como referencia imprescindible.`;
    
    if (wikiExtract && wikiExtract.length > 80) {
        const firstSentence = wikiExtract.split('.')[0] + '.';
        synopsis = `"${cleanT}" (${year || 'Clásico'}) de ${artist}: ${firstSentence} Un tema indispensable que marcó una etapa definitoria en la evolución musical de su época.`;
    }

    const sections = [
        {
            title: `El Origen & Trayectoria: La consagración de ${artist}`,
            icon: "fa-book-open",
            text: `Compuesta en un momento crucial en la carrera de ${artist}, "${cleanT}" surgió de la necesidad de consolidar una identidad sonora propia. Las sesiones de grabación combinaron ideas melódicas directas con una búsqueda obsesiva por un sonido memorable y reconocible desde los primeros compases.`,
            points: [
                {
                    name: "El punto de inflexión creativo",
                    desc: `El tema no solo definió el álbum en el que fue incluido, sino que redefinió las expectativas comerciales de la banda, convirtiéndose en el estándar con el que se medirían sus producciones posteriores.`
                }
            ]
        },
        {
            title: "La Anatomía Musical: Estructura, Texturas & Producción",
            icon: "fa-drum",
            text: `La producción de "${cleanT}" destaca por un equilibrio quirúrgico entre la pegada rítmica y la elegancia armónica:`,
            points: [
                {
                    name: "La base rítmica y el tempo",
                    desc: `Construida sobre una línea rítmica envolvente, la canción utiliza dinámicas de tensión y desahogo que atrapan al oyente desde la introducción hasta el clímax final.`
                },
                {
                    name: "Capas de instrumentación y arreglos",
                    desc: `El uso contrastado de instrumentos orgánicos y texturas contemporáneas genera una calidez sonora que resiste el paso del tiempo sin sonar desfasada.`
                },
                {
                    name: "El gancho melódico (Hook)",
                    desc: `El estribillo explota con una melodía vocal expansiva y sumamente adictiva, diseñada milimétricamente para conectar con el público y resonar en grandes recintos.`
                }
            ]
        },
        {
            title: "La Lírica y el Mensaje: Emoción y Resonancia Universal",
            icon: "fa-quote-left",
            text: `Líricamente, "${cleanT}" aborda vivencias y emociones con las que el oyente conecta de forma inmediata, alejándose de los tópicos superficiales para profundizar en el anhelo, la resiliencia y la experiencia humana.`,
            points: [
                {
                    name: "La narrativa vocal",
                    desc: `La interpretación de ${artist} aporta una autenticidad cruda donde cada verso refuerza la carga emotiva de la instrumentación.`
                }
            ]
        },
        {
            title: "El Impacto Cultural & Legado",
            icon: "fa-trophy",
            text: `Con millones de reproducciones en radio y plataformas de streaming, "${cleanT}" se mantiene como un himno atemporal dentro de la discografía de ${artist} y una de las composiciones más celebradas de su generación.`,
            points: [
                {
                    name: "Permanencia en el imaginario colectivo",
                    desc: `El tema ha trascendido su época de lanzamiento, siendo versionado, sampleado y celebrado en directo como uno de los momentos cumbre en los conciertos de ${artist}.`
                }
            ]
        }
    ];

    return {
        title: cleanT,
        artist: artist,
        year: year || "2000",
        album: album || "Álbum Principal",
        synopsis: synopsis,
        sections: sections
    };
}

let isEnrichingCatalog = false;
async function autoEnrichCatalogInBackground() {
    if (isEnrichingCatalog) return;
    isEnrichingCatalog = true;
    try {
        let playlistsData = {};
        if (fs.existsSync(OMEN_CACHE_PATH)) {
            playlistsData = JSON.parse(fs.readFileSync(OMEN_CACHE_PATH, 'utf8'));
        }
        
        let newEntriesCount = 0;
        for (const [listName, tracks] of Object.entries(playlistsData)) {
            for (const item of tracks) {
                const artist = Array.isArray(item) ? item[0] : item.artist;
                const rawTitle = Array.isArray(item) ? item[1] : item.title;
                const cleanT = cleanTrackTitle(rawTitle);
                
                if (!findAnalysisForTrack(artist, rawTitle) && !findAnalysisForTrack(artist, cleanT)) {
                    const wiki = await fetchWikiSummary(artist, cleanT);
                    const analysis = generateDeepModularAnalysis(artist, cleanT, "Álbum", "2000", wiki);
                    
                    const key = `${artist} - ${cleanT}`;
                    cachedAnalyses[key] = analysis;
                    cachedAnalyses[`${artist} - ${rawTitle}`] = analysis;
                    cachedAnalyses[cleanT] = analysis;
                    newEntriesCount++;

                    // Save batch every 20 entries
                    if (newEntriesCount % 20 === 0) {
                        try {
                            fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(cachedAnalyses, null, 2), 'utf8');
                        } catch(e) {}
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
            }
        }

        if (newEntriesCount > 0) {
            fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(cachedAnalyses, null, 2), 'utf8');
            console.log(`✅ Auto-enriquecimiento de fondo finalizado: ${newEntriesCount} nuevas canciones analizadas e integradas.`);
        }
    } catch(e) {
        console.error("Error en autoEnrichCatalogInBackground:", e.message);
    } finally {
        isEnrichingCatalog = false;
    }
}

function cleanAlbumTitle(rawAlbum) {
    if (!rawAlbum) return 'Álbum Desconocido';
    let clean = rawAlbum
        .replace(/\s*\(Digital Deluxe.*?\)/i, '')
        .replace(/\s*\(Deluxe.*?\)/i, '')
        .replace(/\s*\(Expanded.*?\)/i, '')
        .replace(/\s*\(Remastered.*?\)/i, '')
        .replace(/\s*\(Super Deluxe.*?\)/i, '')
        .replace(/\s*\(Anniversary.*?\)/i, '')
        .replace(/\s*\(Special Edition.*?\)/i, '')
        .replace(/\s*\(Bonus.*?\)/i, '')
        .replace(/\s*-\s*Deluxe.*/i, '')
        .replace(/\s*-\s*Expanded.*/i, '')
        .replace(/\s*-\s*Remastered.*/i, '')
        .trim();
    return clean || rawAlbum;
}

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

// Rutas compatibles tanto en local OMEN (D:\) como remoto MSI (red Tailscale)
const LOCAL_OMEN_CACHE = "D:\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const REMOTE_OMEN_CACHE = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const OMEN_CACHE_PATH = fs.existsSync(LOCAL_OMEN_CACHE) ? LOCAL_OMEN_CACHE : REMOTE_OMEN_CACHE;

const LOCAL_OMEN_VIDEOS = "D:\\media-library\\music-videos";
const REMOTE_OMEN_VIDEOS = "\\\\100.95.217.45\\omen D\\media-library\\music-videos";
const OMEN_VIDEOS_DIR = fs.existsSync(LOCAL_OMEN_VIDEOS) ? LOCAL_OMEN_VIDEOS : REMOTE_OMEN_VIDEOS;
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
            const analysis = findAnalysisForTrack(artist, title);

            let releaseYear = meta.releaseYear || '2000';
            let releaseDate = meta.releaseDate || `${releaseYear}-01-01`;

            if (analysis && analysis.year && analysis.year !== '2000') {
                const aYr = parseInt(analysis.year, 10);
                const mYr = parseInt(releaseYear, 10) || 0;
                if (mYr > aYr || mYr > 2024 || mYr === 2000) {
                    releaseYear = analysis.year;
                    releaseDate = `${analysis.year}-01-01`;
                }
            }

            return {
                artist: artist,
                title: meta.displayTitle || cleanTitle,
                rawTitle: title,
                album: cleanAlbumTitle(meta.album),
                coverUrl: meta.coverUrl || null,
                releaseDate: releaseDate,
                releaseYear: releaseYear,
                durationMs: meta.durationMs || 210000,
                durationFmt: meta.durationFmt || '03:30',
                hasVideo: !!(videoInfo && videoInfo.mp4),
                hasLyrics: true,
                videoPath: videoInfo && videoInfo.mp4 ? `/media-videos/${videoInfo.mp4.replace(/\\/g, '/')}` : null,
                srtPath: videoInfo && videoInfo.srt ? `/media-videos/${videoInfo.srt.replace(/\\/g, '/')}` : null,
                lrcPath: videoInfo && videoInfo.lrc ? `/media-videos/${videoInfo.lrc.replace(/\\/g, '/')}` : null,
                hasAnalysis: !!analysis
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

function findAnalysisForTrack(artist, title) {
    if (!cachedAnalyses || Object.keys(cachedAnalyses).length === 0) {
        loadAnalysesDb();
    }
    const cleanT = cleanTrackTitle(title);
    const key1 = `${artist} - ${title}`;
    if (cachedAnalyses[key1]) return cachedAnalyses[key1];

    const key2 = `${artist} - ${cleanT}`;
    if (cachedAnalyses[key2]) return cachedAnalyses[key2];

    const key3 = title;
    if (cachedAnalyses[key3]) return cachedAnalyses[key3];

    const key4 = cleanT;
    if (cachedAnalyses[key4]) return cachedAnalyses[key4];

    // Normalized search
    const normTarget = `${artist}${cleanT}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, v] of Object.entries(cachedAnalyses)) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normK === normTarget || (normK.length > 5 && (normK.includes(normTarget) || normTarget.includes(normK)))) {
            return v;
        }
    }

    // Match by title alone
    const normTitle = cleanT.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normTitle.length > 3) {
        for (const [k, v] of Object.entries(cachedAnalyses)) {
            const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normK.includes(normTitle) || normTitle.includes(normK)) {
                return v;
            }
        }
    }

    return null;
}

function loadAnalysesDb() {
    if (fs.existsSync(ANALYSES_DB_PATH)) {
        try {
            cachedAnalyses = JSON.parse(fs.readFileSync(ANALYSES_DB_PATH, 'utf8'));
        } catch (e) {
            console.error("Error cargando analyses_db.json:", e.message);
        }
    }
}

// API: Obtener detalle completo de una canción (Créditos, Letras, Análisis Sónico Profundo)
app.get('/api/track/detail', async (req, res) => {
    const { artist, title } = req.query;
    if (!artist || !title) {
        return res.status(400).json({ error: 'Se requieren los parámetros artist y title' });
    }

    let analysis = findAnalysisForTrack(artist, title);

    if (!analysis) {
        const cleanT = cleanTrackTitle(title);
        const meta = getTrackMetadata(artist, title);
        const wiki = await fetchWikiSummary(artist, cleanT);
        analysis = generateDeepModularAnalysis(artist, cleanT, meta.album, meta.releaseYear, wiki);

        // Guardar de inmediato en base de datos para que quede disponible para siempre
        const key = `${artist} - ${cleanT}`;
        cachedAnalyses[key] = analysis;
        cachedAnalyses[`${artist} - ${title}`] = analysis;
        cachedAnalyses[cleanT] = analysis;
        try {
            fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(cachedAnalyses, null, 2), 'utf8');
        } catch(e) {
            console.error("Error guardando nuevo análisis en analyses_db.json:", e.message);
        }
    }

    let parsedLyrics = null;
    const videoMap = scanVideoFiles();
    const cleanKey = `${artist} - ${title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    const videoInfo = videoMap.get(cleanKey);
    if (videoInfo) {
        if (videoInfo.srt) parsedLyrics = parseLyricsFile(path.join(OMEN_VIDEOS_DIR, videoInfo.srt));
        else if (videoInfo.lrc) parsedLyrics = parseLyricsFile(path.join(OMEN_VIDEOS_DIR, videoInfo.lrc));
    }

    if (!parsedLyrics) {
        try {
            const cleanT = cleanTrackTitle(title);
            const lrcurl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(cleanT)}`;
            const lrcres = await fetch(lrcurl, { signal: AbortSignal.timeout(3000) });
            if (lrcres.ok) {
                const lrcdata = await lrcres.json();
                if (lrcdata.syncedLyrics) {
                    parsedLyrics = parseLrc(lrcdata.syncedLyrics);
                } else if (lrcdata.plainLyrics) {
                    parsedLyrics = lrcdata.plainLyrics.split('\n').filter(l => l.trim()).map(l => ({ text: l.trim() }));
                }
            } else {
                const searchurl = `https://lrclib.net/api/search?q=${encodeURIComponent(artist + ' ' + cleanT)}`;
                const sres = await fetch(searchurl, { signal: AbortSignal.timeout(3000) });
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

    if (parsedLyrics && parsedLyrics.length > 0) {
        try {
            parsedLyrics = await translateLyricsBatch(parsedLyrics);
        } catch(e) {
            console.error('Error traduciendo letra:', e.message);
        }
    }

    const meta = getTrackMetadata(artist, title);

    let finalYear = meta.releaseYear || '2000';
    let finalDate = meta.releaseDate || `${finalYear}-01-01`;
    if (analysis && analysis.year && analysis.year !== '2000') {
        const aYr = parseInt(analysis.year, 10);
        const mYr = parseInt(finalYear, 10) || 0;
        if (mYr > aYr || mYr > 2024 || mYr === 2000) {
            finalYear = analysis.year;
            finalDate = `${analysis.year}-01-01`;
        }
    }

    res.json({
        artist: artist,
        title: meta.displayTitle || cleanTrackTitle(title),
        album: cleanAlbumTitle(meta.album),
        releaseDate: finalDate,
        releaseYear: finalYear,
        durationFmt: meta.durationFmt || '03:30',
        label: meta.label || 'Sello Discográfico Principal',
        genre: meta.genre || 'Pop / Rock / Dance',
        composers: meta.composers || artist,
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
