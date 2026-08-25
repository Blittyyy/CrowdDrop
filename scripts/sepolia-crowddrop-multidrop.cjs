require('dotenv/config')
const hre = require('hardhat')

const EXPECTED_TOKEN = '0x19Ca66141eb5Aa3B7996EA179D0287B7B0a11141'
const ONE_TUSD = 1n * 10n ** 6n
const TWO_TUSD = 2n * 10n ** 6n
const WEEK = 7n * 24n * 3600n
const Status = { Active: 0n, Successful: 1n, Expired: 2n, Claimed: 3n }

function requiredEnv(name) {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function assert(condition, message) {
  if (!condition)
    throw new Error(`CHECK FAILED: ${message}`)
  console.log(`PASS: ${message}`)
}

function eq(value, expected) {
  return BigInt(value) === BigInt(expected)
}

async function waitTx(tx, label, hashes) {
  console.log(`${label}: ${tx.hash}`)
  hashes[label] = tx.hash
  return await tx.wait()
}

async function main() {
  const rpcUrl = requiredEnv('SEPOLIA_RPC_URL')
  const crowdAddress = requiredEnv('CROWDDROP_SEPOLIA_ADDRESS')
  const tokenAddress = requiredEnv('TEST_USD_ADDRESS')
  requiredEnv('SEPOLIA_PRIVATE_KEY')
  requiredEnv('SELLER_PRIVATE_KEY')
  requiredEnv('BUYER2_PRIVATE_KEY')

  if (tokenAddress.toLowerCase() !== EXPECTED_TOKEN.toLowerCase()) {
    throw new Error(`TEST_USD_ADDRESS is ${tokenAddress}, expected ${EXPECTED_TOKEN}`)
  }

  const provider = new hre.ethers.JsonRpcProvider(rpcUrl)
  const deployer = new hre.ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY, provider)
  const sellerA = new hre.ethers.Wallet(process.env.SELLER_PRIVATE_KEY, provider)
  const buyer2 = new hre.ethers.Wallet(process.env.BUYER2_PRIVATE_KEY, provider)

  assert(deployer.address.toLowerCase() !== sellerA.address.toLowerCase(), 'deployer and seller A are different accounts')
  assert(buyer2.address.toLowerCase() !== sellerA.address.toLowerCase(), 'buyer2 is not seller A')
  assert(buyer2.address.toLowerCase() !== deployer.address.toLowerCase(), 'buyer2 is not deployer')

  const token = await hre.ethers.getContractAt('TestUSD', tokenAddress, deployer)
  const crowd = await hre.ethers.getContractAt('CrowdDrop', crowdAddress, deployer)
  const hashes = {}

  const onchainToken = await crowd.token()
  assert(onchainToken.toLowerCase() === EXPECTED_TOKEN.toLowerCase(), `CrowdDrop.token() is TestUSD ${EXPECTED_TOKEN}`)

  const owner = await token.owner()
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`TestUSD owner is ${owner}, deployer is ${deployer.address}. Cannot mint TestUSD.`)
  }

  async function ensureTusd(address, needed) {
    const balance = await token.balanceOf(address)
    if (balance >= needed)
      return
    const tx = await token.mint(address, needed - balance)
    await waitTx(tx, `mint to ${address}`, hashes)
  }

  await ensureTusd(buyer2.address, ONE_TUSD * 3n)
  await ensureTusd(sellerA.address, TWO_TUSD)
  await ensureTusd(deployer.address, ONE_TUSD * 2n)

  const crowdToken = crowd.connect(deployer)
  await waitTx(await token.connect(buyer2).approve(crowdAddress, ONE_TUSD * 3n), 'buyer2 approve', hashes)
  await waitTx(await token.connect(sellerA).approve(crowdAddress, TWO_TUSD), 'sellerA approve', hashes)
  await waitTx(await token.connect(deployer).approve(crowdAddress, ONE_TUSD), 'deployer approve', hashes)

  const nextId = await crowd.nextDropId()
  let dropA
  let dropB
  if (eq(nextId, 1)) {
    const createA = await crowd.connect(sellerA).createDrop(ONE_TUSD, 2, WEEK)
    await waitTx(createA, 'createDrop A', hashes)
    dropA = 1n
    const createB = await crowd.connect(deployer).createDrop(TWO_TUSD, 2, WEEK)
    await waitTx(createB, 'createDrop B', hashes)
    dropB = 2n
  }
  else if (eq(nextId, 3)) {
    dropA = 1n
    dropB = 2n
    hashes['createDrop A'] = '0x7de89267e6375eaed98460736b2062c3248978a2af1e7c13fdd40ec758ab5088'
    hashes['createDrop B'] = '0x62d1384598bb745b5d322c78be539fe4cf2c41380951944ae32aa2ad7b616368'
    console.log('Resuming with existing drop IDs 1 and 2')
  }
  else {
    throw new Error(`Unexpected nextDropId ${nextId.toString()}; expected 1 or 3`)
  }
  assert(eq(await crowd.nextDropId(), 3), 'nextDropId is 3 after two creates')
  assert(eq(dropA, 1) && eq(dropB, 2), 'drop IDs increment 1 then 2')

  const a0 = await crowd.getDrop(dropA)
  const b0 = await crowd.getDrop(dropB)
  assert(a0.seller === sellerA.address, 'drop A seller is seller A')
  assert(b0.seller === deployer.address, 'drop B seller is deployer')
  assert(eq(a0.contribution, ONE_TUSD) && eq(a0.goal, 2), 'drop A contribution 1 TUSD goal 2')
  assert(eq(b0.contribution, TWO_TUSD) && eq(b0.goal, 2), 'drop B contribution 2 TUSD goal 2')
  assert(a0.claimed === false && b0.claimed === false, 'neither drop is claimed')
  assert(eq(await crowd.statusOf(dropA), Status.Active), 'drop A is Active')
  assert(eq(await crowd.statusOf(dropB), Status.Active), 'drop B is Active simultaneously')

  await waitTx(await crowd.connect(buyer2).join(dropA), 'buyer2 join A', hashes)
  const aAfterJoinA = await crowd.getDrop(dropA)
  const bAfterJoinA = await crowd.getDrop(dropB)
  assert(eq(aAfterJoinA.buyerCount, 1) && eq(aAfterJoinA.escrowed, ONE_TUSD), 'join A updates only A buyerCount/escrowed')
  assert(eq(bAfterJoinA.buyerCount, 0) && eq(bAfterJoinA.escrowed, 0), 'join A leaves B accounting at 0')
  assert(eq(await crowd.depositOf(dropA, buyer2.address), ONE_TUSD), 'depositOf A/buyer2 is 1 TUSD')
  assert(eq(await crowd.depositOf(dropB, buyer2.address), 0), 'depositOf B/buyer2 is 0')

  await waitTx(await crowd.connect(sellerA).join(dropB), 'sellerA join B', hashes)
  const aAfterJoinB = await crowd.getDrop(dropA)
  const bAfterJoinB = await crowd.getDrop(dropB)
  assert(eq(aAfterJoinB.buyerCount, 1) && eq(aAfterJoinB.escrowed, ONE_TUSD), 'join B leaves A accounting unchanged')
  assert(eq(bAfterJoinB.buyerCount, 1) && eq(bAfterJoinB.escrowed, TWO_TUSD), 'join B updates only B')
  assert(eq(await crowd.depositOf(dropB, sellerA.address), TWO_TUSD), 'depositOf B/sellerA is 2 TUSD')
  assert(eq(await crowd.depositOf(dropA, sellerA.address), 0), 'depositOf A/sellerA is 0')

  const heldAfterJoins = await token.balanceOf(crowdAddress)
  assert(eq(heldAfterJoins, ONE_TUSD + TWO_TUSD), 'contract holds 3 TUSD for two drops')

  await waitTx(await crowd.connect(buyer2).withdraw(dropA), 'buyer2 withdraw A', hashes)
  const aAfterWithdraw = await crowd.getDrop(dropA)
  const bAfterWithdraw = await crowd.getDrop(dropB)
  assert(eq(aAfterWithdraw.buyerCount, 0) && eq(aAfterWithdraw.escrowed, 0), 'withdraw A zeros A accounting')
  assert(eq(bAfterWithdraw.buyerCount, 1) && eq(bAfterWithdraw.escrowed, TWO_TUSD), 'withdraw A leaves B untouched')
  assert(eq(await crowd.depositOf(dropA, buyer2.address), 0), 'depositOf A/buyer2 is 0 after withdraw')
  assert(eq(await crowd.depositOf(dropB, sellerA.address), TWO_TUSD), 'depositOf B/sellerA still 2 TUSD')

  await waitTx(await crowd.connect(buyer2).join(dropA), 'buyer2 rejoin A', hashes)
  await waitTx(await crowd.connect(deployer).join(dropA), 'deployer join A', hashes)
  assert(await crowd.isSuccessful(dropA), 'drop A is successful at goal 2')
  assert(eq(await crowd.statusOf(dropA), Status.Successful), 'status A is Successful')
  assert(eq((await crowd.getDrop(dropA)).escrowed, ONE_TUSD * 2n), 'drop A escrowed is 2 TUSD')
  assert(eq((await crowd.getDrop(dropB)).escrowed, TWO_TUSD), 'drop B still escrowed 2 TUSD')

  let withdrawAfterSuccessFailed = false
  try {
    await crowd.connect(buyer2).withdraw(dropA)
  }
  catch (error) {
    withdrawAfterSuccessFailed = error instanceof Error && error.message.includes('drop successful')
  }
  assert(withdrawAfterSuccessFailed, 'buyer cannot withdraw successful drop A')

  const stray = ONE_TUSD
  await waitTx(await token.transfer(crowdAddress, stray), 'stray TestUSD to CrowdDrop', hashes)
  const beforeClaim = await token.balanceOf(crowdAddress)
  assert(eq(beforeClaim, ONE_TUSD * 2n + TWO_TUSD + stray), 'balance before claim is A+B+stray')

  const sellerABefore = await token.balanceOf(sellerA.address)
  await waitTx(await crowd.connect(sellerA).claim(dropA), 'sellerA claim A', hashes)
  const sellerAAfter = await token.balanceOf(sellerA.address)
  assert(eq(sellerAAfter, sellerABefore + ONE_TUSD * 2n), 'seller A received exactly drop A escrowed 2 TUSD')
  const aClaimed = await crowd.getDrop(dropA)
  const bAfterClaimA = await crowd.getDrop(dropB)
  assert(aClaimed.claimed === true && eq(aClaimed.escrowed, 0), 'drop A claimed and escrowed 0')
  assert(eq(await crowd.statusOf(dropA), Status.Claimed), 'status A is Claimed')
  assert(eq(bAfterClaimA.escrowed, TWO_TUSD) && bAfterClaimA.claimed === false, 'claim A leaves B escrowed and unclaimed')
  assert(eq(await crowd.depositOf(dropB, sellerA.address), TWO_TUSD), 'claim A leaves sellerA deposit on B')
  assert(eq(await crowd.statusOf(dropB), Status.Active), 'drop B still Active')

  const afterClaim = await token.balanceOf(crowdAddress)
  const accounted = (await crowd.getDrop(dropA)).escrowed + (await crowd.getDrop(dropB)).escrowed + stray
  assert(eq(afterClaim, accounted), `CrowdDrop balance ${afterClaim} reconciles to B escrowed + stray (${accounted})`)
  assert(eq(afterClaim, TWO_TUSD + stray), 'remaining balance is drop B 2 TUSD plus 1 TUSD stray')

  let secondClaimFailed = false
  try {
    await crowd.connect(sellerA).claim(dropA)
  }
  catch (error) {
    secondClaimFailed = error instanceof Error && error.message.includes('already claimed')
  }
  assert(secondClaimFailed, 'second claim on drop A fails')

  let sellerAClaimBFailed = false
  try {
    await crowd.connect(sellerA).claim(dropB)
  }
  catch (error) {
    sellerAClaimBFailed = error instanceof Error && error.message.includes('not seller')
  }
  assert(sellerAClaimBFailed, 'seller A cannot claim drop B')

  const finalA = await crowd.getDrop(dropA)
  const finalB = await crowd.getDrop(dropB)
  console.log(JSON.stringify({
    crowdDrop: crowdAddress,
    token: onchainToken,
    dropA: {
      id: dropA.toString(),
      seller: finalA.seller,
      buyers: { buyer2: buyer2.address, deployer: deployer.address },
      contribution: finalA.contribution.toString(),
      goal: finalA.goal.toString(),
      deadline: finalA.deadline.toString(),
      buyerCount: finalA.buyerCount.toString(),
      escrowed: finalA.escrowed.toString(),
      claimed: finalA.claimed,
      status: Number(await crowd.statusOf(dropA)),
    },
    dropB: {
      id: dropB.toString(),
      seller: finalB.seller,
      buyers: { sellerA: sellerA.address },
      contribution: finalB.contribution.toString(),
      goal: finalB.goal.toString(),
      deadline: finalB.deadline.toString(),
      buyerCount: finalB.buyerCount.toString(),
      escrowed: finalB.escrowed.toString(),
      claimed: finalB.claimed,
      status: Number(await crowd.statusOf(dropB)),
    },
    finalBalance: (await token.balanceOf(crowdAddress)).toString(),
    hashes,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
