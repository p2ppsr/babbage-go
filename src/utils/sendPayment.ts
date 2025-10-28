import {
  CreateActionArgs,
  CreateActionOutput,
  CreateActionResult,
  createNonce,
  P2PKH,
  PublicKey,
  WalletInterface,
} from "@bsv/sdk";

export async function sendPayment(
  walletClient: WalletInterface,
  recipients: {
    developer?: {
      amount: number;
      identity: string;
    };
    base: {
      amount: number;
      identity: string;
    };
  },
  args?: CreateActionArgs,
  origin?: string
): Promise<CreateActionResult> {
  const derivationPrefix = await createNonce(walletClient);
  const derivationSuffix = await createNonce(walletClient);

  if (args === undefined) throw new Error("No action arguments provided");

  if (args.outputs === undefined || args.outputs?.length === 0) {
    const action = await walletClient.createAction(args);
    return action;
  }

  // Developer
  let developerPublicKey: string | undefined = undefined;
  if (recipients.developer) {
    ({ publicKey: developerPublicKey } = await walletClient.getPublicKey(
      {
        protocolID: [2, "3241645161d8"],
        keyID: `${derivationPrefix} ${derivationSuffix}`,
        counterparty: recipients.developer.identity,
      },
      origin
    ));

    if (developerPublicKey == null || developerPublicKey.trim() === "")
      throw new Error("Failed to derive developer’s public key");
    const developerLockingScript = new P2PKH()
      .lock(PublicKey.fromString(developerPublicKey).toAddress())
      .toHex();

    args.outputs.push({
      satoshis: recipients.developer.amount,
      lockingScript: developerLockingScript,
      customInstructions: JSON.stringify({
        derivationPrefix,
        derivationSuffix,
        payee: recipients.developer,
      }),
      outputDescription: "Fee to developer",
    });
  }

  // Base
  const { publicKey: basePublicKey } = await walletClient.getPublicKey(
    {
      protocolID: [2, "3241645161d8"],
      keyID: `${derivationPrefix} ${derivationSuffix}`,
      counterparty: recipients.base.identity,
    },
    origin
  );
  if (basePublicKey == null || basePublicKey.trim() === "")
    throw new Error("Failed to derive base’s public key");
  const baseLockingScript = new P2PKH()
    .lock(PublicKey.fromString(basePublicKey).toAddress())
    .toHex();

  args.outputs.push({
    satoshis: recipients.base.amount,
    lockingScript: baseLockingScript,
    customInstructions: JSON.stringify({
      derivationPrefix,
      derivationSuffix,
      payee: recipients.base,
    }),
    outputDescription: "Transaction Fee",
  });

  const action = await walletClient.createAction(args);

  return action;
}
