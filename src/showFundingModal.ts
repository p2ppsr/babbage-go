import { type WalletInterface } from '@bsv/sdk';
import {
  FundingModalOptions,
  IN_BROWSER,
  overlayRoot,
  escapeHtml,
  renderCard,
  destroyOverlay
} from './index.js';
import { SatoshiShopClient } from 'satoshi-shop-client';
import { SatoshiShopper } from 'satoshi-shopper';

const stripePublicKey = 'pk_live_51KT9tpEUx5UhTr4kDuPQBpP5Sy8G5Xd4rsqWTQLVsXAeQGGrKhYZt8JgGCGSgi1NHnOWbxJNfCoMVh3a8F9iCYXf00U0lbWdDC'
const shopUrl = 'https://satoshi-shop.babbage.systems'

export async function createShopClient(wallet: WalletInterface): Promise<SatoshiShopClient> {

  const gnr = await wallet.getNetwork({})
  if (gnr.network !== 'mainnet') {
    throw new Error('Satoshis can be purchased only for mainnet wallet.');
  }

  const shop = new SatoshiShopClient(wallet, shopUrl);
  return shop;
}

let reactRoot: any = null;

export async function showFundingModal(
  wallet: WalletInterface,
  opts: Required<FundingModalOptions>,
  actionDescription?: string,
  mount?: HTMLElement | null,
): Promise<'cancel' | 'retry'> {
  if (!IN_BROWSER) return await Promise.resolve('cancel');

  const shopClient = await createShopClient(wallet);

  return await new Promise((resolve) => {

    const root = overlayRoot(mount);

    // Build static parts of the body (non-React)
    const desc = actionDescription
      ? `<p class="bgo-small">Action: <strong>${escapeHtml(actionDescription)}</strong></p>`
      : '';

    const introHtml = `<p>${opts.introText}</p>${desc}`;

    // Render the card with a placeholder for the React container
    const { body } = renderCard(
      root,
      opts.title,
      introHtml,  // Static intro + desc
      []  // Buttons added dynamically below
    );

    const shopDiv = document.createElement('div');
    shopDiv.id = 'bgo-shopper-container';
    shopDiv.style.marginTop = '24px';
    shopDiv.style.padding = '0 8x';
    body.appendChild(shopDiv);

    // Dynamically load React + ReactDOM only when needed
    const mountReactShopper = async () => {
      if (reactRoot) return;

      const React = await import('react');
      const { createRoot } = await import('react-dom/client');

      // Build the SatoshiShopper component using createElement
      const shopperElement = React.createElement(SatoshiShopper, {
        shopClient,
        stripePublicKey: stripePublicKey,
        minimumSatoshis: 0,
        logoUrl: '',
        onPurchaseSuccess: (result: any) => {
          console.log('Purchase successful:', result);
          //switchToRetryState();
        },
        onPurchaseError: (error: any) => {
          console.error('Purchase error:', error);
        },
        onStripeError: (error: any) => {
          console.error('Stripe error:', error);
        },
      });

      reactRoot = createRoot(shopDiv);
      reactRoot.render(shopperElement);
    };

    mountReactShopper().catch(console.error);

    // === Buttons ===
    const buy = document.createElement('a');
    buy.className = 'bgo-link';
    buy.href = opts.buySatsUrl;
    buy.target = '_blank';
    buy.rel = 'noopener noreferrer';
    buy.textContent = opts.buySatsText;

    const cancel = document.createElement('button');
    cancel.className = 'bgo-button secondary';
    cancel.type = 'button';
    cancel.textContent = opts.cancelText;

    const actions = root.querySelector('.bgo-actions')!;
    actions.append(buy, cancel);

    let inRetry = false;

    const cleanup = () => {
      if (reactRoot) {
        reactRoot.unmount();
        reactRoot = null;
      }
      destroyOverlay(root);
    };

    const switchToRetryState = () => {
      inRetry = true;
      buy.textContent = opts.retryText;
      buy.classList.remove('bgo-link');
      buy.classList.add('bgo-button');
      buy.removeAttribute('href');
      buy.removeAttribute('target');
      buy.removeAttribute('rel');

      // Replace body content but keep shopper
      body.innerHTML = `<p>${opts.postPurchaseText}</p>${desc}`;
      body.appendChild(shopDiv);
      mountReactShopper(); // re-mount if needed
    };

    cancel.addEventListener('click', () => {
      cleanup();
      resolve('cancel');
    });

    buy.addEventListener('click', (e) => {
      if (!inRetry) {
        e.preventDefault();
        window.open(opts.buySatsUrl, '_blank', 'noopener,noreferrer');
        switchToRetryState();
      } else {
        cleanup();
        resolve('retry');
      }
    });

    // Close on backdrop click
    root.addEventListener('click', (e) => {
      if (e.target === root) {
        cleanup();
        resolve('cancel');
      }
    });
  });
}
