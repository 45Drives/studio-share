# apps/api/Dockerfile

# ---- build stage ----
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Build a static binary (no CGO). If you need CGO later, remove CGO_ENABLED.
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./main.go

# ---- run stage ----
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/api /app/api
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/api"]
