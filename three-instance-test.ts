const walletId = "d6f384b5-b356-4252-bdaf-42316ce77297";
const playerId = "test-player-001";

const requests = Array.from({ length: 10 }, (_, i) => {
  const port = [3000, 3001, 3002][i % 3];

  return {
    port,
    key: `three-instance-test-${Date.now()}-${i}`,
    body: {
      providerId: "provider-three-instance-test",
      playerId,
      walletId,
      roundId: "round-three-instance-test",
      operation: "BET",
      amount: "2.00",
      currency: "BRL"
    }
  };
});

const results = await Promise.all(
  requests.map(async ({ port, key, body }) => {
    try {
      const response = await fetch(`http://localhost:${port}/wagers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      return {
        port,
        httpStatus: response.status,
        status: data.status ?? "ERROR",
        failureCode: data.failureCode ?? null,
        id: data.id ?? null
      };
    } catch (error) {
      return {
        port,
        httpStatus: 0,
        status: "CONNECTION_ERROR",
        failureCode: String(error)
      };
    }
  })
);

console.table(results);

console.log("\nResumo:");
console.log("Processadas:", results.filter(r => r.status === "PROCESSED").length);
console.log("Rejeitadas:", results.filter(r => r.status === "REJECTED").length);
console.log("Erros HTTP:", results.filter(r => r.httpStatus >= 500 || r.httpStatus === 0).length);
