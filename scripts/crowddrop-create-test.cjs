require('dotenv/config')
const hre = require('hardhat')

const CROWDDROP = '0xC17e2Fa96771F6b1adD541038a507C10493A7069'
const SELLER_A = '0x42e66A49A74ba5A6ca2Cbc99bc614d97CC390c25'
const TEST_USD = '0x19Ca66141eb5Aa3B7996EA179D0287B7B0a11141'
const CONTRIBUTION = 1n * 10n ** 6n
const GOAL = 2n
const DURATION = 4n * 60n * 60n

function requiredEnv(name) {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function main() {
  const rpcUrl = requiredEnv('SEPOLIA_RPC_URL')
  requiredEnv('SELLER_PRIVATE_KEY')

  const expectedCrowd = (process.env.CROWDDROP_SEPOLIA_ADDRESS || CROWDDROP).trim()
  if (expectedCrowd.toLowerCase() !== CROWDDROP.toLowerCase()) {
    throw new Error(`CROWDDROP_SEPOLIA_ADDRESS must be ${CROWDDROP}`)
  }

  const tokenAddress = (process.env.TEST_USD_ADDRESS || TEST_USD).trim()
  if (tokenAddress.toLowerCase() !== TEST_USD.toLowerCase()) {
    throw new Error(`TEST_USD_ADDRESS must remain ${TEST_USD}`)
  }

  const provider = new hre.ethers.JsonRpcProvider(rpcUrl)
  const seller = new hre.ethers.Wallet(process.env.SELLER_PRIVATE_KEY, provider)
  if (seller.address.toLowerCase() !== SELLER_A.toLowerCase()) {
    throw new Error(`SELLER_PRIVATE_KEY does not match Seller A ${SELLER_A}`)
  }

  const crowd = await hre.ethers.getContractAt('CrowdDrop', CROWDDROP, seller)
  const onchainToken = await crowd.token()
  if (onchainToken.toLowerCase() !== TEST_USD.toLowerCase()) {
    throw new Error(`CrowdDrop.token() is not Sepolia TestUSD ${TEST_USD}`)
  }

  const tx = await crowd.createDrop(CONTRIBUTION, GOAL, DURATION)
  const receipt = await tx.wait()
  const created = receipt.logs
    .map((log) => {
      try {
        return crowd.interface.parseLog(log)
      }
      catch {
        return null
      }
    })
    .find((parsed) => parsed && parsed.name === 'DropCreated')

  if (!created)
    throw new Error('Create confirmed but DropCreated was not found in the receipt.')

  const dropId = created.args.dropId
  const drop = await crowd.getDrop(dropId)

  console.log(`drop ID: ${dropId.toString()}`)
  console.log(`seller: ${drop.seller}`)
  console.log(`contribution: 1 TUSD`)
  console.log(`goal: ${drop.goal.toString()}`)
  console.log(`deadline: ${drop.deadline.toString()} (${new Date(Number(drop.deadline) * 1000).toISOString()})`)
  console.log(`tx: ${tx.hash}`)
  console.log(`share URL: /?drop=${dropId.toString()}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
