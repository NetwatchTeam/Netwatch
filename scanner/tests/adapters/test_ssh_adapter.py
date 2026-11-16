"""Tests de l'adapteur SSH : parsing des sorties et paramiko simulé."""

from unittest.mock import MagicMock, patch

import pytest

from adapters.ssh_adapter import (
    ParamikoMetricsFetcher,
    _parse_df_output,
    _parse_free_output,
    _parse_vmstat_output,
)
from usecases.ports.ssh import RemoteDisk, RemoteMemory, RemoteMetrics


def test_parse_free_output():
    sample = (
        "               total        used        free      shared  buff/cache   available\n"
        "Mem:           16000        8000        4000         500        4000       12000\n"
        "Swap:           2048           0        2048\n"
    )
    assert _parse_free_output(sample) == RemoteMemory(used_percent=25.0, total_mb=16000.0)


def test_parse_free_output_sans_ligne_mem():
    assert _parse_free_output("rien d'exploitable") is None


def test_parse_df_output():
    sample = (
        "Filesystem     1048576-blocks  Used Available Capacity Mounted on\n"
        "udev                     7900     0      7900       0% /dev\n"
        "tmpfs                    1600     2      1598       1% /run\n"
        "/dev/sda1               50000 20000     30000      40% /\n"
        "/dev/sdb1              100000 80000     20000      80% /data\n"
    )
    assert _parse_df_output(sample) == (
        RemoteDisk(mountpoint="/", used_percent=40.0, total_gb=48.8),
        RemoteDisk(mountpoint="/data", used_percent=80.0, total_gb=97.7),
    )


def test_parse_vmstat_output():
    sample = (
        "procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----\n"
        " r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st\n"
        " 1  0      0 6688768 286720 4363264    0    0     5    32  112  245  4  1 95  0  0\n"
        " 0  0      0 6688768 286720 4363264    0    0     0     0  512  980 12  3 85  0  0\n"
    )
    assert _parse_vmstat_output(sample) == 15.0  # 100 - 85


def _stdout(content: bytes) -> MagicMock:
    stdout = MagicMock()
    stdout.read.return_value = content
    return stdout


@patch("adapters.ssh_adapter.paramiko")
def test_fetch_succes(mock_paramiko):
    mock_client = MagicMock()
    mock_paramiko.SSHClient.return_value = mock_client
    mock_client.exec_command.side_effect = [
        (None, _stdout(
            b"               total        used        free      shared  buff/cache   available\n"
            b"Mem:            8192        4096        2048         512        2048        4096\n"
        ), None),
        (None, _stdout(
            b"Filesystem     1048576-blocks  Used Available Capacity Mounted on\n"
            b"/dev/sda1               40960 20480     20480      50% /\n"
        ), None),
        (None, _stdout(
            b"procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----\n"
            b" r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st\n"
            b" 1  0      0 6688768 286720 4363264    0    0     5    32  112  245  4  1 95  0  0\n"
            b" 0  0      0 6688768 286720 4363264    0    0     0     0  512  980 15  5 80  0  0\n"
        ), None),
    ]

    result = ParamikoMetricsFetcher().fetch(
        "192.168.10.70",
        username="admin",
        password="pwd",
        key_filename=None,
        port=22,
        timeout=3.0,
    )

    assert result == RemoteMetrics(
        cpu_percent=20.0,
        memory=RemoteMemory(used_percent=50.0, total_mb=8192.0),
        disks=(RemoteDisk(mountpoint="/", used_percent=50.0, total_gb=40.0),),
    )
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


@patch("adapters.ssh_adapter.paramiko")
def test_fetch_echec_connexion_leve_runtime_error(mock_paramiko):
    mock_client = MagicMock()
    mock_paramiko.SSHClient.return_value = mock_client
    mock_client.connect.side_effect = TimeoutError("Connection timed out")

    with pytest.raises(RuntimeError, match="Connection timed out"):
        ParamikoMetricsFetcher().fetch(
            "192.168.10.70",
            username="admin",
            password=None,
            key_filename=None,
            port=22,
            timeout=3.0,
        )

    mock_client.close.assert_called_once()
