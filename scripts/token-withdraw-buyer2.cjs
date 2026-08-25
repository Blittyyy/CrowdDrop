require('dotenv/config')
const hre = require('hardhat')

async function main() {
  const key = process.env.BUYER2_PRIVATE_KEY
  const rpcUrl = process.env.SEPOLIA_RPC_URL
  const tokenAddress = process.env.TEST_USD_ADDRESS
  const escrowAddress = process.env.TEST_TOKEN_ESCROW_ADDRESS
  if (!key)
    throw new Error('Set BUYER2_PRIVATE_KEY in .env')
  if (!rpcUrl)
    throw new Error('Set SEPOLIA_RPC_URL in .env')
  if (!tokenAddress || !escrowAddress)
    throw new Error('Set TEST_USD_ADDRESS and TEST_TOKEN_ESCROW_ADDRESS in .env')

  const provider = new hre.ethers.JsonRpcProvider(rpcUrl)
  const wallet = new hre.ethers.Wallet(key, provider)
  const token = await hre.ethers.getContractAt('TestUSD', tokenAddress, wallet)
  const escrow = await hre.ethers.getContractAt('TestTokenEscrow', escrowAddress, wallet)

  console.log(`Buyer 2: ${wallet.address}`)
  const tx = await escrow.withdraw()
  console.log(`Withdraw tx: ${tx.hash}`)
  await tx.wait()
  console.log(`buyerCount: ${(await escrow.buyerCount()).toString()} / 2`)
  console.log(`buyer2 TUSD: ${(Number(await token.balanceOf(wallet.address)) / 1e6).toFixed(6)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
