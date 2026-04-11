#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = Path(__file__).resolve().parent

TYPE_TO_FOLDER = {
    "character": "characters",
    "location": "locations",
    "organization": "organizations",
    "event": "events",
    "artifact": "artifacts",
    "creature": "creatures",
    "concept": "concepts",
}


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def clean_string(value: Any) -> str:
    return str(value or "").strip()


def slugify(value: str) -> str:
    value = clean_string(value).lower()
    value = "".join(ch for ch in value if ch.isalnum() or ch in {" ", "_", "-"})
    value = value.replace("_", "-").replace(" ", "-")
    while "--" in value:
        value = value.replace("--", "-")
    return value.strip("-")


def normalize_type(value: Any) -> str:
    aliases = {
        "character": "character",
        "characters": "character",
        "personaje": "character",
        "personajes": "character",
        "location": "location",
        "locations": "location",
        "localizacion": "location",
        "localizaciones": "location",
        "lugar": "location",
        "lugares": "location",
        "organization": "organization",
        "organizations": "organization",
        "organizacion": "organization",
        "organizaciones": "organization",
        "event": "event",
        "events": "event",
        "evento": "event",
        "eventos": "event",
        "artifact": "artifact",
        "artifacts": "artifact",
        "artefacto": "artifact",
        "artefactos": "artifact",
        "creature": "creature",
        "creatures": "creature",
        "criatura": "creature",
        "criaturas": "creature",
        "concept": "concept",
        "concepts": "concept",
        "concepto": "concept",
        "conceptos": "concept",
    }
    return aliases.get(clean_string(value).lower(), clean_string(value).lower())


def normalize_publication_status(value: Any, default: str = "published") -> str:
    normalized = clean_string(value).lower() or default
    return "draft" if normalized == "draft" else "published"


def normalize_publication_visibility(value: Any, default: str = "public") -> str:
    normalized = clean_string(value).lower() or default
    return "private" if normalized == "private" else "public"


def init_firestore(service_account_path: Path) -> Any:
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Falta la dependencia 'firebase-admin'. Ejecuta: "
            "python -m pip install -r requirements-wiki-publish.txt"
        ) from exc

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(service_account_path))
        firebase_admin.initialize_app(cred)
    return firestore.client()


def load_wiki_config(wiki: str) -> dict[str, Any]:
    config_path = CONFIG_DIR / f"config_{wiki}.json"
    if not config_path.exists():
        raise FileNotFoundError(f"No existe config para wiki '{wiki}': {config_path}")
    return read_json(config_path, {})


def get_document(db: Any, path: str) -> dict[str, Any]:
    snapshot = db.document(path).get()
    return snapshot.to_dict() if snapshot.exists else {}


def get_collection_docs(db: Any, collection_name: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for doc in db.collection(collection_name).stream():
        result[doc.id] = doc.to_dict() or {}
    return result


def remove_if_empty_directory(path: Path, stop_at: Path) -> None:
    current = path
    while current != stop_at and current.exists():
        if any(current.iterdir()):
            return
        current.rmdir()
        current = current.parent


def clean_orphan_json_files(data_root: Path, keep_files: set[Path]) -> None:
    for json_file in data_root.rglob("*.json"):
        if json_file not in keep_files:
            json_file.unlink()
            remove_if_empty_directory(json_file.parent, data_root)


def clean_orphan_html_files(wiki_root: Path, keep_names: set[str], protected_html: list[str]) -> None:
    protected = {name.lower() for name in protected_html}
    keep = {name.lower() for name in keep_names}
    for html_file in wiki_root.glob("*.html"):
        name = html_file.name.lower()
        if name in protected:
            continue
        if name not in keep:
            html_file.unlink()


def run_generator(generator_script: Path) -> None:
    if not generator_script.exists():
        raise FileNotFoundError(f"No existe generador: {generator_script}")
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(generator_script),
        ],
        cwd=str(ROOT),
        check=True,
    )


def section_to_folder(section: str) -> str:
    normalized = slugify(section)
    return normalized or "misc"


def get_lucifer_entry_path(entry: dict[str, Any], doc_payload: dict[str, Any], entry_id: str) -> str:
    explicit = clean_string(entry.get("path"))
    if explicit:
        return explicit.replace("\\", "/").lstrip("/")
    section = clean_string(doc_payload.get("section")) or clean_string(entry.get("section"))
    folder = section_to_folder(section) if section else "misc"
    return f"{folder}/{entry_id}.json"


def sync_lucifer(config: dict[str, Any], db: Any) -> dict[str, Any]:
    wiki_root = ROOT / config["local_root"]
    data_root = wiki_root / config.get("data_dir", "data")
    local_index_path = data_root / "index.json"

    firebase_index = get_document(db, config["firestore_index_document"])
    docs_map = get_collection_docs(db, config["firestore_collection"])
    raw_entries = firebase_index.get("entries")
    if not isinstance(raw_entries, list):
        raw_entries = []

    entries_by_id: dict[str, dict[str, Any]] = {}
    for raw in raw_entries:
        if not isinstance(raw, dict):
            continue
        entry_id = clean_string(raw.get("id"))
        if not entry_id:
            continue
        entries_by_id[entry_id] = dict(raw)

    for doc_id, payload in docs_map.items():
        if doc_id not in entries_by_id:
            entries_by_id[doc_id] = {
                "id": doc_id,
                "title": clean_string(payload.get("title") or payload.get("name") or doc_id),
                "type": normalize_type(payload.get("type")),
                "section": clean_string(payload.get("section")),
                "subsection": clean_string(payload.get("subsection")),
                "excerpt": clean_string(payload.get("excerpt") or payload.get("description")),
                "image": clean_string(payload.get("image")),
                "status": normalize_publication_status((payload.get("publication") or {}).get("status"), "published"),
                "visibility": normalize_publication_visibility((payload.get("publication") or {}).get("visibility"), "public"),
            }

    synchronized_entries: list[dict[str, Any]] = []
    keep_json_files: set[Path] = {local_index_path}
    html_keep_names: set[str] = set()

    for entry_id in sorted(entries_by_id.keys()):
        if entry_id not in docs_map:
            continue
        entry = entries_by_id[entry_id]
        payload = docs_map[entry_id]

        slug = clean_string(entry.get("slug")) or clean_string(payload.get("slug")) or slugify(entry_id)
        title = clean_string(entry.get("title")) or clean_string(payload.get("title") or payload.get("name") or entry_id)
        entry_type = normalize_type(entry.get("type") or payload.get("type"))
        section = clean_string(entry.get("section")) or clean_string(payload.get("section"))
        subsection = clean_string(entry.get("subsection")) or clean_string(payload.get("subsection"))
        excerpt = clean_string(entry.get("excerpt")) or clean_string(payload.get("excerpt") or payload.get("description"))
        image = clean_string(entry.get("image")) or clean_string(payload.get("image"))
        status = normalize_publication_status(
            entry.get("status") or (payload.get("publication") or {}).get("status"),
            "published",
        )
        visibility = normalize_publication_visibility(
            entry.get("visibility") or (payload.get("publication") or {}).get("visibility"),
            "public",
        )
        if not (status == "published" and visibility == "public"):
            continue

        relative_json_path = get_lucifer_entry_path(entry, payload, entry_id)
        local_payload_path = data_root / Path(relative_json_path)
        write_json(local_payload_path, payload)
        keep_json_files.add(local_payload_path)

        synchronized_entries.append(
            {
                "id": entry_id,
                "slug": slug,
                "title": title,
                "type": entry_type,
                "section": section,
                "subsection": subsection,
                "excerpt": excerpt,
                "image": image,
                "path": relative_json_path.replace("\\", "/"),
                "status": status,
                "visibility": visibility,
            }
        )

        html_keep_names.add(f"{slug}.html")

    write_json(local_index_path, {"entries": synchronized_entries})
    clean_orphan_json_files(data_root, keep_json_files)

    run_generator(ROOT / config["generator_script"])
    clean_orphan_html_files(wiki_root, html_keep_names, config.get("protected_html", ["index.html"]))

    return {
        "entries": len(synchronized_entries),
        "published_html": len(html_keep_names),
    }


def normalize_typed_index(data: dict[str, Any]) -> dict[str, list[str]]:
    normalized: dict[str, list[str]] = {}
    for key, value in (data or {}).items():
        if not isinstance(value, list):
            continue
        clean_ids = []
        seen = set()
        for item in value:
            entry_id = clean_string(item)
            if not entry_id:
                continue
            if entry_id in seen:
                continue
            seen.add(entry_id)
            clean_ids.append(entry_id)
        normalized[key] = sorted(clean_ids)
    if "characters" not in normalized:
        normalized["characters"] = []
    if "locations" not in normalized:
        normalized["locations"] = []
    if "organizations" not in normalized:
        normalized["organizations"] = []
    return normalized


def type_key_to_folder(type_key: str) -> str:
    key = clean_string(type_key).lower()
    if key.endswith("s"):
        return key
    return TYPE_TO_FOLDER.get(key, f"{key}s")


def resolve_nimroel_doc_path(entry_id: str, payload: dict[str, Any], index_key: str) -> str:
    doc_type = normalize_type(payload.get("type"))
    folder = TYPE_TO_FOLDER.get(doc_type)
    if not folder:
        folder = type_key_to_folder(index_key)
    return f"{folder}/{entry_id}.json"


def get_nimroel_entry_title(entry_id: str, payload: dict[str, Any]) -> str:
    return clean_string(payload.get("title") or payload.get("name") or entry_id)


def get_nimroel_entry_excerpt(payload: dict[str, Any]) -> str:
    content = payload.get("content")
    if isinstance(content, dict):
        summary = clean_string(content.get("summary"))
        if summary:
            return summary
    return clean_string(payload.get("summary") or payload.get("description"))


def sync_nimroel(config: dict[str, Any], db: Any) -> dict[str, Any]:
    wiki_root = ROOT / config["local_root"]
    data_root = wiki_root / config.get("data_dir", "data")
    local_index_path = data_root / "index.json"
    public_index_path = ROOT / config.get("public_index_file", "lore/nimroel/data/public-index.json")

    firebase_index = normalize_typed_index(get_document(db, config["firestore_index_document"]))
    docs_map = get_collection_docs(db, config["firestore_collection"])

    keep_json_files: set[Path] = {local_index_path, public_index_path}
    public_entries: list[dict[str, Any]] = []
    html_keep_names: set[str] = set()

    synced_index: dict[str, list[str]] = {key: [] for key in firebase_index.keys()}
    seen_ids: set[str] = set()
    for index_key, ids in firebase_index.items():
        for entry_id in ids:
            if entry_id in seen_ids:
                continue
            payload = docs_map.get(entry_id)
            if not isinstance(payload, dict):
                continue
            status = normalize_publication_status((payload.get("publication") or {}).get("status"), "published")
            visibility = normalize_publication_visibility((payload.get("publication") or {}).get("visibility"), "public")
            if not (status == "published" and visibility == "public"):
                continue

            seen_ids.add(entry_id)
            if index_key not in synced_index:
                synced_index[index_key] = []
            synced_index[index_key].append(entry_id)

            relative_json_path = resolve_nimroel_doc_path(entry_id, payload, index_key)
            local_payload_path = data_root / Path(relative_json_path)
            write_json(local_payload_path, payload)
            keep_json_files.add(local_payload_path)

            slug = clean_string(payload.get("slug")) or slugify(entry_id.replace("_", "-"))
            entry_type = normalize_type(payload.get("type") or index_key)
            title = get_nimroel_entry_title(entry_id, payload)
            excerpt = get_nimroel_entry_excerpt(payload)
            image = clean_string(payload.get("image"))

            public_entries.append(
                {
                    "id": entry_id,
                    "slug": slug,
                    "title": title,
                    "type": entry_type,
                    "section": clean_string(payload.get("section")),
                    "subsection": clean_string(payload.get("subsection")),
                    "excerpt": excerpt,
                    "image": image,
                    "path": relative_json_path.replace("\\", "/"),
                    "status": status,
                    "visibility": visibility,
                }
            )

            html_keep_names.add(f"{slug}.html")

    for key in sorted(synced_index.keys()):
        synced_index[key] = sorted(set(synced_index[key]))

    write_json(local_index_path, synced_index)
    write_json(public_index_path, {"entries": sorted(public_entries, key=lambda x: x["title"].lower())})
    clean_orphan_json_files(data_root, keep_json_files)

    run_generator(ROOT / config["generator_script"])
    clean_orphan_html_files(wiki_root, html_keep_names, config.get("protected_html", ["index.html"]))

    return {
        "entries": len(public_entries),
        "published_html": len(html_keep_names),
    }


def publish_wiki(wiki: str, db: Any) -> dict[str, Any]:
    config = load_wiki_config(wiki)
    if config.get("index_mode") == "entries":
        return sync_lucifer(config, db)
    if config.get("index_mode") == "typed_arrays":
        return sync_nimroel(config, db)
    raise ValueError(f"index_mode no soportado en config {wiki}: {config.get('index_mode')}")


def resolve_service_account_path(explicit: str | None) -> Path:
    candidates = [
        explicit,
        os.getenv("FIREBASE_SERVICE_ACCOUNT"),
        os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate).expanduser().resolve()
        if path.exists():
            return path
    raise FileNotFoundError(
        "No se encontro service account. Usa --service-account o FIREBASE_SERVICE_ACCOUNT."
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publicador hibrido de wikis (Firebase -> estatico).")
    parser.add_argument(
        "--wiki",
        default="all",
        choices=["lucifer", "nimroel", "all"],
        help="Wiki a publicar",
    )
    parser.add_argument(
        "--service-account",
        default=None,
        help="Ruta al JSON de Service Account de Firebase",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    service_account_path = resolve_service_account_path(args.service_account)
    db = init_firestore(service_account_path)

    targets = ["lucifer", "nimroel"] if args.wiki == "all" else [args.wiki]
    summary: dict[str, dict[str, Any]] = {}

    for wiki in targets:
        print(f"[{wiki}] Publicando...")
        result = publish_wiki(wiki, db)
        summary[wiki] = result
        print(f"[{wiki}] OK: {result}")

    print("Resumen:")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}")
        raise SystemExit(1) from exc
