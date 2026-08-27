<script setup lang="ts">
import type { FakeDrop } from '../fixtures'
import ParticipantDots from '../ParticipantDots.vue'
import PhoneFrame from '../PhoneFrame.vue'
import { SHOWCASE_WALLET } from '../fixtures'

const props = withDefaults(defineProps<{
  drop: FakeDrop
  mode:
    | 'active-buyer'
    | 'active-buyer-join'
    | 'joined-buyer'
    | 'active-seller'
    | 'successful-seller'
    | 'successful-buyer'
    | 'claimed'
    | 'expired-buyer'
    | 'expired-seller'
  networkLine?: string
  /** Header A includes CrowdDrop wordmark; Header B starts at detail nav. */
  showAppHeader?: boolean
}>(), {
  showAppHeader: true,
})

const wallet = SHOWCASE_WALLET

function tone() {
  if (props.mode.startsWith('successful') || props.mode === 'claimed')
    return 'success' as const
  if (props.mode.startsWith('expired'))
    return 'expired' as const
  return 'orange' as const
}

function statusText() {
  if (props.drop.status === 'Active')
    return 'Active'
  return props.drop.status
}

function statusClass() {
  if (props.drop.status === 'Successful' || props.drop.status === 'Claimed')
    return 'st-success'
  if (props.drop.status === 'Expired')
    return 'st-expired'
  return 'st-active'
}
</script>

<template>
  <PhoneFrame
    :show-app-header="showAppHeader"
    :network-line="networkLine || `${wallet.network} · ${wallet.addressShort}`"
  >
    <div class="nav">
      <button type="button" class="back-title">
        <span class="chev">←</span>
        <span>Drop #{{ drop.id }}</span>
      </button>
      <span class="status" :class="statusClass()">{{ statusText() }}</span>
    </div>

    <h1 class="amount">
      <span class="num">${{ drop.contributionUsdt }}</span>
      <span class="per">USDT per person</span>
    </h1>

    <ParticipantDots :joined="drop.joined" :goal="drop.goal" :tone="tone()" />

    <div class="facts">
      <template v-if="drop.status === 'Active'">
        <p class="progress">{{ drop.joined }} of {{ drop.goal }} joined · {{ drop.spotsLeft }} spots left</p>
        <p class="meta-line">{{ drop.remaining }} remaining</p>
        <p class="pooled">${{ drop.pooledUsdt }} pooled</p>
      </template>
      <template v-else>
        <p class="progress">{{ drop.joined }} of {{ drop.goal }} joined</p>
        <p class="pooled">${{ drop.pooledUsdt }} pooled</p>
      </template>
    </div>

    <p v-if="mode === 'active-buyer' || mode === 'active-buyer-join'" class="trust">
      Funds stay in the contract until the Drop succeeds or expires.
    </p>

    <p class="seller">Created by {{ drop.sellerShort }}</p>

    <div class="rule" />

    <template v-if="mode === 'active-buyer'">
      <button type="button" class="primary">Enable CrowdDrop</button>
      <p class="help">One-time approval, reusable across future Drops up to 100 USDT.</p>
    </template>

    <template v-else-if="mode === 'active-buyer-join'">
      <button type="button" class="primary">Join for {{ drop.contributionUsdt }} USDT</button>
    </template>

    <template v-else-if="mode === 'joined-buyer'">
      <div class="personal">
        <p class="personal-title">You’re in this Drop</p>
        <p class="personal-copy">Your {{ drop.contributionUsdt }} USDT is pooled and waiting on the rest.</p>
      </div>
      <button type="button" class="ghost">Withdraw {{ drop.contributionUsdt }} USDT</button>
    </template>

    <template v-else-if="mode === 'active-seller'">
      <p class="note">You created this Drop.</p>
      <p class="note">Waiting for {{ drop.spotsLeft }} more buyers.</p>
      <button type="button" class="share">
        <span class="share-icon" aria-hidden="true">↗</span>
        Share Drop
      </button>
    </template>

    <template v-else-if="mode === 'successful-seller'">
      <p class="note">The goal was reached. You can claim the pooled funds.</p>
      <button type="button" class="primary success">Claim {{ drop.pooledUsdt }} USDT</button>
    </template>

    <template v-else-if="mode === 'successful-buyer'">
      <p class="note">You joined this Drop. The seller can now claim the pooled funds.</p>
    </template>

    <template v-else-if="mode === 'claimed'">
      <p class="note">The seller has claimed the pooled funds.</p>
      <button type="button" class="text-action">Back to Home</button>
    </template>

    <template v-else-if="mode === 'expired-buyer'">
      <p class="note">This Drop did not reach its goal.</p>
      <button type="button" class="primary">Withdraw {{ drop.contributionUsdt }} USDT</button>
      <p class="help">Your contribution is available to withdraw.</p>
    </template>

    <template v-else-if="mode === 'expired-seller'">
      <p class="note">This Drop did not reach its goal.</p>
    </template>
  </PhoneFrame>
</template>

<style scoped>
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 16px;
  min-height: 36px;
}
.back-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: #141414;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 0;
  cursor: pointer;
  min-height: 36px;
}
.chev {
  font-weight: 500;
  line-height: 1;
}
.status {
  font-size: 13px;
  font-weight: 600;
  flex: 0 0 auto;
}
.st-active { color: #C94E12; }
.st-success { color: #1F7A45; }
.st-expired { color: #B07A2E; }

.amount {
  margin: 0 0 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.num {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
}
.per {
  font-size: 13px;
  color: #6A6A6A;
  font-weight: 500;
}

.facts {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.progress,
.meta-line,
.pooled,
.trust,
.seller,
.note,
.help {
  margin: 0;
  font-size: 13px;
  color: #6A6A6A;
  line-height: 1.4;
}
.progress {
  color: #141414;
  font-weight: 500;
}
.pooled {
  color: #141414;
  font-weight: 500;
}
.trust {
  margin-top: 12px;
  font-size: 12px;
}
.seller {
  margin-top: 10px;
  font-size: 12px;
}
.rule {
  height: 1px;
  background: #E2E2DE;
  margin: 14px 0;
}

.personal {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #F3EBE4;
  border-left: 2px solid #C94E12;
  border-radius: 0 8px 8px 0;
}
.personal-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 650;
  color: #141414;
}
.personal-copy {
  margin: 0;
  font-size: 13px;
  color: #6A6A6A;
  line-height: 1.4;
}

.note { margin-bottom: 8px; }
.help {
  margin-top: 8px;
  font-size: 12px;
  text-align: center;
}

.primary,
.ghost {
  width: 100%;
  min-height: 44px;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 12px;
}
.primary {
  border: 1px solid #C94E12;
  background: #C94E12;
  color: #fff;
}
.primary.success {
  border-color: #1F7A45;
  background: #1F7A45;
}
.ghost {
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
  font-weight: 500;
}

.share {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  padding: 8px 12px;
  min-height: 36px;
  border-radius: 8px;
  cursor: pointer;
  width: auto;
}
.share-icon {
  font-size: 13px;
  line-height: 1;
  color: #6A6A6A;
}

.text-action {
  display: inline-block;
  margin-top: 4px;
  border: none;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 0;
  min-height: 32px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
