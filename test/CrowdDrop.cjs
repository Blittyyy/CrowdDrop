const { expect } = require('chai')
const hre = require('hardhat')

const CONTRIBUTION = 20n * 10n ** 6n
const MINT = 1_000n * 10n ** 6n
const HOUR = 3600n
const NINETY_DAYS = 90n * 24n * 3600n

const Status = {
  Active: 0n,
  Successful: 1n,
  Expired: 2n,
  Claimed: 3n,
}

async function revertedWith(txPromise, message) {
  try {
    await txPromise
    return false
  }
  catch (error) {
    return error instanceof Error && error.message.includes(message)
  }
}

describe('CrowdDrop', () => {
  async function setup() {
    const [deployer, sellerA, sellerB, buyer1, buyer2, buyer3] = await hre.ethers.getSigners()
    const TestUSD = await hre.ethers.getContractFactory('TestUSD')
    const token = await TestUSD.deploy()
    await token.waitForDeployment()

    const CrowdDrop = await hre.ethers.getContractFactory('CrowdDrop')
    const crowd = await CrowdDrop.deploy(await token.getAddress())
    await crowd.waitForDeployment()
    const crowdAddress = await crowd.getAddress()

    for (const buyer of [buyer1, buyer2, buyer3]) {
      await token.mint(buyer.address, MINT)
      await token.connect(buyer).approve(crowdAddress, MINT)
    }

    return { token, crowd, crowdAddress, deployer, sellerA, sellerB, buyer1, buyer2, buyer3 }
  }

  async function createDrop(crowd, seller, { contribution = CONTRIBUTION, goal = 2n, duration = HOUR } = {}) {
    const tx = await crowd.connect(seller).createDrop(contribution, goal, duration)
    const receipt = await tx.wait()
    const parsed = receipt.logs
      .map((log) => {
        try {
          return crowd.interface.parseLog(log)
        }
        catch {
          return null
        }
      })
      .find((item) => item?.name === 'DropCreated')
    return parsed.args.dropId
  }

  it('1. creates a drop correctly', async () => {
    const { crowd, sellerA } = await setup()
    const before = await hre.ethers.provider.getBlock('latest')
    const dropId = await createDrop(crowd, sellerA)
    const drop = await crowd.getDrop(dropId)
    expect(dropId).to.equal(1n)
    expect(drop.seller).to.equal(sellerA.address)
    expect(drop.contribution).to.equal(CONTRIBUTION)
    expect(drop.goal).to.equal(2n)
    expect(drop.buyerCount).to.equal(0n)
    expect(drop.escrowed).to.equal(0n)
    expect(drop.claimed).to.equal(false)
    expect(drop.deadline >= BigInt(before.timestamp) + HOUR).to.equal(true)
    expect(drop.deadline <= BigInt(before.timestamp) + HOUR + 5n).to.equal(true)
    expect(await crowd.statusOf(dropId)).to.equal(Status.Active)
  })

  it('2. increments drop IDs from 1', async () => {
    const { crowd, sellerA } = await setup()
    expect(await crowd.nextDropId()).to.equal(1n)
    expect(await createDrop(crowd, sellerA)).to.equal(1n)
    expect(await createDrop(crowd, sellerA)).to.equal(2n)
    expect(await createDrop(crowd, sellerA)).to.equal(3n)
    expect(await crowd.nextDropId()).to.equal(4n)
  })

  it('3. lets multiple sellers create separate drops', async () => {
    const { crowd, sellerA, sellerB } = await setup()
    const a = await createDrop(crowd, sellerA, { contribution: CONTRIBUTION, goal: 2n })
    const b = await createDrop(crowd, sellerB, { contribution: CONTRIBUTION * 2n, goal: 3n })
    expect((await crowd.getDrop(a)).seller).to.equal(sellerA.address)
    expect((await crowd.getDrop(b)).seller).to.equal(sellerB.address)
    expect((await crowd.getDrop(b)).goal).to.equal(3n)
    expect((await crowd.getDrop(b)).contribution).to.equal(CONTRIBUTION * 2n)
  })

  it('4. rejects contribution = 0', async () => {
    const { crowd, sellerA } = await setup()
    expect(await revertedWith(crowd.connect(sellerA).createDrop(0, 2, HOUR), 'contribution required')).to.equal(true)
  })

  it('5. rejects goal below 2', async () => {
    const { crowd, sellerA } = await setup()
    expect(await revertedWith(crowd.connect(sellerA).createDrop(CONTRIBUTION, 1, HOUR), 'goal too small')).to.equal(true)
  })

  it('6. rejects goal above 1000', async () => {
    const { crowd, sellerA } = await setup()
    expect(await revertedWith(crowd.connect(sellerA).createDrop(CONTRIBUTION, 1001, HOUR), 'goal too large')).to.equal(true)
  })

  it('7. rejects duration below 1 hour', async () => {
    const { crowd, sellerA } = await setup()
    expect(await revertedWith(crowd.connect(sellerA).createDrop(CONTRIBUTION, 2, HOUR - 1n), 'duration too short')).to.equal(true)
  })

  it('8. rejects duration above 90 days', async () => {
    const { crowd, sellerA } = await setup()
    expect(await revertedWith(crowd.connect(sellerA).createDrop(CONTRIBUTION, 2, NINETY_DAYS + 1n), 'duration too long')).to.equal(true)
  })

  it('9. seller cannot join own drop', async () => {
    const { token, crowd, crowdAddress, sellerA } = await setup()
    await token.mint(sellerA.address, MINT)
    await token.connect(sellerA).approve(crowdAddress, MINT)
    const dropId = await createDrop(crowd, sellerA)
    expect(await revertedWith(crowd.connect(sellerA).join(dropId), 'seller cannot join')).to.equal(true)
  })

  it('10-11. buyer can approve and join with the exact 6-decimal amount', async () => {
    const { token, crowd, buyer1, sellerA } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    const beforeBuyer = await token.balanceOf(buyer1.address)
    const beforeCrowd = await token.balanceOf(await crowd.getAddress())
    await crowd.connect(buyer1).join(dropId)
    expect(await crowd.depositOf(dropId, buyer1.address)).to.equal(CONTRIBUTION)
    expect((await crowd.getDrop(dropId)).buyerCount).to.equal(1n)
    expect((await crowd.getDrop(dropId)).escrowed).to.equal(CONTRIBUTION)
    expect(await token.balanceOf(buyer1.address)).to.equal(beforeBuyer - CONTRIBUTION)
    expect(await token.balanceOf(await crowd.getAddress())).to.equal(beforeCrowd + CONTRIBUTION)
  })

  it('12. same buyer cannot join the same drop twice', async () => {
    const { crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    await crowd.connect(buyer1).join(dropId)
    expect(await revertedWith(crowd.connect(buyer1).join(dropId), 'already joined')).to.equal(true)
  })

  it('13. same buyer can join two different drops', async () => {
    const { crowd, sellerA, sellerB, buyer1 } = await setup()
    const a = await createDrop(crowd, sellerA)
    const b = await createDrop(crowd, sellerB)
    await crowd.connect(buyer1).join(a)
    await crowd.connect(buyer1).join(b)
    expect(await crowd.depositOf(a, buyer1.address)).to.equal(CONTRIBUTION)
    expect(await crowd.depositOf(b, buyer1.address)).to.equal(CONTRIBUTION)
  })

  it('14. different buyers can join the same drop', async () => {
    const { crowd, sellerA, buyer1, buyer2 } = await setup()
    const dropId = await createDrop(crowd, sellerA, { goal: 3n })
    await crowd.connect(buyer1).join(dropId)
    await crowd.connect(buyer2).join(dropId)
    expect((await crowd.getDrop(dropId)).buyerCount).to.equal(2n)
    expect((await crowd.getDrop(dropId)).escrowed).to.equal(CONTRIBUTION * 2n)
  })

  it('15-16. buyer can withdraw while active and accounting is restored', async () => {
    const { token, crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    const before = await token.balanceOf(buyer1.address)
    await crowd.connect(buyer1).join(dropId)
    await crowd.connect(buyer1).withdraw(dropId)
    expect(await crowd.depositOf(dropId, buyer1.address)).to.equal(0n)
    expect((await crowd.getDrop(dropId)).buyerCount).to.equal(0n)
    expect((await crowd.getDrop(dropId)).escrowed).to.equal(0n)
    expect(await token.balanceOf(buyer1.address)).to.equal(before)
    expect(await crowd.statusOf(dropId)).to.equal(Status.Active)
  })

  it('17. buyer can rejoin after withdrawing while still active', async () => {
    const { crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    await crowd.connect(buyer1).join(dropId)
    await crowd.connect(buyer1).withdraw(dropId)
    await crowd.connect(buyer1).join(dropId)
    expect(await crowd.depositOf(dropId, buyer1.address)).to.equal(CONTRIBUTION)
    expect((await crowd.getDrop(dropId)).buyerCount).to.equal(1n)
  })

  it('18. join fails after deadline', async () => {
    const { crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA, { duration: HOUR })
    await hre.network.provider.send('evm_increaseTime', [Number(HOUR) + 1])
    await hre.network.provider.send('evm_mine')
    expect(await revertedWith(crowd.connect(buyer1).join(dropId), 'expired')).to.equal(true)
  })

  it('19. buyer can withdraw after an unsuccessful expiry', async () => {
    const { token, crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA, { duration: HOUR })
    const before = await token.balanceOf(buyer1.address)
    await crowd.connect(buyer1).join(dropId)
    await hre.network.provider.send('evm_increaseTime', [Number(HOUR) + 1])
    await hre.network.provider.send('evm_mine')
    expect(await crowd.statusOf(dropId)).to.equal(Status.Expired)
    await crowd.connect(buyer1).withdraw(dropId)
    expect(await token.balanceOf(buyer1.address)).to.equal(before)
  })

  it('20. seller cannot claim an unsuccessful drop', async () => {
    const { crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    await crowd.connect(buyer1).join(dropId)
    expect(await revertedWith(crowd.connect(sellerA).claim(dropId), 'not successful')).to.equal(true)
  })

  it('21-23. drop becomes successful at goal; extra joins and buyer withdraws fail', async () => {
    const { crowd, sellerA, buyer1, buyer2, buyer3 } = await setup()
    const dropId = await createDrop(crowd, sellerA, { goal: 2n })
    await crowd.connect(buyer1).join(dropId)
    expect(await crowd.isSuccessful(dropId)).to.equal(false)
    await crowd.connect(buyer2).join(dropId)
    expect(await crowd.isSuccessful(dropId)).to.equal(true)
    expect(await crowd.statusOf(dropId)).to.equal(Status.Successful)
    expect((await crowd.getDrop(dropId)).escrowed).to.equal(CONTRIBUTION * 2n)
    expect(await revertedWith(crowd.connect(buyer3).join(dropId), 'already successful')).to.equal(true)
    expect(await revertedWith(crowd.connect(buyer1).withdraw(dropId), 'drop successful')).to.equal(true)
    expect(await revertedWith(crowd.connect(buyer2).withdraw(dropId), 'drop successful')).to.equal(true)
  })

  it('24. only the seller can claim', async () => {
    const { crowd, sellerA, buyer1, buyer2 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    await crowd.connect(buyer1).join(dropId)
    await crowd.connect(buyer2).join(dropId)
    expect(await revertedWith(crowd.connect(buyer1).claim(dropId), 'not seller')).to.equal(true)
  })

  it('25. seller can claim immediately after success', async () => {
    const { token, crowd, sellerA, buyer1, buyer2 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    await crowd.connect(buyer1).join(dropId)
    await crowd.connect(buyer2).join(dropId)
    const before = await token.balanceOf(sellerA.address)
    await crowd.connect(sellerA).claim(dropId)
    expect(await token.balanceOf(sellerA.address)).to.equal(before + CONTRIBUTION * 2n)
    expect((await crowd.getDrop(dropId)).escrowed).to.equal(0n)
    expect((await crowd.getDrop(dropId)).claimed).to.equal(true)
    expect(await crowd.statusOf(dropId)).to.equal(Status.Claimed)
  })

  it('26. seller can claim after deadline if success happened first', async () => {
    const { token, crowd, sellerA, buyer1, buyer2 } = await setup()
    const dropId = await createDrop(crowd, sellerA, { duration: HOUR })
    await crowd.connect(buyer1).join(dropId)
    await crowd.connect(buyer2).join(dropId)
    await hre.network.provider.send('evm_increaseTime', [Number(HOUR) + 1])
    await hre.network.provider.send('evm_mine')
    expect(await crowd.isSuccessful(dropId)).to.equal(true)
    expect(await crowd.statusOf(dropId)).to.equal(Status.Successful)
    const before = await token.balanceOf(sellerA.address)
    await crowd.connect(sellerA).claim(dropId)
    expect(await token.balanceOf(sellerA.address)).to.equal(before + CONTRIBUTION * 2n)
  })

  it('27. seller cannot claim twice', async () => {
    const { crowd, sellerA, buyer1, buyer2 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    await crowd.connect(buyer1).join(dropId)
    await crowd.connect(buyer2).join(dropId)
    await crowd.connect(sellerA).claim(dropId)
    expect(await revertedWith(crowd.connect(sellerA).claim(dropId), 'already claimed')).to.equal(true)
  })

  it('28-29. claim transfers exactly that drop escrow and zeroes it', async () => {
    const { token, crowd, sellerA, buyer1, buyer2 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    await crowd.connect(buyer1).join(dropId)
    await crowd.connect(buyer2).join(dropId)
    const before = await token.balanceOf(sellerA.address)
    await crowd.connect(sellerA).claim(dropId)
    expect(await token.balanceOf(sellerA.address)).to.equal(before + CONTRIBUTION * 2n)
    expect((await crowd.getDrop(dropId)).escrowed).to.equal(0n)
  })

  it('30. stray USDT sent to the contract is not included in seller claim', async () => {
    const { token, crowd, crowdAddress, deployer, sellerA, buyer1, buyer2 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    await crowd.connect(buyer1).join(dropId)
    await crowd.connect(buyer2).join(dropId)
    await token.mint(deployer.address, CONTRIBUTION)
    await token.transfer(crowdAddress, CONTRIBUTION)
    expect(await token.balanceOf(crowdAddress)).to.equal(CONTRIBUTION * 3n)
    const before = await token.balanceOf(sellerA.address)
    await crowd.connect(sellerA).claim(dropId)
    expect(await token.balanceOf(sellerA.address)).to.equal(before + CONTRIBUTION * 2n)
    expect(await token.balanceOf(crowdAddress)).to.equal(CONTRIBUTION)
  })

  it('31-34. CRITICAL cross-drop isolation and simultaneous escrows', async () => {
    const { token, crowd, sellerA, sellerB, buyer1, buyer2, buyer3 } = await setup()
    const dropA = await createDrop(crowd, sellerA, { contribution: CONTRIBUTION, goal: 2n })
    const dropB = await createDrop(crowd, sellerB, { contribution: CONTRIBUTION * 2n, goal: 2n })

    await crowd.connect(buyer1).join(dropA)
    await crowd.connect(buyer2).join(dropB)
    expect((await crowd.getDrop(dropA)).escrowed).to.equal(CONTRIBUTION)
    expect((await crowd.getDrop(dropB)).escrowed).to.equal(CONTRIBUTION * 2n)

    const buyer1Before = await token.balanceOf(buyer1.address)
    await crowd.connect(buyer1).withdraw(dropA)
    expect(await token.balanceOf(buyer1.address)).to.equal(buyer1Before + CONTRIBUTION)
    expect((await crowd.getDrop(dropA)).escrowed).to.equal(0n)
    expect((await crowd.getDrop(dropB)).escrowed).to.equal(CONTRIBUTION * 2n)
    expect(await crowd.depositOf(dropB, buyer2.address)).to.equal(CONTRIBUTION * 2n)

    await crowd.connect(buyer1).join(dropA)
    await crowd.connect(buyer3).join(dropA)
    expect(await crowd.isSuccessful(dropA)).to.equal(true)
    expect(await crowd.isSuccessful(dropB)).to.equal(false)

    const sellerABefore = await token.balanceOf(sellerA.address)
    const sellerBBefore = await token.balanceOf(sellerB.address)
    await crowd.connect(sellerA).claim(dropA)
    expect(await token.balanceOf(sellerA.address)).to.equal(sellerABefore + CONTRIBUTION * 2n)
    expect(await token.balanceOf(sellerB.address)).to.equal(sellerBBefore)
    expect((await crowd.getDrop(dropA)).escrowed).to.equal(0n)
    expect((await crowd.getDrop(dropB)).escrowed).to.equal(CONTRIBUTION * 2n)
    expect(await revertedWith(crowd.connect(sellerB).claim(dropA), 'not seller')).to.equal(true)
    expect(await revertedWith(crowd.connect(sellerB).claim(dropB), 'not successful')).to.equal(true)
  })

  it('35. status reports Active, Successful, Expired, and Claimed', async () => {
    const { crowd, sellerA, buyer1, buyer2 } = await setup()
    const activeId = await createDrop(crowd, sellerA)
    expect(await crowd.statusOf(activeId)).to.equal(Status.Active)

    const successId = await createDrop(crowd, sellerA)
    await crowd.connect(buyer1).join(successId)
    await crowd.connect(buyer2).join(successId)
    expect(await crowd.statusOf(successId)).to.equal(Status.Successful)
    await crowd.connect(sellerA).claim(successId)
    expect(await crowd.statusOf(successId)).to.equal(Status.Claimed)

    const expiredId = await createDrop(crowd, sellerA, { duration: HOUR })
    await hre.network.provider.send('evm_increaseTime', [Number(HOUR) + 1])
    await hre.network.provider.send('evm_mine')
    expect(await crowd.statusOf(expiredId)).to.equal(Status.Expired)
    expect(await crowd.statusOf(successId)).to.equal(Status.Claimed)
  })

  it('unknown drop IDs revert', async () => {
    const { crowd, buyer1, sellerA } = await setup()
    expect(await revertedWith(crowd.getDrop(1), 'unknown drop')).to.equal(true)
    expect(await revertedWith(crowd.connect(buyer1).join(99), 'unknown drop')).to.equal(true)
    const dropId = await createDrop(crowd, sellerA)
    expect(await revertedWith(crowd.getDrop(dropId + 1n), 'unknown drop')).to.equal(true)
  })

  it('createDrop does not move tokens', async () => {
    const { token, crowd, sellerA } = await setup()
    const before = await token.balanceOf(await crowd.getAddress())
    await createDrop(crowd, sellerA)
    expect(await token.balanceOf(await crowd.getAddress())).to.equal(before)
  })

  it('withdraw with no deposit reverts', async () => {
    const { crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    expect(await revertedWith(crowd.connect(buyer1).withdraw(dropId), 'no deposit')).to.equal(true)
  })

  it('boundary goal 2 and 1000 and duration 1 hour and 90 days are accepted', async () => {
    const { crowd, sellerA } = await setup()
    const a = await createDrop(crowd, sellerA, { goal: 2n, duration: HOUR })
    const b = await createDrop(crowd, sellerA, { goal: 1000n, duration: NINETY_DAYS })
    expect((await crowd.getDrop(a)).goal).to.equal(2n)
    expect((await crowd.getDrop(b)).goal).to.equal(1000n)
  })

  it('join reverts at exactly the deadline timestamp', async () => {
    const { crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA, { duration: HOUR })
    const deadline = Number((await crowd.getDrop(dropId)).deadline)
    await hre.network.provider.send('evm_setNextBlockTimestamp', [`0x${deadline.toString(16)}`])
    expect(await revertedWith(crowd.connect(buyer1).join(dropId), 'expired')).to.equal(true)
    expect(await crowd.statusOf(dropId)).to.equal(Status.Expired)
  })

  it('withdraw succeeds at exactly the deadline if the drop is not successful', async () => {
    const { token, crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA, { duration: HOUR })
    const before = await token.balanceOf(buyer1.address)
    await crowd.connect(buyer1).join(dropId)
    const deadline = Number((await crowd.getDrop(dropId)).deadline)
    await hre.network.provider.send('evm_setNextBlockTimestamp', [`0x${deadline.toString(16)}`])
    await crowd.connect(buyer1).withdraw(dropId)
    expect(await crowd.depositOf(dropId, buyer1.address)).to.equal(0n)
    expect(await token.balanceOf(buyer1.address)).to.equal(before)
    expect((await crowd.getDrop(dropId)).escrowed).to.equal(0n)
  })

  it('failed transferFrom does not mutate join accounting', async () => {
    const { token, crowd, crowdAddress, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    await token.connect(buyer1).approve(crowdAddress, 0)
    let joinFailed = false
    try {
      await crowd.connect(buyer1).join(dropId)
    }
    catch {
      joinFailed = true
    }
    expect(joinFailed).to.equal(true)
    expect(await crowd.depositOf(dropId, buyer1.address)).to.equal(0n)
    expect((await crowd.getDrop(dropId)).buyerCount).to.equal(0n)
    expect((await crowd.getDrop(dropId)).escrowed).to.equal(0n)
    expect(await token.balanceOf(crowdAddress)).to.equal(0n)
  })

  it('Joined event values match drop state', async () => {
    const { crowd, sellerA, buyer1 } = await setup()
    const dropId = await createDrop(crowd, sellerA)
    const tx = await crowd.connect(buyer1).join(dropId)
    const receipt = await tx.wait()
    const joined = receipt.logs
      .map((log) => {
        try {
          return crowd.interface.parseLog(log)
        }
        catch {
          return null
        }
      })
      .find((item) => item?.name === 'Joined')
    expect(joined.args.dropId).to.equal(dropId)
    expect(joined.args.buyer).to.equal(buyer1.address)
    expect(joined.args.amount).to.equal(CONTRIBUTION)
    const drop = await crowd.getDrop(dropId)
    expect(drop.escrowed).to.equal(joined.args.amount)
    expect(drop.buyerCount).to.equal(1n)
  })

  it('same seller many drops and same buyers across drops keep escrow isolated', async () => {
    const { token, crowd, sellerA, buyer1, buyer2 } = await setup()
    const a = await createDrop(crowd, sellerA, { contribution: CONTRIBUTION, goal: 2n })
    const b = await createDrop(crowd, sellerA, { contribution: CONTRIBUTION * 2n, goal: 2n })
    await crowd.connect(buyer1).join(a)
    await crowd.connect(buyer1).join(b)
    await crowd.connect(buyer2).join(a)
    expect(await crowd.isSuccessful(a)).to.equal(true)
    expect(await crowd.isSuccessful(b)).to.equal(false)
    expect((await crowd.getDrop(a)).escrowed).to.equal(CONTRIBUTION * 2n)
    expect((await crowd.getDrop(b)).escrowed).to.equal(CONTRIBUTION * 2n)
    expect(await crowd.depositOf(a, buyer1.address)).to.equal(CONTRIBUTION)
    expect(await crowd.depositOf(b, buyer1.address)).to.equal(CONTRIBUTION * 2n)
    const accounted = (await crowd.getDrop(a)).escrowed + (await crowd.getDrop(b)).escrowed
    expect(await token.balanceOf(await crowd.getAddress())).to.equal(accounted)
    await crowd.connect(buyer1).withdraw(b)
    expect((await crowd.getDrop(a)).escrowed).to.equal(CONTRIBUTION * 2n)
    expect((await crowd.getDrop(b)).escrowed).to.equal(0n)
    await crowd.connect(sellerA).claim(a)
    expect((await crowd.getDrop(a)).claimed).to.equal(true)
    expect((await crowd.getDrop(b)).claimed).to.equal(false)
    expect(await token.balanceOf(await crowd.getAddress())).to.equal(0n)
  })
})
