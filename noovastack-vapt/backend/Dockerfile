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

ENV GOBIN=/out CGO_ENABLED=0
RUN apk add --no-cache ca-certificates git \
    && go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest \
    && go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest \
    && go install github.com/projectdiscovery/httpx/cmd/httpx@latest \
    && go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest \
    && go install github.com/projectdiscovery/katana/cmd/katana@latest \
    && go install github.com/ffuf/ffuf/v2@latest \
    && go install github.com/OJ/gobuster/v3@latest \
    && go install github.com/hahwul/dalfox/v2@latest

RUN apk add --no-cache libpcap-dev build-base \
    && CGO_ENABLED=1 go install -ldflags '-extldflags "-static"' github.com/projectdiscovery/naabu/v2/cmd/naabu@latest

FROM alpine:3.22 AS trivy-dl
RUN apk add --no-cache curl tar \
    && TRIVY_VERSION=$(curl -s https://api.github.com/repos/aquasecurity/trivy/releases/latest | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/') \
    && echo "trivy version: $TRIVY_VERSION" \
    && curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
       | tar -xz -C /usr/local/bin trivy \
    && chmod +x /usr/local/bin/trivy

FROM alpine:3.22 AS grype-dl
RUN apk add --no-cache curl bash \
    && curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin \
    && chmod +x /usr/local/bin/grype

FROM python:3.12-slim

WORKDIR /app

COPY --from=depx    /usr/local/bin/depx                                                    /usr/local/bin/depx
COPY --from=pdtools /out/nuclei /out/subfinder /out/dnsx /out/katana /out/naabu            /usr/local/bin/
COPY --from=pdtools /out/ffuf /out/gobuster /out/dalfox                                    /usr/local/bin/
COPY --from=pdtools /out/httpx /usr/local/bin/httpx-pd
COPY --from=trivy-dl /usr/local/bin/trivy                                                  /usr/local/bin/trivy
COPY --from=grype-dl /usr/local/bin/grype                                                  /usr/local/bin/grype

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev ca-certificates curl git \
    nmap sqlmap sslscan whatweb perl openssl dnsutils \
    libcairo2 libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf-2.0-0 \
    libffi-dev shared-mime-info fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/sullo/nikto.git /opt/nikto \
    && chmod +x /opt/nikto/program/nikto.pl \
    && ln -s /opt/nikto/program/nikto.pl /usr/local/bin/nikto

RUN git clone --depth 1 https://github.com/testssl/testssl.sh.git /opt/testssl.sh \
    && ln -s /opt/testssl.sh/testssl.sh /usr/local/bin/testssl.sh \
    && ln -s /opt/testssl.sh/testssl.sh /usr/local/bin/testssl

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN python -m venv /opt/wapiti \
    && /opt/wapiti/bin/pip install --no-cache-dir wapiti3==3.2.4 \
    && ln -s /opt/wapiti/bin/wapiti /usr/local/bin/wapiti

RUN python -m venv /opt/security-tools \
    && /opt/security-tools/bin/pip install --no-cache-dir bandit pip-audit semgrep \
    && ln -s /opt/security-tools/bin/bandit  /usr/local/bin/bandit \
    && ln -s /opt/security-tools/bin/pip-audit /usr/local/bin/pip-audit \
    && ln -s /opt/security-tools/bin/semgrep /usr/local/bin/semgrep

RUN nuclei -update-templates -silent || true

RUN mkdir -p /app/results

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
