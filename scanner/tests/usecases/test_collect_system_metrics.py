"""Tests unitaires du cas d'usage de collecte des métriques système."""

import pytest

from usecases.collect_system_metrics import CollectSystemMetrics
from usecases.ports.ssh import (
    RemoteDisk,
    RemoteMemory,
    RemoteMetrics,
    SystemMetricsFetcher,
)

EMPTY = {"cpuPercent": None, "memory": None, "disks": []}


class FakeMetricsFetcher(SystemMetricsFetcher):
    """Faux port SSH : retourne des métriques ou lève une erreur."""

    def __init__(self, metrics=None, error=None):
        self.metrics = metrics
        self.error = error
        self.calls = []

    def fetch(self, ip, username, password, key_filename, port, timeout):
        self.calls.append(
            dict(
                ip=ip,
                username=username,
                password=password,
                key_filename=key_filename,
                port=port,
                timeout=timeout,
            )
        )
        if self.error:
            raise self.error
        return self.metrics


@pytest.fixture(autouse=True)
def no_ssh_env(monkeypatch):
    for name in (
        "NETWATCH_SSH_USER",
        "NETWATCH_SSH_PASSWORD",
        "NETWATCH_SSH_KEY",
        "NETWATCH_SSH_PORT",
    ):
        monkeypatch.delenv(name, raising=False)


def test_collect_ssh_metrics_succes():
    fetcher = FakeMetricsFetcher(
        RemoteMetrics(
            cpu_percent=20.0,
            memory=RemoteMemory(used_percent=50.0, total_mb=8192.0),
            disks=(RemoteDisk(mountpoint="/", used_percent=50.0, total_gb=40.0),),
        )
    )

    result = CollectSystemMetrics(fetcher).collect_ssh_metrics(
        "192.168.10.70", username="admin", password="pwd"
    )

    assert result == {
        "cpuPercent": 20.0,
        "memory": {"usedPercent": 50.0, "totalMb": 8192.0},
        "disks": [{"name": "/", "usedPercent": 50.0, "totalGb": 40.0}],
    }
    assert fetcher.calls == [
        dict(
            ip="192.168.10.70",
            username="admin",
            password="pwd",
            key_filename=None,
            port=22,
            timeout=3.0,
        )
    ]


def test_collect_ssh_metrics_metriques_illisibles():
    fetcher = FakeMetricsFetcher(RemoteMetrics())

    result = CollectSystemMetrics(fetcher).collect_ssh_metrics(
        "192.168.10.70", username="admin"
    )

    assert result == EMPTY


def test_collect_ssh_metrics_echec_retourne_le_repli():
    fetcher = FakeMetricsFetcher(error=RuntimeError("Connection timed out"))

    result = CollectSystemMetrics(fetcher).collect_ssh_metrics(
        "192.168.10.70", username="admin"
    )

    assert result == EMPTY


def test_collect_system_metrics_sans_ssh_retourne_vide():
    """Les équipements distants non supervisés retournent None / liste vide, sans erreur."""
    fetcher = FakeMetricsFetcher()

    result = CollectSystemMetrics(fetcher).execute("192.168.1.50")

    assert result == EMPTY
    assert fetcher.calls == []


def test_collect_system_metrics_avec_credentials():
    """Utilise les identifiants SSH fournis pour les IP cibles configurées."""
    fetcher = FakeMetricsFetcher(RemoteMetrics(cpu_percent=12.0))

    creds = {"192.168.10.80": {"username": "dbuser", "password": "secret"}}
    result = CollectSystemMetrics(fetcher).execute(
        "192.168.10.80", ssh_credentials=creds
    )

    assert result == {"cpuPercent": 12.0, "memory": None, "disks": []}
    assert fetcher.calls[0]["username"] == "dbuser"
    assert fetcher.calls[0]["password"] == "secret"


def test_collect_system_metrics_credentials_par_defaut():
    fetcher = FakeMetricsFetcher(RemoteMetrics(cpu_percent=1.0))

    CollectSystemMetrics(fetcher).execute(
        "192.168.10.99", ssh_credentials={"default": {"username": "root"}}
    )

    assert fetcher.calls[0]["username"] == "root"


def test_collect_system_metrics_credentials_depuis_l_environnement(monkeypatch):
    monkeypatch.setenv("NETWATCH_SSH_USER", "envuser")
    monkeypatch.setenv("NETWATCH_SSH_PORT", "2222")
    fetcher = FakeMetricsFetcher(RemoteMetrics(cpu_percent=1.0))

    CollectSystemMetrics(fetcher).execute("192.168.10.99")

    assert fetcher.calls[0]["username"] == "envuser"
    assert fetcher.calls[0]["port"] == 2222
