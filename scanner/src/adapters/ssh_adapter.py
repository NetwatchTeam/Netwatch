"""Adapter: collects system metrics on a remote machine through paramiko.

This is the only module aware of paramiko, of the SSH transport and of the
output formats of ``free``, ``df`` and ``vmstat``.
It depends on the ``SystemMetricsFetcher`` port, never on the domain entities.
"""

import paramiko

from usecases.ports.ssh import (
    RemoteDisk,
    RemoteMemory,
    RemoteMetrics,
    SystemMetricsFetcher,
)


def _parse_free_output(output: str) -> RemoteMemory | None:
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
                return RemoteMemory(
                    used_percent=max(0.0, min(100.0, used_pct)),
                    total_mb=round(total, 1),
                )
    return None


def _parse_df_output(output: str) -> tuple[RemoteDisk, ...]:
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
                disks.append(
                    RemoteDisk(
                        mountpoint=tokens[5],
                        used_percent=max(0.0, min(100.0, round(used_pct, 1))),
                        total_gb=round(total_mb / 1024.0, 1),
                    )
                )
            except (ValueError, IndexError):
                continue
    return tuple(disks)


def _parse_vmstat_output(output: str) -> float | None:
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


class ParamikoMetricsFetcher(SystemMetricsFetcher):
    """SystemMetricsFetcher implemented with paramiko."""

    def fetch(
        self,
        ip: str,
        username: str,
        password: str | None,
        key_filename: str | None,
        port: int,
        timeout: float,
    ) -> RemoteMetrics:
        """Runs ``free -m``, ``df -mP`` and ``vmstat 1 2`` on a remote machine.

        Args:
            ip: Target machine IP address.
            username: SSH login username.
            password: Optional SSH password.
            key_filename: Optional private key file path.
            port: SSH port.
            timeout: Network and command timeout in seconds.

        Returns:
            The parsed metrics. Metrics unreadable from the command outputs are
            None (or empty for disks).

        Raises:
            RuntimeError: If the connection, the authentication, a command or
                the parsing of its output fails. The connection is always
                closed.
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

            outputs = []
            for command, command_timeout in (
                ("free -m", timeout),
                ("df -mP", timeout),
                ("vmstat 1 2", timeout + 2.0),
            ):
                _, stdout, _ = client.exec_command(command, timeout=command_timeout)
                outputs.append(stdout.read().decode("utf-8", errors="ignore"))

            free_out, df_out, vmstat_out = outputs
            return RemoteMetrics(
                cpu_percent=_parse_vmstat_output(vmstat_out),
                memory=_parse_free_output(free_out),
                disks=_parse_df_output(df_out),
            )
        except Exception as exc:
            raise RuntimeError(f"Collecte SSH impossible pour {ip} : {exc}") from exc
        finally:
            client.close()
