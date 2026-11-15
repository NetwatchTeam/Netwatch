from datetime import datetime, timedelta, timezone

from presenters.scan_presenter import ScanPresenter
from usecases.responses.scan_response import ScanResponse, ThroughputResponse


def test_present_formate_le_contrat():
    response = ScanResponse(
        scanned_at=datetime(2026, 11, 15, 10, 30, 5, 123456, tzinfo=timezone.utc),
        machines=[{"ip": "10.0.0.1"}],
        throughput=[ThroughputResponse("10.0.0.1", "10.0.0.2", 94.5)],
    )

    assert ScanPresenter.present(response) == {
        "contractVersion": "1.0.0",
        "scannedAt": "2026-11-15T10:30:05.123Z",
        "devices": [{"ip": "10.0.0.1"}],
        "throughput": [{"sourceIp": "10.0.0.1", "targetIp": "10.0.0.2", "mbps": 94.5}],
    }


def test_present_date_naive_consideree_utc():
    response = ScanResponse(scanned_at=datetime(2026, 11, 15, 10, 0, 0))

    assert ScanPresenter.present(response)["scannedAt"] == "2026-11-15T10:00:00.000Z"


def test_present_convertit_en_utc():
    paris = timezone(timedelta(hours=1))
    response = ScanResponse(scanned_at=datetime(2026, 11, 15, 11, 0, 0, tzinfo=paris))

    assert ScanPresenter.present(response)["scannedAt"] == "2026-11-15T10:00:00.000Z"


def test_present_sans_machine_ni_debit():
    result = ScanPresenter.present(ScanResponse(scanned_at=datetime(2026, 1, 1)))

    assert result["devices"] == []
    assert result["throughput"] == []
