gallery-dl \
  --cookies cookies.txt \
  -o "video=orig" \
  -o "image=orig" \
  -o "gif=orig" \
  --write-metadata \
  --sleep-request 1-3 \
  --retries 20 \
  --range 1-9999999 \
  --directory "TwitterBookmarks" \
  "https://br.pinterest.com/fflorentino/pixel-art/"
