const { expect } = require('chai')
const hre = require('hardhat')

const CONTRIBUTION = 20n * 10n ** 6n
const MINT_AMOUNT = 100n * 10n ** 6n

async function revertedWith(txPromise, message) {
  try {
    await txPromise
    return false
  }
  catch (error) {
    return error instanceof Error && error.message.includes(message)
  }
}

describe('TestTokenEscrow', () => {
  async function deploy(durationSeconds = 14400n) {
    const [seller, buyer1, buyer2] = await hre.ethers.getSigners()
    const TestUSD = await hre.ethers.getContractFactory('TestUSD')
    const token = await TestUSD.deploy()
    await token.waitForDeployment()

    const TestTokenEscrow = await hre.ethers.getContractFactory('TestTokenEscrow')
    const escrow = await TestTokenEscrow.deploy(
      seller.address,
      await token.getAddress(),
      CONTRIBUTION,
      durationSeconds,
    )
    await escrow.waitForDeployment()

    await token.mint(buyer1.address, MINT_AMOUNT)
    await token.mint(buyer2.address, MINT_AMOUNT)
    await token.connect(buyer1).approve(await escrow.getAddress(), CONTRIBUTION * 4n)
    await token.connect(buyer2).approve(await escrow.getAddress(), CONTRIBUTION * 4n)

    return { token, escrow, seller, buyer1, buyer2 }
  }

  it('reverts when the seller tries to join', async () => {
    const { token, escrow, seller } = await deploy()
    await token.mint(seller.address, MINT_AMOUNT)
    await token.connect(seller).approve(await escrow.getAddress(), CONTRIBUTION)
    expect(await revertedWith(escrow.connect(seller).join(), 'seller cannot join')).to.equal(true)
    expect(await escrow.buyerCount()).to.equal(0n)
  })

  it('lets the first buyer join with 20 TestUSD', async () => {
    const { token, escrow, buyer1 } = await deploy()
    await escrow.connect(buyer1).join()
    expect(await escrow.buyerCount()).to.equal(1n)
    expect(await escrow.deposits(buyer1.address)).to.equal(CONTRIBUTION)
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(CONTRIBUTION)
    expect(await escrow.isSuccessful()).to.equal(false)
  })

  it('lets the first buyer withdraw the full 20 TestUSD while active and rejoin', async () => {
    const { token, escrow, buyer1 } = await deploy()
    const before = await token.balanceOf(buyer1.address)
    await escrow.connect(buyer1).join()
    await escrow.connect(buyer1).withdraw()
    expect(await escrow.buyerCount()).to.equal(0n)
    expect(await token.balanceOf(buyer1.address)).to.equal(before)
    await escrow.connect(buyer1).join()
    expect(await escrow.buyerCount()).to.equal(1n)
  })

  it('becomes successful when a second unique buyer joins', async () => {
    const { escrow, buyer1, buyer2 } = await deploy()
    await escrow.connect(buyer1).join()
    await escrow.connect(buyer2).join()
    expect(await escrow.buyerCount()).to.equal(2n)
    expect(await escrow.isSuccessful()).to.equal(true)
    expect(await escrow.committedAmount()).to.equal(CONTRIBUTION * 2n)
  })

  it('blocks buyer withdraws after success', async () => {
    const { escrow, buyer1, buyer2 } = await deploy()
    await escrow.connect(buyer1).join()
    await escrow.connect(buyer2).join()
    expect(await revertedWith(escrow.connect(buyer1).withdraw(), 'drop successful')).to.equal(true)
    expect(await revertedWith(escrow.connect(buyer2).withdraw(), 'drop successful')).to.equal(true)
  })

  it('lets the seller claim exactly 40 TestUSD only after success and not twice', async () => {
    const { token, escrow, seller, buyer1, buyer2 } = await deploy()
    expect(await revertedWith(escrow.connect(seller).claim(), 'not successful')).to.equal(true)

    await escrow.connect(buyer1).join()
    expect(await revertedWith(escrow.connect(seller).claim(), 'not successful')).to.equal(true)

    await escrow.connect(buyer2).join()
    const before = await token.balanceOf(seller.address)
    await escrow.connect(seller).claim()
    expect(await token.balanceOf(seller.address)).to.equal(before + CONTRIBUTION * 2n)
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n)
    expect(await escrow.sellerClaimed()).to.equal(true)
    expect(await revertedWith(escrow.connect(seller).claim(), 'already claimed')).to.equal(true)
  })

  it('lets buyers reclaim TestUSD after expiry if the goal was not reached', async () => {
    const { token, escrow, buyer1 } = await deploy(3600n)
    const before = await token.balanceOf(buyer1.address)
    await escrow.connect(buyer1).join()
    await hre.network.provider.send('evm_increaseTime', [3601])
    await hre.network.provider.send('evm_mine')
    expect(await escrow.isExpired()).to.equal(true)
    await escrow.connect(buyer1).withdraw()
    expect(await token.balanceOf(buyer1.address)).to.equal(before)
    expect(await escrow.buyerCount()).to.equal(0n)
  })

  it('does not accept native ETH as the purchase asset', async () => {
    const { escrow, buyer1 } = await deploy()
    let rejected = false
    try {
      await buyer1.sendTransaction({ to: await escrow.getAddress(), value: 1n })
    }
    catch {
      rejected = true
    }
    expect(rejected).to.equal(true)
  })
})
