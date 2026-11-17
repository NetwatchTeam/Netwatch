from unittest.mock import Mock

import pytest

from usecases.check_expected_services import CheckExpectedServices
from usecases.check_tcp_service import CheckTcpService


def make_use_case(result=None):
    check_tcp_service = Mock(spec=CheckTcpService)
    check_tcp_service.execute.return_value = result or {"reachable": True}
    return CheckExpectedServices(check_tcp_service), check_tcp_service


def test_no_configuration(monkeypatch):
    """Vérifie que l'absence de configuration renvoie une liste vide."""
    monkeypatch.delenv("SCANNER_TCP_TARGETS", raising=False)
    use_case, check = make_use_case()

    assert use_case.execute() == []
    check.execute.assert_not_called()


def test_configured_service(monkeypatch):
    """Vérifie qu'un service configuré est contrôlé correctement."""
    monkeypatch.setenv(
        "SCANNER_TCP_TARGETS",
        '[{"ip": "127.0.0.1", "port": 8000, "timeout": 1.0}]',
    )
    use_case, check = make_use_case()

    result = use_case.execute()

    check.execute.assert_called_once_with(ip="127.0.0.1", port=8000, timeout=1.0)
    assert result == [{"reachable": True}]


def test_timeout_par_defaut(monkeypatch):
    monkeypatch.setenv("SCANNER_TCP_TARGETS", '[{"ip": "127.0.0.1", "port": 8000}]')
    use_case, check = make_use_case()

    use_case.execute()

    check.execute.assert_called_once_with(ip="127.0.0.1", port=8000, timeout=3.0)


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
    use_case, check = make_use_case()

    with pytest.raises(ValueError):
        use_case.execute()

    check.execute.assert_not_called()
