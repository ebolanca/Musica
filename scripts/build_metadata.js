const fs = require('fs');
const path = require('path');

const METADATA_CACHE_FILE = path.join(__dirname, '..', 'data', 'metadata_cache.json');
let metadataCache = {};
if (fs.existsSync(METADATA_CACHE_FILE)) {
    try {
        metadataCache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf8'));
    } catch (e) {}
}

const SPOTDL_CACHE_PATH = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
let playlistsData = {};
if (fs.existsSync(SPOTDL_CACHE_PATH)) {
    playlistsData = JSON.parse(fs.readFileSync(SPOTDL_CACHE_PATH, 'utf8'));
} else {
    playlistsData = {
        "Música viejuna": [["Queen", "Bohemian Rhapsody"], ["Michael Jackson", "Beat It"], ["Guns N' Roses", "Sweet Child O' Mine"]],
        "Siglo XXI": [["Coldplay", "Yellow"], ["The Killers", "Mr. Brightside"], ["OneRepublic", "Counting Stars"]],
        "Dance": [["Gala", "Freed from Desire"], ["Corona", "The Rhythm of the Night"], ["Gigi D'Agostino", "L'Amour Toujours"]],
        "Española": [["Fito & Fitipaldis", "Soldadito Marinero"], ["El Canto del Loco", "Zapatillas"], ["Amaral", "Sin Ti No Soy Nada"]],
        "Música latina": [["Juanes", "La Camisa Negra"], ["Shakira", "Whenever, Wherever"], ["Maná", "Clavado En Un Bar"]]
    };
}

async function run() {
    console.log("Iniciando generación de metadata (portadas, duración, álbumes, fecha lanzamiento)...");
    let count = 0;
    for (const [listName, tracks] of Object.entries(playlistsData)) {
        for (const item of tracks) {
            const artist = Array.isArray(item) ? item[0] : item.artist;
            const title = Array.isArray(item) ? item[1] : item.title;
            const key = `${artist} - ${title}`.toLowerCase();

            if (!metadataCache[key] || !metadataCache[key].coverUrl) {
                try {
                    const query = encodeURIComponent(`${artist} ${title}`);
                    const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
                    const data = await res.json();
                    if (data.results && data.results.length > 0) {
                        const track = data.results[0];
                        const coverUrl = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : null;
                        const releaseDate = track.releaseDate ? track.releaseDate.split('T')[0] : '2000-01-01';
                        const releaseYear = releaseDate ? releaseDate.split('-')[0] : '2000';
                        const durationMs = track.trackTimeMillis || 210000;
                        const totalSec = Math.floor(durationMs / 1000);
                        const m = Math.floor(totalSec / 60);
                        const s = totalSec % 60;
                        const durationFmt = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

                        metadataCache[key] = {
                            album: track.collectionName || 'Álbum Desconocido',
                            coverUrl: coverUrl,
                            releaseDate: releaseDate,
                            releaseYear: releaseYear,
                            durationMs: durationMs,
                            durationFmt: durationFmt
                        };
                        count++;
                        console.log(`[${count}] Metadata guardada para: ${artist} - ${title}`);
                    }
                } catch (e) {
                    console.error(`Error para ${key}:`, e.message);
                }
                await new Promise(r => setTimeout(r, 100)); // Rate limiting suave
            }
        }
    }
    fs.writeFileSync(METADATA_CACHE_FILE, JSON.stringify(metadataCache, null, 2), 'utf8');
    console.log(`¡Metadata completada! Se guardaron ${count} nuevas portadas y canciones.`);
}

run();
