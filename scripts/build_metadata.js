const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const METADATA_CACHE_FILE = path.join(DATA_DIR, 'metadata_cache.json');
let metadataCache = {};

function cleanTrackTitle(rawTitle) {
    if (!rawTitle) return '';
    let clean = rawTitle
        .replace(/^\s*\.\.\.\s*/, '')
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

const SPOTDL_CACHE_PATH = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
let playlistsData = {};
if (fs.existsSync(SPOTDL_CACHE_PATH)) {
    playlistsData = JSON.parse(fs.readFileSync(SPOTDL_CACHE_PATH, 'utf8'));
} else {
    playlistsData = {
        "Música viejuna": [["Queen", "Bohemian Rhapsody - 2011 Remaster"], ["Michael Jackson", "Beat It"], ["Bryan Adams", "(Everything I Do) I Do It For You"]],
        "Siglo XXI": [["Coldplay", "Yellow"], ["The Killers", "Mr. Brightside"], ["OneRepublic", "Counting Stars"]],
        "Dance": [["Gala", "Freed from Desire"], ["Corona", "The Rhythm of the Night"], ["Gigi D'Agostino", "L'Amour Toujours"]],
        "Española": [["Fito & Fitipaldis", "Soldadito Marinero"], ["El Canto del Loco", "Zapatillas"], ["Amaral", "Sin Ti No Soy Nada"]],
        "Música latina": [["Juanes", "La Camisa Negra"], ["Shakira", "Whenever, Wherever"], ["Maná", "Clavado En Un Bar"]]
    };
}

async function run() {
    console.log("Generando portadas HD Deezer/iTunes y álbumes...");
    let count = 0;
    for (const [listName, tracks] of Object.entries(playlistsData)) {
        for (const item of tracks) {
            const artist = Array.isArray(item) ? item[0] : item.artist;
            const rawTitle = Array.isArray(item) ? item[1] : item.title;
            const displayTitle = cleanTrackTitle(rawTitle);
            const keyRaw = `${artist} - ${rawTitle}`.toLowerCase();
            const keyClean = `${artist} - ${displayTitle}`.toLowerCase();

            try {
                const query = encodeURIComponent(`${artist} ${displayTitle}`);
                const res = await fetch(`https://api.deezer.com/search?q=${query}`);
                const data = await res.json();
                
                if (data.data && data.data.length > 0) {
                    const track = data.data[0];
                    const coverUrl = track.album.cover_xl || track.album.cover_big;
                    const durationSec = track.duration || 210;
                    const m = Math.floor(durationSec / 60);
                    const s = durationSec % 60;
                    const durationFmt = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

                    const metaObj = {
                        displayTitle: displayTitle,
                        album: track.album.title || 'Álbum Desconocido',
                        coverUrl: coverUrl,
                        releaseDate: '1990-01-01',
                        releaseYear: '1990',
                        durationMs: durationSec * 1000,
                        durationFmt: durationFmt
                    };
                    metadataCache[keyRaw] = metaObj;
                    metadataCache[keyClean] = metaObj;
                    count++;
                    console.log(`[${count}] OK: ${artist} - ${displayTitle} -> Álbum: ${track.album.title}`);
                }
            } catch (e) {
                console.error(`Error para ${keyClean}:`, e.message);
            }
            await new Promise(r => setTimeout(r, 30));
        }
    }
    fs.writeFileSync(METADATA_CACHE_FILE, JSON.stringify(metadataCache, null, 2), 'utf8');
    console.log(`¡Portadas y Álbumes guardados! Total: ${Object.keys(metadataCache).length}`);
}

run();
