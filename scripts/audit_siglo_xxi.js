const fs = require('fs');

const OMEN_CACHE_PATH = '\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json';
const playlistsData = JSON.parse(fs.readFileSync(OMEN_CACHE_PATH, 'utf8'));
const metaCache = JSON.parse(fs.readFileSync('data/metadata_cache.json', 'utf8'));

// Obtener todas las canciones de las listas de Siglo XXI
const sigloTracks = [];
for (const [listName, tracks] of Object.entries(playlistsData)) {
    if (/siglo\s*xxi/i.test(listName)) {
        for (const item of tracks) {
            const artist = Array.isArray(item) ? item[0] : item.artist;
            const rawTitle = Array.isArray(item) ? item[1] : item.title;
            sigloTracks.push({ artist, rawTitle });
        }
    }
}

console.log(`Analizando ${sigloTracks.length} canciones de Siglo XXI...`);

async function queryItunes(artist, title) {
    const cleanT = title.replace(/\(.*?\)/g, '').replace(/-.*$/, '').trim();
    const q = encodeURIComponent(`${artist} ${cleanT}`.trim());
    try {
        const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=8`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.results || data.results.length === 0) return null;

        const normArt = artist.toLowerCase().split(/[,&]/)[0].trim();
        const normTit = cleanT.toLowerCase();

        for (const r of data.results) {
            const rArt = (r.artistName || '').toLowerCase();
            const rTit = (r.trackName || '').toLowerCase();
            if (rArt.includes(normArt) && (rTit.includes(normTit) || normTit.includes(rTit))) {
                if (!r.collectionName?.toLowerCase().includes('remix') && 
                    !r.collectionName?.toLowerCase().includes('greatest hits') &&
                    !r.collectionName?.toLowerCase().includes('best of')) {
                    return r;
                }
            }
        }
        return data.results[0];
    } catch(e) {
        return null;
    }
}

(async () => {
    let fixedCount = 0;
    for (const t of sigloTracks) {
        const cleanT = t.rawTitle.replace(/\(.*?\)/g, '').replace(/-.*$/, '').trim();
        const key1 = `${t.artist} - ${t.rawTitle}`.toLowerCase();
        const key2 = `${t.artist} - ${cleanT}`.toLowerCase();
        
        const currentMeta = metaCache[key1] || metaCache[key2];
        const currentYear = currentMeta ? parseInt(currentMeta.releaseYear || currentMeta.year, 10) : 2000;

        // Si la canción de Siglo XXI tiene año < 2000 o año 2000 placeholder, consultar iTunes
        if (!currentMeta || currentYear < 2000 || currentYear === 2000) {
            const r = await queryItunes(t.artist, t.rawTitle);
            if (r && r.releaseDate) {
                const date = r.releaseDate.split('T')[0];
                const year = date.split('-')[0];
                
                // Si el release de iTunes es válido para el Siglo XXI (o finales del 99)
                if (parseInt(year, 10) >= 1998) {
                    const updateObj = currentMeta || {};
                    updateObj.releaseYear = year;
                    updateObj.releaseDate = date;
                    updateObj.year = year;
                    updateObj.date = date;
                    if (r.collectionName && !updateObj.album) updateObj.album = r.collectionName;
                    if (r.artworkUrl100 && !updateObj.coverUrl) {
                        updateObj.coverUrl = r.artworkUrl100.replace('100x100bb', '600x600bb');
                    }
                    metaCache[key1] = updateObj;
                    metaCache[key2] = updateObj;
                    fixedCount++;
                    console.log(`[CORREGIDO] ${t.artist} - ${cleanT} => Año: ${year} (${date}) | Álbum: ${r.collectionName}`);
                }
            }
            // Pequeña pausa para no saturar la API
            await new Promise(res => setTimeout(res, 120));
        }
    }

    fs.writeFileSync('data/metadata_cache.json', JSON.stringify(metaCache, null, 2), 'utf8');
    console.log(`\n🎉 Auditoría completada: ${fixedCount} canciones de Siglo XXI corregidas con fechas exactas.`);
})();
