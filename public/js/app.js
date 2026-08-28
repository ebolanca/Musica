
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

    function renderSongs() {
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
            return matchGlobal && matchQuick;
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