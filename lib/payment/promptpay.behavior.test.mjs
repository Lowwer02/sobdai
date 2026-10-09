import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePayload } from '@thai-qr-payment/payload'
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import sharp from 'sharp'
import {
  buildPromptPayPayload,
  normalizeOrderAmount,
  renderPromptPayQr,
} from './promptpay.ts'

const recipient = '123456789012345'

test('PromptPay payloads are dynamic THB E-Wallet payloads with valid CRC', () => {
  for (const [input, expected] of [[69, '69.00'], [99, '99.00'], [129, '129.00'], ['69.5', '69.50']]) {
    const result = buildPromptPayPayload(recipient, input)
    const parsed = parsePayload(result.wire)

    assert.equal(result.amount, expected)
    assert.equal(parsed.amount, Number(expected))
    assert.equal(parsed.pointOfInitiation, 'dynamic')
    assert.equal(parsed.currency, '764')
    assert.equal(parsed.country, 'TH')
    assert.equal(parsed.crc.valid, true)
    assert.deepEqual(parsed.merchant, {
      kind: 'promptpay',
      recipientType: 'eWallet',
      recipient,
    })
  }
})

test('same recipient and amount produce a deterministic payload and PNG data URL', async () => {
  const first = buildPromptPayPayload(recipient, '69.00')
  const second = buildPromptPayPayload(recipient, 69)
  assert.equal(first.wire, second.wire)

  const rendered = await renderPromptPayQr(recipient, '69.00')
  assert.match(rendered.dataUrl, /^data:image\/png;base64,/)
})

test('768px PNGs keep an integer module pitch, four-edge quiet zone, and exact payload for the independent amount matrix', async () => {
  for (const [amount, expectedAmount] of [['69.00', 69], ['99.00', 99], ['100.00', 100], ['69.50', 69.5]]) {
    const baseline = buildPromptPayPayload(recipient, amount)
    const rendered = await renderPromptPayQr(recipient, amount)
    const png = Buffer.from(rendered.dataUrl.split(',')[1], 'base64')
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

    assert.equal(rendered.amount, amount)
    assert.equal(rendered.wire, baseline.wire)
    assert.equal(info.width, 768)
    assert.equal(info.height, 768)
    assert.equal(info.channels, 4)

    const moduleCount = QRCode.create(rendered.wire, { errorCorrectionLevel: 'M' }).modules.size
    const modulePitch = Math.floor(768 / (moduleCount + 8))
    let minX = info.width
    let minY = info.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const pixel = (y * info.width + x) * info.channels
        const red = data[pixel]
        const green = data[pixel + 1]
        const blue = data[pixel + 2]
        const alpha = data[pixel + 3]
        assert.equal(red, green)
        assert.equal(green, blue)
        assert.ok(red === 0 || red === 255, `non-crisp module at ${x},${y}: ${red}`)
        assert.equal(alpha, 255)

        if (red === 0) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }

    const quietZones = {
      left: minX,
      top: minY,
      right: info.width - 1 - maxX,
      bottom: info.height - 1 - maxY,
    }
    for (const [edge, pixels] of Object.entries(quietZones)) {
      assert.ok(pixels >= modulePitch * 4, `${amount} ${edge} quiet zone ${pixels}px < ${modulePitch * 4}px`)
    }

    const decoded = jsQR(Uint8ClampedArray.from(data), info.width, info.height)
    assert.ok(decoded, `${amount} PNG did not decode`)
    assert.equal(decoded.data, baseline.wire)

    const parsed = parsePayload(decoded.data)
    assert.equal(parsed.pointOfInitiation, 'dynamic')
    assert.equal(parsed.currency, '764')
    assert.equal(parsed.country, 'TH')
    assert.equal(parsed.amount, expectedAmount)
    assert.equal(parsed.crc.valid, true)
    assert.deepEqual(parsed.merchant, {
      kind: 'promptpay',
      recipientType: 'eWallet',
      recipient,
    })
  }
})

test('amount and recipient validation rejects unsafe QR inputs', () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'NaN', '1.001', '1e3', ' 69', '']) {
    assert.throws(() => normalizeOrderAmount(value))
  }

  assert.throws(() => buildPromptPayPayload('0812345678', 69))
  assert.throws(() => buildPromptPayPayload('123456789012345', 0))
})
