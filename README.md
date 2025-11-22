# @babbage/go

A production-minded BRC-100 `WalletInterface` wrapper that keeps onboarding, error handling, and funding flows conversion-focused. Babbage Go now ships with an opinionated emotional design system so Metanet apps can feel branded from the very first modal.

## Quick start

```bash
npm i @bsv/sdk @babbage/go
```

```ts
import BabbageGo from '@babbage/go'

const wallet = new BabbageGo()
await wallet.createAction({
  description: 'Launchpad mint',
  outputs: [{
    satoshis: 1,
    script: '016a',
    outputDescription: 'Generic Token'
  }]
})
```

## Pulse Bloom design system

Our new Pulse Bloom system gives every interaction an immediate tone without forcing you to hand-roll CSS. It blends glassy layers, tactile buttons, and emotional color grading while remaining fully overridable.

| preset | vibe | When to use |
| --- | --- | --- |
| `auroraPulse` (default) | cool neon optimism | consumer onboarding, read receipts, progressive disclosure |
| `emberLagoon` | warm ritualized concierge | premium drops, tips, funding prompts |
| `midnightHalo` | crisp editorial minimalism | enterprise dashboards, light-mode sites |

**Custom controls**

- Token overrides for every color, shadow, font, and card radius (`design.tokens`).
- Button geometry via `buttonShape: 'pill' | 'soft' | 'sharp'`.
- Drop-in brand CSS with `design.customCss` (legacy `styles` still works and is merged automatically).
- Modal copy for wallet-unavailable + funding flows remains configurable via their respective option blocks.

## Examples

### 1. Aurora Pulse onboarding

```ts
const wallet = new BabbageGo(undefined, {
  showModal: true,
  design: {
    preset: 'auroraPulse',
  },
})
```

### 2. Ember Lagoon funding concierge

```ts
const wallet = new BabbageGo(undefined, {
  design: { preset: 'emberLagoon' },
  funding: {
    title: 'Need a quick top up?',
    introText: 'Add a little fuel then smash retry — we will hold your action in place.',
    postPurchaseText: 'Sats topped? Hit retry and we will complete everything instantly.',
    buySatsText: 'Buy sats fast',
    retryText: 'Retry the action',
    cancelText: 'Cancel for now',
    buySatsUrl: 'https://satoshis.babbage.systems',
  },
})
```

### 3. brand-tuned tokens & custom css

```ts
const wallet = new babbagego(undefined, {
  design: {
    preset: 'midnighthalo',
    tokens: {
      accentbackground: 'linear-gradient(135deg, #ff6fdb, #855cff)',
      accenttext: '#080814',
      accenthoverbackground: '#ffe8f9',
      accenthovertext: '#320845',
      buttonshape: 'pill',
      cardradius: '32px',
    },
    customcss: `
      .bgo-card {
        border-width: 2px;
        animation: bgo-fade 320ms ease;
      }
      @keyframes bgo-fade {
        from { transform: translatey(12px); opacity: 0; }
        to { transform: translatey(0); opacity: 1; }
      }
    `,
  },
})
```

### 4. Babbage todo-ts Application With SatoshiShopClient Funding Integration

```ts
const wallet = new babbagego(undefined, {
  monetization: {
    developerIdentity: '02a0647.....1149ea1291d1a73783d1b7b3a7a220',
    developerFeeSats: 300
  },
  funding: {
    title: 'More Satoshis Needed',
    introText: 'Satoshis are needed perform this action, or you can cancel it.',
    buySatsText: 'Buy Satoshis',
    source: 'satoshiShopClient'
  }
})
```

## License

[Open BSV © 2025 P2PPSR](./LICENSE.txt)
