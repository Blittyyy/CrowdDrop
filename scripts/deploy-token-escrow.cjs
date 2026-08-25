require('dotenv/config')
const hre = require('hardhat')

const CONTRIBUTION = 20n * 10n ** 6n
const MINT_AMOUNT = 100n * 10n ** 6n

function requiredEnv(name) {
  const value = process.env[name]
  if (!value)
    throw new Error(`Set ${name} in .env`)
  return value
}

function sellerAddress() {
  const key = process.env.SELLER_PRIVATE_KEY
  if (key)
    return new hre.ethers.Wallet(key).address
  return requiredEnv('SELLER_ADDRESS')
}

function buyer2Address() {
  return new hre.ethers.Wallet(requiredEnv('BUYER2_PRIVATE_KEY')).address
}

async function main() {
  const seller = sellerAddress()
  const buyer1 = requiredEnv('BUYER1_ADDRESS')
  const buyer2 = buyer2Address()
  const durationSeconds = BigInt(process.env.DURATION_SECONDS || '14400')

  const TestUSD = await hre.ethers.getContractFactory('TestUSD')
  const token = await TestUSD.deploy()
  await token.waitForDeployment()
  const tokenAddress = await token.getAddress()

  const TestTokenEscrow = await hre.ethers.getContractFactory('TestTokenEscrow')
  const escrow = await TestTokenEscrow.deploy(seller, tokenAddress, CONTRIBUTION, durationSeconds)
  await escrow.waitForDeployment()
  const escrowAddress = await escrow.getAddress()

  await (await token.mint(buyer1, MINT_AMOUNT)).wait()
  await (await token.mint(buyer2, MINT_AMOUNT)).wait()

  console.log('TestUSD deployed on Sepolia')
  console.log(`token: ${tokenAddress}`)
  console.log('TestTokenEscrow deployed on Sepolia')
  console.log(`escrow: ${escrowAddress}`)
  console.log(`seller: ${seller}`)
  console.log(`minted 100 TUSD to Buyer 1: ${buyer1}`)
  console.log(`minted 100 TUSD to Buyer 2: ${buyer2}`)
  console.log(`contribution: 20 TUSD`)
  console.log(`durationSeconds: ${durationSeconds.toString()}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
