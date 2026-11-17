from datetime import datetime, timedelta, timezone

import pytest

from usecases.check_tls_use_case import CheckMachineTls
from usecases.ports.tls import PeerCertificate, TlsCertificateReader


class FakeTlsReader(TlsCertificateReader):
    """Faux port TLS : retourne un certificat ou lève une erreur."""

    def __init__(self, certificate=None, error=None):
        self.certificate = certificate
        self.error = error
        self.calls = []

    def read_certificate(self, ip, port, timeout):
        self.calls.append((ip, port, timeout))
        if self.error:
            raise self.error
        return self.certificate


def make_peer(valid_from_days, expires_in_days):
    now = datetime.now(timezone.utc)
    return PeerCertificate(
        fingerprint="abcdef123456",
        subject="CN=monserveur.local",
        issuer="CN=MonAutorite",
        valid_from=now + timedelta(days=valid_from_days),
        expires_at=now + timedelta(days=expires_in_days),
    )


def test_check_machine_tls_ok():
    peer = make_peer(-30, 60)
    reader = FakeTlsReader(peer)

    result = CheckMachineTls(reader).execute("192.168.1.10", port=443)

    assert reader.calls == [("192.168.1.10", 443, 3.0)]
    assert result["ip"] == "192.168.1.10"
    assert result["port"] == 443
    assert result["status"] == "ok"
    assert result["days_remaining"] >= 59
    assert result["not_after"] == peer.expires_at.isoformat()
    assert result["identifiant_certificat"] is None
    assert result["empreinte"] == "abcdef123456"
    assert result["sujet"] == "CN=monserveur.local"
    assert result["emetteur"] == "CN=MonAutorite"
    assert result["date_debut_validite"] == peer.valid_from.isoformat()
    assert result["date_expiration"] == peer.expires_at.isoformat()
    assert result["est_valide"] is True
    assert result["erreur_validation"] is None
    assert "date_observation" in result


def test_check_machine_tls_expiring_soon():
    reader = FakeTlsReader(make_peer(-80, 10))

    result = CheckMachineTls(reader).execute("192.168.1.10")

    assert result["status"] == "expiring_soon"
    assert result["days_remaining"] >= 9
    assert result["est_valide"] is True
    assert result["erreur_validation"] is None


def test_check_machine_tls_seuil_configurable():
    reader = FakeTlsReader(make_peer(-80, 10))

    result = CheckMachineTls(reader).execute("192.168.1.10", expiring_soon_days=5)

    assert result["status"] == "ok"


def test_check_machine_tls_expired():
    reader = FakeTlsReader(make_peer(-100, -5))

    result = CheckMachineTls(reader).execute("192.168.1.10")

    assert result["status"] == "expired"
    assert result["days_remaining"] < 0
    assert result["est_valide"] is False
    assert result["erreur_validation"] == "certificat expiré"


def test_check_machine_tls_unreachable():
    reader = FakeTlsReader(error=RuntimeError("Connection refused"))

    result = CheckMachineTls(reader).execute("192.168.1.10")

    assert result["ip"] == "192.168.1.10"
    assert result["port"] == 443
    assert result["status"] == "unreachable"
    assert result["est_valide"] is False
    assert result["erreur_validation"] == "Connection refused"
    assert "Connection refused" in result["message"]
    assert result["empreinte"] is None
    assert result["sujet"] is None
    assert result["emetteur"] is None
    assert result["date_debut_validite"] is None
    assert result["date_expiration"] is None
    assert "date_observation" in result
