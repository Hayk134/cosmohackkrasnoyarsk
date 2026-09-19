"""backend/app/core/audit.py

Cryptographic auditability engine:
Generates deterministic SHA-256 calculation hashes over canonical sorted JSON
of inputs, polygon geometry, and MRV calculation outputs.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Optional, Tuple, Union


def normalize_for_canonical_json(obj: Any, float_precision: int = 6) -> Any:
    """Recursively normalizes Python objects for deterministic JSON serialization:
    - Floats rounded to float_precision (default 6).
    - Dict keys sorted alphabetically.
    - Dataclasses converted to dicts.
    - Lists preserved in deterministic order.
    """
    if is_dataclass(obj):
        return normalize_for_canonical_json(asdict(obj), float_precision)
    elif isinstance(obj, float):
        if not (-1e15 < obj < 1e15) or math_isnan(obj):
            return None
        return round(obj, float_precision)
    elif isinstance(obj, (int, str, bool)) or obj is None:
        return obj
    elif isinstance(obj, dict):
        return {
            str(k): normalize_for_canonical_json(v, float_precision)
            for k, v in sorted(obj.items(), key=lambda item: str(item[0]))
        }
    elif isinstance(obj, (list, tuple)):
        return [normalize_for_canonical_json(item, float_precision) for item in obj]
    else:
        return str(obj)


def math_isnan(val: float) -> bool:
    try:
        import math
        return math.isnan(val)
    except Exception:
        return False


def generate_canonical_json(payload: Dict[str, Any], float_precision: int = 6) -> str:
    """Generates a canonical compact JSON string with sorted keys and normalized floats."""
    normalized = normalize_for_canonical_json(payload, float_precision)
    return json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    )


def compute_calculation_hash(
    payload_or_inputs: Dict[str, Any],
    geometry: Optional[Dict[str, Any]] = None,
    outputs: Optional[Dict[str, Any]] = None,
    float_precision: int = 6,
) -> str:
    """Computes a deterministic SHA-256 audit hash.

    If invoked as compute_calculation_hash(payload), hashes the payload directly.
    If invoked as compute_calculation_hash(inputs, geometry, outputs), packages into canonical audit payload.

    Returns:
        64-character lowercase hexadecimal SHA-256 string.
    """
    if geometry is not None or outputs is not None:
        canonical_payload = {
            "schema_version": "1.0-mrv-audit",
            "inputs": payload_or_inputs,
            "geometry": geometry or {},
            "outputs": outputs or {},
        }
    else:
        canonical_payload = payload_or_inputs

    canonical_json = generate_canonical_json(canonical_payload, float_precision)
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def compute_calculation_hash_with_json(
    inputs: Dict[str, Any],
    geometry: Dict[str, Any],
    outputs: Dict[str, Any],
    float_precision: int = 6,
) -> Tuple[str, str]:
    """Computes a deterministic SHA-256 audit hash and returns the canonical JSON string.

    Returns:
        (hash_hex, canonical_json_string)
    """
    canonical_payload = {
        "schema_version": "1.0-mrv-audit",
        "inputs": inputs,
        "geometry": geometry,
        "outputs": outputs,
    }
    canonical_json = generate_canonical_json(canonical_payload, float_precision)
    digest = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
    return digest, canonical_json


def verify_calculation_hash(
    payload_or_inputs: Dict[str, Any],
    claimed_hash: str,
    geometry: Optional[Dict[str, Any]] = None,
    outputs: Optional[Dict[str, Any]] = None,
    float_precision: int = 6,
) -> bool:
    """Independently verifies whether a calculation matches a claimed cryptographic hash."""
    recomputed_hash = compute_calculation_hash(
        payload_or_inputs,
        geometry=geometry,
        outputs=outputs,
        float_precision=float_precision,
    )
    return recomputed_hash.lower() == claimed_hash.lower().strip()
