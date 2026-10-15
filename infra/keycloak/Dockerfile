# AstAx Keycloak image: official Keycloak plus the email-code extension and the
# AstAx theme. The extension is compiled here, so no local Java is needed.
FROM maven:3.10.0-eclipse-temurin-21 AS extension
WORKDIR /src
COPY extensions/email-code/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY extensions/email-code/src ./src
RUN mvn -q -B package

FROM quay.io/keycloak/keycloak:26.8.1
COPY --from=extension /src/target/astax-email-code-1.0.0.jar /opt/keycloak/providers/
COPY themes/astax /opt/keycloak/themes/astax
