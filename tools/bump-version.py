#!/usr/bin/env python3
"""Setzt eine neue Versionsnummer an alle Skript-/CSS-Verweise, damit Handys keine alte Version aus dem Cache laden."""
import re, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime('%Y%m%d%H%M')
for f in [root / 'index.html', *sorted((root / 'js').glob('*.js'))]:
    s = f.read_text()
    s = re.sub(r'((?:src|href)="(?:js|css)/[\w.-]+\.(?:js|css))(\?v=\d+)?"', rf'\1?v={v}"', s)
    s = re.sub(r'(<meta name="app-version" content=")\d+(")', rf'\g<1>{v}\2', s)
    s = re.sub(r"(from '\./[\w.-]+\.js)(\?v=\d+)?'", rf"\1?v={v}'", s)
    f.write_text(s)
(root / 'version.txt').write_text(v + '\n')
print('Version', v)
