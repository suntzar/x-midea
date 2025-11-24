import os
import re

# pasta onde estão os arquivos
folder = "TwitterBookmarks"

# regex para identificar arquivos que DEVEM ser removidos
# começa com twitter_ e segue qualquer padrão
pattern = re.compile(r"^twitter_.*")

for filename in os.listdir(folder):
    if pattern.match(filename):
        path = os.path.join(folder, filename)
        print(f"Removendo: {path}")
        os.remove(path)

print("Finalizado.")
