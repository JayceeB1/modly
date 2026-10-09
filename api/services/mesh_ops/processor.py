"""Adapter between workflow process-node NDJSON and the mesh-op registry."""

import json
import os
import sys
import tempfile
import traceback
from pathlib import Path

from . import MeshOpContext, mesh_ops_registry


# A workflow-only sentinel: direct mesh-op/API calls retain their original
# decimation behavior and schema. Bound node params may provide an int or HTML
# <select> string, so normalize the value before dispatching to the registry.
WORKFLOW_FULL_DETAIL = 1_000_000


def _normalize_workflow_target_faces(value: object) -> int:
    if isinstance(value, bool):
        raise ValueError("mesh-optimizer: target_faces must be an integer between 100 and 1000000")
    if isinstance(value, int):
        target = value
    elif isinstance(value, float) and value.is_integer():
        target = int(value)
    elif isinstance(value, str) and value.strip().isascii() and value.strip().isdecimal():
        target = int(value.strip())
    else:
        raise ValueError("mesh-optimizer: target_faces must be an integer between 100 and 1000000")
    if not 100 <= target <= WORKFLOW_FULL_DETAIL:
        raise ValueError("mesh-optimizer: target_faces must be between 100 and 1000000")
    return target


def _emit(message: dict) -> None:
    print(json.dumps(message), flush=True)


def run_processor(operation_id: str, processor_id: str) -> None:
    """Read one workflow request, run a registered op, and emit its result."""
    try:
        raw = sys.stdin.readline()
        if not raw:
            raise ValueError(f"{processor_id}: missing request payload")
        data = json.loads(raw)
        input_data = data.get("input") or {}
        input_path = input_data.get("filePath")
        if not input_path or not Path(input_path).is_file():
            if processor_id == "mesh-optimizer":
                raise FileNotFoundError(
                    "mesh-optimizer: input.filePath is required"
                )
            raise FileNotFoundError(
                f"{processor_id}: input file not found: {input_path}"
            )

        params = data.get("params") or {}
        if operation_id == "decimate" and processor_id == "mesh-optimizer":
            target_faces = _normalize_workflow_target_faces(
                params.get("target_faces", WORKFLOW_FULL_DETAIL)
            )
            if target_faces == WORKFLOW_FULL_DETAIL:
                _emit({"type": "log", "message": "Full detail selected: original mesh preserved"})
                _emit({"type": "progress", "percent": 100, "label": "Done"})
                _emit({"type": "done", "result": {"filePath": str(input_path)}})
                return
            # Canonical mesh-op registry expects numeric values, not HTML
            # select strings. Keep other params for workflow compatibility.
            params = {**params, "target_faces": target_faces}

        workspace_dir = Path(
            data.get("workspaceDir")
            or os.environ.get("WORKSPACE_DIR")
            or Path.home() / ".modly" / "workspace"
        )
        temp_dir = Path(
            data.get("tempDir")
            or os.environ.get("TEMP_DIR")
            or tempfile.gettempdir()
        )
        context = MeshOpContext(
            workspace_dir=workspace_dir,
            temp_dir=temp_dir,
            progress_cb=lambda percent, label: _emit(
                {"type": "progress", "percent": percent, "label": label}
            ),
            log_cb=lambda message: _emit({"type": "log", "message": message}),
        )
        result = mesh_ops_registry.run(
            operation_id,
            Path(input_path),
            params,
            context,
        )
        _emit(
            {
                "type": "done",
                "result": {"filePath": str(result.file_path)},
            }
        )
    except Exception as exc:
        _emit(
            {
                "type": "error",
                "message": f"{exc}\n{traceback.format_exc()}",
            }
        )
