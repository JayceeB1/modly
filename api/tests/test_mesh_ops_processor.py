import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from services.mesh_ops import MeshOpResult
from services.mesh_ops import processor


class _FakeRegistry:
    def __init__(self, output_path: Path) -> None:
        self.output_path = output_path
        self.calls = []

    def run(self, operation_id, input_path, params, context):
        self.calls.append((operation_id, input_path, params, context))
        context.progress(35, "Working…")
        context.log("shared implementation")
        return MeshOpResult(self.output_path)


class MeshOpProcessorTests(unittest.TestCase):
    def test_workflow_protocol_forwards_to_registry_and_preserves_events(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "input.glb"
            output_path = root / "output.glb"
            input_path.touch()
            registry = _FakeRegistry(output_path)
            request = {
                "input": {"filePath": str(input_path)},
                "params": {"iterations": 7},
                "workspaceDir": str(root),
                "tempDir": str(root / "tmp"),
            }

            stdout = io.StringIO()
            with (
                patch.object(processor, "mesh_ops_registry", registry),
                patch.object(processor.sys, "stdin", io.StringIO(json.dumps(request))),
                redirect_stdout(stdout),
            ):
                processor.run_processor("smooth", "mesh-smoother")

        messages = [json.loads(line) for line in stdout.getvalue().splitlines()]
        self.assertEqual(
            [message["type"] for message in messages],
            ["progress", "log", "done"],
        )
        self.assertEqual(messages[-1]["result"]["filePath"], str(output_path))
        self.assertEqual(registry.calls[0][0:3], (
            "smooth",
            input_path,
            {"iterations": 7},
        ))
        self.assertEqual(registry.calls[0][3].workspace_dir, root)

    def test_missing_input_uses_existing_node_error_contract(self) -> None:
        stdout = io.StringIO()
        request = {"input": {}, "params": {}}
        with (
            patch.object(processor.sys, "stdin", io.StringIO(json.dumps(request))),
            redirect_stdout(stdout),
        ):
            processor.run_processor("repair", "mesh-repair")

        message = json.loads(stdout.getvalue())
        self.assertEqual(message["type"], "error")
        self.assertIn("mesh-repair: input file not found: None", message["message"])


    def test_optimizer_full_detail_skips_decimation_and_keeps_input(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / "original.glb"
            original.write_bytes(b"precious mesh")
            registry = _FakeRegistry(Path(directory) / "should-not-exist.glb")
            for params in ({}, {"target_faces": 1000000}, {"target_faces": "1000000"}):
                with self.subTest(params=params):
                    request = {"input": {"filePath": str(original)}, "params": params}
                    stdout = io.StringIO()
                    with (
                        patch.object(processor, "mesh_ops_registry", registry),
                        patch.object(processor.sys, "stdin", io.StringIO(json.dumps(request))),
                        redirect_stdout(stdout),
                    ):
                        processor.run_processor("decimate", "mesh-optimizer")
                    output = [json.loads(line) for line in stdout.getvalue().splitlines()]
                    self.assertEqual([m["type"] for m in output], ["log", "progress", "done"])
                    self.assertEqual(output[-1]["result"]["filePath"], str(original))
                    self.assertEqual(original.read_bytes(), b"precious mesh")
            self.assertEqual(registry.calls, [])

    def test_optimizer_budget_coerces_html_select_values_and_bound_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / "original.glb"
            original.write_bytes(b"mesh")
            registry = _FakeRegistry(Path(directory) / "optimized.glb")
            for value in ("50000", 10000, "12000", 30000.0):
                with self.subTest(value=value):
                    request = {"input": {"filePath": str(original)}, "params": {"target_faces": value}}
                    out = io.StringIO()
                    with (
                        patch.object(processor, "mesh_ops_registry", registry),
                        patch.object(processor.sys, "stdin", io.StringIO(json.dumps(request))),
                        redirect_stdout(out),
                    ):
                        processor.run_processor("decimate", "mesh-optimizer")
                    messages = [json.loads(line) for line in out.getvalue().splitlines()]
                    self.assertEqual(messages[-1]["type"], "done")
                    self.assertEqual(registry.calls[-1][2]["target_faces"], int(value))

    def test_optimizer_invalid_budgets_fail_closed_before_registry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / "original.glb"
            original.write_bytes(b"mesh")
            registry = _FakeRegistry(Path(directory) / "optimized.glb")
            for value in ("NaN", "1e6", True, 99, 1000001, -1, 3.5):
                with self.subTest(value=value):
                    request = {"input": {"filePath": str(original)}, "params": {"target_faces": value}}
                    out = io.StringIO()
                    with (
                        patch.object(processor, "mesh_ops_registry", registry),
                        patch.object(processor.sys, "stdin", io.StringIO(json.dumps(request))),
                        redirect_stdout(out),
                    ):
                        processor.run_processor("decimate", "mesh-optimizer")
                    messages = [json.loads(line) for line in out.getvalue().splitlines()]
                    self.assertEqual(messages[-1]["type"], "error")
                    self.assertNotIn('"type": "done"', out.getvalue())
            self.assertEqual(registry.calls, [])

    def test_optimizer_requires_real_input_even_when_full_detail(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            request = {"input": {"filePath": str(Path(directory) / "missing.glb")}, "params": {}}
            out = io.StringIO()
            with (
                patch.object(processor.sys, "stdin", io.StringIO(json.dumps(request))),
                redirect_stdout(out),
            ):
                processor.run_processor("decimate", "mesh-optimizer")
            messages = [json.loads(line) for line in out.getvalue().splitlines()]
            self.assertEqual(messages[-1]["type"], "error")



if __name__ == "__main__":
    unittest.main()
