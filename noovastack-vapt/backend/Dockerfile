FROM alpine:3.22 AS depx

ARG DEPX_VERSION=0.1.1
ARG TARGETARCH
RUN apk add --no-cache ca-certificates curl unzip \
    && arch="${TARGETARCH:-amd64}" \
    && case "$arch" in \
        amd64) checksum="9f00c8133369eb75741a1ed52eb0d4102f965b1da413b09f190332981264338f" ;; \
        arm64) checksum="42a8f4ebbf229a818f9fb545dd63b24613ab1dd70015c8238782b0e32a18cafc" ;; \
        *) echo "Unsupported depx architecture: $arch" >&2; exit 1 ;; \
    esac \
    && archive="depx_${DEPX_VERSION}_linux_${arch}.zip" \
    && curl -fsSLO "https://github.com/projectdiscovery/depx/releases/download/v${DEPX_VERSION}/${archive}" \
    && echo "${checksum}  ${archive}" | sha256sum -c - \
    && unzip -q "$archive" -d /tmp/depx \
    && install -m 0755 /tmp/depx/depx /usr/local/bin/depx

FROM golang:alpine AS pdtools

# ProjectDiscovery tools and ffuf, built from source with go install (arch-native).
ENV GOBIN=/out CGO_ENABLED=0
RUN apk add --no-cache ca-certificates git \
    && go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest \
    && go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest \
    && go install github.com/projectdiscovery/httpx/cmd/httpx@latest \
    && go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest \
    && go install github.com/projectdiscovery/katana/cmd/katana@latest \
    && go install github.com/ffuf/ffuf/v2@latest

# naabu's SYN-scan engine needs cgo + libpcap, which makes a CGO_ENABLED=0 build produce a
# binary dynamically linked against musl's loader (/lib/ld-musl-x86_64.so.1) — that doesn't
# exist on the glibc-based runtime image below, so the binary fails to exec there at all.
# Statically link it instead so it's runtime-independent like the other tools above.
RUN apk add --no-cache libpcap-dev build-base \
    && CGO_ENABLED=1 go install -ldflags '-extldflags "-static"' github.com/projectdiscovery/naabu/v2/cmd/naabu@latest

FROM python:3.12-slim

WORKDIR /app

COPY --from=depx /usr/local/bin/depx /usr/local/bin/depx
COPY --from=pdtools /out/nuclei /out/subfinder /out/dnsx /out/katana /out/naabu /out/ffuf /usr/local/bin/
# The Go httpx binary is renamed to avoid clobbering pip's httpx CLI script.
COPY --from=pdtools /out/httpx /usr/local/bin/httpx-pd

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev ca-certificates curl git nmap sqlmap sslscan whatweb \
    libcairo2 libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf-2.0-0 \
    libffi-dev shared-mime-info fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN python -m venv /opt/wapiti \
    && /opt/wapiti/bin/pip install --no-cache-dir wapiti3==3.2.4 \
    && ln -s /opt/wapiti/bin/wapiti /usr/local/bin/wapiti

RUN python -m venv /opt/security-tools \
    && /opt/security-tools/bin/pip install --no-cache-dir bandit pip-audit semgrep \
    && ln -s /opt/security-tools/bin/bandit /usr/local/bin/bandit \
    && ln -s /opt/security-tools/bin/pip-audit /usr/local/bin/pip-audit \
    && ln -s /opt/security-tools/bin/semgrep /usr/local/bin/semgrep

RUN git clone --depth 1 https://github.com/testssl/testssl.sh.git /opt/testssl.sh \
    && ln -s /opt/testssl.sh/testssl.sh /usr/local/bin/testssl.sh

# Pre-download nuclei templates (best-effort) so scans work offline at runtime.
RUN nuclei -update-templates -silent || true

RUN mkdir -p /app/results

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
