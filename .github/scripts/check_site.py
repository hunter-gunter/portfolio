"""Vérifie le dossier publié avant le déploiement.

Usage : python3 .github/scripts/check_site.py <dossier>

- aucun PDF (le CV contient des données personnelles) ;
- JSON-LD de index.html valide ;
- sitemap.xml bien formé ;
- toutes les ressources locales (src, href, srcset) existent.
"""

import json
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

BASE_PATH = "/portfolio/"


class Refs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.jsonld = []
        self._in_jsonld = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for name in ("src", "href"):
            if attrs.get(name):
                self.refs.append(attrs[name])
        if attrs.get("srcset"):
            self.refs += [c.strip().split()[0] for c in attrs["srcset"].split(",") if c.strip()]
        self._in_jsonld = tag == "script" and attrs.get("type") == "application/ld+json"

    def handle_endtag(self, tag):
        self._in_jsonld = False

    def handle_data(self, data):
        if self._in_jsonld:
            self.jsonld.append(data)


def local_target(root, page, ref):
    parts = urlsplit(ref)
    if parts.scheme or parts.netloc or not parts.path:
        return None  # lien externe, mailto:, tel: ou ancre
    path = parts.path
    if path.startswith(BASE_PATH):
        target = root / path[len(BASE_PATH):]
    elif path.startswith("/"):
        target = root / path.lstrip("/")
    else:
        target = page.parent / path
    return target / "index.html" if path.endswith("/") else target


def main():
    root = Path(sys.argv[1]).resolve()
    errors = []

    errors += [f"PDF publié : {p.relative_to(root)}" for p in root.rglob("*.pdf")]

    try:
        ET.parse(root / "sitemap.xml")
    except ET.ParseError as e:
        errors.append(f"sitemap.xml invalide : {e}")

    for page in root.glob("*.html"):
        parser = Refs()
        parser.feed(page.read_text(encoding="utf-8"))
        for block in parser.jsonld:
            try:
                json.loads(block)
            except json.JSONDecodeError as e:
                errors.append(f"{page.name} : JSON-LD invalide : {e}")
        for ref in parser.refs:
            target = local_target(root, page, ref)
            if target and not target.exists():
                errors.append(f"{page.name} : ressource introuvable : {ref}")

    for e in errors:
        print(f"::error::{e}")
    if errors:
        sys.exit(1)
    print("Site OK")


if __name__ == "__main__":
    main()
