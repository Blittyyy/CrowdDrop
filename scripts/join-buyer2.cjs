require('dotenv/config')
const hre = require('hardhat')

async function main() {
  const key = process.env.BUYER2_PRIVATE_KEY
  const rpcUrl = process.env.SEPOLIA_RPC_URL
  const contractAddress = process.env.TEST_ESCROW_ADDRESS
  if (!key)
    throw new Error('Set BUYER2_PRIVATE_KEY in .env to the throwaway Buyer 2 MetaMask key.')
  if (!rpcUrl)
    throw new Error('Set SEPOLIA_RPC_URL in .env.')
  if (!contractAddress)
    throw new Error('Set TEST_ESCROW_ADDRESS in .env to the deployed Sepolia contract.')

  const provider = new hre.ethers.JsonRpcProvider(rpcUrl)
  const wallet = new hre.ethers.Wallet(key, provider)
  const escrow = await hre.ethers.getContractAt('TestEscrow', contractAddress, wallet)
  const contribution = await escrow.contribution()

  console.log(`Buyer 2 address: ${wallet.address}`)
  console.log(`Contract: ${contractAddress}`)

  const tx = await escrow.join({ value: contribution })
  console.log(`Join tx: ${tx.hash}`)
  await tx.wait()

  console.log(`buyerCount: ${(await escrow.buyerCount()).toString()} / 2`)
  console.log(`isSuccessful: ${await escrow.isSuccessful()}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
