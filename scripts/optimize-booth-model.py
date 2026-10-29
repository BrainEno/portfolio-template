#!/usr/bin/env python3
"""Rebuild ``public/gltfs/telephone.glb`` from ``public/gltfs/telephone.gltf``.

The uploaded model is a 38 MB glTF with the binary buffer embedded as one
base64 data URI (which makes the browser parse ~52 MB of text) and nine
2048² lossless PNG maps. This script:

* unpacks the buffer once,
* re-encodes the PBR maps (base colour 1024² JPEG, normals 1024² JPEG,
  metallic-roughness/occlusion 512² JPEG) — a 2048² normal map for a booth
  that is rendered at a few hundred pixels tall is wasted bandwidth,
* keeps every mesh/accessor untouched,
* writes a single binary glTF (.glb) so the geometry is streamed, not parsed.

Result: ~2.2 MB instead of 38 MB, same model, same materials.

Usage (needs ImageMagick's ``convert`` on PATH):

    python3 scripts/optimize-booth-model.py

The original ``telephone.gltf`` is kept as the source of truth; only re-run
this script when the model changes.
"""

from __future__ import annotations

import base64
import json
import os
import struct
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "gltfs", "telephone.gltf")
OUT = os.path.join(ROOT, "public", "gltfs", "telephone.glb")

# (extension, size, jpeg quality) per texture slot.
IMAGE_SPEC = {
    "baseColor": ("jpg", 1024, 84),
    "normal": ("jpg", 1024, 90),
    "metallicRoughness": ("jpg", 512, 88),
}


def slot_for(name: str) -> str:
    if "baseColor" in name:
        return "baseColor"
    if "normal" in name:
        return "normal"
    return "metallicRoughness"


def encode(data: bytes, name: str, workdir: str) -> bytes:
    ext, size, quality = IMAGE_SPEC[slot_for(name)]
    src = os.path.join(workdir, f"{name}.img")
    dst = os.path.join(workdir, f"{name}.{ext}")
    with open(src, "wb") as handle:
        handle.write(data)
    subprocess.run(
        [
            "convert",
            f"{src}[0]",
            "-resize",
            f"{size}x{size}>",
            "-strip",
            "-sampling-factor",
            "2x2" if slot_for(name) == "baseColor" else "1x1",
            "-quality",
            str(quality),
            dst,
        ],
        check=True,
    )
    with open(dst, "rb") as handle:
        return handle.read()


def pad4(blob: bytes | bytearray) -> bytes:
    return b"\0" * ((4 - len(blob) % 4) % 4)


def main() -> None:
    with open(SRC, "r", encoding="utf-8") as handle:
        doc = json.load(handle)

    uri = doc["buffers"][0]["uri"]
    raw = base64.b64decode(uri.split(",", 1)[1])
    views = doc["bufferViews"]
    image_views = {image["bufferView"] for image in doc["images"]}

    binary = bytearray()
    new_views: list[dict] = []
    geometry_map: dict[int, int] = {}

    # Geometry first, verbatim, in the original order.
    for index, view in enumerate(views):
        if index in image_views:
            continue
        offset = view.get("byteOffset", 0)
        length = view["byteLength"]
        binary += pad4(binary)
        entry = {key: value for key, value in view.items() if key != "byteOffset"}
        entry["byteOffset"] = len(binary)
        binary += raw[offset : offset + length]
        geometry_map[index] = len(new_views)
        new_views.append(entry)

    for accessor in doc["accessors"]:
        if "bufferView" in accessor:
            accessor["bufferView"] = geometry_map[accessor["bufferView"]]

    # Then the re-encoded textures.
    with tempfile.TemporaryDirectory() as workdir:
        for image in doc["images"]:
            view = views[image["bufferView"]]
            offset = view.get("byteOffset", 0)
            data = raw[offset : offset + view["byteLength"]]
            encoded = encode(data, image["name"], workdir)
            binary += pad4(binary)
            new_views.append(
                {
                    "buffer": 0,
                    "byteOffset": len(binary),
                    "byteLength": len(encoded),
                    "name": image["name"],
                }
            )
            binary += encoded
            image["bufferView"] = len(new_views) - 1
            image["mimeType"] = "image/jpeg"
            print(f"  {image['name']}: {len(data) / 1024:.0f} KB -> {len(encoded) / 1024:.0f} KB")

    # The accessor remap above must run after the geometry views are final,
    # which is why textures are appended afterwards.
    doc["bufferViews"] = new_views
    doc["buffers"] = [{"byteLength": len(binary)}]

    payload = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    chunk = bytes(binary) + pad4(binary)
    total = 12 + 8 + len(payload) + 8 + len(chunk)

    glb = bytearray()
    glb += struct.pack("<4sII", b"glTF", 2, total)
    glb += struct.pack("<II", len(payload), 0x4E4F534A) + payload
    glb += struct.pack("<II", len(chunk), 0x004E4942) + chunk

    with open(OUT, "wb") as handle:
        handle.write(glb)
    print(f"wrote {OUT} ({len(glb) / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
