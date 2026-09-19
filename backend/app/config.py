"""backend/app/config.py

Global application configuration and methodology parameters.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
METHODOLOGY_DIR = DATA_DIR / "methodology"


def load_parameters() -> Dict[str, Any]:
    """Loads methodology parameters from data/methodology/parameters.csv."""
    param_file = METHODOLOGY_DIR / "parameters.csv"
    if not param_file.exists():
        return {
            "CF_AGB": 0.47,
            "CO2_per_C": 44.0 / 12.0,
            "UNC_allowance": 0.10,
            "UNC_stop_ratio": 1.0,
            "BUF": 0.15,
            "LK": 0.0,
            "PRICE_LOW": 500.0,
            "PRICE_BASE": 1500.0,
            "PRICE_HIGH": 4000.0,
        }
    df = pd.read_csv(param_file)
    params: Dict[str, Any] = {}
    for _, row in df.iterrows():
        name = str(row["parameter"])
        val_str = str(row["value"])
        try:
            if "/" in val_str:
                num, denom = val_str.split("/")
                val = float(num) / float(denom)
            else:
                val = float(val_str)
        except Exception:
            val = val_str
        params[name] = val
    return params
