from unittest.mock import patch

import pytest

from usecases.check_expected_services import check_expected_services


def test_no_configuration(monkeypatch):
    """Vérifie que l'absence de configuration renvoie une liste vide."""
    monkeypatch.delenv("SCANNER_TCP_TARGETS", raising=False)

    assert check_expected_services() == []


def test_configured_service(monkeypatch):
    """Vérifie qu'un service configuré est contrôlé correctement."""
    monkeypatch.setenv(
        "SCANNER_TCP_TARGETS",
        '[{"ip": "127.0.0.1", "port": 8000, "timeout": 1.0}]',
    )

    with patch(
        "usecases.check_expected_services.check_tcp_service",
        return_value={"reachable": True},
    ) as check:
        result = check_expected_services()

    check.assert_called_once_with(
        ip="127.0.0.1",
        port=8000,
        timeout=1.0,
    )
    assert result == [{"reachable": True}]


@pytest.mark.parametrize(
    "configuration",
    [
        "invalide",
        "{}",
        "[42]",
        '[{"ip": "127.0.0.1"}]',
        '[{"ip": 123, "port": 8000}]',
    ],
)
def test_invalid_configuration(monkeypatch, configuration):
    """Vérifie que les configurations invalides lèvent une ValueError."""
    monkeypatch.setenv("SCANNER_TCP_TARGETS", configuration)

    with pytest.raises(ValueError):
        check_expected_services()