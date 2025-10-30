import { MessageBoxClient } from '@bsv/message-box-client';
import {
  CreateActionArgs,
  CreateActionResult,
  createNonce,
  P2PKH,
  PublicKey,
  Base64String,
  AtomicBEEF,
  WalletInterface,
} from '@bsv/sdk';

const STANDARD_PAYMENT_MESSAGEBOX = 'payment_inbox';

export interface PaymentArgs {
  walletClient: WalletInterface;
  action: CreateActionResult;
  recipient: {
    amount: number;
    identity: string;
  };
  customInstructions: {
    derivationPrefix: Base64String;
    derivationSuffix: Base64String;
  };
  transaction: AtomicBEEF;
}

export interface PaymentToken {
  customInstructions: {
    derivationPrefix: Base64String;
    derivationSuffix: Base64String;
  };
  transaction: AtomicBEEF;
  amount: number;
  outputIndex?: number;
}

export async function createActionWithHydratedArgs(
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

  if (args === undefined) throw new Error('No action arguments provided');

  if (args.outputs === undefined || args.outputs?.length === 0) {
    const action = await walletClient.createAction(args);
    return action;
  }

  const newOutputs: number[] = [];
  
  // Developer
  let developerPublicKey: string | undefined;
  if (recipients.developer != null) {
    ({ publicKey: developerPublicKey } = await walletClient.getPublicKey(
      {
        protocolID: [2, '3241645161d8'],
        keyID: `${derivationPrefix} ${derivationSuffix}`,
        counterparty: recipients.developer.identity,
      },
      origin
    ));

    if (developerPublicKey == null || developerPublicKey.trim() === '') {
      throw new Error('Failed to derive developer’s public key');
    }
    const developerLockingScript = new P2PKH()
      .lock(PublicKey.fromString(developerPublicKey).toAddress())
      .toHex();

    newOutputs.push(args.outputs.length);

    args.outputs.push({
      satoshis: recipients.developer.amount,
      lockingScript: developerLockingScript,
      customInstructions: JSON.stringify({
        derivationPrefix,
        derivationSuffix,
        payee: recipients.developer,
      }),
      outputDescription: 'Fee to developer',
    });
  }

  // Base
  const { publicKey: basePublicKey } = await walletClient.getPublicKey(
    {
      protocolID: [2, '3241645161d8'],
      keyID: `${derivationPrefix} ${derivationSuffix}`,
      counterparty: recipients.base.identity,
    },
    origin
  );
  if (basePublicKey == null || basePublicKey.trim() === '') {
    throw new Error('Failed to derive base’s public key');
  }
  const baseLockingScript = new P2PKH()
    .lock(PublicKey.fromString(basePublicKey).toAddress())
    .toHex();

    newOutputs.push(args.outputs.length);

    args.outputs.push({
    satoshis: recipients.base.amount,
    lockingScript: baseLockingScript,
    customInstructions: JSON.stringify({
      derivationPrefix,
      derivationSuffix,
      payee: recipients.base,
    }),
    outputDescription: 'Transaction Fee',
  });

  const action = await walletClient.createAction(args);
  if (action.tx === undefined) return action;

  // Send payment tokens
  const messageBox = new MessageBoxClient({
    host: 'https://messagebox.babbage.systems',
    walletClient,
    enableLogging: false,
  });

  for (const outputIndex of newOutputs) {
    const output = args.outputs[outputIndex];
    if (output.customInstructions === undefined) continue;
    const customInstructions = JSON.parse(output.customInstructions);
    if (customInstructions.payee === undefined) continue;

    const paymentToken: PaymentToken = {
      customInstructions: {
        derivationPrefix,
        derivationSuffix,
      },
      transaction: action.tx,
      amount: output.satoshis,
      outputIndex,
    };

    await messageBox.sendMessage({
      recipient: customInstructions.payee.identity,
      messageBox: STANDARD_PAYMENT_MESSAGEBOX,
      body: JSON.stringify(paymentToken)
    });
  }

  return action;
}
