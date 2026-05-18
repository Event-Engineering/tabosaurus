// node scripts/build-icon.js
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const BUILD = path.join(__dirname, '..', 'build')
const svg = fs.readFileSync(path.join(BUILD, 'icon.svg'))

async function main() {
  const sizes = [16, 32, 48, 128, 256, 512, 1024]
  const pngs = {}

  for (const s of sizes) {
    pngs[s] = await sharp(svg).resize(s, s).png().toBuffer()
  }

  fs.writeFileSync(path.join(BUILD, 'icon.png'), pngs[1024])
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), buildICO(pngs))
  fs.writeFileSync(path.join(BUILD, 'icon.icns'), buildICNS(pngs))

  console.log('✓ build/icon.png')
  console.log('✓ build/icon.ico')
  console.log('✓ build/icon.icns')
}

function buildICO(pngs) {
  const sizes = [16, 32, 48, 256]
  const images = sizes.map(s => ({ data: pngs[s], size: s }))
  const count = images.length
  let offset = 6 + count * 16
  const entries = images.map(({ data, size }) => {
    const e = { data, size, offset }
    offset += data.length
    return e
  })
  const hdr = Buffer.alloc(6)
  hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(count, 4)
  const dir = Buffer.alloc(count * 16)
  entries.forEach(({ data, size, offset: off }, i) => {
    const p = i * 16, s = size >= 256 ? 0 : size
    dir.writeUInt8(s, p); dir.writeUInt8(s, p + 1)
    dir.writeUInt8(0, p + 2); dir.writeUInt8(0, p + 3)
    dir.writeUInt16LE(1, p + 4); dir.writeUInt16LE(32, p + 6)
    dir.writeUInt32LE(data.length, p + 8); dir.writeUInt32LE(off, p + 12)
  })
  return Buffer.concat([hdr, dir, ...entries.map(e => e.data)])
}

function buildICNS(pngs) {
  const map = [['ic10', 1024], ['ic09', 512], ['ic08', 256], ['ic07', 128], ['icp5', 32], ['icp4', 16]]
  const chunks = map.map(([type, s]) => {
    const d = pngs[s]
    const h = Buffer.alloc(8)
    h.write(type, 0, 'ascii'); h.writeUInt32BE(8 + d.length, 4)
    return Buffer.concat([h, d])
  })
  const total = 8 + chunks.reduce((a, c) => a + c.length, 0)
  const fh = Buffer.alloc(8)
  fh.write('icns', 0, 'ascii'); fh.writeUInt32BE(total, 4)
  return Buffer.concat([fh, ...chunks])
}

main().catch(e => { console.error(e); process.exit(1) })
