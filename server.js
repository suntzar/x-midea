const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

// Porta padrão da aplicação
const port = process.env.PORT || 3000;

// Domínio externo (opcional, apenas para aparecer no console)
// Ele não interfere no funcionamento
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || "http://noxss-x.duckdns.org";

// Middleware para parsing de JSON (caso expanda API no futuro)
app.use(express.json());

// Servir front-end estático em /bookmarks (oculta /public)
app.use('/bookmarks', express.static(path.join(__dirname, 'public')));

// Servir mídias de forma segura em /media (oculta caminho real de TwitterBookmarks)
app.use('/media', express.static(path.join(__dirname, 'TwitterBookmarks')));

// Rota API para listar todas as mídias (recursivo, retorna JSON com caminhos relativos)
app.get('/api/media', (req, res) => {
  const mediaDir = path.join(__dirname, 'TwitterBookmarks');

  // Função recursiva para listar arquivos
  function listFiles(dir, baseDir = mediaDir) {
    let filesList = [];
    const files = fs.readdirSync(dir, { withFileTypes: true });

    files.forEach(file => {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        // Recursão para subfolders
        filesList = filesList.concat(listFiles(fullPath, baseDir));
      } else {
        const fileName = file.name;
        // Ignore JSON and _text.txt files themselves
        if (fileName.endsWith('.json') || fileName.endsWith('_text.txt')) {
          return;
        }

        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        let metadata = null;

        // Try to read corresponding JSON metadata file
        const jsonFilePath = fullPath + '.json';
        if (fs.existsSync(jsonFilePath)) {
          try {
            const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
            metadata = JSON.parse(jsonContent);
          } catch (e) {
            console.error(`Error reading or parsing JSON for ${fileName}:`, e);
          }
        }
        filesList.push({ filePath: relPath, metadata: metadata });
      }
    });
    return filesList;
  }

  try {
    const mediaFiles = listFiles(mediaDir);
    res.json(mediaFiles);
  } catch (err) {
    console.error('Erro ao listar mídias:', err);
    res.status(500).json({ error: 'Erro ao listar mídias' });
  }
});

// Manipulador de erros global (boa prática)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Algo deu errado!');
});

app.listen(port, () => {
  console.log(`Servidor rodando internamente em: http://127.0.0.1:${port}/bookmarks`);
  console.log(`Acesse externamente via proxy reverso em: ${PUBLIC_DOMAIN}/bookmarks`);
});
