require('dotenv/config')
const hre = require('hardhat')

const POLYGON_CHAIN_ID = 137n
const POLYGON_USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'

async function main() {
  if (!process.env.POLYGON_PRIVATE_KEY)
    throw new Error('Set POLYGON_PRIVATE_KEY in .env to a dedicated Polygon deployer wallet. Do not reuse Sepolia throwaway keys.')

  const network = await hre.ethers.provider.getNetwork()
  if (network.chainId !== POLYGON_CHAIN_ID)
    throw new Error(`Refusing to deploy: connected chainId is ${network.chainId}, expected Polygon ${POLYGON_CHAIN_ID}`)

  const token = (process.env.POLYGON_USDT_ADDRESS || POLYGON_USDT).trim()
  if (token.toLowerCase() !== POLYGON_USDT.toLowerCase())
    throw new Error(`POLYGON_USDT_ADDRESS must be the verified Polygon USDT ${POLYGON_USDT}`)

  const [deployer] = await hre.ethers.getSigners()
  const balance = await hre.ethers.provider.getBalance(deployer.address)
  console.log(`deployer: ${deployer.address}`)
  console.log(`deployer POL: ${hre.ethers.formatEther(balance)}`)
  if (balance === 0n)
    throw new Error('Deployer has 0 POL. Fund the wallet before deploying.')

  const CrowdDrop = await hre.ethers.getContractFactory('CrowdDrop')
  const crowd = await CrowdDrop.deploy(POLYGON_USDT)
  const deployTx = crowd.deploymentTransaction()
  await crowd.waitForDeployment()
  const address = await crowd.getAddress()
  const onchainToken = await crowd.token()
  if (onchainToken.toLowerCase() !== POLYGON_USDT.toLowerCase())
    throw new Error(`Deployed CrowdDrop.token() is ${onchainToken}, expected ${POLYGON_USDT}`)

  console.log('CrowdDrop deployed on Polygon')
  console.log(`crowddrop: ${address}`)
  console.log(`token: ${onchainToken}`)
  if (deployTx)
    console.log(`deployTx: ${deployTx.hash}`)
  console.log('Do not change ACTIVE_CROWDDROP_NETWORK_ID until this address is verified and pasted into escrowConfig.ts.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
