"""backend/app/api/routes_registry.py

Stateful demo credit registry providing unit issuance, transfers, retirement,
serial batch tracking, and balance conservation invariant enforcement.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import threading
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, HTTPException, status

from backend.app.schemas.mrv import (
    RegistrySummary,
    TransactionRequest,
    TransactionResponse,
)

router = APIRouter(tags=["Credit Registry"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
REGISTRY_DB_FILE = PROJECT_ROOT / "backend" / "app" / "registry_state.json"


class DemoCreditRegistryEngine:
    """Thread-safe demo carbon credit ledger with conservation law verification."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.accounts: Dict[str, int] = {}
        self.transactions: List[Dict[str, Any]] = []
        self.serial_batches: List[Dict[str, Any]] = []
        self.total_issued: int = 0
        self.total_retired: int = 0
        self._init_demo_seed()

    def _init_demo_seed(self) -> None:
        """Seeds initial verified demonstration state."""
        # Clean state
        self.accounts.clear()
        self.transactions.clear()
        self.serial_batches.clear()
        self.total_issued = 0
        self.total_retired = 0

        # Seed initial verified issuance from TVER benchmark
        self.issue(
            aoi_id="RU_TVER_01",
            year=2024,
            count=395,
            account="Developer",
            calculation_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        )
        self.transfer("Developer", "Buyer", 150)
        self.retire("Buyer", 20, "Corporate ESG", "NetZero 2026 Scope 1 Offset")

    def issue(
        self,
        aoi_id: str,
        year: int,
        count: int,
        account: str = "Developer",
        calculation_hash: str = "",
    ) -> str:
        """Issues newly verified carbon credits with serialized tokens."""
        with self._lock:
            if count <= 0:
                raise ValueError(f"Cannot issue non-positive unit count: {count}")

            start_serial = self.total_issued + 1
            end_serial = self.total_issued + count
            batch_id = f"BATCH-{aoi_id}-{year}-{start_serial:05d}"
            serial_range = f"RU-{year}-{aoi_id}-{start_serial:05d}..{end_serial:05d}"

            self.accounts[account] = self.accounts.get(account, 0) + count
            self.total_issued += count

            batch_info = {
                "batch_id": batch_id,
                "aoi_id": aoi_id,
                "year": year,
                "count": count,
                "owner": account,
                "serial_range": serial_range,
                "calculation_hash": calculation_hash,
                "status": "ACTIVE",
                "issued_at": datetime.now(timezone.utc).isoformat(),
            }
            self.serial_batches.append(batch_info)

            tx_id = f"TX-{len(self.transactions) + 1:04d}"
            self.transactions.append({
                "tx_id": tx_id,
                "type": "ISSUE",
                "action": "issue",
                "from": "REGISTRY_MINT",
                "from_account": "REGISTRY_MINT",
                "to": account,
                "to_account": account,
                "units": count,
                "batch_id": batch_id,
                "calculation_hash": calculation_hash,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return batch_id

    def transfer(self, from_account: str, to_account: str, count: int) -> str:
        """Transfers units between accounts with balance validation."""
        with self._lock:
            if count <= 0:
                raise ValueError(f"Cannot transfer non-positive unit count: {count}")
            curr_balance = self.accounts.get(from_account, 0)
            if curr_balance < count:
                raise ValueError(
                    f"Insufficient funds: {from_account} has {curr_balance} units, requested {count}"
                )

            self.accounts[from_account] -= count
            self.accounts[to_account] = self.accounts.get(to_account, 0) + count

            tx_id = f"TX-{len(self.transactions) + 1:04d}"
            self.transactions.append({
                "tx_id": tx_id,
                "type": "TRANSFER",
                "action": "transfer",
                "from": from_account,
                "from_account": from_account,
                "to": to_account,
                "to_account": to_account,
                "units": count,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return tx_id

    def retire(self, account: str, count: int, beneficiary: str = "", reason: str = "") -> str:
        """Permanently cancels units from circulation."""
        with self._lock:
            if count <= 0:
                raise ValueError(f"Cannot retire non-positive unit count: {count}")
            curr_balance = self.accounts.get(account, 0)
            if curr_balance < count:
                raise ValueError(
                    f"Insufficient funds for retirement: {account} has {curr_balance}, requested {count}"
                )

            self.accounts[account] -= count
            self.total_retired += count

            tx_id = f"TX-{len(self.transactions) + 1:04d}"
            self.transactions.append({
                "tx_id": tx_id,
                "type": "RETIRE",
                "action": "retire",
                "from": account,
                "from_account": account,
                "to": "BURNT",
                "to_account": "BURNT",
                "units": count,
                "beneficiary": beneficiary or "ESG Beneficiary",
                "reason": reason or "Voluntary Decarbonization",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return tx_id

    def get_balance(self, account: str) -> int:
        with self._lock:
            return self.accounts.get(account, 0)

    def verify_conservation(self) -> bool:
        """Verifies fundamental conservation invariant: Total Issued == Active Balances + Total Retired."""
        with self._lock:
            sum_balances = sum(self.accounts.values())
            return self.total_issued == (sum_balances + self.total_retired)

    def get_summary(self) -> RegistrySummary:
        with self._lock:
            return RegistrySummary(
                total_issued=self.total_issued,
                total_retired=self.total_retired,
                active_balances=dict(self.accounts),
                batches=list(self.serial_batches),
                transactions=list(self.transactions),
                conservation_verified=self.verify_conservation(),
            )


# Global singleton ledger
registry = DemoCreditRegistryEngine()


@router.get("/registry/summary", response_model=RegistrySummary)
def get_registry_summary() -> RegistrySummary:
    """Returns aggregated credit statistics, balances, serial batches, and conservation verification."""
    return registry.get_summary()


@router.get("/registry/transactions", response_model=List[Dict[str, Any]])
def get_transactions() -> List[Dict[str, Any]]:
    """Returns the immutable transaction ledger."""
    return registry.transactions


@router.post("/registry/transact", response_model=TransactionResponse)
def execute_transaction(request: Union[TransactionRequest, Dict[str, Any]]) -> TransactionResponse:
    """Executes a validated registry operation: issue, transfer, or retire."""
    if hasattr(request, "model_dump"):
        data = request.model_dump()
    elif hasattr(request, "dict"):
        data = request.dict()
    elif isinstance(request, dict):
        data = request
    else:
        raise HTTPException(status_code=400, detail="Invalid request body")

    action = (data.get("action") or "").lower().strip()
    try:
        units = int(data.get("units") or 0)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Units must be a positive integer.")

    if units <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transaction units must be greater than zero, got {units}.",
        )

    try:
        if action == "issue":
            aoi_id = data.get("site_id") or data.get("aoi_id") or "RU_TVER_01"
            year = int(data.get("year") or 2024)
            account = data.get("account") or data.get("to_account") or "Developer"
            calc_hash = data.get("calculation_hash") or ""
            batch_id = registry.issue(aoi_id, year, units, account, calc_hash)
            tx = registry.transactions[-1]
            return TransactionResponse(
                tx_id=tx["tx_id"],
                action="issue",
                units=units,
                status="COMPLETED",
                message=f"Successfully issued {units} units to {account} in batch {batch_id}.",
                to_account=account,
                batch_id=batch_id,
                details=tx,
            )

        elif action == "transfer":
            from_acc = data.get("from_account") or data.get("account") or "Developer"
            to_acc = data.get("to_account") or "Buyer"
            tx_id = registry.transfer(from_acc, to_acc, units)
            tx = registry.transactions[-1]
            return TransactionResponse(
                tx_id=tx_id,
                action="transfer",
                units=units,
                status="COMPLETED",
                message=f"Successfully transferred {units} units from {from_acc} to {to_acc}.",
                from_account=from_acc,
                to_account=to_acc,
                details=tx,
            )

        elif action == "retire":
            from_acc = data.get("from_account") or data.get("account") or "Developer"
            beneficiary = data.get("beneficiary") or "Corporate ESG"
            reason = data.get("reason") or "Voluntary Carbon Offset"
            tx_id = registry.retire(from_acc, units, beneficiary, reason)
            tx = registry.transactions[-1]
            return TransactionResponse(
                tx_id=tx_id,
                action="retire",
                units=units,
                status="COMPLETED",
                message=f"Successfully retired {units} units from {from_acc} for '{beneficiary}'.",
                from_account=from_acc,
                to_account="BURNT",
                details=tx,
            )

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported registry action '{action}'. Must be 'issue', 'transfer', or 'retire'.",
            )

    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )


@router.post("/registry/reset")
def reset_registry() -> Dict[str, Any]:
    """Resets the registry to initial demonstration baseline."""
    registry._init_demo_seed()
    return {"status": "ok", "message": "Registry reset to demonstration state."}
