#!/usr/bin/env python3
"""Sube la versión de la web antes de publicar.

Cambia a la vez el nombre de la caché del service worker (sw.js) y el
«?v=N» de los estilos y scripts de index.html. Así cada móvil descarga
los archivos nuevos en vez de usar los que tenía guardados.
Uso: python3 tools/bump-version.py
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sw = root / 'sw.js'
src = sw.read_text()
n = int(re.search(r"const CACHE = 'mn-v(\d+)';", src).group(1)) + 1
sw.write_text(re.sub(r"const CACHE = 'mn-v\d+';", f"const CACHE = 'mn-v{n}';", src))

index = root / 'index.html'
html = index.read_text()
html = re.sub(r'((?:href|src)="(?:css|js)/[\w.-]+\.(?:css|js))(?:\?v=\d+)?"', rf'\1?v={n}"', html)
index.write_text(html)
print(f'Versión {n}')
