FROM debian:bookworm-slim

LABEL maintainer="VINNZz" \
      description="Hydra - Network logon cracker"

# Install hydra from Debian repos (thc-hydra package)
RUN apt-get update && apt-get install -y --no-install-recommends \
    hydra \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create output and wordlists directories
RUN mkdir -p /output /wordlists

WORKDIR /app

ENTRYPOINT ["hydra"]
CMD ["-h"]
