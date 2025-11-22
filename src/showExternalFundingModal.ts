import { destroyOverlay, escapeHtml, FundingModalOptions, IN_BROWSER, overlayRoot, renderCard } from "./index.js";

export async function showExternalFundingModal(
  opts: Required<FundingModalOptions>,
  actionDescription?: string,
  mount?: HTMLElement | null
): Promise<'cancel' | 'retry'> {
  if (!IN_BROWSER) return await Promise.resolve('cancel');
  return await new Promise((resolve) => {
    const root = overlayRoot(mount);
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

    const desc = actionDescription
      ? `<p class="bgo-small">Action: <strong>${escapeHtml(
          actionDescription
        )}</strong></p>`
      : '';
    const { body } = renderCard(
      root,
      opts.title,
      `<p>${opts.introText}</p>${desc}`,
      [buy, cancel]
    );
    let inRetry = false;
    cancel.addEventListener('click', () => {
      destroyOverlay(root);
      resolve('cancel');
    });
    buy.addEventListener('click', (ev) => {
      if (!inRetry) {
        const url = opts.buySatsUrl;
        if (
          url &&
          typeof window === 'object' &&
          typeof window.open === 'function'
        ) {
          try {
            window.open(url, '_blank', 'noopener,noreferrer');
          } catch {}
        }
        ev.preventDefault();
        inRetry = true;
        buy.textContent = opts.retryText;
        buy.removeAttribute('href');
        buy.removeAttribute('target');
        buy.removeAttribute('rel');
        body.innerHTML = `<p>${opts.postPurchaseText}</p>${desc}`;
      } else {
        destroyOverlay(root);
        resolve('retry');
      }
    });
  });
}