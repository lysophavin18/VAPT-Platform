# VAPT Platform - Nuclei Container
# Designed by VINNZz
FROM golang:1.21-alpine AS builder

# Install nuclei
RUN apk add --no-cache git && \
    go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest

FROM alpine:3.19

LABEL maintainer="VINNZz"
LABEL description="Nuclei - Template-based vulnerability scanner"
LABEL version="2.0"

# Install runtime dependencies
RUN apk add --no-cache ca-certificates

# Copy nuclei binary
COPY --from=builder /go/bin/nuclei /usr/local/bin/nuclei

# Create working directories
WORKDIR /opt/nuclei
RUN mkdir -p /results /templates

# Create non-root user
RUN adduser -D -h /home/nuclei nuclei
RUN chown -R nuclei:nuclei /opt/nuclei /results

# Switch to nuclei user and update templates
USER nuclei
RUN nuclei -update-templates 2>/dev/null || true

VOLUME ["/results", "/templates"]

ENTRYPOINT ["nuclei"]
CMD ["-h"]
