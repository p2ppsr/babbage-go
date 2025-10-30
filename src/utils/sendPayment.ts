import { MessageBoxClient } from '@bsv/message-box-client';
import {
  CreateActionArgs,
  CreateActionResult,
  P2PKH,
  PublicKey,
  Base64String,
  AtomicBEEF,
  WalletInterface,
  Random,
  Utils,
  Transaction,
} from '@bsv/sdk';

const STANDARD_PAYMENT_MESSAGEBOX = 'payment_inbox';
let mbc: MessageBoxClient

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
  args: CreateActionArgs,
  origin?: string
): Promise<CreateActionResult> {
  const derivationPrefix = Utils.toBase64(Random(16));
  const derivationSuffix = Utils.toBase64(Random(16));
  args.outputs ??= []
  
  // Developer
  let developerPublicKey: string | undefined;
  let developerLockingScript: string | undefined;
  if (recipients.developer != null && recipients.developer.identity.length === 66) {
    ({ publicKey: developerPublicKey } = await walletClient.getPublicKey(
      {
        protocolID: [2, '3241645161d8'],
        keyID: `${derivationPrefix} ${derivationSuffix}`,
        counterparty: recipients.developer.identity,
      },
      origin
    ));
    developerLockingScript = new P2PKH()
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
    outputDescription: 'Babbage Go',
  });

  const action = await walletClient.createAction(args);
  return new Promise(async r => {
    r(action);
    if (action.tx === undefined) return;
    const outs = Transaction.fromAtomicBEEF(action.tx).outputs

    // Send payment tokens
    if (!mbc) {
      mbc = new MessageBoxClient({
        host: 'https://messagebox.babbage.systems',
        walletClient,
        enableLogging: false,
      });
    }

    for (let oi = 0; oi < outs.length; oi++) {
      if (outs[oi].lockingScript.toHex() === developerLockingScript) {
        const paymentToken: PaymentToken = {
          customInstructions: {
            derivationPrefix,
            derivationSuffix,
          },
          transaction: action.tx,
          amount: outs[oi].satoshis as number,
          outputIndex: oi
        };
        mbc.sendMessage({
          recipient: recipients.developer!.identity,
          messageBox: STANDARD_PAYMENT_MESSAGEBOX,
          body: JSON.stringify(paymentToken)
        });
      } else if (outs[oi].lockingScript.toHex() === baseLockingScript) {
        const paymentToken: PaymentToken = {
          customInstructions: {
            derivationPrefix,
            derivationSuffix,
          },
          transaction: action.tx,
          amount: outs[oi].satoshis as number,
          outputIndex: oi
        };
        mbc.sendMessage({
          recipient: recipients.base.identity,
          messageBox: STANDARD_PAYMENT_MESSAGEBOX,
          body: JSON.stringify(paymentToken)
        });
      }
    }
  })
}
