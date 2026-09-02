const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const METADATA_CACHE_PATH = path.join(DATA_DIR, 'metadata_cache.json');
const ANALYSES_DB_PATH = path.join(DATA_DIR, 'analyses_db.json');
const LOCAL_OMEN_CACHE = "D:\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const REMOTE_OMEN_CACHE = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const TRACKS_CACHE_PATH = fs.existsSync(LOCAL_OMEN_CACHE) ? LOCAL_OMEN_CACHE : REMOTE_OMEN_CACHE;

let metaCache = {};
try { metaCache = JSON.parse(fs.readFileSync(METADATA_CACHE_PATH, 'utf8')); } catch(e){}
let analysesDb = {};
try { analysesDb = JSON.parse(fs.readFileSync(ANALYSES_DB_PATH, 'utf8')); } catch(e){}
let tracksCache = {};
try { tracksCache = JSON.parse(fs.readFileSync(TRACKS_CACHE_PATH, 'utf8')); } catch(e){ process.exit(1); }

function cleanTrackTitle(rawTitle) {
    if (!rawTitle) return '';
    return rawTitle
        .replace(/\s*-\s*\d{4}\s*Remaster.*/i, '').replace(/\s*-\s*Remastered.*/i, '').replace(/\s*-\s*Remaster\b.*/i, '')
        .replace(/\s*\(.*remaster.*\)/i, '').replace(/\s*-\s*Remix.*/i, '').replace(/\s*\(.*remix.*\)/i, '')
        .replace(/\s*-\s*Club Mix.*/i, '').replace(/\s*-\s*Extended Mix.*/i, '').replace(/\s*-\s*Radio Mix.*/i, '')
        .replace(/\s*-\s*Mix\b.*/i, '').replace(/\s*-\s*Club Edit.*/i, '').replace(/\s*-\s*Radio Edit.*/i, '')
        .replace(/\s*\(.*radio edit.*\)/i, '').replace(/\s*-\s*Extended\b.*/i, '').replace(/\s*-\s*Mono\b.*/i, '')
        .replace(/\s*-\s*Stereo\b.*/i, '').replace(/\s*-\s*Live\b.*/i, '').replace(/\s*\(Live.*\)/i, '')
        .replace(/\s*-\s*Acoustic.*/i, '').replace(/\s*\(.*acoustic.*\)/i, '').replace(/\s*-\s*Unplugged.*/i, '')
        .replace(/\s*-\s*Demo\b.*/i, '').replace(/\s*-\s*Single Version.*/i, '').replace(/\s*-\s*Album Version.*/i, '')
        .replace(/\s*\(.*deluxe.*\)/i, '').replace(/\s*-\s*Original\b.*/i, '').replace(/\s*-\s*From\s+".*?".*/i, '')
        .replace(/\s*\(.*Sped Up.*\)/i, '').replace(/\s*\(.*Slowed.*\)/i, '').replace(/\s*-\s*Version\s+\d{4}.*/i, '')
        .replace(/\s*\(.*Version\s+\d{4}.*\)/i, '').replace(/\s*\(.*Revisited.*\)/i, '').replace(/\s*\(.*Edit\)/i, '')
        .replace(/\s*\(.*Mixed\)/i, '').replace(/\s*\(feat\.?\s+.*\)$/i, '').replace(/\s*\(featuring\s+.*\)$/i, '')
        .replace(/\s*\(with\s+.*\)$/i, '').replace(/\s*-\s*feat\.?\s+.*$/i, '').replace(/^\s*\.\.\./, '')
        .replace(/^[(\[]+([^)]+)[)\]]\s*/, '$1 ').replace(/\s+/g, ' ').trim();
}

function normalize(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

let stats = { datesFixed: 0, mbHits: 0, itHits: 0, skipped: 0 };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchMusicBrainzDate(artist, title) {
    const cleanT = cleanTrackTitle(title);
    const pa = artist.split(/[,&]/)[0].trim();
    try {
        const q = encodeURIComponent(`recording:"${cleanT}" AND artist:"${pa}"`);
        const res = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${q}&fmt=json&limit=10`, {
            headers: { 'User-Agent': 'MusicaWebApp/1.5 (roberto@example.com)' },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.recordings) return null;
        const na = normalize(pa), nt = normalize(cleanT);
        let best = null;
        for (const rec of data.recordings) {
            const arts = (rec['artist-credit']||[]).map(ac => normalize(ac.name||ac.artist?.name||''));
            if (!arts.some(a => a.includes(na) || na.includes(a))) continue;
            const rt = normalize(rec.title||'');
            if (rt !== nt && !rt.includes(nt) && !nt.includes(rt)) continue;
            const frd = rec['first-release-date'];
            if (frd && frd.length >= 4) {
                const y = parseInt(frd.substring(0,4),10);
                if (y >= 1950 && y <= 2026 && (!best || frd < best)) best = frd;
            }
        }
        if (best) { const p = best.split('-'); return { date: `${p[0]}-${p[1]||'01'}-${p[2]||'01'}`, year: p[0] }; }
    } catch(e) {}
    return null;
}

async function fetchItunesDate(artist, title) {
    const cleanT = cleanTrackTitle(title);
    const na = normalize(artist.split(/[,&]/)[0]);
    try {
        const q = encodeURIComponent(`${artist} ${cleanT}`);
        const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=15`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.results || !data.results.length) return null;
        const m = data.results.filter(r => { const a = normalize(r.artistName); return a.includes(na)||na.includes(a); });
        const pool = m.length > 0 ? m : data.results;
        const dates = pool.map(r => r.releaseDate).filter(Boolean);
        if (dates.length) { dates.sort(); const y = dates[0].split('-')[0]; if (+y >= 1950 && +y <= 2026) return { date: dates[0].split('T')[0], year: y }; }
    } catch(e) {}
    return null;
}

async function fixDate(artist, title) {
    const mb = await fetchMusicBrainzDate(artist, title);
    await sleep(1100);
    if (mb) { stats.mbHits++; return mb; }
    const it = await fetchItunesDate(artist, title);
    await sleep(50);
    if (it) { stats.itHits++; return it; }
    return null;
}

function saveProgress() {
    try {
        fs.writeFileSync(METADATA_CACHE_PATH, JSON.stringify(metaCache, null, 2), 'utf8');
        fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(analysesDb, null, 2), 'utf8');
    } catch(e) { console.error("Error guardando:", e.message); }
}

async function main() {
    console.log("================================================================");
    console.log("  Correccion de Fechas con MusicBrainz v3 (SOLO FECHAS)");
    console.log("================================================================\n");
    const total = Object.values(tracksCache).reduce((s, t) => s + t.length, 0);
    console.log(`Total: ${total} canciones\n`);
    let processed = 0;
    
    for (const [listName, tracks] of Object.entries(tracksCache)) {
        console.log(`\n[${listName}] (${tracks.length})`);
        
        for (let i = 0; i < tracks.length; i++) {
            const item = tracks[i];
            const artist = Array.isArray(item) ? item[0] : item.artist;
            const rawTitle = Array.isArray(item) ? item[1] : item.title;
            const cleanT = cleanTrackTitle(rawTitle);
            processed++;
            if (processed % 50 === 0) console.log(`  ... ${processed}/${total} ...`);
            const kr = `${artist} - ${rawTitle}`.toLowerCase();
            const kc = `${artist} - ${cleanT}`.toLowerCase();
            
            // Solo corregir fecha si es sospechosa
            let cy = metaCache[kr]?.releaseYear || metaCache[kc]?.releaseYear || '2000';
            const yn = parseInt(cy,10)||0;
            const suspicious = (yn===2000 || yn>=2024 || yn===0 || (listName.includes('viejuna') && yn>1999));
            
            if (suspicious) {
                const fixed = await fixDate(artist, rawTitle);
                if (fixed) {
                    if (!metaCache[kr]) metaCache[kr] = {};
                    metaCache[kr].releaseDate = fixed.date; metaCache[kr].releaseYear = fixed.year;
                    if (!metaCache[kc]) metaCache[kc] = {};
                    metaCache[kc].releaseDate = fixed.date; metaCache[kc].releaseYear = fixed.year;
                    if (analysesDb[kr]) analysesDb[kr].year = fixed.year;
                    if (analysesDb[kc]) analysesDb[kc].year = fixed.year;
                    stats.datesFixed++;
                    if (cy !== fixed.year) console.log(`  ${artist} - ${cleanT}: ${cy} -> ${fixed.year}`);
                    if (stats.datesFixed % 25 === 0) saveProgress();
                } else { stats.skipped++; }
            }
        }
    }
    
    saveProgress();
    console.log("\n================================================================");
    console.log(`  Fechas corregidas: ${stats.datesFixed}`);
    console.log(`  MusicBrainz: ${stats.mbHits} | iTunes: ${stats.itHits} | Sin resultado: ${stats.skipped}`);
    console.log("================================================================");
}

main().catch(e => { console.error(e); saveProgress(); process.exit(1); });
