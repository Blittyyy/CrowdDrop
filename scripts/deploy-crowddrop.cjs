require('dotenv/config')
const hre = require('hardhat')

async function main() {
  const token = process.env.TEST_USD_ADDRESS
  if (!token)
    throw new Error('Set TEST_USD_ADDRESS in .env to the existing Sepolia TestUSD token.')

  const expected = '0x19Ca66141eb5Aa3B7996EA179D0287B7B0a11141'
  if (token.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`TEST_USD_ADDRESS must be the existing Sepolia TestUSD ${expected}`)
  }

  const CrowdDrop = await hre.ethers.getContractFactory('CrowdDrop')
  const crowd = await CrowdDrop.deploy(token)
  const deployTx = crowd.deploymentTransaction()
  await crowd.waitForDeployment()
  const address = await crowd.getAddress()
  const onchainToken = await crowd.token()
  if (onchainToken.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Deployed CrowdDrop token ${onchainToken} does not match TestUSD ${expected}`)
  }

  console.log('CrowdDrop deployed on', hre.network.name)
  console.log(`crowddrop: ${address}`)
  console.log(`token: ${onchainToken}`)
  if (deployTx)
    console.log(`deployTx: ${deployTx.hash}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
