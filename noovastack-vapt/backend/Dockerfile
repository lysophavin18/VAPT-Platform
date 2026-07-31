FROM python:3.12-slim

WORKDIR /app

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

COPY . .

RUN mkdir -p /app/results

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
