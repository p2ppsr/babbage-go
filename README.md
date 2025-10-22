# @babbage/go

A polished, production-minded BRC-100 WalletInterface wrapper with sleek funding & onboarding UX for the MetaNet/BRC-100 world.

## Quick start

```bash
npm i @bsv/sdk @babbage/go
```

```ts
import BabbageGo from '@babbage/go'

const wallet = new BabbageGo()
await wallet.createAction({
  description: 'Example Action',
  outputs: [{
    satoshis: 1,
    script: '016a',
    outputDescription: 'Generic Token'
  }]
})
```

## License

[Open BSV © 2025 P2PPSR](./LICENSE.txt)
