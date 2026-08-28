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
                populateVideoclipTab(detail);
            })
            .catch(err => {
                console.error('Error cargando detalle:', err);
            });
    }

    function populateCreditsTab(detail, song) {
        const coverImgHtml = song.coverUrl 
            ? `<img src="${song.coverUrl}" alt="${song.album || song.title}" style="width: 100%; border-radius: 12px; margin-bottom: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">`
            : '';

        document.getElementById('tab-credits').innerHTML = `
            ${coverImgHtml}
            <div class="credits-grid">
                <div class="credit-card">
                    <i class="fa-solid fa-user-pen"></i>
                    <div class="credit-label">Compositor / Autor</div>
                    <div class="credit-value">${detail.composers || 'Por determinar'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-compact-disc"></i>
                    <div class="credit-label">Álbum</div>
                    <div class="credit-value">${song.album || detail.album || 'Álbum Desconocido'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-calendar-day"></i>
                    <div class="credit-label">Fecha de Lanzamiento</div>
                    <div class="credit-value">${song.releaseDate || detail.releaseDate || 'No disponible'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-clock"></i>
                    <div class="credit-label">Duración</div>
                    <div class="credit-value">${song.durationFmt || '03:30'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-record-vinyl"></i>
                    <div class="credit-label">Sello Discográfico</div>
                    <div class="credit-value">${detail.label || 'Discográfica Independiente'}</div>
                </div>
                <div class="credit-card">
                    <i class="fa-solid fa-music"></i>
                    <div class="credit-label">Género Musical</div>
                    <div class="credit-value">${detail.genre || 'Pop / Rock'}</div>
                </div>
            </div>
        `;
    }

    function populateLyricsTab(detail) {
        const tabContainer = document.getElementById('tab-lyrics');
        if (!detail.lyrics || detail.lyrics.length === 0) {
            tabContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-file-lines" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.4;"></i>
                    <p>Letra sincronizada no disponible para esta canción.</p>
                </div>
            `;
            return;
        }

        const linesHtml = detail.lyrics.map(l => `
            <div class="lyric-line">
                <span class="lyric-timestamp">${l.time || '00:00'}</span>
                <span class="lyric-text">${l.text}</span>
            </div>
        `).join('');

        tabContainer.innerHTML = `<div class="lyrics-container">${linesHtml}</div>`;
    }

    function populateAnalysisTab(detail) {
        const tabContainer = document.getElementById('tab-analysis');
        if (!detail.analysis) {
            tabContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-microscope" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.4;"></i>
                    <p>Análisis sónico de 4 puntos no generado para esta canción.</p>
                </div>
            `;
            return;
        }

        const a = detail.analysis;
        tabContainer.innerHTML = `
            <div class="analysis-box">
                <h4><i class="fa-solid fa-book-open"></i> 1. Contexto e Historia de la Canción</h4>
                <p>${a.context || 'Sin información.'}</p>

                <h4><i class="fa-solid fa-sliders"></i> 2. Análisis Técnico y Arquitectura Sonora</h4>
                <p>${a.technical || 'Sin información.'}</p>

                <h4><i class="fa-solid fa-quote-left"></i> 3. Desglose Lírico y Análisis Estrofa por Estrofa</h4>
                <p>${a.lyrical || 'Sin información.'}</p>

                <h4><i class="fa-solid fa-gem"></i> 4. Impacto Cultural y Legado Musical</h4>
                <p>${a.legacy || 'Sin información.'}</p>
            </div>
        `;
    }

    function populateVideoclipTab(detail) {
        const tabContainer = document.getElementById('tab-video');
        if (!detail.videoUrl) {
            tabContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-video-slash" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.4;"></i>
                    <p>Videoclip .mp4 no disponible en la biblioteca local.</p>
                </div>
            `;
            return;
        }

        tabContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
                <video controls autoplay style="width: 100%; max-height: 480px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
                    <source src="${detail.videoUrl}" type="video/mp4">
                    Tu navegador no soporta el reproductor de video HTML5.
                </video>
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
