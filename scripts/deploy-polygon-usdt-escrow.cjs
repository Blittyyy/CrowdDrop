require('dotenv/config')
const hre = require('hardhat')

const POLYGON_CHAIN_ID = 137n
const POLYGON_USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const STABLECOIN_DECIMALS = 6

function requiredEnv(name) {
  const value = process.env[name]
  if (!value)
    throw new Error(`Set ${name} in .env before deploying to Polygon.`)
  return value
}

function parseContributionUnits(humanAmount) {
  const text = String(humanAmount).trim()
  if (!/^\d+(\.\d+)?$/.test(text))
    throw new Error('POLYGON_CONTRIBUTION_USDT must be a positive number, for example 20')
  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > STABLECOIN_DECIMALS)
    throw new Error(`POLYGON_CONTRIBUTION_USDT cannot use more than ${STABLECOIN_DECIMALS} decimals`)
  const padded = (whole + fraction.padEnd(STABLECOIN_DECIMALS, '0')).replace(/^0+(?=\d)/, '') || '0'
  const units = BigInt(padded)
  if (units <= 0n)
    throw new Error('POLYGON_CONTRIBUTION_USDT must be greater than 0')
  return units
}

async function main() {
  const network = await hre.ethers.provider.getNetwork()
  if (network.chainId !== POLYGON_CHAIN_ID) {
    throw new Error(`Refusing to deploy: connected chainId is ${network.chainId}, expected Polygon ${POLYGON_CHAIN_ID}`)
  }

  if (!process.env.POLYGON_PRIVATE_KEY)
    throw new Error('Set POLYGON_PRIVATE_KEY in .env to a dedicated Polygon deployer wallet. Do not reuse Sepolia throwaway keys.')

  const seller = requiredEnv('POLYGON_SELLER_ADDRESS')
  const token = (process.env.POLYGON_USDT_ADDRESS || POLYGON_USDT).toLowerCase()
  if (token !== POLYGON_USDT.toLowerCase()) {
    throw new Error(`POLYGON_USDT_ADDRESS must be the Nimiq Pay Polygon USDT token ${POLYGON_USDT}`)
  }

  const contribution = parseContributionUnits(requiredEnv('POLYGON_CONTRIBUTION_USDT'))
  const durationSeconds = BigInt(requiredEnv('POLYGON_DURATION_SECONDS'))
  if (durationSeconds <= 0n)
    throw new Error('POLYGON_DURATION_SECONDS must be greater than 0')

  const [deployer] = await hre.ethers.getSigners()
  const TestTokenEscrow = await hre.ethers.getContractFactory('TestTokenEscrow')
  const escrow = await TestTokenEscrow.deploy(seller, POLYGON_USDT, contribution, durationSeconds)
  await escrow.waitForDeployment()
  const escrowAddress = await escrow.getAddress()

  console.log('ERC-20 escrow deployed on Polygon')
  console.log(`escrow: ${escrowAddress}`)
  console.log(`token: ${POLYGON_USDT}`)
  console.log(`seller: ${seller}`)
  console.log(`deployer: ${deployer.address}`)
  console.log(`contributionUnits: ${contribution.toString()}`)
  console.log(`durationSeconds: ${durationSeconds.toString()}`)
  console.log('Paste the escrow address into src/escrowConfig.ts as POLYGON_USDT_ESCROW_ADDRESS.')
  console.log('Then set ACTIVE_ERC20_NETWORK_ID to polygonUsdt only after you are ready to leave Sepolia TestUSD mode.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
