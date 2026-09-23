const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '../data/analyses_db.json');
const OMEN_DB_PATH = '\\\\100.95.217.45\\omen D\\03_Trabajo\\Musica\\data\\analyses_db.json';

const META_PATH = path.join(__dirname, '../data/metadata_cache.json');
const OMEN_META_PATH = '\\\\100.95.217.45\\omen D\\03_Trabajo\\Musica\\data\\metadata_cache.json';

const ENV_PATH = path.join(__dirname, '../.env');

// Obtener GEMINI_API_KEY y SESSION_SECRET
let geminiKey = process.env.GEMINI_API_KEY;
let sessionSecret = process.env.SESSION_SECRET;

if (fs.existsSync(ENV_PATH)) {
    const env = fs.readFileSync(ENV_PATH, 'utf8');
    const m = env.match(/GEMINI_API_KEY=([^\r\n]+)/);
    if (m) geminiKey = m[1].trim();
    const s = env.match(/SESSION_SECRET=([^\r\n]+)/);
    if (s) sessionSecret = s[1].trim();
}

if (!geminiKey) {
    console.error("❌ ERROR: No se encontró GEMINI_API_KEY en .env ni en variables de entorno.");
    process.exit(1);
}

const ORDERED_LISTS = [
    'Música viejuna',
    'Siglo XXI',
    'Española',
    'Música latina',
    'Dance'
];

function loadDb() {
    if (fs.existsSync(DB_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        } catch(e) {}
    }
    return {};
}

function loadMeta() {
    if (fs.existsSync(META_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
        } catch(e) {}
    }
    return {};
}

function saveDb(db) {
    let diskDb = {};
    if (fs.existsSync(DB_PATH)) {
        try { diskDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch(e) {}
    }
    const merged = { ...diskDb, ...db };
    for (const k of Object.keys(merged)) db[k] = merged[k];

    const dataStr = JSON.stringify(db, null, 2);
    const tmpPath = `${DB_PATH}.tmp${process.pid}`;
    fs.writeFileSync(tmpPath, dataStr, 'utf8');
    fs.renameSync(tmpPath, DB_PATH);

    try {
        if (fs.existsSync(path.dirname(OMEN_DB_PATH))) {
            fs.writeFileSync(OMEN_DB_PATH, dataStr, 'utf8');
        }
    } catch(e) {}
}

function saveMeta(meta) {
    let diskMeta = {};
    if (fs.existsSync(META_PATH)) {
        try { diskMeta = JSON.parse(fs.readFileSync(META_PATH, 'utf8')); } catch(e) {}
    }
    const merged = { ...diskMeta, ...meta };
    for (const k of Object.keys(merged)) meta[k] = merged[k];

    const dataStr = JSON.stringify(meta, null, 2);
    const tmpPath = `${META_PATH}.tmp${process.pid}`;
    fs.writeFileSync(tmpPath, dataStr, 'utf8');
    fs.renameSync(tmpPath, META_PATH);

    try {
        if (fs.existsSync(path.dirname(OMEN_META_PATH))) {
            fs.writeFileSync(OMEN_META_PATH, dataStr, 'utf8');
        }
    } catch(e) {}
}

function cleanTitle(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*\(.*radio version.*\)/i, '')
        .replace(/\s*\(.*album version.*\)/i, '')
        .replace(/\s*\(.*single version.*\)/i, '')
        .replace(/\s*\(.*from ".*?".*\)/i, '')
        .replace(/\s*-\s*from ".*?".*/i, '')
        .replace(/\s*-\s*radio version.*/i, '')
        .replace(/\s*-\s*remaster.*/i, '')
        .replace(/\s*\(.*remaster.*\)/i, '')
        .trim();
}

function cleanAlbumTitle(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*\(\d+(?:th|nd|rd|st)?\s*anniversary(?:\s*edition)?\)/gi, '')
        .replace(/\s*\[\d+(?:th|nd|rd|st)?\s*anniversary(?:\s*edition)?\]/gi, '')
        .replace(/\s*\(remaster(?:ed)?(?:\s*\d{4})?\)/gi, '')
        .replace(/\s*\[remaster(?:ed)?(?:\s*\d{4})?\]/gi, '')
        .replace(/\s*\((?:deluxe|expanded|legacy|special)\s*edition\)/gi, '')
        .replace(/\s*\[(?:deluxe|expanded|legacy|special)\s*edition\]/gi, '')
        .trim();
}

async function fetchDeezerCover(artist, album) {
    try {
        const query = encodeURIComponent(`${artist} ${album}`);
        const res = await fetch(`https://api.deezer.com/search/album?q=${query}&limit=3`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
            const data = await res.json();
            const alb = data.data?.[0];
            if (alb && (alb.cover_xl || alb.cover_big)) {
                return alb.cover_xl || alb.cover_big;
            }
        }
    } catch(e) {}
    return null;
}

async function analyzeAndEnrichTrack(artist, title, currentAlbum, currentYear) {
    const cleanT = cleanTitle(title);
    const prompt = `Instrucciones para análisis técnico, documental y forense de canciones:
Actúa como un musicólogo experto, productor e ingeniero de sonido. Realiza un análisis exhaustivo y técnico en profundidad de la canción "${cleanT}" de ${artist}.

Identificación de Metadatos Canónicos (Estricto):
1. "originalAlbum": Nombre exacto del ÁLBUM DE ESTUDIO ORIGINAL donde se publicó por primera vez (PROHIBIDO poner Grandes Éxitos, recopilatorios, 'Best Of', 'Anniversary', directos o reediciones).
2. "releaseYear": Año original de lanzamiento (ej: "1983").
3. "releaseDate": Fecha original (YYYY-MM-DD o YYYY-01-01).
4. "composers": Nombres de los compositores y autores reales (personas físicas).
5. "label": Sello discográfico original de la primera edición.
6. "genre": Género musical preciso.

Debes responder ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "title": "${cleanT}",
  "artist": "${artist}",
  "year": "${currentYear || '2000'}",
  "originalAlbum": "${currentAlbum || 'Álbum original'}",
  "releaseYear": "...",
  "releaseDate": "...",
  "composers": "...",
  "label": "...",
  "genre": "...",
  "synopsis": "Sinopsis técnica de entrada directa (3-5 líneas) resumiendo la tesis sónica y la trascendencia de la obra...",
  "sections": [
    {
      "title": "1. Anatomía Musical y Producción de Estudio",
      "icon": "fa-sliders",
      "text": "Análisis exhaustivo de instrumentos clave, capas de pistas, arreglos, frecuencias, técnicas de grabación y labor del productor e ingenieros..."
    },
    {
      "title": "2. Análisis Lírico y Desglose Verso a Verso",
      "icon": "fa-align-left",
      "text": "Temática central, trasfondo psicológico. Selección de estrofas clave en su idioma original con lecciones de vocabulario, dobles sentidos y autopsia verso a verso..."
    },
    {
      "title": "3. Narrativa Visual y Videoclip",
      "icon": "fa-film",
      "text": "Dirección, fotografía, concepto artístico y simbolismo del vídeo oficial. (Si no existe, analiza la estética y portada)..."
    },
    {
      "title": "4. Impacto Cultural y Curiosidades",
      "icon": "fa-award",
      "text": "Rendimiento comercial, listas, sincronizaciones y repercusión real..."
    }
  ]
}`;

    const availableModels = [
        'gemini-3-flash-preview',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest'
    ];

    for (const model of availableModels) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.25 }
                }),
                signal: AbortSignal.timeout(20000)
            });

            if (res.status === 429) {
                console.warn(`⚠️ Cuota agotada en modelo [${model}]. Probando siguiente...`);
                continue;
            }

            if (!res.ok) {
                continue;
            }

            const d = await res.json();
            const rawAnswer = d.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawAnswer) {
                const parsed = JSON.parse(rawAnswer);
                parsed._aiModel = model;
                return parsed;
            }
        } catch(e) {
            // probar siguiente
        }
    }

    throw new Error("ALL_QUOTAS_EXHAUSTED");
}

async function fetchPlaylists() {
    let authHeader = {};
    if (sessionSecret) {
        const exp = Date.now() + 3600000;
        const hmac = crypto.createHmac('sha256', sessionSecret).update(String(exp)).digest('hex');
        authHeader = { Cookie: `musica_session=${exp}.${hmac}` };
    }

    const hosts = ['http://100.95.217.45:8087', 'http://localhost:8087'];
    for (const host of hosts) {
        try {
            const res = await fetch(`${host}/api/playlists`, { headers: authHeader, signal: AbortSignal.timeout(5000) });
            if (res.ok) return await res.json();
        } catch(e) {}
    }

    const localOmenCache = '\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json';
    if (fs.existsSync(localOmenCache)) {
        try {
            const raw = JSON.parse(fs.readFileSync(localOmenCache, 'utf8'));
            const out = {};
            for (const [k, v] of Object.entries(raw)) {
                out[k] = v.map(item => ({
                    artist: Array.isArray(item) ? item[0] : item.artist,
                    title: Array.isArray(item) ? item[1] : item.title
                }));
            }
            return out;
        } catch(e) {}
    }

    return {};
}

// Bucle Continuo (Daemon)
(async () => {
    console.log("==========================================================");
    console.log("🚀 WORKER CONTINUO DE ANÁLISIS Y ENRIQUECIMIENTO GEMINI IA");
    console.log("==========================================================");

    while (true) {
        try {
            const playlists = await fetchPlaylists();
            const db = loadDb();
            const meta = loadMeta();

            let totalPending = 0;
            let processedInRun = 0;

            for (const listName of ORDERED_LISTS) {
                const tracks = playlists[listName] || [];
                if (tracks.length === 0) continue;

                for (let i = 0; i < tracks.length; i++) {
                    const t = tracks[i];
                    const rawTitle = t.title || t.rawTitle || '';
                    const cleanT = cleanTitle(rawTitle);
                    const artist = t.artist || 'Desconocido';

                    const keyExact = `${artist} - ${cleanT}`;
                    const keyRaw = `${artist} - ${rawTitle}`;

                    const mKey1 = keyExact.toLowerCase();
                    const mKey2 = keyRaw.toLowerCase();
                    const mKey3 = cleanT.toLowerCase();

                    const currentMeta = meta[mKey1] || meta[mKey2] || meta[mKey3] || {};
                    const hasAnalysis = !!(db[keyExact] || db[keyRaw]);
                    const isEnriched = !!currentMeta.geminiEnriched;

                    // Si ya tiene análisis Y está enriquecido con Gemini -> Saltar
                    if (hasAnalysis && isEnriched) {
                        continue;
                    }

                    totalPending++;

                    console.log(`\n🎵 [${listName}] Procesando: "${artist} - ${cleanT}" (${hasAnalysis ? 'Análisis OK' : 'Falta Análisis'}, ${isEnriched ? 'Créditos OK' : 'Faltan Créditos'})...`);

                    let success = false;
                    let attempts = 0;

                    while (!success && attempts < 3) {
                        attempts++;
                        try {
                            const result = await analyzeAndEnrichTrack(artist, cleanT, currentMeta.album, currentMeta.releaseYear || t.releaseYear);
                            if (result) {
                                // 1. Guardar Análisis
                                if (result.sections && result.sections.length >= 4) {
                                    db[keyExact] = result;
                                    saveDb(db);
                                }

                                // 2. Guardar Metadatos y Álbum Canónico
                                const verifiedAlbum = cleanAlbumTitle(result.originalAlbum || currentMeta.album || 'Álbum Oficial');
                                const verifiedYear = String(result.releaseYear || result.year || currentMeta.releaseYear || '2000').trim();
                                const verifiedDate = String(result.releaseDate || `${verifiedYear}-01-01`).trim();
                                const verifiedComposers = String(result.composers || currentMeta.composers || artist).trim();
                                const verifiedLabel = String(result.label || currentMeta.label || 'Sello Discográfico Principal').trim();
                                const verifiedGenre = String(result.genre || currentMeta.genre || 'Pop / Rock').trim();

                                // Buscar carátula si el álbum cambió o no tiene
                                let cover = currentMeta.coverUrl;
                                if (!cover || (verifiedAlbum && verifiedAlbum !== currentMeta.album)) {
                                    const primaryArtist = artist.split(/[,&]/)[0].replace(/\bfeat\.?.*$/i, '').trim();
                                    const newCover = await fetchDeezerCover(primaryArtist, verifiedAlbum) || await fetchDeezerCover(artist, verifiedAlbum);
                                    if (newCover) cover = newCover;
                                }

                                const updatedMeta = {
                                    ...currentMeta,
                                    title: cleanT,
                                    displayTitle: cleanT,
                                    artist: artist,
                                    album: verifiedAlbum,
                                    releaseYear: verifiedYear,
                                    releaseDate: verifiedDate,
                                    year: verifiedYear,
                                    date: verifiedDate,
                                    composers: verifiedComposers,
                                    label: verifiedLabel,
                                    genre: verifiedGenre,
                                    coverUrl: cover || null,
                                    geminiEnriched: true
                                };

                                const primaryArt = artist.split(/[,&]/)[0].replace(/\bfeat\.?.*$/i, '').trim();
                                const mKey4 = `${primaryArt} - ${cleanT}`.toLowerCase();
                                const mKey5 = `${primaryArt} - ${rawTitle}`.toLowerCase();

                                meta[mKey1] = updatedMeta;
                                meta[mKey2] = updatedMeta;
                                meta[mKey3] = updatedMeta;
                                meta[mKey4] = updatedMeta;
                                meta[mKey5] = updatedMeta;

                                saveMeta(meta);

                                console.log(`✅ [ENRIQUECIDO] "${artist} - ${cleanT}" -> Álbum: "${verifiedAlbum}" (${verifiedYear})`);
                                processedInRun++;
                                success = true;
                            }
                        } catch(err) {
                            if (err.message === 'ALL_QUOTAS_EXHAUSTED') {
                                console.warn('⏸️ [CUOTA DIARIA/MINUTO AGOTADA]. Esperando 5 minutos antes de continuar...');
                                await new Promise(r => setTimeout(r, 5 * 60 * 1000));
                            } else {
                                console.error(`❌ Error procesando "${cleanT}":`, err.message);
                                break;
                            }
                        }
                    }

                    // Pausa de seguridad de 8 segundos entre canciones (respetando Free Tier ~7 RPM)
                    await new Promise(r => setTimeout(r, 8000));
                }
            }

            if (processedInRun === 0) {
                console.log("\n😴 [TODO AL DÍA] Toda la biblioteca está analizada y verificada con Gemini.");
                console.log("💤 Esperando 5 minutos para buscar nuevas canciones añadidas...");
                await new Promise(r => setTimeout(r, 5 * 60 * 1000));
            } else {
                console.log(`\n🏁 Ronda completada: ${processedInRun} canciones analizadas y enriquecidas.`);
            }
        } catch(cycleError) {
            console.error("Error en ciclo principal del worker:", cycleError.message);
            await new Promise(r => setTimeout(r, 60000));
        }
    }
})();
