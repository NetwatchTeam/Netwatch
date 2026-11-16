"""Use case: Collect system metrics (CPU, RAM, Disks) on remote machines via SSH."""

import logging
import os
from typing import Optional

from entities.disk import Disk
from entities.memory import Memory
from entities.system_metrics import SystemMetrics
from usecases.ports.ssh import SystemMetricsFetcher

logger = logging.getLogger(__name__)


def _empty_metrics() -> dict:
    """Metrics of an unmonitored device, according to the contract."""
    return {"cpuPercent": None, "memory": None, "disks": []}


def _to_contract(metrics: SystemMetrics) -> dict:
    """Formats a SystemMetrics entity according to the contract."""
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
    """Collects system metrics through a SystemMetricsFetcher port."""

    def __init__(self, fetcher: SystemMetricsFetcher) -> None:
        self._fetcher = fetcher

    def collect_ssh_metrics(
            self,
            ip: str,
            username: str = "supervision",
            password: Optional[str] = None,
            key_filename: Optional[str] = None,
            port: int = 22,
            timeout: float = 3.0,
    ) -> dict:
        """Collects system metrics from a remote machine via SSH without agent.

        Args:
            ip: Target machine IP address.
            username: SSH login username.
            password: Optional SSH password.
            key_filename: Optional private key file path.
            port: SSH port (default 22).
            timeout: Network and command timeout in seconds.

        Returns:
            dict: cpuPercent, memory, disks formatted according to the contract.
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
        """Entry point for system metrics collection for a discovered machine.

        - If SSH credentials are provided (per IP, default, or via environment):
          connects to the remote target via SSH.
        - Otherwise (unmonitored / uninstrumented device):
          returns None / [] cleanly according to the contract.

        Args:
            ip: Target IP address.
            ssh_credentials: Optional dictionary of credentials. Can contain
                keys matching specific IPs, or a "default" key.

        Returns:
            dict: {"cpuPercent": ..., "memory": ..., "disks": ...}
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
                    "port": int(os.getenv("NETWATCH_SSH_PORT", "22")),
                }

        if creds:
            return self.collect_ssh_metrics(ip, **creds)

        # Équipement non configuré pour la supervision système
        return _empty_metrics()
