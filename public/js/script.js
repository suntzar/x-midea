document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  if (window.feather) {
    setTimeout(() => feather.replace(), 200);
  }

  // ===================================================
  // MÓDULO DE GESTÃO DE ESTADO (DataManager)
  // ===================================================
  const DataManager = (() => {
    const APP_DATA_KEY = "mediaAppData";
    const defaultState = {
      theme: "sakura-dark",
      favorites: [],
      history: [],
      unwantedTags: [],
    };
    let appState = { ...defaultState };

    const saveState = () => {
      try {
        localStorage.setItem(APP_DATA_KEY, JSON.stringify(appState));
      } catch (e) {
        console.error("Falha ao salvar o estado:", e);
        Noxss.Toasts.show({ message: "Erro ao salvar dados.", status: "danger" });
      }
    };

    const loadState = () => {
      try {
        const savedData = localStorage.getItem(APP_DATA_KEY);
        if (savedData) {
          const parsedData = JSON.parse(savedData);
          appState = { ...defaultState, ...parsedData };
        }
      } catch (e) {
        console.error("Falha ao carregar estado, usando padrão:", e);
        appState = { ...defaultState };
      }
      return appState;
    };

    const validateData = (data) => data && Array.isArray(data.favorites) && Array.isArray(data.history) && Array.isArray(data.unwantedTags) && typeof data.theme === "string";
    const overwriteData = (jsonString) => {
      try {
        const data = JSON.parse(jsonString);
        if (validateData(data)) {
          appState = { ...defaultState, ...data };
          saveState();
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    };
    const mergeData = (jsonString) => {
      try {
        const newData = JSON.parse(jsonString);
        if (!validateData(newData)) return false;
        appState.history = [...new Set([...appState.history, ...newData.history])];
        appState.unwantedTags = [...new Set([...appState.unwantedTags, ...newData.unwantedTags])];
        appState.favorites = [...new Set([...appState.favorites, ...newData.favorites])];
        saveState();
        return true;
      } catch (e) {
        return false;
      }
    };
    return { loadState, saveState, overwriteData, mergeData, exportData: () => JSON.stringify(appState, null, 2), state: appState };
  })();

  // ===================================================
  // Seletores de UI e Inicialização do Estado
  // ===================================================
  const appState = DataManager.loadState();
  const getEl = (id) => document.getElementById(id);
  const query = (sel) => document.querySelector(sel);
  const ui = {
    feedContainer: getEl("feed-container"),
    searchResultsContainer: getEl("search-results"),
    favoritesContainer: getEl("favorites-container"),
    historyList: getEl("history-list"),
    unwantedTagsList: getEl("unwanted-tags-list"),
    loadingFeed: getEl("loading"),
    loadingSearch: getEl("loading-search"),
    loadMoreBtn: getEl("load-more"),
    loadMoreSearchBtn: getEl("load-more-search"),
    filterTypeSelect: getEl("filter-type"),
    searchForm: getEl("search-form"),
    searchInput: getEl("search-input"),
    autocompleteContainer: getEl("autocomplete-container"),
    themeSelect: getEl("theme-select"),
    modalMediaContainer: query("#postModal .media-container"),
    modalDetailsContainer: getEl("modal-details"),
    htmlElement: document.documentElement,
  };
  let isLoading = false;
  const POSTS_PER_PAGE = 10;
  let feedState = { files: [], page: 0, hasMore: true, currentTags: "" };
  let searchState = { files: [], page: 0, hasMore: true, currentTags: "" };
  let favoritesState = { files: [], page: 0, hasMore: true };

  // ===================================================
  // Funções de Lógica de Negócio e Renderização
  // ===================================================

  // --- Funções para o Masonry Layout com CSS Grid ---
  function resizeMasonryItem(item){
    const grid = item.closest('.feed-masonry');
    if (!grid) return;
    const rowGap = parseInt(window.getComputedStyle(grid).getPropertyValue('grid-row-gap'));
    const rowHeight = parseInt(window.getComputedStyle(grid).getPropertyValue('grid-auto-rows'));
    
    const itemContent = item.querySelector('.noxss-card, .tweet-card');
    if (!itemContent) return;

    const itemContentHeight = itemContent.getBoundingClientRect().height;
    const rowSpan = Math.ceil((itemContentHeight + rowGap) / (rowHeight + rowGap));
    
    item.style.gridRowEnd = 'span ' + rowSpan;
  }
  
  function resizeAllMasonryItems(container){
      if (!container) return;
      const allItems = container.querySelectorAll('.tweet-card, .noxss-card');
      if (allItems.length === 0) return;
      
      const promises = Array.from(allItems).map(item => {
          const images = item.querySelectorAll('img, video');
          return Promise.all(Array.from(images).map(media => {
              return new Promise(resolve => {
                  if (media.tagName === 'IMG' && media.complete) return resolve();
                  if (media.tagName === 'VIDEO' && media.readyState > 0) return resolve();
                  media.addEventListener('loadeddata', resolve, { once: true });
                  media.addEventListener('load', resolve, { once: true });
                  media.addEventListener('error', resolve, { once: true }); // Resolve on error too
              });
          }));
      });

      Promise.all(promises).then(() => {
          allItems.forEach(item => {
            let wrapper = item.parentElement;
            if (!wrapper.classList.contains('masonry-item-wrapper')) {
                wrapper = document.createElement('div');
                wrapper.className = 'masonry-item-wrapper';
                item.parentNode.insertBefore(wrapper, item);
                wrapper.appendChild(item);
            }
            resizeMasonryItem(wrapper);
          });
      });
  }

  function debounce(fn, delay) {
      let timeoutId;
      return function(...args) {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => fn.apply(this, args), delay);
      };
  }

  window.addEventListener('resize', debounce(() => {
      if (ui.feedContainer.offsetParent) resizeAllMasonryItems(ui.feedContainer);
      if (ui.searchResultsContainer.offsetParent) resizeAllMasonryItems(ui.searchResultsContainer);
      if (ui.favoritesContainer.offsetParent) resizeAllMasonryItems(ui.favoritesContainer);
  }, 250));
  // --- Fim das funções de Masonry ---

  const getApiUrl = () => "/api/media";
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return num;
  };
  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "a";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "m";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "min";
    return Math.floor(seconds) + "s";
  };
  const formatTweetContent = (text, hashtags = [], mentions = []) => {
    let formattedText = text;
    hashtags.forEach(tag => {
        const regex = new RegExp(`#${tag}`, "gi");
        formattedText = formattedText.replace(regex, `<a href="#" class="hashtag-link" data-tag="${tag}">#${tag}</a>`);
    });
    mentions.forEach(mention => {
        const regex = new RegExp(`@${mention.nick}`, "gi");
        formattedText = formattedText.replace(regex, `<a href="https://twitter.com/${mention.name}" target="_blank" class="mention-link">@${mention.nick}</a>`);
    });
    return formattedText.replace(/\n/g, '<br>');
  };
  const renderMedia = (file) => {
    const fileUrl = file.filePath;
    const isVideo = fileUrl.endsWith(".mp4") || fileUrl.endsWith(".webm");
    const altText = file.metadata?.content || fileUrl;
    if (isVideo) {
      const thumb = file.metadata?.thumb ? `/media/${file.metadata.thumb}` : '';
      return `<video src="/media/${fileUrl}" controls loop preload="metadata" poster="${thumb}" class="card-media-video"></video>`;
    } else {
      return `<img src="/media/${fileUrl}" alt="${altText}" loading="lazy" class="card-media-image">`;
    }
  };
  
  const createCardHTML = (file) => {
      const { metadata, filePath } = file;
      if (!metadata) {
          // Fallback for media without metadata
          return `
              <div class="noxss-card noxss-card--interactive" data-file-path="${filePath}">
                  ${renderMedia(file)}
                  <div class="noxss-card__body">
                      <p class="tag-list">${filePath.split("/").pop()}</p>
                  </div>
              </div>`;
      }
  
      const isFavorite = appState.favorites.includes(filePath);
      const favButtonClasses = isFavorite ? "noxss-btn--primary" : "noxss-btn--secondary";
      const authorUrl = `https://twitter.com/${metadata.author.name}`;
      const tweetUrl = `https://twitter.com/i/web/status/${metadata.tweet_id}`;
  
      return `
      <div class="noxss-card tweet-card" data-file-path="${filePath}">
          <div class="tweet-card__header">
              <a href="${authorUrl}" target="_blank" class="tweet-card__author">
                  <img src="${metadata.author.profile_image}" alt="${metadata.author.nick}" class="tweet-card__avatar">
                  <div class="tweet-card__author-info">
                      <span class="tweet-card__author-name">${metadata.author.name} ${metadata.author.verified ? '<i data-feather="check-circle" class="verified-badge"></i>' : ''}</span>
                      <span class="tweet-card__author-nick">@${metadata.author.nick}</span>
                  </div>
              </a>
              <a href="${tweetUrl}" target="_blank" class="tweet-card__timestamp">${timeAgo(metadata.date)}</a>
          </div>
          <div class="tweet-card__body">
              <p>${formatTweetContent(metadata.content, metadata.hashtags, metadata.mentions)}</p>
          </div>
          ${renderMedia(file)}
          <div class="tweet-card__footer">
              <div class="tweet-card__stats">
                  <span><i data-feather="message-circle"></i> ${formatNumber(metadata.reply_count)}</span>
                  <span><i data-feather="repeat"></i> ${formatNumber(metadata.retweet_count)}</span>
                  <span><i data-feather="heart"></i> ${formatNumber(metadata.favorite_count)}</span>
                  <span><i data-feather="bar-chart-2"></i> ${formatNumber(metadata.view_count)}</span>
              </div>
              <div class="tweet-card__actions">
                  <button class="noxss-btn noxss-btn--icon favorite-btn ${favButtonClasses}" data-path="${filePath}" aria-label="Favoritar">
                      <i data-feather="heart"></i>
                  </button>
                  <a href="/media/${filePath}" download class="noxss-btn noxss-btn--icon download-btn" aria-label="Baixar">
                      <i data-feather="download"></i>
                  </a>
              </div>
          </div>
      </div>`;
  };

  const loadPosts = async (container, searchTags = "", isSearch = false, isLoadMore = false) => {
    if (isLoading) return;
    isLoading = true;
    const state = isSearch ? searchState : feedState;
    const loadingElement = isSearch ? ui.loadingSearch : ui.loadingFeed;
    const loadMoreBtn = isSearch ? ui.loadMoreSearchBtn : ui.loadMoreBtn;
    loadingElement.style.display = "block";
    if (loadMoreBtn) loadMoreBtn.style.display = "none";

    try {
      if (!isLoadMore) {
        const response = await fetch(getApiUrl());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        state.files = data.sort((a, b) => new Date(b.metadata?.date_bookmarked) - new Date(a.metadata?.date_bookmarked)) || [];
        state.page = 0;
        container.innerHTML = "";
      }

      const searchTerms = searchTags.toLowerCase().split(" ").filter((t) => t);
      const unwanted = appState.unwantedTags.map((t) => t.toLowerCase());

      const filteredFiles = state.files.filter((file) => {
        const lowerFilePath = file.filePath.toLowerCase();
        const hasUnwanted = unwanted.some((tag) => lowerFilePath.includes(tag));
        if (hasUnwanted) return false;

        if (searchTerms.length === 0) return true;

        const matchesSearch = searchTerms.every((term) => {
            const meta = file.metadata;
            if (lowerFilePath.includes(term)) return true;
            if (!meta) return false;
            if (meta.content?.toLowerCase().includes(term)) return true;
            if (meta.hashtags?.some(tag => tag.toLowerCase().includes(term))) return true;
            if (meta.author?.name?.toLowerCase().includes(term)) return true;
            if (meta.author?.nick?.toLowerCase().includes(term)) return true;
            if (meta.mentions?.some(m => m.name.toLowerCase().includes(term) || m.nick.toLowerCase().includes(term))) return true;
            return false;
        });
        return matchesSearch;
      });

      if (!isLoadMore) {
        state.files = filteredFiles;
      }
      
      const start = state.page * POSTS_PER_PAGE;
      const end = start + POSTS_PER_PAGE;
      const filesToRender = state.files.slice(start, end);

      if (filesToRender.length === 0 && state.page === 0) container.innerHTML = '<p class="text-secondary text-center">Nenhuma mídia encontrada.</p>';
      
      filesToRender.forEach((file) => {
        container.insertAdjacentHTML("beforeend", createCardHTML(file));
      });

      state.page++;
      state.hasMore = state.files.length > end;
      if (loadMoreBtn) loadMoreBtn.style.display = state.hasMore ? "block" : "none";
      
      feather.replace();
      resizeAllMasonryItems(container);
    } catch (error) {
      console.error("Erro ao carregar posts:", error);
      container.innerHTML = `<div class="noxss-alert noxss-alert--danger">Falha ao carregar conteúdo. Tente novamente.</div>`;
    } finally {
      loadingElement.style.display = "none";
      isLoading = false;
    }
  };

  const renderFavorites = (isLoadMore = false) => {
    // This function will now use the main `loadPosts` logic by filtering `feedState`
    if (!isLoadMore) {
        favoritesState.page = 0;
        ui.favoritesContainer.innerHTML = "";
    }
    const allFiles = feedState.files.length > 0 ? feedState.files : (searchState.files.length > 0 ? searchState.files : []);
    const favoriteFiles = allFiles.filter(file => appState.favorites.includes(file.filePath));
    favoritesState.files = favoriteFiles;

    const start = favoritesState.page * POSTS_PER_PAGE;
    const end = start + POSTS_PER_PAGE;
    const favoritesToRender = favoritesState.files.slice(start, end);

    if (favoritesToRender.length === 0 && favoritesState.page === 0) {
      ui.favoritesContainer.innerHTML = '<div class="noxss-alert noxss-alert--info">Você ainda não tem favoritos.</div>';
      return;
    }

    favoritesToRender.forEach(favItem => {
        ui.favoritesContainer.insertAdjacentHTML("beforeend", createCardHTML(favItem));
    });

    favoritesState.page++;
    favoritesState.hasMore = favoritesState.files.length > end;
    feather.replace();
    resizeAllMasonryItems(ui.favoritesContainer);
  };

  const updateUILists = () => {
    ui.historyList.innerHTML = appState.history.length ? `<ul class="noxss-list noxss-list--inset">${appState.history.map((tag) => `<li class="noxss-list-item noxss-list-item--interactive" data-tag="${tag}"><div class="noxss-list-item__content"><span class="noxss-list-item__title">${tag}</span></div><div class="noxss-list-item__trailing"><button class="noxss-btn noxss-btn--icon noxss-btn--danger remove-history" data-tag="${tag}" aria-label="Remover do histórico"><i data-feather="x" class="noxss-icon"></i></button></div></li>`).join("")}</ul>` : '<div class="noxss-alert noxss-alert--info">Seu histórico de busca está vazio.</div>';
    renderFavorites();
    ui.unwantedTagsList.innerHTML = appState.unwantedTags.map((tag) => `<li class="noxss-list-item"><div class="noxss-list-item__content">${tag}</div><div class="noxss-list-item__trailing"><button class="noxss-btn noxss-btn--icon noxss-btn--danger remove-unwanted-tag" data-tag="${tag}"><i data-feather="x" class="noxss-icon"></i></button></div></li>`).join("");
    feather.replace();
  };

  function applyTheme(theme) {
    ui.htmlElement.setAttribute("data-theme", theme);
    appState.theme = theme;
    DataManager.saveState();
  }

  function initTheme() {
    ui.themeSelect.value = appState.theme;
    ui.htmlElement.setAttribute("data-theme", appState.theme);
    ui.themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));
  }

  function bindEvents() {
    ui.loadMoreBtn.addEventListener("click", () => loadPosts(ui.feedContainer, feedState.currentTags, false, true));
    ui.loadMoreSearchBtn.addEventListener("click", () => loadPosts(ui.searchResultsContainer, searchState.currentTags, true, true));
    ui.filterTypeSelect.addEventListener("change", (e) => {
      const filter = e.target.value;
      feedState.currentTags = filter === "image" ? ".jpg .jpeg .png .webp .gif" : filter === "video" ? ".mp4 .webm" : "";
      if (filter === "index") feedState.currentTags = "";
      loadPosts(ui.feedContainer, feedState.currentTags, false, false);
    });
    ui.searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      ui.autocompleteContainer.style.display = "none";
      searchState.currentTags = ui.searchInput.value;
      loadPosts(ui.searchResultsContainer, searchState.currentTags, true, false);
      if (searchState.currentTags && !appState.history.includes(searchState.currentTags)) {
        appState.history.unshift(searchState.currentTags);
        if (appState.history.length > 50) appState.history.pop();
        DataManager.saveState();
        updateUILists();
      }
    });

    document.body.addEventListener("click", (e) => {
      const target = e.target;
      // Handle hashtag clicks
      if (target.classList.contains('hashtag-link')) {
          e.preventDefault();
          const tag = target.dataset.tag;
          ui.searchInput.value = tag;
          document.querySelector('.noxss-tabs__header-button[data-tab-id="search"]').click();
          ui.searchForm.dispatchEvent(new Event("submit"));
          return;
      }
      
      const card = target.closest(".tweet-card");
      if (!card) return;

      if (target.closest(".favorite-btn")) {
        e.stopPropagation();
        const button = target.closest(".favorite-btn");
        const filePath = button.dataset.path;
        const favIndex = appState.favorites.indexOf(filePath);
        if (favIndex > -1) {
          appState.favorites.splice(favIndex, 1);
          button.classList.replace("noxss-btn--primary", "noxss-btn--secondary");
        } else {
          appState.favorites.push(filePath);
          button.classList.replace("noxss-btn--secondary", "noxss-btn--primary");
        }
        DataManager.saveState();
      } else if (!target.closest("a, button, .noxss-card__body p a")) {
        const filePath = card.dataset.filePath;
        const allFiles = [...feedState.files, ...searchState.files];
        const clickedFile = allFiles.find(f => f && f.filePath === filePath);

        if (!clickedFile || !clickedFile.metadata) return;

        ui.modalMediaContainer.innerHTML = renderMedia(clickedFile);
        
        const meta = clickedFile.metadata;
        let detailsHTML = `
            <div class="modal-profile-banner" style="background-image: url('${meta.author.profile_banner}')"></div>
            <div class="modal-profile-header">
                <img src="${meta.author.profile_image}" class="modal-profile-avatar" alt="${meta.author.nick}">
                <a href="https://twitter.com/${meta.author.name}" target="_blank" class="noxss-btn noxss-btn--secondary">Ver Perfil</a>
            </div>
            <div class="modal-profile-info">
                <h4 class="modal-author-name">${meta.author.name} ${meta.author.verified ? '<i data-feather="check-circle" class="verified-badge"></i>' : ''}</h4>
                <p class="modal-author-nick text-secondary">@${meta.author.nick}</p>
                <p class="modal-author-desc">${formatTweetContent(meta.author.description)}</p>
                <p class="text-secondary small">Entrou em: ${new Date(meta.author.date).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                <div class="modal-author-stats">
                    <span><strong>${formatNumber(meta.author.friends_count)}</strong> Seguindo</span>
                    <span><strong>${formatNumber(meta.author.followers_count)}</strong> Seguidores</span>
                </div>
            </div>
            <hr class="my-4">
            <div class="modal-tweet-content">
                <p>${formatTweetContent(meta.content, meta.hashtags, meta.mentions)}</p>
                <p class="text-secondary small">${new Date(meta.date).toLocaleString('pt-BR')}</p>
                <div class="tweet-card__stats modal-stats">
                    <span><i data-feather="message-circle"></i> ${formatNumber(meta.reply_count)}</span>
                    <span><i data-feather="repeat"></i> ${formatNumber(meta.retweet_count)}</span>
                    <span><i data-feather="heart"></i> ${formatNumber(meta.favorite_count)}</span>
                    <span><i data-feather="bar-chart-2"></i> ${formatNumber(meta.view_count)}</span>
                </div>
                <a href="https://twitter.com/i/web/status/${meta.tweet_id}" target="_blank" class="noxss-btn noxss-btn--primary u-mt-3">Ver no Twitter</a>
            </div>
        `;
        ui.modalDetailsContainer.innerHTML = detailsHTML;
        
        Noxss.Modals.open("postModal");
        feather.replace();
      }
    });

    // Simplified history and unwanted tags events
    document.body.addEventListener('click', e => {
      const historyItem = e.target.closest('.remove-history');
      if(historyItem) {
        appState.history = appState.history.filter(h => h !== historyItem.dataset.tag);
        DataManager.saveState();
        updateUILists();
        return;
      }
      const unwantedItem = e.target.closest('.remove-unwanted-tag');
      if(unwantedItem) {
        appState.unwantedTags = appState.unwantedTags.filter(t => t !== unwantedItem.dataset.tag);
        DataManager.saveState();
        updateUILists();
      }
    });

    getEl("clear-history").addEventListener("click", () => {
      if (confirm("Tem certeza?")) {
        appState.history = [];
        DataManager.saveState();
        updateUILists();
      }
    });
    getEl("clear-favorites").addEventListener("click", () => {
      if (confirm("Tem certeza?")) {
        appState.favorites = [];
        DataManager.saveState();
        updateUILists();
      }
    });
    getEl("add-unwanted-tag-btn").addEventListener("click", () => {
      const input = getEl("unwanted-tag-input");
      if (input.value.trim() && !appState.unwantedTags.includes(input.value.trim().toLowerCase())) {
        appState.unwantedTags.push(input.value.trim().toLowerCase());
        DataManager.saveState();
        updateUILists();
        input.value = "";
      }
    });

    // Backup/Restore listeners
    const uploadInput = getEl("upload-json-input");
    getEl("download-json-btn").addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([DataManager.exportData()], { type: "application/json" }));
        a.download = "media_vault_backup.json";
        a.click();
        URL.revokeObjectURL(a.href);
    });
    getEl("copy-json-btn").addEventListener("click", e => {
        navigator.clipboard.writeText(DataManager.exportData()).then(() => {
            const originalHtml = e.currentTarget.innerHTML;
            e.currentTarget.innerHTML = '<i data-feather="check"></i> Copiado!';
            feather.replace();
            setTimeout(() => { e.currentTarget.innerHTML = originalHtml; feather.replace(); }, 2000);
        });
    });
    getEl("import-backup-btn").addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = res => {
            const jsonString = res.target.result;
            Noxss.Modals.open("modal-restore-choice");
            const handleMerge = () => {
                if (DataManager.mergeData(jsonString)) {
                    Noxss.Toasts.show({ message: "Backup mesclado!", status: "success" });
                    updateUILists();
                } else {
                    Noxss.Toasts.show({ message: "Arquivo de backup inválido.", status: "danger" });
                }
                Noxss.Modals.close("modal-restore-choice");
            };
            const handleOverwrite = () => {
                if (DataManager.overwriteData(jsonString)) {
                    Noxss.Toasts.show({ message: "Backup restaurado!", status: "success" });
                    initTheme();
                    updateUILists();
                } else {
                    Noxss.Toasts.show({ message: "Arquivo de backup inválido.", status: "danger" });
                }
                Noxss.Modals.close("modal-restore-choice");
            };
            getEl("merge-btn").addEventListener("click", handleMerge, { once: true });
            getEl("overwrite-btn").addEventListener("click", handleOverwrite, { once: true });
        };
        reader.readAsText(file);
    });
  }

  const init = () => {
    initTheme();
    loadPosts(ui.feedContainer, feedState.currentTags, false, false);
    updateUILists();
    bindEvents();
  };

  init();
});
