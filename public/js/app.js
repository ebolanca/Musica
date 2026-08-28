document.addEventListener('DOMContentLoaded', () => {
    let allPlaylists = {};
    let currentTab = 'Música viejuna';
    let searchQuery = '';

    // Elementos DOM
    const songsGrid = document.getElementById('songs-grid');
    const searchInput = document.getElementById('search-input');
    const currentSectionTitle = document.getElementById('current-section-title');
    const resultsCountText = document.getElementById('results-count-text');
    const btnJellyfinSync = document.getElementById('btn-jellyfin-sync');
    const songModal = document.getElementById('song-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');

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
    }

    function renderSongs() {
        const tracks = allPlaylists[currentTab] || [];
        const filtered = tracks.filter(t => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return t.artist.toLowerCase().includes(q) || t.title.toLowerCase().includes(q);
        });

        currentSectionTitle.innerHTML = `<i class="fa-solid fa-compact-disc" style="color: var(--spotify-green);"></i> ${currentTab}`;
        resultsCountText.textContent = `${filtered.length} canciones encontradas`;

        songsGrid.innerHTML = '';
        if (filtered.length === 0) {
            songsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-compact-disc" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p>No se encontraron canciones en la categoría "${currentTab}".</p>
                </div>
            `;
            return;
        }

        filtered.forEach(song => {
            const card = document.createElement('div');
            card.className = 'song-card';
            card.innerHTML = `
                <div class="card-cover">
                    <i class="fa-solid fa-record-vinyl music-icon"></i>
                    <div class="play-overlay">
                        <div class="play-button-icon">
                            <i class="fa-solid fa-play"></i>
                        </div>
                    </div>
                </div>
                <div class="song-info">
                    <div class="song-title" title="${song.title}">${song.title}</div>
                    <div class="song-artist" title="${song.artist}">${song.artist}</div>
                    <div class="card-badges">
                        ${song.hasVideo ? '<span class="badge badge-video"><i class="fa-solid fa-video"></i> Video</span>' : ''}
                        ${song.hasLyrics ? '<span class="badge badge-lyrics"><i class="fa-solid fa-file-lines"></i> Subtítulo .srt</span>' : ''}
                        ${song.hasAnalysis ? '<span class="badge badge-analysis"><i class="fa-solid fa-microscope"></i> 4 Puntos</span>' : ''}
                    </div>
                </div>
            `;

            card.addEventListener('click', () => openSongModal(song));
            songsGrid.appendChild(card);
        });
    }

    // Eventos de Pestañas
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab');
            renderSongs();
        });
    });

    // Búsqueda en vivo
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
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
    function openSongModal(song) {
        document.getElementById('modal-title-text').textContent = song.title;
        document.getElementById('modal-artist-text').textContent = song.artist;

        // Resetear pestañas del modal a la primera
        document.querySelectorAll('.modal-nav-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-modal-tab="tab-credits"]').classList.add('active');
        document.getElementById('tab-credits').classList.add('active');

        songModal.classList.add('active');

        // Consultar API de detalle
        fetch(`/api/track/detail?artist=${encodeURIComponent(song.artist)}&title=${encodeURIComponent(song.title)}`)
            .then(res => res.json())
            .then(detail => {
                populateCredits(detail);
                populateLyrics(detail.lyrics);
                populateAnalysis(detail.analysis);
                populateVideo(detail);
            })
            .catch(err => console.error("Error cargando detalle:", err));
    }

    function populateCredits(detail) {
        document.getElementById('credit-year').textContent = detail.year || '-';
        document.getElementById('credit-album').textContent = detail.album || '-';
        document.getElementById('credit-label-text').textContent = detail.label || '-';
        document.getElementById('credit-composers').textContent = (detail.composers || []).join(', ') || '-';
    }

    function populateLyrics(lyrics) {
        const container = document.getElementById('lyrics-content-list');
        container.innerHTML = '';

        if (!lyrics || lyrics.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No hay letras sincronizadas disponibles.</p>';
            return;
        }

        lyrics.forEach(item => {
            const line = document.createElement('div');
            line.className = 'lyrics-line';
            line.innerHTML = `
                <span class="lyrics-time">${item.time}</span>
                <span class="lyrics-text">${item.text}</span>
            `;
            container.appendChild(line);
        });
    }

    function populateAnalysis(analysis) {
        if (!analysis) return;

        document.getElementById('analysis-synopsis-text').textContent = analysis.synopsis || '';
        document.getElementById('analysis-origin-text').textContent = analysis.origin_story || '';

        // Sección 1: Anatomía Musical
        document.getElementById('sec1-title').textContent = analysis.section1_title || '1. La Anatomía Musical';
        document.getElementById('sec1-text').textContent = analysis.section1_text || '';
        renderPoints('sec1-points-container', analysis.section1_points);

        // Sección 2: Análisis Lírico
        document.getElementById('sec2-title').textContent = analysis.section2_title || '2. El Análisis Lírico';
        document.getElementById('sec2-text').textContent = analysis.section2_text || '';
        renderPoints('sec2-points-container', analysis.section2_points, true);

        // Sección 3: Videoclip
        document.getElementById('sec3-title').textContent = analysis.section3_title || '3. El Videoclip & Estética';
        document.getElementById('sec3-text').textContent = analysis.section3_text || '';
        renderPoints('sec3-points-container', analysis.section3_points);

        // Sección 4: Impacto Cultural
        document.getElementById('sec4-title').textContent = analysis.section4_title || '4. El Impacto Cultural & Legado';
        document.getElementById('sec4-text').textContent = analysis.section4_text || '';
        renderPoints('sec4-points-container', analysis.section4_points);
    }

    function renderPoints(containerId, points, isLyrical = false) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        if (!points || points.length === 0) return;

        points.forEach(p => {
            const div = document.createElement('div');
            div.className = 'analysis-point';
            
            let html = `<div class="analysis-point-name">${p.name}</div>`;
            if (p.quote) {
                html += `<div class="analysis-quote">"${p.quote}"</div>`;
            }
            if (p.vocab) {
                html += `<div class="analysis-vocab"><i class="fa-solid fa-book-bookmark"></i> <strong>Desglose / Vocabulario:</strong> ${p.vocab}</div>`;
            }
            if (p.analysis) {
                html += `<div class="analysis-desc">${p.analysis}</div>`;
            } else if (p.desc) {
                html += `<div class="analysis-desc">${p.desc}</div>`;
            }

            div.innerHTML = html;
            container.appendChild(div);
        });
    }

    function populateVideo(detail) {
        const container = document.getElementById('video-container');
        container.innerHTML = '';

        if (detail.videoUrl) {
            container.innerHTML = `
                <video controls autoplay style="width: 100%; border-radius: var(--radius-md);">
                    <source src="${detail.videoUrl}" type="video/mp4">
                    Tu navegador no soporta reproducción de vídeo HTML5.
                </video>
            `;
        } else {
            container.innerHTML = `
                <div style="text-align: center; padding: 50px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-video-slash" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.4;"></i>
                    <p>No hay archivo de vídeo local (.mp4) disponible para esta canción.</p>
                    <p style="font-size: 0.85rem; margin-top: 8px;">Ubicación de videoclips: <code>\\\\100.95.217.45\\omen D\\media-library\\music-videos</code></p>
                </div>
            `;
        }
    }

    // Cerrar Modal
    btnCloseModal.addEventListener('click', () => songModal.classList.remove('active'));
    songModal.addEventListener('click', (e) => {
        if (e.target === songModal) songModal.classList.remove('active');
    });

    // Refrescar Jellyfin
    btnJellyfinSync.addEventListener('click', () => {
        btnJellyfinSync.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refrescando...';
        fetch('/api/jellyfin/refresh', { method: 'POST' })
            .then(res => res.json())
            .then(res => {
                btnJellyfinSync.innerHTML = '<i class="fa-solid fa-check"></i> Refrescado!';
                setTimeout(() => {
                    btnJellyfinSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Refrescar Jellyfin';
                }, 3000);
            })
            .catch(err => {
                btnJellyfinSync.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Error';
                setTimeout(() => {
                    btnJellyfinSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Refrescar Jellyfin';
                }, 3000);
            });
    });
});
