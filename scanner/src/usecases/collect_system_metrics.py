"""Cas d'usage : collecter les métriques système (CPU, RAM, disques) de machines distantes via SSH."""

import logging
import os
from typing import Optional

from entities.disk import Disk
from entities.memory import Memory
from entities.system_metrics import SystemMetrics
from usecases.ports.ssh import SystemMetricsFetcher

logger = logging.getLogger(__name__)


def _empty_metrics() -> dict:
    """Retourne les métriques d'un équipement non supervisé, selon le contrat.

    Returns:
        Un dictionnaire avec ``cpuPercent`` et ``memory`` à None, et
        ``disks`` vide.
    """
    return {"cpuPercent": None, "memory": None, "disks": []}


def _to_contract(metrics: SystemMetrics) -> dict:
    """Formate une entité SystemMetrics selon le contrat.

    Args:
        metrics: Les métriques système à formater.

    Returns:
        Un dictionnaire avec ``cpuPercent``, ``memory`` et ``disks``.
    """
    memory = metrics.memory
    return {
        "cpuPercent": metrics.cpu_percent,
        "memory": (
            {"usedPercent": memory.percentage_used, "totalMb": memory.total_mb}
            if memory
            else None
        ),
        "disks": [
            {
                "name": disk.name,
                "usedPercent": disk.percentage_used,
                "totalGb": disk.total_gb,
            }
            for disk in metrics.disks
        ],
    }


class CollectSystemMetrics:
    """Collecte les métriques système à travers un port SystemMetricsFetcher."""

    def __init__(self, fetcher: SystemMetricsFetcher) -> None:
        """Initialise le cas d'usage.

        Args:
            fetcher: Collecteur de métriques d'une machine distante.
        """
        self._fetcher = fetcher

    def collect_ssh_metrics(
            self,
            ip: str,
            username: str,
            password: Optional[str] = None,
            key_filename: Optional[str] = None,
            port: int = 22,
            timeout: float = 3.0,
    ) -> dict:
        """Collecte les métriques système d'une machine distante via SSH, sans agent.

        Si la collecte échoue, des métriques vides sont retournées.

        Args:
            ip: Adresse IP de la machine cible.
            username: Nom d'utilisateur de connexion SSH.
            password: Mot de passe SSH optionnel.
            key_filename: Chemin optionnel du fichier de clé privée.
            port: Port SSH (22 par défaut).
            timeout: Délai d'attente réseau et des commandes, en secondes.

        Returns:
            Un dictionnaire avec ``cpuPercent``, ``memory`` et ``disks``,
            formaté selon le contrat.
        """
        try:
            remote = self._fetcher.fetch(
                ip=ip,
                username=username,
                password=password,
                key_filename=key_filename,
                port=port,
                timeout=timeout,
            )
        except RuntimeError as exc:
            logger.debug("Collecte SSH impossible pour %s : %s", ip, exc)
            return _empty_metrics()

        metrics = SystemMetrics(
            cpu_percent=remote.cpu_percent,
            memory=(
                Memory(
                    percentage_used=remote.memory.used_percent,
                    total_mb=remote.memory.total_mb,
                )
                if remote.memory
                else None
            ),
            disks=[
                Disk(
                    name=disk.mountpoint,
                    percentage_used=disk.used_percent,
                    total_gb=disk.total_gb,
                )
                for disk in remote.disks
            ],
        )
        return _to_contract(metrics)

    def execute(
            self,
            ip: str,
            ssh_credentials: Optional[dict] = None,
    ) -> dict:
        """Point d'entrée de la collecte des métriques d'une machine découverte.

        - Si des identifiants SSH sont fournis (par IP, par défaut ou via
          l'environnement) : se connecte à la cible distante en SSH.
        - Sinon (équipement non supervisé ou non instrumenté) : retourne
          proprement None / [] selon le contrat.

        Args:
            ip: Adresse IP cible.
            ssh_credentials: Dictionnaire optionnel d'identifiants. Peut
                contenir des clés correspondant à des IP précises, ou une
                clé « default ».

        Returns:
            Un dictionnaire ``{"cpuPercent": ..., "memory": ..., "disks": ...}``.
        """
        creds = None
        if ssh_credentials:
            creds = ssh_credentials.get(ip) or ssh_credentials.get("default")

        if not creds:
            env_user = os.getenv("NETWATCH_SSH_USER")
            if env_user:
                creds = {
                    "username": env_user,
                    "password": os.getenv("NETWATCH_SSH_PASSWORD"),
                    "key_filename": os.getenv("NETWATCH_SSH_KEY"),
                    "port": int(os.getenv("NETWATCH_SSH_PORT") or "22"),
                }

        if creds:
            return self.collect_ssh_metrics(ip, **creds)

        # Équipement non configuré pour la supervision système
        return _empty_metrics()
