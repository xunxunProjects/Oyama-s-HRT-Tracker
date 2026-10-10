#!/usr/bin/env python3
"""
Set the app version everywhere it is recorded, or check that they all agree.

Usage:
  python3 scripts/set_version.py 1.2.3          # write 1.2.3 everywhere
  python3 scripts/set_version.py 1.2.3 --build  # ...then npm run tauri:build
  python3 scripts/set_version.py --check        # fail unless every file agrees
  python3 scripts/set_version.py --check 1.2.3  # fail unless every file says 1.2.3

The release workflow runs the last form against the pushed tag.
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACKAGE_JSON = ROOT / "package.json"
PACKAGE_LOCK = ROOT / "package-lock.json"
TAURI_CONF = ROOT / "src-tauri" / "tauri.conf.json"
CARGO_TOML = ROOT / "src-tauri" / "Cargo.toml"
CARGO_LOCK = ROOT / "src-tauri" / "Cargo.lock"

# The first `version = "..."` in Cargo.toml is the one under [package].
CARGO_TOML_VERSION = re.compile(r'(?m)^(version\s*=\s*")([^"]+)(")')


def read_json(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, data: dict) -> None:
    # Matches npm's own formatting, so an unchanged file round-trips byte for byte.
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def cargo_package_name() -> str:
    match = re.search(r'(?m)^name\s*=\s*"([^"]+)"', CARGO_TOML.read_text(encoding="utf-8"))
    if not match:
        sys.exit(f"package name not found in {CARGO_TOML}")
    return match.group(1)


def cargo_lock_pattern() -> re.Pattern:
    name = re.escape(cargo_package_name())
    return re.compile(rf'(\[\[package\]\]\nname = "{name}"\nversion = ")([^"]+)(")')


def read_versions() -> dict:
    lock = read_json(PACKAGE_LOCK)
    tauri = read_json(TAURI_CONF)
    cargo_toml = CARGO_TOML_VERSION.search(CARGO_TOML.read_text(encoding="utf-8"))
    cargo_lock = cargo_lock_pattern().search(CARGO_LOCK.read_text(encoding="utf-8"))
    return {
        "package.json": read_json(PACKAGE_JSON).get("version"),
        "package-lock.json": lock.get("version"),
        'package-lock.json packages[""]': lock.get("packages", {}).get("", {}).get("version"),
        "src-tauri/tauri.conf.json": tauri.get("package", {}).get("version"),
        "src-tauri/Cargo.toml": cargo_toml.group(2) if cargo_toml else None,
        "src-tauri/Cargo.lock": cargo_lock.group(2) if cargo_lock else None,
    }


def update_package_json(version: str) -> None:
    data = read_json(PACKAGE_JSON)
    data["version"] = version
    write_json(PACKAGE_JSON, data)


def update_package_lock(version: str) -> None:
    data = read_json(PACKAGE_LOCK)
    data["version"] = version
    data.setdefault("packages", {}).setdefault("", {})["version"] = version
    write_json(PACKAGE_LOCK, data)


def update_tauri_conf(version: str) -> None:
    data = read_json(TAURI_CONF)
    data.setdefault("package", {})["version"] = version
    write_json(TAURI_CONF, data)


def replace_once(path: pathlib.Path, pattern: re.Pattern, version: str) -> None:
    text = path.read_text(encoding="utf-8")
    new_text, count = pattern.subn(lambda m: f"{m.group(1)}{version}{m.group(3)}", text, count=1)
    if count == 0:
        sys.exit(f"version line not found in {path}")
    path.write_text(new_text, encoding="utf-8")


def check(expected: str | None) -> None:
    versions = read_versions()
    width = max(len(name) for name in versions)
    for name, found in versions.items():
        print(f"{name:<{width}}  {found}")
    wanted = expected or versions["package.json"]
    wrong = [name for name, found in versions.items() if found != wanted]
    if wrong:
        sys.exit(f"\nexpected {wanted} everywhere; differs in: {', '.join(wrong)}\n"
                 f"fix with: python3 scripts/set_version.py {wanted}")
    print(f"\nall at {wanted}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Set or check the app version")
    parser.add_argument("version", nargs="?", help="Version string, e.g. 1.2.3")
    parser.add_argument("--check", action="store_true", help="Only check; exit 1 if any file differs")
    parser.add_argument("--build", action="store_true", help="Run npm run tauri:build after updating")
    args = parser.parse_args()

    if args.version is not None and not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        sys.exit("Version must look like X.Y.Z")

    if args.check:
        check(args.version)
        return
    if args.version is None:
        parser.error("a version is required unless --check is given")

    update_package_json(args.version)
    update_package_lock(args.version)
    update_tauri_conf(args.version)
    replace_once(CARGO_TOML, CARGO_TOML_VERSION, args.version)
    replace_once(CARGO_LOCK, cargo_lock_pattern(), args.version)

    print(f"Version set to {args.version}")
    if args.build:
        subprocess.check_call(["npm", "run", "tauri:build"], cwd=ROOT)


if __name__ == "__main__":
    main()
