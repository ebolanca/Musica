
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

document.addEventListener('DOMContentLoaded', () => {
    let allPlaylists = {};
    let currentTab = 'Música viejuna';
    let searchQuery = '';
    let quickFilterQuery = '';
    let sortBy = 'title';
    let sortAsc = true;
    let viewMode = 'grid';

    // Elementos DOM
    const songsGrid = document.getElementById('songs-grid');
    const searchInput = document.getElementById('search-input');
    const currentSectionTitle = document.getElementById('current-section-title');
    const resultsCountText = document.getElementById('results-count-text');
    const btnJellyfinSync = document.getElementById('btn-jellyfin-sync');
    const songModal = document.getElementById('song-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');

    const sortSelect = document.getElementById('sort-select');
    const btnSortDir = document.getElementById('btn-sort-dir');
    const sortDirIcon = document.getElementById('sort-dir-icon');
    const btnViewGrid = document.getElementById('btn-view-grid');
    const btnViewList = document.getElementById('btn-view-list');
    const quickFilterInput = document.getElementById('quick-filter-input');

    // Cargar datos iniciales
    fetchPlaylists();

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
        if (rBadge && typeof radioStations !== 'undefined') {
            rBadge.textContent = radioStations.length;
        }
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

    const playlistIcons = {
        'Música viejuna': 'fa-radio',
        'Siglo XXI': 'fa-rocket',
        'Dance': 'fa-headphones',
        'Española': 'fa-guitar',
        'Música latina': 'fa-fire'
    };

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

    
    // Catálogo de Emisoras de Radio Musicales de España (Hit FM la primera)
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

    let currentPlayingRadio = null;
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

    function playRadioStation(station) {
        if (!liveRadioAudio) return;
        
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
            if (isPlaying) {
                radioWaves.classList.add('playing');
            } else {
                radioWaves.classList.remove('playing');
            }
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
            radioPlayerBar.style.display = 'none';
            renderRadioStations();
        });
    }

    
    let activeQuickPill = 'all';
    const quickPillsBar = document.getElementById('quick-pills-bar');

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
            { id: 'video', label: 'Con Videoclip', icon: 'fa-clapperboard' },
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
        if (activeQuickPill === 'video') return track.hasVideo === true;
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


    let nowPlayingPollInterval = null;

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

            // Card click listener
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-radio-web')) {
                    // Let link open in new tab
                    return;
                }
                playRadioStation(st);
            });

            songsGrid.appendChild(card);
        });
    }

    function renderSongs() {
        if (currentTab === 'Radio') {
            renderRadioStations();
            return;
        }

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
            card.className = 'song-card';

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
                            <div class="play-button-icon">
                                <i class="fa-solid fa-play"></i>
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
                        <div class="card-action-icons" style="margin-top: 0; padding-top: 0; display: flex; width: auto; gap: 8px;">
                            <button class="btn-card-action btn-act-credits" title="Ver Créditos" data-action="credits">
                                <i class="fa-solid fa-circle-info"></i>
                            </button>
                            <button class="btn-card-action btn-act-lyrics" title="Ver Letra" data-action="lyrics">
                                <i class="fa-solid fa-microphone"></i>
                            </button>
                            <button class="btn-card-action btn-act-analysis" title="Ver Análisis Sónico" data-action="analysis">
                                <i class="fa-solid fa-microscope"></i>
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
                    if (action === 'analysis') {
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
            currentTab = btn.getAttribute('data-tab'); activeQuickPill = 'all'; quickFilterQuery = ''; if(quickFilterInput) quickFilterInput.value = ''; renderQuickPills();
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
                populateAnalysisTab(detail);
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
                    <i class="fa-solid fa-record-vinyl"></i>
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

    let showLyricsTranslation = true;

    function populateLyricsTab(detail) {
        const tabContainer = document.getElementById('tab-lyrics');
        const lyrics = detail && detail.lyrics ? detail.lyrics : [];

        if (!lyrics || lyrics.length === 0) {
            tabContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-microphone-slash" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.4;"></i>
                    <p>Letra no encontrada en los servidores para esta canción.</p>
                </div>
            `;
            return;
        }

        const linesHtml = lyrics.map(l => {
            const hasTime = !!l.time;
            const timeSpan = hasTime ? `<span class="lyrics-timestamp">${l.time}</span>` : '';
            const transDiv = (l.translation && l.translation.trim().toLowerCase() !== l.text.trim().toLowerCase())
                ? `<div class="lyrics-row-trans">${escapeHtml(l.translation)}</div>`
                : '';

            return `
                <div class="lyrics-row">
                    <div class="lyrics-row-orig">
                        ${timeSpan}
                        <span class="lyrics-orig-text">${escapeHtml(l.text)}</span>
                    </div>
                    ${transDiv}
                </div>
            `;
        }).join('');

        tabContainer.innerHTML = `
            <div class="lyrics-toolbar">
                <div class="lyrics-toolbar-badge">
                    <i class="fa-solid fa-microphone" style="color: var(--accent-purple);"></i>
                    <span>Letra ${lyrics[0] && lyrics[0].time ? 'Sincronizada' : 'Completa'}</span>
                </div>
                <button class="btn-toggle-translation" id="btn-toggle-translation" title="Mostrar/Ocultar traducción al español">
                    <i class="fa-solid fa-language"></i>
                    <span id="txt-trans-toggle">${showLyricsTranslation ? 'Ocultar Traducción' : 'Mostrar Traducción'}</span>
                </button>
            </div>
            <div class="lyrics-container ${showLyricsTranslation ? '' : 'hide-translation'}" id="lyrics-content-list" style="max-height: 480px; overflow-y: auto; padding: 10px;">
                ${linesHtml}
            </div>
        `;

        const btnToggle = document.getElementById('btn-toggle-translation');
        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                showLyricsTranslation = !showLyricsTranslation;
                const list = document.getElementById('lyrics-content-list');
                const txt = document.getElementById('txt-trans-toggle');
                if (showLyricsTranslation) {
                    list.classList.remove('hide-translation');
                    txt.textContent = 'Ocultar Traducción';
                } else {
                    list.classList.add('hide-translation');
                    txt.textContent = 'Mostrar Traducción';
                }
            });
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderPointsList(points) {
        if (!Array.isArray(points) || points.length === 0) return '';
        let out = '<div class="analysis-points-list" style="display: flex; flex-direction: column; gap: 12px; margin-top: 14px;">';
        for (const p of points) {
            if (!p.name && !p.desc && !p.quote && !p.analysis) continue;
            out += `
                <div class="analysis-point-card" style="background: rgba(255,255,255,0.03); border-left: 3px solid var(--accent-amber); padding: 14px 16px; border-radius: 8px;">
                    ${p.name ? `<div style="font-weight: 700; color: #f8fafc; margin-bottom: 6px; font-size: 0.98rem;"><i class="fa-solid fa-angle-right" style="color: var(--accent-amber); font-size: 0.85rem; margin-right: 6px;"></i>${escapeHtml(p.name)}</div>` : ''}
                    ${p.quote ? `<div style="font-style: italic; color: #93c5fd; margin-bottom: 8px; font-size: 0.92rem; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 6px;">"${escapeHtml(p.quote)}"</div>` : ''}
                    ${p.vocab ? `<div style="color: #fbbf24; font-size: 0.88rem; margin-bottom: 6px; font-weight: 500;">💡 ${escapeHtml(p.vocab)}</div>` : ''}
                    ${p.analysis ? `<div style="color: #cbd5e1; font-size: 0.93rem; line-height: 1.6;">${escapeHtml(p.analysis)}</div>` : ''}
                    ${p.desc ? `<div style="color: #cbd5e1; font-size: 0.93rem; line-height: 1.6;">${escapeHtml(p.desc)}</div>` : ''}
                </div>
            `;
        }
        out += '</div>';
        return out;
    }

    function populateAnalysisTab(detail) {
        const tabContainer = document.getElementById('tab-microscope');
        if (!detail.analysis) {
            tabContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-microscope" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.4;"></i>
                    <p>Análisis sónico no disponible para este tema.</p>
                </div>
            `;
            return;
        }

        const a = detail.analysis;
        let html = '<div class="analysis-box" style="padding: 10px;">';

        // 1. Sinopsis / Contexto General
        if (a.synopsis) {
            html += `
                <div class="analysis-synopsis-card" style="background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,78,59,0.2)); border-left: 4px solid var(--spotify-green); padding: 18px 22px; border-radius: 12px; margin-bottom: 24px;">
                    <p style="margin: 0; color: #f1f5f9; font-size: 1.02rem; line-height: 1.65;">${escapeHtml(a.synopsis)}</p>
                </div>
            `;
        }

        // 2. Historia / Origen (si existe)
        if (a.origin_story) {
            html += `
                <div class="analysis-section" style="margin-bottom: 24px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 12px; padding: 22px;">
                    <h3 style="color: var(--accent-amber); font-size: 1.15rem; margin-bottom: 12px; display: flex; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-book-open"></i> El Origen e Intrahistoria
                    </h3>
                    <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.65; white-space: pre-line; margin: 0;">${escapeHtml(a.origin_story)}</p>
                </div>
            `;
        }

        // 3. Secciones dinámicas y modulares (SÓLO se renderizan las que tienen contenido)
        if (Array.isArray(a.sections) && a.sections.length > 0) {
            for (const sec of a.sections) {
                const hasText = sec.text && sec.text.trim();
                const hasPoints = Array.isArray(sec.points) && sec.points.length > 0;
                if (!hasText && !hasPoints) continue; // Omitir secciones vacías

                const icon = sec.icon || 'fa-compact-disc';
                html += `
                    <div class="analysis-section" style="margin-bottom: 24px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 12px; padding: 22px;">
                        <h3 style="color: var(--accent-amber); font-size: 1.15rem; margin-bottom: 12px; display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid ${icon}"></i> ${escapeHtml(sec.title)}
                        </h3>
                        ${hasText ? `<p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.65; white-space: pre-line; margin-bottom: 12px;">${escapeHtml(sec.text)}</p>` : ''}
                        ${renderPointsList(sec.points)}
                    </div>
                `;
            }
        } else {
            // Retrocompatibilidad con formato antiguo (omitiendo automáticamente los campos vacíos)
            const legacySections = [
                { title: a.section1_title || '1. La Anatomía Musical', text: a.section1_text, points: a.section1_points, icon: 'fa-drum' },
                { title: a.section2_title || '2. El Análisis Lírico', text: a.section2_text, points: a.section2_points, icon: 'fa-quote-left' },
                { title: a.section3_title || '3. El Videoclip & Estética', text: a.section3_text, points: a.section3_points, icon: 'fa-clapperboard' },
                { title: a.section4_title || '4. El Impacto Cultural & Legado', text: a.section4_text, points: a.section4_points, icon: 'fa-trophy' },
                { title: a.section5_title || '5. Curiosidades & Anecdotario', text: a.section5_text, points: a.section5_points, icon: 'fa-lightbulb' }
            ];

            for (const sec of legacySections) {
                const hasText = sec.text && sec.text.trim();
                const hasPoints = Array.isArray(sec.points) && sec.points.length > 0;
                if (!hasText && !hasPoints) continue; // Si no hay nada que decir, NO se muestra

                html += `
                    <div class="analysis-section" style="margin-bottom: 24px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 12px; padding: 22px;">
                        <h3 style="color: var(--accent-amber); font-size: 1.15rem; margin-bottom: 12px; display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid ${sec.icon}"></i> ${escapeHtml(sec.title)}
                        </h3>
                        ${hasText ? `<p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.65; white-space: pre-line; margin-bottom: 12px;">${escapeHtml(sec.text)}</p>` : ''}
                        ${renderPointsList(sec.points)}
                    </div>
                `;
            }
        }

        html += '</div>';
        tabContainer.innerHTML = html;
    }

    // Cerrar Modal
    btnCloseModal.addEventListener('click', () => {
        songModal.classList.remove('active');
    });

    songModal.addEventListener('click', (e) => {
        if (e.target === songModal) {
            songModal.classList.remove('active');
        }
    });

    // Sincronizar con Jellyfin
    btnJellyfinSync.addEventListener('click', () => {
        btnJellyfinSync.disabled = true;
        btnJellyfinSync.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refrescando...';

        fetch('/api/jellyfin/refresh', { method: 'POST' })
            .then(res => res.json())
            .then(res => {
                alert(res.message || 'Biblioteca de Jellyfin refrescada.');
                btnJellyfinSync.disabled = false;
                btnJellyfinSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Refrescar Jellyfin';
            })
            .catch(err => {
                alert('No se pudo conectar con el servidor Jellyfin.');
                btnJellyfinSync.disabled = false;
                btnJellyfinSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Refrescar Jellyfin';
            });
    });
});