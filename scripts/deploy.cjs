const hre = require('hardhat')

function sellerAddress() {
  const key = process.env.SELLER_PRIVATE_KEY
  if (key)
    return new hre.ethers.Wallet(key).address
  if (process.env.SELLER_ADDRESS)
    return process.env.SELLER_ADDRESS
  throw new Error('Set SELLER_PRIVATE_KEY or SELLER_ADDRESS to the throwaway MetaMask seller wallet.')
}

async function main() {
  const seller = sellerAddress()
  const contribution = hre.ethers.parseEther(process.env.CONTRIBUTION_ETH || '0.001')
  const durationSeconds = BigInt(process.env.DURATION_SECONDS || '14400')

  const TestEscrow = await hre.ethers.getContractFactory('TestEscrow')
  const contract = await TestEscrow.deploy(seller, contribution, durationSeconds)
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log('TestEscrow deployed on Sepolia')
  console.log(`address: ${address}`)
  console.log(`seller: ${seller}`)
  console.log(`contribution: ${hre.ethers.formatEther(contribution)} ETH`)
  console.log(`durationSeconds: ${durationSeconds.toString()}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
