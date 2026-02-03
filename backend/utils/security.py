"""
VAPT Platform - Security Utilities
Designed by VINNZz
"""
import re
import ipaddress
from typing import Optional, Tuple
from urllib.parse import urlparse


class TargetValidator:
    """Validates and classifies scan targets."""
    
    # Private IP ranges
    PRIVATE_RANGES = [
        ipaddress.ip_network('10.0.0.0/8'),
        ipaddress.ip_network('172.16.0.0/12'),
        ipaddress.ip_network('192.168.0.0/16'),
        ipaddress.ip_network('127.0.0.0/8'),
        ipaddress.ip_network('169.254.0.0/16'),
        ipaddress.ip_network('::1/128'),
        ipaddress.ip_network('fc00::/7'),
        ipaddress.ip_network('fe80::/10'),
    ]
    
    # Domain regex
    DOMAIN_REGEX = re.compile(
        r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
    )
    
    # IP address regex (basic)
    IPV4_REGEX = re.compile(
        r'^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
    )
    
    @classmethod
    def validate_ip(cls, ip_str: str) -> Tuple[bool, Optional[str]]:
        """
        Validate an IP address.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            ip = ipaddress.ip_address(ip_str)
            return True, None
        except ValueError as e:
            return False, str(e)
    
    @classmethod
    def validate_cidr(cls, cidr_str: str) -> Tuple[bool, Optional[str]]:
        """
        Validate a CIDR notation.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            network = ipaddress.ip_network(cidr_str, strict=False)
            
            # Don't allow networks larger than /16
            if network.prefixlen < 16:
                return False, "Network range too large (must be /16 or smaller)"
            
            return True, None
        except ValueError as e:
            return False, str(e)
    
    @classmethod
    def validate_domain(cls, domain: str) -> Tuple[bool, Optional[str]]:
        """
        Validate a domain name.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not domain:
            return False, "Domain cannot be empty"
        
        if len(domain) > 253:
            return False, "Domain too long"
        
        if not cls.DOMAIN_REGEX.match(domain):
            return False, "Invalid domain format"
        
        return True, None
    
    @classmethod
    def validate_url(cls, url: str) -> Tuple[bool, Optional[str]]:
        """
        Validate a URL.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            parsed = urlparse(url)
            
            if parsed.scheme not in ('http', 'https'):
                return False, "URL must use http or https scheme"
            
            if not parsed.netloc:
                return False, "URL must have a host"
            
            return True, None
        except Exception as e:
            return False, str(e)
    
    @classmethod
    def is_private_ip(cls, ip_str: str) -> bool:
        """Check if an IP address is private/internal."""
        try:
            ip = ipaddress.ip_address(ip_str)
            return any(ip in network for network in cls.PRIVATE_RANGES)
        except ValueError:
            return False
    
    @classmethod
    def is_internal_target(cls, target: str) -> bool:
        """
        Check if a target is internal/private.
        
        Args:
            target: IP address, CIDR, domain, or URL
        
        Returns:
            True if target is internal/private
        """
        # Check if it's a URL
        if target.startswith(('http://', 'https://')):
            parsed = urlparse(target)
            host = parsed.hostname
        else:
            host = target
        
        # Remove CIDR notation if present
        if '/' in host:
            host = host.split('/')[0]
        
        # Check if it's an IP
        try:
            ip = ipaddress.ip_address(host)
            return cls.is_private_ip(str(ip))
        except ValueError:
            pass
        
        # Check common internal domains
        internal_patterns = [
            'localhost',
            '.local',
            '.internal',
            '.corp',
            '.lan',
            '.home',
            '.intranet',
        ]
        
        host_lower = host.lower()
        return any(host_lower == p.lstrip('.') or host_lower.endswith(p) 
                   for p in internal_patterns)
    
    @classmethod
    def classify_target(cls, target: str) -> str:
        """
        Classify a target type.
        
        Returns:
            One of: 'ip', 'cidr', 'domain', 'url', 'unknown'
        """
        if target.startswith(('http://', 'https://')):
            return 'url'
        
        if '/' in target:
            is_valid, _ = cls.validate_cidr(target)
            if is_valid:
                return 'cidr'
        
        is_valid, _ = cls.validate_ip(target)
        if is_valid:
            return 'ip'
        
        is_valid, _ = cls.validate_domain(target)
        if is_valid:
            return 'domain'
        
        return 'unknown'


class RateLimiter:
    """Simple rate limiter for tool execution."""
    
    def __init__(self, redis_client):
        self.redis = redis_client
    
    async def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int]:
        """
        Check if rate limit is exceeded.
        
        Returns:
            Tuple of (is_allowed, remaining_requests)
        """
        import time
        
        current_time = int(time.time())
        window_start = current_time - window_seconds
        
        # Clean old entries and count current
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        pipe.zadd(key, {str(current_time): current_time})
        pipe.expire(key, window_seconds)
        
        results = await pipe.execute()
        current_count = results[1]
        
        remaining = max(0, max_requests - current_count - 1)
        is_allowed = current_count < max_requests
        
        return is_allowed, remaining


def sanitize_command_arg(arg: str) -> str:
    """
    Sanitize a command line argument to prevent injection.
    
    Args:
        arg: The argument to sanitize
    
    Returns:
        Sanitized argument
    """
    # Remove shell metacharacters
    dangerous_chars = ['|', '&', ';', '$', '`', '(', ')', '{', '}', 
                       '[', ']', '<', '>', '!', '\n', '\r', '\\']
    
    result = arg
    for char in dangerous_chars:
        result = result.replace(char, '')
    
    return result.strip()


def validate_port_range(port_str: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a port or port range string.
    
    Args:
        port_str: Port number or range (e.g., "80", "1-1024", "80,443,8080")
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not port_str:
        return False, "Port cannot be empty"
    
    # Remove spaces
    port_str = port_str.replace(' ', '')
    
    def is_valid_port(p: str) -> bool:
        try:
            port = int(p)
            return 1 <= port <= 65535
        except ValueError:
            return False
    
    # Check for comma-separated ports
    if ',' in port_str:
        ports = port_str.split(',')
        for port in ports:
            if '-' in port:
                # Range within comma-separated list
                parts = port.split('-')
                if len(parts) != 2:
                    return False, f"Invalid port range: {port}"
                if not (is_valid_port(parts[0]) and is_valid_port(parts[1])):
                    return False, f"Invalid port range: {port}"
                if int(parts[0]) > int(parts[1]):
                    return False, f"Invalid port range (start > end): {port}"
            else:
                if not is_valid_port(port):
                    return False, f"Invalid port: {port}"
    elif '-' in port_str:
        # Simple range
        parts = port_str.split('-')
        if len(parts) != 2:
            return False, f"Invalid port range: {port_str}"
        if not (is_valid_port(parts[0]) and is_valid_port(parts[1])):
            return False, f"Invalid port range: {port_str}"
        if int(parts[0]) > int(parts[1]):
            return False, f"Invalid port range (start > end): {port_str}"
    else:
        # Single port
        if not is_valid_port(port_str):
            return False, f"Invalid port: {port_str}"
    
    return True, None
