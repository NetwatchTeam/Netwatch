"""Unit tests for the system metrics collection use case."""

from unittest.mock import MagicMock, patch

import pytest

from usecases.collect_system_metrics import (
    collect_ssh_metrics,
    collect_system_metrics,
    _parse_free_output,
    _parse_df_output,
    _parse_vmstat_output,
)


def test_parse_free_output():
    """Parses standard `free -m` output."""
    sample = (
        "               total        used        free      shared  buff/cache   available\n"
        "Mem:           16000        8000        4000         500        4000       12000\n"
        "Swap:           2048           0        2048\n"
    )
    parsed = _parse_free_output(sample)
    assert parsed == {"usedPercent": 25.0, "totalMb": 16000.0}


def test_parse_df_output():
    """Parses standard `df -mP` output."""
    sample = (
        "Filesystem     1048576-blocks  Used Available Capacity Mounted on\n"
        "udev                     7900     0      7900       0% /dev\n"
        "tmpfs                    1600     2      1598       1% /run\n"
        "/dev/sda1               50000 20000     30000      40% /\n"
        "/dev/sdb1              100000 80000     20000      80% /data\n"
    )
    parsed = _parse_df_output(sample)
    assert parsed == [
        {"name": "/", "usedPercent": 40.0, "totalGb": 48.8},
        {"name": "/data", "usedPercent": 80.0, "totalGb": 97.7},
    ]


def test_parse_vmstat_output():
    """Parses standard `vmstat 1 2` output."""
    sample = (
        "procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----\n"
        " r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st\n"
        " 1  0      0 6688768 286720 4363264    0    0     5    32  112  245  4  1 95  0  0\n"
        " 0  0      0 6688768 286720 4363264    0    0     0     0  512  980 12  3 85  0  0\n"
    )
    parsed = _parse_vmstat_output(sample)
    assert parsed == 15.0  # 100 - 85


@patch("usecases.collect_system_metrics.paramiko")
def test_collect_ssh_metrics_succes(mock_paramiko):
    """Simulates a successful remote SSH metrics collection."""
    mock_client = MagicMock()
    mock_paramiko.SSHClient.return_value = mock_client

    # Simuler stdout pour free -m, df -mP et vmstat 1 2
    free_stdout = MagicMock()
    free_stdout.read.return_value = (
        b"               total        used        free      shared  buff/cache   available\n"
        b"Mem:            8192        4096        2048         512        2048        4096\n"
    )

    df_stdout = MagicMock()
    df_stdout.read.return_value = (
        b"Filesystem     1048576-blocks  Used Available Capacity Mounted on\n"
        b"/dev/sda1               40960 20480     20480      50% /\n"
    )

    vmstat_stdout = MagicMock()
    vmstat_stdout.read.return_value = (
        b"procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----\n"
        b" r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st\n"
        b" 1  0      0 6688768 286720 4363264    0    0     5    32  112  245  4  1 95  0  0\n"
        b" 0  0      0 6688768 286720 4363264    0    0     0     0  512  980 15  5 80  0  0\n"
    )

    mock_client.exec_command.side_effect = [
        (None, free_stdout, None),
        (None, df_stdout, None),
        (None, vmstat_stdout, None),
    ]

    result = collect_ssh_metrics("192.168.10.70", username="admin", password="pwd")

    assert result["cpuPercent"] == 20.0
    assert result["memory"] == {"usedPercent": 50.0, "totalMb": 8192.0}
    assert result["disks"] == [{"name": "/", "usedPercent": 50.0, "totalGb": 40.0}]
    mock_client.connect.assert_called_once_with(
        hostname="192.168.10.70",
        port=22,
        username="admin",
        password="pwd",
        key_filename=None,
        timeout=3.0,
        banner_timeout=3.0,
        auth_timeout=3.0,
    )
    mock_client.close.assert_called_once()


@patch("usecases.collect_system_metrics.paramiko")
def test_collect_ssh_metrics_echec_connexion(mock_paramiko):
    """Returns fallback dictionary when SSH connection fails."""
    mock_client = MagicMock()
    mock_paramiko.SSHClient.return_value = mock_client
    mock_client.connect.side_effect = TimeoutError("Connection timed out")

    result = collect_ssh_metrics("192.168.10.70", username="admin")

    assert result == {"cpuPercent": None, "memory": None, "disks": []}
    mock_client.close.assert_called_once()


def test_collect_system_metrics_sans_ssh_retourne_vide():
    """Unmonitored remote devices return None/empty list cleanly without errors."""
    result = collect_system_metrics("192.168.1.50")
    assert result == {"cpuPercent": None, "memory": None, "disks": []}


@patch("usecases.collect_system_metrics.collect_ssh_metrics")
def test_collect_system_metrics_avec_credentials(mock_ssh):
    """Uses provided SSH credentials for configured target IPs."""
    mock_ssh.return_value = {"cpuPercent": 12.0, "memory": None, "disks": []}

    creds = {"192.168.10.80": {"username": "dbuser", "password": "secret"}}
    result = collect_system_metrics("192.168.10.80", ssh_credentials=creds)

    mock_ssh.assert_called_once_with("192.168.10.80", username="dbuser", password="secret")
    assert result == {"cpuPercent": 12.0, "memory": None, "disks": []}
