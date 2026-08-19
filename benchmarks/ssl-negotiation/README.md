# Direct SSL negotiation benchmark

[`run.mjs`](./run.mjs) measures what `ssl_negotiation = "direct"` saves against
the database in `MUTEX_DATABASE_URL`.

Direct negotiation removes the SSLRequest packet and the server's one-byte
reply, so the saving is one network round trip and nothing else. It needs
PostgreSQL 17 or newer.

## Prerequisites

- Node.js 24 or newer and this checkout's dependencies;
- a built checkout (`npm run build`), which is what the script imports; and
- `MUTEX_DATABASE_URL` available in the environment.

## Run it

From the repository root:

```shell
npm ci
npm run build

MUTEX_BENCH_RUNS=20 node benchmarks/ssl-negotiation/run.mjs
```

Each style is timed the given number of times, interleaved, after one warm-up
connection of each. Interleaving matters: latency to a hosted database drifts
over minutes, and running twenty of one and then twenty of the other charges
that drift to whichever went second. A serverless database resuming its compute
lands entirely on the first connection, which is what the warm-up absorbs.

The script measures connections, not commands: it builds its configuration with
`resolveConnection` from the built tree, so it is timing what mutex itself
would open.

## Reading the result

The saving is one round trip, so it is worth whatever a round trip costs on
that link: a millisecond or two through a local container, and tens of
milliseconds to a hosted database. Measure the link the CLI actually uses -
a local run tells you the option works, not what it is worth.

One measured run against a hosted PostgreSQL 17 about 25 ms away:

```
negotiated  median 179.8 ms  (min 170.9, max 185.1)
direct      median 153.3 ms  (min 143.7, max 170.0)

Saving: 26.5 ms per connection (15%)
```

A direct-profile command opens one connection, so it saves that per command.

A server profile saves it more often than "once at startup" would suggest. The
pool is built with node-postgres' defaults, where `min` is 0 and
`idleTimeoutMillis` is 10 seconds, so a connection that goes unused for ten
seconds is closed and the next lock opens a new one. A server answering
sporadic requests re-handshakes for most of them.

That also means the larger saving for a server is not handshaking at all: a
fresh connection to a hosted database measured about 180 ms, of which direct
negotiation removes 26.5 ms. Holding one open removes all of it.

## Checking the version requirement

Nothing reports that a server is too old for direct negotiation: it reads the
TLS handshake as a malformed startup packet and closes the connection. Two
containers are enough to see both sides of it:

```shell
cat > /tmp/pgssl.Dockerfile <<'EOF'
ARG PG=17
FROM postgres:${PG}-alpine
RUN apk add --no-cache openssl \
 && mkdir -p /certs \
 && openssl req -new -x509 -days 365 -nodes -text \
      -out /certs/server.crt -keyout /certs/server.key -subj "/CN=localhost" \
 && chmod 600 /certs/server.key \
 && chown postgres:postgres /certs/server.key /certs/server.crt
CMD ["postgres", "-c", "ssl=on", "-c", "ssl_cert_file=/certs/server.crt", "-c", "ssl_key_file=/certs/server.key"]
EOF

for version in 16 17; do
  docker build --build-arg PG=$version -t mutex-pgssl:$version -f /tmp/pgssl.Dockerfile /tmp
  docker run -d --name mutex-pg$version -p 554$version:5432 \
    -e POSTGRES_DB=mutex_test -e POSTGRES_USER=mutex -e POSTGRES_HOST_AUTH_METHOD=trust \
    mutex-pgssl:$version
done
```

The certificate is self-signed, so these need `sslmode=no-verify`:

```shell
MUTEX_DATABASE_URL="postgresql://mutex@localhost:55417/mutex_test?sslmode=no-verify" \
  node benchmarks/ssl-negotiation/run.mjs   # 17: runs

MUTEX_DATABASE_URL="postgresql://mutex@localhost:55416/mutex_test?sslmode=no-verify" \
  node benchmarks/ssl-negotiation/run.mjs   # 16: reports the failure and stops
```
