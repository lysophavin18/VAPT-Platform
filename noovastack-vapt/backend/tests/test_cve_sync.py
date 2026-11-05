import asyncio
import uuid
from datetime import datetime, timezone

import httpx

from api.routes.cve import _nvd_date, _parse_nvd_cve
from workers.tasks_cve import _request_json, _valid_uuid
from workers.tasks_scan import _match_cve_configuration


def test_parse_nvd_record_preserves_matching_data():
    parsed = _parse_nvd_cve({
        "id": "CVE-2026-98432",
        "published": "2026-10-15T10:00:00.000Z",
        "lastModified": "2026-10-16T11:00:00.000Z",
        "descriptions": [{"lang": "en", "value": "Linux kernel use-after-free"}],
        "metrics": {"cvssMetricV31": [{"baseSeverity": "HIGH", "cvssData": {"baseScore": 8.1}}]},
        "weaknesses": [{"description": [{"lang": "en", "value": "CWE-416"}]}],
        "references": [{"url": "https://git.kernel.org/example"}],
        "configurations": [{"nodes": []}],
    })

    assert parsed["title"] == "CVE-2026-98432"
    assert parsed["severity"] == "high"
    assert parsed["cvss_score"] == 8.1
    assert parsed["cwes"] == ["CWE-416"]
    assert parsed["configurations"] == [{"nodes": []}]


def test_system_audit_actor_is_null_and_user_uuid_is_preserved():
    actor = uuid.uuid4()
    assert _valid_uuid("system") is None
    assert _valid_uuid(None) is None
    assert _valid_uuid(str(actor)) == actor


def test_nvd_date_is_utc_api_format():
    value = datetime(2026, 10, 15, 10, 11, 12, tzinfo=timezone.utc)
    assert _nvd_date(value) == "2026-10-15T10:11:12.000Z"


def test_request_json_rejects_non_retryable_http_errors():
    async def run():
        def handler(request: httpx.Request):
            return httpx.Response(404, request=request, json={"message": "not found"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            try:
                await _request_json(client, "https://example.test")
                assert False, "expected a failed source request"
            except RuntimeError as exc:
                assert "intelligence source request failed" in str(exc)

    asyncio.run(run())


def test_cpe_version_range_requires_product_and_affected_version():
    configurations = [{
        "nodes": [{
            "cpeMatch": [{
                "vulnerable": True,
                "criteria": "cpe:2.3:o:linux:linux_kernel:*:*:*:*:*:*:*:*",
                "versionStartIncluding": "6.1.0",
                "versionEndExcluding": "6.1.190",
            }],
        }],
    }]

    assert _match_cve_configuration(configurations, "linux_kernel", "6.1.100")
    assert _match_cve_configuration(configurations, "linux_kernel", "6.1.190") is None
    assert _match_cve_configuration(configurations, "nginx", "1.24.0") is None
