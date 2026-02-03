FROM perl:5.36-slim

LABEL maintainer="VAPT Platform" \
      description="Nikto - Web server scanner"

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libnet-ssleay-perl \
    libio-socket-ssl-perl \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/sullo/nikto.git /opt/nikto

WORKDIR /opt/nikto/program

# Create output directory
RUN mkdir -p /output

ENTRYPOINT ["perl", "nikto.pl"]
CMD ["-h"]
