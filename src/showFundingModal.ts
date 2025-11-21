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

interface FundingResult {
  choice: 'cancel' | 'retry';
}

export async function showFundingModal(
  wallet: WalletInterface,
  werr: WERR_INSUFFICIENT_FUNDS,
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

    let stripe: any;
    let elements: any;
    let currentLimits: any;
    let currentReference = '';

    const loadStripe = () => {
      if ((window as any).Stripe) {
        stripe = (window as any).Stripe(STRIPE_PK);
        elements = stripe.elements();
        startShopping();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = () => {
        stripe = (window as any).Stripe(STRIPE_PK);
        elements = stripe.elements();
        startShopping();
      };
      document.head.appendChild(script);
    };

    const startShopping = async () => {
      try {
        content.innerHTML = '<p>Loading your purchase limits…</p>';
        const limits = currentLimits = await shopClient.startShopping({});
        if (werr.moreSatoshisNeeded > limits.maximumSatoshis) {
          content.innerHTML = `<p style="color:#ff6b6b">
            Unfortunately, your wallet's purchase limit of ${(limits.maximumSatoshis)} Satoshis is insufficient to cover the required amount of ${(werr.moreSatoshisNeeded)} Satoshis for this action.
            <br><br>
            Please pursue other options to top up your wallet.
          </p>`;
          return;
        }
        renderAmountSelector(limits);
      } catch (e: any) {
        content.innerHTML = `<p style="color:#ff6b6b">Failed to contact shop: ${escapeHtml(e.message)}</p>`;
      }
    };

    const renderAmountSelector = (limits: any) => {
      const minSats = limits.minimumSatoshis;
      const maxSats = limits.maximumSatoshis;
      const rate = limits.satoshisPerUSD;

      const suggestions = [
        { usd: 1, sats: Math.ceil(1 * rate) },
        { usd: 2, sats: Math.ceil(2 * rate) },
        { usd: 5, sats: Math.ceil(5 * rate) },
        { usd: 10, sats: Math.ceil(10 * rate) }
      ].filter(o => o.sats >= minSats && o.sats <= maxSats);

      content.innerHTML = `
        <div style="text-align:center; margin:24px 0;">
          <p><strong>Choose amount (valid until ${currentLimits.quoteValidUntil?.toLocaleString() || 'soon'}):</strong></p>
          <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin:16px 0;">
            ${suggestions.map(opt => `
              <button class="amount-btn" data-sats="${opt.sats}" data-usd="${opt.usd}"
                style="padding:12px 18px; font-size:16px; border:2px solid #635BFF; background:white; color:#635BFF; border-radius:8px; cursor:pointer; min-width:80px;">
                $${opt.usd}<br><small>${(opt.sats / 100000000).toFixed(4)} BSV</small>
              </button>
            `).join('')}
          </div>
          <div id="card-element" style="display:none; margin:24px 0;">
            <div style="border:1px solid #ddd; padding:12px; border-radius:8px; background:#f9f9f9;">
              <div id="card-input"></div>
              <button id="submit-payment" disabled style="margin-top:12px; padding:12px; background:#635BFF; color:white; border:none; border-radius:8px; width:100%;">Pay $${suggestions[0]?.usd || 10}</button>
            </div>
            <div id="payment-status" style="min-height:20px; text-align:center; color:#666;"></div>
          </div>
        </div>
      `;

      content.querySelectorAll<HTMLElement>('.amount-btn').forEach((btn: HTMLElement) => {
        btn.addEventListener('click', async () => {
          btn.setAttribute('disabled', 'true');
          const sats = Number(btn.dataset.sats);
          const usd = Number(btn.dataset.usd);
          await initiatePurchase(sats, usd);
        })
      });
    };

    const initiatePurchase = async (sats: number, usd: number) => {
      const status = content.querySelector('#payment-status')!;
      status.textContent = 'Initiating secure payment…';

      try {
        const init = await shopClient.initiateBuy({
          numberOfSatoshis: sats,
          quoteId: currentLimits.quoteId!,
          customerAcceptsPaymentTerms: 'I Accept' // TERMS OF SERVICE AGREEMENT ALREADY COVERS THIS.
        });

        content.querySelector<HTMLElement>('#card-element')!.style.display = 'block';

        // Mount Stripe Card Element
        const cardElement = elements.create('card', { style: { base: { fontSize: '16px' } } });
        cardElement.mount('#card-input');

        // Submit handler
        const submitBtn = content.querySelector('#submit-payment') as HTMLButtonElement;
        submitBtn.textContent = `Pay $${usd.toFixed(2)}`;
        submitBtn.disabled = false;

        submitBtn.addEventListener('click', async () => {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Processing…';
          status.textContent = 'Confirming payment…';

          const { error, paymentIntent } = await stripe.confirmCardPayment(init.clientSecret, {
            payment_method: {
              card: cardElement,
              billing_details: { name: `reference ${init.reference}` }
            }
          });

          if (error) {
            status.textContent = `Payment failed: ${error.message}`;
            submitBtn.disabled = false;
            submitBtn.textContent = `Pay $${usd.toFixed(2)}`;
            return;
          }

          if (paymentIntent?.status === 'succeeded') {
            await finalizePurchase(currentReference);
          }
        });
      } catch (e: any) {
        status.textContent = `Error: ${e.message || 'Payment failed'}`;
      }
    };

    const finalizePurchase = async (reference: string) => {
      const status = content.querySelector('#payment-status')!;
      status.textContent = 'Payment confirmed! Delivering satoshis…';

      try {
        const result = await shopClient.completeBuy({ reference });
        if (result.status === 'bitcoin-payment-acknowledged') {
          status.innerHTML = `<p style="color:green;">Success! ${result.satoshis?.toLocaleString()} satoshis added to your wallet.</p>`;
          setTimeout(() => {
            destroyOverlay(root);
            resolve('retry'); // Retry the original action
          }, 3000);
        } else {
          // Poll if not complete
          const poll = setInterval(async () => {
            const pollResult = await shopClient.completeBuy({ reference });
            if (pollResult.status === 'bitcoin-payment-acknowledged') {
              clearInterval(poll);
              status.innerHTML = `<p style="color:green;">Success! Satoshis delivered.</p>`;
              setTimeout(() => {
                destroyOverlay(root);
                resolve('retry');
              }, 2000);
            }
          }, 2000);
        }
      } catch (e: any) {
        status.textContent = `Delivery error: ${e.message}. Contact support.`;
      }
    };

    loadStripe();

    // Buttons
    const cancel = document.createElement('button');
    cancel.className = 'bgo-button secondary';
    cancel.textContent = opts.cancelText;
    cancel.onclick = () => {
      destroyOverlay(root);
      resolve('cancel');
    };

    const actions = root.querySelector('.bgo-actions')!;
    actions.appendChild(cancel);

    root.addEventListener('click', (e) => {
      if (e.target === root) {
        destroyOverlay(root);
        resolve('cancel');
      }
    });
  });
}