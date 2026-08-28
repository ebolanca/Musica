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

    function renderSongs() {
        const tracks = allPlaylists[currentTab] || [];
        let filtered = tracks.filter(t => {
            const qGlobal = searchQuery.toLowerCase();
            const qQuick = quickFilterQuery.toLowerCase();
            const matchGlobal = !qGlobal || (t.artist || '').toLowerCase().includes(qGlobal) || (t.title || '').toLowerCase().includes(qGlobal) || (t.album || '').toLowerCase().includes(qGlobal);
            const matchQuick = !qQuick || (t.artist || '').toLowerCase().includes(qQuick) || (t.title || '').toLowerCase().includes(qQuick) || (t.album || '').toLowerCase().includes(qQuick);
            return matchGlobal && matchQuick;
        });

        filtered = sortTracks(filtered);

        currentSectionTitle.innerHTML = `<i class="fa-solid fa-compact-disc" style="color: var(--spotify-green);"></i> ${currentTab}`;
        resultsCountText.textContent = `${filtered.length} canciones encontradas`;

        songsGrid.className = viewMode === 'list' ? 'songs-grid view-list-mode' : 'songs-grid';
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

            const coverHtml = song.coverUrl 
                ? `<img src="${song.coverUrl}" alt="${song.album || song.title}" class="cover-img"  onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                   <i class="fa-solid fa-record-vinyl music-icon" style="display:none;"></i>`
                : `<i class="fa-solid fa-record-vinyl music-icon"></i>`;

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
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                            <div class="song-title" title="${song.title}">${song.title}</div>
                            <span class="badge-duration" title="Duración">⏱️ ${song.durationFmt || '03:30'}</span>
                        </div>
                        <div class="song-artist" title="${song.artist}">${song.artist}</div>
                        <div class="song-album-name" title="Álbum: ${song.album || 'Desconocido'}">${song.album || 'Álbum Desconocido'} (${song.releaseYear || '2000'})</div>
                        <div class="card-badges" style="margin-top: 8px;">
                            ${song.hasVideo ? '<span class="badge badge-video"><i class="fa-solid fa-video"></i> Video</span>' : ''}
                            ${song.hasLyrics ? '<span class="badge badge-lyrics"><i class="fa-solid fa-file-lines"></i> Subtítulo</span>' : ''}
                            ${song.hasAnalysis ? '<span class="badge badge-analysis"><i class="fa-solid fa-microscope"></i> 4 Puntos</span>' : ''}
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
                        </div>
                        <div class="song-album-info" title="${song.album || 'Álbum'}">
                            <i class="fa-solid fa-compact-disc"></i> ${song.album || 'Álbum Desconocido'}
                        </div>
                        <div class="song-year-info">
                            📅 ${song.releaseYear || '2000'}
                        </div>
                        <div class="song-year-info" style="width: 80px;">
                            ⏱️ ${song.durationFmt || '03:30'}
                        </div>
                        <div class="song-badges-list">
                            ${song.hasVideo ? '<span class="badge badge-video"><i class="fa-solid fa-video"></i> Video</span>' : ''}
                            ${song.hasLyrics ? '<span class="badge badge-lyrics"><i class="fa-solid fa-file-lines"></i> Subtítulo</span>' : ''}
                            ${song.hasAnalysis ? '<span class="badge badge-analysis"><i class="fa-solid fa-microscope"></i> 4 Puntos</span>' : ''}
                        </div>
                    </div>
                `;
            }

            card.addEventListener('click', () => openSongModal(song));
            songsGrid.appendChild(card);
        });
    }

    // Eventos de Pestañas
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab'); quickFilterQuery = ''; if(quickFilterInput) quickFilterInput.value = '';
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
    function openSongModal(song) {
        document.getElementById('modal-title-text').textContent = song.title;
        document.getElementById('modal-artist-text').textContent = song.artist;

        document.querySelectorAll('.modal-nav-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-modal-tab="tab-credits"]').classList.add('active');
        document.getElementById('tab-credits').classList.add('active');

        songModal.classList.add('active');

        fetch(`/api/track/detail?artist=${encodeURIComponent(song.artist)}&title=${encodeURIComponent(song.title)}`)
            .then(res => res.json())
            .then(detail => {
                populateCreditsTab(detail, song);
                populateLyricsTab(detail);
                populateAnalysisTab(detail);
                
            })
            .catch(err => {
                console.error('Error cargando detalle:', err);
            });
    }

        function populateCreditsTab(detail, song) {
        document.getElementById('tab-credits').innerHTML = `
            <div class="credits-grid" style="margin-top: 10px;">
                <div class="credit-card">
                    <i class="fa-solid fa-user-pen"></i>
                    <div class="credit-label">Compositor / Autor</div>
                    <div class="credit-value">${detail.composers || song.artist || 'Por determinar'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-compact-disc"></i>
                    <div class="credit-label">Álbum</div>
                    <div class="credit-value">${song.album || detail.album || 'Álbum Desconocido'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-calendar-day"></i>
                    <div class="credit-label">Año de Lanzamiento</div>
                    <div class="credit-value">${song.releaseYear || detail.releaseYear || '2000'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-clock"></i>
                    <div class="credit-label">Duración</div>
                    <div class="credit-value">${song.durationFmt || '03:30'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-record-vinyl"></i>
                    <div class="credit-label">Sello Discográfico</div>
                    <div class="credit-value">${detail.label || 'Discográfica Principal'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-music"></i>
                    <div class="credit-label">Género Musical</div>
                    <div class="credit-value">${detail.genre || 'Pop / Rock / Dance'}</div>
                </div>
            </div>
        `;
    }

            function populateLyricsTab(detail) {
        const tabContainer = document.getElementById('tab-lyrics');
        if (!detail.lyrics || detail.lyrics.length === 0) {
            tabContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-microphone-slash" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.4;"></i>
                    <p>Letra no encontrada en los servidores para esta canción.</p>
                </div>
            `;
            return;
        }

        const linesHtml = detail.lyrics.map(l => `
            <div class="lyric-line" style="margin-bottom: 10px; line-height: 1.5;">
                ${l.time ? `<span class="lyric-timestamp" style="color: var(--spotify-green); font-size: 0.85rem; font-weight: 600; margin-right: 12px;">${l.time}</span>` : ''}
                <span class="lyric-text" style="color: #e2e8f0; font-size: 1rem;">${l.text}</span>
            </div>
        `).join('');

        tabContainer.innerHTML = `<div class="lyrics-container" style="max-height: 480px; overflow-y: auto; padding: 10px;">${linesHtml}</div>`;
    }

    function populateAnalysisTab(detail) {
        const tabContainer = document.getElementById('tab-microscope');
        if (!detail.analysis) {
            tabContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-microscope" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.4;"></i>
                    <p>Cargando análisis sónico de 5 puntos...</p>
                </div>
            `;
            return;
        }

        const a = detail.analysis;
        tabContainer.innerHTML = `
            <div class="analysis-box" style="padding: 10px;">
                <div style="background: rgba(16,185,129,0.1); border-left: 4px solid var(--spotify-green); padding: 14px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0; color: #e2e8f0; font-size: 0.95rem; line-height: 1.5;">${a.synopsis || ''}</p>
                </div>

                <div class="analysis-section" style="margin-bottom: 20px;">
                    <h3 style="color: var(--accent-amber); font-size: 1.1rem; margin-bottom: 8px;"><i class="fa-solid fa-drum"></i> 1. La Anatomía Musical</h3>
                    <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.5;">${a.section1_text || ''}</p>
                </div>

                <div class="analysis-section" style="margin-bottom: 20px;">
                    <h3 style="color: var(--accent-amber); font-size: 1.1rem; margin-bottom: 8px;"><i class="fa-solid fa-quote-left"></i> 2. El Análisis Lírico (Significado & Desglose)</h3>
                    <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.5;">${a.section2_text || ''}</p>
                </div>

                <div class="analysis-section" style="margin-bottom: 20px;">
                    <h3 style="color: var(--accent-amber); font-size: 1.1rem; margin-bottom: 8px;"><i class="fa-solid fa-clapperboard"></i> 3. El Videoclip & Estética</h3>
                    <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.5;">${a.section3_text || ''}</p>
                </div>

                <div class="analysis-section" style="margin-bottom: 20px;">
                    <h3 style="color: var(--accent-amber); font-size: 1.1rem; margin-bottom: 8px;"><i class="fa-solid fa-trophy"></i> 4. El Impacto Cultural & Legado</h3>
                    <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.5;">${a.section4_text || ''}</p>
                </div>

                <div class="analysis-section" style="margin-bottom: 20px; background: rgba(245,158,11,0.08); border-left: 4px solid var(--accent-amber); padding: 14px; border-radius: 8px;">
                    <h3 style="color: var(--accent-amber); font-size: 1.1rem; margin-bottom: 8px;"><i class="fa-solid fa-lightbulb"></i> 5. Curiosidades & Anecdotario</h3>
                    <p style="color: #e2e8f0; font-size: 0.95rem; line-height: 1.5; margin: 0;">${a.section5_text || ''}</p>
                </div>
            </div>
        `;
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