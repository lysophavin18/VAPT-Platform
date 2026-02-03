# VAPT Platform - OWASP ZAP Container
# Designed by VINNZz
FROM ghcr.io/zaproxy/zaproxy:stable

LABEL maintainer="VINNZz"
LABEL description="OWASP ZAP - Dynamic Application Security Testing"
LABEL version="2.0"

USER root

# Create results directory
RUN mkdir -p /zap/results && \
    chown -R zap:zap /zap/results

USER zap

# Volume mount for results
VOLUME ["/zap/results"]

# Expose ZAP API port
EXPOSE 8080

# Default entrypoint for API mode
ENTRYPOINT ["zap.sh"]
CMD ["-daemon", "-host", "0.0.0.0", "-port", "8080", "-config", "api.addrs.addr.name=.*", "-config", "api.addrs.addr.regex=true", "-config", "api.disablekey=true"]
