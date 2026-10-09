import json
import struct
import tempfile
import unittest
from pathlib import Path

from services.asset_context import load_asset_metadata, scene_context_lines


def _glb(path: Path, metadata: dict) -> None:
    document = {"asset": {"version": "2.0", "extras": {"modly": metadata}}}
    blob = json.dumps(document).encode("utf-8")
    blob += b" " * ((4 - len(blob) % 4) % 4)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 20 + len(blob)) +
                     struct.pack("<I4s", len(blob), b"JSON") + blob)


class AssetContextTests(unittest.TestCase):
    def test_sidecar_and_clip_context_stay_descriptive(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            asset = root / "Default" / "hero.glb"
            asset.parent.mkdir()
            _glb(asset, {"name": "embedded"})
            asset.with_suffix(".tags.json").write_text(json.dumps({
                "name": "Murloc Champion",
                "project": "Azeroth",
                "tags": ["hero", "animated"],
                "derived_from": {"parent": {"path": "Default/base.glb", "name": "base"}}
            }), encoding="utf-8")
            context = {"currentMeshPath": "Default/hero.glb", "meshTriangles": 1234,
                       "availableClips": ["Idle", "Swim"], "currentClipName": "Swim"}
            lines = scene_context_lines(context, root)
            joined = "\n".join(lines)
            self.assertIn("1,234", joined)
            self.assertIn("Swim", joined)
            self.assertIn("Murloc Champion", joined)
            self.assertIn("Default/base.glb", joined)
            self.assertIn("untrusted data", joined)

    def test_glb_fallback_with_corrupt_sidecar(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "model.glb"
            _glb(path, {"name": "GLB fallback", "tags": ["rigged"]})
            path.with_suffix(".tags.json").write_text("{broken", encoding="utf-8")
            self.assertEqual(load_asset_metadata(root, "model.glb")["name"], "GLB fallback")

    def test_reject_traversal_drive_paths_and_sibling_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "workspace"
            root.mkdir()
            outside = Path(directory) / "workspace-other"
            outside.mkdir()
            _glb(outside / "secret.glb", {"name": "secret"})
            for bad in ("../workspace-other/secret.glb", "C:\\secrets\\secret.glb",
                        "/etc/passwd", "//server/share/secret.glb", "workspace-other/../secret.glb"):
                with self.subTest(bad=bad):
                    self.assertIsNone(load_asset_metadata(root, bad))
                    self.assertEqual(scene_context_lines({"currentMeshPath": bad}, root), [])

    def test_reject_symlink_escape(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "workspace"
            root.mkdir()
            target = Path(directory) / "secret.glb"
            _glb(target, {"name": "secret"})
            link = root / "alias.glb"
            try:
                link.symlink_to(target)
            except OSError:
                self.skipTest("symlink not available on this runtime")
            self.assertIsNone(load_asset_metadata(root, "alias.glb"))

    def test_reject_oversized_sidecar_and_glb_json_chunk(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "test.glb"
            target.write_bytes(struct.pack("<4sII", b"glTF", 2, 20 + 999999) +
                               struct.pack("<I4s", 999999, b"JSON"))
            target.with_suffix(".tags.json").write_bytes(b"{" + b" " * (64 * 1024 + 1))
            self.assertIsNone(load_asset_metadata(root, "test.glb"))


if __name__ == "__main__":
    unittest.main()
