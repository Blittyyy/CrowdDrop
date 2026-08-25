require('dotenv/config')
const hre = require('hardhat')

async function main() {
  const key = process.env.SELLER_PRIVATE_KEY
  const rpcUrl = process.env.SEPOLIA_RPC_URL
  const contractAddress = process.env.TEST_ESCROW_ADDRESS
  if (!key)
    throw new Error('Set SELLER_PRIVATE_KEY in .env to the throwaway seller MetaMask key.')
  if (!rpcUrl)
    throw new Error('Set SEPOLIA_RPC_URL in .env.')
  if (!contractAddress)
    throw new Error('Set TEST_ESCROW_ADDRESS in .env to the deployed Sepolia contract.')

  const provider = new hre.ethers.JsonRpcProvider(rpcUrl)
  const wallet = new hre.ethers.Wallet(key, provider)
  const escrow = await hre.ethers.getContractAt('TestEscrow', contractAddress, wallet)

  console.log(`Seller address: ${wallet.address}`)
  console.log(`Contract: ${contractAddress}`)
  console.log(`isSuccessful: ${await escrow.isSuccessful()}`)
  console.log(`committedAmount: ${hre.ethers.formatEther(await escrow.committedAmount())} ETH`)

  const tx = await escrow.claim()
  console.log(`Claim tx: ${tx.hash}`)
  await tx.wait()

  console.log(`sellerClaimed: ${await escrow.sellerClaimed()}`)
  console.log(`committedAmount: ${hre.ethers.formatEther(await escrow.committedAmount())} ETH`)
  console.log(`isSuccessful: ${await escrow.isSuccessful()}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
