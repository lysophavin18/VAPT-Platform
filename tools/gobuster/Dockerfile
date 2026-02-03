FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git

RUN go install github.com/OJ/gobuster/v3@v3.6.0

FROM alpine:3.19

LABEL maintainer="VAPT Platform" \
      description="Gobuster - Directory/file, DNS, and vhost busting tool"

COPY --from=builder /go/bin/gobuster /usr/local/bin/gobuster

# Create output and wordlists directories
RUN mkdir -p /output /wordlists

WORKDIR /app

ENTRYPOINT ["gobuster"]
CMD ["--help"]
