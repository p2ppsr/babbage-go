import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import BabbageGo from '../dist/esm/index.js'

const require = createRequire(import.meta.url)

const platformIdentity =
  '0247632654abc935c66c68eb6797f7f1b300dfe3107cacad7c86b69176d938bbfb'

function fakeWallet() {
  const calls = {
    getPublicKey: [],
    createAction: [],
  }

  return {
    calls,
    wallet: {
      async getPublicKey(args) {
        calls.getPublicKey.push(args)
        return { publicKey: platformIdentity }
      },
      async createAction(args) {
        calls.createAction.push(args)
        return { signableTransaction: {} }
      },
    },
  }
}

test('loads through both published module entry points', () => {
  const commonJsModule = require('../dist/cjs/index.cjs')

  assert.equal(typeof BabbageGo, 'function')
  assert.equal(typeof commonJsModule.default, 'function')
})

test('supports Metanet developers by default', async () => {
  const { wallet, calls } = fakeWallet()
  const babbageGo = new BabbageGo(wallet)
  const callerOutputs = []

  await babbageGo.createAction({
    description: 'Default platform support',
    outputs: callerOutputs,
  })

  assert.deepEqual(callerOutputs, [])
  assert.equal(calls.getPublicKey.length, 1)
  assert.equal(calls.getPublicKey[0].counterparty, platformIdentity)
  assert.equal(calls.createAction.length, 1)
  assert.equal(calls.createAction[0].outputs.length, 1)
  assert.equal(calls.createAction[0].outputs[0].satoshis, 103301)
  assert.equal(
    calls.createAction[0].outputs[0].outputDescription,
    'Support Metanet developers',
  )
})

test('advanced opt-out removes the platform fee', async () => {
  const { wallet, calls } = fakeWallet()
  const babbageGo = new BabbageGo(wallet, {
    advanced: {
      supportMetanetDevelopers: false,
    },
  })

  await babbageGo.createAction({
    description: 'Explicit platform support opt-out',
    outputs: [],
  })

  assert.equal(calls.getPublicKey.length, 0)
  assert.equal(calls.createAction.length, 1)
  assert.deepEqual(calls.createAction[0].outputs, [])
})

test('platform opt-out does not disable the application developer fee', async () => {
  const { wallet, calls } = fakeWallet()
  const babbageGo = new BabbageGo(wallet, {
    advanced: {
      supportMetanetDevelopers: false,
    },
    monetization: {
      developerIdentity: platformIdentity,
      developerFeeSats: 300,
    },
  })

  await babbageGo.createAction({
    description: 'Developer monetization with platform support opt-out',
    outputs: [],
  })

  assert.equal(calls.getPublicKey.length, 1)
  assert.equal(calls.createAction[0].outputs.length, 1)
  assert.equal(calls.createAction[0].outputs[0].satoshis, 300)
  assert.equal(calls.createAction[0].outputs[0].outputDescription, 'Fee to developer')
})
