"""Charge les services attendus et lance leurs contrôles TCP."""

import json
import os

from usecases.check_tcp_service import check_tcp_service


def check_expected_services() -> list[dict]:
    raw_targets = os.getenv("SCANNER_TCP_TARGETS", "[]")

    try:
        targets = json.loads(raw_targets)
    except json.JSONDecodeError as exc:
        raise ValueError(
            "SCANNER_TCP_TARGETS doit contenir un JSON valide."
        ) from exc

    if not isinstance(targets, list):
        raise ValueError("SCANNER_TCP_TARGETS doit être une liste JSON.")

    checks = []

    for index, target in enumerate(targets):
        if not isinstance(target, dict):
            raise ValueError(f"La cible TCP {index} doit être un objet.")

        if "ip" not in target or "port" not in target:
            raise ValueError(
                f"La cible TCP {index} doit contenir ip et port."
            )

        if not isinstance(target["ip"], str):
            raise ValueError(
                f"L'adresse IP de la cible TCP {index} doit être une chaîne."
            )

        checks.append(
            check_tcp_service(
                ip=target["ip"],
                port=target["port"],
                timeout=target.get("timeout", 3.0),
            )
        )

    return checks