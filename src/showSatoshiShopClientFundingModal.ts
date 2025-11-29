// showSatoshiShopClientFundingModal.ts
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

export async function showFundingModal(
  wallet: WalletInterface,
  satoshisNeeded: number,
  opts: Required<FundingModalOptions>,
  actionDescription?: string,
  mount?: HTMLElement | null,
): Promise<'cancel' | 'retry'> {

  if (!IN_BROWSER) return 'cancel';

  const shopClient = new SatoshiShopClient(wallet, opts.satoshiShopUrl);

  return new Promise<'cancel' | 'retry'>((resolve) => {

    const ctx = setupContext()

    shop();

    function setupContext() : FundingModalContext {
      const root = overlayRoot(mount);
      const cancel = () => { destroyOverlay(root); resolve('cancel'); }
      const retry = () => { destroyOverlay(root); resolve('retry'); }

      const desc = actionDescription
        ? `<p class="bgo-small">Action: <strong>${escapeHtml(actionDescription)}</strong></p>`
        : '';

      const { body } = renderCard(
        root,
        opts.title,
        `${desc}<div id="funding-content"></div>`,
        []
      );

      const content = body.querySelector('#funding-content')! as HTMLDivElement;

      // Only Cancel button — no Retry button
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'bgo-button secondary';
      cancelBtn.textContent = opts.cancelText;
      cancelBtn.onclick = cancel;

      const actions = root.querySelector('.bgo-actions')!;
      actions.appendChild(cancelBtn);

      root.addEventListener('click', (e) => {
        if (e.target === root) {
          destroyOverlay(root);
          resolve('cancel');
        }
      });

      const ctx: FundingModalContext = {
        root,
        cancel,
        retry,
        delay: () => new Promise(res => setTimeout(res, 2000)),
        desc,
        body,
        content,
        cancelBtn,
        setContent: (html: string) => { content.innerHTML = html; },
        stripe: null,
        elements: null,
        ssr: null,
        currentReference: '',
        needed: satoshisNeeded,
        buyOptions: []
      };

      return ctx;
    }

    async function shop() : Promise<void> {
      const loadStripePromise = loadStripe();

      try {
        ctx.setContent('<p>Contacting the Satoshi Shop…</p>');

        ctx.ssr = await shopClient.startShopping({});

        await processPendingTxs();

        if (ctx.needed <= 0)
          return;

        await determineBuyOptions();

        if (ctx.buyOptions.length < 1)
          return;

        // We will be shopping, make sure stripe is loaded and valid.
        await loadStripePromise;
        
        renderAmountSelector();

      } catch (e: any) {
        ctx.setContent(`<p style="color:#ff6b6b">An error occurred: ${escapeHtml(e.message)}</p>`);
        await ctx.delay();
        ctx.cancel();
      }
    };

    async function loadStripe() : Promise<void> {
      const setStripe = () => {
        ctx.stripe = (window as any).Stripe(opts.satoshiShopPubKey);
        ctx.elements = ctx.stripe.elements();
      }

      if ((window as any).Stripe) {
        setStripe();
        return;
      }

      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onerror = () => { reject(new Error(`Failed to load ${script.src}`)); };
        script.onload = () => {
          setStripe();
          resolve();
        };
        document.head.appendChild(script);
      });
    };

    async function processPendingTxs() : Promise<void> {
      if (!ctx.ssr?.pendingTxs?.length) return;

      ctx.setContent('<p>Processing previous purchases…</p>');

      let recovered = 0;
      for (const ref of ctx.ssr.pendingTxs) {
        try {
          const result = await shopClient.completeBuy({ reference: ref });
          if (result.satoshis) {
            ctx.needed -= result.satoshis;
            recovered += result.satoshis;
            ctx.setContent(ctx.content.innerHTML + `<p>Processed prior purchase of ${result.satoshis.toLocaleString()} satoshis.</p>`);
          } else {
            ctx.setContent(ctx.content.innerHTML + `<p>Prior purchase with reference ${ref} is still pending.</p>`);
          }
        } catch (e) {
          ctx.setContent(ctx.content.innerHTML + `<p>Prior purchase with reference ${ref} could not be processed.</p>`);
          console.warn('Failed to complete pending purchase', ref, e);
        }
      }

      if (ctx.needed <= 0) {
        ctx.setContent(ctx.content.innerHTML +`<p style="color:#4caf50">The action will be retried in a moment. </p>`);
      }

      // If there were pending transactions, always pause briefly to let user read messages before replacing content.
      await ctx.delay();

      if (ctx.needed <= 0) {
        ctx.retry();
      }
    };

    async function determineBuyOptions() : Promise<void> {
      if (!ctx.ssr) return;

      const rate = ctx.ssr.satoshisPerUSD;

      const bos = [
        { usd: 1, sats: Math.round(1 * rate) },
        { usd: 2, sats: Math.round(2 * rate) },
        { usd: 5, sats: Math.round(5 * rate) },
        { usd: 10, sats: Math.round(10 * rate) }
      ].filter(o => o.sats >= ctx.ssr!.minimumSatoshis && o.sats <= ctx.ssr!.maximumSatoshis);

      // Even if user can't buy enough to cover needed, always show largest purchase option within their current limits,
      // but remove smaller options if they don't cover the needed amount.
      while (bos.length > 1 && bos[0].sats < ctx.needed)
        bos.shift();

      ctx.buyOptions = bos;

      if (ctx.buyOptions.length === 0) {
        ctx.setContent(`
          <p>You have reached your current purchase limits.</p>
          <p>Please try this action again tomorrow or seek other funding options.</p>
          `);
        await ctx.delay()
        ctx.cancel();
      }
    }

    async function renderAmountSelector() : Promise<void> {
      const validMinutes = Math.floor((ctx.ssr!.quoteValidUntil!.getTime() - Date.now()) / 60000);
      ctx.setContent(`
        <div style="text-align:center;">
          <!-- Required buying option choice: -->
          <div id="buy-options">
            <p>You need <strong>${ctx.needed.toLocaleString()}</strong> more satoshis.</p>
            <p><strong>Choose an amount (rate of $1 for ${Math.round(ctx.ssr!.satoshisPerUSD).toLocaleString()} valid for ${validMinutes} minutes):</strong></p>
            <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:24px 0;">
              ${ctx.buyOptions.map(o => `
                <button class="amount-btn" data-sats="${o.sats}" data-usd="${o.usd}"
                  style="padding:14px 20px;font-size:16px;border:2px solid #635BFF;background:transparent;color:#635BFF;border-radius:12px;cursor:pointer;min-width:100px;transition:all .2s;">
                  $${o.usd}
                </button>
              `).join('')}
            </div>
          </div>

          <div id="payment-info" style="display:none;">
            <p id="purchase-details">Buying xxx satoshis for $yyy:</p>
            <!-- Stripe card element (hidden until amount selected) -->
            <div id="card-element" style="margin:30px auto;max-width:380px;">
              <div style="border:1px solid #ddd;padding:20px;border-radius:12px;background:#fafafa;">
                <div id="card-input"></div>
                <div id="card-errors" role="alert" style="color:#e74c3c;margin-top:12px;min-height:24px;"></div>
              </div>
            </div>

            <!-- Status messages appear here, outside Stripe UI -->
            <div id="payment-status" style="margin-top:20px;min-height:32px;font-size:16px;"></div>
          </div>
        </div>
      `);

      ctx.content.querySelectorAll<HTMLButtonElement>('.amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const sats = Number(btn.dataset.sats);
          const usd = Number(btn.dataset.usd);

          clickBuyOption(sats, usd);
        });

      });
    }

    async function clickBuyOption(sats: number, usd: number): Promise<void> {
      const buyOptionsDiv = ctx.content.querySelector('#buy-options') as HTMLDivElement;
      if (buyOptionsDiv) {
        buyOptionsDiv.style.display = 'none';
      }

      const purchaseDetails = ctx.content.querySelector('#purchase-details') as HTMLElement;
      if (purchaseDetails) {
        purchaseDetails.textContent = `Buying ${sats.toLocaleString()} satoshis for $${usd.toFixed(0)}:`;
      }

      initiatePurchase(sats, usd);
    }

    async function initiatePurchase(sats: number, usd: number) : Promise<void> {
      const statusEl = ctx.content.querySelector('#payment-status')!;
      const cardErrorsEl = ctx.content.querySelector('#card-errors')!;
      statusEl.textContent = 'Preparing payment…';

      try {
        const init = await shopClient.initiateBuy({
          numberOfSatoshis: sats,
          quoteId: ctx.ssr!.quoteId!,
          customerAcceptsPaymentTerms: 'I Accept'
        });

        ctx.currentReference = init.reference;

        const cardEl = ctx.content.querySelector<HTMLElement>('#card-element')!;
        const inputContainer = ctx.content.querySelector('#card-input')!;
        inputContainer.innerHTML = '';

        cardEl.style.display = 'block';
        statusEl.textContent = 'Enter card details above.';

        const style = { base: { fontSize: '16px', lineHeight: '1.5' } }
        const elts: Record<string, { key: string; name: string; element: any; div: HTMLDivElement, complete: boolean, empty: boolean, error?: any }> = {};

        const updateButton = () => {
          const allComplete = Object.values(elts).every((s) => s.complete);
          submitBtn.disabled = !allComplete;
        };

        const handleStripeChange = (event: any, key: string) => {
          const elt = elts[key]!;
          elt.complete = !!event.complete
          elt.empty = !!event.empty
          elt.error = event.error;
          if (event.error) {
            cardErrorsEl.textContent = event.error.message;
          } else {
            cardErrorsEl.textContent = '';
          }
          updateButton();
        };

        for (const { key, name } of [
          { key: 'cardNumber', name: 'card number' },
          { key: 'cardExpiry', name: 'expiration date' },
          { key: 'cardCvc', name: 'security code' },
          { key: 'postalCode', name: 'postal code' },
        ]) {
          const element = ctx.elements.create(key, { style })
          const div = document.createElement('div');
          inputContainer.appendChild(div);
          element.mount(div);
          element.on('change', (event: any) => handleStripeChange(event, key));
          elts[key] = { key, name, element, div, complete: false, empty: true, error: undefined };
        }

        const submitBtn = document.createElement('button');
        submitBtn.id = 'submit-payment';
        submitBtn.textContent = `Pay $${usd.toFixed(0)}`;
        submitBtn.disabled = true;
        submitBtn.style.cssText = 'margin-top:16px;padding:12px 20px;background:#635BFF;color:white;border:none;border-radius:8px;width:100%;font-size:16px;cursor:pointer;';
        inputContainer.after(submitBtn);

        updateButton();

        submitBtn.onclick = async () => {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Processing…';
          statusEl.textContent = 'Confirming with your bank…';

          let hasError = false;
          for (const key of ['cardNumber', 'cardExpiry', 'cardCvc', 'postalCode']) {
            const elt = elts[key];
            if (elt.empty) {
              cardErrorsEl.textContent = `Your ${elt.name} is incomplete.`;
              hasError = true;
            } else if (elt.error) {
              cardErrorsEl.textContent = elt.error.message || `Your ${elt.name} is invalid.`;
              hasError = true;
            }
          }

          if (hasError) {
            cardEl.style.display = 'block';
            statusEl.textContent = '';
            submitBtn.disabled = false;
            submitBtn.textContent = `Pay $${usd.toFixed(0)}`;
            return;
          }

          cardEl.style.display = 'none';  // ← status now appears outside Stripe UI

          const { error, paymentIntent } = await ctx.stripe.confirmCardPayment(init.clientSecret, {
            payment_method: {
              card: elts['cardNumber'].element,
              billing_details: {
                address: { postal_code: elts['postalCode'].element.value }
              }
            }
          });

          if (error) {
            cardEl.style.display = 'block';
            cardErrorsEl.textContent = error.message || 'Payment failed.';
            statusEl.textContent = '';
            submitBtn.disabled = false;
            submitBtn.textContent = `Pay $${usd.toFixed(0)}`;
            return;
          }

          if (paymentIntent?.status === 'succeeded') {
            statusEl.innerHTML = '<span style="color:#4caf50;">Payment successful! Delivering satoshis…</span>';
            await finalizePurchase(ctx.currentReference);
          }
        };

        const paymentInfoDiv = ctx.content.querySelector('#payment-info') as HTMLDivElement;
        if (paymentInfoDiv) {
          paymentInfoDiv.style.display = 'block';
        }

      } catch (e: any) {
        statusEl.innerHTML = `<span style="color:#e74c3c;">Error: ${escapeHtml(e.message)}</span>`;
      }
    };

    async function finalizePurchase(reference: string) : Promise<void> {
      const statusEl = ctx.content.querySelector('#payment-status')!;

      const poll = async () => {
        try {
          const result = await shopClient.completeBuy({ reference });

          if (result.status === 'bitcoin-payment-acknowledged' && result.satoshis) {
            ctx.needed = Math.max(0, ctx.needed - result.satoshis);

            statusEl.innerHTML = `<p style="color:#4caf50;font-weight:600;">
              Success! +${result.satoshis.toLocaleString()} satoshis added
            </p>`;

            if (ctx.needed <= 0) {
              await new Promise(res => setTimeout(res, 2000));
              destroyOverlay(ctx.root);
              resolve('retry');
            } else {
              ctx.setContent(`
                <p style="color:#4caf50;font-weight:600;">
                  Success! ${result.satoshis.toLocaleString()} satoshis added
                </p>
                <p>You now need <strong>${ctx.needed.toLocaleString()}</strong> more satoshis.</p>
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

  });
}

interface FundingModalContext {
  /**
   * The modal root div element returned by overlayRoot
   */
  root: HTMLDivElement;
  /**
   * `actionDescription` rendered as HTML string, or empty string if none provided
   */
  desc: string
  /**
   * body div returned by renderCard
   */
  body: HTMLDivElement
  /**
   * `#funding-content` div within `body`. Use `setContent` to set its innerHTML.
   */
  content: HTMLDivElement;
  /**
   * stripe payment object valid after calling loadStripe and waiting on its promise.
   */
  stripe: any;
  /**
   * stripe elements object valid after calling loadStripe and waiting on its promise.
   */
  elements: any;
  /**
   * Set the innerHTML of the div with id "funding-content"
   * @param html
   */
  setContent: (html: string) => void;
  /**
   * Result of starting a shopping session with the Satoshi Shop
   */
  ssr: StartShoppingResult | null;
  /**
   * reference string for the current purchase being made, if there is one.
   */
  currentReference: string;
  /**
   * How many more satoshis are still needed to retry the action.
   *
   * Will be less than or equal to zero if retry is now possible.
   */
  needed: number

  /**
   * Cancel button element added to `.bgo-actions` element under `root`.
   * It's label is set to `opts.cancelText`.
   */
  cancelBtn: HTMLButtonElement;
  /**
   * Function to call to cancel the modal. Action will not be retried.
   */
  cancel: () => void
  /**
   * Function to call to dismiss the modal and retry the action.
   */
  retry: () => void
  /**
   * Function to delay for a short time for the user to read messages.
   * Must be awaited.
   */
  delay: () => Promise<void>
  /**
   * Buy options for the user to choose from. 
   */
  buyOptions: Array<{ usd: number; sats: number }>;
}