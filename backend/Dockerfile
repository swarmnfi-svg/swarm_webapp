FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
# Railway injects PORT — Spring Boot reads SERVER_PORT from application.yml
ENV SERVER_PORT=8080
ENV JAVA_TOOL_OPTIONS="-XX:+UseContainerSupport -Xms128m -Xmx384m"
EXPOSE 8080
# Railway injects PORT; SERVER_PORT optional override for other hosts
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=${PORT:-${SERVER_PORT:-8080}}"]
