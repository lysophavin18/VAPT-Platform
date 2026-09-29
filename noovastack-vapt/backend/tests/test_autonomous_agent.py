import json

from workers.tasks_ai import _extract_json


def test_extract_json_handles_fenced_and_bare_json():
    bare = '{"actions": [{"module": "security_headers"}]}'
    fenced = "```json\n{\"actions\": []}\n```"
    text_with_prefix = 'Sure! Here is the plan:\n{"actions": [{"module": "http_probe"}]}'

    assert _extract_json(bare) == {"actions": [{"module": "security_headers"}]}
    assert _extract_json(fenced) == {"actions": []}
    assert _extract_json(text_with_prefix) == {"actions": [{"module": "http_probe"}]}


def test_extract_json_returns_empty_for_invalid_input():
    assert _extract_json("no json here") == {}
    assert _extract_json("") == {}
    assert _extract_json("[1, 2, 3]") == {}


def test_plan_prompt_contains_allowlist_and_scope():
    import asyncio

    from workers.tasks_ai import _plan_assessment

    class _Project:
        id = "proj-1"
        name = "Test Project"
        environment = "testing"

    class _Engagement:
        id = "eng-1"
        assessment_mode = "black_box"

    class _Asset:
        asset_type = "url"
        value = "https://example.com/"
        technology = {}
        ports_services = {}

    loop = asyncio.new_event_loop()

    async def capture_prompt():
        import httpx

        original_post = httpx.AsyncClient.post

        captured = {}

        async def fake_post(self, url, **kwargs):
            captured["url"] = str(url)
            messages = kwargs.get("json", {}).get("messages", [])
            captured["system"] = messages[0]["content"] if messages else ""
            captured["user"] = messages[1]["content"] if len(messages) > 1 else ""
            return _FakeResponse()

        httpx.AsyncClient.post = fake_post
        try:
            await _plan_assessment("Web Security Agent", _Project(), [_Asset()], _Engagement(), "Assess the app", 3)
        finally:
            httpx.AsyncClient.post = original_post
        return captured

    try:
        captured = loop.run_until_complete(capture_prompt())
        assert "allowed_modules" in captured["user"]
        assert "security_headers" in captured["user"]
        assert "https://example.com/" in captured["user"]
        assert "Assess the app" in captured["user"]
    finally:
        loop.close()


class _FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"choices": [{"message": {"content": json.dumps({"actions": []})}}]}
