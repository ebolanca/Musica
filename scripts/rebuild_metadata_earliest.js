const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const METADATA_CACHE_FILE = path.join(DATA_DIR, 'metadata_cache.json');

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

const SPOTDL_CACHE_PATH = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
let playlistsData = {};
if (fs.existsSync(SPOTDL_CACHE_PATH)) {
    playlistsData = JSON.parse(fs.readFileSync(SPOTDL_CACHE_PATH, 'utf8'));
}

async function getEarliestYear(artist, title, fallbackYear) {
    let years = [];
    try {
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=8`;
        const res = await fetch(itunesUrl);
        const data = await res.json();
        if (data.results) {
            for (const r of data.results) {
                if (r.releaseDate) {
                    const y = parseInt(r.releaseDate.substring(0, 4), 10);
                    if (y >= 1950 && y <= 2026) years.push(y);
                }
            }
        }
    } catch(e){}

    if (years.length > 0) {
        return Math.min(...years).toString();
    }
    return fallbackYear || '1990';
}

async function run() {
    console.log("Limpiando nombres de álbumes y calculando años originales de lanzamiento...");
    let metadataCache = {};
    if (fs.existsSync(METADATA_CACHE_FILE)) {
        try { metadataCache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf8')); } catch(e){}
    }

    let count = 0;
    for (const [key, meta] of Object.entries(metadataCache)) {
        if (meta.album) {
            meta.album = cleanAlbumTitle(meta.album);
        }
        count++;
    }

    // Re-evaluar canciones clave con fecha original de iTunes
    for (const [listName, tracks] of Object.entries(playlistsData)) {
        for (const item of tracks) {
            const artist = Array.isArray(item) ? item[0] : item.artist;
            const rawTitle = Array.isArray(item) ? item[1] : item.title;
            const displayTitle = cleanTrackTitle(rawTitle);
            const keyRaw = `${artist} - ${rawTitle}`.toLowerCase();
            const keyClean = `${artist} - ${displayTitle}`.toLowerCase();

            let meta = metadataCache[keyRaw] || metadataCache[keyClean];
            if (meta) {
                meta.album = cleanAlbumTitle(meta.album);
                // Si el año es posterior a 2004 en Música viejuna o si queremos el año de lanzamiento original
                const curY = parseInt(meta.releaseYear || '2000', 10);
                if (listName === "Música viejuna" || curY > 2004) {
                    const earliestY = await getEarliestYear(artist, displayTitle, meta.releaseYear);
                    meta.releaseYear = earliestY;
                }
                metadataCache[keyRaw] = meta;
                metadataCache[keyClean] = meta;
            }
            await new Promise(r => setTimeout(r, 20));
        }
    }

    fs.writeFileSync(METADATA_CACHE_FILE, JSON.stringify(metadataCache, null, 2), 'utf8');
    console.log(`¡Metadata optimizada con álbumes limpios y años originales! Total: ${Object.keys(metadataCache).length}`);
}

run();
