/**
 * One-shot Polygon mainnet createDrop for UI testing.
 * Seller: local deployer (POLYGON_PRIVATE_KEY). Does not join/approve/claim.
 */
require('dotenv/config')
const hre = require('hardhat')

const POLYGON_CHAIN_ID = 137n
const CROWDDROP = '0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12'
const EXPECTED_SELLER = '0xbcf16183Da0F9bd69d5882940Ea4cAD579d789B0'
const PHONE_WALLET = '0xB02862445f89cE966B1AdAac06C21D013891af28'
const CONTRIBUTION = 100_000n // 0.10 USDT (6 decimals)
const GOAL = 2n
const DURATION = 4n * 60n * 60n // 4 hours
const MIN_POL_WEI = 10n ** 15n // 0.001 POL — enough for a simple createDrop

async function main() {
  if (!process.env.POLYGON_PRIVATE_KEY)
    throw new Error('POLYGON_PRIVATE_KEY is missing from .env')

  const network = await hre.ethers.provider.getNetwork()
  if (network.chainId !== POLYGON_CHAIN_ID)
    throw new Error(`Refusing: chainId ${network.chainId}, expected ${POLYGON_CHAIN_ID}`)

  const [seller] = await hre.ethers.getSigners()
  if (seller.address.toLowerCase() !== EXPECTED_SELLER.toLowerCase())
    throw new Error(`Refusing: seller ${seller.address} is not ${EXPECTED_SELLER}`)
  if (seller.address.toLowerCase() === PHONE_WALLET.toLowerCase())
    throw new Error('Refusing: seller matches the phone wallet.')

  const pol = await hre.ethers.provider.getBalance(seller.address)
  if (pol < MIN_POL_WEI)
    throw new Error(`Refusing: seller POL too low (${hre.ethers.formatEther(pol)} POL).`)

  const crowd = await hre.ethers.getContractAt('CrowdDrop', CROWDDROP, seller)
  const onchain = await crowd.getAddress()
  if (onchain.toLowerCase() !== CROWDDROP.toLowerCase())
    throw new Error('CrowdDrop address mismatch.')

  console.log('preflight ok')
  console.log(`chainId: ${network.chainId}`)
  console.log(`seller: ${seller.address}`)
  console.log(`seller POL: ${hre.ethers.formatEther(pol)}`)
  console.log('contribution: 0.10 USDT (100000 base units)')
  console.log('goal: 2')
  console.log('duration: 4 hours')
  console.log('sending createDrop…')

  const tx = await crowd.createDrop(CONTRIBUTION, GOAL, DURATION)
  const receipt = await tx.wait()
  if (!receipt || receipt.status !== 1)
    throw new Error('createDrop failed on-chain.')

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
    throw new Error('Create confirmed but DropCreated was not found.')

  const dropId = created.args.dropId
  const drop = await crowd.getDrop(dropId)
  const deadlineIso = new Date(Number(drop.deadline) * 1000).toISOString()

  console.log('---')
  console.log(`Drop ID: ${dropId.toString()}`)
  console.log(`seller: ${drop.seller}`)
  console.log('contribution: 0.10 USDT')
  console.log(`goal: ${drop.goal.toString()}`)
  console.log(`deadline: ${drop.deadline.toString()} (${deadlineIso})`)
  console.log(`create transaction hash: ${tx.hash}`)
  console.log(`share URL: https://www.usecrowddrop.xyz/?drop=${dropId.toString()}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
