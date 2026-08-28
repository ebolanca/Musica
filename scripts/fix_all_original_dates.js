const fs = require('fs');
const path = require('path');

const METADATA_CACHE_PATH = path.join(__dirname, '../data/metadata_cache.json');
const ANALYSES_DB_PATH = path.join(__dirname, '../data/analyses_db.json');
const LOCAL_OMEN_CACHE = "D:\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const REMOTE_OMEN_CACHE = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const OMEN_CACHE_PATH = fs.existsSync(LOCAL_OMEN_CACHE) ? LOCAL_OMEN_CACHE : REMOTE_OMEN_CACHE;

let metaCache = {};
if (fs.existsSync(METADATA_CACHE_PATH)) {
    try { metaCache = JSON.parse(fs.readFileSync(METADATA_CACHE_PATH, 'utf8')); } catch(e){}
}

let analysesDb = {};
if (fs.existsSync(ANALYSES_DB_PATH)) {
    try { analysesDb = JSON.parse(fs.readFileSync(ANALYSES_DB_PATH, 'utf8')); } catch(e){}
}

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

function normalize(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchEarliestReleaseDate(artist, title) {
    const cleanT = cleanTrackTitle(title);
    const normArt = normalize(artist.split(/[,&]/)[0]); // Primary artist
    
    // 1. iTunes Search API (fast, high accuracy on original studio dates)
    try {
        const query = encodeURIComponent(`${artist} ${cleanT}`);
        const url = `https://itunes.apple.com/search?term=${query}&entity=song&limit=15`;
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                // Filter matching artist
                const matching = data.results.filter(r => {
                    const rArt = normalize(r.artistName);
                    return rArt.includes(normArt) || normArt.includes(rArt) || rArt.slice(0, 5) === normArt.slice(0, 5);
                });

                const pool = matching.length > 0 ? matching : data.results;
                const dates = pool
                    .map(r => r.releaseDate)
                    .filter(d => d && typeof d === 'string');
                if (dates.length > 0) {
                    dates.sort();
                    const earliest = dates[0];
                    const year = earliest.split('-')[0];
                    const numYear = parseInt(year, 10);
                    if (numYear >= 1950 && numYear <= 2026) {
                        return { date: earliest.split('T')[0], year: year };
                    }
                }
            }
        }
    } catch(e) {}

    // 2. Wikipedia Search API fallback
    try {
        const q = encodeURIComponent(`${cleanT} ${artist} song`);
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json&origin=*`;
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const data = await res.json();
            if (data.query?.search?.[0]) {
                const pageTitle = data.query.search[0].title;
                const parseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json&origin=*`;
                const pres = await fetch(parseUrl, { signal: AbortSignal.timeout(3000) });
                if (pres.ok) {
                    const pdata = await pres.json();
                    const wikitext = pdata.parse?.wikitext?.['*'] || '';
                    const matchReleased = wikitext.match(/\|\s*released\s*=\s*.*?(\b(19\d{2}|20[0-2]\d)\b)/i);
                    if (matchReleased) {
                        const y = matchReleased[1];
                        return { date: `${y}-01-01`, year: y };
                    }
                }
            }
        }
    } catch(e) {}

    return null;
}

async function fixAllDates() {
    console.log("Iniciando auditoría de fechas de lanzamiento a las originales...");
    
    let playlistsData = {};
    if (fs.existsSync(OMEN_CACHE_PATH)) {
        playlistsData = JSON.parse(fs.readFileSync(OMEN_CACHE_PATH, 'utf8'));
    }

    let updatedCount = 0;
    for (const [listName, tracks] of Object.entries(playlistsData)) {
        console.log(`\n📂 Verificando playlist: [${listName}] (${tracks.length} temas)...`);
        
        for (const item of tracks) {
            const artist = Array.isArray(item) ? item[0] : item.artist;
            const rawTitle = Array.isArray(item) ? item[1] : item.title;
            const cleanT = cleanTrackTitle(rawTitle);

            const key = `${artist} - ${rawTitle}`;
            const keyClean = `${artist} - ${cleanT}`;

            let currentYear = '2000';
            if (metaCache[key]?.releaseYear) currentYear = metaCache[key].releaseYear;
            else if (metaCache[keyClean]?.releaseYear) currentYear = metaCache[keyClean].releaseYear;

            const yrNum = parseInt(currentYear, 10) || 0;
            const isSuspicious = yrNum === 2000 || yrNum >= 2024 || (listName === 'Música viejuna' && yrNum > 1999);

            if (isSuspicious) {
                const earliest = await fetchEarliestReleaseDate(artist, rawTitle);
                if (earliest && earliest.year) {
                    console.log(`✨ [${artist} - ${cleanT}]: Corregido ${currentYear} -> ${earliest.year} (${earliest.date})`);

                    if (!metaCache[key]) metaCache[key] = {};
                    metaCache[key].releaseDate = earliest.date;
                    metaCache[key].releaseYear = earliest.year;

                    if (!metaCache[keyClean]) metaCache[keyClean] = {};
                    metaCache[keyClean].releaseDate = earliest.date;
                    metaCache[keyClean].releaseYear = earliest.year;

                    if (analysesDb[key]) analysesDb[key].year = earliest.year;
                    if (analysesDb[keyClean]) analysesDb[keyClean].year = earliest.year;

                    updatedCount++;
                    if (updatedCount % 15 === 0) {
                        fs.writeFileSync(METADATA_CACHE_PATH, JSON.stringify(metaCache, null, 2), 'utf8');
                        fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(analysesDb, null, 2), 'utf8');
                    }
                    await new Promise(r => setTimeout(r, 60));
                }
            }
        }
    }

    fs.writeFileSync(METADATA_CACHE_PATH, JSON.stringify(metaCache, null, 2), 'utf8');
    fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(analysesDb, null, 2), 'utf8');
    console.log(`\n🎉 Auditoría completada. Fechas originales corregidas en ${updatedCount} canciones.`);
}

fixAllDates();
