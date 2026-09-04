
const memoryStore = {};
const safeStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch(e) {
            return memoryStore[key] || null;
        }
    },
    setItem(key, val) {
        try {
            localStorage.setItem(key, val);
        } catch(e) {
            memoryStore[key] = val;
        }
    }
};

function normalizeText(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function checkMatch(track, query) {
    if (!query) return true;
    const normQuery = normalizeText(query);
    if (!normQuery) return true;

    const normArtist = normalizeText(track.artist);
    const normTitle = normalizeText(track.title);
    const normRawTitle = normalizeText(track.rawTitle);
    const normAlbum = normalizeText(track.album);

    return normArtist.includes(normQuery) || 
           normTitle.includes(normQuery) || 
           normRawTitle.includes(normQuery) || 
           normAlbum.includes(normQuery);
}

function formatBriefDate(releaseDate, releaseYear) {
    const months = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'];
    if (releaseDate && typeof releaseDate === 'string') {
        const cleanD = releaseDate.split('T')[0];
        const parts = cleanD.split('-');
        if (parts.length >= 2) {
            const year = parts[0];
            const monthNum = parseInt(parts[1], 10);
            if (monthNum >= 1 && monthNum <= 12) {
                return `${months[monthNum - 1]} ${year}`;
            }
        } else if (parts.length === 1 && parts[0].length === 4) {
            return parts[0];
        }
    }
    if (releaseYear && releaseYear !== '2000') return `${releaseYear}`;
    return releaseYear || '';
}

function switchModalTab(targetTabId) {
    document.querySelectorAll('.modal-nav-tab').forEach(b => {
        if (b.getAttribute('data-modal-tab') === targetTabId) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });
    document.querySelectorAll('.modal-tab-content').forEach(c => {
        if (c.id === targetTabId) {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

document.addEventListener('DOMContentLoaded', () => {
    let allPlaylists = {};
    let currentTab = 'Música viejuna';
    let searchQuery = '';
    let quickFilterQuery = '';
    let sortBy = 'title';
    let sortAsc = true;
    let viewMode = 'grid';
    let activeQuickPill = 'all';

    // Playback State Engine
    let playbackMode = 'idle'; // 'idle' | 'single' | 'playlist_shuffle' | 'party_dj'
    let activePlaylistQueue = [];
    let currentQueueIndex = 0;
    let currentPlayingSong = null;
    let currentModalSong = null;

    // Cinema state (declaradas explícitamente para evitar globales implícitas)
    let cinemaCurrentTrackList = [];
    let cinemaCurrentIndex = 0;
    let currentCinemaActiveLine = -1;
    let cinemaParsedLyrics = [];
    let isUserScrollingCinema = false;
    let userScrollTimer = null;

    // DOM Elements
    const songsGrid = document.getElementById('songs-grid');
    const searchInput = document.getElementById('search-input');
    const currentSectionTitle = document.getElementById('current-section-title');
    const resultsCountText = document.getElementById('results-count-text');
    const btnJellyfinSync = document.getElementById('btn-jellyfin-sync');
    const btnSmartDj = document.getElementById('btn-smart-dj');
    const btnOpenStats = document.getElementById('btn-open-stats');
    const btnPlaylistShuffle = document.getElementById('btn-playlist-shuffle');
    const quickPillsBar = document.getElementById('quick-pills-bar');

    const sortSelect = document.getElementById('sort-select');
    const btnSortDir = document.getElementById('btn-sort-dir');
    const sortDirIcon = document.getElementById('sort-dir-icon');
    const btnViewGrid = document.getElementById('btn-view-grid');
    const btnViewList = document.getElementById('btn-view-list');
    const quickFilterInput = document.getElementById('quick-filter-input');

    // Modals
    const songModal = document.getElementById('song-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnModalCinema = document.getElementById('btn-modal-cinema');
    const statsModal = document.getElementById('stats-modal');
    const btnCloseStats = document.getElementById('btn-close-stats');
    const statsContent = document.getElementById('stats-content');

    // Floating Music Player Bar
    const mainMusicAudio = document.getElementById('main-music-audio');
    const musicPlayerBar = document.getElementById('music-player-bar');
    const musicBarCover = document.getElementById('music-bar-cover');
    const musicBarTitle = document.getElementById('music-bar-title');
    const musicBarArtist = document.getElementById('music-bar-artist');
    const musicBarMode = document.getElementById('music-bar-mode');
    const musicBtnPlay = document.getElementById('music-btn-play');
    const musicBtnPrev = document.getElementById('music-btn-prev');
    const musicBtnNext = document.getElementById('music-btn-next');
    const musicTimeCurr = document.getElementById('music-time-curr');
    const musicTimeDur = document.getElementById('music-time-dur');
    const musicSeekSlider = document.getElementById('music-seek-slider');
    const musicVolSlider = document.getElementById('music-vol-slider');
    const musicBtnMute = document.getElementById('music-btn-mute');
    const musicBtnClose = document.getElementById('music-btn-close');
    const musicBtnCinema = document.getElementById('music-btn-cinema');
    const musicBtnNormalize = document.getElementById('music-btn-normalize');

    // Cinema Mode Elements
    const cinemaOverlay = document.getElementById('cinema-overlay');
    const btnCloseCinema = document.getElementById('btn-close-cinema');
    const cinemaBg = document.getElementById('cinema-bg');
    const cinemaCover = document.getElementById('cinema-cover');
    const cinemaTitle = document.getElementById('cinema-title');
    const cinemaArtist = document.getElementById('cinema-artist');
    const cinemaAlbum = document.getElementById('cinema-album');
    const cinemaTimeCurr = document.getElementById('cinema-time-curr');
    const cinemaTimeDur = document.getElementById('cinema-time-dur');
    const cinemaSeekSlider = document.getElementById('cinema-seek-slider');
    const cinemaLyrics = document.getElementById('cinema-lyrics');
    const cinemaPlay = document.getElementById('cinema-play');
    const cinemaPrev = document.getElementById('cinema-prev');
    const cinemaNext = document.getElementById('cinema-next');

    // Cinema: Modo Vinilo únicamente (sin reproductor de vídeo Jellyfin)
    const cinemaVinylWrap = document.getElementById('cinema-vinyl-wrap');


    // Radio Elements & Engine
    const liveRadioAudio = document.getElementById('live-radio-audio');
    const radioPlayerBar = document.getElementById('radio-player-bar');
    const radioBarName = document.getElementById('radio-bar-name');
    const radioBarDial = document.getElementById('radio-bar-dial');
    const radioBarLogo = document.getElementById('radio-bar-logo');
    const radioBtnPlay = document.getElementById('radio-btn-play');
    const radioWaves = document.getElementById('radio-waves');
    const radioBtnMute = document.getElementById('radio-btn-mute');
    const radioVolumeSlider = document.getElementById('radio-volume-slider');
    const radioBtnClose = document.getElementById('radio-btn-close');
    let currentPlayingRadio = null;
    let nowPlayingPollInterval = null;

    const radioStations = [
        {
            id: 'hitfm',
            name: 'HIT FM',
            slogan: 'Nº 1 en Hits Internacionales',
            genre: 'Pop / Dance / Hits',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/hitfm.svg',
            webUrl: 'https://www.hitfm.es/',
            streamUrl: 'https://hitfm.kissfmradio.cires21.com/hitfm.mp3'
        },
        {
            id: 'locafm',
            name: 'LOCA FM',
            slogan: 'La Radio de la Música Electrónica',
            genre: 'Dance / House / EDM',
            quality: '160 kbps HD',
            logoUrl: 'img/radios/locafm.svg',
            webUrl: 'https://locafm.com/',
            streamUrl: 'http://s3.we4stream.com:8045/live'
        },
        {
            id: 'los40',
            name: 'LOS40',
            slogan: 'Todos Los Éxitos',
            genre: 'Pop / Radiofórmula',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/los40.svg',
            webUrl: 'https://los40.com/',
            streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40.mp3'
        },
        {
            id: 'kissfm',
            name: 'KISS FM',
            slogan: 'Lo Mejor de los 80 y 90 hasta Hoy',
            genre: 'Hits 80s / 90s / 2000s',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/kissfm.svg',
            webUrl: 'https://www.kissfm.es/',
            streamUrl: 'https://kissfm.kissfmradio.cires21.com/kissfm.mp3'
        },
        {
            id: 'los40dance',
            name: 'LOS40 DANCE',
            slogan: 'La Radio del Dance y Clubbing',
            genre: 'EDM / Dance / Club',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/los40dance.svg',
            webUrl: 'https://los40.com/los40_dance/',
            streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_DANCE.mp3'
        },
        {
            id: 'cadena100',
            name: 'CADENA 100',
            slogan: 'La Mejor Variedad Musical',
            genre: 'Pop / Rock / Adult',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/cadena100.svg',
            webUrl: 'https://www.cadena100.es/',
            streamUrl: 'http://cadena100-streamers-mp3.flumotion.com/cope/cadena100.mp3'
        },
        {
            id: 'rockfm',
            name: 'ROCK FM',
            slogan: '50 Minutos de Rock Sin Pausa',
            genre: 'Classic Rock / Hard Rock',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/rockfm.svg',
            webUrl: 'https://www.rockfm.fm/',
            streamUrl: 'http://flucast10-o-cloud.flumotion.com/cope/rockfm-low.mp3'
        },
        {
            id: 'los40classic',
            name: 'LOS40 CLASSIC',
            slogan: 'Los Números 1 de Tu Vida',
            genre: 'Clásicos 70s / 80s / 90s',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/los40classic.svg',
            webUrl: 'https://los40.com/los40_classic/',
            streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_CLASSIC.mp3'
        },
        {
            id: 'ibizaglobal',
            name: 'IBIZA GLOBAL RADIO',
            slogan: 'From Ibiza to the World',
            genre: 'Deep House / Chillout',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/ibizaglobal.svg',
            webUrl: 'https://ibizaglobalradio.com/',
            streamUrl: 'http://ibizaglobalradio.streaming-pro.com:8024/'
        },
        {
            id: 'europafm',
            name: 'EUROPA FM',
            slogan: 'Los Éxitos de Hoy y el Mejor Pop',
            genre: 'Pop / Rock / Éxitos',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/europafm.svg',
            webUrl: 'https://www.europafm.com/',
            streamUrl: 'https://liveradio.ondacero.es/live/europafm.mp3'
        },
        {
            id: 'flaixfm',
            name: 'FLAIX FM',
            slogan: 'El Ritme que No Para',
            genre: 'Dance / Electronic / Hits',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/flaixfm.svg',
            webUrl: 'https://flaixfm.cat/',
            streamUrl: 'https://stream.flaixfm.cat/icecast'
        },
        {
            id: 'megastar',
            name: 'MEGASTAR FM',
            slogan: 'Solo Temazos',
            genre: 'Urban / Reggaeton / Pop',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/megastar.svg',
            webUrl: 'https://www.megastar.fm/',
            streamUrl: 'http://flucast35-h-cloud.flumotion.com/cope/megastar.mp3'
        },
        {
            id: 'cadenadial',
            name: 'CADENA DIAL',
            slogan: 'Lo Mejor de Nuestra Música',
            genre: 'Pop en Español',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/cadenadial.svg',
            webUrl: 'https://cadenadial.com/',
            streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CADENADIAL.mp3'
        },
        {
            id: 'los40urban',
            name: 'LOS40 URBAN',
            slogan: 'El Ritmo de la Calle',
            genre: 'Reggaeton / Trap / Latino',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/los40urban.svg',
            webUrl: 'https://los40.com/los40_urban/',
            streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_URBAN.mp3'
        },
        {
            id: 'radiole',
            name: 'RADIOLÉ',
            slogan: 'La Alegría de la Música Española',
            genre: 'Flamenco / Copla / Pop',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/radiole.svg',
            webUrl: 'https://cadenaser.com/radiole/',
            streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOLE.mp3'
        },
        {
            id: 'flaixbac',
            name: 'FLAIXBAC',
            slogan: 'Els Èxits del Moment',
            genre: 'Pop / Dance / Català',
            quality: '128 kbps HD',
            logoUrl: 'img/radios/flaixbac.svg',
            webUrl: 'https://flaixbac.cat/',
            streamUrl: 'https://stream.flaixbac.cat/icecast'
        }
    ];

    const playlistIcons = {
        'Música viejuna': 'fa-radio',
        'Siglo XXI': 'fa-rocket',
        'Dance': 'fa-headphones',
        'Española': 'fa-guitar',
        'Música latina': 'fa-fire',
        'Radio': 'fa-tower-broadcast',
        'Éxitos España': 'fa-trophy'
    };

    // Load initial data
    fetchPlaylists();
    renderQuickPills();

    function fetchPlaylists() {
        fetch('/api/playlists')
            .then(res => res.json())
            .then(data => {
                allPlaylists = data;
                updateTabBadges();
                renderSongs();
            })
            .catch(err => {
                console.error('Error cargando playlists:', err);
                resultsCountText.textContent = 'Error conectando con el servidor';
            });
    }

    function updateTabBadges() {
        const badgeMap = {
            'Música viejuna': 'badge-viejuna',
            'Siglo XXI': 'badge-siglo',
            'Dance': 'badge-dance',
            'Española': 'badge-espanola',
            'Música latina': 'badge-latina'
        };

        for (const [key, badgeId] of Object.entries(badgeMap)) {
            const el = document.getElementById(badgeId);
            if (el && allPlaylists[key]) {
                el.textContent = allPlaylists[key].length;
            }
        }

        const rBadge = document.getElementById('badge-radio');
        if (rBadge) rBadge.textContent = radioStations.length;

        // Badge de Éxitos España
        fetch('/api/retro-hits/catalog')
            .then(res => res.json())
            .then(d => {
                const bRetro = document.getElementById('badge-retro');
                if (bRetro && d.summary) {
                    bRetro.textContent = d.summary.totalMissing;
                    bRetro.title = `${d.summary.totalMissing} canciones faltantes de ${d.summary.totalHits} éxitos en España`;
                }
            }).catch(() => {});
    }

    function selectPlaylistTab(tabName) {
        currentTab = tabName;
        document.querySelectorAll('.tab-button').forEach(b => {
            if (b.getAttribute('data-tab') === tabName) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    }

    function getSortKey(str) {
        if (!str) return '';
        return str.replace(/^[(\[\s.'"…-]+/, '').toLowerCase();
    }

    function sortTracks(tracks) {
        const sorted = [...tracks];
        sorted.sort((a, b) => {
            let valA, valB;
            if (sortBy === 'title') {
                valA = getSortKey(a.title);
                valB = getSortKey(b.title);
            } else if (sortBy === 'artist') {
                valA = (a.artist || '').toLowerCase();
                valB = (b.artist || '').toLowerCase();
            } else if (sortBy === 'releaseDate') {
                valA = a.releaseDate || '0000-00-00';
                valB = b.releaseDate || '0000-00-00';
            } else if (sortBy === 'duration') {
                valA = a.durationMs || 0;
                valB = b.durationMs || 0;
            }

            if (valA < valB) return sortAsc ? -1 : 1;
            if (valA > valB) return sortAsc ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    function renderQuickPills() {
        if (!quickPillsBar) return;
        quickPillsBar.innerHTML = '';

        if (currentTab === 'Radio') {
            const radioPills = [
                { id: 'all', label: 'Todas las emisoras', icon: 'fa-layer-group' },
                { id: 'pop', label: 'Pop & Top Hits', icon: 'fa-fire' },
                { id: 'dance', label: 'Dance & Electrónica', icon: 'fa-headphones' },
                { id: 'rock', label: 'Rock', icon: 'fa-guitar' },
                { id: 'spanish', label: 'Música en Español', icon: 'fa-earth-europe' }
            ];

            radioPills.forEach(p => {
                const btn = document.createElement('button');
                btn.className = activeQuickPill === p.id ? 'pill-btn active' : 'pill-btn';
                btn.innerHTML = `<i class="fa-solid ${p.icon}"></i> ${p.label}`;
                btn.addEventListener('click', () => {
                    activeQuickPill = p.id;
                    renderQuickPills();
                    renderRadioStations();
                });
                quickPillsBar.appendChild(btn);
            });
            return;
        }

        // Playlist Pills (Decades & Features)
        const playlistPills = [
            { id: 'all', label: 'Todas', icon: 'fa-layer-group' },
            { id: '60s-70s', label: '60s & 70s' },
            { id: '80s', label: '80s' },
            { id: '90s', label: '90s' },
            { id: '2000s', label: '2000s' },
            { id: '2010s', label: '2010s+' }
        ];

        playlistPills.forEach(p => {
            const btn = document.createElement('button');
            btn.className = activeQuickPill === p.id ? 'pill-btn active' : 'pill-btn';
            btn.innerHTML = p.icon ? `<i class="fa-solid ${p.icon}"></i> ${p.label}` : p.label;
            btn.addEventListener('click', () => {
                activeQuickPill = p.id;
                renderQuickPills();
                renderSongs();
            });
            quickPillsBar.appendChild(btn);
        });

        const divider = document.createElement('div');
        divider.className = 'pill-divider';
        quickPillsBar.appendChild(divider);

        const featurePills = [
            { id: 'analysis', label: 'Con Análisis', icon: 'fa-microscope' },
            { id: 'lyrics', label: 'Con Letra', icon: 'fa-microphone' }
        ];

        featurePills.forEach(p => {
            const btn = document.createElement('button');
            btn.className = activeQuickPill === p.id ? 'pill-btn pill-feature active' : 'pill-btn pill-feature';
            btn.innerHTML = `<i class="fa-solid ${p.icon}"></i> ${p.label}`;
            btn.addEventListener('click', () => {
                activeQuickPill = p.id;
                renderQuickPills();
                renderSongs();
            });
            quickPillsBar.appendChild(btn);
        });
    }

    function matchQuickPill(track) {
        if (activeQuickPill === 'all') return true;
        if (activeQuickPill === 'analysis') return track.hasAnalysis === true;
        if (activeQuickPill === 'lyrics') return track.hasLyrics === true;

        let yr = null;
        if (track.releaseYear) yr = parseInt(track.releaseYear, 10);
        else if (track.releaseDate) {
            const p = track.releaseDate.split('-');
            yr = parseInt(p[0], 10);
        }

        if (!yr || isNaN(yr)) return false;

        if (activeQuickPill === '60s-70s') return yr >= 1950 && yr < 1980;
        if (activeQuickPill === '80s') return yr >= 1980 && yr < 1990;
        if (activeQuickPill === '90s') return yr >= 1990 && yr < 2000;
        if (activeQuickPill === '2000s') return yr >= 2000 && yr < 2010;
        if (activeQuickPill === '2010s') return yr >= 2010;

        return true;
    }

    // ==========================================================================
    // 📻 Live Radio Engine
    // ==========================================================================
    async function updateLiveRadioMetadata() {
        if (!currentPlayingRadio || !liveRadioAudio || liveRadioAudio.paused) return;
        try {
            const res = await fetch(`/api/radio/now-playing?id=${encodeURIComponent(currentPlayingRadio.id)}&streamUrl=${encodeURIComponent(currentPlayingRadio.streamUrl)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.nowPlaying && radioBarDial) {
                    radioBarDial.innerHTML = `<i class="fa-solid fa-music" style="color:var(--spotify-green);"></i> ${data.nowPlaying}`;
                }
            }
        } catch(e) {}
    }

    function playRadioStation(station) {
        if (!liveRadioAudio) return;
        
        // Stop music player if playing
        if (mainMusicAudio && !mainMusicAudio.paused) {
            mainMusicAudio.pause();
            if (musicPlayerBar) musicPlayerBar.style.display = 'none';
        }

        if (currentPlayingRadio && currentPlayingRadio.id === station.id && !liveRadioAudio.paused) {
            liveRadioAudio.pause();
            updateRadioBarState(false);
            renderRadioStations();
            return;
        }

        currentPlayingRadio = station;
        liveRadioAudio.src = station.streamUrl;
        liveRadioAudio.volume = radioVolumeSlider ? parseFloat(radioVolumeSlider.value) : 0.85;
        liveRadioAudio.play().then(() => {
            updateRadioBarState(true);
        }).catch(err => {
            console.error('Error reproduciendo streaming de radio:', err);
            updateRadioBarState(false);
        });

        if (radioPlayerBar) radioPlayerBar.style.display = 'block';
        if (radioBarName) radioBarName.textContent = station.name;
        if (radioBarDial) radioBarDial.textContent = station.slogan;
        if (radioBarLogo) radioBarLogo.innerHTML = `<img src="${station.logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;

        if (nowPlayingPollInterval) clearInterval(nowPlayingPollInterval);
        nowPlayingPollInterval = setInterval(updateLiveRadioMetadata, 15000);
        updateLiveRadioMetadata();
        renderRadioStations();
    }

    function updateRadioBarState(isPlaying) {
        if (radioBtnPlay) {
            radioBtnPlay.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        }
        if (radioWaves) {
            if (isPlaying) radioWaves.classList.add('playing');
            else radioWaves.classList.remove('playing');
        }
    }

    if (radioBtnPlay) {
        radioBtnPlay.addEventListener('click', () => {
            if (!liveRadioAudio) return;
            if (liveRadioAudio.paused) {
                liveRadioAudio.play();
                updateRadioBarState(true);
            } else {
                liveRadioAudio.pause();
                updateRadioBarState(false);
            }
            renderRadioStations();
        });
    }

    if (radioVolumeSlider && liveRadioAudio) {
        radioVolumeSlider.addEventListener('input', (e) => {
            liveRadioAudio.volume = parseFloat(e.target.value);
            if (radioBtnMute) {
                radioBtnMute.innerHTML = liveRadioAudio.volume === 0 ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
            }
        });
    }

    if (radioBtnMute && liveRadioAudio) {
        radioBtnMute.addEventListener('click', () => {
            liveRadioAudio.muted = !liveRadioAudio.muted;
            radioBtnMute.innerHTML = liveRadioAudio.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
        });
    }

    if (radioBtnClose && liveRadioAudio && radioPlayerBar) {
        radioBtnClose.addEventListener('click', () => {
            liveRadioAudio.pause();
            liveRadioAudio.src = '';
            currentPlayingRadio = null;
            if (nowPlayingPollInterval) clearInterval(nowPlayingPollInterval);
            radioPlayerBar.style.display = 'none';
            renderRadioStations();
        });
    }



    function renderRadioStations() {
        currentSectionTitle.innerHTML = `<i class="fa-solid fa-tower-broadcast" style="color: var(--spotify-green);"></i> Radio en Directo - Emisoras de España`;
        
        let filtered = radioStations;
        if (activeQuickPill !== 'all') {
            if (activeQuickPill === 'pop') filtered = filtered.filter(st => st.genre.toLowerCase().includes('pop') || st.genre.toLowerCase().includes('hits'));
            else if (activeQuickPill === 'dance') filtered = filtered.filter(st => st.genre.toLowerCase().includes('dance') || st.genre.toLowerCase().includes('edm') || st.genre.toLowerCase().includes('house') || st.genre.toLowerCase().includes('club'));
            else if (activeQuickPill === 'rock') filtered = filtered.filter(st => st.genre.toLowerCase().includes('rock'));
            else if (activeQuickPill === 'spanish') filtered = filtered.filter(st => st.genre.toLowerCase().includes('español') || st.genre.toLowerCase().includes('flamenco') || st.genre.toLowerCase().includes('català'));
        }
        const q = (quickFilterQuery || searchQuery || '').trim().toLowerCase();
        if (q) {
            filtered = filtered.filter(st => 
                st.name.toLowerCase().includes(q) || 
                st.genre.toLowerCase().includes(q) || 
                st.slogan.toLowerCase().includes(q)
            );
        }

        resultsCountText.textContent = `${filtered.length} emisoras en directo`;
        songsGrid.className = viewMode === 'list' ? 'songs-grid view-list-mode' : 'songs-grid';
        songsGrid.innerHTML = '';

        if (filtered.length === 0) {
            songsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-tower-broadcast" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p>No se encontraron emisoras de radio que coincidan con la búsqueda.</p>
                </div>
            `;
            return;
        }

        filtered.forEach(st => {
            const isPlaying = currentPlayingRadio && currentPlayingRadio.id === st.id && liveRadioAudio && !liveRadioAudio.paused;
            const card = document.createElement('div');
            card.className = isPlaying ? 'radio-card playing' : 'radio-card';

            card.innerHTML = `
                <div class="radio-card-cover">
                    <div class="live-badge-overlay">
                        <span class="live-dot"></span> EN VIVO
                    </div>
                    <img src="${st.logoUrl}" alt="${st.name}" class="radio-card-logo-img" onerror="this.src='img/radios/hitfm.svg';">
                    <div class="play-overlay">
                        <div class="play-button-icon" style="background: ${isPlaying ? '#ef4444' : 'var(--spotify-green)'}; color: #fff;">
                            <i class="fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                        </div>
                    </div>
                </div>
                <div class="song-info">
                    <div class="radio-station-title">${st.name}</div>
                    <div class="radio-station-slogan" title="${st.slogan}">${st.slogan}</div>
                    <div class="radio-meta-pills">
                        <span class="badge-pill badge-duration">
                            <i class="fa-solid fa-music"></i> ${st.genre}
                        </span>
                        <span class="badge-pill badge-date">
                            <i class="fa-solid fa-tower-cell"></i> ${st.quality}
                        </span>
                    </div>
                    <div class="radio-card-footer">
                        <button class="btn-radio-listen" title="${isPlaying ? 'Pausar Emisora' : 'Escuchar en Directo'}">
                            <i class="fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}"></i> ${isPlaying ? 'Pausar' : 'Escuchar'}
                        </button>
                        <a href="${st.webUrl}" target="_blank" rel="noopener noreferrer" class="btn-radio-web" title="Visitar web oficial de ${st.name}">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Web
                        </a>
                    </div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-radio-web')) return;
                playRadioStation(st);
            });

            songsGrid.appendChild(card);
        });
    }

    // ==========================================================================
    // 🎵 Smart Music Playback Engine & Queue Management
    // ==========================================================================
    function playQueueTrack(track, modeLabel = null) {
        if (!track || !mainMusicAudio) return;
        
        // Registrar canción como escuchada en su lista y en el historial persistente
        if (playbackMode === 'playlist_shuffle' && track.playlistName) {
            markTrackAsPlayed(track.playlistName, track);
        } else if (playbackMode === 'party_dj') {
            markTrackAsPlayed('global_party', track);
            if (track.playlistName) markTrackAsPlayed(track.playlistName, track);
        }
        
        // Stop radio if playing
        if (liveRadioAudio && !liveRadioAudio.paused) {
            liveRadioAudio.pause();
            if (radioPlayerBar) radioPlayerBar.style.display = 'none';
        }

        currentPlayingSong = track;

        const playableUrl = track.audioUrl || (track.videoItem ? track.videoItem.streamUrl : null) || track.videoPath;
        if (playableUrl) {
            if (mainMusicAudio.src !== playableUrl) {
                mainMusicAudio.src = playableUrl;
            }
            mainMusicAudio.volume = musicVolSlider ? parseFloat(musicVolSlider.value) : 0.85;
            mainMusicAudio.play().then(() => {
                updateMusicBarState(true);
            }).catch(err => {
                console.log('Autoplay audio blocked or error:', err.message);
                updateMusicBarState(false);
            });
        } else {
            console.log('Track has no audio file in library:', track.title);
            updateMusicBarState(false);
        }

        // Update Floating Player Bar
        if (musicPlayerBar) musicPlayerBar.style.display = 'block';
        if (musicBarCover) musicBarCover.src = track.coverUrl || 'img/radios/hitfm.svg';
        if (musicBarTitle) musicBarTitle.textContent = track.title;
        if (musicBarArtist) musicBarArtist.textContent = track.artist;
        if (musicBarMode) {
            if (modeLabel) {
                musicBarMode.innerHTML = `<i class="fa-solid fa-shuffle"></i> ${modeLabel}`;
            } else if (playbackMode === 'playlist_shuffle') {
                musicBarMode.innerHTML = `<i class="fa-solid fa-shuffle"></i> ${currentTab}`;
            } else if (playbackMode === 'party_dj') {
                musicBarMode.innerHTML = `<i class="fa-solid fa-fire"></i> Modo Fiesta`;
            } else {
                musicBarMode.innerHTML = `<i class="fa-solid fa-play"></i> Canción`;
            }
        }

        // Update Cinema Overlay if open
        if (cinemaOverlay && cinemaOverlay.style.display === 'flex') {
            renderCinemaTrack(track);
        }

        renderSongs();
    }

    function updateMusicBarState(isPlaying) {
        if (musicBtnPlay) {
            musicBtnPlay.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        }
        if (cinemaPlay) {
            cinemaPlay.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        }


    }

    function handleCardPlayClick(song) {
        if (!song) return;

        // If this song is currently playing, toggle pause/play
        if (currentPlayingSong && currentPlayingSong.title === song.title && currentPlayingSong.artist === song.artist) {
            if (mainMusicAudio.paused) {
                if (!audioCtx) initAudioNormalizationGraph();
                else if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
                mainMusicAudio.play();
                updateMusicBarState(true);
            } else {
                mainMusicAudio.pause();
                updateMusicBarState(false);
            }
            renderSongs();
            return;
        }

        // Check if an active playlist queue is currently running
        if (playbackMode === 'playlist_shuffle' || playbackMode === 'party_dj') {
            // Insert this song to play next immediately and then continue with the rest of the queue
            activePlaylistQueue.splice(currentQueueIndex + 1, 0, song);
            currentQueueIndex++;
            playQueueTrack(activePlaylistQueue[currentQueueIndex]);
        } else {
            // Single song mode
            playbackMode = 'single';
            activePlaylistQueue = [song];
            currentQueueIndex = 0;
            playQueueTrack(song);
        }
    }

    
    
    // ==========================================================================
    // 🛡️ Almacenamiento Seguro (Safe Storage con Fallback en Memoria para Edge/Chrome)
    // ==========================================================================
// ==========================================================================
    // 🔁 Sistema de Reproducción Aleatoria Sin Repeticiones (Persistente)
    // ==========================================================================
    function getTrackUniqueId(track) {
        if (!track) return '';
        return `${normalizeText(track.artist)}__${normalizeText(track.title)}`;
    }

    function getUnplayedPool(playlistName, allTracks) {
        const poolKey = 'played_pool_' + normalizeText(playlistName);
        let playedIds = [];
        try {
            const raw = safeStorage.getItem(poolKey);
            playedIds = raw ? JSON.parse(raw) : [];
        } catch(e) {
            playedIds = [];
        }

        let unplayed = allTracks.filter(t => !playedIds.includes(getTrackUniqueId(t)));

        // Si ya han sonado todas las canciones de la lista, reiniciamos el ciclo limpio
        if (unplayed.length === 0 && allTracks.length > 0) {
            playedIds = [];
            try { safeStorage.setItem(poolKey, JSON.stringify([])); } catch(e){}
            unplayed = [...allTracks];
            if (typeof showSyncNotification === 'function') {
                showSyncNotification(`🎉 ¡Has escuchado todas las canciones de ${playlistName}! Reiniciando ciclo.`);
            }
        }

        return { unplayed, playedCount: playedIds.length, total: allTracks.length };
    }

    function markTrackAsPlayed(playlistName, track) {
        if (!playlistName || !track) return;
        const poolKey = 'played_pool_' + normalizeText(playlistName);
        let playedIds = [];
        try {
            const raw = safeStorage.getItem(poolKey);
            playedIds = raw ? JSON.parse(raw) : [];
        } catch(e) {
            playedIds = [];
        }
        const tid = getTrackUniqueId(track);
        if (!playedIds.includes(tid)) {
            playedIds.push(tid);
            try { safeStorage.setItem(poolKey, JSON.stringify(playedIds)); } catch(e){}
        }
    }

    function startPlaylistShuffle(playlistName) {
        const tracks = allPlaylists[playlistName] || allPlaylists[currentTab] || [];
        if (tracks.length === 0) return;

        // Obtener canciones que NO han sonado aún en ninguna sesión
        const { unplayed, playedCount, total } = getUnplayedPool(playlistName, tracks);
        
        // Barajar únicamente las pendientes
        const shuffled = [...unplayed].sort(() => Math.random() - 0.5);
        playbackMode = 'playlist_shuffle';
        activePlaylistQueue = shuffled;
        currentQueueIndex = 0;

        playQueueTrack(activePlaylistQueue[0], `${playlistName} (${playedCount + 1}/${total})`);
    }

    if (btnPlaylistShuffle) {
        btnPlaylistShuffle.addEventListener('click', () => {
            if (currentTab === 'Radio') return;
            startPlaylistShuffle(currentTab);
        });
    }

    if (btnSmartDj) {
        btnSmartDj.addEventListener('click', () => {
            let allTracks = [];
            for (const [pName, tracks] of Object.entries(allPlaylists)) {
                tracks.forEach(t => allTracks.push({ ...t, playlistName: pName }));
            }
            if (allTracks.length === 0) return;

            const { unplayed, playedCount, total } = getUnplayedPool('global_party', allTracks);
            const shuffled = [...unplayed].sort(() => Math.random() - 0.5);
            playbackMode = 'party_dj';
            activePlaylistQueue = shuffled;
            currentQueueIndex = 0;

            playQueueTrack(activePlaylistQueue[0], `Modo Fiesta (${playedCount + 1}/${total})`);
        });
    }

    
    // ==========================================================================
    // 🎛️ Motor de Sincronización Fina & Anclaje de Frase (Jellyfin Style)
    // ==========================================================================
    let lyricsSyncOffset = 0.0;
    let isPinModeActive = false;

    const cinemaSyncSlider = document.getElementById('cinema-sync-slider');
    const cinemaSyncValue = document.getElementById('cinema-sync-value');
    const btnSyncSave = document.getElementById('btn-sync-save');
    const btnCinemaReplaceClean = document.getElementById('btn-cinema-replace-clean');
    const btnSyncMinus = document.getElementById('btn-sync-minus');
    const btnSyncPlus = document.getElementById('btn-sync-plus');
    
    function showSyncNotification(msg) {
        const existing = document.querySelector('.cinema-toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'cinema-toast-notification';
        toast.innerHTML = `<i class="fa-solid fa-sparkles" style="color:var(--spotify-green);"></i> ${msg}`;
        
        const overlay = document.getElementById('cinema-overlay');
        if (overlay && overlay.style.display === 'flex') {
            overlay.appendChild(toast);
            setTimeout(() => { toast.remove(); }, 3500);
        }
    }

    function updateLyricsSyncOffset(val) {
        lyricsSyncOffset = parseFloat(val);
        if (isNaN(lyricsSyncOffset)) lyricsSyncOffset = 0.0;
        
        if (cinemaSyncSlider) cinemaSyncSlider.value = lyricsSyncOffset.toFixed(1);
        if (cinemaSyncValue) {
            const prefix = lyricsSyncOffset > 0 ? '+' : '';
            cinemaSyncValue.textContent = `${prefix}${lyricsSyncOffset.toFixed(1)}s`;
        }

        // Guardar desfase permanente para esta canción usando safeStorage
        if (currentPlayingSong) {
            const key = `offset_${normalizeText(currentPlayingSong.artist)}_${normalizeText(currentPlayingSong.title)}`;
            safeStorage.setItem(key, lyricsSyncOffset.toFixed(1));
        }

        // Recalcular inmediatamente la línea activa
        currentCinemaActiveLine = -1;
    }

    if (cinemaSyncSlider) {
        cinemaSyncSlider.addEventListener('input', (e) => {
            updateLyricsSyncOffset(e.target.value);
        });
    }

    if (btnSyncMinus) {
        btnSyncMinus.addEventListener('click', () => {
            updateLyricsSyncOffset((lyricsSyncOffset - 0.1).toFixed(1));
        });
    }

    if (btnSyncPlus) {
        btnSyncPlus.addEventListener('click', () => {
            updateLyricsSyncOffset((lyricsSyncOffset + 0.1).toFixed(1));
        });
    }

    if (cinemaSyncValue) {
        cinemaSyncValue.addEventListener('click', () => {
            updateLyricsSyncOffset(0.0);
            showSyncNotification('Sincronía restablecida a 0.0s');
        });
    }

    
    // Función reutilizable para renderizar las líneas del karaoke
    function renderCinemaLyricLines() {
        if (!cinemaLyrics || !cinemaParsedLyrics || cinemaParsedLyrics.length === 0) return;
        cinemaLyrics.innerHTML = cinemaParsedLyrics.map(l => {
            const hasTrans = l.translation && typeof l.translation === 'string' && l.translation.trim().length > 0;
            const isSame = hasTrans ? (normalizeText(l.translation) === normalizeText(l.text)) : true;
            const showTrans = hasTrans && !isSame;
            return `
                <div class="cinema-lyric-line" id="cinema-lyric-${l.index}" data-sec="${l.seconds !== null ? l.seconds : ''}" data-index="${l.index}" title="Pulsar para activar y sincronizar karaoke desde esta frase">
                    <div class="cinema-lyric-orig">${l.text}</div>
                    ${showTrans ? `<div class="cinema-lyric-trans">${l.translation}</div>` : ''}
                </div>
            `;
        }).join('');

        // Enlazar clicks en frases: Si no tiene marcas, las genera en tiempo real; si ya tiene, ajusta el desfase
        document.querySelectorAll('.cinema-lyric-line').forEach(lineEl => {
            lineEl.addEventListener('click', () => {
                if (!mainMusicAudio) return;
                const clickedIdx = parseInt(lineEl.getAttribute('data-index'), 10);
                const currAudioSec = mainMusicAudio.currentTime || 0;
                
                const hasExistingTimestamps = cinemaParsedLyrics.some(l => typeof l.seconds === 'number' && l.seconds > 0);

                if (!hasExistingTimestamps) {
                    // --- AUTO-GENERACIÓN Y ANCLAJE DESDE LA ESTROFA PULSADA ---
                    const totalLines = cinemaParsedLyrics.length;
                    const dur = mainMusicAudio.duration || (totalLines * 4.0);
                    const avgStep = 3.6;

                    cinemaParsedLyrics = cinemaParsedLyrics.map((l, idx) => {
                        let lineSec = 0;
                        if (idx === clickedIdx) {
                            lineSec = currAudioSec;
                        } else if (idx < clickedIdx) {
                            const diff = clickedIdx - idx;
                            lineSec = Math.max(0, parseFloat((currAudioSec - (diff * avgStep)).toFixed(2)));
                        } else {
                            const diff = idx - clickedIdx;
                            const remainingSecs = Math.max(10, dur - currAudioSec);
                            const step = remainingSecs / Math.max(1, totalLines - clickedIdx);
                            lineSec = parseFloat((currAudioSec + (diff * Math.min(avgStep, step))).toFixed(2));
                        }
                        const mins = Math.floor(lineSec / 60);
                        const secs = Math.floor(lineSec % 60);
                        return {
                            ...l,
                            seconds: lineSec,
                            time: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
                            hasTimestamp: true
                        };
                    });

                    lyricsSyncOffset = 0.0;
                    if (cinemaSyncSlider) cinemaSyncSlider.value = 0.0;
                    if (cinemaSyncValue) cinemaSyncValue.textContent = '0.0s';
                    isUserScrollingCinema = false;
                    clearTimeout(userScrollTimer);

                    renderCinemaLyricLines();
                    showSyncNotification(`🎙️ ¡Karaoke activado desde esta estrofa! Pulsa 💾 para guardarlo permanentemente.`);
                } else {
                    // --- SINCRONIZACIÓN FINA CON MARCAS EXISTENTES ---
                    const sec = parseFloat(lineEl.getAttribute('data-sec'));
                    if (!isNaN(sec)) {
                        const newOffset = (sec - currAudioSec);
                        updateLyricsSyncOffset(newOffset.toFixed(1));
                        isUserScrollingCinema = false;
                        clearTimeout(userScrollTimer);
                        showSyncNotification(`📍 Subtítulos sincronizados (${newOffset >= 0 ? '+' : ''}${newOffset.toFixed(1)}s). Pulsa 💾 para grabar.`);
                    }
                }
            });
        });
    }

    
    if (btnCinemaReplaceClean) {
        btnCinemaReplaceClean.addEventListener('click', async () => {
            const currentSong = currentPlayingSong || (cinemaCurrentTrackList ? cinemaCurrentTrackList[cinemaCurrentIndex] : null);
            if (!currentSong) return;

            const confirmDownload = confirm(`¿Deseas descartar el audio actual de "${currentSong.title}" y descargar la versión limpia oficial de estudio (sin intros de videoclip ni diálogos)?`);
            if (!confirmDownload) return;

            btnCinemaReplaceClean.disabled = true;
            btnCinemaReplaceClean.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Descargando...';
            showSyncNotification('⏳ Descargando versión limpia oficial de estudio...');

            try {
                const res = await fetch('/api/track/replace-clean-audio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        artist: currentSong.artist,
                        title: currentSong.rawTitle || currentSong.title,
                        category: currentSong.playlistName || currentTab
                    })
                });

                const data = await res.json();
                if (data.success) {
                    // Restablecer el desfase a 0.0s
                    const key = `offset_${normalizeText(currentSong.artist)}_${normalizeText(currentSong.title)}`;
                    safeStorage.setItem(key, '0.0');
                    updateLyricsSyncOffset(0.0);

                    // Recargar el reproductor con el nuevo audio
                    if (data.relUrl && mainMusicAudio) {
                        mainMusicAudio.src = data.relUrl;
                        mainMusicAudio.load();
                        mainMusicAudio.play().catch(()=>{});
                    }

                    showSyncNotification('✨ ¡Pista de audio reemplazada con éxito por la versión limpia de estudio!');
                    btnCinemaReplaceClean.innerHTML = '<i class="fa-solid fa-check"></i> Reemplazada';
                    setTimeout(() => {
                        btnCinemaReplaceClean.disabled = false;
                        btnCinemaReplaceClean.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Versión';
                    }, 3000);
                } else {
                    throw new Error(data.error || 'Error en la descarga');
                }
            } catch(e) {
                console.error('Error reemplazando versión limpia:', e);
                showSyncNotification('❌ ' + e.message);
                btnCinemaReplaceClean.disabled = false;
                btnCinemaReplaceClean.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Versión';
            }
        });
    }

    
    function updateCinemaSubsDurationBadge() {
        const durBadge = document.getElementById('cinema-subs-dur-text');
        if (!durBadge) return;
        if (!cinemaParsedLyrics || cinemaParsedLyrics.length === 0) {
            durBadge.textContent = '--:--';
            return;
        }
        const lastLine = cinemaParsedLyrics[cinemaParsedLyrics.length - 1];
        let sec = 0;
        if (lastLine) {
            if (typeof lastLine.seconds === 'number') sec = lastLine.seconds;
            else if (lastLine.time) {
                const parts = lastLine.time.split(':');
                sec = parseInt(parts[0], 10) * 60 + parseFloat(parts[1] || 0);
            }
        }
        if (!sec || isNaN(sec)) {
            durBadge.textContent = '--:--';
            return;
        }
        const mins = Math.floor(sec / 60);
        const secs = Math.floor(sec % 60);
        durBadge.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    const btnCinemaReplaceSubs = document.getElementById('btn-cinema-replace-subs');
    if (btnCinemaReplaceSubs) {
        btnCinemaReplaceSubs.addEventListener('click', async () => {
            const currentSong = currentPlayingSong || (cinemaCurrentTrackList ? cinemaCurrentTrackList[cinemaCurrentIndex] : null);
            if (!currentSong) return;

            btnCinemaReplaceSubs.disabled = true;
            btnCinemaReplaceSubs.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rotando...';
            showSyncNotification('🔍 Buscando otra versión de subtítulos en la base de datos...');

            try {
                const res = await fetch('/api/lyrics/cycle-version', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        artist: currentSong.artist,
                        title: currentSong.rawTitle || currentSong.title
                    })
                });

                const data = await res.json();
                if (data.success && data.lyrics && data.lyrics.length > 0) {
                    cinemaParsedLyrics = data.lyrics.map((l, idx) => {
                        let sec = null;
                        if (typeof l.seconds === 'number') sec = l.seconds;
                        else if (l.time) {
                            const parts = l.time.split(':');
                            sec = parseInt(parts[0], 10) * 60 + parseFloat(parts[1] || 0);
                        }
                        return { ...l, seconds: sec, index: idx, hasTimestamp: sec !== null };
                    });

                    // Restablecer desfase a 0.0s
                    const key = `offset_${normalizeText(currentSong.artist)}_${normalizeText(currentSong.title)}`;
                    safeStorage.setItem(key, '0.0');
                    updateLyricsSyncOffset(0.0);

                    renderCinemaLyricLines();
                    updateCinemaSubsDurationBadge();

                    showSyncNotification(`✨ Versión de subs ${data.candidateIndex}/${data.totalCandidates} cargada (Duración: ${data.subsDuration})`);
                } else {
                    showSyncNotification('⚠️ ' + (data.error || 'No se encontraron otras versiones de subtítulos.'));
                }
            } catch(e) {
                console.error('Error rotando versión de subtítulos:', e);
                showSyncNotification('❌ Error al cambiar versión de subtítulos');
            } finally {
                btnCinemaReplaceSubs.disabled = false;
                btnCinemaReplaceSubs.innerHTML = '<i class="fa-solid fa-closed-captioning"></i> Versión Subs';
            }
        });
    }

    if (btnSyncSave) {
        btnSyncSave.addEventListener('click', async () => {
            const currentSong = currentPlayingSong || (cinemaCurrentTrackList ? cinemaCurrentTrackList[cinemaCurrentIndex] : null);
            if (!currentSong || !cinemaParsedLyrics || cinemaParsedLyrics.length === 0) return;

            btnSyncSave.disabled = true;
            btnSyncSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const res = await fetch('/api/lyrics/save-offset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        artist: currentSong.artist,
                        title: currentSong.rawTitle || currentSong.title,
                        offsetSec: lyricsSyncOffset,
                        lyricsArray: cinemaParsedLyrics
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.lyrics) {
                        cinemaParsedLyrics = data.lyrics.map((l, idx) => {
                            return { ...l, index: idx, hasTimestamp: true };
                        });

                        const key = `offset_${normalizeText(currentSong.artist)}_${normalizeText(currentSong.title)}`;
                        safeStorage.setItem(key, '0.0');
                        updateLyricsSyncOffset(0.0);

                        renderCinemaLyricLines();

                        // Si la letra no tiene traducciones todavía, re-consultar en 3s para mostrarlas cuando termine la traducción en segundo plano
                        const needsTrans = cinemaParsedLyrics.some(l => (l.text || '').trim().length > 3 && !l.translation);
                        if (needsTrans) {
                            setTimeout(() => {
                                fetch(`/api/track/detail?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(trackTitleQuery)}`)
                                    .then(r => r.json())
                                    .then(freshData => {
                                        if (freshData && freshData.lyrics && freshData.lyrics.some(l => l.translation)) {
                                            cinemaParsedLyrics = cinemaParsedLyrics.map((l, idx) => ({
                                                ...l,
                                                translation: freshData.lyrics[idx] ? freshData.lyrics[idx].translation : l.translation
                                            }));
                                            renderCinemaLyricLines();
                                        }
                                    }).catch(()=>{});
                            }, 3000);
                        }

                        btnSyncSave.classList.add('saved');
                        btnSyncSave.innerHTML = '<i class="fa-solid fa-check"></i>';
                        showSyncNotification('💾 ¡Karaoke y marcas de tiempo grabadas permanentemente en la base de datos!');

                        setTimeout(() => {
                            btnSyncSave.disabled = false;
                            btnSyncSave.classList.remove('saved');
                            btnSyncSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
                        }, 2500);
                    }
                } else {
                    throw new Error('Error en el servidor');
                }
            } catch(e) {
                console.error('Error guardando karaoke permanente:', e);
                btnSyncSave.disabled = false;
                btnSyncSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
                showSyncNotification('❌ Error al grabar karaoke permanente');
            }
        });
    }



    function loadTrackSyncOffset(track) {
        if (!track) return;
        const key = `offset_${normalizeText(track.artist)}_${normalizeText(track.title)}`;
        let saved = 0.0;
        const val = safeStorage.getItem(key);
        if (val !== null) saved = parseFloat(val);
        updateLyricsSyncOffset(saved);
        
        // Reset pin mode on song change
        
    }

    
    // ==========================================================================
        // ==========================================================================
    // 🎚️ Web Audio API: Normalización Inteligente Adaptativa (AGC + Limiter)
    // ==========================================================================
    let audioCtx = null;
    let audioSourceNode = null;
    let compressorNode = null;
    let normalizerGainNode = null;
    let analyserNode = null;
    let agcInterval = null;
    let isAudioNormalizationActive = safeStorage.getItem('audio_normalization_enabled') !== 'false'; // Activo por defecto

    function initAudioNormalizationGraph() {
        if (audioCtx) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass || !mainMusicAudio) return;
            audioCtx = new AudioContextClass();

            // Configurar crossOrigin para permitir Web Audio
            mainMusicAudio.crossOrigin = "anonymous";
            audioSourceNode = audioCtx.createMediaElementSource(mainMusicAudio);

            // 1. Ganancia adaptable dinámica (AGC)
            normalizerGainNode = audioCtx.createGain();
            normalizerGainNode.gain.setValueAtTime(1.8, audioCtx.currentTime);

            // 2. Limitador/Compresor transparente de protección
            compressorNode = audioCtx.createDynamicsCompressor();
            compressorNode.threshold.setValueAtTime(-14, audioCtx.currentTime);
            compressorNode.knee.setValueAtTime(12, audioCtx.currentTime);
            compressorNode.ratio.setValueAtTime(8, audioCtx.currentTime);
            compressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);
            compressorNode.release.setValueAtTime(0.18, audioCtx.currentTime);

            // 3. Analizador de sonoridad en tiempo real
            analyserNode = audioCtx.createAnalyser();
            analyserNode.fftSize = 1024;
            analyserNode.smoothingTimeConstant = 0.8;

            updateNormalizationRoute();
            updateNormalizationButtonState();
            startAdaptiveGainControl();
        } catch(e) {
            console.log('Info Web Audio Normalizer:', e.message);
        }
    }

    function startAdaptiveGainControl() {
        if (agcInterval) clearInterval(agcInterval);
        const sampleBuffer = new Float32Array(1024);

        agcInterval = setInterval(() => {
            if (!isAudioNormalizationActive || !audioCtx || !analyserNode || !normalizerGainNode || !mainMusicAudio || mainMusicAudio.paused) {
                return;
            }

            try {
                analyserNode.getFloatTimeDomainData(sampleBuffer);
                let sumSq = 0;
                for (let i = 0; i < sampleBuffer.length; i++) {
                    sumSq += sampleBuffer[i] * sampleBuffer[i];
                }
                const rms = Math.sqrt(sumSq / sampleBuffer.length);

                // Solo actuar si hay señal musical audible (evitar amplificar silencios)
                if (rms > 0.008) {
                    const currentDb = 20 * Math.log10(rms);
                    // Nivel estándar broadcast confortable (-16 dB RMS)
                    const targetDb = -16.0;
                    const dbDiff = targetDb - currentDb;

                    let desiredGain = Math.pow(10, dbDiff / 20);
                    // Limitar ganancia en rango seguro: min 0.7x (-3 dB), max 3.2x (+10 dB)
                    desiredGain = Math.max(0.7, Math.min(3.2, desiredGain));

                    // Transición ultrasuave (0.35s) sin saltos audibles
                    normalizerGainNode.gain.setTargetAtTime(desiredGain, audioCtx.currentTime, 0.35);
                }
            } catch(err) {}
        }, 120);
    }

    function updateNormalizationRoute() {
        if (!audioSourceNode || !audioCtx) return;
        try {
            audioSourceNode.disconnect();
            if (normalizerGainNode) normalizerGainNode.disconnect();
            if (compressorNode) compressorNode.disconnect();
            if (analyserNode) analyserNode.disconnect();

            if (isAudioNormalizationActive) {
                // Cadena activa: Fuente -> Ganancia Adaptativa (AGC) -> Compresor/Limitador -> Analizador -> Salida
                audioSourceNode.connect(normalizerGainNode);
                normalizerGainNode.connect(compressorNode);
                compressorNode.connect(analyserNode);
                analyserNode.connect(audioCtx.destination);
            } else {
                // Bypass directo sin procesamiento
                audioSourceNode.connect(audioCtx.destination);
            }
        } catch(e) {
            console.log('Error conectando ruta de normalización:', e.message);
        }
    }

    function updateNormalizationButtonState() {
        if (!musicBtnNormalize) return;
        if (isAudioNormalizationActive) {
            musicBtnNormalize.classList.add('active-magic');
            musicBtnNormalize.title = 'Normalización Inteligente (-14 LUFS / Nivelación Adaptativa): Activada';
        } else {
            musicBtnNormalize.classList.remove('active-magic');
            musicBtnNormalize.title = 'Normalización de Audio: Desactivada (Volumen Original)';
        }
    }

    if (musicBtnNormalize) {
        musicBtnNormalize.addEventListener('click', () => {
            if (!audioCtx) initAudioNormalizationGraph();
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
            isAudioNormalizationActive = !isAudioNormalizationActive;
            safeStorage.setItem('audio_normalization_enabled', isAudioNormalizationActive ? 'true' : 'false');
            updateNormalizationButtonState();
            updateNormalizationRoute();
            showSyncNotification(isAudioNormalizationActive 
                ? '✨ Normalización Adaptativa Activada (Nivelación Uniforme -14 LUFS)' 
                : '🔇 Normalización de Audio Desactivada (Volumen Original)');
        });
    }

    // ==========================================================================
    // 🛡️ Screen Wake Lock API: Evitar suspensión del PC durante la reproducción
    // ==========================================================================
    let wakeLockSentinel = null;

    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                if (!wakeLockSentinel) {
                    wakeLockSentinel = await navigator.wakeLock.request('screen');
                    wakeLockSentinel.addEventListener('release', () => {
                        wakeLockSentinel = null;
                    });
                    console.log('🛡️ Wake Lock activo: El PC no se suspenderá mientras suene la música.');
                }
            } catch (err) {
                console.log('Wake Lock no disponible o denegado:', err.message);
            }
        }
    }

    function releaseWakeLock() {
        if (wakeLockSentinel) {
            try {
                wakeLockSentinel.release().then(() => {
                    wakeLockSentinel = null;
                    console.log('💤 Wake Lock liberado: El PC puede suspenderse con normalidad.');
                }).catch(() => {});
            } catch (e) {
                wakeLockSentinel = null;
            }
        }
    }

    // Re-adquirir el Wake Lock automáticamente si se cambia de pestaña mientras suena
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && mainMusicAudio && !mainMusicAudio.paused) {
            await requestWakeLock();
        }
    });

    // Audio Element Event Listeners
    if (mainMusicAudio) {
        mainMusicAudio.addEventListener('play', () => {
            requestWakeLock();
            if (!audioCtx) initAudioNormalizationGraph();
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
        });
        mainMusicAudio.addEventListener('pause', () => {
            releaseWakeLock();
        });
        mainMusicAudio.addEventListener('timeupdate', () => {
            if (!mainMusicAudio.duration) return;
            const curr = mainMusicAudio.currentTime;
            const dur = mainMusicAudio.duration;
            if (musicTimeCurr) musicTimeCurr.textContent = formatTime(curr);
            if (musicTimeDur) musicTimeDur.textContent = formatTime(dur);
            if (musicSeekSlider && !musicSeekSlider.dragging) {
                musicSeekSlider.value = (curr / dur) * 100;
            }

            if (cinemaTimeCurr) cinemaTimeCurr.textContent = formatTime(curr);
            if (cinemaTimeDur) cinemaTimeDur.textContent = formatTime(dur);
            if (cinemaSeekSlider && !cinemaSeekSlider.dragging) {
                cinemaSeekSlider.value = (curr / dur) * 100;
            }



            // Karaoke Mode: Real-time Lyric Highlight & Auto-scroll
            if (cinemaOverlay && cinemaOverlay.style.display === 'flex' && cinemaParsedLyrics.length > 0) {
                let activeIdx = -1;
                const hasTimestamps = cinemaParsedLyrics.some(l => l.hasTimestamp);
                if (hasTimestamps) {
                    const adjustedTime = curr + lyricsSyncOffset;
                    for (let i = 0; i < cinemaParsedLyrics.length; i++) {
                        if (cinemaParsedLyrics[i].seconds === null) continue;
                        if (cinemaParsedLyrics[i].seconds <= adjustedTime + 0.25) {
                            activeIdx = i;
                        }
                    }
                }

                if (activeIdx !== currentCinemaActiveLine) {
                    currentCinemaActiveLine = activeIdx;
                    document.querySelectorAll('.cinema-lyric-line').forEach((el, idx) => {
                        if (idx === activeIdx) {
                            el.classList.add('active');
                            if (cinemaLyrics && !isUserScrollingCinema) {
                                const containerHeight = cinemaLyrics.clientHeight;
                                const elTop = el.offsetTop;
                                const elHeight = el.clientHeight;
                                const targetScroll = elTop - (containerHeight / 2) + (elHeight / 2);
                                cinemaLyrics.scrollTo({
                                    top: Math.max(0, targetScroll),
                                    behavior: 'smooth'
                                });
                            }
                        } else {
                            el.classList.remove('active');
                        }
                    });


                }
            }
        });



        mainMusicAudio.addEventListener('ended', () => {
            if (playbackMode === 'playlist_shuffle' || playbackMode === 'party_dj') {
                if (activePlaylistQueue.length > 0) {
                    currentQueueIndex = (currentQueueIndex + 1) % activePlaylistQueue.length;
                    playQueueTrack(activePlaylistQueue[currentQueueIndex]);
                }
            } else {
                updateMusicBarState(false);
                renderSongs();
            }
        });
    }

    if (musicSeekSlider && mainMusicAudio) {
        musicSeekSlider.addEventListener('input', (e) => {
            if (mainMusicAudio.duration) {
                mainMusicAudio.currentTime = (parseFloat(e.target.value) / 100) * mainMusicAudio.duration;
            }
        });
    }

    if (cinemaSeekSlider && mainMusicAudio) {
        cinemaSeekSlider.addEventListener('input', (e) => {
            if (mainMusicAudio.duration) {
                mainMusicAudio.currentTime = (parseFloat(e.target.value) / 100) * mainMusicAudio.duration;
            }
        });
    }

    if (musicBtnPlay && mainMusicAudio) {
        musicBtnPlay.addEventListener('click', () => {
            if (mainMusicAudio.paused) {
                mainMusicAudio.play();
                updateMusicBarState(true);
            } else {
                mainMusicAudio.pause();
                updateMusicBarState(false);
            }
            renderSongs();
        });
    }

    if (musicBtnNext) {
        musicBtnNext.addEventListener('click', () => {
            if (activePlaylistQueue.length === 0) return;
            currentQueueIndex = (currentQueueIndex + 1) % activePlaylistQueue.length;
            playQueueTrack(activePlaylistQueue[currentQueueIndex]);
        });
    }

    if (musicBtnPrev) {
        musicBtnPrev.addEventListener('click', () => {
            if (activePlaylistQueue.length === 0) return;
            currentQueueIndex = (currentQueueIndex - 1 + activePlaylistQueue.length) % activePlaylistQueue.length;
            playQueueTrack(activePlaylistQueue[currentQueueIndex]);
        });
    }

    if (musicVolSlider && mainMusicAudio) {
        musicVolSlider.addEventListener('input', (e) => {
            mainMusicAudio.volume = parseFloat(e.target.value);
            if (musicBtnMute) {
                musicBtnMute.innerHTML = mainMusicAudio.volume === 0 ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
            }
        });
    }

    if (musicBtnMute && mainMusicAudio) {
        musicBtnMute.addEventListener('click', () => {
            mainMusicAudio.muted = !mainMusicAudio.muted;
            musicBtnMute.innerHTML = mainMusicAudio.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
        });
    }

    if (musicBtnClose && mainMusicAudio && musicPlayerBar) {
        musicBtnClose.addEventListener('click', () => {
            mainMusicAudio.pause();
            mainMusicAudio.src = '';

            playbackMode = 'idle';
            currentPlayingSong = null;
            musicPlayerBar.style.display = 'none';
            renderSongs();
        });
    }

    if (musicBtnCinema) {
        musicBtnCinema.addEventListener('click', () => {
            if (currentPlayingSong) {
                openCinemaMode(currentPlayingSong, activePlaylistQueue);
            }
        });
    }

    // ==========================================================================
    // 🎶 Main Songs Render Function (Grid & List with 4 Buttons)
    // ==========================================================================
    function renderSongs() {
        if (currentTab === 'Radio') {
            if (btnPlaylistShuffle) btnPlaylistShuffle.style.display = 'none';
            renderRadioStations();
            return;
        }

        if (currentTab === 'Éxitos España') {
            if (btnPlaylistShuffle) btnPlaylistShuffle.style.display = 'none';
            renderRetroHitsView();
            return;
        }
        if (btnPlaylistShuffle) btnPlaylistShuffle.style.display = 'inline-flex';

        const isGlobalSearch = searchQuery.trim().length > 0;
        let tracksToFilter = [];

        if (isGlobalSearch) {
            // Búsqueda global en todas las playlists
            for (const [pName, pTracks] of Object.entries(allPlaylists)) {
                for (const t of pTracks) {
                    tracksToFilter.push({ ...t, playlistName: pName });
                }
            }
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        } else {
            // Filtrado local dentro de la pestaña actual
            const pTracks = allPlaylists[currentTab] || [];
            tracksToFilter = pTracks.map(t => ({ ...t, playlistName: currentTab }));
            selectPlaylistTab(currentTab);
        }

        let filtered = tracksToFilter.filter(t => {
            const matchGlobal = isGlobalSearch ? checkMatch(t, searchQuery) : true;
            const matchQuick = checkMatch(t, quickFilterQuery);
            const matchPill = matchQuickPill(t);
            return matchGlobal && matchQuick && matchPill;
        });

        filtered = sortTracks(filtered);

        if (isGlobalSearch) {
            currentSectionTitle.innerHTML = `<i class="fa-solid fa-magnifying-glass" style="color: var(--spotify-green);"></i> Búsqueda global: "${searchQuery}"`;
            resultsCountText.textContent = `${filtered.length} canciones encontradas en el catálogo`;
        } else {
            const currentIcon = playlistIcons[currentTab] || 'fa-compact-disc';
            currentSectionTitle.innerHTML = `<i class="fa-solid ${currentIcon}" style="color: var(--spotify-green);"></i> ${currentTab}`;
            resultsCountText.textContent = `${filtered.length} canciones encontradas`;
        }

        songsGrid.className = viewMode === 'list' ? 'songs-grid view-list-mode' : 'songs-grid';
        songsGrid.innerHTML = '';

        if (filtered.length === 0) {
            const emptyMsg = isGlobalSearch 
                ? `No se encontraron canciones para "${searchQuery}" en ninguna lista.`
                : `No se encontraron canciones en la categoría "${currentTab}".`;
            songsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-compact-disc" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p>${emptyMsg}</p>
                </div>
            `;
            return;
        }

        filtered.forEach(song => {
            const card = document.createElement('div');
            const isPlayingThisSong = currentPlayingSong && currentPlayingSong.title === song.title && currentPlayingSong.artist === song.artist && mainMusicAudio && !mainMusicAudio.paused;
            card.className = isPlayingThisSong ? 'song-card playing' : 'song-card';

            const coverHtml = song.coverUrl 
                ? `<img src="${song.coverUrl}" alt="${song.album || song.title}" class="cover-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                   <i class="fa-solid fa-record-vinyl music-icon" style="display:none;"></i>`
                : `<i class="fa-solid fa-record-vinyl music-icon"></i>`;

            const briefDate = formatBriefDate(song.releaseDate, song.releaseYear);
            const playlistIcon = playlistIcons[song.playlistName] || 'fa-compact-disc';
            const playlistBadgeHtml = isGlobalSearch ? `
                <div style="margin-top: 4px; margin-bottom: 6px;">
                    <span class="track-playlist-badge" data-switch-tab="${song.playlistName}" title="Ir a la lista ${song.playlistName}">
                        <i class="fa-solid ${playlistIcon}"></i> ${song.playlistName}
                    </span>
                </div>
            ` : '';

            if (viewMode === 'grid') {
                card.innerHTML = `
                    <div class="card-cover">
                        ${coverHtml}
                        <div class="play-overlay">
                            <div class="play-button-icon" style="${isPlayingThisSong ? 'background:#ef4444; color:#fff;' : ''}">
                                <i class="fa-solid ${isPlayingThisSong ? 'fa-pause' : 'fa-play'}"></i>
                            </div>
                        </div>
                    </div>
                    <div class="song-info">
                        ${playlistBadgeHtml}
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
                            <div style="flex: 1; min-width: 0;">
                                <div class="song-title" title="${song.title}">${song.title}</div>
                                <div class="song-artist" title="${song.artist}">${song.artist}</div>
                            </div>
                            <div class="meta-pills-col">
                                <span class="badge-pill badge-duration" title="Duración">
                                    <i class="fa-regular fa-clock"></i> ${song.durationFmt || '03:30'}
                                </span>
                                <span class="badge-pill badge-date" title="Fecha de lanzamiento: ${song.releaseDate || song.releaseYear || ''}">
                                    <i class="fa-regular fa-calendar"></i> ${briefDate}
                                </span>
                            </div>
                        </div>
                        <div class="song-album-name" title="Álbum: ${song.album || 'Desconocido'}">${song.album || 'Álbum Desconocido'}</div>
                        <div class="card-action-icons">
                            <button class="btn-card-action btn-act-credits" title="Ver Créditos y Detalles" data-action="credits">
                                <i class="fa-solid fa-circle-info"></i>
                            </button>
                            <button class="btn-card-action btn-act-lyrics" title="Ver Letra Sincronizada" data-action="lyrics">
                                <i class="fa-solid fa-microphone"></i>
                            </button>
                            <button class="btn-card-action btn-act-analysis" title="Ver Análisis Sónico Modular" data-action="analysis">
                                <i class="fa-solid fa-microscope"></i>
                            </button>
                            <button class="btn-card-action btn-act-play ${isPlayingThisSong ? 'playing' : ''}" title="${isPlayingThisSong ? 'Pausar canción' : 'Reproducir canción'}" data-action="play">
                                <i class="fa-solid ${isPlayingThisSong ? 'fa-pause' : 'fa-play'}"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                // Lista detallada
                card.innerHTML = `
                    <div class="card-cover">
                        ${coverHtml}
                    </div>
                    <div class="card-body">
                        <div class="song-info-primary">
                            <div class="song-title" style="font-size: 1rem;" title="${song.title}">${song.title}</div>
                            <div class="song-artist" title="${song.artist}">${song.artist}</div>
                            ${isGlobalSearch ? `<span class="track-playlist-badge" data-switch-tab="${song.playlistName}" style="margin-top: 4px;" title="Ir a la lista ${song.playlistName}"><i class="fa-solid ${playlistIcon}"></i> ${song.playlistName}</span>` : ''}
                        </div>
                        <div class="song-album-info" title="${song.album || 'Álbum'}">
                            <i class="fa-solid fa-compact-disc"></i> ${song.album || 'Álbum Desconocido'}
                        </div>
                        <div class="song-year-info">
                            <span class="badge-pill badge-date"><i class="fa-regular fa-calendar"></i> ${briefDate}</span>
                        </div>
                        <div class="song-year-info" style="width: 85px;">
                            <span class="badge-pill badge-duration"><i class="fa-regular fa-clock"></i> ${song.durationFmt || '03:30'}</span>
                        </div>
                        <div class="card-action-icons" style="margin-top: 0; padding-top: 0; display: grid; grid-template-columns: repeat(4, 38px); width: auto; gap: 6px;">
                            <button class="btn-card-action btn-act-credits" title="Ver Créditos" data-action="credits">
                                <i class="fa-solid fa-circle-info"></i>
                            </button>
                            <button class="btn-card-action btn-act-lyrics" title="Ver Letra" data-action="lyrics">
                                <i class="fa-solid fa-microphone"></i>
                            </button>
                            <button class="btn-card-action btn-act-analysis" title="Ver Análisis Sónico" data-action="analysis">
                                <i class="fa-solid fa-microscope"></i>
                            </button>
                            <button class="btn-card-action btn-act-play ${isPlayingThisSong ? 'playing' : ''}" title="${isPlayingThisSong ? 'Pausar' : 'Reproducir'}" data-action="play">
                                <i class="fa-solid ${isPlayingThisSong ? 'fa-pause' : 'fa-play'}"></i>
                            </button>
                        </div>
                    </div>
                `;
            }

            card.addEventListener('click', (e) => {
                const badgeBtn = e.target.closest('.track-playlist-badge');
                if (badgeBtn) {
                    e.stopPropagation();
                    const targetPlaylist = badgeBtn.getAttribute('data-switch-tab');
                    if (targetPlaylist) {
                        searchQuery = '';
                        searchInput.value = '';
                        selectPlaylistTab(targetPlaylist);
                        renderSongs();
                    }
                    return;
                }

                const actionBtn = e.target.closest('.btn-card-action');
                if (actionBtn) {
                    e.stopPropagation();
                    const action = actionBtn.getAttribute('data-action');
                    if (action === 'play') {
                        handleCardPlayClick(song);
                    } else if (action === 'analysis') {
                        openSongModal(song, 'tab-microscope');
                    } else if (action === 'lyrics') {
                        openSongModal(song, 'tab-lyrics');
                    } else if (action === 'credits') {
                        openSongModal(song, 'tab-credits');
                    } else {
                        openSongModal(song, 'tab-credits');
                    }
                    return;
                }

                // If clicking cover play overlay
                const playOverlay = e.target.closest('.play-overlay');
                if (playOverlay) {
                    e.stopPropagation();
                    handleCardPlayClick(song);
                    return;
                }

                // Si estamos en búsqueda global y pulsamos la tarjeta, cambiamos a esa lista y abrimos el modal
                if (isGlobalSearch && song.playlistName) {
                    searchQuery = '';
                    searchInput.value = '';
                    selectPlaylistTab(song.playlistName);
                    renderSongs();
                }
                openSongModal(song, 'tab-credits');
            });
            songsGrid.appendChild(card);
        });
    }

    // Eventos de Pestañas
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab'); 
            activeQuickPill = 'all'; 
            quickFilterQuery = ''; 
            if(quickFilterInput) quickFilterInput.value = ''; 
            renderQuickPills();
            renderSongs();
        });
    });

    // Búsqueda en vivo
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderSongs();
    });

    if (quickFilterInput) {
        quickFilterInput.addEventListener('input', (e) => {
            quickFilterQuery = e.target.value;
            renderSongs();
        });
    }

    // Controles de Ordenamiento
    sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        renderSongs();
    });

    btnSortDir.addEventListener('click', () => {
        sortAsc = !sortAsc;
        sortDirIcon.className = sortAsc ? 'fa-solid fa-arrow-down-a-z' : 'fa-solid fa-arrow-up-z-a';
        btnSortDir.title = sortAsc ? 'Orden Ascendente (A-Z / Antiguo)' : 'Orden Descendente (Z-A / Reciente)';
        renderSongs();
    });

    // Controles de Vista (Cuadrícula / Lista)
    btnViewGrid.addEventListener('click', () => {
        viewMode = 'grid';
        btnViewGrid.classList.add('active');
        btnViewList.classList.remove('active');
        renderSongs();
    });

    btnViewList.addEventListener('click', () => {
        viewMode = 'list';
        btnViewList.classList.add('active');
        btnViewGrid.classList.remove('active');
        renderSongs();
    });

    // Eventos Modal - Cambios de pestaña interna del modal
    document.querySelectorAll('.modal-nav-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            document.querySelectorAll('.modal-nav-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));

            tabBtn.classList.add('active');
            const targetId = tabBtn.getAttribute('data-modal-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Abrir Modal con detalle de canción
    function openSongModal(song, initialTab = 'tab-credits') {
        currentModalSong = song;
        document.getElementById('modal-title-text').textContent = song.title;
        document.getElementById('modal-artist-text').textContent = song.artist;

        switchModalTab(initialTab);

        // Mostrar de inmediato los créditos con los datos que ya tenemos del catálogo
        populateCreditsTab({}, song);

        songModal.classList.add('active');

        const trackTitleQuery = song.rawTitle || song.title;
        fetch(`/api/track/detail?artist=${encodeURIComponent(song.artist)}&title=${encodeURIComponent(trackTitleQuery)}`)
            .then(res => res.json())
            .then(detail => {
                populateCreditsTab(detail, song);
                populateLyricsTab(detail);
                populateAnalysisTab(detail, song.artist, song.title);
            })
            .catch(err => {
                console.error('Error cargando detalle adicional:', err);
            });
    }

    function populateCreditsTab(detail, song) {
        detail = detail || {};
        song = song || {};
        const artist = detail.composers || song.artist || 'Artista Principal';
        const album = song.album || detail.album || 'Álbum Desconocido';
        const year = song.releaseYear || detail.releaseYear || '2000';
        const duration = song.durationFmt || detail.durationFmt || '03:30';
        const label = detail.label || 'Sello Discográfico Principal';
        const genre = detail.genre || 'Pop / Rock / Dance';

        document.getElementById('tab-credits').innerHTML = `
            <div class="credits-grid" style="margin-top: 10px;">
                <div class="credit-card">
                    <i class="fa-solid fa-user-pen"></i>
                    <div class="credit-label">Compositor / Autor</div>
                    <div class="credit-value">${artist}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-compact-disc"></i>
                    <div class="credit-label">Álbum</div>
                    <div class="credit-value">${album}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-calendar-day"></i>
                    <div class="credit-label">Año de Lanzamiento</div>
                    <div class="credit-value">${year}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-clock"></i>
                    <div class="credit-label">Duración</div>
                    <div class="credit-value">${duration}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-building"></i>
                    <div class="credit-label">Sello Discográfico</div>
                    <div class="credit-value">${label}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-music"></i>
                    <div class="credit-label">Género Musical</div>
                    <div class="credit-value">${genre}</div>
                </div>
            </div>
        `;
    }

    function populateLyricsTab(detail) {
        const lyricsContainer = document.getElementById('lyrics-content-list');
        lyricsContainer.innerHTML = '';

        if (!detail || !detail.lyrics || detail.lyrics.length === 0) {
            lyricsContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-microphone-slash" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.4;"></i>
                    <p>No se encontró letra sincronizada para esta canción.</p>
                </div>
            `;
            return;
        }

        const btnToggle = document.createElement('button');
        btnToggle.className = 'btn-toggle-translation';
        btnToggle.innerHTML = '<i class="fa-solid fa-language"></i> Ocultar Traducción';
        btnToggle.addEventListener('click', () => {
            lyricsContainer.classList.toggle('hide-translation');
            const isHidden = lyricsContainer.classList.contains('hide-translation');
            btnToggle.innerHTML = isHidden 
                ? '<i class="fa-solid fa-language"></i> Ver Traducción' 
                : '<i class="fa-solid fa-language"></i> Ocultar Traducción';
        });
        lyricsContainer.appendChild(btnToggle);

        detail.lyrics.forEach(line => {
            const row = document.createElement('div');
            row.className = 'lyrics-row';

            const origRow = document.createElement('div');
            origRow.className = 'lyrics-row-orig';

            if (line.time) {
                const ts = document.createElement('span');
                ts.className = 'lyrics-timestamp';
                ts.textContent = line.time;
                origRow.appendChild(ts);
            }

            const textSpan = document.createElement('span');
            textSpan.className = 'lyrics-orig-text';
            textSpan.textContent = line.text;
            origRow.appendChild(textSpan);

            row.appendChild(origRow);

            const isSpanishList = currentModalSong && (currentModalSong.playlistName === 'Española' || currentModalSong.playlistName === 'Música latina' || currentTab === 'Española' || currentTab === 'Música latina');
            const isSame = line.translation ? (normalizeText(line.translation) === normalizeText(line.text)) : true;
            const showTrans = !isSpanishList && line.translation && !isSame && line.translation.trim().length > 0;

            if (showTrans) {
                const transRow = document.createElement('div');
                transRow.className = 'lyrics-row-trans';
                transRow.textContent = line.translation;
                row.appendChild(transRow);
            }

            lyricsContainer.appendChild(row);
        });
    }

    function populateAnalysisTab(detail, trackArtist, trackTitle) {
        const container = document.getElementById('tab-microscope');
        const artist = trackArtist || (currentModalTrack ? currentModalTrack.artist : '') || (detail && detail.analysis ? detail.analysis.artist : '');
        const title = trackTitle || (currentModalTrack ? currentModalTrack.title : '') || (detail && detail.analysis ? detail.analysis.title : '');

        if (!detail || !detail.analysis) {
            container.innerHTML = `
                <div style="text-align: center; padding: 50px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-microscope" style="font-size: 2.8rem; margin-bottom: 16px; opacity: 0.4; color: #38bdf8;"></i>
                    <h4 style="color: #fff; margin-bottom: 8px; font-size: 1.1rem;">Sin análisis sónico registrado</h4>
                    <p style="margin-bottom: 20px; font-size: 0.9rem;">¿Deseas que Gemini AI analice esta pista en profundidad ahora mismo?</p>
                    <button class="btn-reanalyze-ai" id="btn-trigger-ai-analysis">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Analizar con Gemini AI
                    </button>
                </div>
            `;
            const btn = document.getElementById('btn-trigger-ai-analysis');
            if (btn) {
                btn.addEventListener('click', () => triggerReanalysis(artist, title));
            }
            return;
        }

        const a = detail.analysis;
        const isGeneric = (a.synopsis && a.synopsis.includes("es una pieza fundamental dentro de su género")) || 
                          (a.sections && a.sections[0] && a.sections[0].points && a.sections[0].points[0] && a.sections[0].points[0].name === "El punto de inflexión creativo");

        let html = `
            <div class="analysis-container">
                <!-- Hero Card -->
                <div class="analysis-hero-card">
                    <div class="analysis-hero-top">
                        <div class="analysis-badges-row">
                            <span class="analysis-ai-badge">
                                <i class="fa-solid fa-brain"></i> ${isGeneric ? 'Plantilla Básica' : 'Gemini AI Sónico'}
                            </span>
                            ${a.year && a.year !== '2000' ? `<span class="analysis-meta-pill"><i class="fa-regular fa-calendar"></i> ${a.year}</span>` : ''}
                            ${a.album && a.album !== 'Álbum' && a.album !== 'Álbum Principal' ? `<span class="analysis-meta-pill"><i class="fa-solid fa-compact-disc"></i> ${a.album}</span>` : ''}
                        </div>
                        <button class="btn-reanalyze-ai" id="btn-reanalyze-ai" title="Regenerar análisis sónico con Gemini AI">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> ${isGeneric ? 'Mejorar con Gemini IA' : 'Re-analizar con IA'}
                        </button>
                    </div>
                    <p class="analysis-synopsis-text">${a.synopsis || 'Análisis no disponible'}</p>
                </div>

                <!-- Secciones Modulares -->
                <div class="analysis-sections-grid">
        `;

        if (a.sections && a.sections.length > 0) {
            a.sections.forEach((sec, idx) => {
                let secType = 'origen';
                const lowerTitle = (sec.title || '').toLowerCase();
                if (idx === 1 || lowerTitle.includes('anatomía') || lowerTitle.includes('musical') || lowerTitle.includes('producción')) secType = 'anatomia';
                else if (idx === 2 || lowerTitle.includes('lírica') || lowerTitle.includes('mensaje') || lowerTitle.includes('letra')) secType = 'lirica';
                else if (idx === 3 || lowerTitle.includes('impacto') || lowerTitle.includes('legado') || lowerTitle.includes('cultura')) secType = 'legado';

                let pointsHtml = '';
                if (sec.points && sec.points.length > 0) {
                    pointsHtml = `
                        <div class="analysis-points-container">
                            ${sec.points.map(p => `
                                <div class="analysis-point-card">
                                    <div class="analysis-point-name">
                                        <i class="fa-solid fa-circle-dot"></i> ${p.name || 'Detalle'}
                                    </div>
                                    <p class="analysis-point-desc">${p.desc || ''}</p>
                                </div>
                            `).join('')}
                        </div>
                    `;
                }

                html += `
                    <div class="analysis-section-card" data-type="${secType}">
                        <div class="analysis-sec-header">
                            <div class="analysis-sec-icon-wrap">
                                <i class="fa-solid ${sec.icon || 'fa-compact-disc'}"></i>
                            </div>
                            <h4 class="analysis-sec-title-text">${sec.title}</h4>
                        </div>
                        ${sec.text ? `<p class="analysis-sec-intro-text">${sec.text}</p>` : ''}
                        ${pointsHtml}
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        `;

        container.innerHTML = html;

        const reanalyzeBtn = document.getElementById('btn-reanalyze-ai');
        if (reanalyzeBtn) {
            reanalyzeBtn.addEventListener('click', () => triggerReanalysis(artist, title));
        }
    }

    async function triggerReanalysis(artist, title) {
        const btn = document.getElementById('btn-reanalyze-ai') || document.getElementById('btn-trigger-ai-analysis');
        if (btn) {
            btn.classList.add('loading');
            btn.innerHTML = `<i class="fa-solid fa-spinner"></i> Analizando con Gemini AI...`;
        }

        try {
            const res = await fetch('/api/analysis/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artist, title, force: true })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.analysis) {
                    populateAnalysisTab({ analysis: data.analysis }, artist, title);
                    return;
                }
            }
            alert('No se pudo regenerar el análisis.');
        } catch(e) {
            alert('Error de conexión al generar el análisis con IA.');
        } finally {
            if (btn) {
                btn.classList.remove('loading');
                btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Re-analizar con IA`;
            }
        }
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            songModal.classList.remove('active');
        });
    }

    if (songModal) {
        songModal.addEventListener('click', (e) => {
            if (e.target === songModal) {
                songModal.classList.remove('active');
            }
        });
    }

    if (btnModalCinema) {
        btnModalCinema.addEventListener('click', () => {
            if (currentModalSong) {
                if (songModal) songModal.classList.remove('active');
                openCinemaMode(currentModalSong, [currentModalSong]);
            }
        });
    }

    // ==========================================================================
    // 📊 Estadísticas del Catálogo Musical
    // ==========================================================================
    function openStatsModal() {
        if (!statsModal || !statsContent) return;
        
        let totalTracks = 0;
        let totalDurationMs = 0;
        let totalWithLyrics = 0;
        let totalWithAnalysis = 0;
        const artistCounts = {};
        const decadeCounts = { '60s & 70s': 0, '80s': 0, '90s': 0, '2000s': 0, '2010s+': 0 };
        const playlistBreakdown = {};

        for (const [pName, tracks] of Object.entries(allPlaylists)) {
            playlistBreakdown[pName] = tracks.length;
            tracks.forEach(t => {
                totalTracks++;
                totalDurationMs += (t.durationMs || 210000);
                if (t.hasLyrics) totalWithLyrics++;
                if (t.hasAnalysis) totalWithAnalysis++;

                const art = (t.artist || 'Desconocido').split(',')[0].split(' feat')[0].trim();
                artistCounts[art] = (artistCounts[art] || 0) + 1;

                let yr = null;
                if (t.releaseYear) yr = parseInt(t.releaseYear, 10);
                else if (t.releaseDate) yr = parseInt(t.releaseDate.split('-')[0], 10);

                if (yr) {
                    if (yr < 1980) decadeCounts['60s & 70s']++;
                    else if (yr < 1990) decadeCounts['80s']++;
                    else if (yr < 2000) decadeCounts['90s']++;
                    else if (yr < 2010) decadeCounts['2000s']++;
                    else decadeCounts['2010s+']++;
                }
            });
        }

        const totalHours = Math.round(totalDurationMs / (1000 * 60 * 60));
        const sortedArtists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const maxArtistCount = sortedArtists.length > 0 ? sortedArtists[0][1] : 1;
        const maxDecadeCount = Math.max(...Object.values(decadeCounts), 1);

        statsContent.innerHTML = `
            <div class="stats-grid-cards">
                <div class="stat-metric-card">
                    <div class="stat-metric-number">${totalTracks}</div>
                    <div class="stat-metric-label">Canciones Indexadas</div>
                </div>
                <div class="stat-metric-card">
                    <div class="stat-metric-number">${totalHours} h</div>
                    <div class="stat-metric-label">Música Ininterrumpida</div>
                </div>
                <div class="stat-metric-card">
                    <div class="stat-metric-number">${totalWithLyrics}</div>
                    <div class="stat-metric-label">Con Letras & Traducción</div>
                </div>
                <div class="stat-metric-card">
                    <div class="stat-metric-number">${totalWithAnalysis}</div>
                    <div class="stat-metric-label">Con Análisis Sónico</div>
                </div>
            </div>

            <div class="stats-charts-row">
                <div class="stats-panel-box">
                    <div class="stats-panel-title"><i class="fa-solid fa-calendar-days" style="color:var(--spotify-green);"></i> Distribución por Décadas</div>
                    ${Object.entries(decadeCounts).map(([dec, count]) => `
                        <div class="stats-bar-item">
                            <div class="stats-bar-header">
                                <span>${dec}</span>
                                <span style="color:var(--spotify-green);">${count} temas (${Math.round((count/totalTracks)*100)}%)</span>
                            </div>
                            <div class="stats-bar-track">
                                <div class="stats-bar-fill" style="width: ${Math.round((count/maxDecadeCount)*100)}%;"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="stats-panel-box">
                    <div class="stats-panel-title"><i class="fa-solid fa-star" style="color:#f59e0b;"></i> Artistas con Más Canciones</div>
                    ${sortedArtists.map(([art, count]) => `
                        <div class="stats-bar-item">
                            <div class="stats-bar-header">
                                <span style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${art}</span>
                                <span style="color:#38bdf8;">${count} canciones</span>
                            </div>
                            <div class="stats-bar-track">
                                <div class="stats-bar-fill" style="width: ${Math.round((count/maxArtistCount)*100)}%; background: linear-gradient(90deg, #38bdf8, #818cf8);"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        statsModal.style.display = 'flex';
    }

    if (btnOpenStats) btnOpenStats.addEventListener('click', openStatsModal);
    if (btnCloseStats) btnCloseStats.addEventListener('click', () => { if (statsModal) statsModal.style.display = 'none'; });
    if (statsModal) statsModal.addEventListener('click', (e) => { if (e.target === statsModal) statsModal.style.display = 'none'; });

    // ==========================================================================
    // 📺 Modo Cine / Pantalla Completa
    // ==========================================================================
    function openCinemaMode(track, trackList = null) {
        if (!cinemaOverlay) return;
        
        if (trackList && trackList.length > 0) {
            cinemaCurrentTrackList = trackList;
            cinemaCurrentIndex = cinemaCurrentTrackList.findIndex(t => t.title === track.title && t.artist === track.artist);
            if (cinemaCurrentIndex === -1) cinemaCurrentIndex = 0;
        } else {
            const list = allPlaylists[currentTab] || [];
            cinemaCurrentTrackList = list.length > 0 ? list : [track];
            cinemaCurrentIndex = cinemaCurrentTrackList.findIndex(t => t.title === track.title && t.artist === track.artist);
            if (cinemaCurrentIndex === -1) cinemaCurrentIndex = 0;
        }

        const currentTargetTrack = cinemaCurrentTrackList[cinemaCurrentIndex];
        const isAlreadyPlayingThisTrack = currentPlayingSong && 
            currentPlayingSong.title === currentTargetTrack.title && 
            currentPlayingSong.artist === currentTargetTrack.artist && 
            mainMusicAudio && !mainMusicAudio.paused;

        renderCinemaTrack(currentTargetTrack);
        if (!isAlreadyPlayingThisTrack) {
            playQueueTrack(currentTargetTrack);
        }
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        window.scrollTo(0, 0);
        cinemaOverlay.style.display = 'flex';
        requestWakeLock();

        // Activar Pantalla Completa Nativa de Hardware (Oculta navegador, pestañas y barra de tareas)
        try {
            if (!document.fullscreenElement) {
                if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(() => {});
                } else if (document.documentElement.webkitRequestFullscreen) {
                    document.documentElement.webkitRequestFullscreen();
                } else if (document.documentElement.msRequestFullscreen) {
                    document.documentElement.msRequestFullscreen();
                }
            }
        } catch(e) {}
    }

    function closeCinemaMode() {
        if (cinemaOverlay) cinemaOverlay.style.display = 'none';
        if (mainMusicAudio && mainMusicAudio.paused) releaseWakeLock();
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        


        try {
            if (document.fullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        } catch(e) {}
    }

    function renderCinemaTrack(track) {
        if (!track) return;
        loadTrackSyncOffset(track);
        const cover = track.coverUrl || 'img/radios/hitfm.svg';
        if (cinemaBg) cinemaBg.style.backgroundImage = `url('${cover}')`;
        if (cinemaCover) cinemaCover.src = cover;
        if (cinemaTitle) cinemaTitle.textContent = track.title;
        if (cinemaArtist) cinemaArtist.textContent = track.artist;
        if (cinemaAlbum) cinemaAlbum.textContent = `${track.album || 'Álbum'} • ${formatBriefDate(track.releaseDate, track.releaseYear)}`;



        // Fetch detailed lyrics with Karaoke timestamp mapping & Jellyfin video
        if (cinemaLyrics) {
            cinemaLyrics.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Cargando letra sincronizada...</div>';
            currentCinemaActiveLine = -1;
            cinemaParsedLyrics = [];

            const trackTitleQuery = track.rawTitle || track.title;
            fetch(`/api/track/detail?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(trackTitleQuery)}`)
                .then(r => r.json())
                .then(d => {

                    if (d.lyrics && d.lyrics.length > 0) {
                        const hasRealTimestamps = d.lyrics.some(l => (typeof l.seconds === 'number' && l.seconds > 0) || (l.time && l.time !== '00:00'));
                        cinemaParsedLyrics = d.lyrics.map((l, idx) => {
                            let sec = null;
                            if (typeof l.seconds === 'number') sec = l.seconds;
                            else if (l.time) {
                                const parts = l.time.split(':');
                                sec = parseInt(parts[0], 10) * 60 + parseFloat(parts[1] || 0);
                            } else if (!hasRealTimestamps) {
                                sec = null; // Letra plana sin marcas de tiempo
                            }
                            return { ...l, seconds: sec, index: idx, hasTimestamp: sec !== null };
                        });

                        renderCinemaLyricLines();
                        updateCinemaSubsDurationBadge();

                        // Detección de scroll manual con retorno automático a los 5 segundos
                        if (cinemaLyrics) {
                            const handleUserScroll = () => {
                                isUserScrollingCinema = true;
                                clearTimeout(userScrollTimer);
                                userScrollTimer = setTimeout(() => {
                                    isUserScrollingCinema = false;
                                }, 5000);
                            };

                            cinemaLyrics.addEventListener('wheel', handleUserScroll, { passive: true });
                            cinemaLyrics.addEventListener('touchmove', handleUserScroll, { passive: true });
                            cinemaLyrics.addEventListener('scroll', handleUserScroll, { passive: true });
                        }
                    } else {
                        updateCinemaSubsDurationBadge();
                        cinemaLyrics.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-microphone-slash" style="font-size:2rem;margin-bottom:12px;opacity:0.4;"></i><p>No hay letra sincronizada disponible para esta canción.</p></div>';
                    }
                })
                .catch((err) => {
                    console.error('Error detallado en renderCinemaTrack:', err);
                    cinemaLyrics.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;margin-bottom:12px;opacity:0.4;"></i><p>No se pudo cargar la letra para esta canción.</p></div>';
                });
        }
    }

    
    // Click en Título / Artista / Portada en Modo Cine para abrir Ficha de Canción
    const handleOpenCinemaTrackModal = () => {
        if (cinemaCurrentTrackList && cinemaCurrentTrackList.length > 0) {
            const track = cinemaCurrentTrackList[cinemaCurrentIndex];
            if (track) openSongModal(track, 'tab-credits');
        } else if (currentPlayingSong) {
            openSongModal(currentPlayingSong, 'tab-credits');
        }
    };

    if (cinemaTitle) cinemaTitle.addEventListener('click', handleOpenCinemaTrackModal);
    if (cinemaArtist) cinemaArtist.addEventListener('click', handleOpenCinemaTrackModal);
    if (cinemaAlbum) cinemaAlbum.addEventListener('click', handleOpenCinemaTrackModal);
    if (cinemaCover) cinemaCover.addEventListener('click', handleOpenCinemaTrackModal);

    // Click en Título / Artista / Portada en Barra Flotante Inferior
    const handleOpenMusicBarModal = () => {
        if (currentPlayingSong) {
            openSongModal(currentPlayingSong, 'tab-credits');
        }
    };

    // Using existing musicBarTitle, musicBarArtist, musicBarCover from scope

    if (musicBarTitle) musicBarTitle.addEventListener('click', handleOpenMusicBarModal);
    if (musicBarArtist) musicBarArtist.addEventListener('click', handleOpenMusicBarModal);
    if (musicBarCover) musicBarCover.addEventListener('click', handleOpenMusicBarModal);

    if (btnCloseCinema) {
        btnCloseCinema.addEventListener('click', () => {
            closeCinemaMode();
        });
    }

    if (cinemaNext) {
        cinemaNext.addEventListener('click', () => {
            if (activePlaylistQueue.length === 0) return;
            currentQueueIndex = (currentQueueIndex + 1) % activePlaylistQueue.length;
            playQueueTrack(activePlaylistQueue[currentQueueIndex]);
        });
    }

    if (cinemaPrev) {
        cinemaPrev.addEventListener('click', () => {
            if (activePlaylistQueue.length === 0) return;
            currentQueueIndex = (currentQueueIndex - 1 + activePlaylistQueue.length) % activePlaylistQueue.length;
            playQueueTrack(activePlaylistQueue[currentQueueIndex]);
        });
    }

    if (cinemaPlay && mainMusicAudio) {
        cinemaPlay.addEventListener('click', () => {
            if (mainMusicAudio.paused) {
                mainMusicAudio.play();
                updateMusicBarState(true);
            } else {
                mainMusicAudio.pause();
                updateMusicBarState(false);
            }
            renderSongs();
        });
    }

    // Refresh Sync Button
    if (btnJellyfinSync) {
        btnJellyfinSync.addEventListener('click', () => {
            btnJellyfinSync.disabled = true;
            btnJellyfinSync.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
            fetch('/api/jellyfin/refresh', { method: 'POST' })
                .then(r => r.json())
                .then(() => {
                    fetchPlaylists();
                    btnJellyfinSync.innerHTML = '<i class="fa-solid fa-check"></i> Sincronizado';
                    setTimeout(() => {
                        btnJellyfinSync.disabled = false;
                        btnJellyfinSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Sincronizar';
                    }, 2000);
                })
                .catch(() => {
                    btnJellyfinSync.disabled = false;
                    btnJellyfinSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Sincronizar';
                });
        });
    }

    // Salir de Modo Cine y Fullscreen con tecla Escape o cambio de fullscreen
    // (fuera del if(btnJellyfinSync) para garantizar que siempre se registran)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cinemaOverlay && cinemaOverlay.style.display === 'flex') {
            closeCinemaMode();
        }
    });

    document.addEventListener('fullscreenchange', () => {
        // Usar closeCinemaMode() para limpiar overflow y pausar vídeos correctamente
        if (!document.fullscreenElement && cinemaOverlay && cinemaOverlay.style.display === 'flex') {
            closeCinemaMode();
        }
    });

// ==========================================================================
    // 📻 MOTOR DESCUBRIDOR DE ÉXITOS DE ESPAÑA & RADAR EN VIVO
    // ==========================================================================

    const retroState = {
        mode: 'timeline', // 'timeline' o 'radar'
        selectedYear: null,
        filter: 'missing', // 'missing', 'all', 'owned'
        cachedCatalog: null,
        previewAudio: new Audio(),
        currentPreviewTrack: null
    };

    retroState.previewAudio.addEventListener('ended', () => {
        retroState.currentPreviewTrack = null;
        updatePreviewButtonsUi();
    });

    retroState.previewAudio.addEventListener('pause', () => {
        retroState.currentPreviewTrack = null;
        updatePreviewButtonsUi();
    });

    function updatePreviewButtonsUi() {
        document.querySelectorAll('.btn-retro-preview').forEach(btn => {
            const trackKey = btn.getAttribute('data-track-key');
            if (retroState.currentPreviewTrack === trackKey) {
                btn.classList.add('playing');
                btn.innerHTML = '<i class="fa-solid fa-pause"></i> Pausar';
            } else {
                btn.classList.remove('playing');
                btn.innerHTML = '<i class="fa-solid fa-play"></i> Escuchar';
            }
        });
    }

    async function toggleRetroPreview(artist, title, btnEl) {
        const trackKey = `${artist} - ${title}`;

        // Si ya está sonando esta misma, pausar
        if (retroState.currentPreviewTrack === trackKey && !retroState.previewAudio.paused) {
            retroState.previewAudio.pause();
            retroState.currentPreviewTrack = null;
            updatePreviewButtonsUi();
            return;
        }

        // Si hay música principal o radio sonando, pausarla
        if (mainMusicAudio && !mainMusicAudio.paused) mainMusicAudio.pause();
        if (liveRadioAudio && !liveRadioAudio.paused) liveRadioAudio.pause();

        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';

        try {
            const res = await fetch(`/api/retro-hits/preview?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
            if (!res.ok) throw new Error('Error buscando preescucha');
            const data = await res.json();

            if (data.previewUrl) {
                retroState.previewAudio.src = data.previewUrl;
                retroState.previewAudio.volume = 0.9;
                await retroState.previewAudio.play();
                retroState.currentPreviewTrack = trackKey;
                updatePreviewButtonsUi();
            } else {
                alert(`No se encontró fragmento de audio para "${title}".`);
                updatePreviewButtonsUi();
            }
        } catch(e) {
            console.error('Error en preescucha:', e);
            alert('No se pudo reproducir la preescucha.');
            updatePreviewButtonsUi();
        }
    }

    async function downloadRetroHit(artist, title, cardEl, btnEl) {
        const origHtml = btnEl.innerHTML;
        btnEl.classList.add('loading');
        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Descargando versión oficial...';

        try {
            const res = await fetch('/api/retro-hits/add-to-viejuna', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artist, title })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                // Actualizar tarjeta a "En tu colección"
                cardEl.classList.add('owned');
                const actionsBox = cardEl.querySelector('.retro-card-actions');
                if (actionsBox) {
                    actionsBox.innerHTML = `
                        <span class="badge-owned-tag"><i class="fa-solid fa-check-circle"></i> ¡En tu colección!</span>
                        <button class="btn-retro-preview" data-track-key="${artist} - ${title}">
                            <i class="fa-solid fa-play"></i> Escuchar
                        </button>
                    `;
                    const prevBtn = actionsBox.querySelector('.btn-retro-preview');
                    if (prevBtn) {
                        prevBtn.addEventListener('click', () => toggleRetroPreview(artist, title, prevBtn));
                    }
                }

                // Notificación visual
                showToastNotification(`🎉 "${title}" añadida con éxito a Música viejuna`);

                // Recargar playlists en background para sincronizar
                fetchPlaylists();
            } else {
                alert('No se pudo descargar la pista: ' + (data.error || 'Error desconocido'));
                btnEl.classList.remove('loading');
                btnEl.innerHTML = origHtml;
            }
        } catch(e) {
            console.error('Error descargando hit:', e);
            alert('Error de conexión al descargar la pista.');
            btnEl.classList.remove('loading');
            btnEl.innerHTML = origHtml;
        }
    }

    function showToastNotification(msg) {
        let toast = document.getElementById('retro-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'retro-toast';
            toast.style.cssText = 'position:fixed;bottom:90px;right:24px;background:#10b981;color:#fff;padding:14px 20px;border-radius:12px;font-weight:700;font-size:0.92rem;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;gap:10px;transition:all 0.3s ease;transform:translateY(100px);opacity:0;';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<i class="fa-solid fa-circle-check" style="font-size:1.2rem;"></i> ${msg}`;
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
        }, 4000);
    }

    async function renderRetroHitsView() {
        currentSectionTitle.innerHTML = '<i class="fa-solid fa-trophy" style="color: #f59e0b;"></i> Éxitos en España (1970–1999)';
        resultsCountText.textContent = 'Cargando archivo histórico de España...';
        songsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#f59e0b;margin-bottom:16px;"></i><p>Sincronizando con Los 40 Principales y ventas de España...</p></div>';

        try {
            const res = await fetch('/api/retro-hits/catalog');
            if (!res.ok) throw new Error('Error cargando catálogo');
            const data = await res.json();
            retroState.cachedCatalog = data;

            resultsCountText.textContent = `${data.summary.totalHits} grandes éxitos contrastados en España`;

            // Construir vista interactiva
            songsGrid.className = 'songs-grid';
            songsGrid.innerHTML = '';

            const wrapper = document.createElement('div');
            wrapper.style.gridColumn = '1 / -1';

            // 1. Banner Superior con Estadísticas
            const summary = data.summary;
            const bannerHtml = `
                <div class="retro-banner">
                    <div class="retro-banner-top">
                        <div class="retro-banner-title">
                            <i class="fa-solid fa-trophy"></i>
                            <span>Descubridor de Éxitos en España (Viejuna)</span>
                        </div>
                        <div class="radar-live-indicator">
                            <div class="radar-live-dot"></div>
                            <span>Canon Los 40 & AFYVE España</span>
                        </div>
                    </div>
                    <div class="retro-banner-desc">
                        Colección exhaustiva de los mayores éxitos internacionales que triunfaron en las radios y discotecas de España entre 1970 y 1999, contrastados con tu colección actual.
                    </div>
                    <div class="retro-progress-container">
                        <div class="retro-progress-labels">
                            <span style="color: #fff;"><i class="fa-solid fa-chart-pie" style="color: #f59e0b; margin-right: 6px;"></i> Progreso de tu colección de Viejuna:</span>
                            <span style="color: #34d399;">${summary.totalOwned} de ${summary.totalHits} conseguidos (${summary.globalPercentage}%) • ${summary.totalMissing} por descubrir</span>
                        </div>
                        <div class="retro-progress-track">
                            <div class="retro-progress-fill" style="width: ${summary.globalPercentage}%;"></div>
                        </div>
                    </div>
                </div>

                <!-- Selector de Modo: Archivo Histórico vs Radar en Vivo -->
                <div class="retro-view-switch">
                    <button class="retro-switch-btn ${retroState.mode === 'timeline' ? 'active' : ''}" id="btn-mode-timeline">
                        <i class="fa-solid fa-calendar-days"></i> Archivo por Años (1970-1999)
                    </button>
                    <button class="retro-switch-btn ${retroState.mode === 'radar' ? 'active' : ''}" id="btn-mode-radar">
                        <i class="fa-solid fa-tower-broadcast"></i> Radar de Emisoras (Los 40 Classic)
                    </button>
                </div>
            `;

            wrapper.innerHTML = bannerHtml;
            songsGrid.appendChild(wrapper);

            // Listeners de los botones de modo
            document.getElementById('btn-mode-timeline').addEventListener('click', () => {
                retroState.mode = 'timeline';
                renderRetroHitsView();
            });
            document.getElementById('btn-mode-radar').addEventListener('click', () => {
                retroState.mode = 'radar';
                renderRetroRadarView();
            });

            if (retroState.mode === 'timeline') {
                renderTimelineContent(data, wrapper);
            }

        } catch(e) {
            console.error('Error renderizando éxitos España:', e);
            songsGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;"><i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;margin-bottom:12px;"></i><p>Error cargando éxitos de España: ${e.message}</p></div>`;
        }
    }

    function renderTimelineContent(data, container) {
        // Scroller horizontal de Años
        const yearsBox = document.createElement('div');
        yearsBox.className = 'retro-years-scroller';

        // Opción: Todos los años
        const allYearsChip = document.createElement('div');
        allYearsChip.className = retroState.selectedYear === null ? 'retro-year-chip active' : 'retro-year-chip';
        allYearsChip.innerHTML = `<span>Todos</span><span class="retro-year-pct">${data.summary.globalPercentage}%</span>`;
        allYearsChip.addEventListener('click', () => {
            retroState.selectedYear = null;
            renderRetroHitsView();
        });
        yearsBox.appendChild(allYearsChip);

        // Años individuales
        data.yearsStats.forEach(stat => {
            const chip = document.createElement('div');
            chip.className = retroState.selectedYear === stat.year ? 'retro-year-chip active' : 'retro-year-chip';
            chip.innerHTML = `<span>${stat.year}</span><span class="retro-year-pct">${stat.percentage}%</span>`;
            chip.title = `${stat.year}: ${stat.owned} de ${stat.total} en tu colección (${stat.missing} faltantes)`;
            chip.addEventListener('click', () => {
                retroState.selectedYear = stat.year;
                renderRetroHitsView();
            });
            yearsBox.appendChild(chip);
        });

        container.appendChild(yearsBox);

        // Barra de Filtro de Estado (Faltantes / Todos / Colección)
        const filterBar = document.createElement('div');
        filterBar.style.cssText = 'display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center;';

        const filterPills = [
            { id: 'missing', label: `Solo las que me faltan (${data.summary.totalMissing})`, icon: 'fa-star' },
            { id: 'all', label: `Todos los éxitos (${data.summary.totalHits})`, icon: 'fa-list' },
            { id: 'owned', label: `En mi colección (${data.summary.totalOwned})`, icon: 'fa-check' }
        ];

        filterPills.forEach(p => {
            const b = document.createElement('button');
            b.className = retroState.filter === p.id ? 'retro-switch-btn active' : 'retro-switch-btn';
            b.style.fontSize = '0.8rem';
            b.style.padding = '6px 14px';
            b.innerHTML = `<i class="fa-solid ${p.icon}"></i> ${p.label}`;
            b.addEventListener('click', () => {
                retroState.filter = p.id;
                renderRetroHitsView();
            });
            filterBar.appendChild(b);
        });

        container.appendChild(filterBar);

        // Filtrar hits a mostrar
        let displayHits = data.hits;
        if (retroState.selectedYear) {
            displayHits = displayHits.filter(h => h.year === retroState.selectedYear);
        }
        if (retroState.filter === 'missing') {
            displayHits = displayHits.filter(h => !h.isOwned);
        } else if (retroState.filter === 'owned') {
            displayHits = displayHits.filter(h => h.isOwned);
        }

        // Filtro de texto rápido si hay búsqueda
        if (quickFilterQuery && quickFilterQuery.trim().length > 0) {
            const q = quickFilterQuery.toLowerCase();
            displayHits = displayHits.filter(h => 
                (h.title || '').toLowerCase().includes(q) || 
                (h.artist || '').toLowerCase().includes(q) ||
                (h.peak || '').toLowerCase().includes(q)
            );
        }

        // Renderizar cuadrícula de tarjetas
        const gridBox = document.createElement('div');
        gridBox.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:16px;';

        if (displayHits.length === 0) {
            gridBox.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-trophy" style="font-size: 2.8rem; color: #f59e0b; opacity: 0.4; margin-bottom: 12px;"></i>
                    <p style="font-size: 1.1rem; font-weight: 600;">¡Genial! Tienes todos los éxitos seleccionados en tu colección.</p>
                </div>
            `;
        } else {
            displayHits.forEach(hit => {
                const card = document.createElement('div');
                card.className = hit.isOwned ? 'retro-card owned' : 'retro-card';

                const trackKey = `${hit.artist} - ${hit.title}`;

                card.innerHTML = `
                    <div class="retro-card-header">
                        <div class="retro-cover-box">
                            <i class="fa-solid fa-record-vinyl retro-cover-icon"></i>
                        </div>
                        <div class="retro-info">
                            <div class="retro-title" title="${hit.title}">${hit.title}</div>
                            <div class="retro-artist" title="${hit.artist}">${hit.artist}</div>
                            <div class="retro-meta-row">
                                <span class="retro-badge-peak"><i class="fa-solid fa-crown"></i> ${hit.peak}</span>
                                <span class="retro-badge-year">${hit.year}</span>
                            </div>
                        </div>
                    </div>
                    <div class="retro-card-actions">
                        ${hit.isOwned 
                            ? '<span class="badge-owned-tag"><i class="fa-solid fa-check-circle"></i> En tu colección</span>' 
                            : `<button class="btn-retro-add" id="btn-add-${hit.year}">
                                   <i class="fa-solid fa-cloud-arrow-down"></i> Añadir a Viejuna
                               </button>`
                        }
                        <button class="btn-retro-preview" data-track-key="${trackKey}">
                            <i class="fa-solid fa-play"></i> Escuchar
                        </button>
                    </div>
                `;

                // Listener de preescucha
                const previewBtn = card.querySelector('.btn-retro-preview');
                if (previewBtn) {
                    previewBtn.addEventListener('click', () => {
                        toggleRetroPreview(hit.artist, hit.title, previewBtn);
                    });
                }

                // Listener de descarga
                const addBtn = card.querySelector('.btn-retro-add');
                if (addBtn) {
                    addBtn.addEventListener('click', () => {
                        downloadRetroHit(hit.artist, hit.title, card, addBtn);
                    });
                }

                gridBox.appendChild(card);
            });
        }

        container.appendChild(gridBox);
    }

    async function renderRetroRadarView() {
        const wrapper = document.querySelector('.retro-banner')?.parentNode;
        if (!wrapper) return;

        // Limpiar contenido posterior a botones de modo
        const switchBox = wrapper.querySelector('.retro-view-switch');
        while (switchBox && switchBox.nextSibling) {
            wrapper.removeChild(switchBox.nextSibling);
        }

        const radarContainer = document.createElement('div');
        radarContainer.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
                <div>
                    <h3 style="color:#fff;font-size:1.15rem;font-weight:700;display:flex;align-items:center;gap:8px;">
                        <i class="fa-solid fa-tower-broadcast" style="color:#f59e0b;"></i>
                        Emisión en Vivo: Los 40 Classic
                    </h3>
                    <p style="color:var(--text-muted);font-size:0.86rem;margin-top:2px;">
                        Canciones que están pinchando en antena ahora mismo, contrastadas con tu lista de Música viejuna.
                    </p>
                </div>
                <button class="retro-switch-btn" id="btn-refresh-radar" style="font-size:0.82rem;padding:6px 14px;">
                    <i class="fa-solid fa-rotate-right"></i> Actualizar Emisión
                </button>
            </div>
            <div id="radar-tracks-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:16px;">
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;color:#f59e0b;margin-bottom:12px;"></i>
                    <p>Capturando emisión en directo...</p>
                </div>
            </div>
        `;

        wrapper.appendChild(radarContainer);

        document.getElementById('btn-refresh-radar')?.addEventListener('click', renderRetroRadarView);

        try {
            const res = await fetch('/api/retro-hits/radio-radar');
            if (!res.ok) throw new Error('Error consultando radar');
            const data = await res.json();

            const grid = document.getElementById('radar-tracks-grid');
            if (!grid) return;
            grid.innerHTML = '';

            if (!data.tracks || data.tracks.length === 0) {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);"><p>No se encontraron canciones activas en la emisión en este momento.</p></div>';
                return;
            }

            data.tracks.forEach(track => {
                const card = document.createElement('div');
                card.className = track.isOwned ? 'retro-card owned' : 'retro-card';

                const coverHtml = track.coverUrl 
                    ? `<img src="${track.coverUrl}" class="retro-cover-img" onerror="this.style.display='none';">`
                    : '<i class="fa-solid fa-record-vinyl retro-cover-icon"></i>';

                const trackKey = `${track.artist} - ${track.title}`;

                card.innerHTML = `
                    <div class="retro-card-header">
                        <div class="retro-cover-box">
                            ${coverHtml}
                        </div>
                        <div class="retro-info">
                            <div class="retro-title" title="${track.title}">${track.title}</div>
                            <div class="retro-artist" title="${track.artist}">${track.artist}</div>
                            <div class="retro-meta-row">
                                <span class="retro-badge-peak" style="border-color:#38bdf8;color:#38bdf8;background:rgba(56,189,248,0.12);">
                                    <i class="fa-solid fa-radio"></i> Los 40 Classic
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="retro-card-actions">
                        ${track.isOwned 
                            ? '<span class="badge-owned-tag"><i class="fa-solid fa-check-circle"></i> En tu colección</span>' 
                            : `<button class="btn-retro-add">
                                   <i class="fa-solid fa-cloud-arrow-down"></i> Añadir a Viejuna
                               </button>`
                        }
                        <button class="btn-retro-preview" data-track-key="${trackKey}">
                            <i class="fa-solid fa-play"></i> Escuchar
                        </button>
                    </div>
                `;

                const prevBtn = card.querySelector('.btn-retro-preview');
                if (prevBtn) {
                    prevBtn.addEventListener('click', () => {
                        toggleRetroPreview(track.artist, track.title, prevBtn);
                    });
                }

                const addBtn = card.querySelector('.btn-retro-add');
                if (addBtn) {
                    addBtn.addEventListener('click', () => {
                        downloadRetroHit(track.artist, track.title, card, addBtn);
                    });
                }

                grid.appendChild(card);
            });
        } catch(e) {
            console.error('Error cargando radar:', e);
            const grid = document.getElementById('radar-tracks-grid');
            if (grid) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:#ef4444;"><p>Error de conexión con la radio: ${e.message}</p></div>`;
        }
    }
});


    