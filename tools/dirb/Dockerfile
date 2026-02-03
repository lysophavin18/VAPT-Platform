# VAPT Platform - Dirb Container
# Designed by VINNZz
FROM kalilinux/kali-rolling

LABEL maintainer="VINNZz"
LABEL description="Dirb - URL Bruteforcer for web content discovery"
LABEL version="2.0"

# Install dirb and dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        dirb \
        curl \
        ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create working directories
WORKDIR /opt/dirb

# Create wordlist directory
RUN mkdir -p /wordlists /results

# Copy custom wordlists (mounted at runtime)
VOLUME ["/wordlists", "/results"]

# Non-root user for security
RUN useradd -m -d /home/dirb -s /bin/bash dirb
RUN chown -R dirb:dirb /opt/dirb /results

USER dirb

ENTRYPOINT ["dirb"]
CMD ["-h"]
