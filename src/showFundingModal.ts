// showFundingModal.ts
import { WalletInterface, WERR_INSUFFICIENT_FUNDS } from '@bsv/sdk';
import {
  FundingModalOptions,
  IN_BROWSER,
  overlayRoot,
  escapeHtml,
  renderCard,
  destroyOverlay
} from './index.js';
import { SatoshiShopClient } from 'satoshi-shop-client';

const STRIPE_PK = 'pk_live_51KT9tpEUx5UhTr4kDuPQBpP5Sy8G5Xd4rsqWTQLVsXAeQGGrKhYZt8JgGCGSgi1NHnOWbxJNfCoMVh3a8F9iCYXf00U0lbWdDC';
const SHOP_URL = 'https://satoshi-shop.babbage.systems';

export async function showFundingModal(
  wallet: WalletInterface,
  satoshisNeeded: number,
  opts: Required<FundingModalOptions>,
  actionDescription?: string,
  mount?: HTMLElement | null,
): Promise<'cancel' | 'retry'> {
  if (!IN_BROWSER) return 'cancel';

  const shopClient = new SatoshiShopClient(wallet, SHOP_URL);

  return new Promise<'cancel' | 'retry'>((resolve) => {
    const root = overlayRoot(mount);
    const desc = actionDescription
      ? `<p class="bgo-small">Action: <strong>${escapeHtml(actionDescription)}</strong></p>`
      : '';

    const { body } = renderCard(
      root,
      opts.title,
      `<p>${opts.introText}</p>${desc}<div id="funding-content"></div>`,
      []
    );

    const content = body.querySelector('#funding-content')! as HTMLElement;

    // mutable state
    let stripe: any;
    let elements: any;
    let limits: any = null;
    let needed = satoshisNeeded;          // will be reduced when pending txs are processed
    let pendingProcessed = 0;
    let retryBtn: HTMLButtonElement;

    const setContent = (html: string) => { content.innerHTML = html; };

    const loadStripe = () => {
      if ((window as any).Stripe) {
        stripe = (window as any).Stripe(STRIPE_PK);
        elements = stripe.elements();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = () => {
        stripe = (window as any).Stripe(STRIPE_PK);
        elements = stripe.elements();
      };
      document.head.appendChild(script);
    };

    const processPendingTxs = async () => {
      if (!limits?.pendingTxs?.length) return;

      setContent('<p>Processing pending purchases…</p>');
      for (const reference of limits.pendingTxs) {
        try {
          const result = await shopClient.completeBuy({ reference });
          if (result.satoshis) {
            needed = Math.max(0, needed - result.satoshis);
            pendingProcessed += result.satoshis;
            setContent(content.innerHTML + `<p>Processed prior purchase of ${result.satoshis.toLocaleString()} satoshis.</p>`);
          } else {
            setContent(content.innerHTML + `<p>Prior purchase with reference ${reference} is still pending.</p>`);
          }
        } catch (e) {
          setContent(content.innerHTML + `<p>Prior purchase with reference ${reference} could not be processed.</p>`);
          console.warn(`Failed to process pending purchase reference ${reference}`, e);
        }
      }
    };

    const startShopping = async () => {
      try {
        setContent('<p>Loading purchase limits…</p>');
        limits = await shopClient.startShopping({});

        await processPendingTxs();

        if (needed <= 0) {
          setContent(`
            <p style="color:#4caf50">
              You now have enough satoshis to ${escapeHtml(actionDescription || 'complete this action')}.
            </p>`);
          retryBtn.disabled = false;
        }
        if (needed > limits.maximumSatoshis) {
          setContent(`
            <p style="color:#ff6b6b">
              Your current limit of ${limits.maximumSatoshis.toLocaleString()} satoshis prevents you from being able to retry this action.
              Please pursue other funding options for your wallet.
            </p><p>
              An additional ${needed.toLocaleString()} satoshis are required.
            </p>`);
        }
        if (limits.maximumSatoshis === 0) {
          setContent(`
            <p style="color:#ff6b6b">
              You are unable to purchase more satoshis at this time.
              Please pursue other funding options for your wallet.
            </p>`);
          return;
        }

        renderAmountSelector();
      } catch (e: any) {
        setContent(`<p style="color:#ff6b6b">Failed to contact shop: ${escapeHtml(e.message)}</p>`);
      }
    };

    const renderAmountSelector = () => {
      const rate = limits.satoshisPerUSD;
      const suggestions = [
        { usd: 1, sats: Math.ceil(1 * rate) },
        { usd: 2, sats: Math.ceil(2 * rate) },
        { usd: 5, sats: Math.ceil(5 * rate) },
        { usd: 10, sats: Math.ceil(10 * rate) }
      ].filter(o => o.sats >= limits.minimumSatoshis && o.sats <= limits.maximumSatoshis)
       .filter(o => needed <= 0 || o.sats >= needed);   // hide amounts that are useless when already funded

      const optionalMsg = needed <= 0
        ? '<p style="color:#4caf50;margin:12px 0;">You already have enough satoshis – buying more is optional.</p>'
        : `<p>You need <strong>${needed.toLocaleString()}</strong> more satoshis.</p>`;

      const validMinutes = Math.floor((new Date(limits.quoteValidUntil).getTime() - Date.now()) / 60000);
      setContent(`
        <div style="text-align:center;">
          ${optionalMsg}
          <p><strong>Choose an amount (rate of $1 for ${limits.satoshisPerUSD.toLocaleString()} valid for ${validMinutes} minutes):</strong></p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:20px 0;">
            ${suggestions.map(o => `
              <button class="amount-btn" data-sats="${o.sats}" data-usd="${o.usd}"
                style="padding:12px 20px;font-size:16px;border:2px solid #635BFF;background:#fff;color:#635BFF;border-radius:8px;cursor:pointer;min-width:90px;">
                $${o.usd}
              </button>
            `).join('')}
          </div>

          <div id="card-element" style="display:none;margin:24px 0;">
            <div style="border:1px solid #ddd;padding:16px;border-radius:8px;background:#f9f9f9;">
              <div id="card-input"></div>
              <button id="submit-payment" disabled style="margin-top:16px;padding:12px;background:#635BFF;color:white;border:none;border-radius:8px;width:100%;font-size:16px;">
                Pay $<span id="pay-amount">?</span>
              </button>
            </div>
            <div id="payment-status" style="margin-top:12px;min-height:24px;"></div>
          </div>
        </div>
      `);

      document.querySelectorAll('.amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const sats = Number((btn as HTMLElement).dataset.sats);
          const usd = Number((btn as HTMLElement).dataset.usd);
          initiatePurchase(sats, usd);
        });
      });
    };

    let currentReference = '';   // set by initiateBuy → used by finalizePurchase

    const initiatePurchase = async (sats: number, usd: number) => {
      const statusEl = content.querySelector('#payment-status')!;
      statusEl.textContent = 'Preparing secure payment…';

      try {
        const init = await shopClient.initiateBuy({
          numberOfSatoshis: sats,
          quoteId: limits.quoteId!,
          customerAcceptsPaymentTerms: 'I Accept'
        });

        currentReference = init.reference;   // ← crucial

        // show card element
        content.querySelector<HTMLElement>('#card-element')!.style.display = 'block';
        const payBtn = content.querySelector<HTMLButtonElement>('#submit-payment')!;
        payBtn.querySelector('#pay-amount')!.textContent = usd.toFixed(2);
        payBtn.disabled = false;

        const card = elements.create('card', { style: { base: { fontSize: '16px' } } });
        card.mount('#card-input');

        payBtn.onclick = async () => {
          payBtn.disabled = true;
          payBtn.textContent = 'Processing…';
          statusEl.textContent = 'Confirming payment with Stripe…';

          const { error, paymentIntent } = await stripe.confirmCardPayment(init.clientSecret, {
            payment_method: { card }
          });

          if (error) {
            statusEl.textContent = `Payment failed: ${error.message}`;
            payBtn.disabled = false;
            payBtn.textContent = `Pay $${usd.toFixed(2)}`;
            return;
          }

          if (paymentIntent?.status === 'succeeded') {
            await finalizePurchase(currentReference);
          }
        };
      } catch (e: any) {
        statusEl.textContent = `Error: ${e.message || 'Initiation failed'}`;
      }
    };

    const finalizePurchase = async (reference: string) => {
      const statusEl = content.querySelector('#payment-status')!;

      const poll = async () => {
        try {
          const result = await shopClient.completeBuy({ reference });
          if (result.status === 'bitcoin-payment-acknowledged') {
            needed = Math.max(0, needed - (result.satoshis ?? 0));
            statusEl.innerHTML = `<p style="color:green;">
              Success! ${result.satoshis?.toLocaleString() ?? 'Some'} satoshis added.
            </p>`;

            if (needed <= 0) {
              retryBtn.disabled = false;
            }

            setTimeout(() => {
              destroyOverlay(root);
              resolve('retry');
            }, 2500);
            return;
          }

          // still processing → poll again
          statusEl.textContent = 'Delivering satoshis…';
          setTimeout(poll, 2000);
        } catch (e: any) {
          statusEl.textContent = `Delivery error: ${e.message}`;
        }
      };

      statusEl.textContent = 'Payment confirmed – finalising…';
      poll();
    };

    // ------------------------------------------------------------------ UI buttons
    const actions = root.querySelector('.bgo-actions')!;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bgo-button secondary';
    cancelBtn.textContent = opts.cancelText;
    cancelBtn.onclick = () => {
      destroyOverlay(root);
      resolve('cancel');
    };

    actions.appendChild(cancelBtn);

    retryBtn = document.createElement('button');
    retryBtn.className = 'bgo-button secondary';
    retryBtn.textContent = opts.retryText;
    retryBtn.disabled = true;
    retryBtn.onclick = () => {
      destroyOverlay(root);
      resolve('retry');
    };

    actions.appendChild(cancelBtn);

    root.addEventListener('click', (e) => {
      if (e.target === root) {
        destroyOverlay(root);
        resolve('cancel');
      }
    });

    // ------------------------------------------------------------------ start
    loadStripe();
    startShopping();
  });
}