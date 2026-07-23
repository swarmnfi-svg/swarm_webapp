FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN apk add --no-cache maven && mvn clean package -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
# Railway injects PORT — Spring Boot reads SERVER_PORT from application.yml
ENV SERVER_PORT=8080
EXPOSE 8080
# Railway injects PORT; SERVER_PORT optional override for other hosts
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=${PORT:-${SERVER_PORT:-8080}}"]
