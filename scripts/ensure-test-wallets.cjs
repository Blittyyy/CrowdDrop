require('dotenv/config')
const fs = require('node:fs')
const path = require('node:path')
const { Wallet } = require('ethers')

const envPath = path.join(__dirname, '..', '.env')
let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''

function hasKey(name) {
  return new RegExp(`^${name}=.+$`, 'm').test(envText)
}

function upsert(name, value) {
  const line = `${name}=${value}`
  if (new RegExp(`^${name}=`, 'm').test(envText))
    envText = envText.replace(new RegExp(`^${name}=.*$`, 'm'), line)
  else
    envText += `${envText.endsWith('\n') || envText.length === 0 ? '' : '\n'}${line}\n`
}

const created = []

if (!hasKey('SELLER_PRIVATE_KEY')) {
  const wallet = Wallet.createRandom()
  upsert('SELLER_PRIVATE_KEY', wallet.privateKey)
  upsert('SELLER_ADDRESS', wallet.address)
  created.push(`seller ${wallet.address}`)
}
else if (!hasKey('SELLER_ADDRESS')) {
  upsert('SELLER_ADDRESS', new Wallet(process.env.SELLER_PRIVATE_KEY).address)
}

if (!hasKey('BUYER2_PRIVATE_KEY')) {
  const wallet = Wallet.createRandom()
  upsert('BUYER2_PRIVATE_KEY', wallet.privateKey)
  created.push(`buyer2 ${wallet.address}`)
}

upsert('DURATION_SECONDS', '14400')

fs.writeFileSync(envPath, envText)
if (created.length)
  console.log(`Created throwaway wallets: ${created.join('; ')}`)
else
  console.log('Throwaway seller and Buyer 2 keys already present in .env')
