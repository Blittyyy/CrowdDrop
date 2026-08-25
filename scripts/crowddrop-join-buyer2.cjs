require('dotenv/config')
const { ethers } = require('ethers')

const CROWDDROP = '0xC17e2Fa96771F6b1adD541038a507C10493A7069'
const BUYER_2 = '0x1984153FeE3256FF4d813Db5370A8ea1082871dd'
const TEST_USD = '0x19Ca66141eb5Aa3B7996EA179D0287B7B0a11141'
const ZERO = '0x0000000000000000000000000000000000000000'
const Status = ['Active', 'Successful', 'Expired', 'Claimed']

function requiredEnv(name) {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function parseDropId() {
  const numeric = process.argv.filter(arg => /^\d+$/.test(arg))
  const raw = numeric[numeric.length - 1]
  if (!raw)
    throw new Error('Pass a drop ID, for example: npm run crowddrop:join-buyer2 -- 5')
  const id = BigInt(raw)
  if (id <= 0n)
    throw new Error('dropId must be greater than 0.')
  return id
}

function formatTusd(value) {
  return `${ethers.formatUnits(value, 6)} TUSD`
}

async function main() {
  const dropId = parseDropId()
  const rpcUrl = requiredEnv('SEPOLIA_RPC_URL')
  requiredEnv('BUYER2_PRIVATE_KEY')

  const tokenAddress = (process.env.TEST_USD_ADDRESS || TEST_USD).trim()
  if (tokenAddress.toLowerCase() !== TEST_USD.toLowerCase())
    throw new Error(`TEST_USD_ADDRESS must remain ${TEST_USD}`)

  const crowdAddress = (process.env.CROWDDROP_SEPOLIA_ADDRESS || CROWDDROP).trim()
  if (crowdAddress.toLowerCase() !== CROWDDROP.toLowerCase())
    throw new Error(`CROWDDROP_SEPOLIA_ADDRESS must be ${CROWDDROP}`)

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const buyer = new ethers.Wallet(process.env.BUYER2_PRIVATE_KEY, provider)
  if (buyer.address.toLowerCase() !== BUYER_2.toLowerCase())
    throw new Error(`BUYER2_PRIVATE_KEY does not match Buyer 2 ${BUYER_2}`)

  const crowd = new ethers.Contract(CROWDDROP, [
    'function token() view returns (address)',
    'function getDrop(uint256) view returns (tuple(address seller,uint256 contribution,uint256 goal,uint256 deadline,uint256 buyerCount,uint256 escrowed,bool claimed))',
    'function statusOf(uint256) view returns (uint8)',
    'function depositOf(uint256,address) view returns (uint256)',
    'function join(uint256)',
  ], buyer)
  const token = new ethers.Contract(TEST_USD, [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
  ], buyer)

  const onchainToken = await crowd.token()
  if (onchainToken.toLowerCase() !== TEST_USD.toLowerCase())
    throw new Error(`CrowdDrop.token() is not Sepolia TestUSD ${TEST_USD}`)

  const drop = await crowd.getDrop(dropId)
  if (drop.seller.toLowerCase() === ZERO)
    throw new Error(`Drop ${dropId.toString()} does not exist.`)

  const status = Number(await crowd.statusOf(dropId))
  if (status !== 0)
    throw new Error(`Drop ${dropId.toString()} is ${Status[status] ?? status}, not Active.`)

  if (drop.seller.toLowerCase() === buyer.address.toLowerCase())
    throw new Error('Buyer 2 is the seller of this drop and cannot join it.')

  const contribution = drop.contribution
  const balance = await token.balanceOf(buyer.address)
  if (balance < contribution)
    throw new Error(`Buyer 2 has ${formatTusd(balance)}, needs ${formatTusd(contribution)} to join.`)

  const allowanceBefore = await token.allowance(buyer.address, CROWDDROP)
  let approveHash = null
  if (allowanceBefore < contribution) {
    const approveTx = await token.approve(CROWDDROP, contribution)
    await approveTx.wait()
    approveHash = approveTx.hash
  }

  const joinTx = await crowd.join(dropId)
  await joinTx.wait()

  const after = await crowd.getDrop(dropId)
  const deposit = await crowd.depositOf(dropId, buyer.address)
  const finalStatus = Number(await crowd.statusOf(dropId))

  console.log(`drop ID: ${dropId.toString()}`)
  console.log(`buyer: ${buyer.address}`)
  console.log(`contribution: ${formatTusd(contribution)}`)
  console.log(`allowance before: ${formatTusd(allowanceBefore)}`)
  console.log(`approve tx: ${approveHash ?? '(not needed)'}`)
  console.log(`join tx: ${joinTx.hash}`)
  console.log(`final buyer deposit: ${formatTusd(deposit)}`)
  console.log(`final buyers: ${after.buyerCount.toString()} / ${after.goal.toString()}`)
  console.log(`final status: ${Status[finalStatus] ?? finalStatus}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
