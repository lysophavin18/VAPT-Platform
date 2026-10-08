FROM alpine:3.22 AS depx

# renovate: datasource=github-releases depName=projectdiscovery/depx
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

# Scanner versions are pinned so upgrades arrive as reviewed Renovate PRs (see /renovate.json).
# renovate: datasource=go depName=github.com/projectdiscovery/nuclei/v3
ARG NUCLEI_VERSION=v3.11.1
# renovate: datasource=go depName=github.com/projectdiscovery/subfinder/v2
ARG SUBFINDER_VERSION=v2.16.0
# renovate: datasource=go depName=github.com/projectdiscovery/httpx
ARG HTTPX_VERSION=v1.12.0
# renovate: datasource=go depName=github.com/projectdiscovery/dnsx
ARG DNSX_VERSION=v1.3.1
# renovate: datasource=go depName=github.com/projectdiscovery/katana
ARG KATANA_VERSION=v1.8.0
# renovate: datasource=go depName=github.com/ffuf/ffuf/v2
ARG FFUF_VERSION=v2.3.0
# renovate: datasource=go depName=github.com/OJ/gobuster/v3
ARG GOBUSTER_VERSION=v3.8.2
# renovate: datasource=go depName=github.com/hahwul/dalfox/v2
ARG DALFOX_VERSION=v2.13.0
# renovate: datasource=go depName=github.com/projectdiscovery/naabu/v2
ARG NAABU_VERSION=v2.6.1

ENV GOBIN=/out CGO_ENABLED=0
RUN apk add --no-cache ca-certificates git \
    && go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@${NUCLEI_VERSION} \
    && go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@${SUBFINDER_VERSION} \
    && go install github.com/projectdiscovery/httpx/cmd/httpx@${HTTPX_VERSION} \
    && go install github.com/projectdiscovery/dnsx/cmd/dnsx@${DNSX_VERSION} \
    && go install github.com/projectdiscovery/katana/cmd/katana@${KATANA_VERSION} \
    && go install github.com/ffuf/ffuf/v2@${FFUF_VERSION} \
    && go install github.com/OJ/gobuster/v3@${GOBUSTER_VERSION} \
    && go install github.com/hahwul/dalfox/v2@${DALFOX_VERSION}

RUN apk add --no-cache libpcap-dev build-base \
    && CGO_ENABLED=1 go install -ldflags '-extldflags "-static"' github.com/projectdiscovery/naabu/v2/cmd/naabu@${NAABU_VERSION}

FROM alpine:3.22 AS trivy-dl
# renovate: datasource=github-releases depName=aquasecurity/trivy
ARG TRIVY_VERSION=0.75.0
RUN apk add --no-cache curl tar \
    && curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
       | tar -xz -C /usr/local/bin trivy \
    && chmod +x /usr/local/bin/trivy

FROM alpine:3.22 AS grype-dl
# renovate: datasource=github-releases depName=anchore/grype
ARG GRYPE_VERSION=0.120.1
RUN apk add --no-cache curl tar \
    && curl -fsSL "https://github.com/anchore/grype/releases/download/v${GRYPE_VERSION}/grype_${GRYPE_VERSION}_linux_amd64.tar.gz" \
       | tar -xz -C /usr/local/bin grype \
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
    libxml-writer-perl bsdextrautils procps \
    libcairo2 libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf-2.0-0 \
    libffi-dev shared-mime-info fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# renovate: datasource=github-tags depName=sullo/nikto
ARG NIKTO_VERSION=2.6.1
RUN git clone --depth 1 --branch ${NIKTO_VERSION} https://github.com/sullo/nikto.git /opt/nikto \
    && chmod +x /opt/nikto/program/nikto.pl \
    && ln -s /opt/nikto/program/nikto.pl /usr/local/bin/nikto

# renovate: datasource=github-releases depName=testssl/testssl.sh
ARG TESTSSL_VERSION=v3.2.4
RUN git clone --depth 1 --branch ${TESTSSL_VERSION} https://github.com/testssl/testssl.sh.git /opt/testssl.sh \
    && ln -s /opt/testssl.sh/testssl.sh /usr/local/bin/testssl.sh \
    && ln -s /opt/testssl.sh/testssl.sh /usr/local/bin/testssl

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# renovate: datasource=pypi depName=wapiti3
ARG WAPITI_VERSION=3.2.4
RUN python -m venv /opt/wapiti \
    && /opt/wapiti/bin/pip install --no-cache-dir wapiti3==${WAPITI_VERSION} \
    && ln -s /opt/wapiti/bin/wapiti /usr/local/bin/wapiti

# renovate: datasource=pypi depName=bandit
ARG BANDIT_VERSION=1.9.4
# renovate: datasource=pypi depName=pip-audit
ARG PIP_AUDIT_VERSION=2.10.1
# renovate: datasource=pypi depName=semgrep
ARG SEMGREP_VERSION=1.180.0
RUN python -m venv /opt/security-tools \
    && /opt/security-tools/bin/pip install --no-cache-dir bandit==${BANDIT_VERSION} pip-audit==${PIP_AUDIT_VERSION} semgrep==${SEMGREP_VERSION} \
    && ln -s /opt/security-tools/bin/bandit  /usr/local/bin/bandit \
    && ln -s /opt/security-tools/bin/pip-audit /usr/local/bin/pip-audit \
    && ln -s /opt/security-tools/bin/semgrep /usr/local/bin/semgrep

RUN nuclei -update-templates -silent || true

RUN mkdir -p /app/results

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
