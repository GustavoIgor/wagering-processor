import { randomUUID } from 'node:crypto';

const ports = [3000, 3001];

async function request(
  port: number,
  path: string,
  body?: object,
  idempotencyKey?: string,
) {
  const response = await fetch(`http://localhost:${port}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

async function main() {
  const playerId = `multi-instance-${randomUUID()}`;
  const providerId = 'multi-instance-test';
  const roundId = randomUUID();

  // 1. Criar carteira
  const created = await request(3000, '/wallets', {
    playerId,
    currency: 'BRL',
  });

  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`Wallet creation failed: ${JSON.stringify(created)}`);
  }

  const wallet = created.data as { id: string };

  console.log('Wallet created:', wallet.id);

  // 2. Creditar R$ 100,00
  const credit = await request(
    3000,
    '/wagers',
    {
      providerId,
      playerId,
      walletId: wallet.id,
      roundId,
      operation: 'WIN',
      amount: '100.00',
      currency: 'BRL',
    },
    randomUUID(),
  );

  console.log('Initial credit:', credit);

  if (
    credit.status < 200 ||
    credit.status >= 300 ||
    (credit.data as { status?: string }).status !== 'PROCESSED'
  ) {
    throw new Error('Initial credit was not processed');
  }

  // 3. Enviar 10 apostas simultâneas pelas duas instâncias
  const bets = await Promise.all(
    Array.from({ length: 10 }, (_, index) => {
      const port = ports[index % ports.length];

      return request(
        port,
        '/wagers',
        {
          providerId,
          playerId,
          walletId: wallet.id,
          roundId,
          operation: 'BET',
          amount: '20.00',
          currency: 'BRL',
        },
        randomUUID(),
      );
    }),
  );

  // 4. Consultar saldo
  const finalWallet = await request(3001, `/wallets/${wallet.id}`);
  const balance = (finalWallet.data as { balance: string }).balance;

  const processed = bets.filter(
    (bet) => (bet.data as { status?: string }).status === 'PROCESSED',
  );

  const rejected = bets.filter(
    (bet) =>
      (bet.data as { failureCode?: string }).failureCode ===
      'INSUFFICIENT_FUNDS',
  );

  console.log('\n--- RESULTS ---');
  console.log('Total bets:', bets.length);
  console.log('Processed:', processed.length);
  console.log('Rejected for insufficient funds:', rejected.length);
  console.log('Final balance:', balance);
  console.log('HTTP errors:', bets.filter((bet) => bet.status >= 500).length);

  console.log('\nIndividual results:');
  bets.forEach((bet, index) => {
    console.log(index + 1, JSON.stringify(bet.data));
  });

  if (processed.length !== 5 || rejected.length !== 5 || balance !== '0.00') {
    throw new Error('Multi-instance concurrency test FAILED');
  }

  console.log('\nMULTI-INSTANCE TEST PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
