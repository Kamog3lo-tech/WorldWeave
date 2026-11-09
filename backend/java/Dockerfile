FROM eclipse-temurin:25-jdk

WORKDIR /app

COPY src ./src

RUN mkdir -p out && javac -d out src/worldweave/*.java

EXPOSE 8080

CMD ["java", "-cp", "out", "worldweave.Main"]