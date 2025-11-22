// showFundingModal.ts
import { WalletInterface } from '@bsv/sdk';
import {
  FundingModalOptions,
  IN_BROWSER,
  overlayRoot,
  escapeHtml,
  renderCard,
  destroyOverlay
} from './index.js';
import { SatoshiShopClient, StartShoppingResult } from 'satoshi-shop-client';

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

    let needed = satoshisNeeded;
    let stripe: any;
    let elements: any;
    let limits: StartShoppingResult | null = null;
    let currentReference = '';

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

      setContent('<p>Processing previous purchases…</p>');

      let recovered = 0;
      for (const ref of limits.pendingTxs) {
        try {
          const result = await shopClient.completeBuy({ reference: ref });
          if (result.satoshis) {
            needed = Math.max(0, needed - result.satoshis);
            recovered += result.satoshis;
            setContent(content.innerHTML + `<p>Processed prior purchase of ${result.satoshis.toLocaleString()} satoshis.</p>`);
          } else {
            setContent(content.innerHTML + `<p>Prior purchase with reference ${ref} is still pending.</p>`);
          }
        } catch (e) {
          setContent(content.innerHTML + `<p>Prior purchase with reference ${ref} could not be processed.</p>`);
          console.warn('Failed to complete pending purchase', ref, e);
        }
      }

      needed -= recovered;
    };

    const startShopping = async () => {
      try {
        setContent('<p>Loading purchase options…</p>');
        limits = await shopClient.startShopping({});

        await processPendingTxs();

        if (needed <= 0) {
          setContent(`
            <p style="color:#4caf50">
              You now have enough satoshis to ${escapeHtml(actionDescription || 'complete this action')}.
            </p>`);
          await new Promise(res => setTimeout(res, 2000));
          destroyOverlay(root);
          resolve('retry');
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
        
        const countOfBuyOptions = renderAmountSelector();

        if (countOfBuyOptions < 1) {
          setContent(`
            <p style="color:#ff6b6b">
              You are unable to purchase more satoshis at this time.
              Please pursue other funding options for your wallet.
            </p>`);
          return;
        }

      } catch (e: any) {
        setContent(`<p style="color:#ff6b6b">Connection failed: ${escapeHtml(e.message)}</p>`);
      }
    };

    const renderAmountSelector = () : number => {
      if (!limits) return 0;
      const rate = limits.satoshisPerUSD;
      const suggestions = [
        { usd: 1, sats: Math.ceil(1 * rate) },
        { usd: 2, sats: Math.ceil(2 * rate) },
        { usd: 5, sats: Math.ceil(5 * rate) },
        { usd: 10, sats: Math.ceil(10 * rate) }
      ].filter(o => o.sats >= limits!.minimumSatoshis && o.sats <= limits!.maximumSatoshis);

      if (suggestions.length === 0) return 0;

      const optionalMsg = needed <= 0
        ? '<p style="color:#4caf50;font-weight:600;">You already have enough satoshis – buying more is optional.</p>'
        : `<p>You need <strong>${needed.toLocaleString()}</strong> more satoshis.</p>`;

      const validMinutes = Math.floor((limits!.quoteValidUntil!.getTime() - Date.now()) / 60000);
      setContent(`
        <div style="text-align:center;">
          ${optionalMsg}
          <p><strong>Choose an amount (rate of $1 for ${limits.satoshisPerUSD.toLocaleString()} valid for ${validMinutes} minutes):</strong></p>
          <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:24px 0;">
            ${suggestions.map(o => `
              <button class="amount-btn" data-sats="${o.sats}" data-usd="${o.usd}"
                style="padding:14px 20px;font-size:16px;border:2px solid #635BFF;background:transparent;color:#635BFF;border-radius:12px;cursor:pointer;min-width:100px;transition:all .2s;">
                $${o.usd}
              </button>
            `).join('')}
          </div>

          <div id="card-element" style="margin:30px auto;max-width:380px;display:none;">
            <div style="border:1px solid #ddd;padding:20px;border-radius:12px;background:#fafafa;">
              <div id="card-input"></div>
              <div id="payment-status" style="margin-top:16px;min-height:28px;font-size:15px;"></div>
            </div>
          </div>
        </div>
      `);

      document.querySelectorAll<HTMLButtonElement>('.amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const sats = Number(btn.dataset.sats);
          const usd = Number(btn.dataset.usd);

          // Hide card element immediately on amount selection
          content.querySelector<HTMLElement>('#card-element')!.style.display = 'none';

          initiatePurchase(sats, usd);
        });
      });

      return suggestions.length;
    };

    const initiatePurchase = async (sats: number, usd: number) => {
      const statusEl = content.querySelector('#payment-status')!;
      statusEl.textContent = 'Preparing payment…';

      try {
        const init = await shopClient.initiateBuy({
          numberOfSatoshis: sats,
          quoteId: limits!.quoteId!,
          customerAcceptsPaymentTerms: 'I Accept'
        });

        currentReference = init.reference;

        const cardEl = content.querySelector<HTMLElement>('#card-element')!;
        cardEl.style.display = 'block';
        statusEl.textContent = 'Enter card details below';

        const card = elements.create('card', {
          style: { base: { fontSize: '16px', lineHeight: '1.5' } }
        });
        card.mount('#card-input');

        const submitBtn = document.createElement('button');
        submitBtn.id = 'submit-payment';
        submitBtn.textContent = `Pay $${usd.toFixed(2)}`;
        submitBtn.disabled = true;
        submitBtn.style.cssText = 'margin-top:16px;padding:12px 20px;background:#635BFF;color:white;border:none;border-radius:8px;width:100%;font-size:16px;cursor:pointer;';
        content.querySelector('#card-input')!.after(submitBtn);

        card.on('change', (event: any) => {
          submitBtn.disabled = !event.complete;
        });

        submitBtn.onclick = async () => {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Processing…';
          statusEl.textContent = 'Confirming with your bank…';

          const { error, paymentIntent } = await stripe.confirmCardPayment(init.clientSecret, {
            payment_method: { card }
          });

          if (error) {
            statusEl.innerHTML = `<span style="color:#e74c3c;">${error.message}</span>`;
            submitBtn.disabled = false;
            submitBtn.textContent = `Pay $${usd.toFixed(2)}`;
            return;
          }

          if (paymentIntent?.status === 'succeeded') {
            statusEl.innerHTML = '<span style="color:#4caf50;">Payment successful! Delivering satoshis…</span>';
            await finalizePurchase(currentReference);
          }
        };
      } catch (e: any) {
        statusEl.innerHTML = `<span style="color:#e74c3c;">Error: ${escapeHtml(e.message)}</span>`;
      }
    };

    const finalizePurchase = async (reference: string) => {
      const statusEl = content.querySelector('#payment-status')!;

      const poll = async () => {
        try {
          const result = await shopClient.completeBuy({ reference });

          if (result.status === 'bitcoin-payment-acknowledged' && result.satoshis) {
            needed = Math.max(0, needed - result.satoshis);

            statusEl.innerHTML = `<p style="color:#4caf50;font-weight:600;">
              Success! +${result.satoshis.toLocaleString()} satoshis added
            </p>`;

            if (needed <= 0) {
              await new Promise(res => setTimeout(res, 2000));
              destroyOverlay(root);
              resolve('retry');
            } else {
              setContent(`
                <p style="color:#4caf50;font-weight:600;">
                  Success! ${result.satoshis.toLocaleString()} satoshis added
                </p>
                <p>You now need <strong>${needed.toLocaleString()}</strong> more satoshis.</p>
              `);
              renderAmountSelector();
            }
            return;
          }

          statusEl.textContent = 'Delivering satoshis…';
          setTimeout(poll, 2000);
        } catch (e: any) {
          statusEl.innerHTML = `<span style="color:#e74c3c;">Delivery failed: ${e.message}</span>`;
        }
      };

      poll();
    };

    // Only Cancel button — no Retry button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bgo-button secondary';
    cancelBtn.textContent = opts.cancelText;
    cancelBtn.onclick = () => {
      destroyOverlay(root);
      resolve('cancel');
    };

    const actions = root.querySelector('.bgo-actions')!;
    actions.appendChild(cancelBtn);

    root.addEventListener('click', (e) => {
      if (e.target === root) {
        destroyOverlay(root);
        resolve('cancel');
      }
    });

    loadStripe();
    startShopping();
  });
}