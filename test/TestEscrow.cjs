const { expect } = require('chai')
const hre = require('hardhat')

async function revertedWith(txPromise, message) {
  try {
    await txPromise
    return false
  }
  catch (error) {
    return error instanceof Error && error.message.includes(message)
  }
}

describe('TestEscrow', () => {
  async function deploy(durationSeconds = 14400n) {
    const [seller, buyer1, buyer2] = await hre.ethers.getSigners()
    const contribution = hre.ethers.parseEther('0.001')
    const TestEscrow = await hre.ethers.getContractFactory('TestEscrow')
    const escrow = await TestEscrow.deploy(seller.address, contribution, durationSeconds)
    await escrow.waitForDeployment()
    return { escrow, seller, buyer1, buyer2, contribution }
  }

  it('reverts when the seller tries to join', async () => {
    const { escrow, seller, contribution } = await deploy()
    expect(await revertedWith(
      escrow.connect(seller).join({ value: contribution }),
      'seller cannot join',
    )).to.equal(true)
    expect(await escrow.buyerCount()).to.equal(0n)
  })

  it('lets the first buyer join', async () => {
    const { escrow, buyer1, contribution } = await deploy()
    await escrow.connect(buyer1).join({ value: contribution })
    expect(await escrow.buyerCount()).to.equal(1n)
    expect(await escrow.deposits(buyer1.address)).to.equal(contribution)
    expect(await escrow.isSuccessful()).to.equal(false)
  })

  it('lets the first buyer withdraw before the threshold', async () => {
    const { escrow, buyer1, contribution } = await deploy()
    await escrow.connect(buyer1).join({ value: contribution })
    await escrow.connect(buyer1).withdraw()
    expect(await escrow.buyerCount()).to.equal(0n)
    expect(await escrow.deposits(buyer1.address)).to.equal(0n)
  })

  it('becomes successful when a second unique buyer joins', async () => {
    const { escrow, buyer1, buyer2, contribution } = await deploy()
    await escrow.connect(buyer1).join({ value: contribution })
    await escrow.connect(buyer2).join({ value: contribution })
    expect(await escrow.buyerCount()).to.equal(2n)
    expect(await escrow.isSuccessful()).to.equal(true)
    expect(await escrow.committedAmount()).to.equal(contribution * 2n)
  })

  it('blocks buyer withdraws after success', async () => {
    const { escrow, buyer1, buyer2, contribution } = await deploy()
    await escrow.connect(buyer1).join({ value: contribution })
    await escrow.connect(buyer2).join({ value: contribution })
    expect(await revertedWith(escrow.connect(buyer1).withdraw(), 'drop successful')).to.equal(true)
    expect(await revertedWith(escrow.connect(buyer2).withdraw(), 'drop successful')).to.equal(true)
  })

  it('lets the seller claim only after success and pays the committed amount once', async () => {
    const { escrow, seller, buyer1, buyer2, contribution } = await deploy()

    expect(await revertedWith(escrow.connect(seller).claim(), 'not successful')).to.equal(true)

    await escrow.connect(buyer1).join({ value: contribution })
    expect(await revertedWith(escrow.connect(seller).claim(), 'not successful')).to.equal(true)

    await escrow.connect(buyer2).join({ value: contribution })

    const before = await hre.ethers.provider.getBalance(seller.address)
    const tx = await escrow.connect(seller).claim()
    const receipt = await tx.wait()
    const gas = (receipt?.gasUsed ?? 0n) * (receipt?.gasPrice ?? 0n)
    const after = await hre.ethers.provider.getBalance(seller.address)

    expect(after).to.equal(before + contribution * 2n - gas)
    expect(await escrow.sellerClaimed()).to.equal(true)
    expect(await escrow.committedAmount()).to.equal(0n)
    expect(await escrow.isSuccessful()).to.equal(true)

    expect(await revertedWith(escrow.connect(seller).claim(), 'already claimed')).to.equal(true)
  })

  it('rejects a second join from the same wallet', async () => {
    const { escrow, buyer1, contribution } = await deploy()
    await escrow.connect(buyer1).join({ value: contribution })
    expect(await revertedWith(
      escrow.connect(buyer1).join({ value: contribution }),
      'already joined',
    )).to.equal(true)
  })

  it('lets buyers withdraw after expiry if the goal was not reached', async () => {
    const { escrow, buyer1, contribution } = await deploy(2n)
    await escrow.connect(buyer1).join({ value: contribution })

    await hre.network.provider.send('evm_increaseTime', [5])
    await hre.network.provider.send('evm_mine')

    expect(await escrow.isExpired()).to.equal(true)
    await escrow.connect(buyer1).withdraw()
    expect(await escrow.buyerCount()).to.equal(0n)
  })
})
