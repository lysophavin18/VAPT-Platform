"""
NoovaStack VAPT Platform - Safety Framework
Validates all actions before execution.
"""
from dataclasses import dataclass, field
from datetime import datetime, time
from enum import Enum
from ipaddress import ip_address, ip_network
from typing import Any
from urllib.parse import urlparse


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ValidationResult:
    def __init__(self, passed: bool, reason: str = ""):
        self.passed = passed
        self.reason = reason


@dataclass
class SafetyContext:
    scan_id: str | None = None
    project_id: str | None = None
    engagement_id: str | None = None
    assessment_mode: str = "black_box"
    scan_depth: str = "quick"
    target: str = ""
    action: str = ""
    tool: str = ""
    testing_window_start: str | None = None
    testing_window_end: str | None = None
    is_approved: bool = False
    scope_is_approved: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


BLOCKED_ACTIONS = {
    "dos", "ddos", "brute_force_password", "credential_theft",
    "malware", "data_exfiltration", "destructive_exploit",
    "unauthorized_pivot", "production_data_modification",
}

BLOCKED_TOOLS = {
    "hydra": ["brute_force_password"],
}

HIGH_RISK_TOOLS = {"sqlmap", "ghauri", "ssrf_validator", "command_injection_validator"}

RESTRICTED_NETWORKS = tuple(ip_network(value) for value in (
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "0.0.0.0/32",
    "fc00::/7",
    "fe80::/10",
    "::1/128",
    "::/128",
))


def validate_scope(target: str, engagement_id: str | None, allow_internal: bool = False) -> ValidationResult:
    if not target:
        return ValidationResult(False, "No target specified")
    network = _target_network(target)
    if network and _is_restricted_network(network) and not allow_internal:
        return ValidationResult(False, f"Internal or local network target blocked: {target}")
    return ValidationResult(True)


def _target_network(target: str):
    value = target.strip()
    if not value:
        return None

    try:
        return ip_network(value, strict=False)
    except ValueError:
        pass

    parsed = urlparse(value if "://" in value else f"//{value}")
    host = parsed.hostname
    if not host:
        return None
    try:
        return ip_network(ip_address(host), strict=False)
    except ValueError:
        return None


def _is_restricted_network(network) -> bool:
    for restricted in RESTRICTED_NETWORKS:
        if network.version == restricted.version and network.overlaps(restricted):
            return True
    return network.network_address.is_private or network.broadcast_address.is_private


def validate_testing_window(ctx: SafetyContext) -> ValidationResult:
    if not ctx.testing_window_start or not ctx.testing_window_end:
        return ValidationResult(True)
    try:
        now = datetime.now().time()
        start = time.fromisoformat(ctx.testing_window_start)
        end = time.fromisoformat(ctx.testing_window_end)
        if start <= end:
            if not (start <= now <= end):
                return ValidationResult(False, "Outside testing window")
        else:
            if not (now >= start or now <= end):
                return ValidationResult(False, "Outside testing window")
    except ValueError:
        return ValidationResult(False, "Invalid testing window format")
    return ValidationResult(True)


def validate_approval(ctx: SafetyContext) -> ValidationResult:
    needs_approval = (
        ctx.scan_depth == "deep"
        or ctx.assessment_mode == "white_box"
        or ctx.action in HIGH_RISK_TOOLS
        or any(ctx.tool.lower() == t for t in HIGH_RISK_TOOLS)
    )
    if needs_approval and not ctx.is_approved:
        return ValidationResult(False, f"Review required for {ctx.action or ctx.tool}")
    return ValidationResult(True)


def validate_action_safety(ctx: SafetyContext) -> ValidationResult:
    if ctx.action in BLOCKED_ACTIONS:
        return ValidationResult(False, f"Blocked action: {ctx.action}")
    if ctx.tool.lower() in BLOCKED_TOOLS:
        blocked_for = BLOCKED_TOOLS[ctx.tool.lower()]
        if ctx.action in blocked_for:
            return ValidationResult(False, f"Tool {ctx.tool} blocked for {ctx.action}")
    return ValidationResult(True)


def run_safety_checks(ctx: SafetyContext) -> list[ValidationResult]:
    results = []
    results.append(validate_scope(ctx.target, ctx.engagement_id, ctx.scope_is_approved))
    results.append(validate_testing_window(ctx))
    results.append(validate_approval(ctx))
    results.append(validate_action_safety(ctx))
    return results


def is_safe(ctx: SafetyContext) -> tuple[bool, list[str]]:
    results = run_safety_checks(ctx)
    failed = [r.reason for r in results if not r.passed]
    return len(failed) == 0, failed
