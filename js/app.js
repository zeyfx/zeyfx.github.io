// ... (início do app.js como antes) ...

let wavesurfer;
let globalIsPlayingIntent = false;
let currentTrackDetails = null;
let activePlaylist = [];
let currentTrackIndexInPlaylist = 0;
let currentContextType = 'beats';
let bpmRangeFilter = [40, 200];
let currentSearchTerm = "";
let searchTimeout;
let miniWavesurferInstances = {};
let lastActiveMiniWaveId = null;
let lastActiveTrackItemContainer = null;
// let audioUnlocked = false; // Vamos remover essa flag global e confiar mais no estado do AudioContext

// Função para medidas anti-vazamento (mantida como antes)
function initAntiLeakMeasures() { /* ...código existente... */ }

function init() {
    initWavesurfer();
    populateGenreFilter();
    initBpmFilterSlider();
    renderBeats();
    renderPacks();
    setupEventListeners();
    setupModalEventListeners();
    updateCopyrightYear();
    initAntiLeakMeasures();
}

function checkAndApplyScrollAnimation(textElement, wrapperElement) { /* ...código existente... */ }

// Função para tentar resumir o AudioContext. Retorna uma Promise.
function resumeAudioContext() {
    if (wavesurfer && wavesurfer.backend && wavesurfer.backend.ac && wavesurfer.backend.ac.state === 'suspended') {
        return wavesurfer.backend.ac.resume().then(() => {
            console.log('AudioContext resumed.');
            return true; // Resolvida como true se resumido
        }).catch(e => {
            console.error('Error resuming AudioContext:', e);
            return false; // Resolvida como false se erro
        });
    }
    // Se não estiver suspenso ou não existir, consideramos "desbloqueado" para fins de play
    return Promise.resolve(true); 
}


function initWavesurfer() {
    if (!waveformContainer) return;
    wavesurfer = WaveSurfer.create({ /* ... opções ... */ });
    
    // Listener para a primeira interação do usuário tentar desbloquear o áudio
    const initialUserInteractionHandler = () => {
        resumeAudioContext();
        // Remove para não executar múltiplas vezes desnecessariamente
        document.removeEventListener('click', initialUserInteractionHandler, {capture: true});
        document.removeEventListener('touchstart', initialUserInteractionHandler, {capture: true});
        document.removeEventListener('touchend', initialUserInteractionHandler, {capture: true});
    };
    // Usar 'capture: true' para pegar o evento antes que outros possam pará-lo
    document.addEventListener('click', initialUserInteractionHandler, { once: true, capture: true });
    document.addEventListener('touchstart', initialUserInteractionHandler, { once: true, capture: true });
    document.addEventListener('touchend', initialUserInteractionHandler, { once: true, capture: true });


    wavesurfer.on('ready', () => {
        if(playerSpinner) playerSpinner.classList.add('hidden');
        if(durationEl) durationEl.textContent = formatTime(wavesurfer.getDuration());
        if (currentTrackDetails) {
            if(playerTitle) playerTitle.textContent = currentTrackDetails.title || "Título Desconhecido";
            if(playerAuthor) playerAuthor.textContent = (Array.isArray(currentTrackDetails.author) ? currentTrackDetails.author.join(', ') : currentTrackDetails.author) || "";
            if (playerTitle && playerTitle.parentElement) setTimeout(() => checkAndApplyScrollAnimation(playerTitle, playerTitle.parentElement), 50);
            if (playerAuthor && playerAuthor.parentElement) setTimeout(() => checkAndApplyScrollAnimation(playerAuthor, playerAuthor.parentElement), 50);
        }
        wavesurfer.setPlaybackRate(1.0); wavesurfer.seekTo(0);
        
        if (globalIsPlayingIntent) {
            // Tenta resumir o contexto ANTES de tocar, caso ainda esteja suspenso
            resumeAudioContext().then(resumed => {
                if (resumed) {
                    wavesurfer.play().catch(e => console.error("Error playing on ready:", e));
                } else {
                    console.warn("AudioContext still suspended on ready, play deferred.");
                }
            });
        }
    });
    // ... (outros listeners do wavesurfer: audioprocess, seek, play, pause, finish, loading, error - mantidos como antes)
    // ... (o código dos outros listeners 'play', 'pause', 'finish' etc. não precisa mudar significativamente aqui)
    wavesurfer.on('play', () => {
        if(playBtn) { playBtn.innerHTML = '<i class="fas fa-pause"></i>'; playBtn.setAttribute('aria-label', 'Pausar'); }
        if (lastActiveTrackItemContainer) lastActiveTrackItemContainer.classList.add('is-playing');
        if (currentTrackDetails && currentContextType === 'beats') updateBeatCardPlayIcon(currentTrackDetails.id, true);
    });
    wavesurfer.on('pause', () => {
        if(playBtn) { playBtn.innerHTML = '<i class="fas fa-play"></i>'; playBtn.setAttribute('aria-label', 'Tocar'); }
        if (lastActiveTrackItemContainer) lastActiveTrackItemContainer.classList.remove('is-playing');
        if (currentTrackDetails && currentContextType === 'beats') updateBeatCardPlayIcon(currentTrackDetails.id, false);
        if (currentTrackDetails && currentTrackDetails.miniWaveId && miniWavesurferInstances[currentTrackDetails.miniWaveId]) {
            const currentTime = wavesurfer.getCurrentTime(); const duration = wavesurfer.getDuration();
            if (duration > 0) miniWavesurferInstances[currentTrackDetails.miniWaveId].seekTo(currentTime / duration);
        }
    });
    wavesurfer.on('finish', () => {
        if (lastActiveTrackItemContainer) lastActiveTrackItemContainer.classList.remove('is-playing');
        if (currentTrackDetails && currentContextType === 'beats') updateBeatCardPlayIcon(currentTrackDetails.id, false);
        if (currentTrackDetails && currentTrackDetails.miniWaveId && miniWavesurferInstances[currentTrackDetails.miniWaveId]) miniWavesurferInstances[currentTrackDetails.miniWaveId].seekTo(1);
        const playIconHTML = '<i class="fas fa-play"></i>';
        if (currentContextType === 'beats' && activePlaylist.length > 1) {
            globalIsPlayingIntent = true; playNext();
        } else {
            globalIsPlayingIntent = false;
            if(playBtn) { playBtn.innerHTML = playIconHTML; playBtn.setAttribute('aria-label', 'Tocar'); }
            if (wavesurfer) wavesurfer.seekTo(0); // Verifica se wavesurfer existe
            if(currentTimeEl) currentTimeEl.textContent = formatTime(0);
            if (currentTrackDetails && currentTrackDetails.miniWaveId && miniWavesurferInstances[currentTrackDetails.miniWaveId]) miniWavesurferInstances[currentTrackDetails.miniWaveId].seekTo(0);
        }
    });
    wavesurfer.on('loading', () => { if(playerSpinner) playerSpinner.classList.remove('hidden'); });
    wavesurfer.on('error', (err) => {
        console.error("Wavesurfer error:", err);
        if(playerSpinner) playerSpinner.classList.add('hidden');
        if(playerTitle) playerTitle.textContent = "Erro ao carregar";
        if(playerAuthor) playerAuthor.textContent = "";
        globalIsPlayingIntent = false;
    });


    if(waveformContainer) {
        waveformContainer.addEventListener('click', (e) => {
            if (!wavesurfer || !wavesurfer.getDuration()) return;
            const bbox = waveformContainer.getBoundingClientRect();
            const clickPosition = (e.clientX - bbox.left) / bbox.width;
            wavesurfer.seekTo(clickPosition);
        });
    }
}


// ... (populateGenreFilter, initBpmFilterSlider, renderBeats, updateBeatCardPlayIcon, renderPacks, updateActiveTrackIndicator, resetPreviousActiveMiniWave - mantidos como antes)
// ... (copie essas funções da sua versão anterior que estava funcionando bem para o layout)


function loadAndPlay(track, playlistContext, indexInContext, contextTypeParam = 'beats') {
    globalIsPlayingIntent = true; 
    
    resumeAudioContext().then(() => { // Tenta garantir que o contexto esteja ativo antes de carregar
        resetPreviousActiveMiniWave();
        if (lastActiveTrackItemContainer) { lastActiveTrackItemContainer.classList.remove('active-track-in-pack', 'is-playing'); lastActiveTrackItemContainer = null; }
        if (currentContextType !== 'beats' || (currentTrackDetails && currentTrackDetails.id !== track.id)) updateBeatCardPlayIcon(null, false);
        
        currentTrackDetails = { ...track }; 
        activePlaylist = playlistContext; 
        currentTrackIndexInPlaylist = indexInContext; 
        currentContextType = contextTypeParam;

        if (currentTrackDetails.miniWaveId) lastActiveMiniWaveId = currentTrackDetails.miniWaveId;
        if (contextTypeParam === 'pack' && currentTrackDetails.packId && currentTrackDetails.trackOriginalId !== undefined) {
            const itemSelector = `.track-item-container[data-pack-id="${currentTrackDetails.packId}"][data-track-id="${currentTrackDetails.trackOriginalId}"]`;
            if (packsContainer) { const newActiveItem = packsContainer.querySelector(itemSelector); if (newActiveItem) updateActiveTrackIndicator(newActiveItem); }
        }
        if(audioPlayer) audioPlayer.classList.remove('hidden');
        if(playerTitle) { playerTitle.textContent = currentTrackDetails.title || "Título Desconhecido"; if (playerTitle.parentElement) setTimeout(() => checkAndApplyScrollAnimation(playerTitle, playerTitle.parentElement), 50); }
        if(playerAuthor) { playerAuthor.textContent = (Array.isArray(currentTrackDetails.author) ? currentTrackDetails.author.join(', ') : currentTrackDetails.author) || ""; if (playerAuthor.parentElement) setTimeout(() => checkAndApplyScrollAnimation(playerAuthor, playerAuthor.parentElement), 50); }
        if(playerCover) playerCover.src = currentTrackDetails.cover || 'static/cover/placeholder-60x60.png';
        if(currentTimeEl) currentTimeEl.textContent = formatTime(0); if(durationEl) durationEl.textContent = formatTime(0);
        const coverUrl = currentTrackDetails.cover || 'static/cover/placeholder-60x60.png';
        if(backgroundBlurEl) { backgroundBlurEl.style.backgroundImage = `url(${coverUrl})`; backgroundBlurEl.style.opacity = '1'; }
        if (headerVisualEffectEl) { headerVisualEffectEl.style.backgroundImage = `url(${coverUrl})`; headerVisualEffectEl.style.opacity = '0.3'; }
        if(playerSpinner) playerSpinner.classList.remove('hidden');
        if(playBtn) { playBtn.innerHTML = '<i class="fas fa-pause"></i>'; playBtn.setAttribute('aria-label', 'Pausar'); }
        if (contextTypeParam === 'beats') updateBeatCardPlayIcon(currentTrackDetails.id, true);
        
        if(wavesurfer) { 
            wavesurfer.stop(); 
            wavesurfer.load(currentTrackDetails.file); // o evento 'ready' tentará o play
        }
    });
}

function togglePlayPause() {
    if (!wavesurfer) return;

    resumeAudioContext().then(resumed => {
        if (!resumed && wavesurfer.backend.ac.state === 'suspended') {
            console.warn("AudioContext ainda suspenso após tentativa em togglePlayPause. Interaja com a página.");
            // Poderia-se tentar forçar um 'click' programático em um elemento para desbloquear,
            // mas isso é hacky. A melhor abordagem é o usuário interagir.
            // Ou, se for o primeiro clique, a lógica de 'desbloqueio' já deveria ter sido chamada.
            // Se o usuário clicou no play e o contexto ainda está suspenso, algo está errado
            // ou o navegador é muito restritivo.
            return; 
        }

        if (!wavesurfer.getMediaElement() || !wavesurfer.getDuration()) {
            if (activePlaylist.length > 0) {
                const playIndex = (currentTrackIndexInPlaylist >= 0 && currentTrackIndexInPlaylist < activePlaylist.length)
                                  ? currentTrackIndexInPlaylist : 0;
                globalIsPlayingIntent = true;
                loadAndPlay(activePlaylist[playIndex], activePlaylist, playIndex, currentContextType);
            }
            return;
        }

        if (wavesurfer.isPlaying()) {
            globalIsPlayingIntent = false;
            wavesurfer.pause();
        } else {
            globalIsPlayingIntent = true;
            // Se o wavesurfer estiver pronto (decodificado), ele deve tocar
            // Se não estiver pronto ainda, o 'ready' event cuidará disso se globalIsPlayingIntent for true
            if (wavesurfer.isReady) { // Verifica se o áudio está decodificado
                 wavesurfer.play().catch(e => console.error("Error on togglePlayPause - play:", e));
            } else {
                console.log("Play intentado, mas wavesurfer não está pronto. 'ready' event deve tocar.");
                // Se por algum motivo o 'ready' não for disparado novamente, pode ser necessário um wavesurfer.load() aqui
                // mas normalmente não é o caso se já houve um load anterior.
            }
        }
    });
}


// ... (playNext, playPrev, toggleMutePlayer, updateVolume, updateVolumeIcon - mantidos como antes)
// ... (formatTime, formatPrice, parseDate, sortList, handleSearch, updateCopyrightYear, showItemDetails, setupModalEventListeners, closeFilterDropdownAction, setupEventListeners - mantidos como antes)

// --- COLE O RESTANTE DAS FUNÇÕES (populateGenreFilter, initBpmFilterSlider, renderBeats, updateBeatCardPlayIcon, renderPacks, etc.) DA SUA VERSÃO ANTERIOR FUNCIONAL AQUI ---
// --- Certifique-se de que as funções abaixo desta linha são as mesmas da sua última versão funcional, com as verificações de null ---
function populateGenreFilter() {
    if (!beatData || !beatData.beats) return;
    const genres = new Set(beatData.beats.flatMap(beat => Array.isArray(beat.genre) ? beat.genre : [beat.genre]).filter(g => g));
    if (filterGenre) {
        filterGenre.innerHTML = '<option value="all">Todos os Gêneros</option>';
        [...genres].sort().forEach(genre => {
            const option = document.createElement('option');
            option.value = genre.toLowerCase();
            option.textContent = genre;
            filterGenre.appendChild(option);
        });
    }
}

function initBpmFilterSlider() {
    if (!bpmSliderFilter) return;
    const range = bpmSliderFilter.querySelector('.slider-range-filter');
    const handles = bpmSliderFilter.querySelectorAll('.slider-handle-filter');
    if (!range || handles.length < 2) return;

    let minValue = bpmRangeFilter[0];
    let maxValue = bpmRangeFilter[1];
    const absMin = 40, absMax = 200, rangeVal = absMax - absMin;

    function updateVisuals() {
        const minPercent = ((minValue - absMin) / rangeVal) * 100;
        const maxPercent = ((maxValue - absMin) / rangeVal) * 100;
        range.style.left = `${minPercent}%`;
        range.style.width = `${maxPercent - minPercent}%`;
        handles[0].style.left = `${minPercent}%`;
        handles[1].style.left = `${maxPercent}%`;
        if (bpmMinFilterEl) bpmMinFilterEl.textContent = `${minValue} BPM`;
        if (bpmMaxFilterEl) bpmMaxFilterEl.textContent = `${maxValue} BPM`;
    }
    function applyFilter() { bpmRangeFilter = [minValue, maxValue]; renderBeats(); }
    updateVisuals();

    handles.forEach((handle, index) => {
        const handleDrag = (clientX) => {
            const rect = bpmSliderFilter.getBoundingClientRect();
            let percent = (clientX - rect.left) / rect.width;
            percent = Math.min(Math.max(percent, 0), 1);
            let value = Math.round(absMin + percent * rangeVal);
            if (index === 0) { minValue = Math.min(value, maxValue - 5); } 
            else { maxValue = Math.max(value, minValue + 5); }
            updateVisuals();
        };
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault(); document.body.style.cursor = 'grabbing';
            const onMouseMove = (moveEvent) => handleDrag(moveEvent.clientX);
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.body.style.cursor = ''; applyFilter();
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        handle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const onTouchMove = (moveEvent) => { if (moveEvent.touches.length > 0) handleDrag(moveEvent.touches[0].clientX); };
            const onTouchEnd = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd); applyFilter();
            };
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        }, { passive: false });
        handle.addEventListener('keydown', (e) => {
            let valueChanged = false; const step = 1;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                if (index === 0 && minValue > absMin) { minValue -= step; valueChanged = true; }
                if (index === 1 && maxValue > minValue + 5) { maxValue -= step; valueChanged = true; }
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                if (index === 0 && minValue < maxValue - 5) { minValue += step; valueChanged = true; }
                if (index === 1 && maxValue < absMax) { maxValue += step; valueChanged = true; }
            }
            if (valueChanged) {
                minValue = Math.max(absMin, Math.min(minValue, absMax - 5));
                maxValue = Math.max(absMin + 5, Math.min(maxValue, absMax));
                if (minValue >= maxValue - 4) { if(index === 0) minValue = maxValue - 5; else maxValue = minValue + 5; }
                updateVisuals(); applyFilter();
            }
        });
    });
}

function renderBeats() {
    if (!beatData || !beatData.beats || !beatsContainer) return;
    let filteredBeats = [...beatData.beats];
    const searchTerm = currentSearchTerm;
    if (searchTerm) {
        filteredBeats = filteredBeats.filter(beat =>
            beat.title.toLowerCase().includes(searchTerm) ||
            (Array.isArray(beat.author) ? beat.author.join(' ') : beat.author).toLowerCase().includes(searchTerm) ||
            (Array.isArray(beat.genre) ? beat.genre.join(' ') : beat.genre).toLowerCase().includes(searchTerm) ||
            (Array.isArray(beat.tags) ? beat.tags.join(' ') : beat.tags).toLowerCase().includes(searchTerm)
        );
    }
    if (filterGenre) {
        const genre = filterGenre.value;
        if (genre !== 'all') {
            filteredBeats = filteredBeats.filter(beat => (Array.isArray(beat.genre) ? beat.genre.map(g => g.toLowerCase()) : [String(beat.genre).toLowerCase()]).includes(genre));
        }
    }
    filteredBeats = filteredBeats.filter(beat => beat.bpm >= bpmRangeFilter[0] && beat.bpm <= bpmRangeFilter[1]);
    if (sortBeats) sortList(filteredBeats, sortBeats.value);

    beatsContainer.innerHTML = '';
    if (filteredBeats.length === 0) {
        beatsContainer.innerHTML = '<p class="col-span-full text-center text-text-muted">Nenhum beat encontrado.</p>';
        return;
    }
    filteredBeats.forEach((beat, index) => {
        const beatCard = document.createElement('div');
        beatCard.className = 'beat-card group';
        beatCard.dataset.beatId = beat.id;
        const authorDisplay = Array.isArray(beat.author) ? beat.author.join(', ') : beat.author;
        const coverSrc = beat.cover ? beat.cover : 'static/cover/placeholder-60x60.png';

        beatCard.innerHTML = `
            <div class="relative aspect-square">
                <img src="${coverSrc}" alt="${beat.title}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
                ${beat.exclusive ? '<div class="exclusive-badge">Exclusivo</div>' : ''}
                ${beat.discount ? `<div class="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md">-${beat.discount}%</div>` : ''}
                <div class="play-icon-wrapper">
                    <button aria-label="Tocar ${beat.title} por ${authorDisplay}" class="play-icon-button">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
            <div class="p-4">
                <h3 class="font-semibold text-base text-text-primary truncate mb-0.5">${beat.title}</h3>
                <p class="text-xs text-text-secondary truncate mb-2">${authorDisplay}</p>
                <div class="flex justify-between items-center text-xs mb-2">
                    <span class="bg-primary-translucent text-primary-light font-medium px-2 py-0.5 rounded-full">${beat.bpm} BPM</span>
                    <span class="bg-bg-tertiary text-text-secondary px-2 py-0.5 rounded-full">${beat.key}</span>
                </div>
                <div class="text-right">
                    ${beat.discount ? `
                        <span class="text-xs line-through text-text-muted mr-1.5">${formatPrice(beat.price)}</span>
                        <span class="text-sm font-bold text-primary">${formatPrice(beat.price * (1 - beat.discount / 100))}</span>
                    ` : `
                        <span class="text-sm font-bold text-primary">${formatPrice(beat.price)}</span>
                    `}
                </div>
                <button class="details-button w-full mt-2" data-beat-id="${beat.id}">Mais Informações</button>
            </div>
        `;
        const playArea = beatCard.querySelector('.relative.aspect-square');
        if (playArea) {
            playArea.addEventListener('click', (e) => {
                if (e.target.closest('.details-button')) return;
                if (currentTrackDetails && currentTrackDetails.id === beat.id && wavesurfer && wavesurfer.getDuration()) togglePlayPause();
                else loadAndPlay(beat, filteredBeats, index, 'beats');
            });
        }
        const detailsBtn = beatCard.querySelector('.details-button');
        if (detailsBtn) {
            detailsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const beatId = e.currentTarget.dataset.beatId;
                const selectedBeat = beatData.beats.find(b => b.id === beatId);
                if (selectedBeat) showItemDetails(selectedBeat, 'beat');
            });
        }
        beatsContainer.appendChild(beatCard);
    });
}

function updateBeatCardPlayIcon(beatIdToUpdate, isPlaying) {
    document.querySelectorAll('.beat-card').forEach(card => {
        const button = card.querySelector('.play-icon-button');
        const cardId = card.dataset.beatId;
        if (button) {
            if (cardId === beatIdToUpdate) button.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
            else button.innerHTML = '<i class="fas fa-play"></i>';
        }
    });
     if (beatIdToUpdate === null) {
        document.querySelectorAll('.beat-card .play-icon-button').forEach(button => {
            if (button) button.innerHTML = '<i class="fas fa-play"></i>';
        });
    }
}

function renderPacks() {
    if (!beatData || !beatData.packs || !packsContainer) return;
    Object.values(miniWavesurferInstances).forEach(mw => { if (mw && typeof mw.destroy === 'function') mw.destroy(); });
    miniWavesurferInstances = {}; lastActiveMiniWaveId = null;
    let sortedPacks = [...beatData.packs];
    if (sortPacks) sortList(sortedPacks, sortPacks.value);
    packsContainer.innerHTML = '';
    if (sortedPacks.length === 0) {
        packsContainer.innerHTML = '<p class="text-center text-text-muted">Nenhum pacote encontrado.</p>'; return;
    }
    sortedPacks.forEach(pack => {
        const packCard = document.createElement('div'); packCard.className = 'pack-card';
        const coverSrc = pack.cover ? pack.cover : 'static/cover/placeholder-60x60.png';
        const trackItemsHTML = pack.tracks.map((track, trackIndex) => {
            const miniWaveId = `miniwave-${pack.id}-${track.id || trackIndex}`;
            const trackAuthor = track.author || pack.author || "Desconhecido";
            return `
                <div class="flex items-center px-3 py-2 hover:bg-bg-tertiary rounded-md transition group track-item-container cursor-pointer"
                     data-pack-id="${pack.id}" data-track-index="${trackIndex}" data-mini-wave-id="${miniWaveId}" data-track-id="${track.id || trackIndex}" data-track-file="${track.file}">
                    <span class="text-sm text-text-muted mr-3 group-hover:text-primary transition-colors shrink-0">${trackIndex + 1}.</span>
                    <div id="${miniWaveId}" class="mini-wavesurfer-container w-24 h-8 mr-3 shrink-0" data-track-file="${track.file}"></div>
                    <div class="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors flex-grow min-w-0" title="${track.title} por ${trackAuthor}">${track.title}</div>
                    <div class="ml-2 text-text-secondary group-hover:text-primary transition-colors shrink-0">
                         <i class="fas fa-play text-xs opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                </div>`;
        }).join('');
        packCard.innerHTML = `
            <div class="p-5">
                <div class="flex items-center justify-between cursor-pointer pack-header">
                    <div class="flex items-center min-w-0">
                         <div class="relative shrink-0 mr-4">
                            <img src="${coverSrc}" alt="${pack.name}" class="w-20 h-20 rounded-lg object-cover shadow-md">
                            ${pack.discount ? `<div class="absolute top-1 left-1 bg-red-500 text-white text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full shadow-sm z-5">-${pack.discount}%</div>` : ''}
                        </div>
                        <div class="min-w-0">
                            <h3 class="font-bold text-lg text-text-primary truncate">${pack.name}</h3>
                            <p class="text-sm text-text-secondary truncate mt-0.5">${pack.description}</p>
                            <p class="text-xs text-text-muted mt-1.5">${pack.tracks.length} itens</p>
                        </div>
                    </div>
                    <div class="flex items-center shrink-0 ml-4">
                        <div class="text-right mr-3">
                            ${pack.discount ? `
                                <span class="text-sm line-through text-text-muted">${formatPrice(pack.price)}</span>
                                <div class="font-bold text-primary text-lg">${formatPrice(pack.price * (1 - pack.discount/100))}</div>
                            ` : `<div class="font-bold text-primary text-lg">${formatPrice(pack.price)}</div>`}
                        </div>
                        <button class="details-button mr-2" data-pack-id="${pack.id}">Detalhes</button>
                        <button aria-label="Expandir ou recolher faixas do pacote ${pack.name}" class="pack-toggle p-2 rounded-full hover:bg-bg-tertiary transition text-text-secondary">
                            <i class="fas fa-chevron-down text-base"></i>
                        </button>
                    </div>
                </div>
                <div class="pack-beats mt-4 border-t border-border-color pt-4 hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">${trackItemsHTML}</div>
            </div>`;
        packsContainer.appendChild(packCard);
        const packHeader = packCard.querySelector('.pack-header');
        const packBeatsContainer = packCard.querySelector('.pack-beats');
        const toggleBtnIcon = packCard.querySelector('.pack-toggle i');
        if (packHeader && packBeatsContainer && toggleBtnIcon) {
            packHeader.addEventListener('click', (e) => {
                if (e.target.closest('.track-item-container') || e.target.closest('.details-button')) return;
                const isHidden = packBeatsContainer.classList.toggle('hidden');
                toggleBtnIcon.classList.toggle('fa-chevron-down', isHidden);
                toggleBtnIcon.classList.toggle('fa-chevron-up', !isHidden);
                if (!isHidden) {
                    packBeatsContainer.querySelectorAll('.mini-wavesurfer-container').forEach(container => {
                        const miniWaveId = container.id;
                        if (!miniWavesurferInstances[miniWaveId] && container.dataset.trackFile) {
                            try {
                                const mwInstance = WaveSurfer.create({ container: `#${miniWaveId}`, waveColor: 'rgba(156, 163, 175, 0.5)', progressColor: 'rgba(99, 102, 241, 0.5)', height: 32, barWidth: 1, barGap: 1, barRadius: 1, interactive: false, mediaControls: false, normalize: true, });
                                mwInstance.load(container.dataset.trackFile);
                                miniWavesurferInstances[miniWaveId] = mwInstance;
                            } catch (error) { console.error(`Error initializing mini-wavesurfer for ${miniWaveId}:`, error); container.innerHTML = `<p class="text-xs text-red-500">Erro</p>`; }
                        }
                    });
                }
            });
        }
        const packDetailsBtn = packCard.querySelector('.pack-header .details-button');
        if (packDetailsBtn) {
            packDetailsBtn.addEventListener('click', (e) => {
                e.stopPropagation(); const packId = e.currentTarget.dataset.packId;
                const selectedPack = beatData.packs.find(p => p.id === packId);
                if (selectedPack) showItemDetails(selectedPack, 'pack');
            });
        }
        packCard.querySelectorAll('.track-item-container').forEach(itemContainer => {
            itemContainer.addEventListener('click', () => {
                const packId = itemContainer.dataset.packId; const trackIndex = parseInt(itemContainer.dataset.trackIndex);
                const trackFile = itemContainer.dataset.trackFile; const clickedPack = beatData.packs.find(p => p.id === packId);
                if (!clickedPack) return;
                if (currentTrackDetails && currentTrackDetails.file === trackFile && wavesurfer && wavesurfer.getDuration()) {
                    if (!wavesurfer.isPlaying()) wavesurfer.play().catch(e => console.error("Error playing from track item:", e));
                    if(audioPlayer) audioPlayer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    const trackToPlay = { ...(clickedPack.tracks[trackIndex]), author: clickedPack.tracks[trackIndex].author || clickedPack.author || "Desconhecido", cover: clickedPack.tracks[trackIndex].cover || clickedPack.cover, bpm: clickedPack.tracks[trackIndex].bpm || clickedPack.bpm || 120, miniWaveId: itemContainer.dataset.miniWaveId, packId: packId, trackOriginalId: clickedPack.tracks[trackIndex].id || trackIndex };
                    const packPlaylist = clickedPack.tracks.map((t, idx) => ({ ...t, author: t.author || clickedPack.author || "Desconhecido", cover: t.cover || clickedPack.cover, bpm: t.bpm || clickedPack.bpm || 120, miniWaveId: `miniwave-${pack.id}-${t.id || idx}`, packId: packId, trackOriginalId: t.id || idx }));
                    loadAndPlay(trackToPlay, packPlaylist, trackIndex, 'pack');
                }
                updateActiveTrackIndicator(itemContainer);
            });
        });
    });
}

function updateActiveTrackIndicator(activeItemContainer) {
    if (lastActiveTrackItemContainer && lastActiveTrackItemContainer !== activeItemContainer) lastActiveTrackItemContainer.classList.remove('active-track-in-pack', 'is-playing');
    if (activeItemContainer) {
        activeItemContainer.classList.add('active-track-in-pack');
        if (wavesurfer && wavesurfer.isPlaying()) activeItemContainer.classList.add('is-playing');
        lastActiveTrackItemContainer = activeItemContainer;
    } else lastActiveTrackItemContainer = null;
}

function resetPreviousActiveMiniWave() {
    if (lastActiveMiniWaveId && miniWavesurferInstances[lastActiveMiniWaveId]) miniWavesurferInstances[lastActiveMiniWaveId].seekTo(0);
    lastActiveMiniWaveId = null;
}

function playNext() {
    if (activePlaylist.length === 0) return;
    currentTrackIndexInPlaylist = (currentTrackIndexInPlaylist + 1) % activePlaylist.length;
    loadAndPlay(activePlaylist[currentTrackIndexInPlaylist], activePlaylist, currentTrackIndexInPlaylist, currentContextType);
}
function playPrev() {
    if (activePlaylist.length === 0) return;
    currentTrackIndexInPlaylist = (currentTrackIndexInPlaylist - 1 + activePlaylist.length) % activePlaylist.length;
    loadAndPlay(activePlaylist[currentTrackIndexInPlaylist], activePlaylist, currentTrackIndexInPlaylist, currentContextType);
}
function toggleMutePlayer() { if (wavesurfer) wavesurfer.setMuted(!wavesurfer.getMuted()); }
function updateVolume() {
    if (!volumeBar || !wavesurfer) return;
    const newVolume = parseInt(volumeBar.value, 10);
    wavesurfer.setVolume(newVolume / 100);
}
function updateVolumeIcon(vol, muted) {
    const iconClass = muted || vol === 0 ? 'fas fa-volume-mute' : (vol < 0.5 ? 'fas fa-volume-down' : 'fas fa-volume-up');
    const ariaLabel = muted || vol === 0 ? 'Ativar som' : 'Desativar mudo';
    if (volumeBtn) { volumeBtn.innerHTML = `<i class="${iconClass}"></i>`; volumeBtn.setAttribute('aria-label', ariaLabel); }
    const sliderValue = muted ? 0 : vol * 100;
    if (volumeBar) volumeBar.value = sliderValue;
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
function formatPrice(price) { return `R$${price.toFixed(2).replace('.', ',')}`; }
function parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    if (typeof dateStr === 'string') {
        const dtMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
        if (dtMatch) { const [,d,m,y,h,min,s] = dtMatch.map(Number); return new Date(y,m-1,d,h,min,s); }
        const dMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (dMatch) { const [,d,m,y] = dMatch.map(Number); return new Date(y,m-1,d); }
    }
    const p = new Date(dateStr); return isNaN(p.getTime()) ? new Date(0) : p;
}
function sortList(list, sortBy) {
    switch (sortBy) {
        case 'newest': list.sort((a,b) => parseDate(b.dateAdded||0).getTime()-parseDate(a.dateAdded||0).getTime()); break;
        case 'oldest': list.sort((a,b) => parseDate(a.dateAdded||0).getTime()-parseDate(b.dateAdded||0).getTime()); break;
        case 'price-asc': list.sort((a,b)=>(a.price*(1-(a.discount||0)/100))-(b.price*(1-(b.discount||0)/100))); break;
        case 'price-desc': list.sort((a,b)=>(b.price*(1-(b.discount||0)/100))-(a.price*(1-(a.discount||0)/100))); break;
        case 'discount-desc': case 'discount': list.sort((a,b)=>(b.discount||0)-(a.discount||0)); break;
        case 'discount-asc': list.sort((a,b)=>(a.discount||0)-(b.discount||0)); break;
    }
}
function handleSearch(e) {
    currentSearchTerm = e.target.value.toLowerCase();
    searchInputs.forEach(i => { if (i && i !== e.target) i.value = e.target.value; });
    clearTimeout(searchTimeout); searchTimeout = setTimeout(renderBeats, 300);
}
function updateCopyrightYear() { if (currentYearEl) currentYearEl.textContent = new Date().getFullYear(); }

function showItemDetails(item, type) {
    if (!detailsModal || !detailsModalTitle || !detailsModalBody) return;
    detailsModalTitle.textContent = item.title || item.name; let bodyHtml = '';
    if (type === 'beat') {
        bodyHtml += `<p><strong>Autor(es):</strong> ${Array.isArray(item.author)?item.author.join(', '):item.author}</p>`;
        bodyHtml += `<p><strong>BPM:</strong> ${item.bpm}</p><p><strong>Tom:</strong> ${item.key}</p>`;
        bodyHtml += `<p><strong>Gênero(s):</strong> ${Array.isArray(item.genre)?item.genre.join(', '):item.genre}</p>`;
        if (item.tags && item.tags.length > 0) bodyHtml += `<p><strong>Tags:</strong> ${item.tags.join(', ')}</p>`;
        if (item.dateAdded) {
            const d = parseDate(item.dateAdded); let fd = "Data inválida";
            if (d instanceof Date && !isNaN(d)) {
                fd = (typeof item.dateAdded === 'string' && item.dateAdded.includes(':')) ? 
                    d.toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) :
                    d.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
            } else fd = "Data não especificada ou inválida";
            bodyHtml += `<p><strong>Adicionado em:</strong> ${fd}</p>`;
        }
    } else if (type === 'pack') {
        bodyHtml += `<p><strong>Autor(es):</strong> ${item.author||'N/A'}</p>`;
        bodyHtml += `<p><strong>Descrição:</strong> ${item.description||'N/A'}</p>`;
        bodyHtml += `<p><strong>Nº de Itens:</strong> ${item.tracks.length}</p>`;
    }
    detailsModalBody.innerHTML = bodyHtml; detailsModal.classList.remove('hidden');
    if(detailsModalClose) detailsModalClose.focus();
}
function setupModalEventListeners() {
    if(detailsModalClose) detailsModalClose.addEventListener('click', ()=>{if(detailsModal)detailsModal.classList.add('hidden')});
    if(detailsModal) {
        detailsModal.addEventListener('click', (e)=>{if(e.target===detailsModal)detailsModal.classList.add('hidden')});
        detailsModal.addEventListener('keydown', (e)=>{if(e.key==='Escape')detailsModal.classList.add('hidden')});
    }
}

function closeFilterDropdownAction() {
    if (filterDropdown && !filterDropdown.classList.contains('hidden')) {
        filterDropdown.classList.add('hidden');
        if (filterToggle) filterToggle.setAttribute('aria-expanded', 'false');
        if (filterOverlay) filterOverlay.classList.add('hidden');
    }
}

function setupEventListeners() {
    if (playBtn) playBtn.addEventListener('click', togglePlayPause);
    if (prevBtn) prevBtn.addEventListener('click', playPrev);
    if (nextBtn) nextBtn.addEventListener('click', playNext);
    if (volumeBtn) volumeBtn.addEventListener('click', toggleMutePlayer);
    if (volumeBar) volumeBar.addEventListener('input', updateVolume);

    if(sortBeats) sortBeats.addEventListener('change', () => renderBeats());
    if(sortPacks) sortPacks.addEventListener('change', () => renderPacks());
    if(filterGenre) filterGenre.addEventListener('change', () => renderBeats());

    if (filterToggle) {
        filterToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if(filterDropdown) {
                const isHidden = filterDropdown.classList.toggle('hidden');
                filterToggle.setAttribute('aria-expanded', !isHidden);
                if (filterOverlay && window.innerWidth < 768) { 
                    filterOverlay.classList.toggle('hidden', isHidden);
                }
            }
        });
    }
    if (filterOverlay) filterOverlay.addEventListener('click', closeFilterDropdownAction);
    if (closeFilterDropdownMobileBtn) closeFilterDropdownMobileBtn.addEventListener('click', closeFilterDropdownAction);
    if (applyFiltersMobileBtn) applyFiltersMobileBtn.addEventListener('click', closeFilterDropdownAction);

    document.addEventListener('click', (e) => { 
        if (window.innerWidth >= 768 && filterDropdown && !filterDropdown.classList.contains('hidden') &&
            filterToggle && !filterToggle.contains(e.target) && !filterDropdown.contains(e.target)) {
            closeFilterDropdownAction();
        }
    });

    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            const icon = mobileMenuButton.querySelector('i');
            const isExpanded = !mobileMenu.classList.contains('hidden');
            icon.classList.toggle('fa-bars', !isExpanded); icon.classList.toggle('fa-times', isExpanded);
            mobileMenuButton.setAttribute('aria-expanded', isExpanded.toString());
            mobileMenuButton.setAttribute('aria-label', isExpanded?'Fechar menu de navegação':'Abrir menu de navegação');
        });
    }
    searchInputs.forEach(input => { if (input) input.addEventListener('input', handleSearch); });
    if (wavesurfer) {
        wavesurfer.on('volume', (v) => updateVolumeIcon(v, wavesurfer.getMuted()));
        wavesurfer.on('mute', (m) => updateVolumeIcon(wavesurfer.getVolume(), m));
    }
    window.addEventListener('resize', () => {
        if (currentTrackDetails) {
            if(playerTitle && playerTitle.parentElement) setTimeout(() => checkAndApplyScrollAnimation(playerTitle, playerTitle.parentElement), 50);
            if(playerAuthor && playerAuthor.parentElement) setTimeout(() => checkAndApplyScrollAnimation(playerAuthor, playerAuthor.parentElement), 50);
        }
        if (window.innerWidth >= 768 && filterOverlay && !filterOverlay.classList.contains('hidden')) {
            filterOverlay.classList.add('hidden');
        }
         if (wavesurfer && waveformContainer) { 
           wavesurfer.setOptions({ height: waveformContainer.clientHeight || 48 });
        }
    });
}
document.addEventListener('DOMContentLoaded', init);