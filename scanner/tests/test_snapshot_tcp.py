from presenters.snapshot_presenter import SnapshotPresenter


def test_snapshot_conserve_tcp_et_erreur_icmp():
    checks = [
        {
            "port": 22,
            "reachable": True,
            "status": "open",
        }
    ]

    snapshot = SnapshotPresenter.to_snapshot([
        {
            "ip": "192.168.10.50",
            "latencyMs": None,
            "packetLossPercent": None,
            "icmpError": "Erreur ICMP simulée",
            "tcpChecks": checks,
        }
    ])

    device = snapshot["devices"][0]

    assert device["tcpChecks"] == checks
    assert device["icmpError"] == "Erreur ICMP simulée"