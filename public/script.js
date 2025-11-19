document.addEventListener('DOMContentLoaded', () => {
  const mediaList = document.getElementById('media-list');

  // Fetch da API para listar mídias
  fetch('/api/media')
    .then(response => {
      if (!response.ok) {
        throw new Error('Erro na requisição');
      }
      return response.json();
    })
    .then(data => {
      data.files.forEach(file => {
        const li = document.createElement('li');
        
        // Detectar tipo de mídia e criar elemento apropriado
        const ext = file.split('.').pop().toLowerCase();
        let mediaElement;
        
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
          // Imagem
          mediaElement = document.createElement('img');
          mediaElement.src = `/media/${file}`;
          mediaElement.alt = file;
          mediaElement.loading = 'lazy'; // Boa prática para performance
          mediaElement.style.maxWidth = '200px'; // Estilo mínimo para não quebrar layout
        } else if (['mp4', 'webm'].includes(ext)) {
          // Vídeo
          mediaElement = document.createElement('video');
          mediaElement.src = `/media/${file}`;
          mediaElement.controls = true;
          mediaElement.style.maxWidth = '200px';
        } else if (ext === 'gif') {
          // GIF
          mediaElement = document.createElement('img');
          mediaElement.src = `/media/${file}`;
          mediaElement.alt = file;
          mediaElement.loading = 'lazy';
          mediaElement.style.maxWidth = '200px';
        } else {
          // Outro (fallback para link)
          mediaElement = document.createElement('a');
          mediaElement.href = `/media/${file}`;
          mediaElement.textContent = file;
        }
        
        li.appendChild(mediaElement);
        mediaList.appendChild(li);
      });
    })
    .catch(error => {
      console.error('Erro ao carregar mídias:', error);
      mediaList.innerHTML = '<li>Erro ao carregar lista de mídias.</li>';
    });
});
