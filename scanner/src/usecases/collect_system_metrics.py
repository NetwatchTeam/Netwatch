"""Use case: Collect system metrics (CPU, RAM, Disks) on remote machines via SSH."""

import logging
import os
from typing import Optional

import paramiko

logger = logging.getLogger(__name__)


def _parse_free_output(output: str) -> Optional[dict]:
    """Parses `free -m` output to extract memory metrics."""
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("Mem:"):
            tokens = line.split()
            if len(tokens) >= 3:
                total = float(tokens[1])
                if total <= 0:
                    return None
                if len(tokens) >= 7:
                    available = float(tokens[6])
                else:
                    used = float(tokens[2])
                    available = max(0.0, total - used)
                used_pct = round((total - available) / total * 100.0, 1)
                return {
                    "usedPercent": max(0.0, min(100.0, used_pct)),
                    "totalMb": round(total, 1),
                }
    return None


def _parse_df_output(output: str) -> list[dict]:
    """Parses `df -mP` output to extract disk metrics."""
    disks = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("Filesystem"):
            continue
        tokens = line.split()
        if len(tokens) >= 6 and tokens[0].startswith("/dev/"):
            try:
                total_mb = float(tokens[1])
                used_pct = float(tokens[4].rstrip("%"))
                mountpoint = tokens[5]
                disks.append(
                    {
                        "name": mountpoint,
                        "usedPercent": max(0.0, min(100.0, round(used_pct, 1))),
                        "totalGb": round(total_mb / 1024.0, 1),
                    }
                )
            except (ValueError, IndexError):
                continue
    return disks


def _parse_vmstat_output(output: str) -> Optional[float]:
    """Parses `vmstat 1 2` output to calculate CPU usage."""
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if len(lines) >= 3:
        # Use the second measurement interval (the last line)
        tokens = lines[-1].split()
        if len(tokens) >= 15:
            try:
                idle = float(tokens[-3])
                return max(0.0, min(100.0, round(100.0 - idle, 1)))
            except (ValueError, IndexError):
                pass
    return None


def collect_ssh_metrics(
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
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        client.connect(
            hostname=ip,
            port=port,
            username=username,
            password=password,
            key_filename=key_filename,
            timeout=timeout,
            banner_timeout=timeout,
            auth_timeout=timeout,
        )

        # 1. Mémoire (free -m)
        _, stdout_mem, _ = client.exec_command("free -m", timeout=timeout)
        memory = _parse_free_output(stdout_mem.read().decode("utf-8", errors="ignore"))

        # 2. Disques (df -mP)
        _, stdout_df, _ = client.exec_command("df -mP", timeout=timeout)
        disks = _parse_df_output(stdout_df.read().decode("utf-8", errors="ignore"))

        # 3. CPU (vmstat 1 2)
        _, stdout_cpu, _ = client.exec_command("vmstat 1 2", timeout=timeout + 2.0)
        cpu_percent = _parse_vmstat_output(stdout_cpu.read().decode("utf-8", errors="ignore"))

        return {
            "cpuPercent": cpu_percent,
            "memory": memory,
            "disks": disks,
        }
    except Exception as exc:
        logger.debug("Collecte SSH impossible pour %s : %s", ip, exc)
        return {
            "cpuPercent": None,
            "memory": None,
            "disks": [],
        }
    finally:
        client.close()


def collect_system_metrics(
    ip: str,
    ssh_credentials: Optional[dict] = None,
) -> dict:
    """Entry point for system metrics collection for a discovered machine on the network.

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
        return collect_ssh_metrics(ip, **creds)

    # Équipement non configuré pour la supervision système
    return {
        "cpuPercent": None,
        "memory": None,
        "disks": [],
    }
