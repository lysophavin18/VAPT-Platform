# VAPT Platform - Katana Container
# Designed by VINNZz
FROM golang:1.21-alpine AS builder

# Install katana
RUN apk add --no-cache git && \
    go install github.com/projectdiscovery/katana/cmd/katana@latest

FROM alpine:3.19

LABEL maintainer="VINNZz"
LABEL description="Katana - Web crawler by ProjectDiscovery"
LABEL version="2.0"

# Install runtime dependencies
RUN apk add --no-cache ca-certificates chromium

# Copy katana binary
COPY --from=builder /go/bin/katana /usr/local/bin/katana

# Create working directories
WORKDIR /opt/katana
RUN mkdir -p /results

# Environment for headless browser
ENV CHROME_BIN=/usr/bin/chromium-browser

# Create non-root user
RUN adduser -D -h /home/katana katana
RUN chown -R katana:katana /opt/katana /results

USER katana

VOLUME ["/results"]

ENTRYPOINT ["katana"]
CMD ["-h"]
