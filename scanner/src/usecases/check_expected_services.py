"""Charge les services attendus et lance leurs contrôles TCP."""

import json
import os

from usecases.check_tcp_service import CheckTcpService


class CheckExpectedServices:
    """Contrôle les services TCP configurés dans SCANNER_TCP_TARGETS."""

    def __init__(self, check_tcp_service: CheckTcpService) -> None:
        """Initialise le cas d'usage.

        Args:
            check_tcp_service: Cas d'usage de contrôle d'une connexion TCP.
        """
        self._check_tcp_service = check_tcp_service

    def execute(self) -> list[dict]:
        """Contrôle chaque service listé dans ``SCANNER_TCP_TARGETS``.

        La variable d'environnement contient une liste JSON d'objets avec les
        clés ``ip`` et ``port``, et optionnellement ``timeout``.

        Returns:
            Les résultats des contrôles TCP, dans l'ordre de la configuration.

        Raises:
            ValueError: Si la configuration n'est pas un JSON valide, n'est
                pas une liste, ou si une cible est mal formée.
        """
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
                self._check_tcp_service.execute(
                    ip=target["ip"],
                    port=target["port"],
                    timeout=target.get("timeout", 3.0),
                )
            )

        return checks
