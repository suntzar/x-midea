gallery-dl \
  --cookies cookies.txt \
  -o "video=orig" \
  -o "image=orig" \
  -o "gif=orig" \
  --write-metadata \
  --sleep-request 1-3 \
  --retries 20 \
  --range 1-9999999 \
  --filename "{category}/{date:%Y-%m-%d}_{username|'unknown'}_{tweet_id|'unknown'}_{content|trunc(50)|slugify|'no_description'}_{num}.{extension}" \
  --directory "TwitterBookmarks" \
  "https://twitter.com/i/bookmarks"
