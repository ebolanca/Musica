const fs = require('fs');
const path = require('path');

const ANALYSES_DB_PATH = path.join(__dirname, '../data/analyses_db.json');
const METADATA_CACHE_FILE = path.join(__dirname, '../data/metadata_cache.json');

function cleanTrackTitle(title) {
    if (!title) return '';
    let clean = String(title)
        .replace(/\s*\([^)]*(?:remaster|deluxe|version|edit|live|directo|original|single|radio|feat|ft\.)[^)]*\)/gi, '')
        .replace(/\s*\[[^\]]*(?:remaster|deluxe|version|edit|live|directo|original|single|radio|feat|ft\.)[^\]]*\]/gi, '')
        .replace(/\s*-\s*(?:remaster|deluxe|version|edit|live|directo|radio edit).*/gi, '')
        .trim();
    return clean || title;
}

function cleanTitleForMatching(raw) {
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

function cleanTrackKey(str) {
    if (!str) return '';
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function hasValidAnalysis(artist, title, analysesDb) {
    const cleanT = cleanTrackTitle(title);
    const cleanT2 = cleanTitleForMatching(title);

    const candidates = [
        `${artist} - ${title}`,
        `${artist} - ${cleanT}`,
        `${artist} - ${cleanT2}`,
        `${title}`,
        `${cleanT}`
    ];

    for (const c of candidates) {
        if (analysesDb[c] && (analysesDb[c].sections || analysesDb[c].synopsis || analysesDb[c].text)) {
            return { ok: true, matchedKey: c };
        }
    }

    // Normalized search
    const normTarget = cleanTrackKey(artist) + cleanTrackKey(cleanT);
    for (const [k, v] of Object.entries(analysesDb)) {
        if (!v) continue;
        const normK = cleanTrackKey(k);
        if (normK === normTarget || normK.startsWith(normTarget) || normTarget.startsWith(normK)) {
            if (v.sections || v.synopsis || v.text) {
                return { ok: true, matchedKey: k };
            }
        }
    }

    return { ok: false };
}

function hasValidCredits(artist, title, metadataCache) {
    const cleanT = cleanTrackTitle(title);
    const cleanT2 = cleanTitleForMatching(title);

    const keys = [
        `${artist} - ${title}`.toLowerCase(),
        `${artist} - ${cleanT}`.toLowerCase(),
        `${artist} - ${cleanT2}`.toLowerCase(),
        cleanT.toLowerCase(),
        title.toLowerCase()
    ];

    for (const k of keys) {
        const m = metadataCache[k];
        if (m) {
            const hasAlbum = !!(m.album || m.originalAlbum);
            const hasYear = !!(m.releaseYear || m.year);
            const hasComposers = !!(m.composers && m.composers !== 'Desconocido' && m.composers !== '');
            const hasLabel = !!(m.label && m.label !== '');
            const hasGenre = !!(m.genre && m.genre !== '');
            const isEnriched = !!m.geminiEnriched;

            const isComplete = hasAlbum && hasYear && (hasComposers || hasLabel || isEnriched);
            return {
                found: true,
                isComplete,
                isEnriched,
                album: m.album || m.originalAlbum || 'N/A',
                year: m.releaseYear || m.year || 'N/A',
                composers: m.composers || 'N/A',
                label: m.label || 'N/A',
                genre: m.genre || 'N/A'
            };
        }
    }

    // Normalized lookup
    const normTarget = cleanTrackKey(artist) + cleanTrackKey(cleanT);
    for (const [k, m] of Object.entries(metadataCache)) {
        if (!m) continue;
        const normK = cleanTrackKey(k);
        if (normK === normTarget) {
            const hasAlbum = !!(m.album || m.originalAlbum);
            const hasYear = !!(m.releaseYear || m.year);
            const hasComposers = !!(m.composers && m.composers !== 'Desconocido' && m.composers !== '');
            const isEnriched = !!m.geminiEnriched;

            const isComplete = hasAlbum && hasYear;
            return {
                found: true,
                isComplete,
                isEnriched,
                album: m.album || m.originalAlbum || 'N/A',
                year: m.releaseYear || m.year || 'N/A',
                composers: m.composers || 'N/A',
                label: m.label || 'N/A',
                genre: m.genre || 'N/A'
            };
        }
    }

    return { found: false, isComplete: false, isEnriched: false };
}

async function runAudit() {
    console.log("=================================================================");
    console.log("🔍 AUDITORÍA DE ANÁLISIS SÓNICO Y CRÉDITOS EN TODA LA COLECCIÓN");
    console.log("=================================================================\n");

    let analysesDb = {};
    if (fs.existsSync(ANALYSES_DB_PATH)) {
        try { analysesDb = JSON.parse(fs.readFileSync(ANALYSES_DB_PATH, 'utf8')); } catch(e){}
    }

    let metadataCache = {};
    if (fs.existsSync(METADATA_CACHE_FILE)) {
        try { metadataCache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf8')); } catch(e){}
    }

    console.log(`📊 Base de datos de Análisis: ${Object.keys(analysesDb).length} registros cargados.`);
    console.log(`📊 Caché de Metadatos/Créditos: ${Object.keys(metadataCache).length} registros cargados.\n`);

    // Obtener playlists
    let playlists = null;
    try {
        const res = await fetch('http://localhost:8087/api/playlists', { signal: AbortSignal.timeout(5000) });
        if (res.ok) playlists = await res.json();
    } catch(e) {}

    if (!playlists) {
        console.error("❌ No se pudo conectar a /api/playlists de localhost:8087");
        process.exit(1);
    }

    const playlistNames = Object.keys(playlists);
    const seenSongs = new Map(); // trackKey -> songInfo

    const statsPerList = {};

    for (const name of playlistNames) {
        const tracks = playlists[name] || [];
        statsPerList[name] = {
            total: tracks.length,
            withAnalysis: 0,
            missingAnalysis: 0,
            withCredits: 0,
            missingCredits: 0,
            fullyComplete: 0
        };

        for (const tr of tracks) {
            const rawTitle = tr.rawTitle || tr.title || '';
            const artist = tr.artist || 'Desconocido';
            const cleanT = cleanTrackTitle(rawTitle);
            const globalKey = `${cleanTrackKey(artist)}_${cleanTrackKey(cleanT)}`;

            const analysisRes = hasValidAnalysis(artist, rawTitle, analysesDb);
            const creditsRes = hasValidCredits(artist, rawTitle, metadataCache);

            if (analysisRes.ok) statsPerList[name].withAnalysis++;
            else statsPerList[name].missingAnalysis++;

            if (creditsRes.isComplete) statsPerList[name].withCredits++;
            else statsPerList[name].missingCredits++;

            if (analysisRes.ok && creditsRes.isComplete) statsPerList[name].fullyComplete++;

            if (!seenSongs.has(globalKey)) {
                seenSongs.set(globalKey, {
                    artist,
                    title: cleanT,
                    rawTitle,
                    playlists: [name],
                    hasAnalysis: analysisRes.ok,
                    hasCredits: creditsRes.isComplete,
                    isEnriched: creditsRes.isEnriched,
                    creditsDetail: creditsRes
                });
            } else {
                const s = seenSongs.get(globalKey);
                if (!s.playlists.includes(name)) s.playlists.push(name);
            }
        }
    }

    // Totales globales únicos
    const uniqueSongs = Array.from(seenSongs.values());
    const totalUnique = uniqueSongs.length;
    const withAnalysisCount = uniqueSongs.filter(s => s.hasAnalysis).length;
    const missingAnalysisList = uniqueSongs.filter(s => !s.hasAnalysis);

    const withCreditsCount = uniqueSongs.filter(s => s.hasCredits).length;
    const missingCreditsList = uniqueSongs.filter(s => !s.hasCredits);

    const fullyCompleteCount = uniqueSongs.filter(s => s.hasAnalysis && s.hasCredits).length;
    const incompleteList = uniqueSongs.filter(s => !s.hasAnalysis || !s.hasCredits);

    console.log("-----------------------------------------------------------------");
    console.log("📈 RESUMEN POR PLAYLIST:");
    console.log("-----------------------------------------------------------------");
    console.log(String("Lista").padEnd(18) + String("Pistas").padStart(8) + String("Análisis").padStart(12) + String("Créditos").padStart(12) + String("Completas").padStart(12) + String("Estado").padStart(12));
    console.log("-".repeat(74));

    for (const [name, st] of Object.entries(statsPerList)) {
        const pct = Math.round((st.fullyComplete / (st.total || 1)) * 100);
        const status = pct === 100 ? "✅ 100%" : `${pct}%`;
        console.log(
            name.padEnd(18) +
            String(st.total).padStart(8) +
            `${st.withAnalysis}/${st.total}`.padStart(12) +
            `${st.withCredits}/${st.total}`.padStart(12) +
            `${st.fullyComplete}/${st.total}`.padStart(12) +
            status.padStart(12)
        );
    }

    console.log("\n-----------------------------------------------------------------");
    console.log("🌐 BALANCE GLOBAL DE LA COLECCIÓN (CANCIONES ÚNICAS):");
    console.log("-----------------------------------------------------------------");
    console.log(`Total canciones únicas en catálogo: ${totalUnique}`);
    console.log(`• Con Análisis Sónico OK:           ${withAnalysisCount} / ${totalUnique} (${((withAnalysisCount/totalUnique)*100).toFixed(1)}%)`);
    console.log(`• Con Créditos y Metadatos OK:      ${withCreditsCount} / ${totalUnique} (${((withCreditsCount/totalUnique)*100).toFixed(1)}%)`);
    console.log(`• 100% Completas (Análisis+Créditos): ${fullyCompleteCount} / ${totalUnique} (${((fullyCompleteCount/totalUnique)*100).toFixed(1)}%)`);

    if (missingAnalysisList.length > 0) {
        console.log(`\n⚠️ FALTAN ANÁLISIS SÓNICOS (${missingAnalysisList.length} canciones):`);
        missingAnalysisList.slice(0, 25).forEach((s, i) => {
            console.log(`  ${i+1}. [${s.playlists.join(', ')}] ${s.artist} - ${s.title}`);
        });
        if (missingAnalysisList.length > 25) {
            console.log(`  ... y ${missingAnalysisList.length - 25} canciones más.`);
        }
    } else {
        console.log("\n✅ ¡Todos los temas tienen su análisis sónico correspondiente!");
    }

    if (missingCreditsList.length > 0) {
        console.log(`\n⚠️ FALTAN CRÉDITOS O METADATOS COMPLETOS (${missingCreditsList.length} canciones):`);
        missingCreditsList.slice(0, 25).forEach((s, i) => {
            console.log(`  ${i+1}. [${s.playlists.join(', ')}] ${s.artist} - ${s.title} (Álbum: ${s.creditsDetail.album}, Año: ${s.creditsDetail.year})`);
        });
        if (missingCreditsList.length > 25) {
            console.log(`  ... y ${missingCreditsList.length - 25} canciones más.`);
        }
    } else {
        console.log("\n✅ ¡Todos los temas tienen sus créditos completos!");
    }

    console.log("=================================================================\n");
}

runAudit().catch(err => {
    console.error("Error en auditoría:", err);
});
