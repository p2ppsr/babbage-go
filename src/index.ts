import {
  WalletClient,
  type WalletInterface,
  type GetPublicKeyArgs,   type GetPublicKeyResult,
  type RevealCounterpartyKeyLinkageArgs, type RevealCounterpartyKeyLinkageResult,
  type RevealSpecificKeyLinkageArgs,     type RevealSpecificKeyLinkageResult,
  type WalletEncryptArgs,  type WalletEncryptResult,
  type WalletDecryptArgs,  type WalletDecryptResult,
  type CreateHmacArgs,     type CreateHmacResult,
  type VerifyHmacArgs,     type VerifyHmacResult,
  type CreateSignatureArgs,type CreateSignatureResult,
  type VerifySignatureArgs,type VerifySignatureResult,
  type CreateActionArgs,   type CreateActionResult,
  type SignActionArgs,     type SignActionResult,
  type ListActionsArgs,    type ListActionsResult,
  type ListCertificatesArgs, type ListCertificatesResult,
  type ListOutputsArgs,    type ListOutputsResult,
  type AcquireCertificateArgs, type CertificateResult,
  type ProveCertificateArgs,  type ProveCertificateResult,
  type RelinquishCertificateArgs, type RelinquishCertificateResult,
  type InternalizeActionArgs, type InternalizeActionResult,
  type RelinquishOutputArgs, type RelinquishOutputResult,
  type RevealCounterpartyKeyLinkageResult as RCKLResult,
  type KeyLinkageResult,
  type GetHeaderArgs, type GetHeaderResult,
  type GetHeightResult, type GetNetworkResult, type GetVersionResult,
  type OriginatorDomainNameStringUnder250Bytes as Origin,
  type AuthenticatedResult,
} from '@bsv/sdk'

// Error codes per SDK docs (Errors reference).
// We key off these to decide when to present modals.
const ERR = {
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  WALLET_NOT_CONNECTED: 'WALLET_NOT_CONNECTED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  WALLET_LOCKED: 'WALLET_LOCKED',
} as const

const NO_WALLET_MESSAGE_PATTERN = /no wallet(?: available| detected| found)?(?: over any communication substrate)?\.?.*install.*wallet/i
const INSUFFICIENT_FUNDS_MESSAGE_PATTERN = /insufficient\s+funds/i

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  if (typeof error === 'string') return error
  return String(error ?? '')
}

// Environment guard
const IN_BROWSER =
  typeof window === 'object' &&
  typeof document === 'object' &&
  typeof document.createElement === 'function'

// ---------- UX / Modal plumbing ----------

export type WalletUnavailableModalOptions = {
  title?: string
  message?: string
  ctaText?: string
  ctaHref?: string // default https://GetMetanet.com
}

export type FundingModalOptions = {
  title?: string
  introText?: string
  postPurchaseText?: string
  buySatsText?: string
  retryText?: string
  cancelText?: string
  buySatsUrl?: string // default https://satoshis.babbage.systems
}

export type MonetizationOptions = {
  developerIdentity?: string
  developerFeeSats?: number
}

export type BabbageGoOptions = {
  showModal?: boolean
  hangOnWalletErrors?: boolean
  readOnlyFallbacks?: boolean // return placeholder data for read-only calls instead of showing a modal
  mount?: HTMLElement | null
  styles?: string
  walletUnavailable?: WalletUnavailableModalOptions
  funding?: FundingModalOptions
  monetization?: MonetizationOptions
}

type ResolvedOptions = {
  showModal: boolean
  hangOnWalletErrors: boolean
  readOnlyFallbacks: boolean
  mount: HTMLElement | null
  styles: string
  walletUnavailable: Required<WalletUnavailableModalOptions>
  funding: Required<FundingModalOptions>
  monetization: Required<MonetizationOptions>
}

const DEFAULT_WALLET_UNAVAILABLE: Required<WalletUnavailableModalOptions> = {
  title: 'This action requires a BRC-100 wallet',
  message:
    'Connect a BRC-100 compatible wallet (Metanet). Install one, then return to retry.',
  ctaText: 'Get a Wallet',
  ctaHref: 'https://GetMetanet.com',
}

const DEFAULT_FUNDING: Required<FundingModalOptions> = {
  title: 'Not enough sats',
  introText:
    'Top up your wallet, then click “Retry” to finish the action.',
  postPurchaseText:
    'If you’ve bought sats, click “Retry” to complete the action.',
  buySatsText: 'Buy Sats',
  retryText: 'Retry',
  cancelText: 'Cancel Action',
  buySatsUrl: 'https://satoshis.babbage.systems',
}

const DEFAULT_MONETIZATION: Required<MonetizationOptions> = {
  developerIdentity: '',
  developerFeeSats: 0,
}

const DEFAULTS: ResolvedOptions = {
  showModal: true,
  hangOnWalletErrors: true,
  readOnlyFallbacks: true,
  mount: null,
  styles: '',
  walletUnavailable: DEFAULT_WALLET_UNAVAILABLE,
  funding: DEFAULT_FUNDING,
  monetization: DEFAULT_MONETIZATION,
}

const READ_ONLY_VERSION_FALLBACK = 'babbbage-go-1.0.0' as const

function resolveWalletUnavailableOptions(
  overrides?: WalletUnavailableModalOptions,
): Required<WalletUnavailableModalOptions> {
  return {
    title: overrides?.title ?? DEFAULT_WALLET_UNAVAILABLE.title,
    message: overrides?.message ?? DEFAULT_WALLET_UNAVAILABLE.message,
    ctaText: overrides?.ctaText ?? DEFAULT_WALLET_UNAVAILABLE.ctaText,
    ctaHref: overrides?.ctaHref ?? DEFAULT_WALLET_UNAVAILABLE.ctaHref,
  }
}

function resolveFundingOptions(
  overrides?: FundingModalOptions,
): Required<FundingModalOptions> {
  return {
    title: overrides?.title ?? DEFAULT_FUNDING.title,
    introText: overrides?.introText ?? DEFAULT_FUNDING.introText,
    postPurchaseText: overrides?.postPurchaseText ?? DEFAULT_FUNDING.postPurchaseText,
    buySatsText: overrides?.buySatsText ?? DEFAULT_FUNDING.buySatsText,
    retryText: overrides?.retryText ?? DEFAULT_FUNDING.retryText,
    cancelText: overrides?.cancelText ?? DEFAULT_FUNDING.cancelText,
    buySatsUrl: overrides?.buySatsUrl ?? DEFAULT_FUNDING.buySatsUrl,
  }
}

function resolveMonetizationOptions(
  overrides?: MonetizationOptions,
): Required<MonetizationOptions> {
  return {
    developerIdentity: overrides?.developerIdentity ?? DEFAULT_MONETIZATION.developerIdentity,
    developerFeeSats: overrides?.developerFeeSats ?? DEFAULT_MONETIZATION.developerFeeSats,
  }
}

function resolveOptions(options?: BabbageGoOptions): ResolvedOptions {
  return {
    showModal: options?.showModal ?? DEFAULTS.showModal,
    hangOnWalletErrors: options?.hangOnWalletErrors ?? DEFAULTS.hangOnWalletErrors,
    readOnlyFallbacks: options?.readOnlyFallbacks ?? DEFAULTS.readOnlyFallbacks,
    mount: options?.mount ?? DEFAULTS.mount,
    styles: options?.styles ?? DEFAULTS.styles,
    walletUnavailable: resolveWalletUnavailableOptions(options?.walletUnavailable),
    funding: resolveFundingOptions(options?.funding),
    monetization: resolveMonetizationOptions(options?.monetization),
  }
}

const BASE_CSS = `
.bgo-overlay {
  position: fixed; z-index: 2147483647; inset: 0;
  background: rgba(0,0,0,0.5); opacity: 0; transition: opacity .2s ease;
  display: flex; align-items: center; justify-content: center;
}
.bgo-overlay.bgo-open { opacity: 1; }
.bgo-card {
  max-width: min(92vw, 580px); max-height: 85vh; overflow: auto;
  background: #121212; color: #fff; border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,.35), 0 2px 12px rgba(0,0,0,.5);
  padding: 20px 22px 18px; position: relative; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
}
.bgo-close {
  position: absolute; top: 8px; right: 10px; background: transparent; border: 0; color: #fff; font-size: 24px; line-height: 1; cursor: pointer;
}
.bgo-title { margin: 0 0 10px; font-size: 20px; font-weight: 800; }
.bgo-body { font-size: 15px; line-height: 1.5; opacity: .92; }
.bgo-actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
.bgo-link, .bgo-button {
  appearance: none; display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 14px; border-radius: 8px; font-weight: 800; text-decoration: none;
  border: 1px solid #fff; color: #fff; cursor: pointer;
  transition: transform .02s ease, background .12s ease, color .12s ease;
}
.bgo-link:hover, .bgo-button:hover { background: #fff; color: #121212; }
.bgo-button.secondary { border-color: #777; color: #ddd; }
.bgo-button.secondary:hover { background: #333; color: #fff; }
.bgo-small { margin-top: 10px; font-size: 12px; opacity: .7; }
`

let styleInstalled = false
function ensureStyle(extra?: string) {
  if (!IN_BROWSER) return
  if (styleInstalled) return
  const s = document.createElement('style')
  s.textContent = BASE_CSS + (extra ? `\n/* Custom */\n${extra}` : '')
  document.head.appendChild(s)
  styleInstalled = true
}

function overlayRoot(mount?: HTMLElement | null) {
  const root = document.createElement('div')
  root.className = 'bgo-overlay'
  ;(mount || document.body).appendChild(root)
  requestAnimationFrame(() => root.classList.add('bgo-open'))
  return root
}

function destroyOverlay(root: HTMLElement) {
  root.classList.remove('bgo-open')
  setTimeout(() => root.remove(), 200)
}

function renderCard(
  root: HTMLElement,
  title: string,
  bodyHTML: string,
  actions: HTMLElement[],
) {
  const card = document.createElement('div')
  card.className = 'bgo-card'
  const close = document.createElement('button')
  close.className = 'bgo-close'
  close.textContent = '×'
  close.setAttribute('aria-label', 'Close')
  const h = document.createElement('h2')
  h.className = 'bgo-title'
  h.textContent = title
  const b = document.createElement('div')
  b.className = 'bgo-body'
  b.innerHTML = bodyHTML
  const acts = document.createElement('div')
  acts.className = 'bgo-actions'
  actions.forEach(a => acts.appendChild(a))
  card.appendChild(close); card.appendChild(h); card.appendChild(b); card.appendChild(acts)
  root.appendChild(card)
  root.addEventListener('click', (ev) => { if (ev.target === root) destroyOverlay(root) })
  close.addEventListener('click', () => destroyOverlay(root))
  return { body: b }
}

function showWalletUnavailableModal(opts: Required<WalletUnavailableModalOptions>, mount?: HTMLElement | null) {
  if (!IN_BROWSER) return
  ensureStyle()
  const root = overlayRoot(mount)
  const link = document.createElement('a')
  link.className = 'bgo-link'
  link.href = opts.ctaHref
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = opts.ctaText
  renderCard(root, opts.title, `<p>${opts.message}</p>`, [link])
}

function showFundingModal(
  opts: Required<FundingModalOptions>,
  actionDescription?: string,
  mount?: HTMLElement | null
): Promise<'cancel'|'retry'> {
  if (!IN_BROWSER) return Promise.resolve('cancel')
  ensureStyle()
  return new Promise((resolve) => {
    const root = overlayRoot(mount)
    const buy = document.createElement('a')
    buy.className = 'bgo-link'
    buy.href = opts.buySatsUrl
    buy.target = '_blank'
    buy.rel = 'noopener noreferrer'
    buy.textContent = opts.buySatsText
    const cancel = document.createElement('button')
    cancel.className = 'bgo-button secondary'
    cancel.type = 'button'
    cancel.textContent = opts.cancelText

    const desc = actionDescription ? `<p class="bgo-small">Action: <strong>${escapeHtml(actionDescription)}</strong></p>` : ''
    const { body } = renderCard(
      root,
      opts.title,
      `<p>${opts.introText}</p>${desc}`,
      [buy, cancel],
    )
    let inRetry = false
    cancel.addEventListener('click', () => { destroyOverlay(root); resolve('cancel') })
    buy.addEventListener('click', () => {
      if (!inRetry) {
        // switch to retry mode
        inRetry = true
        buy.textContent = opts.retryText
        buy.removeAttribute('href'); buy.removeAttribute('target'); buy.removeAttribute('rel')
        body.innerHTML = `<p>${opts.postPurchaseText}</p>${desc}`
      } else {
        destroyOverlay(root); resolve('retry')
      }
    })
  })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')
}

function unauthenticatedResult(): AuthenticatedResult {
  return { authenticated: false } as unknown as AuthenticatedResult
}

// ---------- Wrapper ----------

export default class BabbageGo implements WalletInterface {
  readonly base: WalletInterface
  readonly options: ResolvedOptions

  constructor(wallet?: WalletInterface, options?: BabbageGoOptions) {
    this.base = wallet ?? new WalletClient()
    this.options = resolveOptions(options)
    if (IN_BROWSER) ensureStyle(this.options.styles)
  }

  // ----- Helper: connection-modal-on-error wrapper -----
  private isWalletUnavailableError(error: unknown): boolean {
    const code = (error && typeof error === 'object' && 'code' in error) ? String((error as { code?: string }).code) : ''
    const message = getErrorMessage(error)
    return (
      code === ERR.WALLET_NOT_CONNECTED ||
      code === ERR.AUTHENTICATION_FAILED ||
      code === ERR.WALLET_LOCKED ||
      NO_WALLET_MESSAGE_PATTERN.test(message)
    )
  }

  private shouldShowWalletUnavailableModal(error: unknown): boolean {
    return IN_BROWSER && this.options.showModal && this.isWalletUnavailableError(error)
  }

  private presentWalletUnavailableModal() {
    if (!IN_BROWSER) return
    showWalletUnavailableModal(this.options.walletUnavailable, this.options.mount)
  }

  private hangForever<T>(): Promise<T> {
    // Used to keep the UI flow paused after surfacing wallet modals.
    return new Promise<T>(() => {})
  }

  private maybeHandleWalletConnectionError<T>(error: unknown): Promise<T> | null {
    if (this.shouldShowWalletUnavailableModal(error)) {
      this.presentWalletUnavailableModal()
      if (this.options.hangOnWalletErrors) {
        return this.hangForever<T>()
      }
    }
    return null
  }

  private async executeWithWalletHandling<T>(
    operation: () => Promise<T>,
    fallbackOnWalletUnavailable?: () => T | Promise<T>,
  ): Promise<T> {
    try {
      return await operation()
    } catch (e) {
      if (
        fallbackOnWalletUnavailable &&
        this.options.readOnlyFallbacks &&
        this.shouldShowWalletUnavailableModal(e)
      ) {
        return await Promise.resolve(fallbackOnWalletUnavailable())
      }
      const hang = this.maybeHandleWalletConnectionError<T>(e)
      if (hang) return hang
      throw e
    }
  }

  // ----- Special handling for createAction (funding flow + monetization label) -----
  async createAction(args: CreateActionArgs, origin?: Origin): Promise<CreateActionResult> {
    const withMonetization = this.decorateMonetizationLabel(args)
    try {
      const result = await this.base.createAction(withMonetization, origin)
      // TODO: Submit a copy of the action to the developer with Message Box Client
      return result
    } catch (e) {
      const hang = this.maybeHandleWalletConnectionError<CreateActionResult>(e)
      if (hang) return hang

      // Funding flow (only for INSUFFICIENT_FUNDS)
      const code = (e && typeof e === 'object' && 'code' in e) ? String((e as { code?: string }).code) : ''
      const message = getErrorMessage(e)
      const insufficientFundsDetected =
        code === ERR.INSUFFICIENT_FUNDS || INSUFFICIENT_FUNDS_MESSAGE_PATTERN.test(message)
      if (IN_BROWSER && this.options.showModal && insufficientFundsDetected) {
        const choice = await showFundingModal(
          {
            title: this.options.funding.title ?? DEFAULTS.funding.title,
            introText: this.options.funding.introText ?? DEFAULTS.funding.introText,
            postPurchaseText: this.options.funding.postPurchaseText ?? DEFAULTS.funding.postPurchaseText,
            buySatsText: this.options.funding.buySatsText ?? DEFAULTS.funding.buySatsText,
            retryText: this.options.funding.retryText ?? DEFAULTS.funding.retryText,
            cancelText: this.options.funding.cancelText ?? DEFAULTS.funding.cancelText,
            buySatsUrl: this.options.funding.buySatsUrl ?? DEFAULTS.funding.buySatsUrl,
          },
          args.description,
          this.options.mount,
        )
        if (choice === 'retry') {
          // single transparent retry; surface result or throw as-is
          return this.base.createAction(withMonetization, origin)
        }
      }
      throw e
    }
  }

  private decorateMonetizationLabel(args: CreateActionArgs): CreateActionArgs {
    // TODO: Monetize with additional outputs
    // ... BRC29, derivationPrefix, derivationSuffix, senderIdentityKey, etc.
    return args
  }

  // ----- Straight pass-throughs with connection-modal-on-error behavior -----
  async getPublicKey(a: GetPublicKeyArgs, o?: Origin): Promise<GetPublicKeyResult> {
    return this.executeWithWalletHandling(() => this.base.getPublicKey(a, o))
  }
  async revealCounterpartyKeyLinkage(a: RevealCounterpartyKeyLinkageArgs, o?: Origin): Promise<RevealCounterpartyKeyLinkageResult> {
    return this.executeWithWalletHandling(() => this.base.revealCounterpartyKeyLinkage(a, o))
  }
  async revealSpecificKeyLinkage(a: RevealSpecificKeyLinkageArgs, o?: Origin): Promise<RevealSpecificKeyLinkageResult> {
    return this.executeWithWalletHandling(() => this.base.revealSpecificKeyLinkage(a, o))
  }
  async encrypt(a: WalletEncryptArgs, o?: Origin): Promise<WalletEncryptResult> {
    return this.executeWithWalletHandling(() => this.base.encrypt(a, o))
  }
  async decrypt(a: WalletDecryptArgs, o?: Origin): Promise<WalletDecryptResult> {
    return this.executeWithWalletHandling(() => this.base.decrypt(a, o))
  }
  async createHmac(a: CreateHmacArgs, o?: Origin): Promise<CreateHmacResult> {
    return this.executeWithWalletHandling(() => this.base.createHmac(a, o))
  }
  async verifyHmac(a: VerifyHmacArgs, o?: Origin): Promise<VerifyHmacResult> {
    return this.executeWithWalletHandling(() => this.base.verifyHmac(a, o))
  }
  async createSignature(a: CreateSignatureArgs, o?: Origin): Promise<CreateSignatureResult> {
    return this.executeWithWalletHandling(() => this.base.createSignature(a, o))
  }
  async verifySignature(a: VerifySignatureArgs, o?: Origin): Promise<VerifySignatureResult> {
    return this.executeWithWalletHandling(() => this.base.verifySignature(a, o))
  }
  async signAction(a: SignActionArgs, o?: Origin): Promise<SignActionResult> {
    return this.executeWithWalletHandling(() => this.base.signAction(a, o))
  }
  async listActions(a: ListActionsArgs, o?: Origin): Promise<ListActionsResult> {
    return this.executeWithWalletHandling(
      () => this.base.listActions(a, o),
      () => ({ totalActions: 0, actions: [] }),
    )
  }
  async listCertificates(a: ListCertificatesArgs, o?: Origin): Promise<ListCertificatesResult> {
    return this.executeWithWalletHandling(() => this.base.listCertificates(a, o))
  }
  async listOutputs(a: ListOutputsArgs, o?: Origin): Promise<ListOutputsResult> {
    return this.executeWithWalletHandling(
      () => this.base.listOutputs(a, o),
      () => ({ totalOutputs: 0, outputs: [] }),
    )
  }
  async acquireCertificate(a: AcquireCertificateArgs, o?: Origin): Promise<CertificateResult> {
    return this.executeWithWalletHandling(() => this.base.acquireCertificate(a, o))
  }
  async proveCertificate(a: ProveCertificateArgs, o?: Origin): Promise<ProveCertificateResult> {
    return this.executeWithWalletHandling(() => this.base.proveCertificate(a, o))
  }
  async relinquishCertificate(a: RelinquishCertificateArgs, o?: Origin): Promise<RelinquishCertificateResult> {
    return this.executeWithWalletHandling(() => this.base.relinquishCertificate(a, o))
  }
  async internalizeAction(a: InternalizeActionArgs, o?: Origin): Promise<InternalizeActionResult> {
    return this.executeWithWalletHandling(() => this.base.internalizeAction(a, o))
  }
  async relinquishOutput(a: RelinquishOutputArgs, o?: Origin): Promise<RelinquishOutputResult> {
    return this.executeWithWalletHandling(() => this.base.relinquishOutput(a, o))
  }
  async discoverByAttributes(a: Parameters<WalletInterface['discoverByAttributes']>[0], o?: Origin) {
    return this.executeWithWalletHandling(() => this.base.discoverByAttributes(a, o))
  }
  async discoverByIdentityKey(a: Parameters<WalletInterface['discoverByIdentityKey']>[0], o?: Origin) {
    return this.executeWithWalletHandling(() => this.base.discoverByIdentityKey(a, o))
  }
  async getHeaderForHeight(a: GetHeaderArgs, o?: Origin): Promise<GetHeaderResult> {
    return this.executeWithWalletHandling(() => this.base.getHeaderForHeight(a, o))
  }
  async getHeight(a: Parameters<WalletInterface['getHeight']>[0], o?: Origin): Promise<GetHeightResult> {
    return this.executeWithWalletHandling(
      () => this.base.getHeight(a as any, o),
      () => ({ height: 0 }),
    )
  }
  async getNetwork(a: Parameters<WalletInterface['getNetwork']>[0], o?: Origin): Promise<GetNetworkResult> {
    return this.executeWithWalletHandling(() => this.base.getNetwork(a as any, o))
  }
  async getVersion(a: Parameters<WalletInterface['getVersion']>[0], o?: Origin): Promise<GetVersionResult> {
    return this.executeWithWalletHandling(
      () => this.base.getVersion(a as any, o),
      () => ({ version: READ_ONLY_VERSION_FALLBACK }),
    )
  }
  async isAuthenticated(a: Parameters<WalletInterface['isAuthenticated']>[0], o?: Origin) {
    return this.executeWithWalletHandling(
      () => this.base.isAuthenticated(a as any, o),
      () => unauthenticatedResult(),
    )
  }
  async waitForAuthentication(a: Parameters<WalletInterface['waitForAuthentication']>[0], o?: Origin) {
    return this.executeWithWalletHandling(
      () => this.base.waitForAuthentication(a as any, o),
      () => unauthenticatedResult(),
    )
  }
  async abortAction(a: Parameters<WalletInterface['abortAction']>[0], o?: Origin) {
    return this.executeWithWalletHandling(() => this.base.abortAction(a as any, o))
  }
}
