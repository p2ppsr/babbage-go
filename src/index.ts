import {
  WalletClient,
  type WalletInterface,
  type GetPublicKeyArgs,
  type GetPublicKeyResult,
  type RevealCounterpartyKeyLinkageArgs,
  type RevealCounterpartyKeyLinkageResult,
  type RevealSpecificKeyLinkageArgs,
  type RevealSpecificKeyLinkageResult,
  type WalletEncryptArgs,
  type WalletEncryptResult,
  type WalletDecryptArgs,
  type WalletDecryptResult,
  type CreateHmacArgs,
  type CreateHmacResult,
  type VerifyHmacArgs,
  type VerifyHmacResult,
  type CreateSignatureArgs,
  type CreateSignatureResult,
  type VerifySignatureArgs,
  type VerifySignatureResult,
  type CreateActionArgs,
  type CreateActionResult,
  type SignActionArgs,
  type SignActionResult,
  type ListActionsArgs,
  type ListActionsResult,
  type ListCertificatesArgs,
  type ListCertificatesResult,
  type ListOutputsArgs,
  type ListOutputsResult,
  type AcquireCertificateArgs,
  type CertificateResult,
  type ProveCertificateArgs,
  type ProveCertificateResult,
  type RelinquishCertificateArgs,
  type RelinquishCertificateResult,
  type InternalizeActionArgs,
  type InternalizeActionResult,
  type RelinquishOutputArgs,
  type RelinquishOutputResult,
  type RevealCounterpartyKeyLinkageResult as RCKLResult,
  type KeyLinkageResult,
  type GetHeaderArgs,
  type GetHeaderResult,
  type GetHeightResult,
  type GetNetworkResult,
  type GetVersionResult,
  type OriginatorDomainNameStringUnder250Bytes as Origin,
  type AuthenticatedResult,
  Transaction,
  P2PKH,
  PublicKey,
  Base64String,
  AtomicBEEF,
  Random,
  Utils,
  WERR_INSUFFICIENT_FUNDS
} from '@bsv/sdk';
import { MessageBoxClient } from '@bsv/message-box-client';
import { showFundingModal as showSatoshiShopClientFundingModal } from './showSatoshiShopClientFundingModal.js';
import { showExternalFundingModal } from './showExternalFundingModal.js';
export { showFundingModal } from './showSatoshiShopClientFundingModal.js';

// Base transaction fee, unmodifiable by developers
const TRANSACTION_FEE = {
  amount: 103301,
  identity:
    '03ccb6ab654541f5ce16cadf0a094edd97085a9070086e4f7ae525111e13324beb',
};

// Error codes per SDK docs (Errors reference).
// We key off these to decide when to present modals.
const ERR = {
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  WALLET_NOT_CONNECTED: 'WALLET_NOT_CONNECTED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  WALLET_LOCKED: 'WALLET_LOCKED',
} as const;

const NO_WALLET_MESSAGE_PATTERN =
  /no wallet(?: available| detected| found)?(?: over any communication substrate)?\.?.*install.*wallet/i;

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  if (typeof error === 'string') return error;
  return String(error ?? '');
}

// Environment guard
export const IN_BROWSER =
  typeof window === 'object' &&
  typeof document === 'object' &&
  typeof document.createElement === 'function';

// ---------- UX / Modal plumbing ----------

export interface WalletUnavailableModalOptions {
  title?: string;
  message?: string;
  ctaText?: string;
  ctaHref?: string; // default https://GetMetanet.com
}

export interface FundingModalOptions {
  title?: string;
  introText?: string;
  postPurchaseText?: string;
  buySatsText?: string;
  retryText?: string;
  cancelText?: string;
  /**
   * Optional. If undefined, the default is external.
   * 
   * 'external' - open an external URL for buying sats (default).
   * 'satoshiShopClient' - use the SatoshiShopClient integration to buy sats without leaving funding modal.
   */
  source?: 'external' | 'satoshiShopClient'
  /**
   * Optional. If using 'external' source, the URL to open for buying sats.
   * Default is https://satoshis.babbage.systems
   */
  buySatsUrl?: string;
  /**
   * Optional. If using 'satoshiShopClient' source, the URL of the Satoshi Shop instance to use.
   * Default is https://satoshi-shop.babbage.systems
   */
  satoshiShopUrl?: string;
  /**
   * Optional. public key if required by source.
   * Default is 'pk_live_51KT9tpEUx5UhTr4kDuPQBpP5Sy8G5Xd4rsqWTQLVsXAeQGGrKhYZt8JgGCGSgi1NHnOWbxJNfCoMVh3a8F9iCYXf00U0lbWdDC'
   */
  satoshiShopPubKey?: string;
}

export interface MonetizationOptions {
  developerIdentity?: string | undefined;
  developerFeeSats?: number | undefined;
}

export type ButtonShape = 'soft' | 'pill' | 'sharp';

export type BabbageGoStylePreset =
  | 'auroraPulse'
  | 'emberLagoon'
  | 'midnightHalo';

export interface DesignTokens {
  overlayColor: string;
  overlayBlur: string;
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  cardRadius: string;
  fontFamily: string;
  textPrimary: string;
  textMuted: string;
  accentBackground: string;
  accentText: string;
  accentHoverBackground: string;
  accentHoverText: string;
  accentBorder: string;
  secondaryBackground: string;
  secondaryText: string;
  secondaryHoverBackground: string;
  secondaryBorder: string;
  focusRing: string;
  focusGlow: string;
  smallLabelColor: string;
  buttonShadow: string;
  buttonShape: ButtonShape;
}

export interface DesignOptions {
  preset?: BabbageGoStylePreset;
  tokens?: Partial<DesignTokens>;
  customCss?: string;
}

export interface BabbageGoOptions {
  showModal?: boolean;
  hangOnWalletErrors?: boolean;
  readOnlyFallbacks?: boolean; // return placeholder data for read-only calls instead of showing a modal
  mount?: HTMLElement | null;
  styles?: string;
  design?: DesignOptions;
  walletUnavailable?: WalletUnavailableModalOptions;
  funding?: FundingModalOptions;
  monetization?: MonetizationOptions;
}

interface ResolvedDesignOptions {
  preset: BabbageGoStylePreset;
  tokens: DesignTokens;
  customCss: string;
  cssText: string;
}

interface ResolvedOptions {
  showModal: boolean;
  hangOnWalletErrors: boolean;
  readOnlyFallbacks: boolean;
  mount: HTMLElement | null;
  styles: string;
  walletUnavailable: Required<WalletUnavailableModalOptions>;
  funding: Required<FundingModalOptions>;
  monetization: MonetizationOptions | undefined;
  design: ResolvedDesignOptions;
}

const DEFAULT_WALLET_UNAVAILABLE: Required<WalletUnavailableModalOptions> = {
  title: 'This action requires a BRC-100 wallet',
  message:
    'Connect a BRC-100 compatible wallet (Metanet). Install one, then return to retry.',
  ctaText: 'Get a Wallet',
  ctaHref: 'https://GetMetanet.com',
};

const DEFAULT_FUNDING: Required<FundingModalOptions> = {
  title: 'Not enough sats',
  introText: 'Top up your wallet, then click “Retry” to finish the action.',
  postPurchaseText:
    'If you’ve bought sats, click “Retry” to complete the action.',
  buySatsText: 'Buy Sats',
  retryText: 'Retry',
  cancelText: 'Cancel Action',
  source: 'satoshiShopClient',
  buySatsUrl: 'https://satoshis.babbage.systems',
  satoshiShopUrl: 'https://satoshi-shop.babbage.systems',
  satoshiShopPubKey: 'pk_live_51KT9tpEUx5UhTr4kDuPQBpP5Sy8G5Xd4rsqWTQLVsXAeQGGrKhYZt8JgGCGSgi1NHnOWbxJNfCoMVh3a8F9iCYXf00U0lbWdDC',
};

const BUTTON_RADIUS_BY_SHAPE: Record<ButtonShape, string> = {
  soft: '14px',
  pill: '999px',
  sharp: '6px',
};

const STYLE_TOKEN_PRESETS: Record<BabbageGoStylePreset, DesignTokens> = {
  auroraPulse: {
    overlayColor:
      'radial-gradient(80% 120% at 15% 15%, rgba(18,38,74,0.9), rgba(2,7,18,0.95))',
    overlayBlur: 'blur(22px)',
    cardBackground: 'rgba(2,7,18,0.92)',
    cardBorder: 'rgba(114,201,255,0.32)',
    cardShadow: '0 35px 90px rgba(2,6,24,0.85)',
    cardRadius: '26px',
    fontFamily:
      '"Space Grotesk", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    textPrimary: 'rgba(255,255,255,0.96)',
    textMuted: 'rgba(228,243,255,0.82)',
    accentBackground: 'linear-gradient(135deg, #6BE7FF, #6F7DFF)',
    accentText: '#040c1b',
    accentHoverBackground: '#f4fbff',
    accentHoverText: '#021735',
    accentBorder: 'rgba(255,255,255,0.25)',
    secondaryBackground: 'rgba(255,255,255,0.08)',
    secondaryText: 'rgba(255,255,255,0.9)',
    secondaryHoverBackground: 'rgba(255,255,255,0.16)',
    secondaryBorder: 'rgba(255,255,255,0.24)',
    focusRing: '0 0 0 2px rgba(107,231,255,0.85)',
    focusGlow: '0 0 18px rgba(107,231,255,0.45)',
    smallLabelColor: 'rgba(255,255,255,0.68)',
    buttonShadow: '0 15px 35px rgba(15,100,175,0.45)',
    buttonShape: 'pill',
  },
  emberLagoon: {
    overlayColor:
      'linear-gradient(130deg, rgba(35,6,0,0.85), rgba(67,4,21,0.92))',
    overlayBlur: 'blur(16px)',
    cardBackground: 'rgba(32,10,6,0.94)',
    cardBorder: 'rgba(255,157,91,0.32)',
    cardShadow: '0 28px 70px rgba(10,0,0,0.75)',
    cardRadius: '22px',
    fontFamily:
      '"Sora", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    textPrimary: 'rgba(255,238,229,0.98)',
    textMuted: 'rgba(255,220,202,0.78)',
    accentBackground: 'linear-gradient(120deg, #FFB45C, #FF4F4F)',
    accentText: '#2b0500',
    accentHoverBackground: '#fff4e9',
    accentHoverText: '#3e0500',
    accentBorder: 'rgba(255,184,135,0.5)',
    secondaryBackground: 'rgba(255,255,255,0.08)',
    secondaryText: 'rgba(255,223,214,0.88)',
    secondaryHoverBackground: 'rgba(255,255,255,0.15)',
    secondaryBorder: 'rgba(255,184,135,0.3)',
    focusRing: '0 0 0 2px rgba(255,162,102,0.8)',
    focusGlow: '0 0 14px rgba(255,120,82,0.45)',
    smallLabelColor: 'rgba(255,202,186,0.7)',
    buttonShadow: '0 12px 26px rgba(255,103,51,0.35)',
    buttonShape: 'soft',
  },
  midnightHalo: {
    overlayColor: 'rgba(6,7,11,0.78)',
    overlayBlur: 'blur(24px)',
    cardBackground: 'rgba(248,249,255,0.98)',
    cardBorder: 'rgba(25,28,45,0.08)',
    cardShadow: '0 30px 60px rgba(10,12,30,0.35)',
    cardRadius: '20px',
    fontFamily:
      '"General Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    textPrimary: '#0f1528',
    textMuted: 'rgba(12,17,32,0.72)',
    accentBackground: '#0D5EF4',
    accentText: '#FDFDFE',
    accentHoverBackground: '#09379A',
    accentHoverText: '#FBFBFF',
    accentBorder: '#0D5EF4',
    secondaryBackground: 'rgba(13,94,244,0.08)',
    secondaryText: '#0D5EF4',
    secondaryHoverBackground: 'rgba(13,94,244,0.16)',
    secondaryBorder: 'rgba(13,94,244,0.2)',
    focusRing: '0 0 0 2px rgba(13,94,244,0.5)',
    focusGlow: '0 10px 22px rgba(13,94,244,0.28)',
    smallLabelColor: 'rgba(14,19,32,0.6)',
    buttonShadow: '0 10px 20px rgba(13,94,244,0.3)',
    buttonShape: 'sharp',
  },
};

const DEFAULT_STYLE_PRESET: BabbageGoStylePreset = 'auroraPulse';

function buildDesignCss(tokens: DesignTokens, extra?: string): string {
  const buttonRadius =
    BUTTON_RADIUS_BY_SHAPE[tokens.buttonShape] ?? BUTTON_RADIUS_BY_SHAPE.soft;
  return `
.bgo-overlay {
  --bgo-font-family: ${tokens.fontFamily};
  --bgo-card-radius: ${tokens.cardRadius};
  --bgo-button-radius: ${buttonRadius};
  --bgo-overlay-bg: ${tokens.overlayColor};
  --bgo-overlay-blur: ${tokens.overlayBlur};
  --bgo-card-bg: ${tokens.cardBackground};
  --bgo-card-border: ${tokens.cardBorder};
  --bgo-card-shadow: ${tokens.cardShadow};
  --bgo-text-primary: ${tokens.textPrimary};
  --bgo-text-muted: ${tokens.textMuted};
  --bgo-accent-bg: ${tokens.accentBackground};
  --bgo-accent-text: ${tokens.accentText};
  --bgo-accent-hover-bg: ${tokens.accentHoverBackground};
  --bgo-accent-hover-text: ${tokens.accentHoverText};
  --bgo-accent-border: ${tokens.accentBorder};
  --bgo-secondary-bg: ${tokens.secondaryBackground};
  --bgo-secondary-text: ${tokens.secondaryText};
  --bgo-secondary-hover-bg: ${tokens.secondaryHoverBackground};
  --bgo-secondary-border: ${tokens.secondaryBorder};
  --bgo-focus-ring: ${tokens.focusRing};
  --bgo-focus-glow: ${tokens.focusGlow};
  --bgo-small-text: ${tokens.smallLabelColor};
  --bgo-button-shadow: ${tokens.buttonShadow};
}
.bgo-overlay {
  position: fixed;
  z-index: 2147483647;
  inset: 0;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bgo-overlay-bg);
  backdrop-filter: var(--bgo-overlay-blur);
  opacity: 0;
  transition: opacity .25s ease;
}
.bgo-overlay.bgo-open { opacity: 1; }
.bgo-card {
  width: min(92vw, 620px);
  max-height: 88vh;
  overflow: auto;
  background: var(--bgo-card-bg);
  color: var(--bgo-text-primary);
  border-radius: var(--bgo-card-radius);
  border: 1px solid var(--bgo-card-border);
  box-shadow: var(--bgo-card-shadow);
  padding: 28px 30px 24px;
  position: relative;
  font-family: var(--bgo-font-family, system-ui, -apple-system, sans-serif);
}
.bgo-close {
  position: absolute;
  top: 18px;
  right: 22px;
  background: transparent;
  border: 0;
  color: var(--bgo-text-muted);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  transition: color .2s ease;
}
.bgo-close:hover,
.bgo-close:focus-visible {
  color: var(--bgo-text-primary);
  outline: none;
}
.bgo-title {
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 700;
  color: var(--bgo-text-primary);
}
.bgo-body {
  font-size: 16px;
  line-height: 1.7;
  color: var(--bgo-text-muted);
}
.bgo-body p { margin: 0 0 10px; }
.bgo-actions {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.bgo-link,
.bgo-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 11px 18px;
  border-radius: var(--bgo-button-radius);
  font-weight: 700;
  text-decoration: none;
  border: 1px solid var(--bgo-accent-border);
  color: var(--bgo-accent-text);
  background: var(--bgo-accent-bg);
  cursor: pointer;
  transition: transform .15s ease, background .2s ease, color .2s ease;
  box-shadow: var(--bgo-button-shadow);
}
.bgo-link:hover,
.bgo-button:hover {
  transform: translateY(-1px);
  background: var(--bgo-accent-hover-bg);
  color: var(--bgo-accent-hover-text);
}
.bgo-link:focus-visible,
.bgo-button:focus-visible {
  outline: none;
  box-shadow: var(--bgo-focus-ring), var(--bgo-focus-glow);
}
.bgo-button.secondary {
  background: var(--bgo-secondary-bg);
  color: var(--bgo-secondary-text);
  border-color: var(--bgo-secondary-border);
  box-shadow: none;
}
.bgo-button.secondary:hover {
  background: var(--bgo-secondary-hover-bg);
  color: var(--bgo-secondary-text);
}
.bgo-small {
  margin-top: 12px;
  font-size: 13px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--bgo-small-text);
}
@media (max-width: 520px) {
  .bgo-card {
    padding: 22px 20px 20px;
    border-radius: calc(var(--bgo-card-radius) - 6px);
  }
  .bgo-actions {
    flex-direction: column;
  }
  .bgo-link,
  .bgo-button {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bgo-overlay,
  .bgo-link,
  .bgo-button {
    transition: none;
  }
}
${extra ? `/* Custom additions */\n${extra}` : ''}
  `.trim();
}

function resolveDesignOptions(
  design?: DesignOptions,
  legacyStyles?: string
): ResolvedDesignOptions {
  const preset = design?.preset ?? DEFAULT_STYLE_PRESET;
  const presetTokens = STYLE_TOKEN_PRESETS[preset];
  const mergedTokens: DesignTokens = {
    ...presetTokens,
    ...(design?.tokens ?? {}),
  };
  const customCss = [legacyStyles ?? '', design?.customCss ?? '']
    .filter(Boolean)
    .join('\n');
  return {
    preset,
    tokens: mergedTokens,
    customCss,
    cssText: buildDesignCss(mergedTokens, customCss),
  };
}

const DEFAULTS: ResolvedOptions = {
  showModal: true,
  hangOnWalletErrors: true,
  readOnlyFallbacks: true,
  mount: null,
  styles: '',
  walletUnavailable: DEFAULT_WALLET_UNAVAILABLE,
  funding: DEFAULT_FUNDING,
  monetization: undefined,
  design: resolveDesignOptions(),
};

const READ_ONLY_VERSION_FALLBACK = 'babbbage-go-1.0.0' as const;

function resolveWalletUnavailableOptions(
  overrides?: WalletUnavailableModalOptions
): Required<WalletUnavailableModalOptions> {
  return {
    title: overrides?.title ?? DEFAULT_WALLET_UNAVAILABLE.title,
    message: overrides?.message ?? DEFAULT_WALLET_UNAVAILABLE.message,
    ctaText: overrides?.ctaText ?? DEFAULT_WALLET_UNAVAILABLE.ctaText,
    ctaHref: overrides?.ctaHref ?? DEFAULT_WALLET_UNAVAILABLE.ctaHref,
  };
}

function resolveFundingOptions(
  overrides?: FundingModalOptions
): Required<FundingModalOptions> {
  return {
    title: overrides?.title ?? DEFAULT_FUNDING.title,
    introText: overrides?.introText ?? DEFAULT_FUNDING.introText,
    postPurchaseText:
      overrides?.postPurchaseText ?? DEFAULT_FUNDING.postPurchaseText,
    buySatsText: overrides?.buySatsText ?? DEFAULT_FUNDING.buySatsText,
    retryText: overrides?.retryText ?? DEFAULT_FUNDING.retryText,
    cancelText: overrides?.cancelText ?? DEFAULT_FUNDING.cancelText,
    source: overrides?.source ?? DEFAULT_FUNDING.source,
    satoshiShopUrl: overrides?.satoshiShopUrl ?? DEFAULT_FUNDING.satoshiShopUrl,
    satoshiShopPubKey: overrides?.satoshiShopPubKey ?? DEFAULT_FUNDING.satoshiShopPubKey,
    buySatsUrl: overrides?.buySatsUrl ?? DEFAULT_FUNDING.buySatsUrl,
  };
}

function resolveOptions(options?: BabbageGoOptions): ResolvedOptions {
  const styles = options?.styles ?? DEFAULTS.styles;
  return {
    showModal: options?.showModal ?? DEFAULTS.showModal,
    hangOnWalletErrors:
      options?.hangOnWalletErrors ?? DEFAULTS.hangOnWalletErrors,
    readOnlyFallbacks: options?.readOnlyFallbacks ?? DEFAULTS.readOnlyFallbacks,
    mount: options?.mount ?? DEFAULTS.mount,
    styles,
    walletUnavailable: resolveWalletUnavailableOptions(
      options?.walletUnavailable
    ),
    funding: resolveFundingOptions(options?.funding),
    monetization: options?.monetization ?? DEFAULTS.monetization,
    design: resolveDesignOptions(options?.design, styles),
  };
}

let installedCss: string | null = null;
let styleElement: HTMLStyleElement | null = null;
function ensureStyle(cssText: string) {
  if (!IN_BROWSER) return;
  if (installedCss === cssText && styleElement != null) return;
  if (styleElement == null) {
    styleElement = document.createElement('style');
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = cssText;
  installedCss = cssText;
}

export function overlayRoot(mount?: HTMLElement | null) {
  const root = document.createElement("div");
  root.className = "bgo-overlay";
  (mount || document.body).appendChild(root);
  requestAnimationFrame(() => root.classList.add("bgo-open"));
  return root;
}

export function destroyOverlay(root: HTMLElement) {
  root.classList.remove('bgo-open');
  setTimeout(() => root.remove(), 200);
}

export function renderCard(
  root: HTMLElement,
  title: string,
  bodyHTML: string,
  actions: HTMLElement[]
) {
  const card = document.createElement('div');
  card.className = 'bgo-card';
  const close = document.createElement('button');
  close.className = 'bgo-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  const h = document.createElement('h2');
  h.className = 'bgo-title';
  h.textContent = title;
  const b = document.createElement('div');
  b.className = 'bgo-body';
  b.innerHTML = bodyHTML;
  const acts = document.createElement('div');
  acts.className = 'bgo-actions';
  actions.forEach((a) => acts.appendChild(a));
  card.appendChild(close);
  card.appendChild(h);
  card.appendChild(b);
  card.appendChild(acts);
  root.appendChild(card);
  root.addEventListener('click', (ev) => {
    if (ev.target === root) destroyOverlay(root);
  });
  close.addEventListener('click', () => destroyOverlay(root));
  return { body: b };
}

function showWalletUnavailableModal(
  opts: Required<WalletUnavailableModalOptions>,
  mount?: HTMLElement | null
) {
  if (!IN_BROWSER) return;
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
  const root = overlayRoot(mount);
  const link = document.createElement('a');
  link.className = 'bgo-link';

  const mobileTitle = 'This action requires the Metanet Explorer app';
  const mobileMessage = 'To complete this action, open it on the Metanet Explorer app.';
  const mobileCtaText = 'Open Metanet Explorer';

  if (isAndroid) {
    const PLAY_STORE_BASE =
      'https://play.google.com/store/apps/details?id=app.metanet.explorer';
    const targetUrl = location.href;

    const targetParam = encodeURIComponent(targetUrl);
    const referrerPayload = encodeURIComponent(`url=${targetUrl}`);
    const playStoreFallback = `${PLAY_STORE_BASE}&referrer=${referrerPayload}`;
    const encodedFallback = encodeURIComponent(playStoreFallback);

    link.href =
      `intent://browser?url=${targetParam}` +
      `#Intent;scheme=metanet;package=app.metanet.explorer;` +
      `action=android.intent.action.VIEW;` +
      `S.browser_fallback_url=${encodedFallback};end;`;
  } else if (isIOS) {
    const targetUrl = location.href;
    const universalLinkBase = 'https://ios.getmetanet.com/open/';
    link.href =
      `${universalLinkBase}?url=${encodeURIComponent(targetUrl)}` +
      `&app=${encodeURIComponent(location.hostname)}`;
  } else {
    link.href = `${opts.ctaHref}?app=${encodeURIComponent(location.hostname)}`;
  }
  link.target = isIOS ? '_self' : '_blank';
  link.rel = 'noopener noreferrer';

  const title = isAndroid || isIOS ? mobileTitle : opts.title;
  const message = isAndroid || isIOS ? mobileMessage : opts.message;

  link.textContent = isAndroid || isIOS ? mobileCtaText : opts.ctaText;
  renderCard(root, title, `<p>${message}</p>`, [link]);
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function unauthenticatedResult(): AuthenticatedResult {
  return { authenticated: false } as unknown as AuthenticatedResult;
}

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

// ---------- Wrapper ----------

export default class BabbageGo implements WalletInterface {
  readonly base: WalletInterface;
  readonly options: ResolvedOptions;
  private pendingScripts: Record<string, {
    identity: string,
    derivationPrefix: string,
    derivationSuffix: string
  }> = {}

  constructor(wallet?: WalletInterface, options?: BabbageGoOptions) {
    this.base = wallet ?? new WalletClient();
    this.options = resolveOptions(options);
    if (IN_BROWSER) ensureStyle(this.options.design.cssText);
  }

  // ----- Helper: connection-modal-on-error wrapper -----
  private isWalletUnavailableError(error: unknown): boolean {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code)
        : '';
    const message = getErrorMessage(error);
    return (
      code === ERR.WALLET_NOT_CONNECTED ||
      code === ERR.AUTHENTICATION_FAILED ||
      code === ERR.WALLET_LOCKED ||
      NO_WALLET_MESSAGE_PATTERN.test(message)
    );
  }

  private shouldShowWalletUnavailableModal(error: unknown): boolean {
    return (
      IN_BROWSER &&
      this.options.showModal &&
      this.isWalletUnavailableError(error)
    );
  }

  private presentWalletUnavailableModal() {
    if (!IN_BROWSER) return;
    ensureStyle(this.options.design.cssText);
    showWalletUnavailableModal(
      this.options.walletUnavailable,
      this.options.mount
    );
  }

  private async hangForever<T>(): Promise<T> {
    // Used to keep the UI flow paused after surfacing wallet modals.
    return await new Promise<T>(() => {});
  }

  private maybeHandleWalletConnectionError<T>(
    error: unknown
  ): Promise<T> | null {
    if (this.shouldShowWalletUnavailableModal(error)) {
      this.presentWalletUnavailableModal();
      if (this.options.hangOnWalletErrors) {
        return this.hangForever<T>();
      }
    }
    return null;
  }

  private async executeWithWalletHandling<T>(
    operation: () => Promise<T>,
    fallbackOnWalletUnavailable?: () => T | Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } catch (e) {
      if (
        fallbackOnWalletUnavailable != null &&
        this.options.readOnlyFallbacks &&
        this.shouldShowWalletUnavailableModal(e)
      ) {
        return await Promise.resolve(fallbackOnWalletUnavailable());
      }
      const hang = this.maybeHandleWalletConnectionError<T>(e);
      if (hang != null) return await hang;
      throw e;
    }
  }

  private async createActionWithHydratedArgs(
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
      if (typeof action.signableTransaction === 'object') {
        this.pendingScripts[baseLockingScript] = {
          derivationPrefix,
          derivationSuffix,
          identity: recipients.base.identity
        }
        if (typeof developerLockingScript === 'string') {
          this.pendingScripts[developerLockingScript] = {
            derivationPrefix,
            derivationSuffix,
            identity: recipients.developer!.identity
          }
        }
        return
      }
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

  // ----- Special handling for createAction (funding flow + monetization) -----
  async createAction(
    args: CreateActionArgs,
    origin?: Origin
  ): Promise<CreateActionResult> {
    try {
      let monetization: { amount: number; identity: string } | undefined;
      if (
        this.options.monetization !== undefined &&
        this.options.monetization.developerIdentity !== undefined &&
        this.options.monetization?.developerIdentity.length > 0
      ) {
        monetization = {
          amount: this.options.monetization.developerFeeSats ?? 0,
          identity: this.options.monetization.developerIdentity,
        };
      }

      const result = await this.createActionWithHydratedArgs(
        this.base,
        { base: TRANSACTION_FEE, developer: monetization ?? undefined },
        args,
        origin
      );

      return result;
    } catch (e) {
      const hang = this.maybeHandleWalletConnectionError<CreateActionResult>(e);
      if (hang != null) return await hang;

      // Funding flow (only for INSUFFICIENT_FUNDS)
      const err = isWERR_INSUFFICIENT_FUNDS(e);
      if (err) {
        ensureStyle(this.options.design.cssText);
        let choice: 'retry' | 'cancel' = 'cancel';
        let fos = this.options.funding;
        if (fos.source === 'satoshiShopClient') {
          choice = await showSatoshiShopClientFundingModal(
            this.base,
            err.moreSatoshisNeeded,
            this.options.funding,
            args.description,
            this.options.mount
          );
        } else {
          const neededSats = err.moreSatoshisNeeded;
          const baseUrl = this.options.funding.buySatsUrl;
          const computedBuyUrl =
            neededSats && Number.isFinite(neededSats) && neededSats > 0
              ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}sats=${encodeURIComponent(String(neededSats))}&actionDescription=${encodeURIComponent(String(args.description))}`
              : baseUrl;
          choice = await showExternalFundingModal(
            {
              ...this.options.funding,
              buySatsUrl: computedBuyUrl,
            } as Required<FundingModalOptions>,
            args.description,
            this.options.mount
          );
        }
        if (choice === 'retry') {
          // single transparent retry; surface result or throw as-is
          return await this.createAction(args, origin);
        }
      }
      throw e;
    }
  }

  // ----- Straight pass-throughs with connection-modal-on-error behavior -----
  async getPublicKey(
    a: GetPublicKeyArgs,
    o?: Origin
  ): Promise<GetPublicKeyResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.getPublicKey(a, o)
    );
  }

  async revealCounterpartyKeyLinkage(
    a: RevealCounterpartyKeyLinkageArgs,
    o?: Origin
  ): Promise<RevealCounterpartyKeyLinkageResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.revealCounterpartyKeyLinkage(a, o)
    );
  }

  async revealSpecificKeyLinkage(
    a: RevealSpecificKeyLinkageArgs,
    o?: Origin
  ): Promise<RevealSpecificKeyLinkageResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.revealSpecificKeyLinkage(a, o)
    );
  }

  async encrypt(
    a: WalletEncryptArgs,
    o?: Origin
  ): Promise<WalletEncryptResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.encrypt(a, o)
    );
  }

  async decrypt(
    a: WalletDecryptArgs,
    o?: Origin
  ): Promise<WalletDecryptResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.decrypt(a, o)
    );
  }

  async createHmac(a: CreateHmacArgs, o?: Origin): Promise<CreateHmacResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.createHmac(a, o)
    );
  }

  async verifyHmac(a: VerifyHmacArgs, o?: Origin): Promise<VerifyHmacResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.verifyHmac(a, o)
    );
  }

  async createSignature(
    a: CreateSignatureArgs,
    o?: Origin
  ): Promise<CreateSignatureResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.createSignature(a, o)
    );
  }

  async verifySignature(
    a: VerifySignatureArgs,
    o?: Origin
  ): Promise<VerifySignatureResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.verifySignature(a, o)
    );
  }

  async signAction(a: SignActionArgs, o?: Origin): Promise<SignActionResult> {
    return await this.executeWithWalletHandling(
      async () => {
        const result = await this.base.signAction(a, o)
        return new Promise(r => {
          r(result)
          if (!Array.isArray(result.tx)) return
          const outs = Transaction.fromAtomicBEEF(result.tx).outputs

          if (!mbc) {
            mbc = new MessageBoxClient({
              host: 'https://messagebox.babbage.systems',
              walletClient: this.base,
              enableLogging: false,
            });
          }

          for (let oi = 0; oi < outs.length; oi++) {
            const scrh = outs[oi].lockingScript.toHex()
            const info = this.pendingScripts[scrh]
            if (info) {
              const paymentToken: PaymentToken = {
                customInstructions: {
                  derivationPrefix: info.derivationPrefix,
                  derivationSuffix: info.derivationSuffix,
                },
                transaction: result.tx,
                amount: outs[oi].satoshis as number,
                outputIndex: oi
              };
              mbc.sendMessage({
                recipient: info.identity,
                messageBox: STANDARD_PAYMENT_MESSAGEBOX,
                body: JSON.stringify(paymentToken)
              });
              delete this.pendingScripts[scrh];
            }
          }
        })
      }
    );
  }

  async listActions(
    a: ListActionsArgs,
    o?: Origin
  ): Promise<ListActionsResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.listActions(a, o),
      () => ({ totalActions: 0, actions: [] })
    );
  }

  async listCertificates(
    a: ListCertificatesArgs,
    o?: Origin
  ): Promise<ListCertificatesResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.listCertificates(a, o)
    );
  }

  async listOutputs(
    a: ListOutputsArgs,
    o?: Origin
  ): Promise<ListOutputsResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.listOutputs(a, o),
      () => ({ totalOutputs: 0, outputs: [] })
    );
  }

  async acquireCertificate(
    a: AcquireCertificateArgs,
    o?: Origin
  ): Promise<CertificateResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.acquireCertificate(a, o)
    );
  }

  async proveCertificate(
    a: ProveCertificateArgs,
    o?: Origin
  ): Promise<ProveCertificateResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.proveCertificate(a, o)
    );
  }

  async relinquishCertificate(
    a: RelinquishCertificateArgs,
    o?: Origin
  ): Promise<RelinquishCertificateResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.relinquishCertificate(a, o)
    );
  }

  async internalizeAction(
    a: InternalizeActionArgs,
    o?: Origin
  ): Promise<InternalizeActionResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.internalizeAction(a, o)
    );
  }

  async relinquishOutput(
    a: RelinquishOutputArgs,
    o?: Origin
  ): Promise<RelinquishOutputResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.relinquishOutput(a, o)
    );
  }

  async discoverByAttributes(
    a: Parameters<WalletInterface['discoverByAttributes']>[0],
    o?: Origin
  ) {
    return await this.executeWithWalletHandling(
      async () => await this.base.discoverByAttributes(a, o)
    );
  }

  async discoverByIdentityKey(
    a: Parameters<WalletInterface['discoverByIdentityKey']>[0],
    o?: Origin
  ) {
    return await this.executeWithWalletHandling(
      async () => await this.base.discoverByIdentityKey(a, o)
    );
  }

  async getHeaderForHeight(
    a: GetHeaderArgs,
    o?: Origin
  ): Promise<GetHeaderResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.getHeaderForHeight(a, o)
    );
  }

  async getHeight(
    a: Parameters<WalletInterface['getHeight']>[0],
    o?: Origin
  ): Promise<GetHeightResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.getHeight(a as any, o),
      () => ({ height: 0 })
    );
  }

  async getNetwork(
    a: Parameters<WalletInterface['getNetwork']>[0],
    o?: Origin
  ): Promise<GetNetworkResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.getNetwork(a as any, o)
    );
  }

  async getVersion(
    a: Parameters<WalletInterface['getVersion']>[0],
    o?: Origin
  ): Promise<GetVersionResult> {
    return await this.executeWithWalletHandling(
      async () => await this.base.getVersion(a as any, o),
      () => ({ version: READ_ONLY_VERSION_FALLBACK })
    );
  }

  async isAuthenticated(
    a: Parameters<WalletInterface['isAuthenticated']>[0],
    o?: Origin
  ) {
    return await this.executeWithWalletHandling(
      async () => await this.base.isAuthenticated(a as any, o),
      () => unauthenticatedResult()
    );
  }

  async waitForAuthentication(
    a: Parameters<WalletInterface['waitForAuthentication']>[0],
    o?: Origin
  ) {
    return await this.executeWithWalletHandling(
      async () => await this.base.waitForAuthentication(a as any, o),
      () => unauthenticatedResult()
    );
  }

  async abortAction(
    a: Parameters<WalletInterface['abortAction']>[0],
    o?: Origin
  ) {
    return await this.executeWithWalletHandling(
      async () => await this.base.abortAction(a as any, o)
    );
  }
}

function isWERR_INSUFFICIENT_FUNDS(e: unknown) : WERR_INSUFFICIENT_FUNDS | undefined {
  if (e instanceof WERR_INSUFFICIENT_FUNDS) return e
  if (e instanceof Error && e.name === 'WERR_INSUFFICIENT_FUNDS') return e as WERR_INSUFFICIENT_FUNDS
  return undefined
}

