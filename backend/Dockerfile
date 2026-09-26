# ProvenPath backend image. Build context = repo root:  docker compose build backend
FROM gradle:8.10-jdk11 AS build
WORKDIR /src
COPY backend/ backend/
RUN cd backend && gradle :app:fatJar --no-daemon -q

# Runtime needs a full JDK (not a JRE): the Gosu 1.18 runtime uses the jdk.compiler module.
FROM eclipse-temurin:11-jdk
WORKDIR /app
COPY --from=build /src/backend/app/build/libs/provenpath-app.jar /app/provenpath-app.jar
COPY rules /app/rules
COPY fixtures /app/fixtures
COPY eval /app/eval
ENV PORT=8080 \
    PROVENPATH_RULES_DIR=/app/rules \
    PROVENPATH_FIXTURES_DIR=/app/fixtures \
    PROVENPATH_EVAL_DIR=/app/eval
EXPOSE 8080
CMD ["java", "-jar", "/app/provenpath-app.jar"]
