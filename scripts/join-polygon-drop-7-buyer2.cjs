/**
 * One-shot: Buyer 2 joins Polygon CrowdDrop Drop #7.
 */
require('dotenv/config')
const hre = require('hardhat')

const POLYGON_CHAIN_ID = 137n
const CROWDDROP = '0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12'
const BUYER_2 = '0x1984153FeE3256FF4d813Db5370A8ea1082871dd'
const LOCAL_BUYER = '0xbcf16183Da0F9bd69d5882940Ea4cAD579d789B0'
const USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const DROP_ID = 7n
const Status = ['Active', 'Successful', 'Expired', 'Claimed']
const REUSABLE_ALLOWANCE_UNITS = 100n * 10n ** 6n
const MAX_UINT256 = (1n << 256n) - 1n
const MIN_POL_WEI = 10n ** 15n
const ZERO = '0x0000000000000000000000000000000000000000'

function formatUsdt(value) {
  return `${hre.ethers.formatUnits(value, 6)} USDT`
}

function reusableApprovalAmount(contribution) {
  if (contribution <= 0n)
    throw new Error('Contribution must be greater than 0.')
  const scaled = contribution * 5n
  const amount = contribution <= REUSABLE_ALLOWANCE_UNITS
    ? REUSABLE_ALLOWANCE_UNITS
    : (scaled > REUSABLE_ALLOWANCE_UNITS ? scaled : REUSABLE_ALLOWANCE_UNITS)
  if (amount === MAX_UINT256 || amount <= 0n)
    throw new Error('Unlimited approval is not allowed.')
  return amount
}

async function main() {
  if (!process.env.BUYER2_PRIVATE_KEY)
    throw new Error('BUYER2_PRIVATE_KEY is missing from .env')

  const network = await hre.ethers.provider.getNetwork()
  if (network.chainId !== POLYGON_CHAIN_ID)
    throw new Error(`Refusing: chainId ${network.chainId}, expected ${POLYGON_CHAIN_ID}`)

  const buyer = new hre.ethers.Wallet(process.env.BUYER2_PRIVATE_KEY, hre.ethers.provider)
  if (buyer.address.toLowerCase() !== BUYER_2.toLowerCase())
    throw new Error(`Refusing: Buyer 2 signer ${buyer.address} is not ${BUYER_2}`)

  const crowd = await hre.ethers.getContractAt('CrowdDrop', CROWDDROP, buyer)
  const drop = await crowd.getDrop(DROP_ID)
  if (drop.seller.toLowerCase() === ZERO)
    throw new Error('Drop #7 does not exist.')

  const status = Number(await crowd.statusOf(DROP_ID))
  console.log('--- preflight ---')
  console.log(`buyer 2: ${buyer.address}`)
  console.log(`seller: ${drop.seller}`)
  console.log(`buyerCount / goal: ${drop.buyerCount} / ${drop.goal}`)
  console.log(`status: ${Status[status] ?? status}`)

  if (status !== 0)
    throw new Error(`Drop #7 is ${Status[status] ?? status}, not Active.`)
  if (drop.seller.toLowerCase() === buyer.address.toLowerCase())
    throw new Error('Refusing: Buyer 2 is the seller and cannot join.')
  if (drop.buyerCount >= drop.goal)
    throw new Error('Refusing: goal already reached.')

  const existingDeposit = await crowd.depositOf(DROP_ID, buyer.address)
  if (existingDeposit > 0n)
    throw new Error(`Refusing: Buyer 2 already has deposit ${formatUsdt(existingDeposit)}.`)

  const usdt = await hre.ethers.getContractAt(
    ['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'],
    USDT,
    buyer,
  )
  const usdtBal = await usdt.balanceOf(buyer.address)
  const pol = await hre.ethers.provider.getBalance(buyer.address)
  const allowanceBefore = await usdt.allowance(buyer.address, CROWDDROP)
  if (usdtBal < drop.contribution)
    throw new Error(`Refusing: USDT ${formatUsdt(usdtBal)} < contribution ${formatUsdt(drop.contribution)}`)
  if (pol < MIN_POL_WEI)
    throw new Error(`Refusing: POL too low (${hre.ethers.formatEther(pol)})`)

  if (allowanceBefore < drop.contribution) {
    const amount = reusableApprovalAmount(drop.contribution)
    if (allowanceBefore > 0n) {
      const resetTx = await usdt.approve(CROWDDROP, 0n)
      await resetTx.wait()
    }
    const approveTx = await usdt.approve(CROWDDROP, amount)
    await approveTx.wait()
  }

  console.log('sending join(7) as Buyer 2…')
  const joinTx = await crowd.join(DROP_ID)
  const joinReceipt = await joinTx.wait()
  if (!joinReceipt || joinReceipt.status !== 1)
    throw new Error('join failed on-chain.')

  const after = await crowd.getDrop(DROP_ID)
  const deposit = await crowd.depositOf(DROP_ID, buyer.address)
  const finalStatus = Number(await crowd.statusOf(DROP_ID))
  console.log('--- after join ---')
  console.log(`join tx: ${joinTx.hash}`)
  console.log(`buyerCount / goal: ${after.buyerCount.toString()} / ${after.goal.toString()}`)
  console.log(`escrowed: ${formatUsdt(after.escrowed)}`)
  console.log(`buyer 2 deposit: ${formatUsdt(deposit)}`)
  console.log(`final status: ${Status[finalStatus] ?? finalStatus}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
