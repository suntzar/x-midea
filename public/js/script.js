document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // Inicializa os ícones Feather com um pequeno atraso para renderizar elementos dinâmicos.
  if (window.feather) {
    setTimeout(() => feather.replace(), 200);
  }

  const htmlEl = document.documentElement;
  function updateAccentColor(color) {
    htmlEl.setAttribute("data-noxss-palette-gen", color);
  }

  // ===================================================
  // MÓDULO DE GESTÃO DE ESTADO (DataManager)
  // Centraliza todas as operações de dados do aplicativo.
  // ===================================================
  const DataManager = (() => {
    const APP_DATA_KEY = "mediaAppData";
    const defaultState = {
      theme: "sakura-dark",
      favorites: [], // Armazenará caminhos de arquivo
      history: [], // Armazenará termos de busca
      unwantedTags: [], // Manteremos para filtragem de nome de arquivo
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
    htmlElement: document.documentElement,
  };
  let currentPage = 0,
    isLoading = false;

  const POSTS_PER_PAGE = 5;

  let feedState = { files: [], page: 0, hasMore: true, currentTags: "" };
  let searchState = { files: [], page: 0, hasMore: true, currentTags: "" };
  let favoritesState = { files: [], page: 0, hasMore: true };

  // ===================================================
  // Funções de Lógica de Negócio e Renderização
  // ===================================================
  const getApiUrl = () => "/api/media";

  const renderMedia = (fileUrl, tags) => {
    const isVideo = fileUrl.endsWith(".mp4") || fileUrl.endsWith(".webm");
    const mediaTag = isVideo ? `<video src="/media/${fileUrl}" controls preload="metadata" style="width:100%; height:auto; display:block; border-radius: var(--noxss-border-radius-base);"></video>` : `<img src="/media/${fileUrl}" alt="${tags}" loading="lazy" class="noxss-card__media">`;
    return isVideo ? `<div class="p-0">${mediaTag}</div>` : mediaTag;
  };

  const loadPosts = async (container, searchTags = "", isSearch = false, isLoadMore = false) => {
    if (isLoading) return;
    isLoading = true;

    const state = isSearch ? searchState : feedState;
    const loadingElement = isSearch ? ui.loadingSearch : ui.loadingFeed;
    const loadMoreBtn = isSearch ? ui.loadMoreSearchBtn : ui.loadMoreBtn;

    loadingElement.style.display = "block";
    loadMoreBtn.style.display = "none";

    try {
      if (!isLoadMore) {
        const response = await fetch(getApiUrl());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        state.files = data.files || [];
        state.page = 0;
        container.innerHTML = "";
      }
      const searchTerms = searchTags
        .toLowerCase()
        .split(" ")
        .filter((t) => t);
      const unwanted = appState.unwantedTags.map((t) => t.toLowerCase());

      let filteredFiles = state.files.filter((file) => {
        const lowerFile = file.toLowerCase();
        if (lowerFile.endsWith(".json")) return false; // Ignora arquivos .json
        const hasUnwanted = unwanted.some((tag) => lowerFile.includes(tag));
        const matchesSearch = searchTerms.every((term) => lowerFile.includes(term));
        return !hasUnwanted && matchesSearch;
      });

      if (!isLoadMore && !isSearch) {
        // Aleatorizar o feed
        for (let i = filteredFiles.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [filteredFiles[i], filteredFiles[j]] = [filteredFiles[j], filteredFiles[i]];
        }
        state.files = filteredFiles; // Salva a ordem aleatória
      } else if (!isLoadMore) {
        state.files = filteredFiles;
      }

      const start = state.page * POSTS_PER_PAGE;
      const end = start + POSTS_PER_PAGE;
      const filesToRender = state.files.slice(start, end);

      if (filesToRender.length === 0 && state.page === 0) container.innerHTML = '<p class="text-secondary text-center">Nenhuma mídia encontrada.</p>';

      filesToRender.forEach((file) => {
        const isFavorite = appState.favorites.includes(file);
        const favButtonClasses = isFavorite ? "noxss-btn--primary" : "noxss-btn--secondary";

        const cardHTML = `
                                <div class="noxss-card noxss-card--interactive" data-file-path="${file}">
                                    ${renderMedia(file, file)}
                                    <div class="noxss-card__body">
                                        <p class="tag-list">${file.split("/").pop()}</p>
                                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                            <a href="/media/${file}" download class="noxss-btn noxss-btn--secondary download-btn" aria-label="Baixar"><i data-feather="download" class="noxss-icon"></i></a>
                                            <button class="noxss-btn noxss-btn--secondary fullscreen-btn" aria-label="Tela Cheia"><i data-feather="maximize" class="noxss-icon"></i></button>
                                            <button class="noxss-btn ${favButtonClasses} favorite-btn" data-path="${file}" aria-label="Favoritar"><i data-feather="heart" class="noxss-icon"></i></button>
                                        </div>
                                    </div>
                                </div>`;
        container.insertAdjacentHTML("beforeend", cardHTML);
      });

      state.page++;
      state.hasMore = state.files.length > end;

      if (state.hasMore) {
        loadMoreBtn.style.display = "block";
      } else {
        loadMoreBtn.style.display = "none";
      }
      feather.replace();
    } catch (error) {
      console.error("Erro ao carregar posts:", error);
      container.innerHTML = `<div class="noxss-alert noxss-alert--danger"><div class="noxss-alert__icon"><i data-feather="alert-triangle" class="noxss-icon"></i></div><div class="noxss-alert__content">Falha ao carregar conteúdo. Tente novamente.</div></div>`;
      feather.replace();
    } finally {
      loadingElement.style.display = "none";
      isLoading = false;
    }
  };

  const renderFavorites = (isLoadMore = false) => {
    if (!isLoadMore) {
      favoritesState.page = 0;
      ui.favoritesContainer.innerHTML = "";
    }

    const sortedFavorites = [...appState.favorites].sort().reverse();
    favoritesState.files = sortedFavorites;

    const start = favoritesState.page * POSTS_PER_PAGE;
    const end = start + POSTS_PER_PAGE;
    const favoritesToRender = favoritesState.files.slice(start, end);

    if (favoritesToRender.length === 0 && favoritesState.page === 0) {
      ui.favoritesContainer.innerHTML = '<div class="noxss-alert noxss-alert--info">Você ainda não tem favoritos.</div>';
      return;
    }

    const favoritesHTML = favoritesToRender.map((favPath) => `<div class="noxss-card" data-file-path="${favPath}">${renderMedia(favPath, favPath)}<div class="noxss-card__body"><p class="tag-list">${favPath.split("/").pop()}</p><div style="display: flex; flex-wrap: wrap; gap: 0.5rem;"><a href="/media/${favPath}" download class="noxss-btn noxss-btn--secondary download-btn"><i data-feather="download" class="noxss-icon"></i></a><button class="noxss-btn noxss-btn--secondary fullscreen-btn"><i data-feather="maximize" class="noxss-icon"></i></button><button class="noxss-btn noxss-btn--danger remove-favorite" data-path="${favPath}"><i data-feather="trash-2" class="noxss-icon"></i></button></div></div></div>`).join("");
    ui.favoritesContainer.insertAdjacentHTML("beforeend", favoritesHTML);

    favoritesState.page++;
    favoritesState.hasMore = favoritesState.files.length > end;
    // Note: Favorites don't have a "load more" button in this implementation, but this logic supports it if you add one.
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
    ui.loadMoreBtn.addEventListener("click", () => {
      loadPosts(ui.feedContainer, feedState.currentTags, false, true);
    });

    ui.loadMoreSearchBtn.addEventListener("click", () => {
      loadPosts(ui.searchResultsContainer, searchState.currentTags, true, true);
    });

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

    document.addEventListener("click", (e) => {
      if (!ui.searchForm.contains(e.target)) ui.autocompleteContainer.style.display = "none";
    });

    document.addEventListener("click", (e) => {
      const target = e.target;
      const card = target.closest(".noxss-card");
      const listItem = target.closest(".noxss-list-item");
      if (!card && !listItem) return;

      if (target.closest(".favorite-btn")) {
        e.stopPropagation();
        const button = target.closest(".favorite-btn");
        const filePath = card.dataset.filePath;
        const favIndex = appState.favorites.indexOf(filePath);
        if (favIndex > -1) {
          appState.favorites.splice(favIndex, 1);
          button.classList.remove("noxss-btn--primary");
          button.classList.add("noxss-btn--secondary");
        } else {
          appState.favorites.push(filePath);
          button.classList.remove("noxss-btn--secondary");
          button.classList.add("noxss-btn--primary");
        }
        DataManager.saveState();
      } else if (target.closest(".remove-favorite")) {
        const pathToRemove = card.dataset.filePath;
        appState.favorites = appState.favorites.filter((fav) => fav !== pathToRemove);
        DataManager.saveState();
        // Re-render favorites to remove the card
        updateUILists();
      } else if (target.closest(".remove-history")) {
        const tagToRemove = target.closest(".remove-history").dataset.tag;
        appState.history = appState.history.filter((h) => h !== tagToRemove);
        DataManager.saveState();
        updateUILists();
      } else if (listItem && listItem.dataset.tag && !target.closest(".remove-history")) {
        // Clicar em um item do histórico
        const tag = listItem.dataset.tag;
        ui.searchInput.value = tag;
        // Simula a troca de aba para busca
        document.querySelector('.noxss-tabs__header-button[data-tab-id="search"]').click();
        ui.searchForm.dispatchEvent(new Event("submit"));
      } else if (card && !target.closest("button, i, a, video")) {
        const mediaUrl = card.querySelector(".download-btn").dataset.url;
        const tags = card.querySelector(".tag-list").textContent;
        const modalMediaContainer = query("#postModal .media-container");
        const isVideo = mediaUrl.endsWith(".mp4") || mediaUrl.endsWith(".webm");
        modalMediaContainer.innerHTML = isVideo ? `<video src="${mediaUrl}" controls autoplay style="width:100%; height:auto; display:block;"></video>` : `<img src="${mediaUrl}" style="width:100%; height:auto; display:block;">`;
        getEl("modal-tags").textContent = tags;
        Noxss.Modals.open("postModal");
      }
    });

    getEl("clear-history").addEventListener("click", () => {
      if (confirm("Tem certeza que deseja limpar todo o histórico de busca?")) {
        appState.history = [];
        DataManager.saveState();
        updateUILists();
      }
    });
    getEl("clear-favorites").addEventListener("click", () => {
      if (confirm("Tem certeza que deseja limpar todos os favoritos?")) {
        appState.favorites = [];
        DataManager.saveState();
        updateUILists();
      }
    });
    getEl("sort-favorites").addEventListener("change", updateUILists);
    getEl("download-json-btn").addEventListener("click", () => {
      const blob = new Blob([DataManager.exportData()], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob); // Cria um URL temporário para o blob
      const a = document.createElement("a"); // Cria um elemento <a>
      a.href = url; // Define o href como o URL do blob
      a.download = "media_vault_backup.json"; // Define o nome do arquivo para download
      a.click();
      URL.revokeObjectURL(url);
    });
    getEl("copy-json-btn").addEventListener("click", (e) => {
      navigator.clipboard.writeText(DataManager.exportData()).then(() => {
        const btn = e.currentTarget;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i data-feather="check" class="noxss-icon"></i> Copiado!';
        feather.replace();
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          feather.replace();
        }, 2000);
      });
    });

    const uploadInput = getEl("upload-json-input");
    getEl("import-backup-btn").addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (res) => {
        const jsonString = res.target.result;
        Noxss.Modals.open("modal-restore-choice");

        const handleMerge = () => {
          if (DataManager.mergeData(jsonString)) {
            Noxss.Toasts.show({
              message: "Backup mesclado com sucesso!",
              status: "success",
            });
            updateUILists();
          } else {
            Noxss.Toasts.show({
              message: "Arquivo de backup inválido.",
              status: "danger",
            });
          }
          Noxss.Modals.close();
          e.target.value = null;
        };

        const handleOverwrite = () => {
          if (DataManager.overwriteData(jsonString)) {
            Noxss.Toasts.show({
              message: "Backup restaurado com sucesso!",
              status: "success",
            });
            initTheme();
            updateUILists();
          } else {
            Noxss.Toasts.show({
              message: "Arquivo de backup inválido.",
              status: "danger",
            });
          }
          Noxss.Modals.close();
          e.target.value = null;
        };

        getEl("merge-btn").addEventListener("click", handleMerge, {
          once: true,
        });
        getEl("overwrite-btn").addEventListener("click", handleOverwrite, {
          once: true,
        });
      };
      reader.readAsText(file);
    });

    getEl("add-unwanted-tag-btn").addEventListener("click", () => {
      const input = getEl("unwanted-tag-input");
      const tag = input.value.trim().toLowerCase();
      if (tag && !appState.unwantedTags.includes(tag)) {
        appState.unwantedTags.push(tag);
        DataManager.saveState();
        updateUILists();
        input.value = "";
      }
    });
    getEl("unwanted-tags-list").addEventListener("click", (e) => {
      if (e.target.closest(".remove-unwanted-tag")) {
        const tagToRemove = e.target.closest(".remove-unwanted-tag").dataset.tag;
        appState.unwantedTags = appState.unwantedTags.filter((t) => t !== tagToRemove);
        DataManager.saveState();
        updateUILists();
      }
    });
  }

  const init = () => {
    initTheme();
    loadPosts(ui.feedContainer, feedState.currentTags, false, false);
    updateUILists();
    bindEvents();
    //updateAccentColor("#63c7d6");
  };

  init();
});
